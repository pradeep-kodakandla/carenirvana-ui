import { Component, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject, of, forkJoin } from 'rxjs';
import { catchError, takeUntil } from 'rxjs/operators';

import { CrudService } from 'src/app/service/crud.service';
import { AuthenticateService } from 'src/app/service/authentication.service';
import { AuthService } from 'src/app/service/auth.service';
import { AuthDetailApiService } from 'src/app/service/authdetailapi.service';

import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';
import { AuthunsavedchangesawareService } from 'src/app/member/UM/services/authunsavedchangesaware.service';

type AssignmentType = 'Specific Medical Director' | 'Work Basket';

export interface MdReviewLineCreate {
  decisionLineId?: number | null;
  serviceCode: string;
  serviceDescription: string;
  modifier?: string;
  unitType?: string;
  fromDate?: string | null;
  toDate?: string | null;
  requested?: number | null;
  approved?: number | null;
  denied?: number | null;
  initialRecommendation?: string;
  selected?: boolean;

  currentStatus?: string | null;
  mdReviewStatus?: string | null;
}

export interface MdReviewActivityLine {
  lineId: number;              // authActivityLineId
  decisionLineId?: number | null;
  serviceCode: string;
  serviceDescription: string;
  modifier?: string;
  unitType?: string;
  fromDate?: string | null;
  toDate?: string | null;

  requested?: number | null;
  approved?: number | null;
  denied?: number | null;

  initialRecommendation?: string;

  mdDecision?: string | null;
  mdNotes?: string | null;
  status?: string | null;      // Pending/InProgress/Completed (recommended)
  version?: number | null;     // optimistic concurrency
  isDirty?: boolean;           // UI-only
  isSaving?: boolean;          // UI-only
  saveError?: string | null;   // UI-only
  selected?: boolean;         // UI-only selection

  currentStatus?: string | null;
  mdReviewStatus?: string | null;
}

export interface MdReviewActivitySummary {
  activityId: number;
  activityType?: string | null;
  priority?: string | number | null;
  recommendation?: string | null;
  mdReviewStatus?: string | null;
  mdAggregateDecision?: string | null;
  serviceLineCount?: number | null;

  createdOn?: string | null;
  dueDateTime?: string | null;
  scheduledDateTime?: string | null;

  assignedToUserId?: number | null;
  assignedToName?: string | null;

  notes?: string | null;
  status?: string | null; // parent status if you store it
}

export interface MdReviewActivityDetail extends MdReviewActivitySummary {
  lines: MdReviewActivityLine[];
}

@Component({
  selector: 'app-authmdreview',
  templateUrl: './authmdreview.component.html',
  styleUrls: ['./authmdreview.component.css']
})
export class AuthmdreviewComponent implements OnDestroy, AuthunsavedchangesawareService {
  private destroy$ = new Subject<void>();

  // Wizard context
  authDetailId: number | null = null;

  // UI state
  isLoadingActivities = false;
  isLoadingDetail = false;
  viewMode: 'create' | 'review' = 'create';

  // left list
  activities: MdReviewActivitySummary[] = [];
  filteredActivities: MdReviewActivitySummary[] = [];
  activitySearch = '';

  // Initial Recommendation (bulk)
  globalInitialRecommendation: string = '';

  // Review-mode overall controls
  overallInitialRecommendationReview: string = '';
  overallDecisionStatus: string = '';
  overallDecisionStatusCode: string = '';
  requestMoreInformation: boolean = false;


  // Decision notes (dashboard-like)
  mdNotesText: string = '';

  // Per-line MD Review status (derived from existing activities)
  private mdStatusByServiceCode: Record<string, string> = {};
  selectedActivityId: number | null = null;

  // right detail
  selectedActivity: MdReviewActivityDetail | null = null;

  // Create form (existing)
  mdrForm: FormGroup;

  // Create screen: service lines list
  serviceLines: MdReviewLineCreate[] = [];

  // dropdown options
  assignmentTypeOptions: UiSmartOption[] = [
    { value: 'Specific Medical Director', label: 'Specific Medical Director' },
    { value: 'Work Basket', label: 'Work Basket' }
  ];

  activityTypeOptions: UiSmartOption[] = [{ value: '', label: 'Select' }];
  priorityOptions: UiSmartOption[] = [
    { value: 1, label: '1 - High' },
    { value: 2, label: '2 - Medium' },
    { value: 3, label: '3 - Low' }
  ];

  // alias for older templates
  get priorities(): UiSmartOption[] { return this.priorityOptions; }


  userOptions: UiSmartOption[] = [{ value: '', label: 'Select' }];
  // Workbasket dropdowns (optional; safe defaults if API isn't wired yet)
  workBasketOptions: UiSmartOption[] = [{ value: '', label: 'Select' }];
  workBasketUserOptions: UiSmartOption[] = [{ value: '', label: 'Select' }];


  recommendationOptions: UiSmartOption[] = [
    { value: 'Approve', label: 'Approve' },
    { value: 'Deny', label: 'Deny' },
    { value: 'Pend', label: 'Pend' },
    { value: 'Partially Approve', label: 'Partially Approve' },
    { value: 'Void', label: 'Void' }
  ];

  mdDecisionOptions: UiSmartOption[] = [
    { value: 'NotReviewed', label: 'Not Reviewed' },
    { value: 'Approve', label: 'Approve' },
    { value: 'Deny', label: 'Deny' },
    { value: 'Pend', label: 'Pend' }
  ];

  // Loaded from UM: decisioncode & decisionstatuscode
  decisionStatusOptions: UiSmartOption[] = [{ value: '', label: 'Select' }];
  decisionStatusCodeOptions: UiSmartOption[] = [{ value: '', label: 'Select' }];
  private decisionStatusCodeRaw: any[] = [];


  lineStatusOptions: UiSmartOption[] = [
    { value: 'Pending', label: 'Pending' },
    { value: 'InProgress', label: 'In Progress' },
    { value: 'Completed', label: 'Completed' }
  ];

  // right side header edit form (for existing activities)
  detailHeaderForm: FormGroup;

  constructor(
    private router: Router,
    private fb: FormBuilder,
    private crudService: CrudService,
    private authenticateService: AuthenticateService,
    private activityService: AuthService,
    private authApi: AuthDetailApiService
  ) {
    // Create form (keep your existing fields)
    this.mdrForm = this.fb.group({
      assignmentType: ['Specific Medical Director' as AssignmentType, Validators.required],
      activityType: ['', Validators.required],
      priority: [2, Validators.required],
      assignTo: [null],

      workBasket: [null],
      workBasketUser: [null], dueDateTime: [null], notes: ['']
    });

    // Detail header form (edit existing activity header)
    this.detailHeaderForm = this.fb.group({
      dueDateTime: [null], notes: [''],
      status: ['']
    });

    // assignment type behavior
    this.mdrForm.get('assignmentType')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((v: AssignmentType) => this.applyAssignmentTypeSideEffects(v));
  }

