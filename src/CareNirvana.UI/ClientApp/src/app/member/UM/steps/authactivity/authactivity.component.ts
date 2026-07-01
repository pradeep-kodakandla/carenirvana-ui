import { Component, ViewChild, ElementRef, Input, Output, EventEmitter, SimpleChanges, OnChanges } from '@angular/core';
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
import { AuthunsavedchangesawareService } from 'src/app/member/UM/services/authunsavedchangesaware.service';

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

export class AuthactivityComponent implements OnChanges, AuthunsavedchangesawareService {
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

  /**
   * When true, the workGroups → assignTo auto-sync subscription becomes a no-op.
   * Used by editActivity() so we can patch existing data without the subscription
   * clobbering the patched assignTo value mid-flight.
   */
  private suppressWorkGroupSync = false;

  @Input()
  authDetailId: number | null = null;

  /** When true (dashboard), show one pane at a time */
  @Input() singlePane = false;

  /** Optional: open add form immediately (dashboard "Add Activity") */
  @Input() startAdd = false;



  /**
   * inputMode='add'  -> show Add Activity form directly (dashboard embed)
   * inputMode='full' -> allow viewing timeline (and editing) within the component
   */
  @Input() inputMode: 'add' | 'full' = 'full';

  @Output() requestViewAll = new EventEmitter<void>();
  @Output() requestAddOnly = new EventEmitter<void>();

  get isAddOnly(): boolean {
    return (this.inputMode || 'full') === 'add';
  }

  private lastLoadedAuthDetailId: number | null = null;
  canAdd = true;
  canEdit = true;

  // ── View-Only Mode (injected by AuthWizardShell when auth is Closed) ──
  private _isViewOnly = false;
  get isViewOnly(): boolean { return this._isViewOnly; }
  set isViewOnly(value: boolean) {
    const was = this._isViewOnly;
    this._isViewOnly = value;
    if (value) {
      // Lock action flags so no add/edit is possible while view-only
      this.canAdd  = false;
      this.canEdit = false;
      if (this.activityForm) { this.activityForm.disable({ emitEvent: false }); }
    } else if (was) {
      // Restore on reopen
      this.canAdd  = true;
      this.canEdit = true;
      if (this.activityForm) { this.activityForm.enable({ emitEvent: false }); }
    }
  }
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
      // Multi-check dropdowns expect arrays — start them as []
      workBasket: [[]],
      followUpDateTime: [new Date(), Validators.required],
      dueDate: [new Date(), Validators.required],
      comments: ['', Validators.required],
      workBasketUser: [[]],
      workGroups: [[]],
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

    // Existing rule — when Work Basket is cleared, also clear Work Basket User.
    this.activityForm.get('workBasket')?.valueChanges.subscribe(val => {
      const isEmpty = val === null || val === undefined || val === '' ||
                      (Array.isArray(val) && val.length === 0);
      if (isEmpty) {
        this.activityForm.get('workBasketUser')?.reset([]);
        this.workBasketUserDisplay = '';
      }
    });

