import { Component, ViewChild, ElementRef, Input, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { AuthActivity } from 'src/app/member/UM/umauthactivity/auth-activity.model.service';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { CrudService } from 'src/app/service/crud.service';
import { Validators } from '@angular/forms';
import { AuthenticateService } from 'src/app/service/authentication.service';
import { AuthService } from 'src/app/service/auth.service';

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
  @Input() authDetailId: number | null = null;


  showDropdowns: { [key: string]: boolean } = {
    activityType: false,
    priority: false,
    workBasket: false,
    assignTo: false,
    workBasketUser: false
  };

  constructor(private fb: FormBuilder, private crudService: CrudService, private authenticateService: AuthenticateService, private activityService: AuthService) {
    this.activityForm = this.fb.group({
      memberName: ['John Doer'],
      activityType: ['', Validators.required],
      priority: ['', Validators.required],
      assignTo: [sessionStorage.getItem('loggedInUsername') || '', Validators.required],
      workBasket: [''],
      scheduledDateTime: ['', Validators.required],
      dueDateTime: ['', Validators.required],
      comments: ['', Validators.required],
      workBasketUser: [''],
    });
  }

  ngOnInit() {
    this.filteredActivities = this.activities;
    this.priorityDisplay = 'Select';
    this.workBasketDisplay = 'Select';
    console.log('Received authDetailId:', this.authDetailId);

    this.loadActivityTypes();
    this.loadUsers();
    this.activityForm.get('workBasket')?.valueChanges.subscribe(val => {
      if (!val) {
        this.activityForm.get('workBasketUser')?.reset();
        this.workBasketUserDisplay = '';
      }
    });

  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['authDetailId']) {
      const newId = changes['authDetailId'].currentValue;
      if (newId != null) {
        console.log('Received authDetailId in ngOnChanges:', newId);
        this.loadActivitiesForAuth(newId);
      }
    }
    this.filteredPriorities = [
      { value: '', label: 'Select' },
      { value: '1', label: 'High' },
      { value: '2', label: 'Medium' },
      { value: '3', label: 'Low' }
    ];
  }

  loadActivitiesForAuth(authDetailId: number): void {
    console.log('Now loading activities for authDetailId:', authDetailId);

    this.activityService.getAllActivities(authDetailId).subscribe({
      next: (data: any[]) => {
        console.log('Received activities:', data);
        this.activities = (data || []).map(activity => ({
          authActivityId: activity.AuthActivityId,
          authDetailId: activity.AuthDetailId,
          activityTypeId: activity.ActivityTypeId,
          priorityId: activity.PriorityId,
          providerId: activity.ProviderId,
          scheduledDateTime: activity.FollowUpDateTime,
          dueDate: activity.DueDate,
          dueDateTime: activity.DueDate,
          referredTo: activity.ReferredTo,
          isWorkBasket: activity.IsWorkBasket,
          queueId: activity.QueueId,
          comment: activity.Comment,
          statusId: activity.StatusId,
          performedDateTime: activity.PerformedDateTime,
          performedBy: activity.PerformedBy,
          activeFlag: activity.ActiveFlag,
          createdOn: activity.CreatedOn,
          createdBy: activity.CreatedBy,
          updatedOn: activity.UpdatedOn,
          updatedBy: activity.UpdatedBy,
          deletedOn: activity.DeletedOn,
          deletedBy: activity.DeletedBy,


        }));
        this.updateActivityLabels();
        this.filteredActivities = [...this.activities];
        console.log('Loaded activities:', this.activities);
      },
      error: (err) => {
        console.error('Failed to load activities', err);
      }
    });
  }

  updateActivityLabels(): void {
    this.activities.forEach(activity => {
      activity.activityTypeLabel = this.getActivityTypeLabel(activity.activityTypeId?.toString());
      activity.priorityLabel = this.getPriorityLabel(activity.priorityId?.toString());
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
      this.updateActivityLabels();

      // If form has value, sync label to display
      const selected = this.activityTypes.find(a => a.value === this.activityForm.get('activityType')?.value);
      this.activityTypeDisplay = selected?.label || 'Select';
    });
  }

  loadUsers() {
    this.authenticateService.getAllUsers().subscribe({
      next: (users: any[]) => {
        console.log('Loaded users:', users);
        this.filteredUsers = users.map(u => ({
          value: u.UserId,
          label: u.UserName
        }));

        const loggedInUsername = sessionStorage.getItem('loggedInUsername');
        const loggedInUser = this.filteredUsers.find(u => u.label === loggedInUsername);

        if (loggedInUser) {
          // Set the actual UserId in the FormControl value!
          this.activityForm.get('assignTo')?.setValue(loggedInUser.value);
          this.assignToDisplay = loggedInUsername || 'Select';
        } else {
          this.activityForm.get('assignTo')?.setValue('');
          this.assignToDisplay = 'Select';
        }
      }
    });
  }



  applySearch() {
    const term = this.searchTerm.toLowerCase();
    this.filteredActivities = this.activities.filter(a =>
      this.getActivityTypeLabel(a.activityTypeId?.toString()).toLowerCase().includes(term) ||
      this.getProviderName(a.referredTo).toLowerCase().includes(term) ||
      (a.comment?.toLowerCase().includes(term) ?? false)
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
      case 'activityType': return this.getActivityTypeLabel(activity.activityTypeId?.toString() || '');
      case 'priority': return this.getPriorityLabel(activity.priorityId?.toString() || '');
      case 'status': return this.getStatusLabel(activity.statusId);
      case 'assignTo': return this.getProviderName(activity.referredTo);
      default: return '';
    }
  }

  onSubmit() {
    if (this.activityForm.invalid) {
      this.activityForm.markAllAsTouched();
      return;
    }
    console.log('Form submitted:', this.activityForm.value);

    if (this.activityForm.value.assignTo === sessionStorage.getItem('loggedInUsername')) {
      const selectedAssignToName = this.activityForm.value.assignTo;
      const selectedUser = this.filteredUsers.find(u => u.label === selectedAssignToName);
      this.activityForm.value.assignTo = (selectedUser ? selectedUser.value : null);
    }

    //console.log('AssignTo UserId:', assignToUserId);
    const loggedInUser = this.filteredUsers.find(u => u.label === sessionStorage.getItem('loggedInUsername'));
    const loggedInUserId = loggedInUser ? loggedInUser.value : null;
    console.log('LoggedIn UserId:', loggedInUserId);
    console.log('Assiged To:', this.activityForm.value.assignTo);
    const newActivity: any = {
      authDetailId: this.authDetailId,
      activityTypeId: Number(this.activityForm.value.activityType) || null,
      priorityId: Number(this.activityForm.value.priority) || null,
      providerId: null,
      followUpDateTime: this.activityForm.value.scheduledDateTime || null,
      dueDate: this.activityForm.value.dueDateTime || null,
      comment: this.activityForm.value.comments || null,
      statusId: 1,
      activeFlag: true,
      CreatedBy: Number(loggedInUserId),
      CreatedOn: new Date(),
      ReferredTo: Number(this.activityForm.value.assignTo) || null
    };

    console.log('Submitting activity:', newActivity);
    if (this.editingIndex !== null && this.activities[this.editingIndex]?.authActivityId) {
      // Update existing
      const activityId = this.activities[this.editingIndex].authActivityId;
      if (activityId != null) {
        const updatedActivity = {
          ...newActivity,
          authDetailId: this.authDetailId,
          authActivityId: activityId,
        };
        this.activityService.updateActivity(activityId, updatedActivity).subscribe({
          next: () => {
            console.log('Activity updated successfully');
            this.loadActivitiesForAuth(this.authDetailId!);
            this.onReset();
            this.isEditing = false;
          },
          error: (err) => {
            console.error('Update failed', err);
          }
        });
      }
    } else {
      // Insert new
      this.activityService.createActivity(newActivity).subscribe({
        next: () => {
          console.log('Activity created successfully');
          this.loadActivitiesForAuth(this.authDetailId!);
          this.onReset();
          this.isEditing = false;
        },
        error: (err) => {
          console.error('Create failed', err);
        }
      });
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
      scheduledDateTime: '',
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

    this.activityForm.patchValue({
      memberName: 'John Doer',
      activityType: activity.activityTypeId?.toString() || '',
      priority: activity.priorityId?.toString() || '',
      assignTo: this.getProviderName(activity.referredTo) || '',
      workBasket: '',
      scheduledDateTime: activity.scheduledDateTime ? new Date(activity.scheduledDateTime) : '',
      dueDateTime: activity.dueDateTime ? new Date(activity.dueDateTime) : '',
      comments: activity.comment || '',
      workBasketUser: ''
    });

    // Set display fields (Dropdown text)
    const selectedActivityType = this.activityTypes.find(opt => opt.value === activity.activityTypeId?.toString());
    this.activityTypeDisplay = selectedActivityType?.label || '';

    const selectedAssignTo = this.filteredUsers.find(opt => opt.value == activity.referredTo?.toString());
    this.assignToDisplay = selectedAssignTo?.label || 'Select';

    const selectedPriority = this.filteredPriorities.find(opt => opt.value === activity.priorityId?.toString());
    this.priorityDisplay = selectedPriority?.label || '';

    // Set date text for Scheduled and Due
    if (activity.scheduledDateTime) {
      this.scheduledDateText = this.formatForDisplay(new Date(activity.scheduledDateTime));
    } else {
      this.scheduledDateText = '';
    }

    if (activity.dueDateTime) {
      this.dueDateText = this.formatForDisplay(new Date(activity.dueDateTime));
    } else {
      this.dueDateText = '';
    }

    this.editingIndex = index;
  }



  //deleteActivity(index: number) {
  //  this.activities.splice(index, 1);

  //}

  deleteActivity(index: number) {
    const activity = this.activities[index];
    const loggedInUser = this.filteredUsers.find(u => u.label === sessionStorage.getItem('loggedInUsername'));
    const loggedInUserId = loggedInUser ? loggedInUser.value : null;
    if (activity?.authActivityId) {
      if (confirm('Are you sure you want to delete this activity?')) {
        this.activityService.updateActivity(activity.authActivityId, {
          ...activity,
          authDetailId: this.authDetailId,
          authActivityId: activity.authActivityId,
          activeFlag: false,
          deletedOn: new Date(),
          deletedBy: loggedInUserId
        }).subscribe({
          next: () => {
            console.log('Activity deleted successfully (soft delete)');
            this.loadActivitiesForAuth(this.authDetailId!);
          },
          error: (err) => {
            console.error('Delete failed', err);
          }
        });
      }
    }
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

  getPriorityClass(priorityId: number | null | undefined): string {
    if (!priorityId) return 'priority-default'; // no priority
    if (priorityId === 1) return 'priority-high';
    if (priorityId === 2) return 'priority-medium';
    if (priorityId === 3) return 'priority-low';
    return 'priority-default';
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
    return this.activities.filter(a => a.statusId === 2).length;
  }

  getPendingCount(): number {
    return this.activities.filter(a => a.statusId !== 2).length;
  }

  getPriorityCount(priority: string): number {
    return this.activities.filter(a =>
      this.getPriorityLabel(a.priorityId?.toString() || '').toLowerCase() === priority.toLowerCase()
    ).length;
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

    const displayMap: any = {
      activityType: 'activityTypeDisplay',
      priority: 'priorityDisplay',
      workBasket: 'workBasketDisplay',
      assignTo: 'assignToDisplay',
      workBasketUser: 'workBasketUserDisplay'
    };

    if (displayMap[field]) {
      (this as any)[displayMap[field]] = option.label;
    }

    this.showDropdowns[field] = false;
    this.highlightedIndex = -1;
  }



  openDropdown(field: string): void {
    this.showDropdowns[field] = true;
    this.activeDropdown = field;

    if (field === 'priority') this.filteredPriorities = [
      { value: '', label: 'Select' },
      { value: '1', label: 'High' },
      { value: '2', label: 'Medium' },
      { value: '3', label: 'Low' }
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
        this.scrollHighlightedIntoView(field);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.highlightedIndex = (this.highlightedIndex - 1 + list.length) % list.length;
        this.scrollHighlightedIntoView(field);
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

  scrollHighlightedIntoView(field: string) {
    setTimeout(() => {
      const container = document.querySelector(`.autocomplete-dropdown`);
      if (!container) return;
      const options = container.querySelectorAll('.autocomplete-option');
      if (this.highlightedIndex >= 0 && this.highlightedIndex < options.length) {
        const selected = options[this.highlightedIndex] as HTMLElement;
        selected.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 50);
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


  markAsCompleted(index: number) {
    const activity = this.activities[index];
    if (activity.statusId !== 2) {  // 2 = Completed
      activity.statusId = 2;
      // Optional if you want to store completedDate manually:
      // activity.completedDate = new Date().toISOString();
      this.applySearch();
      this.sortActivities();
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
    if (value) {
      const date = new Date(value);
      const control = this.activityForm.get(controlName);
      control?.setValue(date);
      control?.markAsTouched();

      if (controlName === 'scheduledDateTime') {
        this.scheduledDateText = this.formatForDisplay(date);
      } else if (controlName === 'dueDateTime') {
        this.dueDateText = this.formatForDisplay(date);
      }
    } else {
      // If calendar input cleared, reset control too
      const control = this.activityForm.get(controlName);
      control?.setValue('');
      control?.markAsTouched();

      if (controlName === 'scheduledDateTime') {
        this.scheduledDateText = '';
      } else if (controlName === 'dueDateTime') {
        this.dueDateText = '';
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

  formatDateEST(date?: string): string {
    if (!date) return '';  // <-- this fixes undefined input
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) return ''; // invalid date check

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


  getActivityTypeLabel(code: string | undefined): string {
    if (!code) return 'Unknown Activity';

    const match = this.activityTypes.find(type => type.value === code);

    return match?.label || code;
  }

  getPriorityLabel(code: string | undefined): string {
    if (!code) return 'No Priority';

    // 🛡️ Safe type conversion if your priorities list stores string codes
    const match = this.filteredPriorities.find(p => p.value.toString() === code);

    return match?.label || code;
  }


  getProviderName(providerId: number | null | undefined): string {
    if (!providerId) return 'No Assignee';
    const user = this.filteredUsers.find(u => u.value == String(providerId));
    return user?.label || 'No Assignee';
  }

  getStatusLabel(statusId: number | undefined): string {
    if (statusId === 2) return 'Completed';
    if (statusId === 1) return 'Pending';
    return 'Unknown';
  }


}
