import { Component, OnInit, ViewChild, ElementRef, Input, OnChanges, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MdReviewLine } from '../decisiondetails/decisiondetails.component';
import { CrudService } from 'src/app/service/crud.service';
import { AuthService } from 'src/app/service/auth.service';
import { AuthenticateService } from 'src/app/service/authentication.service';
import { map } from 'rxjs/operators';
import { DatePipe } from '@angular/common';

interface MdReviewActivityDto {
  activity: any;   // or your AuthActivity model
  lines: any[];    // or your AuthActivityLine model
}

type MdActivityLine = {
  serviceCode?: string;
  ServiceCode?: string;
  code?: string;
  CPT?: string;
  DecisionLineId?: number | string;
  decisionLineId?: number | string;
  // ...other fields
};

type MdActivity = {
  activity: any; // could contain MDStatus, MDAgg, etc.
  lines: MdActivityLine[];
};

type MdIndexEntry = {
  hasAnyActivity: boolean;
  hasPendingLike: boolean;   // pending / in progress
  hasCompletedLike: boolean; // completed / closed
};
type MdReviewStatus = 'MD Review in progress' | 'MD Review completed' | 'Not requested';
type MdReviewLineVM = MdReviewLine & { mdrStatus?: MdReviewStatus; selected?: boolean };

@Component({
  selector: 'app-mdreview',
  templateUrl: './mdreview.component.html',
  styleUrls: ['./mdreview.component.css']
})
export class MdreviewComponent implements OnInit, OnChanges {

  @Input() authDetailId: number | null = null;
  @Input() serviceLines: MdReviewLine[] = [];

  mdrForm!: FormGroup;

  activityTypeDisplay = '';
  assignmentTypeDisplay = 'Specific Medical Director';
  priorityDisplay = 'Select';
  assignToDisplay = '';
  workBasketDisplay = '';
  workBasketUserDisplay = '';
  scheduledDateText = '';
  dueDateText = '';
  showWorkBasketFields = false;
  allSelected = true;
  activityTypes: { value: string, label: string }[] = [{ value: '', label: 'Select' }];

  activities: MdReviewActivityDto[] = [];

  // Optional: constants to avoid typos

  private readonly ASSIGNMENT_WORK_BASKET = 'Work Basket Assignment';

  showDropdowns: any = {
    activityType: false,
    priority: false,
    assignTo: false,
    workBasket: false,
    workBasketUser: false
  };

  priorities = [
    { id: 1, label: 'High' },
    { id: 2, label: 'Medium' },
    { id: 3, label: 'Low' }
  ];

  activeDropdown = '';
  highlightedIndex = -1;

  filteredActivityTypes = [{ label: '' }];
  filteredAssignmentTypes = [{ label: 'Specific Medical Director' }, { label: 'Work Basket Assignment' }];
  filteredPriorities = [{ label: 'Select' }, { label: 'High' }, { label: 'Medium' }, { label: 'Low' }];
  filteredUsers = [{ label: '' }];
  filteredWorkBaskets = [{ label: 'UM-QA' }, { label: 'UM-CCR' }];

  @ViewChild('scheduledPicker') scheduledPicker!: ElementRef<HTMLInputElement>;
  @ViewChild('duePicker') duePicker!: ElementRef<HTMLInputElement>;
  constructor(private fb: FormBuilder, private crudService: CrudService, private authenticateService: AuthenticateService, private activityService: AuthService, private datePipe: DatePipe) { }


  displayLines: MdReviewLineVM[] = [];        // <-- bind UI to this
  private mdIndexByServiceCode = new Map<string, { hasAnyActivity: boolean; hasPendingLike: boolean; hasCompletedLike: boolean }>();