    // ── Conditional rule for Assign To ───────────────────────────────────
    // • Work Group selected   → Assign To becomes optional + value is cleared
    // • Work Group not chosen → Assign To becomes required + defaults to
    //                            the logged-in user
    // The suppress flag lets editActivity() patch existing rows without
    // this subscription overwriting the loaded values.
    this.activityForm.get('workGroups')?.valueChanges.subscribe(val => {
      if (this.suppressWorkGroupSync) return;
      this.applyAssignToConditional(val);
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
  

    if (changes['startAdd'] && this.startAdd) {
      // Dashboard "Add Activity" => open add screen by default
      this.onAddNewActivity();
    }

  

    if (changes['inputMode']) {
      if (this.isAddOnly) {
        // dashboard embed: keep form open
        this.onAddNewActivity();
      } else {
        // switching to full view: show timeline by default
        this.isEditing = false;
        this.selectedIndex = null;
      }
    }
}

  emitViewAll(): void {
    this.requestViewAll.emit();
  }

  emitAddOnly(): void {
    this.requestAddOnly.emit();
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
    /*console.log('Priority options loaded:', this.priorityOptions);*/

    const uid = Number(sessionStorage.getItem('loggedInUserid') || 0) || 0;

    this.wbService.getByUserId(uid || 1).subscribe({
      next: (res: any) => {

        if (!Array.isArray(res)) {
          this.workBaskets = [];
          this.workGroups = [];
          return;
        }
        /*console.log('Workbaskets response:', res);*/
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
      statusId: this.editingIndex !== null
        ? (this.activities[this.editingIndex]?.statusId ?? 1)
        : 1,
      activeFlag: true,
      CreatedBy: Number(loggedInUserId),
      CreatedOn: new Date(),
      ReferredTo: Number(this.activityForm.value.assignTo) || null,
      // Round-trip the multi-selects so edit can re-populate them next time.
      // (Adjust property names here if your back-end expects different keys.)
      workGroupIds:      this.activityForm.value.workGroups   ?? [],
      workBasketIds:     this.activityForm.value.workBasket   ?? [],
      workBasketUserIds: this.activityForm.value.workBasketUser ?? []
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
      workBasket: [],
      workGroups: [],
      workBasketUser: [],
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

  // ─────────────────────────────────────────────────────────────────────
  // editActivity — populates the form for the activity being edited.
  //
  // Fixes:
  //   • workGroups / workBasket / workBasketUser were hard-coded to ''
  //     so they NEVER populated. Now read from the activity object
  //     (with multiple fallback property names) and normalized to arrays
  //     for the multi-check-dropdowns.
  //   • Assign To: smart-dropdown can fail strict equality if the API
  //     returns a string ID while options hold numbers. coerceToOptionValue
  //     resolves the option's strongly-typed value.
  //   • assignToDisplay lookup compared opt.label to the numeric id —
  //     fixed to compare opt.value.
  //
  // Conditional logic: while patching, the workGroups subscription is
  // suppressed so it cannot wipe the patched assignTo value. After the
  // patch, validators are aligned to match the loaded data.
  // ─────────────────────────────────────────────────────────────────────
  editActivity(index: number) {
    const activity: any = this.filteredActivities[index];

    // --- Resolve Assign To against the loaded options ---
    const referToRaw =
      activity.referredTo ?? activity.referTo ??
      activity.providerId ?? null;
    const assignToVal = this.coerceToOptionValue(this.assignToOptions, referToRaw);

    // --- Resolve Work Group / Work Basket / Work Basket User ---
    // API may return either a single id or an array; normalize to array.
    const wgRaw =
      activity.workGroupIds ?? activity.workGroupId ??
      activity.workgroupids ?? activity.workgroupid ?? null;
    const wbRaw =
      activity.workBasketIds ?? activity.workBasketId ??
      activity.workbasketids ?? activity.workbasketid ?? null;
    const wbuRaw =
      activity.workBasketUserIds ?? activity.workBasketUserId ??
      activity.workbasketuserids ?? activity.workbasketuserid ?? null;

    const wgVal  = this.toIdArray(wgRaw,  this.workGroupOptions);
    const wbVal  = this.toIdArray(wbRaw,  this.workBasketOptions);
    const wbuVal = this.toIdArray(wbuRaw, this.workBasketUserOptions);

    // Suppress the auto-sync while we patch so the patched assignTo isn't
    // wiped by the workGroups change firing partway through.
    this.suppressWorkGroupSync = true;

    this.activityForm.patchValue({
      activityType:     this.toNum(activity.activityTypeId),
      priority:         this.toNum(activity.priorityId),
      assignTo:         assignToVal,
      followUpDateTime: this.toDate(activity.followUpDateTime),
      dueDate:          this.toDate(activity.dueDate),
      workGroups:       wgVal,
      workBasket:       wbVal,
      workBasketUser:   wbuVal,
      comments:         activity.comment ?? ''
    });

    // Align the assignTo validator with the loaded workGroup state, but
    // KEEP the loaded assignTo value (don't clear it) so existing rows
    // render exactly what's in the database.
    this.alignAssignToValidator(wgVal);

    this.suppressWorkGroupSync = false;

    // --- Display strings (for any read-only views that use them) ---
    const selectedActivityType = this.activityTypes
      .find(opt => String(opt.value) === String(activity.activityTypeId));
    this.activityTypeDisplay = selectedActivityType?.label || '';

    // ✅ compare VALUE not LABEL
    const selectedAssignTo = this.assignToOptions
      .find(opt => String(opt.value) === String(referToRaw));
    this.assignToDisplay = selectedAssignTo?.label || 'Select';

    const selectedPriority = this.filteredPriorities
      .find(opt => String(opt.value) === String(activity.priorityId));
    this.priorityDisplay = selectedPriority?.label || '';

    this.scheduledDateText = activity.followUpDateTime
      ? this.formatForDisplay(new Date(activity.followUpDateTime)) : '';
    this.dueDateText = activity.dueDate
      ? this.formatForDisplay(new Date(activity.dueDate)) : '';

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

  // ─────────────────────────────────────────────────────────────────────
  // Helpers used by editActivity to safely match form values against
  // dropdown option values regardless of string/number type.
  // ─────────────────────────────────────────────────────────────────────

  /** Find option by loose (string) equality and return its strongly-typed value. */
  private coerceToOptionValue(options: { value: any; label: string }[], raw: any): any {
    if (raw === null || raw === undefined || raw === '') return null;
    if (!options || !options.length) return this.toNum(raw);   // options not loaded yet
    const match = options.find(o => String(o.value) === String(raw));
    return match ? match.value : this.toNum(raw);
  }

  /** Normalize a single id / array of ids into an array of properly-typed option values. */
  private toIdArray(raw: any, options: { value: any; label: string }[]): any[] {
    if (raw === null || raw === undefined || raw === '') return [];
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr
      .map(v => this.coerceToOptionValue(options, v))
      .filter(v => v !== null && v !== undefined);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Conditional Assign To behavior
  //
  //   Work Group selected   → Assign To is OPTIONAL  (validator removed)
  //                           and value is CLEARED.
  //   Work Group not chosen → Assign To is REQUIRED  (validator added)
  //                           and value defaults to the logged-in user.
  // ─────────────────────────────────────────────────────────────────────

  /** True if the workGroups control currently has at least one selection. */
  hasWorkGroupSelection(val?: any): boolean {
    const v = arguments.length === 0
      ? this.activityForm?.get('workGroups')?.value
      : val;
    if (v === null || v === undefined || v === '') return false;
    if (Array.isArray(v)) return v.length > 0;
    return !!v;
  }

  /** Template helper — used to hide the "*" on the Assign To label when optional. */
  isAssignToOptional(): boolean {
    return this.hasWorkGroupSelection();
  }

  /**
   * Triggered by the user changing Work Group. Clears or restores Assign To
   * value AND toggles the required validator accordingly.
   */
  private applyAssignToConditional(workGroupVal: any): void {
    const ctrl = this.activityForm.get('assignTo');
    if (!ctrl) return;

    if (this.hasWorkGroupSelection(workGroupVal)) {
      // Optional: drop the validator and clear the value.
      ctrl.clearValidators();
      ctrl.setValue(null);
      this.assignToDisplay = '';
    } else {
      // Required: restore the validator and default to the logged-in user.
      ctrl.setValidators([Validators.required]);
      const loggedInUsername = sessionStorage.getItem('loggedInUsername');
      const loggedInUser = this.assignToOptions.find(u => u.label === loggedInUsername);
      if (loggedInUser) {
        ctrl.setValue(loggedInUser.value);
        this.assignToDisplay = loggedInUsername || 'Select';
      } else {
        ctrl.setValue(null);
        this.assignToDisplay = 'Select';
      }
    }
    ctrl.updateValueAndValidity();
  }

  /**
   * Same validator-toggle as applyAssignToConditional, but does NOT touch
   * the value. Used by editActivity so the loaded assignTo stays visible
   * even when the saved row also has a workGroup.
   */
  private alignAssignToValidator(workGroupVal: any): void {
    const ctrl = this.activityForm.get('assignTo');
    if (!ctrl) return;

    if (this.hasWorkGroupSelection(workGroupVal)) {
      ctrl.clearValidators();
    } else {
      ctrl.setValidators([Validators.required]);
    }
    ctrl.updateValueAndValidity({ emitEvent: false });
  }


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


  // ─────────────────────────────────────────────────────────────────────
  // onAddNewActivity — opens a fresh editor.
  //
  // Fix: editingIndex is now reset to null. Without this, after editing
  // a row and then clicking "Add Activity", onSubmit() took the UPDATE
  // branch and silently overwrote the previously-edited row.
  // ─────────────────────────────────────────────────────────────────────
  onAddNewActivity() {
    this.selectedIndex = null;
    this.editingIndex  = null;            // ← critical: forces the INSERT path
    this.isEditing     = true;
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

  //markAsCompleted(index: number) {
  //  const activity = this.activities[index];
  //  if (activity.statusId !== 2) {  // 2 = Completed
  //    activity.statusId = 2;
  //    // Optional if you want to store completedDate manually:
  //    // activity.completedDate = new Date().toISOString();
  //    this.applySearch();
  //    this.sortActivities();
  //  }
  //}

  markAsCompleted(activity: AuthActivity): void {
    if (!activity?.authActivityId || activity.statusId === 2) {
      return;
    }

    const userId = Number(sessionStorage.getItem('loggedInUserid') || 0);

    const payload: any = {
      ...activity,
      authDetailId: this.authDetailId,
      authActivityId: activity.authActivityId,
      statusId: 2, // Completed
      updatedBy: userId,
      updatedOn: new Date()
    };

    // Optimistic UI update
    const previousStatus = activity.statusId;
    activity.statusId = 2;
    this.applySearch();
    this.sortActivities();

    this.activityService.updateActivity(activity.authActivityId, payload).subscribe({
      next: () => {
        this.toastSvc.success('Activity marked as completed.');
        this.loadActivitiesForAuth(this.authDetailId!);
      },
      error: (err) => {
        console.error('Mark completed failed', err);

        // Rollback UI if API fails
        activity.statusId = previousStatus;
        this.applySearch();
        this.sortActivities();

        this.toastSvc.error('Unable to mark activity as completed.');
      }
    });
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

  // Multi-check dropdowns expect arrays — the empty value must be []
  // (not '') or the dropdown UI silently keeps the previous selection.
  private blankFormValue = {
    activityType: null,
    priority: null,
    assignTo: null,
    followUpDateTime: null,
    dueDate: null,
    workGroups: [],
    workBasket: [],
    workBasketUser: [],
    comments: ''
  };

  // ─────────────────────────────────────────────────────────────────────
  // resetFormForNew — wipes the editor state for a fresh "Add Activity".
  //
  // Fixes:
  //   • Drop emitEvent:false so child custom controls (smart-dropdown,
  //     multi-check-dropdown, datetime-picker) actually re-render empty.
  //   • Clear all the lingering display strings that previously stayed
  //     populated from the prior edit.
  //   • Default Assign To back to the logged-in user, matching the
  //     initial form-builder state.
  //   • Restore the Assign To required validator (it may have been
  //     dropped while a workGroup was selected on the previous row).
  // ─────────────────────────────────────────────────────────────────────
  private resetFormForNew(): void {
    /*console.log('Resetting form for new activity');*/

    // Reset values (let events fire so child UI components update visually)
    this.activityForm.reset(this.blankFormValue);

    // Default Assign To = logged-in user (same behavior as first load)
    const loggedInUsername = sessionStorage.getItem('loggedInUsername');
    const loggedInUser     = this.assignToOptions.find(u => u.label === loggedInUsername);
    if (loggedInUser) {
      this.activityForm.get('assignTo')?.setValue(loggedInUser.value, { emitEvent: false });
      this.assignToDisplay = loggedInUsername || 'Select';
    } else {
      this.assignToDisplay = 'Select';
    }

    // No workGroup on a fresh row → Assign To must be required.
    const assignToCtrl = this.activityForm.get('assignTo');
    if (assignToCtrl) {
      assignToCtrl.setValidators([Validators.required]);
      assignToCtrl.updateValueAndValidity({ emitEvent: false });
    }

    // Clear lingering display strings (they were stale after edit → add)
    this.activityTypeDisplay   = '';
    this.priorityDisplay       = '';
    this.workBasketDisplay     = '';
    this.workGroupDisplay      = 'Select';
    this.workBasketUserDisplay = '';
    this.scheduledDateText     = '';
    this.dueDateText           = '';

    this.activityForm.markAsPristine();
    this.activityForm.markAsUntouched();
    this.formKey++; // <== forces Angular to recreate the subtree
  }

  authHasUnsavedChanges(): boolean {
    return this.activityForm?.dirty ?? false;
  }

  // Alias for CanDeactivate guards that expect a different method name
  hasPendingChanges(): boolean {
    return this.authHasUnsavedChanges();
  }

  // Alias for older naming
  hasUnsavedChanges(): boolean {
    return this.authHasUnsavedChanges();
  }
}
