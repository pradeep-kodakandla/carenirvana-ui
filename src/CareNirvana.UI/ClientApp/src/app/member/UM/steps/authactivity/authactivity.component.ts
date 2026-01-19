import { Component, ViewChild, ElementRef, Input, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { AuthActivity } from 'src/app/member/UM/steps/authactivity/auth-activity.model.service';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { CrudService } from 'src/app/service/crud.service';
import { Validators } from '@angular/forms';
import { AuthenticateService } from 'src/app/service/authentication.service';
import { AuthService } from 'src/app/service/auth.service';
import { WorkbasketService } from 'src/app/service/workbasket.service';
import { UiOption } from 'src/app/shared/ui/shared/uioption.model';
import { WizardToastService } from 'src/app/member/UM/components/authwizardshell/wizard-toast.service';

type DropdownKind = 'workGroup' | 'workBasket' | 'workBasketUser' | 'activityType' | 'priority' | 'assignTo';
interface Option {
  value: Number;   // <-- always string (IDs converted via String(...))
  label: string;
}

@Component({
  selector: 'app-authactivity',
  templateUrl: './authactivity.component.html',
  styleUrls: ['./authactivity.component.css'],
  animations: [
    trigger('collapseExpand', [
      state('collapsed', style({ height: '0px', opacity: 0, overflow: 'hidden' })),
      state('expanded', style({ height: '*', opacity: 1, overflow: 'hidden' })),
      transition('collapsed <=> expanded', [animate('300ms ease-in-out')]),
    ])
  ]
})

export class AuthactivityComponent {
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

  activityTypeDisplay: string = '';

  scheduledDateText: string = '';
  dueDateText: string = '';
  assignToDisplay: string = '';

  @Input()
  authDetailId: number | null = null;

  private lastLoadedAuthDetailId: number | null = null;
  canAdd = true;
  canEdit = true;
  canView = true;


  // Context used by CrudService (requested setContext for auth screen)
  readonly moduleContext: string = 'auth';

  workBasketDisplay = '';
  workBasketUserDisplay = 'Select';

  workGroupDisplay = 'Select';

  // lookup option lists
  workBaskets: Option[] = [];



  workGroups: { value: Number; label: string }[] = [
    { value: 0, label: 'Select' }
  ];

  workBasketUsers: Option[] = [];


  // track which dropdown is open (you already use this pattern)
  activeDropdown: DropdownKind | null = null;
  showDropdowns1: Record<string, boolean> = { workBasket: false, workBasketUser: false };


  activityTypeOptions: UiOption<number>[] = [];   // id/label
  priorityOptions: UiOption<number>[] = [];
  assignToOptions: UiOption<number>[] = [];

  workGroupOptions: UiOption<number>[] = [];
  workBasketOptions: UiOption<number>[] = [];
  workBasketUserOptions: UiOption<number>[] = [];

  constructor(private fb: FormBuilder, private crudService: CrudService, private authenticateService: AuthenticateService,
    private activityService: AuthService, private wbService: WorkbasketService, private toastSvc: WizardToastService) {
    this.activityForm = this.fb.group({
      memberName: [''],
      activityType: ['', Validators.required],
      priority: [null, Validators.required],
      assignTo: [sessionStorage.getItem('loggedInUsername') || '', Validators.required],
      workBasket: [''],
      followUpDateTime: [new Date(), Validators.required],
      dueDate: [new Date(), Validators.required],
      comments: ['', Validators.required],
      workBasketUser: [''],
      workGroups: [''],
      workGroupUser: [''],
    });
  }

  ngOnInit() {
    this.filteredActivities = this.activities;
    this.priorityDisplay = 'Select';
    this.workBasketDisplay = 'Select';

    // If Shell/parent already provided authDetailId, load immediately.
    const existingId = this.toNum(this.authDetailId);
    if (existingId) {
      this.lastLoadedAuthDetailId = existingId;
      this.loadActivitiesForAuth(existingId);
    }

    this.loadActivityTypes();
    this.loadUsers();
    this.activityForm.get('workBasket')?.valueChanges.subscribe(val => {
      if (!val) {
        this.activityForm.get('workBasketUser')?.reset();
        this.workBasketUserDisplay = '';
      }
    });
    this.loadWorkBaskets();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['authDetailId']) {
      const newIdRaw = changes['authDetailId'].currentValue;
      const newId = this.toNum(newIdRaw);
      if (newId && newId !== this.lastLoadedAuthDetailId) {
        this.authDetailId = newId;
        this.loadActivitiesForAuth(newId);
        this.lastLoadedAuthDetailId = newId;
      }
    }
  }


  // --------------------------
  // Context (called by WizardShell)
  // --------------------------
  setContext(ctx: any): void {
    const id = this.toNum(ctx?.authDetailId);
    if (!id) return;

    const changed = id !== this.authDetailId;
    this.authDetailId = id;

    // Load on first set, or when authDetailId changes
    if (changed || this.lastLoadedAuthDetailId !== id || (this.activities?.length ?? 0) === 0) {
      this.lastLoadedAuthDetailId = id;
      this.loadActivitiesForAuth(id);
    }
  }

  reload(): void {
    const id = this.toNum(this.authDetailId);
    if (!id) return;
    this.lastLoadedAuthDetailId = id;
    this.loadActivitiesForAuth(id);
  }
  private loadWorkBaskets(): void {

    this.filteredPriorities = [
      { value: '1', label: 'High' },
      { value: '2', label: 'Medium' },
      { value: '3', label: 'Low' }
    ];
    this.priorityOptions = this.filteredPriorities.map(p => ({ value: Number(p.value), label: p.label }));
    console.log('Priority options loaded:', this.priorityOptions);

    const uid = Number(sessionStorage.getItem('loggedInUserid') || 0) || 0;

    this.wbService.getByUserId(uid || 1).subscribe({
      next: (res: any) => {

        if (!Array.isArray(res)) {
          this.workBaskets = [];
          this.workGroups = [];
          return;
        }
        console.log('Workbaskets response:', res);
        // Get only distinct workbasket IDs
        const distinctWB = res.filter(
          (item: any, index: number, self: any[]) =>
            index === self.findIndex((t: any) => t.workBasketId === item.workBasketId)
        );

        const distinctWG = res.filter(
          (item: any, index: number, self: any[]) =>
            index === self.findIndex((t: any) => t.workGroupId === item.workGroupId)
        );

        const distinctWBUsers = res.filter(
          (item: any, index: number, self: any[]) =>
            index === self.findIndex((t: any) => t.userId === item.userId)
        );

        // Now map the distinct list
        this.workBaskets = distinctWB
          .filter((r: any) => r.activeFlag !== false)
          .map((r: any) => ({
            value: Number(r.workBasketId),
            label: r.workBasketName || r.workBasketCode || `WB #${r.workBasketId}`,
            workGroupName: r.workGroupName,
            userFullName: r.userFullName
          }));
        this.workBasketOptions = this.workBaskets.map(g => ({ value: Number(g.value), label: g.label }));


        this.workGroups = distinctWG
          .filter((r: any) => r.activeFlag !== false)
          .map((r: any) => ({
            value: Number(r.workGroupId),
            label: r.workGroupName || r.workGroupCode || `WB #${r.workGroupId}`
          }));
        this.workGroupOptions = this.workGroups.map(g => ({ value: Number(g.value), label: g.label }));


        this.workGroupDisplay = 'Select';

        this.workBasketUsers = distinctWBUsers
          .filter((r: any) => r.activeFlag !== false)
          .map((r: any) => ({
            value: Number(r.userId),
            label: r.userFullName || `WB #${r.userId}`
          }));
        this.workBasketUserOptions = this.workBasketUsers.map(g => ({ value: Number(g.value), label: g.label }));


        this.workBasketUserDisplay = 'Select';
      },
      error: (err: any) => {
        console.error('Error fetching user workgroups', err);
      }
    });
  }


  private loadUsersForWorkbasket(workbasketId: number): void {
    // clear current user selection
    this.activityForm.get('workBasketUser')?.setValue(null);
    this.workBasketUserDisplay = '';
  }

  loadActivitiesForAuth(authDetailId: number): void {

    this.activityService.getAllActivities(authDetailId).subscribe({
      next: (data: any[]) => {
        this.activities = data || [];
        this.updateActivityLabels();
        this.filteredActivities = [...this.activities];

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
      this.activityTypeOptions = this.activityTypes.map(t => ({ value: Number(t.value), label: t.label }));

      this.updateActivityLabels();

      // If form has value, sync label to display
      const selected = this.activityTypes.find(a => a.value === this.activityForm.get('activityType')?.value);
      this.activityTypeDisplay = selected?.label || 'Select';
    });
  }

  loadUsers() {
    this.authenticateService.getAllUsers().subscribe({
      next: (users: any[]) => {
        this.assignToOptions = users.map(u => ({
          value: u.userId,
          label: u.userName
        }));

        //this.assignToOptions = this.filteredUsers.map(u => ({ value: Number(u.value), label: u.label }));

        const loggedInUsername = sessionStorage.getItem('loggedInUsername');
        const loggedInUser = this.assignToOptions.find(u => u.label === loggedInUsername);

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


    if (this.activityForm.value.assignTo === sessionStorage.getItem('loggedInUsername')) {
      const selectedAssignToName = this.activityForm.value.assignTo;
      const selectedUser = this.assignToOptions.find(u => u.label === selectedAssignToName);
      this.activityForm.value.assignTo = (selectedUser ? selectedUser.value : null);
    }

    //console.log('AssignTo UserId:', assignToUserId);
    const loggedInUser = this.assignToOptions.find(u => u.label === sessionStorage.getItem('loggedInUsername'));
    const loggedInUserId = loggedInUser ? loggedInUser.value : null;

    const newActivity: any = {
      authDetailId: this.authDetailId,
      activityTypeId: Number(this.activityForm.value.activityType) || null,
      priorityId: Number(this.activityForm.value.priority) || null,
      providerId: null,
      followUpDateTime: this.activityForm.value.followUpDateTime || null,
      dueDate: this.activityForm.value.dueDate || null,
      comment: this.activityForm.value.comments || null,
      statusId: 1,
      activeFlag: true,
      CreatedBy: Number(loggedInUserId),
      CreatedOn: new Date(),
      ReferredTo: Number(this.activityForm.value.assignTo) || null
    };


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
            this.loadActivitiesForAuth(this.authDetailId!);
            this.onReset();
            this.isEditing = false;
            this.toastSvc.success('Activity saved successfully.');
          },
          error: (err) => {
            console.error('Update failed', err);
            this.toastSvc.error('Unable to save activity.');
          }
        });
      }
    } else {
      // Insert new
      this.activityService.createActivity(newActivity).subscribe({
        next: () => {
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
      memberName: null,
      activityType: null,
      priority: null,
      assignTo: sessionStorage.getItem('loggedInUsername') || '',
      workBasket: null,
      followUpDateTime: null,
      dueDate: null,
      comments: ''
    });
    this.activityTypeDisplay = '';
    this.editingIndex = null;
    this.activityTypeDisplay = 'Select';
    this.priorityDisplay = 'Select';
    this.workBasketDisplay = 'Select';

    // If Shell/parent already provided authDetailId, load immediately.
    const existingId = this.toNum(this.authDetailId);
    if (existingId) {
      this.lastLoadedAuthDetailId = existingId;
      this.loadActivitiesForAuth(existingId);
    }
    this.scheduledDateText = '';
    this.dueDateText = '';
    this.assignToDisplay = sessionStorage.getItem('loggedInUsername') || 'Select';
  }

  editActivity(index: number) {
    const activity = this.filteredActivities[index];

    this.activityForm.patchValue({
      activityType: this.toNum(activity.activityTypeId),
      priority: this.toNum(activity.priorityId),
      assignTo: this.toNum(activity.referredTo ?? activity.providerId ?? activity.referredTo),
      followUpDateTime: this.toDate(activity.followUpDateTime ?? activity.followUpDateTime),
      dueDate: this.toDate(activity.dueDate ?? activity.dueDate),
      workGroups: '',
      workBasket: '',
      workBasketUser: '',
      comments: activity.comment ?? activity.comment ?? ''
    }, { emitEvent: false });

    // Set display fields (Dropdown text)
    const selectedActivityType = this.activityTypes.find(opt => opt.value === activity.activityTypeId?.toString());
    this.activityTypeDisplay = selectedActivityType?.label || '';

    const selectedAssignTo = this.assignToOptions.find(opt => opt.label == activity.referredTo?.toString());
    this.assignToDisplay = selectedAssignTo?.label || 'Select';

    const selectedPriority = this.filteredPriorities.find(opt => opt.value === activity.priorityId?.toString());
    this.priorityDisplay = selectedPriority?.label || '';

    // Set date text for Scheduled and Due
    if (activity.followUpDateTime) {
      this.scheduledDateText = this.formatForDisplay(new Date(activity.followUpDateTime));
    } else {
      this.scheduledDateText = '';
    }

    if (activity.dueDate) {
      this.dueDateText = this.formatForDisplay(new Date(activity.dueDate));
    } else {
      this.dueDateText = '';
    }

    this.editingIndex = index;
    this.formKey++;
  }

  private toNum = (v: any): number | null =>
    v === null || v === undefined || v === '' ? null : Number(v);

  private toDate = (v: any): Date | null => {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (typeof v === 'number') return new Date(v);                 // epoch ms
    if (typeof v === 'string') {
      const m = v.match(/\/Date\((\d+)\)\//);                       // /Date(…)/ support
      if (m) return new Date(Number(m[1]));
      const d = new Date(v);                                        // ISO-like
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  };


  deleteActivity(index: number) {
    const activity = this.activities[index];
    const loggedInUser = this.assignToOptions.find(u => u.label === sessionStorage.getItem('loggedInUsername'));
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
    this.resetFormForNew();
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


  priorityDisplay: string = '';
  //workBasketDisplay: string = '';
  ///*filteredActivityTypes: { value: string, label: string }[] = [{ value: '', label: 'Select' }];*/
  filteredPriorities: { value: string, label: string }[] = [
    { value: '', label: 'Select' },
    { value: 'High', label: 'High' },
    { value: 'Low', label: 'Low' }
  ];


  private filterOptions(list: Option[], term: string): Option[] {
    const t = (term || '').toLowerCase();
    return !t ? [...list] : list.filter(o => (o.label ?? '').toLowerCase().includes(t));
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

    const match = this.activityTypeOptions.find(type => type.value === Number(code));
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
    const user = this.assignToOptions.find(u => u.value == Number(providerId));
    return user?.label || 'No Assignee';
  }

  getStatusLabel(statusId: number | undefined): string {
    if (statusId === 2) return 'Completed';
    if (statusId === 1) return 'Pending';
    return 'Unknown';
  }

  compareId = (a: any, b: any) => (a && b) ? a.id === b.id : a === b;

  formKey = 0; // bump to force re-render of child controls

  private blankFormValue = {
    activityType: null,
    priority: null,
    assignTo: null,
    followUpDateTime: null,
    dueDate: null,
    workGroups: [],
    workBasket: null,
    workBasketUser: null,
    comments: ''
  };

  private resetFormForNew(): void {
    console.log('Resetting form for new activity');
    this.activityForm.reset(this.blankFormValue, { emitEvent: false });
    // If your custom controls cache state, give them a fresh instance:
    this.activityForm.markAsPristine();
    this.activityForm.markAsUntouched();
    this.formKey++; // <== forces Angular to recreate the subtree
  }

}