  /** Wizard shell will call this if present */
  setContext(ctx: any): void {
    const id = Number(ctx?.authDetailId ?? ctx?.authdetailid ?? ctx?.authDetailID);
    this.authDetailId = Number.isFinite(id) ? id : null;

    // Try to build service lines from context JSON (fallback to API)
    const rawCandidate = ctx?.dataJson ?? ctx?.jsonData ?? ctx?.authJson ?? ctx?.authorizationJson;
    const parsedTop = this.safeParseJson(rawCandidate) ?? rawCandidate;
    const parsed =
      (parsedTop && typeof parsedTop === 'object')
        ? (this.safeParseJson(parsedTop.jsonData ?? parsedTop.dataJson) ?? parsedTop)
        : parsedTop;

    const fromCtxLines = this.buildServiceLinesFromAuthData(parsed);
    if (fromCtxLines?.length) {
      this.serviceLines = fromCtxLines.map(l => ({ ...l, selected: true }));
    } else if (this.authDetailId) {
      this.loadServiceLinesFromApi(this.authDetailId);
    }

    // load dropdowns + activities
    this.loadActivityTypes();
    this.loadUsers();
    this.loadDecisionDropdowns();
    this.loadMdReviewActivities();
    this.applyAssignmentTypeSideEffects(this.mdrForm.get('assignmentType')?.value);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ----------------------------
  // Activities: list + select
  // ----------------------------

  get hasActivities(): boolean {
    return (this.activities?.length ?? 0) > 0;
  }

  loadMdReviewActivities(): void {
    if (!this.authDetailId) {
      this.activities = [];
      this.filteredActivities = [];
      this.viewMode = 'create';
      return;
    }

    const svc: any = this.activityService as any;
    if (typeof svc.getMdReviewActivities !== 'function') {
      this.activities = [];
      this.filteredActivities = [];
      this.viewMode = 'create';
      return;
    }

    this.isLoadingActivities = true;

    svc.getMdReviewActivities(null, this.authDetailId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rows: any[]) => {
          console.log('Raw MD Review activities from API:', rows);

          const normalized = (rows ?? []).map((wrap: any) => {
            const act = wrap?.activity ?? wrap?.Activity ?? wrap; // ✅ unwrap
            const linesRaw = wrap?.lines ?? wrap?.Lines ?? act?.lines ?? act?.Lines ?? [];
            const lines = Array.isArray(linesRaw) ? linesRaw.map((x: any) => this.normalizeActivityLine(x)) : [];

            const summary = this.normalizeActivitySummary(act);

            // Helpful: show initial recommendation in list if backend doesn't send it on activity
            if (!summary.recommendation && lines.length) {
              summary.recommendation = lines[0]?.initialRecommendation ?? null;
            }

            // Helpful: keep lines on the summary so selecting doesn't require refetch
            (summary as any).lines = lines;

            return summary;
          });

          // newest first (createdOn)
          normalized.sort((a: any, b: any) => {
            const ad = a?.createdOn ? new Date(a.createdOn).getTime() : 0;
            const bd = b?.createdOn ? new Date(b.createdOn).getTime() : 0;
            return bd - ad;
          });

          this.activities = normalized;
          console.log('Loaded MD Review activities:', this.activities);

          this.prefetchMdStatusByServiceCode();
          this.applyActivityFilter();

          if (!this.activities.length) {
            this.viewMode = 'create';
            this.selectedActivityId = null;
            this.selectedActivity = null;
            this.isLoadingActivities = false;
            return;
          }

          this.viewMode = 'review';

          const keepSelected = this.activities.find(a => a.activityId === this.selectedActivityId);
          const toSelect = keepSelected ?? this.activities[0];
          this.onSelectActivity(toSelect);

          this.isLoadingActivities = false;
        },
        error: (err: any) => {
          console.error(err);
          this.isLoadingActivities = false;
          this.activities = [];
          this.filteredActivities = [];
          this.viewMode = 'create';
        }
      });
  }


  onQuickSearchActivities(v: string): void {
    this.activitySearch = v ?? '';
    this.applyActivityFilter();
  }

  private applyActivityFilter(): void {
    const q = (this.activitySearch ?? '').trim().toLowerCase();
    if (!q) {
      this.filteredActivities = [...(this.activities ?? [])];
      return;
    }

    this.filteredActivities = (this.activities ?? []).filter(a => {
      const blob = [
        a.activityType, a.recommendation, a.mdReviewStatus, a.mdAggregateDecision,
        a.assignedToName, a.notes, a.status
      ].filter(Boolean).join(' ').toLowerCase();

      return blob.includes(q) || String(a.activityId).includes(q);
    });
  }


  /** Cancel create and return to Auth Activity view */
  cancelCreate(): void {
    // Adjust the route if your app uses a different path for the activity view
    this.viewMode = 'review';
  }

  onCreateNewFromList(): void {
    this.viewMode = 'create';
    this.selectedActivityId = null;
    this.selectedActivity = null;

    // keep existing serviceLines loaded; default select all
    this.selectAllLines(true);
  }

  onSelectActivity(row: MdReviewActivitySummary): void {
    if (!row?.activityId) return;

    this.viewMode = 'review';
    this.selectedActivityId = row.activityId;

    // If row already contains lines, use them; else fetch detail
    const maybeLines = (row as any)?.lines ?? (row as any)?.serviceLines ?? (row as any)?.Lines ?? (row as any)?.ServiceLines;
    if (Array.isArray(maybeLines) && maybeLines.length) {
      this.selectedActivity = {
        ...row,
        lines: maybeLines.map((x: any) => this.normalizeActivityLine(x))
      };
      (this.selectedActivity.lines ?? []).forEach(l => (l.selected = false));
      this.mdNotesText = '';
      this.overallDecisionStatus = '';
      this.overallInitialRecommendationReview = '';

      this.patchDetailHeaderForm(this.selectedActivity);
      return;
    }

    this.fetchMdReviewActivityDetail(row.activityId);
  }

  private fetchMdReviewActivityDetail(activityId: number): void {
    if (!this.authDetailId) return;

    const svc: any = this.activityService as any;
    this.isLoadingDetail = true;

    // Preferred: same API supports (authDetailId, activityId)
    if (typeof svc.getMdReviewActivities === 'function' && svc.getMdReviewActivities.length >= 2) {
      svc.getMdReviewActivities(this.authDetailId, activityId)
        .pipe(takeUntil(this.destroy$), catchError(() => of([])))
        .subscribe((rows: any[]) => {
          this.isLoadingDetail = false;
          const first = (rows ?? [])[0];
          if (!first) {
            this.selectedActivity = null;
            return;
          }

          const wrap = this.safeParseJson(first) ?? first ?? {};
          const act = wrap?.activity ?? wrap?.Activity ?? wrap;
          const summary = this.normalizeActivitySummary(act);

          const linesRaw = wrap?.lines ?? wrap?.Lines ?? act?.lines ?? act?.Lines ?? wrap?.serviceLines ?? wrap?.ServiceLines ?? [];
          const lines = Array.isArray(linesRaw) ? linesRaw.map((x: any) => this.normalizeActivityLine(x)) : [];

          this.selectedActivity = {
            ...summary,
            lines
          };
          (this.selectedActivity.lines ?? []).forEach(l => (l.selected = false));
          this.mdNotesText = '';
          this.overallDecisionStatus = '';
          this.overallInitialRecommendationReview = '';


          // show initial recommendation in header list if missing
          if (!this.selectedActivity.recommendation && lines.length) {
            this.selectedActivity.recommendation = lines[0]?.initialRecommendation ?? null;
          }

          this.patchDetailHeaderForm(this.selectedActivity);
        });

      return;
    }

    // Alternate API name
    if (typeof svc.getMdReviewActivityDetail === 'function') {
      svc.getMdReviewActivityDetail(activityId)
        .pipe(takeUntil(this.destroy$), catchError(() => of(null)))
        .subscribe((res: any) => {
          this.isLoadingDetail = false;
          if (!res) {
            this.selectedActivity = null;
            return;
          }
          const summary = this.normalizeActivitySummary(res);
          const linesRaw = res?.lines ?? res?.serviceLines ?? [];
          this.selectedActivity = {
            ...summary,
            lines: Array.isArray(linesRaw) ? linesRaw.map((x: any) => this.normalizeActivityLine(x)) : []
          };
          (this.selectedActivity.lines ?? []).forEach(l => (l.selected = false));
          this.mdNotesText = '';
          this.overallDecisionStatus = '';
          this.overallInitialRecommendationReview = '';

          this.patchDetailHeaderForm(this.selectedActivity);
        });

      return;
    }

    this.isLoadingDetail = false;
    this.selectedActivity = null;
  }

  private patchDetailHeaderForm(a: MdReviewActivityDetail | null): void {
    if (!a) return;

    this.detailHeaderForm.patchValue({
      dueDateTime: a.dueDateTime ? new Date(a.dueDateTime) : null,
      scheduledDateTime: a.scheduledDateTime ? new Date(a.scheduledDateTime) : null,
      notes: a.notes ?? '',
      status: a.status ?? ''
    }, { emitEvent: false });
  }

  // ----------------------------
  // Create flow
  // ----------------------------

  submitCreate(): void {
    if (!this.authDetailId) {
      alert('AuthDetailId is missing in context.');
      return;
    }

    if (this.mdrForm.invalid) {
      this.mdrForm.markAllAsTouched();
      alert('Please fill all required fields.');
      return;
    }

    const selected = (this.serviceLines ?? []).filter(l => !!l.selected);
    if (!selected.length) {
      alert('Select at least one service line to create an MD Review activity.');
      return;
    }

    // NOTE: repository expects payload.Activity + payload.Lines (wrapper)
    // Create activity payload that matches AuthActivityRepository.CreateMdReviewActivityAsync
    const activityTypeId = this.numOrNull(this.mdrForm.value.activityType);
    const priorityId = this.numOrNull(this.mdrForm.value.priority);

    // "assignTo" maps to "referredTo" in DB insert (referredTo column)
    const referredTo = this.numOrNull(this.mdrForm.value.assignTo);

    // Workbasket flags: your UI has workBasket/workBasketUser. Repository insert uses isWorkBasket + queueId.
    const queueId = this.numOrNull(this.mdrForm.value.workBasket) ?? 0;
    const isWorkBasket = queueId > 0;

    const scheduledIso = this.toIsoUtcOrNull(this.mdrForm.value.scheduledDateTime);
    const dueIso = this.toIsoUtcOrNull(this.mdrForm.value.dueDateTime);

    // Try to get createdBy from session; fallback to referredTo; else 0
    const createdBy =
      this.numOrNull(sessionStorage.getItem('loggedInUserId')) ??
      referredTo ??
      0;

    const wrapperPayload = {
      activity: {
        authDetailId: this.authDetailId,
        activityTypeId: activityTypeId ?? 0,
        priorityId: priorityId ?? 0,

        referredTo: referredTo ?? 0,

        followUpDateTime: scheduledIso,  // maps to followUpDateTime 
        dueDate: dueIso,                 // maps to dueDate 

        comment: (this.mdrForm.value.notes ?? ''), // maps to comment 

        // Workbasket fields used by repository insert 
        isWorkBasket,
        queueId,

        // optional but safe
        activeFlag: true,
        createdOn: new Date().toISOString(),
        createdBy
      },

      // Repository expects Lines with description field 
      lines: selected.map(l => ({
        decisionLineId: this.numOrNull(l.decisionLineId) ?? 0,
        serviceCode: l.serviceCode ?? '',
        description: l.serviceDescription ?? '',
        fromDate: l.fromDate ?? null,
        toDate: l.toDate ?? null,
        requested: this.numOrNull(l.requested) ?? 0,
        approved: this.numOrNull(l.approved) ?? 0,
        denied: this.numOrNull(l.denied) ?? 0,
        initialRecommendation: l.initialRecommendation ?? ''
      })),

      // Repository inserts payload_snapshot_json jsonb 
      payloadSnapshotJson: null
    };

    console.log('Creating MD Review activity with payload:', wrapperPayload);

    const svc: any = this.activityService as any;
    if (typeof svc.createMdReviewActivity !== 'function') {
      alert('createMdReviewActivity API is not available in AuthService.');
      return;
    }

    svc.createMdReviewActivity(wrapperPayload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.loadMdReviewActivities(); // make sure loadMdReviewActivities is NOT private
        },
        error: (err: any) => {
          console.error(err);
          // backend returns: "Payload or Activity cannot be null." if shape is wrong
          alert(err?.error ?? 'Failed to save MD Review activity.');
        }
      });
  }


  selectAllLines(v: boolean): void {
    (this.serviceLines ?? []).forEach(l => l.selected = v);
  }

  // ----------------------------
  // Update flow (existing activity)
  // ----------------------------

  onHeaderChanged(): void {
    if (!this.selectedActivity) return;
    // purely marks UI; actual save is button below
  }

  saveHeader(): void {
    if (!this.selectedActivity) return;

    const svc: any = this.activityService as any;
    if (typeof svc.updateMdReviewActivity !== 'function') {
      // If you don’t have parent update yet, keep header edits local
      // and guide user to implement endpoint.
      alert('updateMdReviewActivity API not found. Implement it to save header edits (recommendation, due date, notes, etc.).');
      return;
    }

    const v = this.detailHeaderForm.value;

    const payload = {
      activityId: this.selectedActivity.activityId,
      recommendation: v.recommendation ?? null,
      dueDateTime: this.toIsoUtcOrNull(v.dueDateTime),
      scheduledDateTime: this.toIsoUtcOrNull(v.scheduledDateTime),
      notes: v.notes ?? '',
      status: v.status ?? null
    };

    svc.updateMdReviewActivity(this.selectedActivity.activityId, payload)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // refresh list summary (badges on left)
          this.loadMdReviewActivities();
        },
        error: (err: any) => {
          console.error(err);
          alert('Failed to update MD Review header.');
        }
      });
  }

  markLineDirty(line: MdReviewActivityLine): void {
    line.isDirty = true;
    line.saveError = null;
  }

  saveLine(line: MdReviewActivityLine): void {
    if (!this.selectedActivity) return;

    const activityId = this.selectedActivity.activityId;
    const lineId = line.lineId;

    const svc: any = this.activityService as any;

    // Preferred: per-line update with optimistic concurrency
    if (typeof svc.updateMdReviewLine === 'function') {
      line.isSaving = true;
      line.saveError = null;

      const payload = {
        mdDecision: line.mdDecision ?? null,
        status: line.status ?? null,
        mdNotes: line.mdNotes ?? '',
        expectedVersion: line.version ?? null
      };

      svc.updateMdReviewLine(activityId, lineId, payload)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (res: any) => {
            // If API returns updated version, apply; else increment locally
            const newVersion = Number(res?.version ?? res?.Version);
            line.version = Number.isFinite(newVersion) ? newVersion : ((line.version ?? 0) + 1);

            line.isDirty = false;
            line.isSaving = false;

            // Refresh left badges/rollups
            this.loadMdReviewActivities();
          },
          error: (err: any) => {
            console.error(err);
            line.isSaving = false;
            line.saveError = this.isConflict(err)
              ? 'This line was updated by someone else. Refresh and try again.'
              : 'Failed to save line.';
          }
        });

      return;
    }

    // Fallback: bulk update style (dashboard-like)
    if (typeof svc.updateActivityLines === 'function') {
      const payload = {
        lineIds: [lineId],
        status: line.status ?? null,
        mdDecision: line.mdDecision ?? null,
        mdNotes: line.mdNotes ?? ''
      };

      line.isSaving = true;
      svc.updateActivityLines(payload)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            line.isDirty = false;
            line.isSaving = false;
            this.loadMdReviewActivities();
            this.fetchMdReviewActivityDetail(activityId);
          },
          error: (err: any) => {
            console.error(err);
            line.isSaving = false;
            line.saveError = 'Failed to save line (bulk API).';
          }
        });

      return;
    }

    alert('No update API found. Add updateMdReviewLine(activityId, lineId, payload) in AuthService.');
  }

  saveAllDirtyLines(): void {
    if (!this.selectedActivity) return;
    const dirty = (this.selectedActivity.lines ?? []).filter(l => !!l.isDirty && !l.isSaving);
    if (!dirty.length) return;
    dirty.forEach(l => this.saveLine(l));
  }




  // ----------------------------
  // Selection helpers (Review mode)
  // ----------------------------
  get hasSelectedLines(): boolean {
    return !!this.selectedActivity && (this.selectedActivity.lines ?? []).some(l => !!l.selected);
  }

  hasSelectedReviewLines(): boolean {
    return !!this.selectedActivity && (this.selectedActivity.lines ?? []).some(l => !!l.selected);
  }



  private getSelectedLines(): MdReviewActivityLine[] {
    if (!this.selectedActivity) return [];
    return (this.selectedActivity.lines ?? []).filter(l => !!l.selected);
  }

  toggleSelectAllReviewLines(checked: boolean): void {
    if (!this.selectedActivity) return;
    (this.selectedActivity.lines ?? []).forEach(l => {
      l.selected = checked;
    });
  }

  onToggleReviewLine(l: MdReviewActivityLine, checked: boolean): void {
    l.selected = checked;
  }

  // Apply Overall Initial Recommendation to selected lines
  applyOverallInitialRecommendationToSelected(): void {
    if (!this.selectedActivity) return;
    const rec = (this.overallInitialRecommendationReview ?? '').trim();
    if (!rec) return;

    const lines = this.getSelectedLines();
    if (!lines.length) {
      alert('Select at least one service line.');
      return;
    }

    lines.forEach(l => {
      l.initialRecommendation = rec;
      this.markLineDirty(l);
    });
  }

  // Apply overall MD decision/status/notes to selected lines

  private saveSelectedDirtyLines(): void {
    if (!this.selectedActivity) return;
    const selectedDirty = this.getSelectedLines().filter(l => !!l.isDirty && !l.isSaving);
    if (!selectedDirty.length) return;
    selectedDirty.forEach(l => this.saveLine(l));
  }

  // ----------------------------
  // Dashboard-like actions: Accept / Reject / Save & Continue
  // ----------------------------


  submitDecision(): void {
    if (!this.selectedActivity) return;

    const lines = this.getSelectedLines();
    if (!lines.length) {
      alert('Select at least one service line.');
      return;
    }

    const statusLabel =
      this.getOptionLabel(this.decisionStatusOptions, this.overallDecisionStatus) ||
      String(this.overallDecisionStatus ?? '');
    if (!statusLabel || statusLabel === 'Select') {
      alert('Select Decision Status.');
      return;
    }

    const codeLabel =
      this.getOptionLabel(this.decisionStatusCodeOptions, this.overallDecisionStatusCode) ||
      String(this.overallDecisionStatusCode ?? '');

    const note = (this.mdNotesText ?? '').trim();
    const reqMore = !!this.requestMoreInformation;

    const composedNotes = [
      codeLabel ? `Decision Status Code: ${codeLabel}` : '',
      reqMore ? 'Request more information' : '',
      note ? note : ''
    ].filter(Boolean).join(', ');

    lines.forEach(l => {
      // Completed submit
      l.mdDecision = statusLabel;
      l.status = 'Completed';
      if (composedNotes) {
        l.mdNotes = composedNotes;
      }
      this.markLineDirty(l);
    });

    this.saveSelectedDirtyLines();
  }

  approveRequest(): void {
    if (!this.selectedActivity) return;

    const lines = this.getSelectedLines();
    if (!lines.length) {
      alert('Select at least one service line.');
      return;
    }

    const note = (this.mdNotesText ?? '').trim();

    lines.forEach(l => {
      l.mdDecision = 'Approve';
      l.status = 'Completed';
      if (note) l.mdNotes = note;
      this.markLineDirty(l);
    });

    this.saveSelectedDirtyLines();
  }

  denyRequest(): void {
    if (!this.selectedActivity) return;

    const lines = this.getSelectedLines();
    if (!lines.length) {
      alert('Select at least one service line.');
      return;
    }

    const note = (this.mdNotesText ?? '').trim();

    lines.forEach(l => {
      l.mdDecision = 'Deny';
      l.status = 'Completed';
      if (note) l.mdNotes = note;
      this.markLineDirty(l);
    });

    this.saveSelectedDirtyLines();
  }

  saveAndContinue(): void {
    if (!this.selectedActivity) return;

    const selectedLines = (this.selectedActivity.lines ?? []).filter(l => !!(l as any).selected);
    if (!selectedLines.length) {
      alert('Select at least one service line.');
      return;
    }

    const statusLabel =
      this.getOptionLabel(this.decisionStatusOptions, this.overallDecisionStatus) ||
      String(this.overallDecisionStatus ?? '');

    const codeLabel =
      this.getOptionLabel(this.decisionStatusCodeOptions, this.overallDecisionStatusCode) ||
      String(this.overallDecisionStatusCode ?? '');

    const note = (this.mdNotesText ?? '').trim();
    const reqMore = !!this.requestMoreInformation;

    const composedNotes = [
      codeLabel ? `Decision Status Code: ${codeLabel}` : '',
      reqMore ? 'Request more information' : '',
      note ? note : ''
    ].filter(Boolean).join(', ');

    selectedLines.forEach(l => {
      if ((l.status ?? '') === 'Completed') return;
      if (statusLabel && statusLabel !== 'Select') {
        l.mdDecision = statusLabel;
        l.status = 'InProgress';
        if (composedNotes) {
          l.mdNotes = composedNotes;
        }
        this.markLineDirty(l);
      }
    });

    this.saveSelectedDirtyLines();
  }

  closeReview(): void {
    this.selectedActivityId = null;
    this.selectedActivity = null;
    this.mdNotesText = '';
    this.overallDecisionStatus = '';
    this.overallInitialRecommendationReview = '';
    this.viewMode = this.hasActivities ? 'review' : 'create';
  }

  refreshSelected(): void {
    if (!this.selectedActivityId) return;
    this.fetchMdReviewActivityDetail(this.selectedActivityId);
    this.loadMdReviewActivities();
  }

  // ----------------------------
  // dropdown loading
  // ----------------------------

  private loadActivityTypes(): void {
    this.crudService.getData('um', 'activitytype')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: any[]) => {
        const options = (data ?? []).map(item => ({
          value: item.code ?? item.value ?? item.id,
          label: item.label ?? item.activityType ?? item.display ?? item.name ?? String(item.code ?? item.id ?? '')
        })) as UiSmartOption[];

        this.activityTypeOptions = [{ value: '', label: 'Select' }, ...options];
      });
  }

  private loadUsers(): void {
    this.authenticateService.getAllUsers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (users: any[]) => {
          const opts = (users ?? []).map(u => ({
            value: u.UserId ?? u.userId ?? u.id,
            label: u.UserName ?? u.userName ?? u.name
          })) as UiSmartOption[];

          this.userOptions = [{ value: '', label: 'Select' }, ...opts];

          const loggedInUsername = sessionStorage.getItem('loggedInUsername');
          const match = this.userOptions.find(o => o.label === loggedInUsername);
          if (match && match.value !== '') {
            this.mdrForm.get('assignTo')?.setValue(match.value);
          }
        },
        error: () => {
          this.userOptions = [{ value: '', label: 'Select' }];
        }
      });
  }

  private applyAssignmentTypeSideEffects(v: AssignmentType): void {
    if (v === 'Work Basket') {
      this.mdrForm.get('workBasket')?.setValidators([Validators.required]);
      this.mdrForm.get('workBasketUser')?.setValidators([Validators.required]);
      this.mdrForm.get('assignTo')?.clearValidators();
      this.mdrForm.get('assignTo')?.setValue(null);
    } else {
      this.mdrForm.get('workBasket')?.clearValidators();
      this.mdrForm.get('workBasketUser')?.clearValidators();
      this.mdrForm.get('workBasket')?.setValue(null);
      this.mdrForm.get('workBasketUser')?.setValue(null);

      // assignTo optional but encouraged
      this.mdrForm.get('assignTo')?.clearValidators();
    }

    this.mdrForm.get('workBasket')?.updateValueAndValidity({ emitEvent: false });
    this.mdrForm.get('workBasketUser')?.updateValueAndValidity({ emitEvent: false });
    this.mdrForm.get('assignTo')?.updateValueAndValidity({ emitEvent: false });
  }

  private loadDecisionDropdowns(): void {
    forkJoin({
      // per your requirement (decision status list)
      status: this.crudService.getData('um', 'decisionstatus').pipe(catchError(() => of(null))),
      // decision status code list
      statusCode: this.crudService.getData('um', 'decisionstatuscode').pipe(catchError(() => of(null)))
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          console.log('Raw decision status/code data:', res);

          const unwrapArray = (r: any, preferredKey: string): any[] => {
            if (!r) return [];
            if (Array.isArray(r)) return r;

            // common wrappers
            const k1 = r?.[preferredKey];
            if (Array.isArray(k1)) return k1;

            const k2 = r?.data;
            if (Array.isArray(k2)) return k2;

            const k3 = r?.result;
            if (Array.isArray(k3)) return k3;

            const k4 = r?.items;
            if (Array.isArray(k4)) return k4;

            return [];
          };

          // status endpoint returns { status: [...] }
          const statusArr = unwrapArray(res?.status, 'status');

          // statusCode endpoint returns { statusCode: [...] }
          const codeArr = unwrapArray(res?.statusCode, 'statusCode');

          const mapStatus = (x: any): UiSmartOption => {
            const value =
              x?.id ?? x?.Id ??
              x?.decisionStatusId ?? x?.DecisionStatusId ??
              x?.value ?? x?.Value ?? '';

            const label =
              x?.decisionStatus ?? x?.DecisionStatus ??
              x?.decisionCode ?? x?.DecisionCode ??
              x?.name ?? x?.Name ??
              x?.label ?? x?.Label ??
              String(value ?? '');

            return { value: String(value ?? ''), label: String(label ?? '') } as UiSmartOption;
          };

          const mapCode = (x: any): UiSmartOption => {
            const value =
              x?.id ?? x?.Id ??
              x?.value ?? x?.Value ??
              x?.decisionStatusCode ?? x?.DecisionStatusCode ?? '';

            // show code text (optionally include name if you want)
            const label =
              x?.decisionStatusCode ?? x?.DecisionStatusCode ??
              x?.decisionStatusName ?? x?.DecisionStatusName ??
              x?.name ?? x?.Name ??
              x?.label ?? x?.Label ??
              String(value ?? '');

            return { value: String(value ?? ''), label: String(label ?? '') } as UiSmartOption;
          };

          this.decisionStatusOptions = [
            { value: '', label: 'Select' },
            ...(statusArr ?? []).map(mapStatus)
          ];

          // keep raw for filtering by decisionStatusId
          this.decisionStatusCodeRaw = (codeArr ?? []).slice();

          // default: show all codes, then filter when status is selected
          this.decisionStatusCodeOptions = [
            { value: '', label: 'Select' },
            ...(this.decisionStatusCodeRaw ?? []).map(mapCode)
          ];

          // If status is already chosen, filter codes immediately
          if (this.overallDecisionStatus) {
            this.onDecisionStatusChanged();
          }
        },
        error: () => {
          this.decisionStatusOptions = [{ value: '', label: 'Select' }];
          this.decisionStatusCodeOptions = [{ value: '', label: 'Select' }];
          this.decisionStatusCodeRaw = [];
        }
      });
  }


  onDecisionStatusChanged(): void {
    const selectedStatusId = String(this.overallDecisionStatus ?? '');

    const filtered = (this.decisionStatusCodeRaw ?? []).filter((x: any) => {
      const sid = String(x?.decisionStatusId ?? x?.DecisionStatusId ?? '');
      return !!selectedStatusId && sid === selectedStatusId;
    });

    const mapCode = (x: any): UiSmartOption => {
      const value = x?.id ?? x?.Id ?? x?.decisionStatusCode ?? x?.DecisionStatusCode ?? '';
      const label = x?.decisionStatusCode ?? x?.DecisionStatusCode ?? x?.decisionStatusName ?? x?.DecisionStatusName ?? String(value ?? '');
      return { value: String(value ?? ''), label: String(label ?? '') } as UiSmartOption;
    };

    this.decisionStatusCodeOptions = [
      { value: '', label: 'Select' },
      ...(filtered ?? []).map(mapCode)
    ];

    // if current selected code doesn't belong to new status, reset it
    const exists = this.decisionStatusCodeOptions.some(o => String(o.value) === String(this.overallDecisionStatusCode ?? ''));
    if (!exists) {
      this.overallDecisionStatusCode = '';
    }
  }


  private getOptionLabel(options: UiSmartOption[], value: any): string {
    const v = String(value ?? '');
    const match = (options ?? []).find(o => String(o.value) === v);
    return match?.label ?? '';
  }


  // ----------------------------
  // Service lines
  // ----------------------------

  private loadServiceLinesFromApi(authDetailId: number): void {
    if (!authDetailId) return;

    this.authApi.getById(authDetailId)
      .pipe(takeUntil(this.destroy$), catchError(() => of(null)))
      .subscribe((raw: any) => {
        if (!raw) return;

        const parsed = this.safeParseJson(raw?.jsonData ?? raw?.dataJson) ?? raw;
        const normalized = this.safeParseJson(parsed?.jsonData ?? parsed?.dataJson) ?? parsed;

        const lines = this.buildServiceLinesFromAuthData(normalized);
        this.serviceLines = (lines ?? []).map(l => ({ ...l, selected: true }));
      });
  }


  applyGlobalRecommendation(): void {
    const rec = (this.globalInitialRecommendation ?? '').trim();
    if (!rec) return;

    (this.serviceLines ?? []).forEach(l => {
      if (!!l.selected && !this.isMdInProgress(l)) {
        l.initialRecommendation = rec;
      }
    });
  }


  getActivityInitialRecommendation(): string {
    const lines = (this.selectedActivity?.lines ?? []);
    const vals = Array.from(new Set(lines.map(l => (l.initialRecommendation ?? '').trim()).filter(v => !!v)));
    if (!vals.length) return '';
    if (vals.length === 1) return vals[0];
    return vals[0];
  }

  getMdStatusForLine(line: { serviceCode?: string } | null | undefined): string {
    const code = (line?.serviceCode ?? '').trim();
    if (!code) return 'Not Requested';
    return this.mdStatusByServiceCode[code] ?? 'Not Requested';
  }

  mdStatusClass(status: string | null | undefined): string {
    const s = (status ?? '').toLowerCase();
    if (s.includes('in progress')) return 'badge-warn';
    if (s.includes('complete')) return 'badge';
    return 'badge';
  }

  isMdInProgress(line: { serviceCode?: string } | null | undefined): boolean {
    const s = this.getMdStatusForLine(line).toLowerCase();
    return s.includes('in progress');
  }

  private prefetchMdStatusByServiceCode(): void {
    // Build an index { serviceCode -> status } based on all activities' line matches
    const svc: any = this.activityService as any;
    if (!this.activities?.length) {
      this.mdStatusByServiceCode = {};
      return;
    }
    if (typeof svc.getMdReviewActivityDetail !== 'function') {
      this.mdStatusByServiceCode = {};
      return;
    }

    // Only fetch when we need to render statuses on create screen
    const ids = (this.activities ?? []).map(a => a.activityId).filter(Boolean) as number[];
    if (!ids.length) {
      this.mdStatusByServiceCode = {};
      return;
    }

    const calls = ids.map(id =>
      svc.getMdReviewActivityDetail(id).pipe(catchError(() => of(null)))
    );

    forkJoin(calls)
      .pipe(takeUntil(this.destroy$))
      .subscribe((results: any[]) => {
        const map: Record<string, string> = {};

        for (const res of (results ?? [])) {
          if (!res) continue;

          const activity = res.Activity ?? res.activity ?? res;
          const activityStatus = activity?.MdReviewStatus ?? activity?.mdReviewStatus ?? activity?.Status ?? activity?.status ?? '';

          const lines = res.Lines ?? res.lines ?? activity?.Lines ?? activity?.lines ?? [];
          for (const ln of (lines ?? [])) {
            const code = String(ln.ServiceCode ?? ln.serviceCode ?? '').trim();
            if (!code) continue;

            // Prefer activity status when available
            let st = String(activityStatus ?? '').trim();

            // If no activity status, fall back to line flags
            if (!st) {
              const s2 = String(ln.MdReviewStatus ?? ln.mdReviewStatus ?? ln.Status ?? ln.status ?? '').trim();
              st = s2;
            }

            if (!st) st = 'MD Review in progress';
            // Do not overwrite completed with in-progress
            const existing = (map[code] ?? '').toLowerCase();
            const incoming = st.toLowerCase();
            if (existing.includes('complete')) continue;
            map[code] = st;
          }
        }

        this.mdStatusByServiceCode = map;
      });
  }

  private buildServiceLinesFromAuthData(parsed: any): MdReviewLineCreate[] {
    if (!parsed || typeof parsed !== 'object') return [];

    // Helper: safely turn primitives OR {code/label/value/...} objects into display strings
    const asText = (v: any): string => {
      if (v == null) return '';
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v).trim();

      if (typeof v === 'object') {
        // common dropdown / code objects in your payload
        const picked =
          v.code ??
          v.Code ??
          v.label ??
          v.Label ??
          v.value ??
          v.Value ??
          v.name ??
          v.Name ??
          v.codeShortDesc ??
          v.codeDesc ??
          v.description ??
          v.Description ??
          '';

        return String(picked ?? '').trim();
      }

      return String(v).trim();
    };

    const asNum = (v: any): number | null => {
      if (v == null) return null;

      // numbers often come as strings ("10")
      if (typeof v === 'string') {
        const t = v.trim();
        if (!t) return null;
        const n = Number(t);
        return Number.isFinite(n) ? n : null;
      }

      if (typeof v === 'number') {
        return Number.isFinite(v) ? v : null;
      }

      // sometimes numeric values are stored inside objects
      if (typeof v === 'object') {
        const inner = v.value ?? v.Value ?? v.id ?? v.Id ?? null;
        const n = Number(inner);
        return Number.isFinite(n) ? n : null;
      }

      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    // 1) Prefer Decision Details saved for the authorization (Decision step)
    const ddArr =
      parsed?.decisionDetails ??
      parsed?.DecisionDetails ??
      parsed?.decisionDetail ??
      parsed?.DecisionDetail ??
      [];

    const pickStr = (obj: any, keys: string[]): string => {
      for (const k of keys) {
        const s = asText(obj?.[k]);
        if (s) return s;
      }
      return '';
    };

    const pickNum = (obj: any, keys: string[]): number | null => {
      for (const k of keys) {
        const n = asNum(obj?.[k]);
        if (n !== null) return n;
      }
      return null;
    };

    if (Array.isArray(ddArr) && ddArr.length) {
      const mapped = ddArr.map((row: any, idx: number) => {
        const rawData = row?.data ?? row?.jsonData ?? row?.payload ?? row?.itemData ?? row;
        const data = this.safeParseJson(rawData) ?? rawData ?? {};

        const procedureNo = asNum(
          row?.procedureNo ??
          row?.procedureIndex ??
          data?.procedureNo ??
          data?.procedureIndex ??
          data?.serviceIndex ??
          data?.serviceNo
        );

        const decisionLineId =
          asNum(
            row?.itemId ??
            row?.id ??
            row?.decisionItemId ??
            row?.DecisionItemId ??
            data?.decisionLineId ??
            data?.DecisionLineId
          ) ??
          procedureNo ??
          (idx + 1);

        // IMPORTANT: also handle object-valued codes (like procedureCode object)
        const serviceCode = pickStr(data, [
          'serviceCode', 'ServiceCode',
          'procedureCode', 'ProcedureCode',
          'procedure1_procedureCode', // (rare) if flattened
          'code'
        ]);

        // Your decision data may store procedure code object in this shape too:
        // { code: 'A0080', ... }
        // So pickStr will extract `.code` via asText()

        const serviceDescription = pickStr(data, [
          'serviceDescription', 'ServiceDescription',
          'procedureDescription', 'ProcedureDescription',
          'description'
        ]);

        const fromDate =
          data?.fromDate ??
          data?.FromDate ??
          data?.serviceFromDate ??
          data?.ServiceFromDate ??
          data?.procedureFromDate ??
          data?.procedure1_fromDate ??
          null;

        const toDate =
          data?.toDate ??
          data?.ToDate ??
          data?.serviceToDate ??
          data?.ServiceToDate ??
          data?.procedureToDate ??
          data?.procedure1_toDate ??
          null;

        const requested = pickNum(data, [
          'serviceReq', 'serviceRequested', 'requested', 'Requested', 'unitsRequested', 'UnitsRequested',
          'procedure1_serviceReq'
        ]);

        const approved = pickNum(data, [
          'serviceAppr', 'serviceApproved', 'approved', 'Approved', 'unitsApproved', 'UnitsApproved',
          'procedure1_serviceAppr'
        ]);

        const denied = pickNum(data, [
          'serviceDenied', 'denied', 'Denied', 'unitsDenied', 'UnitsDenied',
          'procedure1_serviceDenied'
        ]);

        return {
          decisionLineId,
          serviceCode,
          serviceDescription,
          modifier: pickStr(data, ['modifier', 'Modifier', 'procedure1_modifier']),
          unitType: pickStr(data, ['unitType', 'UnitType', 'procedure1_unitType']),
          fromDate,
          toDate,
          requested,
          approved,
          denied,
          initialRecommendation: pickStr(data, [
            'decisionStatus', 'decisionStatusName', 'DecisionStatus', 'DecisionStatusName',
            'initialRecommendation', 'InitialRecommendation'
          ]),
          currentStatus: pickStr(data, ['currentStatus', 'CurrentStatus', 'decisionStatusName', 'DecisionStatusName', 'decisionStatus', 'DecisionStatus']),
          mdReviewStatus: this.getMdStatusForLine({ serviceCode } as any),
          selected: true
        } as MdReviewLineCreate;
      });

      return mapped.filter(l => !!l.serviceCode || !!l.serviceDescription);
    }

    // 2) Fallback: legacy procedure{n}_* keys (your payload is exactly this shape)
    const keys = Object.keys(parsed);
    const idxs = new Set<number>();

    for (const k of keys) {
      const m = /^procedure(\d+)_/i.exec(k);
      if (m) idxs.add(Number(m[1]));
    }

    const ordered = Array.from(idxs)
      .filter(n => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);

    const lines: MdReviewLineCreate[] = [];

    for (const i of ordered) {
      // THIS is the big fix: asText() extracts `.code` from the object
      const codeObj = parsed[`procedure${i}_procedureCode`] ?? parsed[`procedure${i}_serviceCode`];
      const serviceCode = asText(codeObj);

      const serviceDescription = asText(
        parsed[`procedure${i}_procedureDescription`] ?? parsed[`procedure${i}_serviceDescription`]
      );

      const fromDate = parsed[`procedure${i}_fromDate`] ?? null;
      const toDate = parsed[`procedure${i}_toDate`] ?? null;

      const modifier = asText(parsed[`procedure${i}_modifier`]);
      const unitType = asText(parsed[`procedure${i}_unitType`]);

      const requested = asNum(parsed[`procedure${i}_serviceReq`] ?? parsed[`procedure${i}_requested`]);
      const approved = asNum(parsed[`procedure${i}_serviceAppr`] ?? parsed[`procedure${i}_serviceApproved`] ?? parsed[`procedure${i}_approved`]);
      const denied = asNum(parsed[`procedure${i}_serviceDenied`] ?? parsed[`procedure${i}_denied`]);

      if (!serviceCode && !serviceDescription) continue;

      lines.push({
        decisionLineId: i,
        serviceCode,
        serviceDescription,
        modifier,
        unitType,
        fromDate,
        toDate,
        requested,
        approved,
        denied,
        initialRecommendation: '',
        selected: true
      });
    }

    return lines;
  }



  private asText(v: any): string {
    if (v == null) return '';
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);

    if (typeof v === 'object') {
      // common shapes seen from dropdowns / API models
      return String(
        v.code ??
        v.serviceCode ??
        v.value ??
        v.label ??
        v.name ??
        ''
      ).trim();
    }

    return String(v).trim();
  }


  // ----------------------------
  // Normalizers
  // ----------------------------

  private normalizeActivitySummary(a: any): MdReviewActivitySummary {
    const idRaw = a?.authActivityId ?? a?.AuthActivityId ?? a?.activityId ?? a?.ActivityId ?? 0;
    const activityId = Number(idRaw);

    const typeId = this.numOrNull(a?.activityTypeId ?? a?.ActivityTypeId);
    const priorityId = this.numOrNull(a?.priorityId ?? a?.PriorityId);
    const referredToId = this.numOrNull(a?.referredTo ?? a?.ReferredTo);

    const typeLabel = this.optionLabel(this.activityTypeOptions, typeId);
    const priorityLabel = this.optionLabel(this.priorityOptions, priorityId);
    const assignedToLabel = this.optionLabel(this.userOptions, referredToId);

    return {
      activityId: Number.isFinite(activityId) ? activityId : 0,

      activityType: typeLabel ?? (typeId != null ? String(typeId) : null),
      priority: priorityLabel ?? (priorityId != null ? String(priorityId) : null),

      // Not directly on activity object in your API – filled from first line in loadMdReviewActivities()
      recommendation: null,

      mdReviewStatus: a?.mdReviewStatus ?? a?.MdReviewStatus ?? null,
      mdAggregateDecision: a?.mdAggregateDecision ?? a?.MdAggregateDecision ?? null,
      serviceLineCount: this.numOrNull(a?.serviceLineCount ?? a?.ServiceLineCount),

      createdOn: a?.createdOn ?? a?.CreatedOn ?? null,

      // API uses dueDate / followUpDateTime
      dueDateTime: a?.dueDate ?? a?.DueDate ?? null,
      scheduledDateTime: a?.followUpDateTime ?? a?.FollowUpDateTime ?? null,

      assignedToUserId: referredToId,
      assignedToName: assignedToLabel ?? null,

      notes: a?.comment ?? a?.Comment ?? null,

      status: a?.statusId ?? a?.StatusId ?? null
    };
  }


  private normalizeActivityLine(x: any): MdReviewActivityLine {
    const asText = (v: any): string => {
      if (v == null) return '';
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
      if (typeof v === 'object') {
        return String(v.code ?? v.label ?? v.value ?? v.name ?? '').trim();
      }
      return String(v).trim();
    };

    const status = (x?.status ?? x?.Status ?? '')?.toString();
    const mdDecision = (x?.mdDecision ?? x?.MdDecision ?? '')?.toString();

    return {
      lineId: Number(x?.id ?? x?.lineId ?? x?.LineId ?? x?.authActivityLineId ?? x?.AuthActivityLineId ?? x?.activityLineId),
      decisionLineId: this.numOrNull(x?.decisionLineId ?? x?.DecisionLineId),
      serviceCode: asText(x?.serviceCode ?? x?.ServiceCode ?? x?.Code),
      serviceDescription: asText(x?.description ?? x?.Description ?? x?.serviceDescription ?? x?.ServiceDescription),
      modifier: (x?.modifier ?? x?.Modifier ?? '')?.toString(),
      unitType: (x?.unitType ?? x?.UnitType ?? '')?.toString(),
      fromDate: x?.fromDate ?? x?.FromDate ?? null,
      toDate: x?.toDate ?? x?.ToDate ?? null,
      requested: this.numOrNull(x?.requested ?? x?.Requested),
      approved: this.numOrNull(x?.approved ?? x?.Approved),
      denied: this.numOrNull(x?.denied ?? x?.Denied),
      initialRecommendation: (x?.initialRecommendation ?? x?.InitialRecommendation ?? '')?.toString(),
      status,
      mdDecision,
      mdNotes: (x?.mdNotes ?? x?.MdNotes ?? null),
      reviewedByUserId: this.numOrNull(x?.reviewedByUserId ?? x?.ReviewedByUserId),
      reviewedOn: x?.reviewedOn ?? x?.ReviewedOn ?? null,
      version: this.numOrNull(x?.version ?? x?.Version) ?? 0,
      comment: x?.comment ?? x?.Comment ?? null,

      // UI helpers
      isDirty: false,
      selected: false,
      isSaving: false,
      saveError: null,
      // convenience for "Current Status" column
      currentStatus: status || null,
      mdReviewStatus: null
    } as any;
  }


  // ----------------------------
  // Helpers

  getPriorityLabel(value: any): string | null {
    return this.optionLabel(this.priorityOptions, value);
  }

  // ----------------------------

  private optionLabel(options: UiSmartOption[] | null | undefined, value: any): string | null {
    if (!options || value == null || value === '') return null;
    const vNum = Number(value);
    const match = options.find(o => {
      const ov: any = (o as any).value;
      return ov === value || (Number.isFinite(vNum) && Number(ov) === vNum);
    });
    return match?.label ?? null;
  }

  private safeParseJson(raw: any): any | null {
    if (raw == null || raw === '') return null;
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  }

  private numOrNull(v: any): number | null {
    const n = Number((v && typeof v === 'object' && 'value' in v) ? (v as any).value : v);
    return Number.isFinite(n) ? n : null;
  }

  private toIsoUtcOrNull(v: any): string | null {
    if (!v) return null;
    const d = (v instanceof Date) ? v : new Date(v);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  private isConflict(err: any): boolean {
    const code = err?.status ?? err?.Status;
    return code === 409;
  }

  // UI convenience
  trackByActivityId(_: number, a: MdReviewActivitySummary): number {
    return a.activityId;
  }

  trackByLineId(_: number, l: MdReviewActivityLine): number {
    return l.lineId;
  }

  trackByCreateLineId(_: number, l: MdReviewLineCreate): number {
    return Number(l.decisionLineId ?? 0);
  }

  formatDate(v?: string | null): string {
    if (!v) return '';
    const d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleString();
  }

  trackByCreateLine(_: number, l: MdReviewLineCreate): number {
    // decisionLineId is stable for your create list
    return Number(l.decisionLineId ?? 0);
  }

  /** Left list pill color mapping for mdReviewStatus */
  getMdReviewPillClass(status?: string | null): string {
    const s = (status ?? '').toLowerCase();

    if (!s) return '';
    if (s.includes('denied')) return 'pill-danger';
    if (s.includes('approved') || s.includes('completed')) return 'pill-ok';
    if (s.includes('progress')) return 'pill-warn';
    if (s.includes('pending')) return 'pill-warn';

    return '';
  }

  authHasUnsavedChanges(): boolean {
    return this.mdrForm?.dirty ?? false;
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
