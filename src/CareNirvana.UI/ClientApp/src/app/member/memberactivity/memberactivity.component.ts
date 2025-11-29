import { Component, Input, OnInit, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MemberactivityService, MemberActivityRequestItem, CreateMemberActivityRequest, UpdateMemberActivityRequest, AcceptWorkGroupActivityRequest, RejectWorkGroupActivityRequest, DeleteMemberActivityRequest, MemberActivityDetailItem, MemberActivityAssignedUserItem } from 'src/app/service/memberactivity.service';
import { CrudService } from 'src/app/service/crud.service';
import { AuthenticateService } from 'src/app/service/authentication.service';
import { AuthService } from 'src/app/service/auth.service';
import { WorkbasketService } from 'src/app/service/workbasket.service';

@Component({
  selector: 'app-memberactivity',
  templateUrl: './memberactivity.component.html',
  styleUrl: './memberactivity.component.css'
})
export class MemberActivityComponent implements OnInit, OnChanges {

  @Input() memberDetailsId: number | null = null;
  @Input() currentUserId: number | null = null;
  @Input() noCancel: boolean | null = false;
  @Input() memberActivityId?: number | null;
  @Input() isView: boolean = false;
  @Input() preselectedFollowup: Date | null = null;
  @Output() activitySaved = new EventEmitter<number>();
  @Output() cancelled = new EventEmitter<void>();

  public activityForm!: FormGroup;
  assignedUsers: MemberActivityAssignedUserItem[] = [];

  // dropdown options (fill these from your lookup services)
  activityTypeOptions: any[] = [];
  priorityOptions: any[] = [];
  assignToOptions: any[] = [];
  workGroupOptions: any[] = [];
  workBasketOptions: any[] = [];
  workBasketUserOptions: any[] = [];
  assignToDisplay: string = 'Select';
  activityOutcomeTypeOptions: any[] = [];
  activityOutcomeOptions: any[] = [];
  contactWithOptions: any[] = [];
  contactModeOptions: any[] = [];

  isSaving = false;

  callType: 'Scheduled' | 'CompletedCall' | 'ConferenceCall' = 'Scheduled';
  private initialized = false;

  constructor(
    private fb: FormBuilder,
    private memberActivityService: MemberactivityService,
    private crudService: CrudService,
    private authenticateService: AuthenticateService,
    private activityService: AuthService,
    private wbService: WorkbasketService
  ) { }

  ngOnInit(): void {
    this.buildForm();
    this.initWorkBasketToggleBehavior();
    this.loadLookups();
    this.loadUsers();
    if (this.memberDetailsId) {
      this.activityForm.patchValue({ memberDetailsId: this.memberDetailsId });
    }
    this.initialized = true;

    if (this.memberActivityId) {
      this.loadActivityDetail(this.memberActivityId);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['memberDetailsId'] && this.activityForm) {
      this.activityForm.patchValue({ memberDetailsId: this.memberDetailsId });
    }
    /*this.loadActivityDetail(this.memberActivityId ?? 0);*/
    if (changes['memberActivityId'] && !changes['memberActivityId'].firstChange && this.initialized) {
      this.loadActivityDetail(this.memberActivityId ?? 0);
    }

    if (changes['preselectedFollowup'] &&
      this.preselectedFollowup &&
      this.activityForm) {

      const ctrl = this.activityForm.get('followUpDateTime');

      // Only override if it’s empty / null (i.e. new activity)
      if (!ctrl?.value) {
        ctrl!.patchValue(this.preselectedFollowup);
        ctrl!.markAsDirty();
        ctrl!.markAsTouched();
      }
    }
  }

