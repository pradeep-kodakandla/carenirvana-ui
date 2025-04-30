import { Component, ViewChild, ElementRef } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { AuthActivity } from 'src/app/member/UM/umauthactivity/auth-activity.model.service';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { CrudService } from 'src/app/service/crud.service';
import { Validators } from '@angular/forms';
import { AuthenticateService } from 'src/app/service/authentication.service';

@Component({
  selector: 'app-umauthactivity',
  templateUrl: './umauthactivity.component.html',
  styleUrls: ['./umauthactivity.component.css'],
  animations: [
    trigger('collapseExpand', [
      state('collapsed', style({ height: '0px', opacity: 0, overflow: 'hidden' })),
      state('expanded', style({ height: '*', opacity: 1, overflow: 'hidden' })),
      transition('collapsed <=> expanded', [animate('300ms ease-in-out')]),
    ])
  ]
})


export class UmauthactivityComponent {
  activityForm: FormGroup;
  activities: AuthActivity[] = [];
  filteredActivities: AuthActivity[] = [];
  editingIndex: number | null = null;
  isEditing = false;
  searchTerm = '';
  sortBy = '';
  showSort = false;
  collapsedIndexes: number[] = [];
  selectedIndex: number | null = null;
  activityTypes: { value: string, label: string }[] = [{ value: '', label: 'Select' }];
  highlightedIndex: number = -1;
  activityTypeDisplay: string = '';
  filteredActivityTypes: { value: string, label: string }[] = [];
  workBasketUserDisplay: string = '';
  scheduledDateText: string = '';
  dueDateText: string = '';
  assignToDisplay: string = '';
  filteredUsers: { value: string; label: string }[] = [];

  showDropdowns: { [key: string]: boolean } = {
    activityType: false,
    priority: false,
    workBasket: false,
    assignTo: false,
    workBasketUser: false
  };

  constructor(private fb: FormBuilder, private crudService: CrudService, private authenticateService: AuthenticateService) {
    this.activityForm = this.fb.group({
      memberName: ['John Doer'],
      activityType: ['', Validators.required],
      priority: ['', Validators.required],
      assignTo: [sessionStorage.getItem('loggedInUsername') || '', Validators.required],
      workBasket: [''],
      scheduledDateTime: [new Date(), Validators.required],
      dueDateTime: [''],
      comments: ['', Validators.required],
      workBasketUser: [''],
    });
  }

  ngOnInit() {
    this.filteredActivities = this.activities;
    this.priorityDisplay = 'Select';
    this.workBasketDisplay = 'Select';

    this.loadActivityTypes();
    this.loadUsers();
    this.activityForm.get('workBasket')?.valueChanges.subscribe(val => {
      if (!val) {
        this.activityForm.get('workBasketUser')?.reset();
        this.workBasketUserDisplay = '';
      }
    });

  }

  loadActivityTypes() {
    this.crudService.getData('um', 'activitytype').subscribe((data: any[]) => {
      const options = data.map(item => ({
        value: item.code || item.value || item.id,
        label: item.label || item.activityType || item.display
      }));

      this.activityTypes = [{ value: '', label: 'Select' }, ...options];
      this.filteredActivityTypes = [...this.activityTypes];

      // If form has value, sync label to display
      const selected = this.activityTypes.find(a => a.value === this.activityForm.get('activityType')?.value);
      this.activityTypeDisplay = selected?.label || 'Select';
    });
  }

  loadUsers() {
    this.authenticateService.getAllUsers().subscribe({
      next: (users: any[]) => {
        this.filteredUsers = users.map(u => ({
          value: u.UserName,
          label: u.UserName
        }));
        const loggedIn = sessionStorage.getItem('loggedInUsername');
        this.assignToDisplay = loggedIn || 'Select';

      }

    });
  }


  applySearch() {
    const term = this.searchTerm.toLowerCase();
    this.filteredActivities = this.activities.filter(a =>
      a.activityType?.toLowerCase().includes(term) ||
      a.assignTo?.toLowerCase().includes(term) ||
      a.comments?.toLowerCase().includes(term)
    );
  }