  ngOnInit(): void {


    // Initialize form with default values
    this.mdrForm = this.fb.group({
      assignmentType: ['', Validators.required],
      activityType: ['', Validators.required],
      priority: ['', Validators.required],
      assignTo: ['', Validators.required],
      scheduledDateTime: ['', Validators.required],
      dueDateTime: ['', Validators.required],
      workBasket: [''],
      workBasketUser: [''],
      clinicalInstructions: ['']
    });

    const s = this.mdrForm.get('scheduledDateTime')?.value ?? '';
    const d = this.mdrForm.get('dueDateTime')?.value ?? '';
    this.scheduledDateText = s;
    this.dueDateText = d;
    this.applyAssignmentTypeSideEffects(this.assignmentTypeDisplay);
    this.loadActivityTypes();
    this.loadUsers();

    // Default Priority to ID=2 (Routine) and reflect label in the input
    this.mdrForm.get('priority')?.setValue(2);
    const defP = this.priorities.find(p => p.id === 2);
    this.priorityDisplay = defP?.label ?? '';
  }

  loadActivityTypes() {
    this.crudService.getData('um', 'activitytype').subscribe((data: any[]) => {
      const options = data.map(item => ({
        value: item.code || item.value || item.id,
        label: item.label || item.activityType || item.display
      }));

      this.activityTypes = [{ value: '', label: 'Select' }, ...options];
      this.filteredActivityTypes = [...this.activityTypes];
      // this.updateActivityLabels();

      // If form has value, sync label to display
      const selected = this.activityTypes.find(a => a.value === this.mdrForm.get('activityType')?.value);
      this.activityTypeDisplay = selected?.label || 'Select';
    });
  }


  loadUsers() {
    this.authenticateService.getAllUsers().subscribe({
      next: (users: any[]) => {
        this.filteredUsers = users.map(u => ({
          value: u.UserId,
          label: u.UserName
        }));

        const loggedInUsername = sessionStorage.getItem('loggedInUsername');
        const loggedInUser = this.filteredUsers.find(u => u.label === loggedInUsername);

        if (loggedInUser) {
          // Set the actual UserId in the FormControl value!
          this.mdrForm.get('assignTo')?.setValue(loggedInUser);
          this.assignToDisplay = loggedInUsername || 'Select';
        } else {
          this.mdrForm.get('assignTo')?.setValue('');
          this.assignToDisplay = 'Select';
        }
      }
    });
  }

  /** Centralized place to flip visibility + clear WB fields when not needed */
  private applyAssignmentTypeSideEffects(label: string): void {
    this.showWorkBasketFields = (label === this.ASSIGNMENT_WORK_BASKET);

    if (!this.showWorkBasketFields) {
      // Clear any prior WB selections when switching away
      this.workBasketDisplay = '';
      this.workBasketUserDisplay = '';

      // If you keep reactive controls for these, clear them too:
      try {
        this.mdrForm.patchValue?.({
          workBasket: null,
          workBasketUser: null
        });
      } catch { }
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['serviceLines']) {
      const incoming = this.serviceLines ?? [];
      this.serviceLines = incoming.map((l) => {
        const copy: MdReviewLine = { ...l }; // 1) spread once
        if (copy.selected === undefined) copy.selected = false;           // 2) fill defaults
        if (copy.recommendation === undefined) copy.recommendation = 'Pending';
        return copy;
      });
    }
    if (this.serviceLines.length > 0) {
      this.serviceLines.forEach(row => row.selected = true);
    }
  }


  // Dropdown behavior
  onDropdownInput(event: any, field: string) {
    const value = event.target.value.toLowerCase();
    this.showDropdowns[field] = true;
    this.activeDropdown = field;
    this.highlightedIndex = 0;

    switch (field) {
      case 'activityType':
        this.filteredActivityTypes = this.filteredActivityTypes.filter(o => o.label.toLowerCase().includes(value));
        break;
      case 'priority':
        this.filteredPriorities = this.filteredPriorities.filter(o => o.label.toLowerCase().includes(value));
        break;
      case 'assignTo':
      case 'workBasketUser':
        this.filteredUsers = this.filteredUsers.filter(o => o.label.toLowerCase().includes(value));
        break;
      case 'workBasket':
        this.filteredWorkBaskets = this.filteredWorkBaskets.filter(o => o.label.toLowerCase().includes(value));
        break;
    }
  }