  private buildForm(): void {
    this.activityForm = this.fb.group({
      activityType: [null, Validators.required],
      priority: [null, Validators.required],
      //followUpDateTime: [null, Validators.required],
      followUpDateTime: [this.preselectedFollowup ?? null, Validators.required],
      dueDate: [null, Validators.required],
      assignTo: [null],
      isWorkBasketActivity: [false],
      workGroups: [[]],
      workBasket: [[]],
      workBasketUser: [[]],

      // NEW
      activityOutcomeType: [null],
      activityOutcome: [null],
      contactWith: [null],
      contactMode: [null],
      activityDuration: [null],
      outcomeNotes: [''],

      comments: ['', Validators.required]
    }, {
      // whatever custom validators you already have
    });


    // initial validator for assignTo
    this.activityForm.get('assignTo')?.setValidators([Validators.required]);
  }

  private initWorkBasketToggleBehavior(): void {
    const isWorkBasketControl = this.activityForm.get('isWorkBasketActivity');

    isWorkBasketControl?.valueChanges.subscribe(isWorkBasket => {
      const assignTo = this.activityForm.get('assignTo');
      const workGroups = this.activityForm.get('workGroups');
      const workBasket = this.activityForm.get('workBasket');
      const workBasketUser = this.activityForm.get('workBasketUser');

      if (!assignTo || !workGroups || !workBasket || !workBasketUser) {
        return;
      }

      if (isWorkBasket) {
        // Work basket mode: disable AssignTo, enable work group / basket / users
        assignTo.setValue(null);
        assignTo.clearValidators();
        assignTo.disable();
        this.selectAllWorkBasketFieldsIfEmpty();
        // if you want them required in workbasket mode, uncomment:
        // workBasket.setValidators([Validators.required]);
      } else {
        // Direct assignment mode: AssignTo required; work basket fields disabled
        assignTo.enable();
        assignTo.setValidators([Validators.required]);

        // workBasket.clearValidators();
      }

      assignTo.updateValueAndValidity();
      workGroups.updateValueAndValidity();
      workBasket.updateValueAndValidity();
      workBasketUser.updateValueAndValidity();
    });
  }