  applySort(option: string) {
    this.sortBy = option;
    this.sortActivities();
  }

  sortActivities() {
    if (!this.sortBy) return;
    const [field, direction] = this.sortBy.split('_');
    const dir = direction === 'desc' ? -1 : 1;
    this.filteredActivities.sort((a, b) => {
      const aVal = this.getSortableValue(a, field);
      const bVal = this.getSortableValue(b, field);
      return aVal.localeCompare(bVal) * dir;
    });
  }

  getSortableValue(activity: AuthActivity, field: string): string {
    switch (field) {
      case 'activityType': return activity.activityType || '';
      case 'priority': return activity.priority || '';
      case 'status': return activity.status || '';
      case 'assignTo': return activity.assignTo || '';
      default: return '';
    }
  }

  onSubmit() {

    if (this.activityForm.invalid) {
      this.activityForm.markAllAsTouched();
      return;
    }

    const newActivity: AuthActivity = {
      ...this.activityForm.value,
      status: this.editingIndex !== null ? this.activities[this.editingIndex].status : 'Pending',
      completedDate: this.editingIndex !== null ? this.activities[this.editingIndex].completedDate : 'N/A',
      createdDatetime: new Date().toLocaleString(),
      createdBy: 'Test User',
    };

    if (this.editingIndex !== null) {
      this.activities[this.editingIndex] = newActivity;
    } else {
      this.activities.push(newActivity);
    }

    this.onReset();
    this.applySearch();
    this.sortActivities();
  }

  onReset() {
    this.activityForm.reset({
      memberName: 'John Doer',
      activityType: '',
      priority: '',
      assignTo: sessionStorage.getItem('loggedInUsername') || '',
      workBasket: '',
      scheduledDateTime: new Date(),
      dueDateTime: '',
      comments: ''
    });
    this.activityTypeDisplay = '';
    this.editingIndex = null;
    this.activityTypeDisplay = 'Select';
    this.priorityDisplay = 'Select';
    this.workBasketDisplay = 'Select';
    this.scheduledDateText = '';
    this.dueDateText = '';
    this.assignToDisplay = sessionStorage.getItem('loggedInUsername') || 'Select';
  }



  editActivity(index: number) {
    const activity = this.activities[index];
    this.activityForm.patchValue(activity);

    const selected = this.activityTypes.find(opt => opt.value === activity.activityType);
    this.activityTypeDisplay = selected?.label || '';
    this.assignToDisplay = activity.assignTo || 'Select';

    // ✅ Add these lines
    this.scheduledDateText = this.formatForDisplay(new Date(activity.scheduledDateTime));
    this.dueDateText = this.formatForDisplay(new Date(activity.dueDateTime));

    this.editingIndex = index;
  }



  deleteActivity(index: number) {
    this.activities.splice(index, 1);
    this.onReset();
    this.applySearch();
    this.sortActivities();
  }

  toggleCollapse(index: number) {
    if (this.collapsedIndexes.includes(index)) {
      this.collapsedIndexes = this.collapsedIndexes.filter(i => i !== index);
    } else {
      this.collapsedIndexes.push(index);
    }
  }

  dropActivity(event: CdkDragDrop<any[]>) {
    moveItemInArray(this.activities, event.previousIndex, event.currentIndex);
  }

  getPriorityClass(priority: string | null | undefined): string {
    switch ((priority || '').toLowerCase()) {
      case 'high': return 'priority-high';
      case 'low': return 'priority-low';
      default: return 'priority-default';
    }
  }

  onAddNewActivity() {
    this.selectedIndex = null;
    this.isEditing = true;
    this.onReset();
  }

  selectActivity(index: number) {
    this.editActivity(index);
    this.selectedIndex = index;
    this.isEditing = true;
  }

  onCancel() {
    this.selectedIndex = null;
    this.isEditing = false;
  }

  getCompletedCount(): number {
    return this.activities.filter(a => a.status === 'Completed').length;
  }

