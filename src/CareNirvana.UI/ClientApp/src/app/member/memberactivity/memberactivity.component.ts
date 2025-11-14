import { Component, Input, OnInit, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MemberactivityService, MemberActivityRequestItem, CreateMemberActivityRequest, UpdateMemberActivityRequest, AcceptWorkGroupActivityRequest, RejectWorkGroupActivityRequest, DeleteMemberActivityRequest } from 'src/app/service/memberactivity.service';
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

  @Output() activitySaved = new EventEmitter<number>();
  @Output() cancelled = new EventEmitter<void>();

  public activityForm!: FormGroup;

  // dropdown options (fill these from your lookup services)
  activityTypeOptions: any[] = [];
  priorityOptions: any[] = [];
  assignToOptions: any[] = [];
  workGroupOptions: any[] = [];
  workBasketOptions: any[] = [];
  workBasketUserOptions: any[] = [];
  assignToDisplay: string = 'Select';

  isSaving = false;

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
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['memberDetailsId'] && this.activityForm) {
      this.activityForm.patchValue({ memberDetailsId: this.memberDetailsId });
    }
  }

  private buildForm(): void {
    this.activityForm = this.fb.group({
      memberDetailsId: [this.memberDetailsId, Validators.required],

      activityType: [null, Validators.required],
      priority: [null, Validators.required],
      followUpDateTime: [null, Validators.required],
      dueDate: [null, Validators.required],

      assignTo: [null],          // required only when NOT work basket
      isWorkBasketActivity: [false],

      workGroups: [{ value: [], disabled: true }],
      workBasket: [{ value: [], disabled: true }],
      workBasketUser: [{ value: [], disabled: true }],

      comments: ['', Validators.required]
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

        workGroups.enable();
        workBasket.enable();
        workBasketUser.enable();

        // if you want them required in workbasket mode, uncomment:
        // workBasket.setValidators([Validators.required]);
      } else {
        // Direct assignment mode: AssignTo required; work basket fields disabled
        assignTo.enable();
        assignTo.setValidators([Validators.required]);

        workGroups.disable();
        workBasket.disable();
        workBasketUser.disable();
        // workBasket.clearValidators();
      }

      assignTo.updateValueAndValidity();
      workGroups.updateValueAndValidity();
      workBasket.updateValueAndValidity();
      workBasketUser.updateValueAndValidity();
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

  private loadLookups(): void {
    // ---- Priority (static) ----
    this.priorityOptions = [
      { value: 1, label: 'High' },
      { value: 2, label: 'Medium' },
      { value: 3, label: 'Low' }
    ];

    // ---- Activity Types ----
    this.crudService.getData('um', 'activitytype').subscribe({
      next: (data: any[]) => {
        this.activityTypeOptions = (data || [])
          .map(item => ({
            // pick whatever id field you actually have
            value: Number(item.activityTypeId ?? item.id ?? item.value),
            label: item.activityType || item.label || item.display || item.code
          }))
          .filter(o => !isNaN(o.value));
      },
      error: err => {
        console.error('Error fetching activity types', err);
        this.activityTypeOptions = [];
      }
    });

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


  compareId = (o1: any, o2: any): boolean =>
    o1 && o2 ? o1.id === o2.id : o1 === o2;

  //onSubmit(): void {
  //  if (this.activityForm.invalid || !this.currentUserId || !this.memberDetailsId) {
  //    this.activityForm.markAllAsTouched();
  //    return;
  //  }

  //  this.isSaving = true;

  //  const formValue = this.activityForm.getRawValue();
  //  const isWorkBasket = !!formValue.isWorkBasketActivity;

  //  const activityTypeId = formValue.activityType?.id ?? null;
  //  const priorityId = formValue.priority?.id ?? null;

  //  // assignTo user id (direct activity)
  //  const referTo = !isWorkBasket && formValue.assignTo
  //    ? formValue.assignTo.id
  //    : null;

  //  // Work basket activity: pick the first selected work basket as workGroupWorkBasketId
  //  let workGroupWorkBasketId: number | undefined;
  //  if (isWorkBasket && formValue.workBasket && formValue.workBasket.length > 0) {
  //    const firstBasket = formValue.workBasket[0];
  //    workGroupWorkBasketId = firstBasket.id;
  //  }

  //  const payload: CreateMemberActivityRequest = {
  //    activityTypeId,
  //    priorityId,
  //    memberDetailsId: this.memberDetailsId!,
  //    followUpDateTime: formValue.followUpDateTime
  //      ? new Date(formValue.followUpDateTime).toISOString()
  //      : undefined,
  //    dueDate: formValue.dueDate
  //      ? new Date(formValue.dueDate).toISOString()
  //      : undefined,
  //    referTo,
  //    isWorkBasket: isWorkBasket,
  //    queueId: undefined, // set if you have a queue
  //    comment: formValue.comments,
  //    statusId: undefined, // set default status if needed
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
  //      console.log('Member activity saved', res);
  //    },
  //    error: err => {
  //      console.error('Error saving member activity', err);
  //      this.isSaving = false;
  //    }
  //  });
  //}

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

  onSubmit(): void {
    if (this.activityForm.invalid || !this.currentUserId || !this.memberDetailsId) {
      this.activityForm.markAllAsTouched();
      return;
    }

    const formValue = this.activityForm.getRawValue();
    const isWorkBasket = !!formValue.isWorkBasketActivity;

    // 🔹 Use helper instead of ?.value
    const activityTypeId = this.getNumericValue(formValue.activityType) || 0;
    const priorityId = this.getNumericValue(formValue.priority) || 0;

    // Direct assignment: referTo comes from assignTo
    const referTo = !isWorkBasket
      ? this.getNumericValue(formValue.assignTo)
      : null;

    // Work basket activity: first selected work basket
    let workGroupWorkBasketId: number | undefined;
    if (isWorkBasket && formValue.workBasket && formValue.workBasket.length > 0) {
      const firstBasket = formValue.workBasket[0];
      workGroupWorkBasketId = this.getNumericValue(firstBasket) ?? undefined;
    }

    const payload: CreateMemberActivityRequest = {
      activityTypeId,
      priorityId,
      memberDetailsId: this.memberDetailsId!,
      followUpDateTime: formValue.followUpDateTime
        ? new Date(formValue.followUpDateTime).toISOString()
        : undefined,
      dueDate: formValue.dueDate
        ? new Date(formValue.dueDate).toISOString()
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
      createdBy: this.currentUserId!
    };

    console.log('Submitting member activity', payload);

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


  onCancel(): void {
    this.activityForm.reset({
      memberDetailsId: this.memberDetailsId,
      isWorkBasketActivity: false
    });
    this.cancelled.emit();
  }
}