  openDropdown(field: string) {
    this.showDropdowns[field] = true;
    this.activeDropdown = field;
    this.highlightedIndex = 0;
  }

  closeDropdown(field: string) {
    setTimeout(() => {
      this.showDropdowns[field] = false;
    }, 150); // slight delay for click selection
  }

  selectDropdownOption(field: string, option: { label: string;[k: string]: any }): void {
    if (field === 'assignmentType') {
      this.assignmentTypeDisplay = option.label;
      this.applyAssignmentTypeSideEffects(option.label);
      return;
    }
    switch (field) {
      case 'activityType':
        this.activityTypeDisplay = option.label;
        this.mdrForm.get('activityType')?.setValue(option.value);
        break;
      case 'assignmentType':
        this.assignmentTypeDisplay = option.label;
        this.mdrForm.get('assignmentType')?.setValue(option.label);
        break;
      case 'priority':
        this.priorityDisplay = option.label;
        this.mdrForm.get('priority')?.setValue(option.id);
        break;
      case 'assignTo':
        this.assignToDisplay = option.label;
        this.mdrForm.get('assignTo')?.setValue(option.label);
        break;
      case 'workBasket':
        this.workBasketDisplay = option.label;
        this.mdrForm.get('workBasket')?.setValue(option.label);
        break;
      case 'workBasketUser':
        this.workBasketUserDisplay = option.label;
        this.mdrForm.get('workBasketUser')?.setValue(option.label);
        break;
    }
    this.showDropdowns[field] = false;
  }

  // Calendar
  triggerCalendar(which: 'scheduled' | 'due') {
    const el = which === 'scheduled' ? this.scheduledPicker?.nativeElement : this.duePicker?.nativeElement;
    if (!el) return;
    // Chromium supports showPicker(); fallback to click()
    if ((el as any).showPicker) { try { (el as any).showPicker(); return; } catch { } }
    el.click();
  }