  getPendingCount(): number {
    return this.activities.filter(a => a.status !== 'Completed').length;
  }

  getPriorityCount(priority: string): number {
    return this.activities.filter(a => (a.priority || '').toLowerCase() === priority.toLowerCase()).length;
  }

  /******Select field******/


  onTypeaheadInput(event: Event): void {
    const input = (event.target as HTMLInputElement).value;
    this.activityTypeDisplay = input;
    this.filterDropdown('activityType');
  }

  filterDropdown(field: 'activityType'): void {
    const search = this.activityTypeDisplay?.toLowerCase() || '';
    this.filteredActivityTypes = this.activityTypes.filter(opt =>
      opt.label.toLowerCase().includes(search)
    );
  }

  selectDropdownOption(field: string, option: { value: string, label: string }) {
    this.activityForm.get(field)?.setValue(option.value);

    if (field === 'activityType') this.activityTypeDisplay = option.label;
    else if (field === 'priority') this.priorityDisplay = option.label;
    else if (field === 'workBasket') this.workBasketDisplay = option.label;
    else if (field === 'assignTo') this.assignToDisplay = option.label;
    else if (field === 'workBasketUser') this.workBasketUserDisplay = option.label;

    this.showDropdowns[field] = false;
    this.highlightedIndex = -1;
  }


  openDropdown(field: string): void {
    this.showDropdowns[field] = true;
    this.activeDropdown = field;

    if (field === 'priority') this.filteredPriorities = [
      { value: '', label: 'Select' },
      { value: 'High', label: 'High' },
      { value: 'Low', label: 'Low' }
    ];
    if (field === 'workBasket') this.filteredWorkBaskets = [
      { value: '', label: 'Select' },
      { value: 'UM Reviewers', label: 'UM Reviewers' },
      { value: 'No', label: 'Work Basket 1' }
    ];
    if (field === 'workBasketUser') {
      this.filteredUsers = [...this.filteredUsers];
    }

  }

  //closeDropdown(field: string): void {
  //  setTimeout(() => this.showDropdowns[field] = false, 200);
  //}
  closeDropdown(field: string): void {
    this.showDropdowns[field] = false;
  }