  private selectAllWorkBasketFieldsIfEmpty(): void {
    const wgCtrl = this.activityForm.get('workGroups');
    const wbCtrl = this.activityForm.get('workBasket');
    const wbUserCtrl = this.activityForm.get('workBasketUser');

    if (!wgCtrl || !wbCtrl || !wbUserCtrl) {
      return;
    }

    // only auto-select if nothing chosen yet
    if (!Array.isArray(wgCtrl.value) || wgCtrl.value.length === 0) {
      wgCtrl.setValue(this.workGroupOptions.map(o => o.value));
    }

    if (!Array.isArray(wbCtrl.value) || wbCtrl.value.length === 0) {
      wbCtrl.setValue(this.workBasketOptions.map(o => o.value));
    }

    if (!Array.isArray(wbUserCtrl.value) || wbUserCtrl.value.length === 0) {
      wbUserCtrl.setValue(this.workBasketUserOptions.map(o => o.value));
    }
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

  private loadLookups(): void {
    // ---- Priority (static) ----
    this.priorityOptions = [
      { value: 1, label: 'High' },
      { value: 2, label: 'Medium' },
      { value: 3, label: 'Low' }
    ];

    // ---- Activity Types ----
    this.crudService.getData('cm', 'careactivitytype').subscribe({
      next: (data: any[]) => {
        this.activityTypeOptions = (data || [])
          .map(item => ({
            // pick whatever id field you actually have
            value: Number(item.id ?? item.id ?? item.value),
            label: item.careActivityType || item.label || item.display || item.code
          }))
          .filter(o => !isNaN(o.value));
      },
      error: err => {
        console.error('Error fetching activity types', err);
        this.activityTypeOptions = [];
      }
    });
    // ---- Activity Outcome Type----
    this.crudService.getData('cm', 'activityoutcometype').subscribe({
      next: (data: any[]) => {
        this.activityOutcomeTypeOptions = (data || [])
          .map(item => ({
            // pick whatever id field you actually have
            value: Number(item.id ?? item.id ?? item.value),
            label: item.activityOutcomeType || item.label || item.display || item.code
          }))
          .filter(o => !isNaN(o.value));
      },
      error: err => {
        console.error('Error fetching activity types', err);
        this.activityOutcomeTypeOptions = [];
      }
    });
    // ---- Activity Outcome ----
    this.crudService.getData('cm', 'activityoutcome').subscribe({
      next: (data: any[]) => {
        this.activityOutcomeOptions = (data || [])
          .map(item => ({
            // pick whatever id field you actually have
            value: Number(item.id ?? item.id ?? item.value),
            label: item.activityOutcome || item.label || item.display || item.code
          }))
          .filter(o => !isNaN(o.value));
      },
      error: err => {
        console.error('Error fetching activity types', err);
        this.activityOutcomeOptions = [];
      }
    });
    // ---- Contact Mode ----
    this.crudService.getData('cm', 'contacttype').subscribe({
      next: (data: any[]) => {
        this.contactModeOptions = (data || [])
          .map(item => ({
            // pick whatever id field you actually have
            value: Number(item.id ?? item.id ?? item.value),
            label: item.contactType || item.label || item.display || item.code
          }))
          .filter(o => !isNaN(o.value));
      },
      error: err => {
        console.error('Error fetching activity types', err);
        this.contactModeOptions = [];
      }
    });
    // ---- Contact With ----
    this.contactWithOptions = [
      { value: 1, label: 'Member' },
      { value: 2, label: 'Provder' },
      { value: 3, label: 'Other' }
    ];

    // ---- Work Group / Work Basket / Work Basket Users (by user) ----
    const userId = this.currentUserId ?? 0;

    this.wbService.getByUserId(userId).subscribe({
      next: (res: any) => {
        if (!Array.isArray(res)) {
          console.warn('wbService.getByUserId did not return an array', res);
          this.workBasketOptions = [];
          this.workGroupOptions = [];
          this.workBasketUserOptions = [];
          return;
        }

        console.log('Workbaskets response:', res);

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

        // Work Baskets – IMPORTANT: use workGroupWorkBasketId if available
        this.workBasketOptions = distinctWB
          .filter((r: any) => r.activeFlag !== false)
          .map((r: any) => ({
            value: Number(r.workGroupWorkBasketId ?? r.workBasketId),
            label:
              r.workBasketName ||
              r.workBasketCode ||
              `WB #${r.workBasketId}`
          }))
          .filter(o => !isNaN(o.value));

        // Work Groups
        this.workGroupOptions = distinctWG
          .filter((r: any) => r.activeFlag !== false)
          .map((r: any) => ({
            value: Number(r.workGroupId),
            label:
              r.workGroupName ||
              r.workGroupCode ||
              `WG #${r.workGroupId}`
          }))
          .filter(o => !isNaN(o.value));

        // Work Basket Users
        this.workBasketUserOptions = distinctWBUsers
          .filter((r: any) => r.activeFlag !== false)
          .map((r: any) => ({
            value: Number(r.userId),
            label: r.userFullName || `User #${r.userId}`
          }))
          .filter(o => !isNaN(o.value));

        // You *could* also reuse this list for assignToOptions if that fits:
        // this.assignToOptions = [...this.workBasketUserOptions];
      },
      error: (err: any) => {
        console.error('Error fetching user workgroups/workbaskets', err);
        this.workBasketOptions = [];
        this.workGroupOptions = [];
        this.workBasketUserOptions = [];
      }
    });
  }


  //compareId = (o1: any, o2: any): boolean =>
  //  o1 && o2 ? o1.id === o2.id : o1 === o2;

  compareId = (o1: any, o2: any): boolean => {
    const v1 = this.getNumericValue(o1);
    const v2 = this.getNumericValue(o2);
    return v1 === v2;
  };

  private getNumericValue(source: any): number | null {
    if (source === null || source === undefined) {
      return null;
    }

    // If control returns plain number
    if (typeof source === 'number') {
      return source;
    }

    // If control returns plain string
    if (typeof source === 'string') {
      const parsed = Number(source);
      return isNaN(parsed) ? null : parsed;
    }

    // If control returns an object like { value, label }
    if (typeof source === 'object' && source.value !== undefined) {
      const parsed = Number(source.value);
      return isNaN(parsed) ? null : parsed;
    }

    return null;
  }

  //onSubmit(): void {
  //  if (this.activityForm.invalid || !this.currentUserId || !this.memberDetailsId) {
  //    this.activityForm.markAllAsTouched();
  //    return;
  //  }

  //  const formValue = this.activityForm.getRawValue();
  //  const isWorkBasket = !!formValue.isWorkBasketActivity;

  //  // 🔹 Use helper instead of ?.value
  //  const activityTypeId = this.getNumericValue(formValue.activityType) || 0;
  //  const priorityId = this.getNumericValue(formValue.priority) || 0;

  //  // Direct assignment: referTo comes from assignTo
  //  const referTo = !isWorkBasket
  //    ? this.getNumericValue(formValue.assignTo)
  //    : null;

  //  // Work basket activity: first selected work basket
  //  let workGroupWorkBasketId: number | undefined;
  //  if (isWorkBasket && formValue.workBasket && formValue.workBasket.length > 0) {
  //    const firstBasket = formValue.workBasket[0];
  //    workGroupWorkBasketId = this.getNumericValue(firstBasket) ?? undefined;
  //  }

  //  const payload: CreateMemberActivityRequest = {
  //    activityTypeId,
  //    priorityId,
  //    memberDetailsId: this.memberDetailsId!,
  //    followUpDateTime: formValue.followUpDateTime
  //      ? this.toLocalDateTimeString(formValue.followUpDateTime)
  //      : undefined,

  //    dueDate: formValue.dueDate
  //      ? this.toLocalDateTimeString(formValue.dueDate)
  //      : undefined,
  //    referTo: referTo ?? undefined,
  //    isWorkBasket: isWorkBasket,
  //    queueId: undefined,
  //    comment: formValue.comments,
  //    statusId: undefined,
  //    performedDateTime: undefined,
  //    performedBy: undefined,
  //    activeFlag: true,
  //    workGroupWorkBasketId,
  //    createdBy: this.currentUserId!
  //  };

  //  console.log('Submitting member activity', payload);

  //  this.memberActivityService.createActivity(payload).subscribe({
  //    next: res => {
  //      this.isSaving = false;
  //      this.activitySaved.emit(res.memberActivityId);
  //      this.activityForm.reset({
  //        memberDetailsId: this.memberDetailsId,
  //        isWorkBasketActivity: false
  //      });
  //    },
  //    error: err => {
  //      console.error('Error saving member activity', err);
  //      this.isSaving = false;
  //    }
  //  });
  //}

  onSubmit(): void {
    if (this.activityForm.invalid || !this.currentUserId || !this.memberDetailsId) {
      this.activityForm.markAllAsTouched();
      return;
    }

    const formValue = this.activityForm.getRawValue();
    const isWorkBasket = !!formValue.isWorkBasketActivity;

    // Use helper instead of ?.value
    const activityTypeId = this.getNumericValue(formValue.activityType) || 0;
    const priorityId = this.getNumericValue(formValue.priority) || 0;

    // Direct assignment: referTo comes from assignTo when NOT work basket
    const referTo = !isWorkBasket
      ? this.getNumericValue(formValue.assignTo)
      : null;

    // Work basket activity: first selected work basket
    let workGroupWorkBasketId: number | undefined;
    if (isWorkBasket && Array.isArray(formValue.workBasket) && formValue.workBasket.length > 0) {
      const firstBasket = formValue.workBasket[0];
      workGroupWorkBasketId = this.getNumericValue(firstBasket) ?? undefined;
    }

    // NEW: outcome / contact fields from form
    const activityOutcomeTypeId = this.getNumericValue(formValue.activityOutcomeType);
    const activityOutcomeId = this.getNumericValue(formValue.activityOutcome);
    const contactWithId = this.getNumericValue(formValue.contactWith);
    const contactModeId = this.getNumericValue(formValue.contactMode);
    const activityDuration =
      formValue.activityDuration !== null &&
        formValue.activityDuration !== undefined &&
        formValue.activityDuration !== ''
        ? Number(formValue.activityDuration)
        : undefined;

    const payload: CreateMemberActivityRequest = {
      activityTypeId,
      priorityId,
      memberDetailsId: this.memberDetailsId!,
      followUpDateTime: formValue.followUpDateTime
        ? this.toLocalDateTimeString(formValue.followUpDateTime)
        : undefined,
      dueDate: formValue.dueDate
        ? this.toLocalDateTimeString(formValue.dueDate)
        : undefined,
      referTo: referTo ?? undefined,
      isWorkBasket: isWorkBasket,
      queueId: undefined,
      comment: formValue.comments,
      statusId: undefined,
      performedDateTime: undefined,
      performedBy: undefined,
      activeFlag: true,
      workGroupWorkBasketId,

      // NEW: outcome / contact fields sent to API
      activityOutcomeTypeId: activityOutcomeTypeId ?? undefined,
      activityOutcomeId: activityOutcomeId ?? undefined,
      contactWithId: contactWithId ?? undefined,
      contactModeId: contactModeId ?? undefined,
      activityDuration,
      outcomeNotes: formValue.outcomeNotes || undefined,

      createdBy: this.currentUserId!  // non-null assertion fixes the TS error
    };

    console.log('Submitting member activity', payload);
    this.isSaving = true;

    this.memberActivityService.createActivity(payload).subscribe({
      next: res => {
        this.isSaving = false;
        this.activitySaved.emit(res.memberActivityId);
        this.activityForm.reset({
          memberDetailsId: this.memberDetailsId,
          isWorkBasketActivity: false
        });
      },
      error: err => {
        console.error('Error saving member activity', err);
        this.isSaving = false;
      }
    });
  }




  private toLocalDateTimeString(value: any): string {
    const d = new Date(value);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');

    // no Z, no timezone → just "wall time"
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  }


  onCancel(): void {
    this.activityForm.reset({
      memberDetailsId: this.memberDetailsId,
      isWorkBasketActivity: false
    });
    this.cancelled.emit();
  }

  private loadActivityDetail(id: number): void {
    console.log('Loading activity detail for ID', id);
    this.memberActivityService.getMemberActivityDetail(id).subscribe({
      next: (activity: MemberActivityDetailItem) => {
        console.log('Activity detail loaded', activity);

        this.assignedUsers = activity.assignedUsers || [];

        // Optional: patch the form with data from API
        this.activityForm.patchValue({
          // existing fields...
          activityType: this.findOption(this.activityTypeOptions, activity.activityTypeId),
          priority: this.findOption(this.priorityOptions, activity.priorityId),
          followUpDateTime: activity.followUpDateTime,
          dueDate: activity.dueDate,
          //assignTo: this.getAssignToOption(activity.referTo),
          isWorkBasketActivity: activity.isWorkBasket,

          // NEW: map IDs from API to dropdown options
          activityOutcomeType: this.findOption(this.activityOutcomeTypeOptions, activity.activityOutcomeTypeId),
          activityOutcome: this.findOption(this.activityOutcomeOptions, activity.activityOutcomeId),
          contactWith: this.findOption(this.contactWithOptions, activity.contactWithId),
          contactMode: this.findOption(this.contactModeOptions, activity.contactModeId),
          activityDuration: activity.activityDuration,
          outcomeNotes: '',

          comments: activity.comment || ''
        });
        console.log("Patch Values", this.activityForm);
      },
      error: err => {
        console.error('Error loading activity detail', err);
      }
    });
  }

  //private findOption(options: any[], id: number | null | undefined): any | null {
  //  if (!id || !options) return null;
  //  return options.find(o => o.id === id) || null;
  //}

  private findOption(options: any[], id: number | null | undefined): any | null {
    if (id === null || id === undefined || !options || !options.length) {
      return null;
    }

    return options.find(o => this.getNumericValue(o) === id) || null;
  }

  setCallType(type: 'Scheduled' | 'CompletedCall' | 'ConferenceCall'): void {
    this.callType = type;
  }
}