  handleCalendarChange(evt: Event, control: 'scheduledDateTime' | 'dueDateTime') {
    let v = (evt.target as HTMLInputElement).value || '';
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) v = v + ':00'; // ensure seconds
    this.mdrForm.get(control)?.setValue(v);
    const disp = this.toDisplayFormat(v);
    if (control === 'scheduledDateTime') this.scheduledDateText = disp;
    else this.dueDateText = disp;
  }


  onDateTextChange(evt: Event, control: 'scheduledDateTime' | 'dueDateTime') {
    const v = (evt.target as HTMLInputElement).value;
    if (control === 'scheduledDateTime') this.scheduledDateText = v;
    else this.dueDateText = v;
  }

  handleDateBlur(control: 'scheduledDateTime' | 'dueDateTime') {
    const raw = control === 'scheduledDateTime' ? this.scheduledDateText : this.dueDateText;
    const parsed = this.parseRelativeOrIso(raw);
    if (parsed) {
      this.mdrForm.get(control)?.setValue(parsed);
      if (control === 'scheduledDateTime') this.scheduledDateText = parsed;
      else this.dueDateText = parsed;
      this.mdrForm.get(control)?.setErrors(null);
    } else {
      // mark invalid (optional)
      this.mdrForm.get(control)?.setErrors({ invalidDate: true });
    }
  }
  private pad2(n: number) { return String(n).padStart(2, '0'); }

  private toLocalInputValue(d: Date): string {
    // yyyy-MM-ddTHH:mm:ss for <input type="datetime-local" step=1>
    return `${d.getFullYear()}-${this.pad2(d.getMonth() + 1)}-${this.pad2(d.getDate())}`
      + `T${this.pad2(d.getHours())}:${this.pad2(d.getMinutes())}:${this.pad2(d.getSeconds())}`;
  }

  toDisplayFormat(input: any): string {
    const dt = this.parseToDate(input);
    if (!dt) return '';
    return `${this.pad2(dt.getMonth() + 1)}/${this.pad2(dt.getDate())}/${dt.getFullYear()} `
      + `${this.pad2(dt.getHours())}:${this.pad2(dt.getMinutes())}:${this.pad2(dt.getSeconds())}`;
  }

  private parseToDate(input: any): Date | null {
    if (!input) return null;
    if (input instanceof Date) return input;

    const s = String(input).trim();

    // yyyy-MM-ddTHH:mm[:ss]
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const [, y, mo, d, h, mi, se] = m;
      return new Date(+y, +mo - 1, +d, +h, +mi, se ? +se : 0);
    }

    // MM/dd/yyyy HH:mm:ss
    m = s.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
    if (m) {
      const [, mo, d, y, h, mi, se] = m;
      return new Date(+y, +mo - 1, +d, +h, +mi, +se);
    }

    return null;
  }

  private parseRelativeOrIso(text: string): string | null {
    const t = (text || '').trim().toUpperCase();
    if (!t) return null;

    if (t === 'D') {
      return this.toLocalInputValue(new Date());
    }

    const rel = t.match(/^D\s*([+-])\s*(\d+)$/);
    if (rel) {
      const sign = rel[1] === '+' ? 1 : -1;
      const days = parseInt(rel[2], 10);
      const d = new Date();
      d.setDate(d.getDate() + sign * days);
      return this.toLocalInputValue(d);
    }

    const dt = this.parseToDate(text);
    return dt ? this.toLocalInputValue(dt) : null;
  }

  // Service lines
  isAllSelected(): boolean {
    return this.serviceLines.every(line => line.selected);
  }

  //toggleAllSelection(event: any) {
  //  const isChecked = event.target.checked;
  //  this.serviceLines.forEach(line => (line.selected = isChecked));
  //}

  getRecommendationClass(status: string): string {
    switch (status.toLowerCase()) {
      case 'approved':
        return 'btn-approved';
      case 'denied':
        return 'btn-denied';
      case 'void':
        return 'btn-void';
      default:
        return 'btn-pending';
    }
  }

  cancelReview() {
    this.mdrForm.reset();
    this.serviceLines.forEach(l => (l.selected = false));
  }

  hasSelection(): boolean {
    return Array.isArray(this.serviceLines) && this.serviceLines.some(l => !!l.selected);
  }


  // Submit new MD Review activity with selected lines

  private numOrNull(v: any): number | null {
    if (v === '' || v === undefined || v === null) return null;
    const n = Number((v as any)?.value ?? v);
    return isNaN(n) ? null : n;
  }


  // --- MAIN: drop-in submitReview() ---
  submitReview(): void {
    if (!this.hasSelection?.()) return;

    const selected = (this.serviceLines || []).filter((l: any) => !!l?.selected);
    if (!selected.length) return;

    const fv = this.mdrForm?.value ?? {};
    const isWB = ((fv.assignmentType?.value ?? fv.assignmentType) + '')
      .toLowerCase()
      .includes('work');

    // Build Activity with ISO datetimes
    const Activity = {
      authDetailId: this.authDetailId, // TODO: use actual id if available
      activityTypeId: this.numOrNull(fv.activityType ?? fv.activityTypeId),
      priorityId: this.numOrNull(fv.priority ?? fv.priorityId),
      referredTo: isWB ? null : this.numOrNull(fv.assignTo),
      isWorkBasket: isWB ? true : null,
      queueId: isWB ? this.numOrNull(fv.workBasketQueue) : null,
      followUpDateTime: this.toIsoUtc(fv.scheduledDateTime),
      dueDate: this.toIsoUtc(fv.dueDateTime),
      comment: fv.clinicalInstructions || '',
      createdOn: this.toIsoUtc(new Date()), // <= ISO with "T"
      createdBy: 1 // or this.currentUserId
    };

    // Map lines with ISO dates + numeric counts
    const Lines = selected.map((l: any) => ({
      decisionLineId: l.decisionLineId ?? null,
      serviceCode: l.serviceCode ?? l.code ?? null,
      description: l.description ?? l.codeDesc ?? null,
      fromDate: this.toIsoUtc(l.fromDate),
      toDate: this.toIsoUtc(l.toDate),
      requested: Number(l.requested ?? 0) || 0,
      approved: Number(l.approved ?? 0) || 0,
      denied: Number(l.denied ?? 0) || 0,
      initialRecommendation: l.initialRecommendation ?? l.recommendation ?? null
    }));

    // Validate: any unparseable date -> stop and show why
    const badDates = [
      Activity.followUpDateTime, Activity.dueDate,
      ...Lines.flatMap(x => [x.fromDate, x.toDate])
    ].filter(d => d === null);

    if (badDates.length) {
      console.error('One or more dates could not be converted to ISO. Aborting submit.', badDates);
      // TODO show snackbar/toast for the user
      return;
    }

    const payload = {
      Activity,             // PascalCase or camelCase both bind; keep your current shape
      Lines,
      PayloadSnapshotJson: JSON.stringify({
        source: 'mdreview-ui',
        selectedCount: Lines.length,
        ts: this.toIsoUtc(new Date()) // ISO too
      })
    };


    this.activityService.createMdReviewActivity(payload).subscribe({
      next: (res: any) => {
        const idToReload = this.authDetailId || undefined; // or this.authDetailId
        this.loadMdReviewActivities?.(idToReload);
        (this.serviceLines || []).forEach((l: any) => (l.selected = false));
      },
      error: (err: any) => {
        // You’ll now see the controller’s specific message instead of ArgumentNullException
        console.error('Error creating MD Review activity', err);
        console.error('Server said:', err?.error);
      }
    });
  }


  private toIsoUtc(v: any): string | null {
    if (!v) return null;

    // Let your existing formatter run first if you like
    const s = this.formatDateForApi ? this.formatDateForApi(v) : v;

    // Already Date?
    if (s instanceof Date) return s.toISOString().replace(/\.\d{3}Z$/, 'Z');

    // Already ISO with T? Parse then force UTC Z
    if (typeof s === 'string' && /T\d{2}:\d{2}/.test(s)) {
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d.toISOString().replace(/\.\d{3}Z$/, 'Z');
    }

    // yyyy-MM-dd HH:mm:ss
    let m = ('' + s).match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
      .toISOString().replace(/\.\d{3}Z$/, 'Z');

    // yyyyMMdd HH:mm:ss
    m = ('' + s).match(/^(\d{4})(\d{2})(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
      .toISOString().replace(/\.\d{3}Z$/, 'Z');

    // MM/dd/yyyy HH:mm:ss
    m = ('' + s).match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
    if (m) return new Date(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], +m[6])
      .toISOString().replace(/\.\d{3}Z$/, 'Z');

    const d2 = new Date(s);
    return isNaN(d2.getTime()) ? null : d2.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }


  // Update a line decision (e.g. Approved/Denied)
  updateLineDecision(line: any, decision: string) {
    const payload = {
      mddecision: decision,
      mdnotes: line.notes || null
    };

    this.activityService.updateMdReviewLine(line.id, payload)
      .subscribe({
        next: res => {
          line.mddecision = decision;
        },
        error: err => console.error('Error updating line', err)
      });
  }

  private formatDateForApi(date: any): string | null {
    return this.datePipe.transform(date, 'yyyy-MM-dd HH:mm:ss');
  }








  // New: view state
  viewMode: 'table' | 'cards' = 'cards';

  switchView(mode: 'table' | 'cards'): void {
    this.viewMode = mode;
  }

  // Optional: stable trackBy if you have an id; else fall back to index
  trackByLine = (_: number, line: any) => line?.id ?? line?.decisionLineId ?? _;

  // Compute MD status from line data or activity joins
  getMdStatus(line: any): string {
    // Prefer explicit flags coming from your API if present.
    // Fallbacks keep it robust without changing your payload shape.
    //console.log('Computing MD status for line', line);
    if (line?.mdrStatus) {
      // normalize to a friendly label if backend sends enums/codes
      const s = String(line.mdrStatus).toLowerCase();
      if (s.includes('in') && s.includes('progress')) return 'MD Review in progress';
      if (s.includes('complete') || s.includes('done')) return 'MD Review completed';
      if (s.includes('pending')) return 'MD Review in progress';
    }
    if (line?.mdReviewRequested || line?.mdRequested || line?.isMdReviewRequested) {
      return 'MD Review in progress';
    }
    return 'MD Review in progress';
  }

  // Map status to badge class
  mdStatusClass(status: string): string {
    const s = status.toLowerCase();
    if (s.includes('in progress') || s.includes('pending')) return 'mdr-in-progress';
    if (s.includes('completed')) return 'mdr-completed';
    return 'mdr-not-requested';
  }

  ///********Load Activities**********///

  //private mdIndexByServiceCode = new Map<string, MdIndexEntry>();

  // Load activities for given authDetailId
  loadMdReviewActivities(authDetailId?: number) {
    this.activityService.getMdReviewActivities(undefined, authDetailId ?? (this.authDetailId || undefined)) // your value
      .pipe(
        map((res: any[]) =>
          (res || []).map(x => ({
            activity: x.activity ?? x.item1 ?? x.Item1,
            lines: x.lines ?? x.item2 ?? x.Item2
          }))
        )
      )
      .subscribe({
        next: (data: MdReviewActivityDto[]) => {
          this.activities = data;

          // 1) Build an index by Service Code
          this.rebuildMdStatusIndex();

          // 2) Enrich the existing serviceLines with mdrStatus
          this.enrichServiceLinesWithMdPerLineStatus();
        },
        error: err => console.error('Error fetching MD Review activities', err)
      });
  }

  private rebuildMdStatusIndex(): void {
    this.mdIndexByServiceCode.clear();

    for (const a of (this.activities ?? [])) {
      const act = a?.activity ?? {};
      const mdStatusCandidates = [
        act?.MDStatus, act?.MdStatus, act?.mdStatus,
        act?.MDAgg, act?.MDAggregate, act?.mdAgg,
        act?.status, act?.Status
      ].filter(x => x != null);

      const hasPending = mdStatusCandidates.some(this.isPendingLike.bind(this));
      const hasCompleted = mdStatusCandidates.some(this.isCompletedLike.bind(this));

      const lines = a?.lines ?? [];
      for (const ln of lines) {
        const code = this.getLineServiceCode(ln);
        if (!code) continue;

        const current = this.mdIndexByServiceCode.get(code) ?? {
          hasAnyActivity: false,
          hasPendingLike: false,
          hasCompletedLike: false
        };

        current.hasAnyActivity = true;
        current.hasPendingLike = current.hasPendingLike || hasPending;
        current.hasCompletedLike = current.hasCompletedLike || hasCompleted;

        // If the line-level itself carries status fields, merge them in
        const lnStatusCandidates = [
          (ln as any)?.MDStatus, (ln as any)?.Status, (ln as any)?.status
        ].filter(x => x != null);

        if (lnStatusCandidates.length) {
          current.hasPendingLike = current.hasPendingLike || lnStatusCandidates.some(this.isPendingLike.bind(this));
          current.hasCompletedLike = current.hasCompletedLike || lnStatusCandidates.some(this.isCompletedLike.bind(this));
        }

        this.mdIndexByServiceCode.set(code, current);
      }
    }
  }

  // Disable iff status is "in progress" (or pending)
  isMdInProgress(line: any): boolean {
    const status = (line?.mdrStatus ?? this.getMdStatus(line) ?? '').toString().toLowerCase();
    return status.includes('in progress') || status.includes('pending');
  }

  // How many lines can be selected right now
  private selectableLines(): any[] {
    return (this.displayLines || []).filter(l => !this.isMdInProgress(l));
  }

  // For header/bulk checkbox state
  noSelectableLines(): boolean {
    return this.selectableLines().length === 0;
  }
  isEverySelectableSelected(): boolean {
    const s = this.selectableLines();
    return s.length > 0 && s.every(l => !!l.selected);
  }
  isSomeSelectableSelected(): boolean {
    const s = this.selectableLines();
    return s.some(l => !!l.selected) && !this.isEverySelectableSelected();
  }

  // Respect disabled rows when bulk-toggling
  toggleAllSelection(evt: Event): void {
    const checked = (evt.target as HTMLInputElement).checked;
    for (const l of (this.displayLines || [])) {
      if (this.isMdInProgress(l)) continue; // don't touch locked rows
      l.selected = checked;
    }
  }



  private statusLabelForKey(
    codeKey: string | null,
    idKey: string | null
  ): MdReviewStatus {
    const byCode = codeKey ? this.mdByServiceCode.get(codeKey) : undefined;
    const byId = idKey ? this.mdByDecisionLineId.get(idKey) : undefined;
    const val = byCode ?? byId;
    if (val === 'completed') return 'MD Review completed';
    if (val === 'in-progress') return 'MD Review in progress';
    return 'Not requested';
  }

  private enrichServiceLinesWithMdPerLineStatus(): void {
    if (!Array.isArray(this.displayLines ?? this.serviceLines)) return;

    const source = (this.displayLines?.length ? this.displayLines : this.serviceLines) as any[];

    const enriched = source.map(line => {
      const codeKey = this.getLineServiceCode(line);
      const idKey = this.getLineDecisionLineId(line);
      const mdrStatus = this.statusLabelForKey(codeKey, idKey);
      return { ...line, mdrStatus };
    });

    // Write back to the collection you bind in the template (displayLines)
    this.displayLines = enriched;

    this.displayLines = (source || []).map(line => {
      const codeKey = this.getLineServiceCode(line);
      const idKey = this.getLineDecisionLineId(line);
      const mdrStatus = this.statusLabelForKey(codeKey, idKey); // 'MD Review in progress' | 'completed' | 'Not requested'
      const locked = /in progress|pending/i.test(mdrStatus);
      return {
        ...line,
        mdrStatus,
        selected: locked ? false : !!line.selected
      };
    });
  }



  // --- Normalizers ---
  private normalizeCode(val: any): string {
    return (val ?? '').toString().trim().toUpperCase();
  }
  private getLineServiceCode(obj: any): string | null {
    const code =
      obj?.serviceCode ?? obj?.ServiceCode ?? obj?.code ?? obj?.CPT ?? null;
    return code ? this.normalizeCode(code) : null;
  }
  private getLineDecisionLineId(obj: any): string | null {
    const id = obj?.decisionLineId ?? obj?.DecisionLineId ?? null;
    return (id ?? null) !== null ? String(id) : null;
  }

  // --- Status classifiers: keep them tight and line-focused ---
  private isPendingLike(val: any): boolean {
    const s = (val ?? '').toString().toLowerCase();
    return ['pending', 'in progress', 'requested', 'notreviewed', 'not reviewed', 'open']
      .some(k => s.includes(k));
  }
  private isCompletedLike(val: any): boolean {
    const s = (val ?? '').toString().toLowerCase();
    return ['complete', 'completed', 'closed', 'final', 'approved', 'denied', 'void']
      .some(k => s.includes(k));
  }


  private toDisplayMdStatus(entry?: { hasAnyActivity: boolean; hasPendingLike: boolean; hasCompletedLike: boolean }): MdReviewStatus {
    if (!entry || !entry.hasAnyActivity) return 'Not requested';
    if (entry.hasPendingLike) return 'MD Review in progress';
    if (entry.hasCompletedLike) return 'MD Review completed';
    return 'MD Review in progress';
  }



  private findInputLineByCode(code: string): MdReviewLineVM | undefined {
    return (this.serviceLines as any[] || []).find(sl => this.getLineServiceCode(sl) === code);
  }

  private mapInputLinesWithStatus(): MdReviewLineVM[] {
    this.rebuildMdStatusIndex(); // safe even if activities empty
    return (this.serviceLines || []).map(sl => {
      const code = this.getLineServiceCode(sl);
      const mdr = this.toDisplayMdStatus(code ? this.mdIndexByServiceCode.get(code) : undefined);
      return { ...(sl as any), mdrStatus: mdr, selected: (sl as any).selected ?? false };
    });
  }

  /** MAIN: sets `displayLines` from activities if available; else from input. */
  private buildDisplayLines(): void {
    const hasActivityLines =
      Array.isArray(this.activities) &&
      this.activities.some(a => Array.isArray(a?.lines) && a.lines.length);

    if (hasActivityLines) {
      this.rebuildMdStatusIndex();

      const fromActivities: MdReviewLineVM[] = [];
      const seen = new Set<string>();

      for (const a of this.activities) {
        for (const ln of (a.lines || [])) {
          const code = this.getLineServiceCode(ln);
          if (!code) continue;
          if (seen.has(code)) continue; // dedupe by Service Code (adjust if you need per-line duplicates)
          seen.add(code);

          const base = this.findInputLineByCode(code);
          const mdr = this.toDisplayMdStatus(this.mdIndexByServiceCode.get(code));

          fromActivities.push({
            ...(base ?? {}) as any,     // keep your original fields if they exist
            ...(ln as any),             // overlay activity line fields
            mdrStatus: mdr,
            selected: base?.selected ?? false
          });
        }
      }

      this.displayLines = fromActivities.length ? fromActivities : this.mapInputLinesWithStatus();
    } else {
      this.displayLines = this.mapInputLinesWithStatus();
    }
  }




  // Maps for quick lookup; use whichever key you prefer (ServiceCode or DecisionLineId)
  private mdByServiceCode = new Map<string, 'in-progress' | 'completed'>();
  private mdByDecisionLineId = new Map<string, 'in-progress' | 'completed'>();

  private rebuildMdPerLineIndex(): void {
    this.mdByServiceCode.clear();
    this.mdByDecisionLineId.clear();

    for (const a of (this.activities ?? [])) {
      // Optional: activity-level hint (used only when line has no own status)
      const actPendingHint =
        this.isPendingLike(a?.activity?.MdReviewStatus) ||
        this.isPendingLike(a?.activity?.MdAggregateDecision);

      for (const ln of (a?.lines ?? [])) {
        const code = this.getLineServiceCode(ln);
        const dlnId = this.getLineDecisionLineId(ln);

        // Decide line status
        const lineCompleted =
          this.isCompletedLike((ln as any)?.MdDecision) ||
          this.isCompletedLike((ln as any)?.Status);

        const linePending =
          this.isPendingLike((ln as any)?.Status) ||
          this.isPendingLike((ln as any)?.MdDecision) ||
          actPendingHint;

        // update function: promote to completed if seen; otherwise in-progress
        const apply = (key: string | null, map: Map<string, 'in-progress' | 'completed'>) => {
          if (!key) return;
          const curr = map.get(key);
          if (lineCompleted) {
            map.set(key, 'completed');
          } else if (linePending && curr !== 'completed') {
            map.set(key, 'in-progress');
          }
        };

        apply(code, this.mdByServiceCode);
        apply(dlnId, this.mdByDecisionLineId);
      }
    }
  }





  ///********Load Activities**********///
}