  handleDropdownKeydown(event: KeyboardEvent, field: string) {
    const list = field === 'activityType' ? this.filteredActivityTypes :
      field === 'priority' ? this.filteredPriorities :
        field === 'workBasket' ? this.filteredWorkBaskets : [];

    if (!list.length) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.highlightedIndex = (this.highlightedIndex + 1) % list.length;
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.highlightedIndex = (this.highlightedIndex - 1 + list.length) % list.length;
        break;
      case 'Enter':
        if (this.highlightedIndex >= 0 && this.highlightedIndex < list.length) {
          this.selectDropdownOption(field, list[this.highlightedIndex]);
          this.highlightedIndex = -1;
          event.preventDefault();
        }
        break;
      case 'Escape':
        this.showDropdowns[field] = false;
        this.highlightedIndex = -1;
        break;
    }
  }


  priorityDisplay: string = '';
  workBasketDisplay: string = '';
  /*filteredActivityTypes: { value: string, label: string }[] = [{ value: '', label: 'Select' }];*/
  filteredPriorities: { value: string, label: string }[] = [
    { value: '', label: 'Select' },
    { value: 'High', label: 'High' },
    { value: 'Low', label: 'Low' }
  ];
  filteredWorkBaskets: { value: string, label: string }[] = [
    { value: '', label: 'Select' },
    { value: 'UM Reviewers', label: 'UM Reviewers' },
    { value: 'No', label: 'Work Basket 1' }
  ];

  activeDropdown: string = '';

  onDropdownTextChange(event: Event, field: string): void {
    const input = (event.target as HTMLInputElement).value;
    if (field === 'priority') {
      this.priorityDisplay = input;
      this.filteredPriorities = this.filteredPriorities.filter(opt =>
        opt.label.toLowerCase().includes(input.toLowerCase())
      );
    } else if (field === 'workBasket') {
      this.workBasketDisplay = input;
      this.filteredWorkBaskets = this.filteredWorkBaskets.filter(opt =>
        opt.label.toLowerCase().includes(input.toLowerCase())
      );
    }
    else if (field === 'assignTo') {
      this.assignToDisplay = input;
      this.filteredUsers = this.filteredUsers.filter(opt =>
        opt.label.toLowerCase().includes(input.toLowerCase())
      );
    }
    else if (field === 'workBasketUser') {
      this.workBasketUserDisplay = input;
      this.filteredUsers = this.filteredUsers.filter(opt =>
        opt.label.toLowerCase().includes(input.toLowerCase())
      );
    }
  }

  getActivityTypeLabel(code: string): string {
    const match = this.activityTypes.find(type => type.value === code);
    return match?.label || code;
  }

  markAsCompleted(index: number) {
    const activity = this.activities[index];
    if (activity.status !== 'Completed') {
      activity.status = 'Completed';
      activity.completedDate = new Date().toLocaleString();
      this.applySearch(); // reapply filter
      this.sortActivities(); // if sorted
    }
  }



  /******Select field******/

  /******Date time field******/
  @ViewChild('scheduledPicker') scheduledPicker!: ElementRef<HTMLInputElement>;
  @ViewChild('duePicker') duePicker!: ElementRef<HTMLInputElement>;



  handleDateTimeBlur(inputModel: string, controlName: string): void {
    let input = (this as any)[inputModel]?.trim().toUpperCase();
    let base = new Date();
    let finalDate: Date | null = null;

    if (input === 'D') {
      finalDate = base;
    } else if (/^D\+(\d+)$/.test(input)) {
      const daysToAdd = +input.match(/^D\+(\d+)$/)![1];
      base.setDate(base.getDate() + daysToAdd);
      finalDate = base;
    } else if (/^D-(\d+)$/.test(input)) {
      const daysToSubtract = +input.match(/^D-(\d+)$/)![1];
      base.setDate(base.getDate() - daysToSubtract);
      finalDate = base;
    } else {
      const parsed = new Date(input);
      if (!isNaN(parsed.getTime())) {
        finalDate = parsed;
      }
    }

    if (finalDate) {
      const control = this.activityForm.get(controlName);
      control?.setValue(finalDate);
      control?.markAsTouched();

      // update correct display field
      if (controlName === 'scheduledDateTime') {
        this.scheduledDateText = this.formatForDisplay(finalDate);
      } else if (controlName === 'dueDateTime') {
        this.dueDateText = this.formatForDisplay(finalDate);
      }
    }
  }


  formatForDisplay(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date).replace(',', '');
  }


  handleCalendarChange(event: Event, controlName: string): void {
    const value = (event.target as HTMLInputElement).value;
    //if (value) {
    //  const date = new Date(value);
    //  this.activityForm.get(controlName)?.setValue(date);
    //  this.scheduledDateText = this.formatForDisplay(date);
    //}
    if (value) {
      const date = new Date(value);
      if (controlName === 'scheduledDateTime') {
        this.activityForm.get(controlName)?.setValue(date);
        this.scheduledDateText = this.formatForDisplay(date);
      } else if (controlName === 'dueDateTime') {
        this.dueDateText = this.formatForDisplay(date);
      }
    }
  }


  triggerCalendar(pickerType: 'scheduled' | 'due'): void {
    const picker = pickerType === 'scheduled' ? this.scheduledPicker?.nativeElement : this.duePicker?.nativeElement;
    picker?.showPicker?.();
  }

  onScheduledTextChange(event: Event) {
    const input = (event.target as HTMLInputElement).value;
    this.scheduledDateText = input;
  }

  onDueTextChange(event: Event) {
    const input = (event.target as HTMLInputElement).value;
    this.dueDateText = input;
  }

  formatDateEST(date: Date | string): string {
    if (!date) return '';
    const parsedDate = new Date(date);
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(parsedDate).replace(',', '');
  }

  /******Date time field******/
}
