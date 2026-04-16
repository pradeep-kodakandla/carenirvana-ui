import { Component, OnDestroy, ElementRef, AfterViewChecked, NgZone } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';

import { AuthDetailApiService, DecisionSectionName } from 'src/app/service/authdetailapi.service';
import { DatasourceLookupService } from 'src/app/service/crud.service';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';
import { WizardToastService } from 'src/app/member/UM/components/authwizardshell/wizard-toast.service';
import { AuthunsavedchangesawareService } from 'src/app/member/UM/services/authunsavedchangesaware.service';

/** Row in the inline bulk-edit table */
interface BulkSaveRow {
  checked: boolean;
  procedureNo: number;
  serviceCode: string;
  serviceDescription: string;
  currentStatusText: string;
  currentStatusClass: string;
  requested: number | string;
  approved: number | string;
  denied: number | string;
  /** Existing item IDs per section (for update vs create) */
  itemIds: Partial<Record<DecisionSectionName, string>>;
  /** Full existing Decision Details payload (for merging) */
  existingDecisionData: any;
  /** Full existing Member Provider Info payload */
  existingMemberProviderData: any;
  /** Full existing Decision Notes payload */
  existingNotesData: any;
}

/** Row in the editable Member/Provider notification table (bulk mode) */
interface BulkMpRow {
  type: any;                    // select value (Member/Provider)
  notificationType: any;        // select value
  notificationDate: string;     // datetime-local string
  notificationAttempt: number | string;
}

/** Row in the single-tab Member/Provider notification table (tracks saved items) */
interface SingleMpRow {
  type: any;
  notificationType: any;
  notificationDate: string;
  notificationAttempt: number | string;
  /** Existing backend itemId (null = new row to create) */
  itemId: string | null;
}

type DecisionTab = {
  id: number;              // UI tab id
  procedureNo: number;     // 1..N

  /** Service/procedure code shown in the tab */
  procedureCode: string;

  /** Backward compatibility fields (old tab template) */
  name?: string;
  subtitle?: string;

  /** Status for styling */
  statusText: string;
  statusCode: string;
  statusClass: string;
  reasonText?: string;

  /** New 4-line tab layout */
  line1: string;   // Decision # + Code
  line2?: string;  // Dates
  line3: string;   // Status badge
  line4?: string;  // Status reason
};

/** Conditional visibility (same semantics as CaseDetails) */
type ShowWhen = 'always' | 'fieldEquals' | 'fieldNotEquals' | 'fieldhasvalue';

interface TplCondition {
  referenceFieldId: string | null;
  showWhen: ShowWhen;
  value: any;
  /** Optional: how this condition combines with the previous one (default AND) */
  operatorWithPrev?: 'AND' | 'OR';
}

// ui-smart-dropdown option shape
type SmartOpt = UiSmartOption;

type DecisionFieldVm = {
  id: string;
  controlName: string;
  displayName: string;
  type: string;

  required?: boolean;
  isRequired?: boolean;
  requiredMsg?: string;

  datasource?: string;
  options?: any[];
  level?: any[];

  // visibility from template (optional)
  showWhen?: ShowWhen;
  referenceFieldId?: string | null;
  visibilityValue?: any;
  conditions?: TplCondition[];

  // runtime
  isEnabled: boolean;
  value: any;

  // select UI
  selectedOptions?: any[];
};

type DecisionSectionVm = {
  sectionName: DecisionSectionName;
  fields: DecisionFieldVm[];
  /** UI-only: tracks accordion collapsed state */
  _collapsed?: boolean;
};

type TabState = {
  tab: DecisionTab;
  sections: DecisionSectionVm[];
  itemIdsBySection: Partial<Record<DecisionSectionName, string>>;
};

@Component({
  selector: 'app-authdecision',
  templateUrl: './authdecision.component.html',
  styleUrls: ['./authdecision.component.css']
})
export class AuthdecisionComponent implements OnDestroy, AfterViewChecked, AuthunsavedchangesawareService {
  loading = false;
  saving = false;
  errorMsg = '';

  // ── View-Only Mode (injected by AuthWizardShell when auth is Closed) ──
  private _isViewOnly = false;
  get isViewOnly(): boolean { return this._isViewOnly; }
  set isViewOnly(value: boolean) {
    const was = this._isViewOnly;
    this._isViewOnly = value;
    if (value) {
      // Disable both the tab form and the bulk shared form while view-only
      if (this.form)            { this.form.disable({ emitEvent: false }); }
      if (this.bulkSharedForm)  { this.bulkSharedForm.disable({ emitEvent: false }); }
    } else if (was) {
      // Re-enable on reopen
      if (this.form)            { this.form.enable({ emitEvent: false }); }
      if (this.bulkSharedForm)  { this.bulkSharedForm.enable({ emitEvent: false }); }
    }
  }

  authDetailId: number | null = null;
  authTemplateId: number | null = null;

  tabs: DecisionTab[] = [];
  selectedTabId: number | null = null;

  activeState: TabState | null = null;

  form: FormGroup = this.fb.group({});
  optionsByControlName: Record<string, UiSmartOption[]> = {};

  private templateSections: any[] = [];
  private authData: any = {};
  /** Created timestamp of the auth record (from API envelope, not inside dataJson). */
  private authCreatedOn: string | null = null;
  private itemsBySection: Partial<Record<DecisionSectionName, any[]>> = {};
  private dropdownCache = new Map<string, SmartOpt[]>();

  // ═══════════════════════════════════════════════
  //  INLINE BULK EDIT STATE
  // ═══════════════════════════════════════════════
  bulkEditMode = false;
  bulkSaving = false;
  bulkValidationMsg = '';
  bulkSuccessMsg = '';
  bulkRows: BulkSaveRow[] = [];

  /** Decision Status / Code controls for bulk mode */
  bulkDecisionStatusCtrl = new FormControl(null);
  bulkDecisionStatusCodeCtrl = new FormControl(null);
  bulkDecisionStatusOptions: UiSmartOption[] = [];
  bulkDecisionStatusCodeOptions: UiSmartOption[] = [];

  /** Shared form for Member Provider Info + Notes in bulk mode */
  bulkSharedForm: FormGroup = this.fb.group({});
  bulkSharedOptions: Record<string, UiSmartOption[]> = {};

  /** View-model sections for bulk shared form fields */
  bulkDecisionDetailsSection: DecisionSectionVm | null = null;
  bulkMemberProviderSection: DecisionSectionVm | null = null;
  bulkNotesSection: DecisionSectionVm | null = null;

  /** Member Provider editable table rows + dropdown options */
  bulkMpRows: BulkMpRow[] = [];
  bulkMpTypeOptions: UiSmartOption[] = [];
  bulkMpNotifTypeOptions: UiSmartOption[] = [];

  /** Single-tab MP table rows + dropdown options (same table design as bulk) */
  singleMpRows: SingleMpRow[] = [];
  singleMpTypeOptions: UiSmartOption[] = [];
  singleMpNotifTypeOptions: UiSmartOption[] = [];

  private bulkStatusSub$ = new Subject<void>();

  /** Tracks whether an add-line operation is in progress */
  addingLine = false;

  /** Tracks whether a copy-line operation is in progress */
  copyingLine = false;

  /** Guards against re-entrant reload during add-new-line refresh */
  private refreshingForNewLine = false;

  /** Backup: if reload fires after guard expires, still select this procedure tab */
  private pendingSelectProcedureNo: number | null = null;

  /** Unsaved changes warning dialog state */
  showUnsavedWarning = false;
  private pendingTabId: number | null = null;
  private pendingAddNew = false;

  /** Snapshot of the form value when a tab is first loaded (used for dirty detection) */
  private formSnapshot: string = '';
  private formSnapshotTimer: any = null;

  /** Procedure numbers for newly added (unsaved) decision lines */
  private newLineIds = new Set<number>();

  /** Shell callbacks (injected by AuthWizardShell via pushContextIntoCurrentStep) */
  _shellRefreshBadgeCounts?: (patch?: Partial<Record<string, number>>) => void;
  _shellRefreshHeader?: () => void;
  /** Callback to push updated authData back to the shell/AuthDetails for persistence */
  _shellSyncAuthData?: (updatedAuthData: any) => void;

  /**
   * Reverse sync callback: Decision → Source sections.
   * Injected by AuthWizardShell. Forwards approved/denied values back into
   * AuthdetailsComponent form controls (Service, Medication, Transportation)
   * so the source section reflects decision outcomes in real time.
   */
  _shellSyncDecisionToSources?: (
    procedureNo: number,
    approved: any,
    denied: any,
    requested?: any,
    decisionPayload?: any
  ) => void;

  /**
   * Cached UI value for the "Pended" option in Decision Status dropdown.
   * We discover this from dropdown options so we don't have to guess whether Pended is 0/1/etc.
   */
  private pendedDecisionStatusValue: any = null;

  /** Extract a service/procedure code string from common backend shapes (object or primitive). */
  private extractServiceCodeString(v: any): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string' || typeof v === 'number') return String(v).trim();
    if (typeof v !== 'object') return String(v).trim();
    // common shapes: {code:"A0080"}, {procedureCode:{code}}, {serviceCode:{code}}
    const obj: any = v;
    const cand =
      obj?.code ??
      obj?.procedureCode?.code ??
      obj?.serviceCode?.code ??
      obj?.value ??
      obj?.id ??
      '';
    return String(cand ?? '').trim();
  }

  /** Find the Decision Status field datasource name from the decision template (best effort). */
  private getDecisionStatusDatasourceFromTemplate(): string | null {
    try {
      const merged = this.extractDecisionSectionsFromTemplate();
      for (const sec of (merged ?? [])) {
        const fields: any[] = sec?.fields ?? sec?.Fields ?? [];
        const hit = (fields ?? []).find((f: any) => String(f?.id ?? f?.fieldId ?? '').trim().toLowerCase() === 'decisionstatus');
        if (hit) {
          const ds = String(hit?.datasource ?? hit?.Datasource ?? '').trim();
          return ds || null;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Prefetch Decision Status AND Decision Status Code options so tabs show labels (not ids). */
  private prefetchDecisionStatusForTabs(done: () => void): void {
    const statusDs = this.getDecisionStatusDatasourceFromTemplate();
    const codeDs = this.getDecisionStatusCodeDatasourceFromTemplate();

    const pending: Array<{ ds: string; isStatus: boolean }> = [];

    // Check status datasource
    if (statusDs) {
      if (this.dropdownCache.has(statusDs)) {
        const cached = (this.dropdownCache.get(statusDs) ?? []) as any[];
        const p = this.findPendedStatusOption(cached as any);
        if (p) this.pendedDecisionStatusValue = (p as any).value;
      } else {
        pending.push({ ds: statusDs, isStatus: true });
      }
    }

    // Check reason datasource
    if (codeDs && !this.dropdownCache.has(codeDs)) {
      pending.push({ ds: codeDs, isStatus: false });
    }

    if (!pending.length) {
      done();
      return;
    }

    let remaining = pending.length;
    const onOne = () => { if (--remaining <= 0) done(); };

    for (const item of pending) {
      this.dsLookup
        .getOptionsWithFallback(
          item.ds,
          (r: any) => this.mapDatasourceRowToOption(item.ds, r) as any,
          ['UM', 'Admin', 'Provider']
        )
        .pipe(catchError(() => of([])), takeUntil(this.destroy$))
        .subscribe((opts) => {
          const safe = (opts ?? []) as any[];
          this.dropdownCache.set(item.ds, safe as any);
          if (item.isStatus) {
            const pended = this.findPendedStatusOption(safe as any);
            if (pended) this.pendedDecisionStatusValue = (pended as any).value;
          }
          onOne();
        });
    }
  }

  /** Find the Decision Status Code datasource name from the template */
  private getDecisionStatusCodeDatasourceFromTemplate(): string | null {
    try {
      const merged = this.extractDecisionSectionsFromTemplate();
      for (const sec of (merged ?? [])) {
        const fields: any[] = sec?.fields ?? sec?.Fields ?? [];
        const hit = (fields ?? []).find((f: any) =>
          String(f?.id ?? f?.fieldId ?? '').trim().toLowerCase() === 'decisionstatuscode'
        );
        if (hit) {
          const ds = String(hit?.datasource ?? hit?.Datasource ?? '').trim();
          return ds || null;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Field id -> controlName map for the current tab (used for conditional visibility). */
  private fieldIdToControlName = new Map<string, string>();
  private visibilitySyncInProgress = false;

  /** Kills subscriptions that are bound to the current tab/form when switching tabs. */
  private tabDestroy$ = new Subject<void>();
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private api: AuthDetailApiService,
    private dsLookup: DatasourceLookupService,
    private toastSvc: WizardToastService,
    private router: Router,
    private route: ActivatedRoute,
    private elRef: ElementRef
  ) { }

  ngAfterViewChecked(): void {
    this.updateContentGap();
  }

  /** Calculates the active tab's position and sets --gap-top / --gap-bottom
   *  CSS custom properties on the content panel so the left border has a gap. */
  private updateContentGap(): void {
    const host = this.elRef.nativeElement as HTMLElement;
    const activeTab = host.querySelector('.tab.active') as HTMLElement;
    const content = host.querySelector('.tab-content') as HTMLElement;
    if (!activeTab || !content) return;

    const ctRect = content.getBoundingClientRect();
    const tabRect = activeTab.getBoundingClientRect();
    const bw = 2; // must match --bw

    // ::before runs from top of content down to the active tab's top edge
    const gapTop = Math.max(0, (tabRect.top - ctRect.top) + bw);
    // ::after runs from the active tab's bottom edge down to the content bottom
    // tabRect.bottom already includes the tab's bottom border, so no extra offset needed
    const gapBottom = 0;// tabRect.bottom - ctRect.top;

    content.style.setProperty('--gap-top', gapTop + 'px');
    content.style.setProperty('--gap-bottom', gapBottom + 'px');
  }

  public openMdReview(): void {
    // Make MD Review visible in the stepper (via query param) and navigate to MD Review step.
    this.router.navigate(['../mdReview'], {
      relativeTo: this.route,
      queryParams: { showMdReview: 1 },
      queryParamsHandling: 'merge'
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  ADD DECISION LINE
  //  Creates a new Decision Details row with the next procedure
  //  number, adds it as a new tab, and selects it with all
  //  fields enabled for the user to fill in.
  // ═══════════════════════════════════════════════════════════

  addDecisionLine(): void {
    if (this.addingLine || !this.authDetailId || !this.authTemplateId) return;

    // If current form has unsaved changes, warn user before adding new line
    if (this.isFormDirty()) {
      this.pendingAddNew = true;
      this.pendingTabId = null;
      this.showUnsavedWarning = true;
      return;
    }

    // Compute the next procedure number
    const existingNums = this.tabs.map(t => t.procedureNo);
    const maxExisting = existingNums.length ? Math.max(...existingNums) : 0;
    const nextProcNo = maxExisting + 1;

    const userId = Number(sessionStorage.getItem('loggedInUserid') || 0);
    const authDetailId = this.authDetailId;
    const nowIso = new Date().toISOString();

    // Resolve Decision Status "Pended" value for the new line
    const pendedValue = this.pendedDecisionStatusValue ?? null;

    // Build minimal seed payload for the new decision line
    const payload: any = {
      procedureNo: nextProcNo,
      decisionNumber: String(nextProcNo),
      decisionStatus: pendedValue,
      createdDateTime: this.authCreatedOn ?? nowIso,
      updatedDateTime: nowIso,
      decisionDateTime: null
    };

    // Convert empty strings to null
    for (const k of Object.keys(payload)) {
      if (payload[k] === '') payload[k] = null;
    }

    this.addingLine = true;
    this.errorMsg = '';

    this.api.createItem(authDetailId, 'Decision Details', { data: payload } as any, userId)
      .pipe(
        catchError((e) => {
          console.error('Failed to create new decision line:', e);
          this.errorMsg = 'Failed to add decision line. Please try again.';
          this.toastSvc.error('Failed to add decision line.');
          return of(null);
        }),
        finalize(() => (this.addingLine = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (res: any) => {
          if (res === null) return;

          // Track this as a new unsaved line (for the badge)
          this.newLineIds.add(nextProcNo);

          // Also seed the corresponding service-level keys in authData so sync works
          this.seedAuthDataKeysForNewLine(nextProcNo);

          this.toastSvc.success(`Decision Line #${nextProcNo} added.`);

          // Clear stale form state so the new tab loads cleanly
          this.formSnapshot = '';
          this.selectedTabId = null;
          this.pendingSelectProcedureNo = nextProcNo;

          // Refresh items, select the new tab
          // (shell callbacks are NOT fired here — they would trigger re-entrant
          //  setContext→reload which causes flicker. They fire on save instead.)
          this.refreshAndSelectProcedure(nextProcNo);
        }
      });
  }

  // ═══════════════════════════════════════════════════════════
  //  COPY DECISION LINE
  //  Duplicates any decision line (defaults to the active tab)
  //  into a new procedure number and selects it for editing.
  // ═══════════════════════════════════════════════════════════

  copyDecisionLine(sourceProcNo?: number): void {
    const procNo = sourceProcNo ?? this.activeState?.tab?.procedureNo ?? null;
    if (this.copyingLine || !this.authDetailId || !this.authTemplateId || procNo === null) return;

    // If copying the active (unsaved) tab, warn about unsaved changes first
    if (!sourceProcNo && this.isFormDirty()) {
      this.pendingAddNew = true;
      this.pendingTabId = null;
      this.showUnsavedWarning = true;
      return;
    }

    // Compute the next procedure number
    const existingNums = this.tabs.map(t => t.procedureNo);
    const maxExisting = existingNums.length ? Math.max(...existingNums) : 0;
    const nextProcNo = maxExisting + 1;

    const userId = Number(sessionStorage.getItem('loggedInUserid') || 0);
    const authDetailId = this.authDetailId;
    const nowIso = new Date().toISOString();

    // Clone source Decision Details, override identity/timestamp/status fields
    const sourceData = { ...this.getExistingDecisionDetails(procNo) };
    const payload: any = {
      ...sourceData,
      procedureNo: nextProcNo,
      decisionNumber: String(nextProcNo),
      createdDateTime: this.authCreatedOn ?? nowIso,
      updatedDateTime: nowIso,
      decisionDateTime: null,
      // Reset status to Pended on the copied line — user must set explicitly
      decisionStatus: this.pendedDecisionStatusValue ?? sourceData.decisionStatus,
      decisionStatusLabel: null,
      decisionStatusCode: null,
      decisionStatusCodeLabel: null,
    };

    // Convert empty strings to null
    for (const k of Object.keys(payload)) {
      if (payload[k] === '') payload[k] = null;
    }

    this.copyingLine = true;
    this.errorMsg = '';

    this.api.createItem(authDetailId, 'Decision Details', { data: payload } as any, userId)
      .pipe(
        catchError((e) => {
          console.error('Failed to copy decision line:', e);
          this.errorMsg = 'Failed to copy decision line. Please try again.';
          this.toastSvc.error('Failed to copy decision line.');
          return of(null);
        }),
        finalize(() => (this.copyingLine = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (res: any) => {
          if (res === null) return;

          this.newLineIds.add(nextProcNo);
          this.seedAuthDataKeysForNewLine(nextProcNo);

          this.toastSvc.success(`Decision Line #${nextProcNo} copied from #${procNo}.`);

          this.formSnapshot = '';
          this.selectedTabId = null;
          this.pendingSelectProcedureNo = nextProcNo;

          this.refreshAndSelectProcedure(nextProcNo);
        }
      });
  }

  /** Returns true if the currently active tab is a newly added line that hasn't been fully saved yet */
  isNewUnsavedLine(): boolean {
    if (!this.activeState) return false;
    return this.newLineIds.has(this.activeState.tab.procedureNo);
  }

  /** Seeds empty procedure keys in authData for a new decision line so fields can be mapped */
  private seedAuthDataKeysForNewLine(procedureNo: number): void {
    const prefix = `procedure${procedureNo}_`;
    const keysToCopy = [
      'procedureCode', 'procedureDescription', 'serviceCode', 'serviceDescription',
      'fromDate', 'toDate', 'effectiveDate',
      'serviceReq', 'serviceAppr', 'serviceDenied',
      'modifier', 'unitType', 'reviewType',
      'createdDateTime'
    ];
    for (const k of keysToCopy) {
      if (!(prefix + k in this.authData)) {
        this.authData[prefix + k] = null;
      }
    }
  }

  /** Refresh items from the API and select a specific procedure tab */
  private refreshAndSelectProcedure(targetProcNo: number): void {
    if (!this.authDetailId) return;

    const sections: DecisionSectionName[] = [
      'Decision Details',
      'Member Provider Decision Info',
      'Decision Notes'
    ];

    this.refreshingForNewLine = true;
    this.loading = true;
    forkJoin(
      sections.reduce((acc, s) => {
        acc[s] = this.api.getItems(this.authDetailId!, s).pipe(catchError(() => of([])));
        return acc;
      }, {} as Record<DecisionSectionName, any>)
    )
      .pipe(
        finalize(() => (this.loading = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (res: any) => {
          this.itemsBySection = res ?? {};
          this.buildTabsFromAuthData();
          this.updateTabStatuses();

          // Select the new tab
          const newTab = this.tabs.find(t => t.procedureNo === targetProcNo) ?? this.tabs[this.tabs.length - 1];
          if (newTab) {
            this.selectedTabId = newTab.id;
            this.buildActiveState(newTab);
          }

          // Keep the guard active to block any re-entrant setContext/reload triggered
          // by shell async callbacks. Clear after a safe window.
          // Shell badges/header will refresh on the next save action.
          setTimeout(() => {
            this.refreshingForNewLine = false;
            this.pendingSelectProcedureNo = null;
          }, 1500);
        },
        error: (e) => {
          this.refreshingForNewLine = false;
          console.error(e);
          this.errorMsg = 'Unable to reload decision items.';
        }
      });
  }



  ngOnDestroy(): void {
    if (this.formSnapshotTimer) {
      clearTimeout(this.formSnapshotTimer);
      this.formSnapshotTimer = null;
    }
    this.refreshingForNewLine = false;
    this.pendingSelectProcedureNo = null;
    this.tabDestroy$.next();
    this.tabDestroy$.complete();
    this.bulkStatusSub$.next();
    this.bulkStatusSub$.complete();
    this.destroy$.next();
    this.destroy$.complete();
  }

  // called by AuthWizardShell
  setContext(ctx: any): void {
    const nextDetailId = Number(ctx?.authDetailId ?? 0) || null;
    const nextTemplateId = Number(ctx?.authTemplateId ?? 0) || null;

    const changed = nextDetailId !== this.authDetailId || nextTemplateId !== this.authTemplateId;
    console.log('AuthDecisionComponent.setContext', { nextDetailId, nextTemplateId, changed });

    this.authDetailId = nextDetailId;
    this.authTemplateId = nextTemplateId;

    // Skip reload if we're in the middle of adding a new line —
    // refreshAndSelectProcedure is already handling the refresh and tab selection.
    if (this.refreshingForNewLine) {
      console.log('[AuthDecision] setContext skipped — refreshingForNewLine in progress');
      return;
    }

    // Check if authData was refreshed (e.g. after AuthDetails save) and trigger service→decision sync
    const incomingAuthData = ctx?.authData ?? null;
    if (incomingAuthData && !changed && this.tabs.length > 0) {
      const prevSnapshot = JSON.stringify(this.authData ?? {});
      const newSnapshot = JSON.stringify(incomingAuthData ?? {});
      if (prevSnapshot !== newSnapshot) {
        console.log('[AuthDecision] authData changed — syncing service→decision');
        this.authData = typeof incomingAuthData === 'string'
          ? (this.safeParseJson(incomingAuthData) ?? {})
          : incomingAuthData;
        this.syncServiceToDecision();
        return; // sync will handle refresh
      }
    }

    if (this.authDetailId && this.authTemplateId) {
      this.reload(this.authDetailId, this.authTemplateId);
    }
  }

  // ---------------------------
  // Load
  // ---------------------------
  private reload(authDetailId: number, authTemplateId: number): void {
    this.loading = true;
    this.errorMsg = '';

    this.tabs = [];
    this.selectedTabId = null;
    this.activeState = null;
    this.itemsBySection = {};
    this.form = this.fb.group({});
    this.optionsByControlName = {};

    const sections: DecisionSectionName[] = [
      'Decision Details',
      'Member Provider Decision Info',
      'Decision Notes'
    ];

    forkJoin({
      auth: this.api.getById(authDetailId).pipe(catchError(() => of(null))),
      tmpl: this.api.getDecisionTemplate(authTemplateId).pipe(catchError(() => of(null))),
      items: forkJoin(
        sections.reduce((acc, s) => {
          acc[s] = this.api.getItems(authDetailId, s).pipe(catchError(() => of([])));
          return acc;
        }, {} as Record<DecisionSectionName, any>)
      ).pipe(catchError(() => of({} as any)))
    })
      .pipe(finalize(() => (this.loading = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.authData = this.safeParseJson(res?.auth?.dataJson) ?? res?.auth?.data ?? {};
          // Capture envelope metadata (not part of dataJson)
          this.authCreatedOn = res?.auth?.createdOn ?? res?.auth?.createdDate ?? res?.auth?.CreatedOn ?? null;

          const rawSections = res?.tmpl?.sections ?? res?.tmpl?.Sections ?? [];
          this.templateSections = Array.isArray(rawSections) ? rawSections : [];
          console.log('AuthDecisionComponent.reload: templateSections fragments=', this.templateSections?.length);
          // Build reactive form controls
          //this.buildFormForSections(this.templateSections, procedureNo);

          // prefetch options for select fields (datasource/static)
          //  this.prefetchDropdownOptions(this.templateSections);

          this.itemsBySection = res?.items ?? {};

          // IMPORTANT: Prefetch Decision Status dropdown so left tabs can show labels (not ids like 1/2/3)
          this.prefetchDecisionStatusForTabs(() => {
            this.buildTabsFromAuthData();
            this.updateTabStatuses();
            if (!this.tabs.length) {
              this.errorMsg = 'No decision rows found. Please save Auth Details to initialize Decision tabs.';
              return;
            }
            console.log('AuthDecisionComponent.reload: tabs=', this.tabs);

            // If a new line was just added, select that tab instead of tabs[0]
            if (this.pendingSelectProcedureNo !== null) {
              const targetTab = this.tabs.find(t => t.procedureNo === this.pendingSelectProcedureNo)
                ?? this.tabs[this.tabs.length - 1];
              this.pendingSelectProcedureNo = null;
              if (targetTab) {
                this.selectedTabId = targetTab.id;
                this.buildActiveState(targetTab);
              }
            } else {
              this.selectedTabId = this.tabs[0].id;
              this.buildActiveState(this.tabs[0]);
            }
          });
        },
        error: (e) => {
          console.error(e);
          this.errorMsg = 'Unable to load auth decision.';
        }
      });
  }

  private safeParseJson(raw: any): any | null {
    if (raw == null || raw === '') return null;
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  }

  private formatDateShort(value: any): string {
    if (!value) return 'N/A';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return 'N/A';
    return d.toISOString().slice(0, 10);
  }

  /** Short MM/DD format for tab line2 (e.g. "01/29") */
  private formatDateCompact(value: any): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}/${dd}`;
  }

  /** Full MM/DD/YYYY for the last date in tab line2 */
  private formatDateCompactFull(value: any): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  private toDateTimeLocalString(value: any): string | null {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    // datetime-local expects: YYYY-MM-DDTHH:mm
    return d.toISOString().slice(0, 16);
  }

  private extractPrimitive(value: any): any {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'object') return value;

    // common shapes from dropdowns / APIs
    const obj: any = value;
    const candidates = [
      'value',
      'code',
      'key',
      'id',
      'decisionStatusCode',
      'procedureCode',
      'statusCode',
      'decisionStatusId'
    ];

    for (const k of candidates) {
      const v = obj?.[k];
      if (v === null || v === undefined) continue;
      if (typeof v !== 'object') return v;
    }

    // label-like fallbacks
    if (typeof obj?.label === 'string') return obj.label;
    if (typeof obj?.text === 'string') return obj.text;
    if (typeof obj?.name === 'string') return obj.name;

    return null;
  }

  private asDisplayString(value: any): string {
    const prim = this.extractPrimitive(value);
    if (prim === null || prim === undefined) return '';
    return String(prim);
  }

  private normalizeStatusCode(value: any): string {
    const s = this.asDisplayString(value).trim();
    return s;
  }

  private statusToClass(statusCodeOrText: string): string {
    const n = String(statusCodeOrText ?? '').trim().toLowerCase();
    if (!n) return 'status-pended';

    // Try resolving from cache if it looks like an id
    if (/^\d+$/.test(n)) {
      const looked = this.lookupDecisionStatusLabel(n);
      const label = (looked?.label ?? '').toLowerCase();
      if (label.startsWith('pend')) return 'status-pended';
      if (label.startsWith('approv')) return 'status-approved';
      if (label.startsWith('deny') || label.startsWith('deni')) return 'status-denied';
      if (label.startsWith('partial')) return 'status-partial';
      if (label.startsWith('void')) return 'status-other';
      if (label) return 'status-other';
    }

    // Text pattern matching on resolved labels
    if (n.startsWith('pend') || n === 'pended') return 'status-pended';
    if (n.startsWith('approv') || n === 'approved') return 'status-approved';
    if (n.startsWith('deny') || n.startsWith('deni') || n === 'denied') return 'status-denied';
    if (n.startsWith('partial')) return 'status-partial';

    return 'status-other';
  }

  private isPendedStatus(v: any): boolean {
    const s = this.asDisplayString(v).trim().toLowerCase();
    if (!s) return true;

    // If we discovered a concrete "Pended" dropdown value, treat it as pended.
    if (this.pendedDecisionStatusValue !== null && this.pendedDecisionStatusValue !== undefined) {
      const pv = this.asDisplayString(this.pendedDecisionStatusValue).trim().toLowerCase();
      if (pv && s === pv) return true;
    }

    // Try mapping ids/codes to labels via datasource cache.
    const looked = this.lookupDecisionStatusLabel(s);
    const label = looked?.label ? looked.label.toLowerCase() : '';
    if (label.startsWith('pend')) return true;

    // Fallback: text pattern matching (works for resolved labels)
    return s.startsWith('pend') || s === 'pended';
  }

  /** Existing Decision Details data for a procedure (items win; fallback to authData.decisionDetails). */
  private getExistingDecisionDetails(procedureNo: number): any {
    const picked = this.findItemForSectionAndProcedure('Decision Details', procedureNo);
    const d = picked?.data ?? {};
    return d ?? {};
  }

  /**
   * Apply timestamp rules for Decision Details:
   * - createdDateTime: default to authCreatedOn if null
   * - updatedDateTime: set to now on every save
   * - decisionDateTime: set when status transitions from Pended -> non-Pended (or changes between non-Pended states)
   */
  private applyDecisionTimestamps(procedureNo: number, payload: any): void {
    if (!payload) return;

    const existing = this.getExistingDecisionDetails(procedureNo);
    const nowIso = new Date().toISOString();

    // createdDateTime default
    if (!payload.createdDateTime) {
      const procCreated = this.authData?.[`procedure${procedureNo}_createdDateTime`] ?? null;
      payload.createdDateTime = existing?.createdDateTime ?? procCreated ?? this.authCreatedOn ?? nowIso;
    }

    // always update updatedDateTime on save
    payload.updatedDateTime = nowIso;

    // determine status transitions
    const newStatus =
      payload?.decisionStatus ??
      payload?.decisionStatusId ??
      payload?.decisionStatusCode ??
      payload?.status;

    const oldStatus =
      existing?.decisionStatus ??
      existing?.decisionStatusId ??
      existing?.decisionStatusCode ??
      existing?.status;

    const newIsPended = this.isPendedStatus(newStatus);
    const oldIsPended = this.isPendedStatus(oldStatus);

    // if user keeps it pended, keep decisionDateTime null
    if (newIsPended) {
      payload.decisionDateTime = null;
      return;
    }

    const oldDecisionDt = existing?.decisionDateTime ?? null;
    const newDecisionDt = payload?.decisionDateTime ?? null;

    const statusChanged = this.asDisplayString(newStatus).trim() !== this.asDisplayString(oldStatus).trim();

    // set decisionDateTime when leaving pended OR when status changes between non-pended values
    if ((oldIsPended && !newIsPended) || (!oldIsPended && !newIsPended && statusChanged)) {
      payload.decisionDateTime = nowIso;
    } else {
      // keep existing if present
      payload.decisionDateTime = newDecisionDt || oldDecisionDt;
    }
  }

  private lookupDecisionStatusLabel(codeOrId: string): { label: string; code: string } | null {
    const v = String(codeOrId ?? '').trim();
    if (!v) return null;

    // Helper: check if any candidate matches (normalised string comparison + numeric coercion)
    const matches = (x: any) => {
      if (x === null || x === undefined) return false;
      const xs = String(x).trim();
      if (xs === v) return true;
      // Also try numeric equality for "1" vs 1 mismatches
      if (/^\d+$/.test(v) && /^\d+$/.test(xs) && Number(xs) === Number(v)) return true;
      return false;
    };

    // 1) Search dropdownCache (keyed by datasource) — Decision Status only (not StatusCode/reason)
    for (const [ds, opts] of this.dropdownCache.entries()) {
      const k = this.normDs(ds);
      if (!k.includes('decisionstatus') || k.includes('decisionstatuscode')) continue;

      const hit = this.findOptionMatch(opts, matches);
      if (hit) return hit;
    }

    // 2) Search optionsByControlName for any control whose name includes "decision"+"status" but not "code"/"reason"
    for (const [cn, opts] of Object.entries(this.optionsByControlName ?? {})) {
      const low = cn.toLowerCase();
      if (!low.includes('decision') || !low.includes('status')) continue;
      if (low.includes('code') || low.includes('reason')) continue;

      const hit = this.findOptionMatch(opts, matches);
      if (hit) return hit;
    }

    return null;
  }

  /** Search a Decision Status Code (reason) value and resolve to label */
  private lookupDecisionStatusCodeLabel(codeOrId: string): { label: string; code: string } | null {
    const v = String(codeOrId ?? '').trim();
    if (!v) return null;

    const matches = (x: any) => {
      if (x === null || x === undefined) return false;
      const xs = String(x).trim();
      if (xs === v) return true;
      if (/^\d+$/.test(v) && /^\d+$/.test(xs) && Number(xs) === Number(v)) return true;
      return false;
    };

    // 1) Search dropdownCache for DecisionStatusCode datasources
    for (const [ds, opts] of this.dropdownCache.entries()) {
      const k = this.normDs(ds);
      if (!k.includes('decisionstatuscode')) continue;

      const hit = this.findOptionMatch(opts, matches);
      if (hit) return hit;
    }

    // 2) Search optionsByControlName for status code / reason controls
    for (const [cn, opts] of Object.entries(this.optionsByControlName ?? {})) {
      const low = cn.toLowerCase();
      if (low.includes('statuscode') || low.includes('status_code') || low.includes('reason')) {
        const hit = this.findOptionMatch(opts, matches);
        if (hit) return hit;
      }
    }

    return null;
  }

  /** Universal option matcher: find option where value/raw keys match, return label+code */
  private findOptionMatch(opts: any[], matches: (x: any) => boolean): { label: string; code: string } | null {
    for (const o of (opts ?? [])) {
      const raw: any = (o as any)?.raw;
      const cands = [
        (o as any)?.value,
        raw?.id,
        raw?.value,
        raw?.code,
        raw?.decisionStatusCode,
        raw?.decisionStatusCodeId,
        raw?.decisionStatusId,
        raw?.statusCode,
        raw?.statusId
      ];

      // Also add numeric coercions for candidates to handle "1" vs 1 mismatches
      const allCands = [...cands];
      for (const c of cands) {
        if (c !== null && c !== undefined) {
          if (typeof c === 'number') allCands.push(String(c));
          if (typeof c === 'string' && /^\d+$/.test(c.trim())) allCands.push(Number(c.trim()));
        }
      }

      if (allCands.some(matches)) {
        // Build label — try option-level first, then raw fields, then pickDisplayField
        let label = String(
          (o as any)?.label ?? (o as any)?.text ?? ''
        ).trim();

        // If label is empty or purely numeric, dig into the raw object for descriptive text
        if (!label || /^\d+$/.test(label)) {
          const rawLabel = String(
            raw?.decisionStatusName ?? raw?.decisionStatus ??
            raw?.decisionStatusCode ?? raw?.decisionStatusCodeName ??
            raw?.decisionStatusReasonName ?? raw?.statusCodeName ??
            raw?.reasonDescription ?? raw?.description ??
            raw?.displayName ?? raw?.name ?? raw?.label ?? raw?.text ??
            raw?.reason ?? raw?.title ?? ''
          ).trim();

          if (rawLabel && !/^\d+$/.test(rawLabel)) {
            label = rawLabel;
          } else if (raw) {
            // Last resort: find any non-ID descriptive string in the raw object
            const picked = this.pickDisplayField(raw);
            if (picked) label = picked;
          }
        }

        // If we still have no real label, fall back to the option value string
        if (!label) label = String((o as any)?.value ?? '');

        const code = String((o as any)?.value ?? '');
        return { label, code };
      }
    }
    return null;
  }


  private getDecisionStatusForProcedure(procedureNo: number): { statusText: string; statusCode: string; reasonText: string } {
    let statusText = 'Pended';
    let statusCode = 'Pended';
    let reasonText = '';

    try {
      const picked = this.findItemForSectionAndProcedure('Decision Details', procedureNo);
      const data = picked?.data ?? {};

      // ---- 1) Resolve Decision Status ----
      // Prefer decisionStatus / decisionStatusId; avoid decisionStatusCode (that's the reason)
      let raw =
        data?.decisionStatus ??
        data?.decisionStatusId ??
        data?.status ??
        null;

      if (raw === null) {
        // fallback: any key containing "decisionStatus" but NOT "Code"/"Reason"
        const k = Object.keys(data || {}).find(x =>
          /decisionstatus/i.test(x.replace(/[\s_-]/g, '')) &&
          !/code|reason/i.test(x)
        );
        if (k) raw = (data as any)[k];
      }

      if (raw && typeof raw === 'object') {
        const obj: any = raw;
        statusText = obj?.decisionStatusName ?? obj?.decisionStatus ?? obj?.statusName ?? obj?.name ?? obj?.label ?? obj?.text ?? statusText;
        statusCode = this.asDisplayString(obj?.code ?? obj?.value ?? obj?.id) || statusCode;
        // If object resolution still ended up numeric, try saved label
        if (/^\d+$/.test(statusText)) {
          const savedLbl = typeof data?.decisionStatusLabel === 'string' ? data.decisionStatusLabel.trim() : '';
          if (savedLbl && !/^\d+$/.test(savedLbl)) statusText = savedLbl;
        }
      } else {
        const prim = this.asDisplayString(raw);
        if (prim) {
          // 1) Try cache/options lookup first
          const looked = this.lookupDecisionStatusLabel(prim);
          if (looked && !/^\d+$/.test(looked.label)) {
            statusText = looked.label;
            statusCode = looked.code;
          } else {
            // 2) Cache miss or label still numeric — prefer the persisted label saved
            //    alongside the value on every save (decisionStatusLabel field).
            //    This works even before async dropdown options have loaded.
            const savedLbl = typeof data?.decisionStatusLabel === 'string' ? data.decisionStatusLabel.trim() : '';
            if (savedLbl && !/^\d+$/.test(savedLbl)) {
              statusText = savedLbl;
              statusCode = prim;
            } else if (looked) {
              // lookup succeeded but label was numeric — still use it
              statusText = looked.label;
              statusCode = looked.code;
            } else {
              statusText = prim;
              statusCode = prim;
            }
          }
        }
      }

      // ---- 2) Resolve Decision Status Reason (decisionStatusCode field) ----
      let reasonRaw =
        data?.decisionStatusCode ??
        data?.statusReason ??
        data?.decisionStatusReasonCode ??
        data?.reasonCode ??
        null;

      if (reasonRaw && typeof reasonRaw === 'object') {
        const obj: any = reasonRaw;
        reasonText = obj?.decisionStatusCodeName ?? obj?.decisionStatusName ?? obj?.decisionStatusCode ??
          obj?.reasonDescription ?? obj?.description ??
          obj?.name ?? obj?.label ?? obj?.text ?? '';
        // If object resolution still ended up numeric, try saved label
        if (/^\d+$/.test(reasonText)) {
          const savedLbl = typeof data?.decisionStatusCodeLabel === 'string' ? data.decisionStatusCodeLabel.trim() : '';
          if (savedLbl && !/^\d+$/.test(savedLbl)) reasonText = savedLbl;
        }
      } else {
        const reasonPrim = this.asDisplayString(reasonRaw);
        if (reasonPrim) {
          // 1) Try cache/options lookup first
          const looked = this.lookupDecisionStatusCodeLabel(reasonPrim);
          if (looked && !/^\d+$/.test(looked.label)) {
            reasonText = looked.label;
          } else {
            // 2) Prefer persisted label saved alongside the value
            const savedLbl = typeof data?.decisionStatusCodeLabel === 'string' ? data.decisionStatusCodeLabel.trim() : '';
            if (savedLbl && !/^\d+$/.test(savedLbl)) {
              reasonText = savedLbl;
            } else if (looked) {
              reasonText = looked.label;
            } else {
              reasonText = reasonPrim;
            }
          }
        }
      }

      return { statusText: String(statusText), statusCode: String(statusCode), reasonText: String(reasonText) };
    } catch {
      return { statusText, statusCode, reasonText };
    }
  }



  private computeTabStatus(procedureNo: number): { label: string; statusClass: string; reasonText: string } {
    const status = this.getDecisionStatusForProcedure(procedureNo);
    const txt = String(status?.statusText ?? '').trim();
    const code = String(status?.statusCode ?? '').trim();
    const reason = String(status?.reasonText ?? '').trim();

    // Treat empty or "pended" statuses as Pended.
    if (this.isPendedStatus(code) || this.isPendedStatus(txt)) {
      return { label: 'Pended', statusClass: this.statusToClass('Pended'), reasonText: '' };
    }

    // Normalize common display labels
    const low = txt.toLowerCase();
    if (low.startsWith('approv')) return { label: 'Approved', statusClass: this.statusToClass('Approved'), reasonText: reason };
    if (low.startsWith('deny') || low.startsWith('deni')) return { label: 'Denied', statusClass: this.statusToClass('Denied'), reasonText: reason };
    if (low.startsWith('partial')) return { label: 'Partial Approval', statusClass: this.statusToClass('Partial'), reasonText: reason };

    // Fallback: use resolved label/code
    const finalLabel = txt || code || 'Pended';
    return { label: finalLabel, statusClass: this.statusToClass(finalLabel), reasonText: reason };
  }


  private updateTabStatuses(): void {
    this.tabs = (this.tabs ?? []).map(t => {
      const procNo = t.procedureNo;

      // Data sources for dates/code
      const dd = this.getExistingDecisionDetails(procNo) ?? {};
      const code = this.asDisplayString(dd?.serviceCode ?? dd?.procedureCode ?? this.authData?.[`procedure${procNo}_procedureCode`]).trim();
      const decisionNo = this.asDisplayString(dd?.decisionNumber).trim() || String(procNo);

      const fromRaw = dd?.fromDate ?? this.authData?.[`procedure${procNo}_fromDate`];
      const toRaw = dd?.toDate ?? this.authData?.[`procedure${procNo}_toDate`];
      const fromComp = this.formatDateCompact(fromRaw);
      const toComp = this.formatDateCompactFull(toRaw);
      const line2 = (fromComp || toComp)
        ? `${fromComp || '—'} → ${toComp || '—'}`
        : '';

      const status = this.computeTabStatus(procNo);

      // line1 = "Decision #N"  (code shown separately as procedureCode)
      const line1 = `Decision #${decisionNo}`;
      const line3 = status.label;
      const line4 = status.reasonText || '';

      return {
        ...t,
        procedureCode: code || t.procedureCode,
        statusText: status.label,
        statusCode: status.label,
        statusClass: status.statusClass,
        reasonText: status.reasonText,
        line1,
        line2,
        line3,
        line4,
        name: line1,
        subtitle: line2
      };
    });

    // Keep bulk rows in sync so the bulk table also shows resolved labels (not numeric IDs)
    if (this.bulkEditMode && this.bulkRows.length) {
      for (const row of this.bulkRows) {
        const status = this.computeTabStatus(row.procedureNo);
        row.currentStatusText = status.label;
        row.currentStatusClass = status.statusClass;
      }
    }
  }



  private buildTabsFromAuthData(): void {
    const set = new Set<number>();

    // 1) Prefer Decision Details items (seeded after AuthDetails save)
    const ddList = (this.itemsBySection?.['Decision Details'] ?? []) as any[];
    for (const x of (ddList ?? [])) {
      const rawData: any = (x as any)?.data ?? (x as any)?.jsonData ?? (x as any)?.payload ?? (x as any)?.itemData ?? null;
      const parsedData: any = this.safeParseJson(rawData) ?? rawData ?? null;

      const p = Number(
        (x as any)?.procedureNo ??
        (x as any)?.procedureIndex ??
        (x as any)?.serviceIndex ??
        (x as any)?.serviceNo ??
        parsedData?.procedureNo ??
        parsedData?.procedureIndex ??
        parsedData?.serviceIndex ??
        parsedData?.serviceNo
      );

      if (Number.isFinite(p) && p > 0) set.add(p);
    }

    // 2) Backward compatible fallback: derive procedureNos from authData procedureN_* keys
    if (!set.size) {
      const keys = Object.keys(this.authData ?? {});
      for (const k of keys) {
        const m = /^procedure(\d+)_/i.exec(k);
        if (m) set.add(Number(m[1]));
      }
    }

    const nums = Array.from(set)
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
    const procedureNos = nums.length ? nums : [];

    this.tabs = procedureNos.map((n, idx) => {
      const dd = this.getExistingDecisionDetails(n) ?? {};
      const code = this.asDisplayString(dd?.serviceCode ?? dd?.procedureCode ?? this.authData?.[`procedure${n}_procedureCode`]).trim();
      const decisionNo = this.asDisplayString(dd?.decisionNumber).trim() || String(n);

      const fromRaw = dd?.fromDate ?? this.authData?.[`procedure${n}_fromDate`];
      const toRaw = dd?.toDate ?? this.authData?.[`procedure${n}_toDate`];
      const fromComp = this.formatDateCompact(fromRaw);
      const toComp = this.formatDateCompactFull(toRaw);
      const line2 = (fromComp || toComp)
        ? `${fromComp || '—'} → ${toComp || '—'}`
        : '';

      const status = this.computeTabStatus(n);
      const line1 = `Decision #${decisionNo}`;

      return {
        id: idx + 1,
        procedureNo: n,
        procedureCode: code,
        statusText: status.label,
        statusCode: status.label,
        statusClass: status.statusClass,
        reasonText: status.reasonText,
        line1,
        line2,
        line3: status.label,
        line4: status.reasonText || '',
        name: line1,
        subtitle: line2
      };
    });
  }

  // ---------------------------
  // UI interactions
  // ---------------------------
  selectTab(tabId: number): void {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    // If switching away from the current tab and form has been modified, show warning
    if (this.selectedTabId !== null && this.selectedTabId !== tabId && this.isFormDirty()) {
      this.pendingTabId = tabId;
      this.showUnsavedWarning = true;
      return;
    }

    this.selectedTabId = tabId;
    this.buildActiveState(tab);
  }

  /** Detects whether the form has been modified since the tab was loaded */
  private isFormDirty(): boolean {
    if (!this.form) return false;
    // Compare current form value snapshot with the initial snapshot
    const currentSnapshot = JSON.stringify(this.form.getRawValue());
    return this.formSnapshot !== '' && currentSnapshot !== this.formSnapshot;
  }

  /** User chose to stay on current tab — close the warning */
  cancelTabSwitch(): void {
    this.showUnsavedWarning = false;
    this.pendingTabId = null;
    this.pendingAddNew = false;
  }

  /** User chose to discard changes and switch — proceed to the pending tab */
  confirmTabSwitch(): void {
    this.showUnsavedWarning = false;
    const tabId = this.pendingTabId;
    const isAddNew = this.pendingAddNew;
    this.pendingTabId = null;
    this.pendingAddNew = false;

    // Reset form dirty state
    this.form.markAsPristine();
    this.formSnapshot = '';
    if (this.formSnapshotTimer) {
      clearTimeout(this.formSnapshotTimer);
      this.formSnapshotTimer = null;
    }

    if (isAddNew) {
      // Re-invoke addDecisionLine now that dirty state is cleared
      this.addDecisionLine();
      return;
    }

    if (tabId === null) return;

    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    this.selectedTabId = tabId;
    this.buildActiveState(tab);
  }

  saveCurrentTab(): void {
    if (!this.activeState || !this.authDetailId) return;

    // IMPORTANT: ensure validators only apply to visible+enabled controls
    this.syncVisibility();

    if (this.form.invalid) {
      this.markVisibleControlsTouched();
      this.errorMsg = 'Please fill the required fields before saving.';
      return;
    }

    const userId = Number(sessionStorage.getItem('loggedInUserid') || 0);
    const authDetailId = this.authDetailId;
    const procNo = this.activeState.tab.procedureNo;

    const calls: any[] = [];
    let savedDecisionPayload: any = null; // capture Decision Details payload for reverse sync

    for (const sec of this.activeState.sections) {
      // Member Provider is handled separately via the editable table rows
      if (sec.sectionName === 'Member Provider Decision Info') continue;

      const payload = this.buildSectionPayload(procNo, sec);

      // Timestamp rules apply only to Decision Details
      if (sec.sectionName === 'Decision Details') {
        this.applyDecisionTimestamps(procNo, payload);
        savedDecisionPayload = payload; // store for reverse sync after save
      }

      const existingId = this.activeState.itemIdsBySection?.[sec.sectionName];
      if (existingId) {
        calls.push(
          this.api.updateItem(authDetailId, sec.sectionName, existingId, { data: payload } as any, userId)
        );
      } else {
        calls.push(
          this.api.createItem(authDetailId, sec.sectionName, { data: payload } as any, userId)
        );
      }
    }

    // Add Member Provider Decision Info rows from the editable table
    calls.push(...this.buildSingleMpSaveCalls(authDetailId, procNo, userId));

    this.saving = true;
    this.errorMsg = '';

    forkJoin(calls)
      .pipe(
        finalize(() => (this.saving = false)),
        catchError((e) => {
          console.error(e);
          this.errorMsg = e?.error?.message ?? 'Unable to save decision.';
          this.toastSvc.error('Decision save failed.');
          return of(null);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (res: any) => {
          if (res === null) return;

          // Clear new-line tracking on successful save
          const procNo = this.activeState?.tab?.procedureNo;
          if (procNo) this.newLineIds.delete(procNo);

          this.toastSvc.success('Decision saved successfully.');

          // Forward sync: Decision → authData (existing service sync)
          this.syncDecisionToService(procNo!);

          // Reverse sync: Decision → Source section form controls (Service / Medication / Transportation)
          this.fireDecisionReverseSync(procNo!, savedDecisionPayload);

          // refresh only items, keep template + auth data
          this.refreshItemsOnly();
          // ✅ Refresh shell header so Decision Summary / Overall Decision updates in real-time
          this._shellRefreshHeader?.();
        }
      });
  }

  deleteCurrentTab(): void {
    if (!this.activeState || !this.authDetailId) return;

    const userId = Number(sessionStorage.getItem('loggedInUserid') || 0);
    const authDetailId = this.authDetailId;

    const calls: any[] = [];

    for (const sec of this.activeState.sections) {
      const existingId = this.activeState.itemIdsBySection?.[sec.sectionName];
      if (existingId) {
        calls.push(this.api.deleteItem(authDetailId, sec.sectionName, existingId, userId));
      }
    }

    if (!calls.length) return;

    this.saving = true;
    this.errorMsg = '';

    forkJoin(calls)
      .pipe(
        finalize(() => (this.saving = false)),
        catchError((e) => {
          console.error(e);
          this.errorMsg = e?.error?.message ?? 'Unable to delete decision.';
          return of(null);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: () => {
          this.refreshItemsOnly();
          // ✅ Refresh shell header so Decision Summary updates after delete
          this._shellRefreshHeader?.();
        }
      });
  }

  onFieldChanged(_st: TabState): void {
    // keep for future dirty-state handling
  }

  // ---------------------------
  // VISIBILITY (FIX)
  // ---------------------------

  isSectionVisible(st: TabState, section: DecisionSectionVm): boolean {
    const fields = section?.fields ?? [];
    return fields.some(f => this.isVisible(st, f));
  }

  isVisible(_st: TabState, field: DecisionFieldVm): boolean {
    // NOTE: do NOT hide when isEnabled=false.
    // isEnabled=false means read-only/disabled, but it must still DISPLAY.
    return this.evalFieldVisibility(field);
  }

  private evalFieldVisibility(field: DecisionFieldVm): boolean {
    if (!field) return true;

    // Conditions array (preferred)
    const conds = Array.isArray(field.conditions) ? field.conditions.filter(Boolean) : [];
    if (conds.length > 0) {
      return this.evalConditions(conds);
    }

    // Legacy single condition fields (support template variants)
    const sw = (field.showWhen ?? 'always') as ShowWhen;
    if (sw === 'always') return true;

    const refId = field.referenceFieldId ?? null;
    const val = (field.visibilityValue ?? null);

    if (!refId) return true; // cannot evaluate -> show

    return this.evalOne(sw, refId, val);
  }

  private evalConditions(conds: TplCondition[]): boolean {
    let result: boolean | null = null;

    for (let i = 0; i < conds.length; i++) {
      const c = conds[i];
      const sw = (c?.showWhen ?? 'always') as ShowWhen;

      // "always" inside conditions -> doesn't restrict; treat as true
      let current = true;

      if (sw !== 'always') {
        const refId = c?.referenceFieldId ?? null;
        if (!refId) {
          current = true; // no reference -> can't evaluate -> show
        } else {
          current = this.evalOne(sw, refId, c?.value);
        }
      }

      if (result === null) {
        result = current;
      } else {
        const op = (c?.operatorWithPrev ?? 'AND').toUpperCase();
        result = op === 'OR' ? (result || current) : (result && current);
      }
    }

    return result ?? true;
  }

  private evalOne(showWhen: ShowWhen, referenceFieldId: string, visibilityValue: any): boolean {
    const refCtrlName =
      this.fieldIdToControlName.get(referenceFieldId) ??
      referenceFieldId; // fallback (if template stores controlName directly)

    const ctrl = this.form?.get(refCtrlName);
    const raw = this.unwrapValue(ctrl?.value);

    switch (showWhen) {
      case 'fieldEquals':
        return String(raw ?? '') === String(visibilityValue ?? '');
      case 'fieldNotEquals':
        return String(raw ?? '') !== String(visibilityValue ?? '');
      case 'fieldhasvalue':
        if (raw === null || raw === undefined) return false;
        if (typeof raw === 'string') return raw.trim().length > 0;
        if (Array.isArray(raw)) return raw.length > 0;
        return true;
      case 'always':
      default:
        return true;
    }
  }

  /**
   * Enable/disable controls based on visibility + isEnabled.
   * - Invisible -> always disable (so required won't block save)
   * - Visible but isEnabled=false -> keep disabled (read-only)
   * - Visible and isEnabled=true -> enable
   */
  private syncVisibility(): void {
    if (!this.activeState || !this.form) return;
    if (this.visibilitySyncInProgress) return;

    this.visibilitySyncInProgress = true;
    try {
      for (const sec of this.activeState.sections) {
        for (const f of sec.fields) {
          const shouldShow = this.evalFieldVisibility(f);
          const ctrl = this.form.get(f.controlName);
          if (!ctrl) continue;

          const canEnable = shouldShow && f.isEnabled !== false;

          if (!shouldShow) {
            if (!ctrl.disabled) ctrl.disable({ emitEvent: false });
          } else {
            // shouldShow = true
            if (canEnable) {
              if (ctrl.disabled) ctrl.enable({ emitEvent: false });
            } else {
              if (!ctrl.disabled) ctrl.disable({ emitEvent: false });
            }
          }
        }
      }
    } finally {
      this.visibilitySyncInProgress = false;
    }
  }

  private markVisibleControlsTouched(): void {
    if (!this.activeState || !this.form) return;

    for (const sec of this.activeState.sections) {
      for (const f of sec.fields) {
        const shouldShow = this.evalFieldVisibility(f);
        if (!shouldShow) continue;

        const ctrl = this.form.get(f.controlName);
        // only mark enabled controls (disabled fields won't show required errors anyway)
        if (ctrl && !ctrl.disabled) ctrl.markAsTouched();
      }
    }
  }

  // ---------------------------
  // UI helpers
  // ---------------------------
  getDropdownOptions(controlName: string): UiSmartOption[] {
    return this.optionsByControlName[controlName] ?? [];
  }

  getCtrl(controlName: string): FormControl {
    return this.form.get(controlName) as FormControl;
  }

  isInvalidField(f: DecisionFieldVm): boolean {
    const c = this.form.get(f.controlName);
    return !!(c && c.touched && c.invalid);
  }

  // ---------------------------
  // Build view-model for a tab
  // ---------------------------
  private buildActiveState(tab: DecisionTab): void {
    // kill previous tab subscriptions
    this.tabDestroy$.next();

    const procedureNo = tab.procedureNo;

    // Build 3 sections from template
    const sections: DecisionSectionVm[] = this.extractDecisionSectionsFromTemplate().map((sec: any) => {
      const sectionName = String(sec?.sectionName ?? sec?.SectionName ?? '').trim() as DecisionSectionName;
      const fields = this.getSectionFields(sec).map((f: any) => this.toFieldVm(f));
      return { sectionName, fields };
    });

    // For new unsaved lines, enable ALL fields so the user can fill everything in.
    // Once saved, refreshItemsOnly() rebuilds from the template, restoring original isEnabled config.
    const isNewLine = this.newLineIds.has(procedureNo);
    if (isNewLine) {
      for (const sec of sections) {
        for (const field of sec.fields) {
          field.isEnabled = true;
        }
      }
    }

    // Attach values from backend items (preferred) or authData (fallback)
    const itemIdsBySection: Partial<Record<DecisionSectionName, string>> = {};

    for (const sec of sections) {
      const { itemId, data } = this.findItemForSectionAndProcedure(sec.sectionName, procedureNo);
      if (itemId) itemIdsBySection[sec.sectionName] = itemId;

      for (const field of sec.fields) {
        // 1) item data wins
        let v = data?.[field.id];
        // No cross-step fallback here: Decision Details are seeded after AuthDetails save.

        const normalized = String(field.type ?? '').toLowerCase() === 'select'
          ? (this.extractPrimitive(v) ?? v)
          : v;

        const t = String(field.type ?? '').toLowerCase();
        if (t === 'datetime-local') {
          field.value = this.toDateTimeLocalString(normalized) ?? this.defaultValueForType(field.type);
        } else {
          field.value = normalized ?? this.defaultValueForType(field.type);
        }
      }
    }

    // Build reactive form controls
    this.buildFormForSections(sections, procedureNo);

    // prefetch options for select fields (datasource/static)
    this.prefetchDropdownOptions(sections);

    this.activeState = {
      tab,
      sections,
      itemIdsBySection
    };

    // Load Member Provider rows into editable table
    this.loadSingleMpRows(procedureNo, sections);

    // Decision Status -> Decision Status Code dependency
    this.wireDecisionStatusCodeDependency();

    // initial visibility sync + watch for changes
    this.syncVisibility();
    this.form.valueChanges
      .pipe(takeUntil(this.tabDestroy$), takeUntil(this.destroy$))
      .subscribe(() => this.syncVisibility());

    // Capture a snapshot of the form after it's fully initialized (deferred to allow async option loads)
    // Cancel any pending snapshot from a previous tab first
    if (this.formSnapshotTimer) {
      clearTimeout(this.formSnapshotTimer);
      this.formSnapshotTimer = null;
    }
    this.formSnapshot = '';
    this.formSnapshotTimer = setTimeout(() => {
      this.formSnapshot = JSON.stringify(this.form.getRawValue());
      this.formSnapshotTimer = null;
    }, 0);
  }

  private defaultValueForType(type?: string): any {
    const t = String(type ?? '').toLowerCase();
    if (t === 'checkbox') return false;
    if (t === 'select') return null;
    if (t === 'datetime-local') return null;
    if (t === 'textarea') return '';
    return '';
  }

  /**
   * ✅ IMPORTANT FIX:
   * TemplateSectionsResponse can contain duplicates/partial objects because of jsonb_path_query.
   * We MUST MERGE all fragments per sectionName, otherwise only a subset of fields show.
   */
  private extractDecisionSectionsFromTemplate(): any[] {
    const wantedOrder: DecisionSectionName[] = [
      'Decision Details',
      'Member Provider Decision Info',
      'Decision Notes'
    ];
    const wanted = new Set<string>(wantedOrder as unknown as string[]);

    // sectionName -> fieldId -> fieldObj
    const fieldMapBySection = new Map<string, Map<string, any>>();
    // sectionName -> base section obj (first seen)
    const baseSectionByName = new Map<string, any>();

    for (const s of this.templateSections ?? []) {
      const name = String((s as any)?.sectionName ?? (s as any)?.SectionName ?? '').trim();
      if (!wanted.has(name)) continue;

      const fields = this.getSectionFields(s);
      if (!Array.isArray(fields) || fields.length === 0) continue;

      if (!baseSectionByName.has(name)) baseSectionByName.set(name, s);

      const fmap = fieldMapBySection.get(name) ?? new Map<string, any>();
      for (const f of fields) {
        const fid = String(f?.id ?? f?.fieldId ?? '').trim();
        if (!fid) continue;

        // keep the one with more properties / higher order (best-effort)
        if (!fmap.has(fid)) {
          fmap.set(fid, f);
        } else {
          const existing = fmap.get(fid);
          const exKeys = existing ? Object.keys(existing).length : 0;
          const fKeys = f ? Object.keys(f).length : 0;
          if (fKeys >= exKeys) fmap.set(fid, f);
        }
      }
      fieldMapBySection.set(name, fmap);
    }

    // Build merged sections in the right order
    const merged: any[] = [];
    for (const secName of wantedOrder as unknown as string[]) {
      const base = baseSectionByName.get(secName);
      const fmap = fieldMapBySection.get(secName);
      if (!base || !fmap) continue;

      const mergedFields = Array.from(fmap.values()).sort((a: any, b: any) => {
        const ao = Number(a?.order ?? a?.Order ?? 0);
        const bo = Number(b?.order ?? b?.Order ?? 0);
        return ao - bo;
      });

      merged.push({
        ...base,
        sectionName: secName,
        fields: mergedFields
      });
    }

    return merged;
  }

  private getSectionFields(sec: any): any[] {
    return (
      (sec as any)?.fields ??
      (sec as any)?.Fields ??
      (sec as any)?.sectionFields ??
      (sec as any)?.SectionFields ??
      []
    );
  }

  private toFieldVm(f: any): DecisionFieldVm {
    const id = String(f?.id ?? f?.fieldId ?? '').trim();
    const displayName = String(f?.displayName ?? f?.label ?? id);
    const type = String(f?.type ?? 'text');

    return {
      ...f,
      id,
      controlName: '',
      displayName,
      type,
      isEnabled: f?.isEnabled !== false,
      value: this.defaultValueForType(type),
      selectedOptions: (f as any)?.selectedOptions
    };
  }

  private buildSectionPayload(procedureNo: number, sec: DecisionSectionVm): any {
    const obj: any = {
      procedureNo
    };

    for (const f of sec.fields) {
      const ctrl = this.form.get(f.controlName);
      const rawVal = ctrl?.value;
      obj[f.id] = this.unwrapValue(rawVal);

      // For select fields, also save the display label so we never show raw IDs on reload
      if (String(f.type ?? '').toLowerCase() === 'select' && rawVal != null) {
        const opts = this.optionsByControlName[f.controlName] ?? [];
        const prim = String(this.unwrapValue(rawVal) ?? '').trim();
        const matchedOpt = opts.find((o: any) => String((o as any)?.value ?? '').trim() === prim);
        if (matchedOpt) {
          obj[f.id + 'Label'] = String((matchedOpt as any)?.label ?? (matchedOpt as any)?.text ?? '').trim();
        }
      }
    }

    // Source-type-aware procedureCode / procedureDescription metadata
    const sourceType = this.getSourceTypeForProcedureNo(procedureNo);

    if (sourceType === 'medication') {
      const medNo = procedureNo - 1000;
      obj.procedureCode        = this.authData?.[`medication${medNo}_medicationCode`]        ?? obj.serviceCode        ?? null;
      obj.procedureDescription = this.authData?.[`medication${medNo}_medicationDescription`] ?? obj.serviceDescription ?? null;
      obj.sourceType           = 'medication';
      obj.sourceMedNo          = medNo;
    } else if (sourceType === 'transportation') {
      // serviceCode/serviceDescription were seeded directly from transport code fields
      obj.procedureCode        = obj.serviceCode        ?? null;
      obj.procedureDescription = obj.serviceDescription ?? null;
      obj.sourceType           = 'transportation';
    } else {
      // Original service lookup
      obj.procedureCode        = this.authData?.[`procedure${procedureNo}_procedureCode`]        ?? null;
      obj.procedureDescription = this.authData?.[`procedure${procedureNo}_procedureDescription`] ?? null;
      obj.sourceType           = 'service';
    }

    return obj;
  }

  // ---------------------------
  // Reactive form helpers
  // ---------------------------
  private makeControlName(procedureNo: number, sectionName: string, fieldId: string): string {
    const sec = String(sectionName || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const fid = String(fieldId || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    return `p${procedureNo}_${sec}_${fid}`;
  }

  private buildFormForSections(sections: DecisionSectionVm[], procedureNo: number): void {
    const group: Record<string, FormControl> = {};

    // Reset options per tab to avoid leaking previous tab options
    this.optionsByControlName = {};
    this.fieldIdToControlName.clear();

    for (const sec of sections) {
      for (const f of sec.fields) {
        f.controlName = this.makeControlName(procedureNo, sec.sectionName, f.id);
        this.fieldIdToControlName.set(f.id, f.controlName);

        const required = !!(f.required || f.isRequired);
        const validators = required ? [Validators.required] : [];
        const ctrl = new FormControl(f.value, validators);

        // if read-only
        if (!f.isEnabled) ctrl.disable({ emitEvent: false });

        group[f.controlName] = ctrl;
      }
    }

    this.form = this.fb.group(group);
  }

  private unwrapValue(v: any): any {
    if (v && typeof v === 'object' && 'value' in v) return (v as any).value;
    return v;
  }

  private findItemForSectionAndProcedure(sectionName: DecisionSectionName, procedureNo: number): { itemId: string | null; data: any } {
    const list = (this.itemsBySection?.[sectionName] ?? []) as any[];
    if (!Array.isArray(list) || !list.length) return { itemId: null, data: {} };

    const match = list.find((x) => {
      // Some APIs store procedureNo at the top-level; others store it inside the section's `data` json.
      const rawData: any = (x as any)?.data ?? (x as any)?.jsonData ?? (x as any)?.payload ?? (x as any)?.itemData ?? null;
      const parsedData: any = this.safeParseJson(rawData) ?? rawData ?? null;

      const p = Number(
        (x as any)?.procedureNo ??
        (x as any)?.procedureIndex ??
        (x as any)?.serviceIndex ??
        (x as any)?.serviceNo ??
        parsedData?.procedureNo ??
        parsedData?.procedureIndex ??
        parsedData?.serviceIndex ??
        parsedData?.serviceNo
      );

      return p === procedureNo;
    });

    const picked = match ?? (procedureNo === 1 ? list[0] : null);
    if (!picked) return { itemId: null, data: {} };

    const itemId = String((picked as any)?.itemId ?? (picked as any)?.id ?? (picked as any)?.decisionItemId ?? '');
    const raw = (picked as any)?.data ?? (picked as any)?.jsonData ?? (picked as any)?.payload ?? (picked as any)?.itemData ?? {};
    const data = this.safeParseJson(raw) ?? raw ?? {};

    return { itemId: itemId || null, data };
  }

  /** Return ALL items matching a section + procedureNo (for multi-row sections like Member Provider). */
  private findAllItemsForSectionAndProcedure(sectionName: DecisionSectionName, procedureNo: number): Array<{ itemId: string | null; data: any }> {
    const list = (this.itemsBySection?.[sectionName] ?? []) as any[];
    if (!Array.isArray(list) || !list.length) return [];

    const results: Array<{ itemId: string | null; data: any }> = [];

    for (const x of list) {
      const rawData: any = (x as any)?.data ?? (x as any)?.jsonData ?? (x as any)?.payload ?? (x as any)?.itemData ?? null;
      const parsedData: any = this.safeParseJson(rawData) ?? rawData ?? null;

      const p = Number(
        (x as any)?.procedureNo ?? (x as any)?.procedureIndex ?? (x as any)?.serviceIndex ?? (x as any)?.serviceNo ??
        parsedData?.procedureNo ?? parsedData?.procedureIndex ?? parsedData?.serviceIndex ?? parsedData?.serviceNo
      );

      if (p === procedureNo || (!Number.isFinite(p) && procedureNo === 1)) {
        const itemId = String((x as any)?.itemId ?? (x as any)?.id ?? (x as any)?.decisionItemId ?? '');
        const raw = (x as any)?.data ?? (x as any)?.jsonData ?? (x as any)?.payload ?? (x as any)?.itemData ?? {};
        const data = this.safeParseJson(raw) ?? raw ?? {};
        results.push({ itemId: itemId || null, data });
      }
    }

    return results;
  }

  private prefetchDropdownOptions(sections: DecisionSectionVm[]): void {
    const selectFields: DecisionFieldVm[] = [];
    for (const s of sections) {
      for (const f of s.fields) {
        if (String(f.type).toLowerCase() === 'select') selectFields.push(f);
      }
    }
    if (!selectFields.length) return;

    // 1) static select options
    for (const f of selectFields) {
      const ds = String((f as any).datasource ?? '').trim();
      if (ds) continue;

      const staticOpts = this.mapStaticOptions(((f as any).options ?? (f as any).level ?? []) as any[]);
      this.optionsByControlName[f.controlName] = this.filterBySelectedOptions(f, staticOpts);
      this.reconcileSelectValue(f);
      this.ensureDecisionStatusDefaultIfNeeded(f);
    }

    // 2) datasource select options
    const byDatasource = new Map<string, DecisionFieldVm[]>();
    for (const f of selectFields) {
      const ds = String((f as any).datasource ?? '').trim();
      if (!ds) continue;
      const list = byDatasource.get(ds) ?? [];
      list.push(f);
      byDatasource.set(ds, list);
    }

    for (const [ds, fields] of byDatasource.entries()) {
      const cacheHit = this.dropdownCache.get(ds);
      if (cacheHit) {
        for (const f of fields) {
          this.optionsByControlName[f.controlName] = this.filterBySelectedOptions(f, cacheHit);
          this.reconcileSelectValue(f);
          this.ensureDecisionStatusDefaultIfNeeded(f);
        }
        continue;
      }

      this.dsLookup.getOptionsWithFallback(
        ds,
        (r: any) => this.mapDatasourceRowToOption(ds, r) as any,
        ['UM', 'Admin', 'Provider']
      )
        // ✅ FIX: takeUntil prevents stale subscriptions from firing after tab rebuilds
        //        and overwriting correctly-set options with outdated data.
        .pipe(catchError(() => of([])), takeUntil(this.tabDestroy$), takeUntil(this.destroy$))
        .subscribe((opts) => {
          const safe = (opts ?? []) as any[];

          // Debug: log loaded options for status datasources
          const dsNorm = this.normDs(ds);
          if (dsNorm.includes('decisionstatus')) {
            console.log(`[AuthDecision] Loaded datasource "${ds}": ${safe.length} options.`,
              safe.slice(0, 3).map((o: any) => ({ value: o?.value, label: o?.label, rawKeys: o?.raw ? Object.keys(o.raw) : 'primitive' }))
            );
          }

          this.dropdownCache.set(ds, safe);

          for (const f of fields) {
            const finalOpts = this.filterBySelectedOptions(f, safe);
            this.optionsByControlName[f.controlName] = finalOpts;
            this.reconcileSelectValue(f);
            this.ensureDecisionStatusDefaultIfNeeded(f);
          }

          // After status-related options load, refresh tab labels so IDs become display names
          if (dsNorm.includes('decisionstatus')) {
            this.updateTabStatuses();
          }

          // ✅ FIX: After async options arrive (first load / cache miss), re-apply the
          //        Decision Status → Status Code filter. Without this, the filter ran
          //        earlier with an empty option list, cleared the saved value, and never
          //        re-ran once the real options became available.
          if (dsNorm.includes('decisionstatus') || dsNorm.includes('decisionstatuscode')) {
            this.applyStatusCodeFilterNow();
          }
        });

    }
  }

  private isDecisionStatusField(field: DecisionFieldVm): boolean {
    return String(field?.id ?? '').trim().toLowerCase() === 'decisionstatus';
  }

  private findPendedStatusOption(options: UiSmartOption[]): UiSmartOption | null {
    for (const o of (options ?? [])) {
      const lbl = String((o as any)?.label ?? (o as any)?.text ?? '').trim().toLowerCase();
      if (lbl.startsWith('pend')) return o;
      const raw: any = (o as any)?.raw;
      const rawLbl = String(raw?.name ?? raw?.label ?? raw?.text ?? raw?.decisionStatusName ?? '').trim().toLowerCase();
      if (rawLbl.startsWith('pend')) return o;
    }
    return null;
  }

  /**
   * Requirement: Decision Status dropdown should display "Pended" by default on first load.
   * We set the control to the option whose label is "Pended" (or starts with "Pend").
   * This avoids hardcoding ids (0/1/etc.).
   */
  private ensureDecisionStatusDefaultIfNeeded(field: DecisionFieldVm): void {
    if (!this.activeState || !this.form) return;
    if (!this.isDecisionStatusField(field)) return;

    const ctrl = this.form.get(field.controlName);
    if (!ctrl) return;

    const current = this.extractPrimitive(this.unwrapValue(ctrl.value)) ?? this.unwrapValue(ctrl.value);
    const hasValue = String(current ?? '').trim() !== '';
    if (hasValue) return;

    const opts = this.optionsByControlName[field.controlName] ?? [];
    const pended = this.findPendedStatusOption(opts);
    if (!pended) return;

    this.pendedDecisionStatusValue = (pended as any).value;
    ctrl.setValue((pended as any).value, { emitEvent: false });
    field.value = (pended as any).value;
  }

  /**
   * Filter Decision Status Code options based on selected Decision Status.
   * Common pattern: Approved status shows approval reason codes; Denied status shows denial reason codes.
   */
  private wireDecisionStatusCodeDependency(): void {
    if (!this.activeState || !this.form) return;

    const ddSection = this.activeState.sections.find(s => s.sectionName === 'Decision Details');
    if (!ddSection) return;

    const statusField = ddSection.fields.find(f => String(f.id).toLowerCase() === 'decisionstatus');
    const statusCodeField = ddSection.fields.find(f => String(f.id).toLowerCase() === 'decisionstatuscode');
    if (!statusField || !statusCodeField) return;

    const statusCtrl = this.form.get(statusField.controlName);
    const codeCtrl = this.form.get(statusCodeField.controlName);
    if (!statusCtrl || !codeCtrl) return;

    // Optional Decision DateTime control: update it when status changes (UX requirement)
    const decisionDtField = ddSection.fields.find(f => String(f.id).toLowerCase() === 'decisiondatetime');
    const decisionDtCtrl = decisionDtField ? this.form.get(decisionDtField.controlName) : null;

    const getFullOpts = (): SmartOpt[] => {
      const ds = String((statusCodeField as any).datasource ?? '').trim();
      if (ds) return (this.dropdownCache.get(ds) ?? []) as SmartOpt[];
      return (this.optionsByControlName[statusCodeField.controlName] ?? []) as SmartOpt[];
    };

    const applyFilter = () => {
      const rawStatus = this.extractPrimitive(this.unwrapValue(statusCtrl.value)) ?? this.unwrapValue(statusCtrl.value);
      const statusKey = String(rawStatus ?? '').trim();
      this.syncApprovedDeniedToRequested(ddSection, statusField, statusKey);
      const full = getFullOpts();

      // Pended => clear statusCode
      if (this.isPendedStatus(statusKey)) {
        this.optionsByControlName[statusCodeField.controlName] = [];
        if (codeCtrl.value) codeCtrl.setValue(null, { emitEvent: false });

        // If status is pended, decisionDateTime should not be set
        if (decisionDtCtrl && decisionDtCtrl.value) {
          decisionDtCtrl.setValue(null, { emitEvent: false });
        }
        return;
      }

      // ✅ FIX: If statusCode options haven't loaded from the datasource yet, bail out
      //        without clearing the saved value. applyStatusCodeFilterNow() will be
      //        called again once the async options arrive and populate the cache.
      if (full.length === 0) {
        return;
      }

      // Non-pended status: if decisionDateTime is empty, set it immediately for display.
      if (decisionDtCtrl) {
        const cur = String(decisionDtCtrl.value ?? '').trim();
        if (!cur) {
          const nowIso = new Date().toISOString();
          decisionDtCtrl.setValue(this.toDateTimeLocalString(nowIso), { emitEvent: false });
        }
      }

      // Filter by matching status id/code on the option's raw object (best-effort)
      const filtered = (full ?? []).filter((o: any) => {
        const raw: any = o?.raw ?? o;
        const cand =
          raw?.decisionStatus ??
          raw?.decisionStatusId ??
          raw?.statusId ??
          raw?.status ??
          raw?.parentId ??
          raw?.groupId ??
          null;
        if (cand === null || cand === undefined || String(cand).trim() === '') return true; // keep if no mapping
        return String(cand).trim() === statusKey;
      });

      const finalOpts = filtered.length ? filtered : full;

      // Safety net: re-resolve any options whose labels still look like bare numeric IDs
      const resolvedOpts = finalOpts.map((o: any) => {
        const lbl = String((o as any)?.label ?? '').trim();
        if (lbl && /^\d+$/.test(lbl)) {
          const raw: any = (o as any)?.raw;
          const val = String((o as any)?.value ?? '').trim();
          // Try raw object fields first, then cache-based lookup
          const betterLabel =
            (raw ? (
              raw?.decisionStatusCodeName ?? raw?.decisionStatusName ??
              raw?.decisionStatusCode ??
              raw?.decisionStatusReasonName ??
              raw?.reasonDescription ?? raw?.description ?? raw?.displayName ??
              raw?.reason ?? raw?.name ?? raw?.label ?? raw?.text ?? raw?.title ??
              this.pickDisplayField(raw)
            ) : null) ??
            this.decisionStatusCodeLabelFromValue(val) ??
            this.decisionStatusCodeLabelFromValue(lbl);
          if (betterLabel && String(betterLabel).trim() && !/^\d+$/.test(String(betterLabel).trim())) {
            return { ...o, label: String(betterLabel).trim(), text: String(betterLabel).trim() };
          }
        }
        return o;
      });

      this.optionsByControlName[statusCodeField.controlName] = [...resolvedOpts];

      // ✅ FIX: use resolvedOpts (what we actually set into optionsByControlName) for the
      //        value-presence check, not the pre-resolve finalOpts. Also fall back to the
      //        full list before clearing so a filter that's too aggressive doesn't wipe a valid value.
      const current = this.extractPrimitive(this.unwrapValue(codeCtrl.value)) ?? this.unwrapValue(codeCtrl.value);
      const currentKey = String(current ?? '').trim();
      if (currentKey) {
        const okInResolved = resolvedOpts.some((o: any) => String((o as any)?.value ?? this.extractPrimitive((o as any)?.raw) ?? '').trim() === currentKey);
        const okInFull    = !okInResolved && full.some((o: any) => String((o as any)?.value ?? '').trim() === currentKey);
        if (!okInResolved && !okInFull) {
          codeCtrl.setValue(null, { emitEvent: false });
        }
      }
    };

    // Apply once on load and on status change
    applyFilter();
    statusCtrl.valueChanges
      .pipe(takeUntil(this.tabDestroy$), takeUntil(this.destroy$))
      .subscribe(() => applyFilter());
  }

  /**
   * ✅ PERMANENT FIX — Re-applies the Decision Status → Status Code filter using
   * whatever options are currently in the cache/optionsByControlName map.
   *
   * Called after async option loads complete so the filter runs with a real option
   * list even when the datasource wasn't cached at the time wireDecisionStatusCodeDependency()
   * first executed.  Does NOT add a new valueChanges subscription — that is wired
   * once by wireDecisionStatusCodeDependency and is kept alive for the full tab lifetime.
   */
  private applyStatusCodeFilterNow(): void {
    if (!this.activeState || !this.form) return;

    const ddSection = this.activeState.sections.find(s => s.sectionName === 'Decision Details');
    if (!ddSection) return;

    const statusField     = ddSection.fields.find(f => String(f.id).toLowerCase() === 'decisionstatus');
    const statusCodeField = ddSection.fields.find(f => String(f.id).toLowerCase() === 'decisionstatuscode');
    if (!statusField || !statusCodeField) return;

    const statusCtrl = this.form.get(statusField.controlName);
    const codeCtrl   = this.form.get(statusCodeField.controlName);
    if (!statusCtrl || !codeCtrl) return;

    // Get the full statusCode option list from the cache (preferred) or optionsByControlName
    const ds   = String((statusCodeField as any).datasource ?? '').trim();
    const full = (ds
      ? (this.dropdownCache.get(ds) ?? [])
      : (this.optionsByControlName[statusCodeField.controlName] ?? [])
    ) as SmartOpt[];

    // Nothing to do yet — options still loading
    if (full.length === 0) return;

    const rawStatus = this.extractPrimitive(this.unwrapValue(statusCtrl.value)) ?? this.unwrapValue(statusCtrl.value);
    const statusKey = String(rawStatus ?? '').trim();

    // If pended: wipe statusCode options and value (same as applyFilter does)
    if (this.isPendedStatus(statusKey)) {
      this.optionsByControlName[statusCodeField.controlName] = [];
      if (codeCtrl.value) codeCtrl.setValue(null, { emitEvent: false });
      return;
    }

    // Filter by the parent status id/code stored on each option's raw object
    const filtered = full.filter((o: any) => {
      const raw: any = (o as any)?.raw ?? o;
      const cand =
        raw?.decisionStatus    ??
        raw?.decisionStatusId  ??
        raw?.statusId          ??
        raw?.status            ??
        raw?.parentId          ??
        raw?.groupId           ??
        null;
      if (cand === null || cand === undefined || String(cand).trim() === '') return true;
      return String(cand).trim() === statusKey;
    });

    const finalOpts = filtered.length ? filtered : full;

    // Re-resolve any labels that are still bare numeric IDs
    const resolvedOpts = finalOpts.map((o: any) => {
      const lbl = String((o as any)?.label ?? '').trim();
      if (lbl && /^\d+$/.test(lbl)) {
        const raw: any = (o as any)?.raw;
        const val = String((o as any)?.value ?? '').trim();
        const betterLabel =
          (raw ? (
            raw?.decisionStatusCodeName ?? raw?.decisionStatusName   ??
            raw?.decisionStatusCode     ?? raw?.decisionStatusReasonName ??
            raw?.reasonDescription      ?? raw?.description ?? raw?.displayName ??
            raw?.reason ?? raw?.name    ?? raw?.label ?? raw?.text ?? raw?.title ??
            this.pickDisplayField(raw)
          ) : null) ??
          this.decisionStatusCodeLabelFromValue(val) ??
          this.decisionStatusCodeLabelFromValue(lbl);
        if (betterLabel && String(betterLabel).trim() && !/^\d+$/.test(String(betterLabel).trim())) {
          return { ...o, label: String(betterLabel).trim(), text: String(betterLabel).trim() };
        }
      }
      return o;
    });

    this.optionsByControlName[statusCodeField.controlName] = [...resolvedOpts];

    // Reconcile the current value against the resolved option list.
    // Also attempt to recover a saved value that was previously cleared by the
    // early applyFilter call (when options hadn't loaded yet).
    const savedVal = this.extractPrimitive(this.unwrapValue(codeCtrl.value)) ?? this.unwrapValue(codeCtrl.value);
    const savedKey = String(savedVal ?? '').trim();

    if (savedKey) {
      // Confirm it exists in the resolved list
      const ok = resolvedOpts.some((o: any) => String((o as any)?.value ?? '').trim() === savedKey);
      if (!ok) {
        // Check full list before clearing — filter may have been too strict
        const okFull = full.some((o: any) => String((o as any)?.value ?? '').trim() === savedKey);
        if (!okFull) codeCtrl.setValue(null, { emitEvent: false });
      }
    } else {
      // Value was null (possibly cleared by early applyFilter). Try to re-read the
      // saved value from the backend item data so the field repopulates correctly.
      if (this.activeState) {
        const procNo = this.activeState.tab.procedureNo;
        const { data } = this.findItemForSectionAndProcedure('Decision Details', procNo);
        const savedCode = this.extractPrimitive(data?.['decisionStatusCode']) ?? data?.['decisionStatusCode'];
        const savedCodeStr = String(savedCode ?? '').trim();
        if (savedCodeStr) {
          const match = resolvedOpts.find((o: any) => String((o as any)?.value ?? '').trim() === savedCodeStr);
          if (match) {
            codeCtrl.setValue((match as any).value, { emitEvent: false });
          }
        }
      }
    }
  }

  private filterBySelectedOptions(field: DecisionFieldVm, options: UiSmartOption[]): UiSmartOption[] {
    const allowed = (field as any).selectedOptions as any[] | undefined;
    if (!Array.isArray(allowed) || allowed.length === 0) return options ?? [];
    const allowedSet = new Set(allowed.map(a => String(a)));

    // Some templates store selectedOptions as *ids* while our dropdown value may be a *code*.
    // Keep an option if either its value OR a reasonable raw key matches an allowed value.
    return (options ?? []).filter(o => {
      const v = String((o as any)?.value ?? '').trim();
      if (allowedSet.has(v)) return true;

      const r: any = (o as any)?.raw;
      if (!r) return false;
      const rawCandidates = [
        r?.id,
        r?.value,
        r?.code,
        r?.key,
        r?.decisionStatusCode,
        r?.decisionTypeCode
      ];
      return rawCandidates.some(x => allowedSet.has(String(x ?? '').trim()));
    });
  }

  private reconcileSelectValue(field: DecisionFieldVm): void {
    const ctrl = this.form.get(field.controlName);
    if (!ctrl) return;

    const rawVal = this.extractPrimitive(this.unwrapValue(ctrl.value)) ?? this.unwrapValue(ctrl.value);
    const v = String(rawVal ?? '').trim();
    if (!v) return;

    const opts = this.optionsByControlName[field.controlName] ?? [];

    // 1) direct match (type-tolerant: compare as trimmed strings)
    const direct = opts.find(o => String((o as any)?.value ?? '').trim() === v);
    if (direct) {
      // Ensure the control holds the exact option value so ui-smart-dropdown can match it
      if (ctrl.value !== (direct as any).value) {
        ctrl.setValue((direct as any).value, { emitEvent: false });
      }
      return;
    }

    // 2) loose numeric match: "1" should match 1 and vice-versa
    if (/^\d+$/.test(v)) {
      const numMatch = opts.find(o => {
        const ov = (o as any)?.value;
        return String(ov ?? '').trim() === v || Number(ov) === Number(v);
      });
      if (numMatch) {
        ctrl.setValue((numMatch as any).value, { emitEvent: false });
        return;
      }
    }

    // 3) match against common raw keys (fix: backend stored id but UI expects code, etc.)
    const alt = opts.find(o => {
      const r: any = (o as any)?.raw;
      if (!r) return false;
      const cands = [r?.id, r?.value, r?.code, r?.key, r?.decisionStatusCode, r?.decisionTypeCode];
      return cands.some(x => String(x ?? '').trim() === v || (typeof x === 'number' && String(x) === v));
    });

    if (alt) {
      ctrl.setValue((alt as any).value, { emitEvent: false });
      return;
    }

    // 4) For Decision Status fields, do NOT clear value to null if options just haven't loaded yet.
    //    Only clear if options are loaded and genuinely don't contain the value.
    if (this.isDecisionStatusField(field) && opts.length === 0) {
      // Options haven't loaded yet — keep the current value, it will be reconciled when options arrive
      return;
    }

    // 5) invalid / stale value
    ctrl.setValue(null, { emitEvent: false });
  }


  private mapStaticOptions(raw: any[]): UiSmartOption[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((x) => {
        if (x == null) return null;
        if (typeof x === 'string' || typeof x === 'number') {
          return { value: x, label: String(x), text: String(x) } as any;
        }
        const value = x?.value ?? x?.id ?? x?.code ?? x?.key;
        const label = x?.label ?? x?.text ?? x?.name ?? x?.description ?? String(value ?? '');
        return { value, label, text: label, raw: x } as any;
      })
      .filter(Boolean) as any;
  }

  private refreshItemsOnly(): void {
    if (!this.authDetailId || !this.activeState) return;

    // Skip if we're in the middle of adding a new line —
    // refreshAndSelectProcedure is already handling the refresh.
    if (this.refreshingForNewLine) return;

    const sections: DecisionSectionName[] = [
      'Decision Details',
      'Member Provider Decision Info',
      'Decision Notes'
    ];

    this.loading = true;
    forkJoin(
      sections.reduce((acc, s) => {
        acc[s] = this.api.getItems(this.authDetailId!, s).pipe(catchError(() => of([])));
        return acc;
      }, {} as Record<DecisionSectionName, any>)
    )
      .pipe(finalize(() => (this.loading = false)), takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          this.itemsBySection = res ?? {};
          this.updateTabStatuses();
          const tab = this.tabs.find((t) => t.id === this.selectedTabId) ?? this.tabs[0];
          if (tab) this.buildActiveState(tab);
        },
        error: (e) => {
          console.error(e);
          this.errorMsg = 'Unable to reload decision items.';
        }
      });
  }

  // ═══════════════════════════════════════════════════════════
  //  BI-DIRECTIONAL SYNC: Decision ⟷ Service (AuthDetails)
  //
  //  • syncDecisionToService(): After a decision save, pushes
  //    relevant fields (code, dates, units) back into the
  //    auth's jsonData so the service section stays consistent.
  //
  //  • syncServiceToDecision(): Called when the component
  //    receives updated authData (e.g. after AuthDetails save).
  //    Pushes service-level changes into existing decision items.
  // ═══════════════════════════════════════════════════════════

  /**
   * After decision save: push relevant decision data back into auth jsonData
   * so the Service / Medication / Transportation sections in AuthDetails
   * reflect the decision state.
   *
   * Routes by procedureNo partition:
   *   1 – 999   → Service   (procedure{n}_*)
   *   1000–1999 → Medication (medication{n}_*)
   *   2000+     → Transportation (transport{n}_decisionApproved/Denied)
   */
  private syncDecisionToService(procedureNo: number): void {
    if (!this.authDetailId || !this.activeState) return;

    const sec = this.activeState.sections.find(s => s.sectionName === 'Decision Details');
    if (!sec) return;

    // Collect values from the decision form
    const decisionValues: Record<string, any> = {};
    for (const f of sec.fields) {
      const ctrl = this.form.get(f.controlName);
      if (ctrl) {
        decisionValues[f.id] = this.unwrapValue(ctrl.value);
      }
    }

    const sourceType = this.getSourceTypeForProcedureNo(procedureNo);
    let syncMap: Array<{ decisionField: string; authKey: string }>;

    if (sourceType === 'medication') {
      const medNo  = procedureNo - 1000;
      const prefix = `medication${medNo}_`;
      syncMap = [
        { decisionField: 'serviceCode',        authKey: prefix + 'medicationCode' },
        { decisionField: 'serviceDescription', authKey: prefix + 'medicationDescription' },
        { decisionField: 'fromDate',           authKey: prefix + 'fromDate' },
        { decisionField: 'toDate',             authKey: prefix + 'toDate' },
        { decisionField: 'requested',          authKey: prefix + 'quantity' },
        { decisionField: 'approved',           authKey: prefix + 'approvedQuantity' },
        { decisionField: 'denied',             authKey: prefix + 'deniedQuantity' },
      ];
    } else if (sourceType === 'transportation') {
      const seqIndex = procedureNo - 2000;
      syncMap = [
        { decisionField: 'approved', authKey: `transport${seqIndex}_decisionApproved` },
        { decisionField: 'denied',   authKey: `transport${seqIndex}_decisionDenied` },
      ];
    } else {
      // Service (original behaviour)
      const prefix = `procedure${procedureNo}_`;
      syncMap = [
        { decisionField: 'serviceCode',        authKey: prefix + 'procedureCode' },
        { decisionField: 'serviceDescription', authKey: prefix + 'procedureDescription' },
        { decisionField: 'fromDate',           authKey: prefix + 'fromDate' },
        { decisionField: 'toDate',             authKey: prefix + 'toDate' },
        { decisionField: 'requested',          authKey: prefix + 'serviceReq' },
        { decisionField: 'approved',           authKey: prefix + 'serviceAppr' },
        { decisionField: 'denied',             authKey: prefix + 'serviceDenied' },
        { decisionField: 'modifier',           authKey: prefix + 'modifier' },
        { decisionField: 'unitType',           authKey: prefix + 'unitType' },
        { decisionField: 'reviewType',         authKey: prefix + 'reviewType' },
      ];
    }

    let authDataChanged = false;

    for (const { decisionField, authKey } of syncMap) {
      const val = decisionValues[decisionField];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        const existing = this.authData?.[authKey];
        const newVal = this.extractServiceCodeString(val) || val;
        if (String(existing ?? '').trim() !== String(newVal ?? '').trim()) {
          this.authData[authKey] = newVal;
          authDataChanged = true;
        }
      }
    }

    if (!authDataChanged) return;

    // Persist the updated authData back to the backend
    this.persistAuthDataToBackend();
  }

  /**
   * Syncs updated service-level data FROM authData INTO existing decision items.
   * Called when the component detects that authData has been refreshed (e.g. after
   * AuthDetails save or when the wizard shell pushes new context).
   *
   * For each procedure that has a saved Decision Details item, we compare the
   * service-level keys in authData with the decision data. If the service data
   * is newer/different, we update the decision item.
   */
  syncServiceToDecision(): void {
    if (!this.authDetailId) return;

    const userId = Number(sessionStorage.getItem('loggedInUserid') || 0);
    const ddList = (this.itemsBySection?.['Decision Details'] ?? []) as any[];
    if (!ddList.length) return;

    const calls: any[] = [];

    for (const item of ddList) {
      const rawData: any = item?.data ?? item?.jsonData ?? item?.payload ?? item?.itemData ?? null;
      const data: any = this.safeParseJson(rawData) ?? rawData ?? {};

      const procNo = Number(
        item?.procedureNo ?? data?.procedureNo ?? data?.procedureIndex ?? 0
      );
      if (!procNo) continue;

      const prefix = `procedure${procNo}_`;
      const itemId = String(item?.itemId ?? item?.id ?? item?.decisionItemId ?? '');
      if (!itemId) continue;

      // Check if service-level data has changed vs what's in the decision
      const fieldSyncMap: Array<{ authKeySuffix: string; decisionKey: string }> = [
        { authKeySuffix: 'procedureCode', decisionKey: 'serviceCode' },
        { authKeySuffix: 'procedureDescription', decisionKey: 'serviceDescription' },
        { authKeySuffix: 'fromDate', decisionKey: 'fromDate' },
        { authKeySuffix: 'toDate', decisionKey: 'toDate' },
        { authKeySuffix: 'serviceReq', decisionKey: 'requested' },
        { authKeySuffix: 'serviceAppr', decisionKey: 'approved' },
        { authKeySuffix: 'serviceDenied', decisionKey: 'denied' },
        { authKeySuffix: 'modifier', decisionKey: 'modifier' },
        { authKeySuffix: 'unitType', decisionKey: 'unitType' },
        { authKeySuffix: 'reviewType', decisionKey: 'reviewType' },
      ];

      let changed = false;
      const updatedPayload = { ...data };

      for (const { authKeySuffix, decisionKey } of fieldSyncMap) {
        const authVal = this.authData?.[prefix + authKeySuffix];
        if (authVal === undefined || authVal === null) continue;

        const authStr = String(this.extractServiceCodeString(authVal) || authVal || '').trim();
        const decStr = String(this.extractServiceCodeString(data?.[decisionKey]) || data?.[decisionKey] || '').trim();

        if (authStr && authStr !== decStr) {
          updatedPayload[decisionKey] = authVal;
          changed = true;
        }
      }

      if (changed) {
        updatedPayload.updatedDateTime = new Date().toISOString();
        calls.push(
          this.api.updateItem(this.authDetailId, 'Decision Details', itemId, { data: updatedPayload } as any, userId)
            .pipe(catchError(() => of(null)))
        );
      }
    }

    if (calls.length) {
      forkJoin(calls)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            console.log(`[AuthDecision] Synced ${calls.length} decision item(s) from service data.`);
            this.refreshItemsOnly();
          }
        });
    }
  }

  /**
   * Notifies the wizard shell that authData was changed by the decision component
   * so the parent (AuthDetails/Shell) can persist the updates.
   *
   * Instead of directly updating the auth record (which could conflict with
   * AuthDetails), we push the updated authData through the shell callback.
   */
  private persistAuthDataToBackend(): void {
    if (!this.authDetailId) return;

    // Notify shell that authData changed from Decision side
    if (typeof this._shellSyncAuthData === 'function') {
      this._shellSyncAuthData(this.authData);
      console.log('[AuthDecision] Decision→Service sync: notified shell to persist authData.');
    } else {
      console.warn('[AuthDecision] No _shellSyncAuthData callback available — authData changes are in-memory only.');
    }

    // Always refresh header so status/badges update
    this._shellRefreshHeader?.();
  }

  /**
   * Sync a single bulk-saved decision row back into authData.
   * Routes by procedureNo partition: service / medication / transportation.
   */
  private syncBulkDecisionToService(procedureNo: number, row: BulkSaveRow): void {
    const sourceType = this.getSourceTypeForProcedureNo(procedureNo);
    let changed = false;
    let syncPairs: Array<[string, any]>;

    if (sourceType === 'medication') {
      const medNo  = procedureNo - 1000;
      const prefix = `medication${medNo}_`;
      syncPairs = [
        [prefix + 'approvedQuantity', row.approved],
        [prefix + 'deniedQuantity',   row.denied],
        [prefix + 'quantity',         row.requested],
        [prefix + 'medicationCode',   row.serviceCode],
      ];
    } else if (sourceType === 'transportation') {
      const seqIndex = procedureNo - 2000;
      syncPairs = [
        [`transport${seqIndex}_decisionApproved`, row.approved],
        [`transport${seqIndex}_decisionDenied`,   row.denied],
      ];
    } else {
      const prefix = `procedure${procedureNo}_`;
      syncPairs = [
        [prefix + 'serviceAppr',          row.approved],
        [prefix + 'serviceDenied',        row.denied],
        [prefix + 'serviceReq',           row.requested],
        [prefix + 'procedureCode',        row.serviceCode],
        [prefix + 'procedureDescription', row.serviceDescription],
      ];
    }

    for (const [key, val] of syncPairs) {
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        const existing = String(this.authData?.[key] ?? '').trim();
        const newVal = String(val).trim();
        if (existing !== newVal) {
          this.authData[key] = val;
          changed = true;
        }
      }
    }

    // Only persist once after all rows are processed (called at the end of the loop)
    if (changed) {
      this.persistAuthDataToBackend();
    }
  }

  private toCamelCase(input: string): string {
    const parts = input
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .split(' ')
      .filter(Boolean);

    if (parts.length === 0) return input;
    return parts[0].toLowerCase() + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  }

  private pickDisplayField(row: any): string | null {
    if (!row) return null;

    // Keys that are IDs / metadata — never a display label
    const skip = new Set([
      'id', 'value', 'code', 'key', 'sortOrder', 'sequence', 'order',
      'activeFlag', 'active', 'isActive', 'enabled',
      'parentId', 'groupId', 'statusId', 'decisionStatusId',
      'decisionStatus', 'decisionStatusCode', 'decisionStatusCodeId',
      'createdBy', 'createdOn', 'createdDate',
      'updatedBy', 'updatedOn', 'updatedDate',
      'deletedBy', 'deletedOn', 'deletedDate'
    ]);

    // Prefer longer descriptive strings (description > name > short code)
    let best: string | null = null;
    let bestLen = 0;

    for (const k of Object.keys(row)) {
      if (skip.has(k)) continue;
      const v = row[k];
      if (typeof v !== 'string') continue;
      const t = v.trim();
      if (!t) continue;
      // Skip purely numeric strings — those are IDs in disguise
      if (/^\d+$/.test(t)) continue;
      if (t.length > bestLen) {
        best = t;
        bestLen = t.length;
      }
    }

    return best;
  }


  private normDs(ds: string): string {
    return String(ds ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }


  /** Resolve a Decision Status value (id) to its display label using the dropdown cache.
   *  No hardcoded mappings — labels come from the datasource. */
  private decisionStatusLabelFromValue(v: any): string | null {
    const s = String(v ?? '').trim();
    if (!s) return null;

    // Search the dropdown cache for the Decision Status datasource
    const looked = this.lookupDecisionStatusLabel(s);
    if (looked?.label && !/^\d+$/.test(looked.label.trim())) return looked.label;

    return null;
  }


  /** True if datasource refers to Decision Status (NOT Decision Status Code). */
  private isDecisionStatusDatasource(ds: string): boolean {
    const k = this.normDs(ds);
    return k.includes('decisionstatus') && !k.includes('decisionstatuscode');
  }

  /** True if datasource refers to Decision Status Code. */
  private isDecisionStatusCodeDatasource(ds: string): boolean {
    const k = this.normDs(ds);
    return k.includes('decisionstatuscode');
  }

  /** Add decision-specific overrides here if needed */
  private getDatasourcePreferredValue(ds: string, row: any): any {
    const k = this.normDs(ds);
    if (!row) return null;

    // Decision Status Code => use id as value (decisionStatusCode field is descriptive text, NOT an id)
    if (k.includes('decisionstatuscode')) {
      return row?.id ?? row?.decisionStatusCodeId ?? row?.value ?? row?.code ?? null;
    }

    // Decision Status => prefer id when available
    if (this.isDecisionStatusDatasource(ds)) {
      return row?.id ?? row?.decisionStatusId ?? row?.statusId ?? row?.value ?? row?.code ?? null;
    }

    // Decision Type often uses code as value
    if (k.includes('decisiontype')) {
      return row?.decisionTypeCode ?? row?.typeCode ?? row?.code ?? row?.value ?? row?.id ?? null;
    }

    return null;
  }

  private getDatasourcePreferredLabel(ds: string, row: any): string {
    if (!row) return '';

    // Decision Status specific names
    if (this.isDecisionStatusDatasource(ds)) {
      const candidate =
        row.decisionStatusName ??
        row.decisionStatus ??
        row.statusName ??
        row.name ??
        row.label ??
        row.text ??
        row.displayName ??
        row.description ??
        null;

      const s = String(candidate ?? '').trim();
      if (s && !/^\d+$/.test(s)) return s;

      return this.pickDisplayField(row) ?? '';
    }

    if (this.isDecisionStatusCodeDatasource(ds)) {
      const candidate =
        row.decisionStatusCodeName ??
        row.decisionStatusName ??
        row.decisionStatusCode ??
        row.decisionStatusReasonName ??
        row.decisionStatusCodeDescription ??
        row.statusCodeName ??
        row.statusCodeDescription ??
        row.reasonDescription ??
        row.reasonName ??
        row.reason ??
        row.description ??
        row.displayName ??
        row.label ??
        row.text ??
        row.name ??
        row.title ??
        null;

      // Only return if it's a real descriptive string (not numeric)
      const s = String(candidate ?? '').trim();
      if (s && !/^\d+$/.test(s)) return s;

      // Fallback: scan all fields for descriptive text
      return this.pickDisplayField(row) ?? '';
    }



    // Generic: any descriptive field or pickDisplayField
    const candidate =
      row.label ??
      row.text ??
      row.name ??
      row.description ??
      row.displayName ??
      row.title ??
      null;

    const s = String(candidate ?? '').trim();
    if (s && !/^\d+$/.test(s)) return s;

    return this.pickDisplayField(row) ?? '';
  }


  /** Build a dropdown option from a datasource row, handling primitive rows like [1,2,3]. */
  private mapDatasourceRowToOption(ds: string, r: any): UiSmartOption | null {
    if (r == null) return null;

    // Primitive rows (e.g. [1,2,3])
    if (typeof r === 'string' || typeof r === 'number') {
      const value = r;
      let label: string | null = null;

      if (this.isDecisionStatusDatasource(ds)) {
        label = this.decisionStatusLabelFromValue(value);
      } else if (this.isDecisionStatusCodeDatasource(ds)) {
        label = this.decisionStatusCodeLabelFromValue(value);
      }

      const finalLabel = (label ?? String(value)).trim();
      if (/^\d+$/.test(finalLabel)) {
        console.warn(`[AuthDecision] datasource "${ds}" returned primitive "${value}" with no label resolution. Raw:`, r);
      }
      return { value, label: finalLabel, text: finalLabel, raw: r } as any;
    }

    // Object rows
    const value = this.getDatasourcePreferredValue(ds, r) ?? r?.value ?? r?.code ?? r?.id;
    const special = this.getDatasourcePreferredLabel(ds, r);

    // Build label from special, then known field names, then pickDisplayField
    let label: string | null = (special && special.trim()) ? special.trim() : null;

    if (!label) {
      // Try common label fields — but skip purely numeric values
      for (const k of ['label', 'text', 'name', 'description', 'displayName', 'title']) {
        const v = r?.[k];
        if (typeof v === 'string' && v.trim() && !/^\d+$/.test(v.trim())) {
          label = v.trim();
          break;
        }
      }
    }

    if (!label) {
      label = this.pickDisplayField(r);
    }

    // If label is still missing/numeric, try cache-based lookups
    if (!label || /^\d+$/.test(label.trim())) {
      if (this.isDecisionStatusDatasource(ds)) {
        const resolved =
          this.decisionStatusLabelFromValue(value) ??
          this.decisionStatusLabelFromValue(r?.decisionStatusId ?? r?.statusId ?? r?.id ?? r?.code ?? r?.value);
        if (resolved) label = resolved;
      } else if (this.isDecisionStatusCodeDatasource(ds)) {
        const resolved =
          this.decisionStatusCodeLabelFromValue(value) ??
          this.decisionStatusCodeLabelFromValue(r?.decisionStatusCode ?? r?.statusCode ?? r?.code ?? r?.id ?? r?.value);
        if (resolved) label = resolved;
      }
    }

    if (label == null) label = String(value ?? '');
    const finalLabel = String(label).trim();

    // Debug: warn if we still have a numeric-only label for status-related datasources
    if (/^\d+$/.test(finalLabel) && (this.isDecisionStatusDatasource(ds) || this.isDecisionStatusCodeDatasource(ds))) {
      console.warn(`[AuthDecision] datasource "${ds}" option has numeric label "${finalLabel}". Raw row:`, JSON.stringify(r));
    }

    return { value, label: finalLabel, text: finalLabel, raw: r } as any;
  }


  authHasUnsavedChanges(): boolean {
    return this.form?.dirty ?? false;
  }

  /** True if the tab at index `ti` is directly before the currently active tab. */
  isTabBeforeActive(ti: number): boolean {
    const activeIdx = this.tabs.findIndex(t => t.id === this.selectedTabId);
    return activeIdx > 0 && ti === activeIdx - 1;
  }

  /** Returns the status key (e.g. 'approved') of the active tab, used for before-status-* class. */
  getActiveStatusKey(): string {
    const active = this.tabs.find(t => t.id === this.selectedTabId);
    // statusClass is like 'status-approved' → extract the key after 'status-'
    return (active?.statusClass ?? '').replace('status-', '');
  }

  /** Content header title: "Decision #N — CODE" */
  get contentHeaderTitle(): string {
    const tab = this.tabs.find(t => t.id === this.selectedTabId);
    if (!tab) return '';
    const code = tab.procedureCode ? ` — ${tab.procedureCode}` : '';
    return `${tab.line1}${code}`;
  }

  /** Content header status badge text */
  get contentHeaderStatusText(): string {
    const tab = this.tabs.find(t => t.id === this.selectedTabId);
    return tab?.statusText ?? 'Pended';
  }

  /** CSS class for content header badge (e.g. 'status-approved-badge') */
  get contentHeaderBadgeClass(): string {
    const tab = this.tabs.find(t => t.id === this.selectedTabId);
    const key = (tab?.statusClass ?? 'status-pended').replace('status-', '');
    return `status-${key}-badge`;
  }

  /** CSS class for content header bar background */
  get contentHeaderClass(): string {
    const key = this.getActiveStatusKey() || 'pended';
    return `status-${key}-header`;
  }

  // Alias for CanDeactivate guards that expect a different method name
  hasPendingChanges(): boolean {
    return this.authHasUnsavedChanges();
  }

  // Alias for older naming
  hasUnsavedChanges(): boolean {
    return this.authHasUnsavedChanges();
  }


  /** Resolve a Decision Status Code value (id) to its display label using the dropdown cache.
   *  No hardcoded mappings — labels come from the datasource. */
  private decisionStatusCodeLabelFromValue(v: any): string | null {
    const s = String(v ?? '').trim();
    if (!s) return null;

    // Search the dropdown cache for the Decision Status Code datasource
    const looked = this.lookupDecisionStatusCodeLabel(s);
    if (looked?.label && !/^\d+$/.test(looked.label.trim())) return looked.label;

    return null;
  }

  /**
 * If user selects Approved => Appr = Req and Denied = 0
 * If user selects Denied   => Appr = 0   and Denied = Req
 */
  private syncApprovedDeniedToRequested(ddSection: DecisionSectionVm, statusField: DecisionFieldVm, statusKey: string): void {
    if (!this.form || !ddSection) return;

    const statusText = this.getDecisionStatusText(statusField, statusKey).toLowerCase();
    const isApproved = statusText.startsWith('approv');
    const isDenied = statusText.includes('deni') || statusText.includes('deny');

    if (!isApproved && !isDenied) return;

    // Best-effort field discovery (ids can vary by template)
    const reqField =
      this.findFieldByIdCandidates(ddSection, [
        'req',
        'requested',
        'requestedunits',
        'requestedunit',
        'requestedqty',
        'requestedquantity',
        'requestqty',
        'requestquantity',
        'qtyrequested',
        'unitsrequested'
      ], ['requested', 'req']);

    const apprField =
      this.findFieldByIdCandidates(ddSection, [
        'appr',
        'approved',
        'approvedunits',
        'approvedunit',
        'approvedqty',
        'approvedquantity',
        'apprtoreq',
        'appr_to_req',
        'approvedtoreq',
        'approved_to_req'
      ], ['appr', 'approved']);

    const deniedField =
      this.findFieldByIdCandidates(ddSection, [
        'denied',
        'deniedunits',
        'deniedunit',
        'deniedqty',
        'deniedquantity',
        'deniedtoreq',
        'denied_to_req'
      ], ['denied']);

    if (!reqField || !apprField || !deniedField) return;

    const reqCtrl = this.form.get(reqField.controlName);
    if (!reqCtrl) return;

    const reqVal = this.coerceNumber(reqCtrl.value);

    if (isApproved) {
      this.safeSetFieldValue(apprField, reqVal);
      this.safeSetFieldValue(deniedField, 0);
    } else if (isDenied) {
      this.safeSetFieldValue(apprField, 0);
      this.safeSetFieldValue(deniedField, reqVal);
    }
  }

  private getDecisionStatusText(statusField: DecisionFieldVm, statusKey: string): string {
    // Prefer datasource cache mapping (handles id/code -> label)
    const looked = this.lookupDecisionStatusLabel(String(statusKey ?? '').trim());
    if (looked?.label) return String(looked.label);

    // Fallback: try status field options if present
    const opts = (this.optionsByControlName?.[statusField.controlName] ?? []) as any[];
    const match = opts.find(o => String((o as any)?.value ?? '').trim() === String(statusKey ?? '').trim());
    if (match?.label) return String(match.label);

    // Last resort
    return this.asDisplayString(statusKey);
  }

  private findFieldByIdCandidates(section: DecisionSectionVm, idCandidates: string[], displayNeedles: string[]): DecisionFieldVm | null {
    const idSet = new Set((idCandidates ?? []).map(x => String(x ?? '').toLowerCase().trim()).filter(Boolean));

    // 1) exact-ish id match
    const byId = (section.fields ?? []).find(f => idSet.has(String(f?.id ?? '').toLowerCase().trim()));
    if (byId) return byId;

    // 2) displayName contains needles
    const needles = (displayNeedles ?? []).map(x => String(x ?? '').toLowerCase().trim()).filter(Boolean);
    const byDisplay = (section.fields ?? []).find(f => {
      const dn = String(f?.displayName ?? '').toLowerCase();
      return needles.some(n => dn.includes(n));
    });

    return byDisplay ?? null;
  }

  private coerceNumber(v: any): number {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number' && Number.isFinite(v)) return v;

    // Handle strings like "10", "10.5"
    const n = Number(String(v).replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : 0;
  }

  private safeSetFieldValue(field: DecisionFieldVm, value: any): void {
    if (!this.form || !field) return;
    const ctrl = this.form.get(field.controlName);
    if (!ctrl) return;

    ctrl.setValue(value, { emitEvent: false });
    // keep vm value in sync too (used in some renders / payload builders)
    field.value = value;
  }


  // ═══════════════════════════════════════════════════════════
  //  SINGLE-TAB — Member Provider Editable Table
  //  Loads all saved MP items for the active procedure into
  //  singleMpRows[], supports add/remove, and saves per-row.
  // ═══════════════════════════════════════════════════════════

  /** Load all saved Member Provider items for a procedure into editable rows */
  private loadSingleMpRows(procedureNo: number, sections: DecisionSectionVm[]): void {
    // Find the MP template section for field metadata
    const mpSection = sections.find(s => s.sectionName === 'Member Provider Decision Info');
    if (!mpSection) {
      this.singleMpRows = [];
      return;
    }

    // Load dropdown options (reuse the bulk loader logic)
    this.loadSingleMpDropdownOptions(mpSection.fields);

    // Find ALL saved MP items for this procedure
    const allItems = this.findAllItemsForSectionAndProcedure('Member Provider Decision Info', procedureNo);

    if (allItems.length > 0) {
      this.singleMpRows = allItems.map(item => {
        const d = item.data ?? {};
        // Resolve field IDs dynamically from template
        const typeFieldId = this.getMpFieldIdFromFields(mpSection.fields, 'type');
        const notifFieldId = this.getMpFieldIdFromFields(mpSection.fields, 'notificationType');
        const dateFieldId = this.getMpFieldIdFromFields(mpSection.fields, 'notificationDate');
        const attemptFieldId = this.getMpFieldIdFromFields(mpSection.fields, 'notificationAttempt');

        return {
          type: this.extractPrimitive(d[typeFieldId]) ?? null,
          notificationType: this.extractPrimitive(d[notifFieldId]) ?? null,
          notificationDate: this.toDateTimeLocalString(d[dateFieldId]) ?? '',
          notificationAttempt: d[attemptFieldId] ?? '',
          itemId: item.itemId
        } as SingleMpRow;
      });
    } else {
      // Start with one empty row if nothing saved
      this.singleMpRows = [this.createEmptySingleMpRow()];
    }
  }

  /** Load dropdown options for the single-tab MP table */
  private loadSingleMpDropdownOptions(fields: DecisionFieldVm[]): void {
    const typeField = fields.find(f =>
      /memberProviderType/i.test(f.id) || (/^type$/i.test(f.id) && !/notification/i.test(f.id))
    );
    const notifField = fields.find(f => /notificationType/i.test(f.id));

    const loadDs = (field: DecisionFieldVm | undefined, target: 'type' | 'notif') => {
      if (!field) return;
      const ds = String((field as any).datasource ?? '').trim();

      if (!ds) {
        const staticOpts = this.mapStaticOptions(((field as any).options ?? []) as any[]);
        const filtered = this.filterBySelectedOptions(field, staticOpts);
        if (target === 'type') this.singleMpTypeOptions = filtered;
        else this.singleMpNotifTypeOptions = filtered;
        return;
      }

      const cached = this.dropdownCache.get(ds);
      if (cached) {
        const filtered = this.filterBySelectedOptions(field, cached);
        if (target === 'type') this.singleMpTypeOptions = filtered;
        else this.singleMpNotifTypeOptions = filtered;
        return;
      }

      this.dsLookup.getOptionsWithFallback(
        ds,
        (r: any) => this.mapDatasourceRowToOption(ds, r) as any,
        ['UM', 'Admin', 'Provider']
      )
        .pipe(catchError(() => of([])), takeUntil(this.destroy$))
        .subscribe((opts) => {
          const safe = (opts ?? []) as any[];
          this.dropdownCache.set(ds, safe);
          const filtered = this.filterBySelectedOptions(field!, safe);
          if (target === 'type') this.singleMpTypeOptions = filtered;
          else this.singleMpNotifTypeOptions = filtered;
        });
    };

    loadDs(typeField, 'type');
    loadDs(notifField, 'notif');
  }

  /** Resolve field ID from MP fields list by semantic key */
  private getMpFieldIdFromFields(fields: DecisionFieldVm[], semanticKey: string): string {
    const keyLower = semanticKey.toLowerCase();
    const match = fields.find(f => {
      const fid = String(f.id ?? '').toLowerCase();
      switch (keyLower) {
        case 'type':
          return fid.includes('memberprovidertype') || (fid === 'type' && !fid.includes('notification'));
        case 'notificationtype':
          return fid.includes('notificationtype');
        case 'notificationdate':
          return fid.includes('notificationdate');
        case 'notificationattempt':
          return fid.includes('notificationattempt');
        default:
          return fid.includes(keyLower);
      }
    });
    return match?.id ?? semanticKey;
  }

  private createEmptySingleMpRow(): SingleMpRow {
    return { type: null, notificationType: null, notificationDate: '', notificationAttempt: '', itemId: null };
  }

  addSingleMpRow(): void {
    this.singleMpRows = [...this.singleMpRows, this.createEmptySingleMpRow()];
  }

  removeSingleMpRow(index: number): void {
    if (this.singleMpRows.length <= 1) return;
    this.singleMpRows = this.singleMpRows.filter((_, i) => i !== index);
  }

  /** Build API calls for all single-tab MP rows (used by saveCurrentTab) */
  private buildSingleMpSaveCalls(authDetailId: number, procedureNo: number, userId: number): any[] {
    const calls: any[] = [];
    if (!this.activeState) return calls;

    const mpSection = this.activeState.sections.find(s => s.sectionName === 'Member Provider Decision Info');
    if (!mpSection) return calls;

    for (const mpRow of this.singleMpRows) {
      const hasValue = mpRow.type || mpRow.notificationType || mpRow.notificationDate || mpRow.notificationAttempt;
      if (!hasValue) continue;

      const payload: any = { procedureNo };

      // Resolve field IDs from template
      const typeFieldId = this.getMpFieldIdFromFields(mpSection.fields, 'type');
      const notifFieldId = this.getMpFieldIdFromFields(mpSection.fields, 'notificationType');
      const dateFieldId = this.getMpFieldIdFromFields(mpSection.fields, 'notificationDate');
      const attemptFieldId = this.getMpFieldIdFromFields(mpSection.fields, 'notificationAttempt');

      if (mpRow.type != null) {
        payload[typeFieldId] = mpRow.type;
        payload[typeFieldId + 'Label'] = this.resolveOptionLabel(this.singleMpTypeOptions, mpRow.type);
      }
      if (mpRow.notificationType != null) {
        payload[notifFieldId] = mpRow.notificationType;
        payload[notifFieldId + 'Label'] = this.resolveOptionLabel(this.singleMpNotifTypeOptions, mpRow.notificationType);
      }
      if (mpRow.notificationDate) {
        payload[dateFieldId] = mpRow.notificationDate;
      }
      if (mpRow.notificationAttempt !== '' && mpRow.notificationAttempt != null) {
        payload[attemptFieldId] = this.coerceNumber(mpRow.notificationAttempt);
      }

      // Procedure metadata
      payload.procedureCode = this.authData?.[`procedure${procedureNo}_procedureCode`] ?? null;
      payload.procedureDescription = this.authData?.[`procedure${procedureNo}_procedureDescription`] ?? null;

      if (mpRow.itemId) {
        calls.push(this.api.updateItem(authDetailId, 'Member Provider Decision Info', mpRow.itemId, { data: payload } as any, userId));
      } else {
        calls.push(this.api.createItem(authDetailId, 'Member Provider Decision Info', { data: payload } as any, userId));
      }
    }

    return calls;
  }

  // ═══════════════════════════════════════════════════════════
  //  INLINE BULK EDIT — Open / Close / Execute
  //  Industry pattern: "Batch Edit" view replaces the detail
  //  panel so the user works in context without modals.
  //  Saves Decision Details + Member Provider Info + Notes
  //  for every selected decision line in one operation.
  // ═══════════════════════════════════════════════════════════

  // ── Computed helpers for template ──

  get bulkSelectedCount(): number {
    return (this.bulkRows ?? []).filter(r => r.checked).length;
  }

  get allBulkChecked(): boolean {
    return this.bulkRows.length > 0 && this.bulkRows.every(r => r.checked);
  }

  get someBulkChecked(): boolean {
    return this.bulkRows.some(r => r.checked);
  }

  toggleAllBulk(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    for (const row of this.bulkRows) row.checked = checked;
  }

  /** Form control accessor for bulk shared fields (Member Provider / Notes) */
  getBulkCtrl(controlName: string): FormControl {
    return (this.bulkSharedForm.get(controlName) as FormControl) ?? new FormControl(null);
  }

  /** Dropdown options accessor for bulk shared fields */
  getBulkDropdownOptions(controlName: string): UiSmartOption[] {
    return this.bulkSharedOptions[controlName] ?? [];
  }

  // ── Open Bulk Edit ──

  openBulkEdit(): void {
    if (!this.tabs.length) return;

    this.bulkValidationMsg = '';
    this.bulkSuccessMsg = '';
    this.bulkSaving = false;

    // 1) Build table rows from all decision tabs
    this.bulkRows = this.tabs.map(tab => {
      const procNo = tab.procedureNo;

      // Collect existing item IDs and data for all 3 sections
      const ddItem = this.findItemForSectionAndProcedure('Decision Details', procNo);
      const mpItem = this.findItemForSectionAndProcedure('Member Provider Decision Info', procNo);
      const dnItem = this.findItemForSectionAndProcedure('Decision Notes', procNo);

      const dd = ddItem.data ?? {};
      const serviceCode = this.extractServiceCodeString(
        dd?.serviceCode ?? dd?.procedureCode ?? this.authData?.[`procedure${procNo}_procedureCode`]
      );
      const serviceDescription = String(
        dd?.serviceDescription ?? dd?.procedureDescription ?? this.authData?.[`procedure${procNo}_procedureDescription`] ?? ''
      ).trim();

      const status = this.computeTabStatus(procNo);

      return {
        checked: true,
        procedureNo: procNo,
        serviceCode,
        serviceDescription,
        currentStatusText: status.label,
        currentStatusClass: status.statusClass,
        requested: dd?.requested ?? dd?.req ?? '',
        approved: dd?.approved ?? dd?.appr ?? '',
        denied: dd?.denied ?? '',
        itemIds: {
          'Decision Details': ddItem.itemId ?? undefined,
          'Member Provider Decision Info': mpItem.itemId ?? undefined,
          'Decision Notes': dnItem.itemId ?? undefined
        } as any,
        existingDecisionData: dd,
        existingMemberProviderData: mpItem.data ?? {},
        existingNotesData: dnItem.data ?? {}
      } as BulkSaveRow;
    });

    // 2) Load Decision Status dropdown
    this.loadBulkDecisionStatusOptions();

    // 3) Reset decision status controls
    this.bulkDecisionStatusCtrl.setValue(null, { emitEvent: false });
    this.bulkDecisionStatusCodeCtrl.setValue(null, { emitEvent: false });
    this.bulkDecisionStatusCodeOptions = [];

    // 4) Wire Decision Status → Decision Status Code dependency
    this.bulkStatusSub$.next();
    this.bulkDecisionStatusCtrl.valueChanges
      .pipe(takeUntil(this.bulkStatusSub$), takeUntil(this.destroy$))
      .subscribe(val => this.onBulkDecisionStatusChange(val));

    // 5) Build shared form for Member Provider Info + Decision Notes
    this.buildBulkSharedSections();

    // 6) Activate bulk mode (hides single-tab view)
    this.bulkEditMode = true;
  }

  // ── Close Bulk Edit ──

  closeBulkEdit(): void {
    this.bulkEditMode = false;
    this.bulkStatusSub$.next();
    this.bulkRows = [];
    this.bulkMpRows = [];
    this.bulkValidationMsg = '';
    this.bulkSuccessMsg = '';
    this.bulkDecisionDetailsSection = null;
    this.bulkMemberProviderSection = null;
    this.bulkNotesSection = null;
  }

  // ── Build shared form sections from template ──

  private buildBulkSharedSections(): void {
    const allSections = this.extractDecisionSectionsFromTemplate();
    const group: Record<string, FormControl> = {};
    this.bulkSharedOptions = {};

    // --- Decision Details (remaining fields not covered by the table) ---
    // Table already handles: decisionStatus, decisionStatusCode,
    // requested/approved/denied, procedureNo/Code/Description, timestamps.
    const TABLE_HANDLED_IDS = new Set([
      'decisionstatus', 'decisionstatuscode',
      'requested', 'servicereq', 'req',
      'approved', 'serviceappr', 'appr',
      'denied', 'servicedenied',
      'procedureno', 'decisionnumber', 'decisionnumber',
      'procedurecode', 'proceduredescription',
      'createddatetime', 'updateddatetime', 'decisiondatetime',
      'fromdate', 'todate', 'effectivedate',
      'startdate', 'enddate', 'servicefromedate', 'servicetodate'
    ]);

    const ddSec = allSections.find(s =>
      String(s?.sectionName ?? '').trim() === 'Decision Details'
    );
    if (ddSec) {
      const allDdFields = this.getSectionFields(ddSec).map((f: any) => this.toFieldVm(f));
      const remainingFields = allDdFields.filter(f =>
        !TABLE_HANDLED_IDS.has(String(f.id ?? '').trim().toLowerCase())
      );
      if (remainingFields.length) {
        for (const f of remainingFields) {
          f.controlName = `bulk_dd_${f.id}`;
          const ctrl = new FormControl(this.defaultValueForType(f.type));
          if (!f.isEnabled) ctrl.disable({ emitEvent: false });
          group[f.controlName] = ctrl;
        }
        this.bulkDecisionDetailsSection = { sectionName: 'Decision Details', fields: remainingFields };
      } else {
        this.bulkDecisionDetailsSection = null;
      }
    } else {
      this.bulkDecisionDetailsSection = null;
    }

    // --- Member Provider Decision Info (table-driven now) ---
    const mpSec = allSections.find(s =>
      String(s?.sectionName ?? '').trim() === 'Member Provider Decision Info'
    );
    if (mpSec) {
      const fields = this.getSectionFields(mpSec).map((f: any) => this.toFieldVm(f));
      this.bulkMemberProviderSection = { sectionName: 'Member Provider Decision Info', fields };

      // Load dropdown options for the MP table columns
      this.loadBulkMpDropdownOptions(fields);

      // Initialize with one empty row
      this.bulkMpRows = [this.createEmptyMpRow()];
    } else {
      this.bulkMemberProviderSection = null;
      this.bulkMpRows = [];
    }

    // --- Decision Notes ---
    const dnSec = allSections.find(s =>
      String(s?.sectionName ?? '').trim() === 'Decision Notes'
    );
    if (dnSec) {
      const fields = this.getSectionFields(dnSec).map((f: any) => this.toFieldVm(f));
      for (const f of fields) {
        f.controlName = `bulk_dn_${f.id}`;
        const ctrl = new FormControl(this.defaultValueForType(f.type));
        if (!f.isEnabled) ctrl.disable({ emitEvent: false });
        group[f.controlName] = ctrl;
      }
      this.bulkNotesSection = { sectionName: 'Decision Notes', fields };
    } else {
      this.bulkNotesSection = null;
    }

    this.bulkSharedForm = this.fb.group(group);

    // Prefetch dropdown options for Decision Notes select fields
    this.prefetchBulkSharedDropdowns();
  }

  /** Load dropdown options for the Member Provider table columns */
  private loadBulkMpDropdownOptions(fields: DecisionFieldVm[]): void {
    // Find the Type and Notification Type fields by id pattern
    const typeField = fields.find(f =>
      /memberProviderType/i.test(f.id) || /^type$/i.test(f.id)
    );
    const notifField = fields.find(f =>
      /notificationType/i.test(f.id)
    );

    const loadDs = (field: DecisionFieldVm | undefined, target: 'type' | 'notif') => {
      if (!field) return;
      const ds = String((field as any).datasource ?? '').trim();

      if (!ds) {
        const staticOpts = this.mapStaticOptions(((field as any).options ?? []) as any[]);
        const filtered = this.filterBySelectedOptions(field, staticOpts);
        if (target === 'type') this.bulkMpTypeOptions = filtered;
        else this.bulkMpNotifTypeOptions = filtered;
        return;
      }

      const cached = this.dropdownCache.get(ds);
      if (cached) {
        const filtered = this.filterBySelectedOptions(field, cached);
        if (target === 'type') this.bulkMpTypeOptions = filtered;
        else this.bulkMpNotifTypeOptions = filtered;
        return;
      }

      this.dsLookup.getOptionsWithFallback(
        ds,
        (r: any) => this.mapDatasourceRowToOption(ds, r) as any,
        ['UM', 'Admin', 'Provider']
      )
        .pipe(catchError(() => of([])), takeUntil(this.destroy$))
        .subscribe((opts) => {
          const safe = (opts ?? []) as any[];
          this.dropdownCache.set(ds, safe);
          const filtered = this.filterBySelectedOptions(field!, safe);
          if (target === 'type') this.bulkMpTypeOptions = filtered;
          else this.bulkMpNotifTypeOptions = filtered;
        });
    };

    loadDs(typeField, 'type');
    loadDs(notifField, 'notif');
  }

  /** Create a blank Member Provider table row */
  private createEmptyMpRow(): BulkMpRow {
    return {
      type: null,
      notificationType: null,
      notificationDate: '',
      notificationAttempt: ''
    };
  }

  /** Add a new blank row to the MP notification table */
  addBulkMpRow(): void {
    this.bulkMpRows = [...this.bulkMpRows, this.createEmptyMpRow()];
  }

  /** Remove a row from the MP notification table */
  removeBulkMpRow(index: number): void {
    if (this.bulkMpRows.length <= 1) return;
    this.bulkMpRows = this.bulkMpRows.filter((_, i) => i !== index);
  }

  /** Format a datetime value as "MM/DD/YYYY hh:mm:ss AM/PM" for display */
  formatDateTimeAmPm(value: any): string {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';

    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();

    let hrs = d.getHours();
    const mins = String(d.getMinutes()).padStart(2, '0');
    const secs = String(d.getSeconds()).padStart(2, '0');
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    hrs = hrs % 12 || 12;

    return `${mm}/${dd}/${yyyy} ${String(hrs).padStart(2, '0')}:${mins}:${secs} ${ampm}`;
  }

  /** Prefetch dropdown options for bulk shared form select fields (Decision Notes only; MP is table-driven) */
  private prefetchBulkSharedDropdowns(): void {
    const allFields: DecisionFieldVm[] = [
      ...(this.bulkDecisionDetailsSection?.fields ?? []),
      ...(this.bulkNotesSection?.fields ?? [])
    ].filter(f => String(f.type).toLowerCase() === 'select');

    for (const f of allFields) {
      const ds = String((f as any).datasource ?? '').trim();

      if (!ds) {
        const staticOpts = this.mapStaticOptions(((f as any).options ?? []) as any[]);
        this.bulkSharedOptions[f.controlName] = this.filterBySelectedOptions(f, staticOpts);
        continue;
      }

      const cacheHit = this.dropdownCache.get(ds);
      if (cacheHit) {
        this.bulkSharedOptions[f.controlName] = this.filterBySelectedOptions(f, cacheHit);
        continue;
      }

      this.dsLookup.getOptionsWithFallback(
        ds,
        (r: any) => this.mapDatasourceRowToOption(ds, r) as any,
        ['UM', 'Admin', 'Provider']
      )
        .pipe(catchError(() => of([])), takeUntil(this.destroy$))
        .subscribe((opts) => {
          const safe = (opts ?? []) as any[];
          this.dropdownCache.set(ds, safe);
          this.bulkSharedOptions[f.controlName] = this.filterBySelectedOptions(f, safe);
        });
    }
  }

  // ── Decision Status dropdown loading (bulk) ──

  private loadBulkDecisionStatusOptions(): void {
    const statusDs = this.getDecisionStatusDatasourceFromTemplate();
    if (!statusDs) { this.bulkDecisionStatusOptions = []; return; }

    const cached = this.dropdownCache.get(statusDs);
    if (cached) {
      const tplField = this.findDecisionStatusTemplateField();
      this.bulkDecisionStatusOptions = tplField
        ? this.filterBySelectedOptions(tplField as any, cached) : cached;
      return;
    }

    this.dsLookup.getOptionsWithFallback(
      statusDs,
      (r: any) => this.mapDatasourceRowToOption(statusDs, r) as any,
      ['UM', 'Admin', 'Provider']
    )
      .pipe(catchError(() => of([])), takeUntil(this.destroy$))
      .subscribe((opts) => {
        const safe = (opts ?? []) as any[];
        this.dropdownCache.set(statusDs, safe);
        const tplField = this.findDecisionStatusTemplateField();
        this.bulkDecisionStatusOptions = tplField
          ? this.filterBySelectedOptions(tplField as any, safe) : safe;
      });
  }

  /** Finds the Decision Status field definition from the template for selectedOptions filtering */
  private findDecisionStatusTemplateField(): any {
    const merged = this.extractDecisionSectionsFromTemplate();
    for (const sec of (merged ?? [])) {
      const fields: any[] = sec?.fields ?? [];
      const hit = fields.find((f: any) =>
        String(f?.id ?? '').trim().toLowerCase() === 'decisionstatus'
      );
      if (hit) return hit;
    }
    return null;
  }

  // ── Decision Status → Status Code dependency (bulk) ──

  private onBulkDecisionStatusChange(statusVal: any): void {
    this.bulkValidationMsg = '';

    const rawStatus = this.extractPrimitive(this.unwrapValue(statusVal)) ?? this.unwrapValue(statusVal);
    const statusKey = String(rawStatus ?? '').trim();

    if (!statusKey || this.isPendedStatus(statusKey)) {
      this.bulkDecisionStatusCodeOptions = [];
      this.bulkDecisionStatusCodeCtrl.setValue(null, { emitEvent: false });
      return;
    }

    const codeDs = this.getDecisionStatusCodeDatasourceFromTemplate();
    if (!codeDs) { this.bulkDecisionStatusCodeOptions = []; return; }

    const applyFilter = () => {
      const full = (this.dropdownCache.get(codeDs) ?? []) as SmartOpt[];
      const filtered = (full ?? []).filter((o: any) => {
        const raw: any = o?.raw ?? o;
        const cand = raw?.decisionStatus ?? raw?.decisionStatusId ?? raw?.statusId
          ?? raw?.status ?? raw?.parentId ?? raw?.groupId ?? null;
        if (cand === null || cand === undefined || String(cand).trim() === '') return true;
        return String(cand).trim() === statusKey;
      });
      this.bulkDecisionStatusCodeOptions = filtered.length ? filtered : full;

      // Reset code if no longer valid
      const currentCode = this.extractPrimitive(this.unwrapValue(this.bulkDecisionStatusCodeCtrl.value));
      const currentKey = String(currentCode ?? '').trim();
      if (currentKey) {
        const ok = this.bulkDecisionStatusCodeOptions.some(
          (o: any) => String((o as any)?.value ?? '').trim() === currentKey
        );
        if (!ok) this.bulkDecisionStatusCodeCtrl.setValue(null, { emitEvent: false });
      }
    };

    if (this.dropdownCache.has(codeDs)) {
      applyFilter();
    } else {
      this.dsLookup.getOptionsWithFallback(
        codeDs,
        (r: any) => this.mapDatasourceRowToOption(codeDs, r) as any,
        ['UM', 'Admin', 'Provider']
      )
        .pipe(catchError(() => of([])), takeUntil(this.destroy$))
        .subscribe((opts) => {
          this.dropdownCache.set(codeDs, (opts ?? []) as any[]);
          applyFilter();
        });
    }
  }

  // ── Execute Bulk Save ──
  // Saves 3 sections per selected row: Decision Details, Member Provider Info, Decision Notes

  executeBulkSave(): void {
    this.bulkValidationMsg = '';
    this.bulkSuccessMsg = '';

    // Validate: at least one row
    const selectedRows = this.bulkRows.filter(r => r.checked);
    if (!selectedRows.length) {
      this.bulkValidationMsg = 'Please select at least one decision row.';
      return;
    }

    // Validate: Decision Status required
    const statusVal = this.extractPrimitive(this.unwrapValue(this.bulkDecisionStatusCtrl.value));
    if (!statusVal || String(statusVal).trim() === '') {
      this.bulkValidationMsg = 'Please select a Decision Status.';
      return;
    }

    const statusKey = String(statusVal).trim();
    const isPended = this.isPendedStatus(statusKey);
    const codeVal = this.extractPrimitive(this.unwrapValue(this.bulkDecisionStatusCodeCtrl.value));

    if (!isPended && this.bulkDecisionStatusCodeOptions.length > 0 && (!codeVal || String(codeVal).trim() === '')) {
      this.bulkValidationMsg = 'Please select a Decision Status Code.';
      return;
    }

    // Resolve labels
    const statusLabel = this.resolveOptionLabel(this.bulkDecisionStatusOptions, statusVal);
    const codeLabel = codeVal ? this.resolveOptionLabel(this.bulkDecisionStatusCodeOptions, codeVal) : '';

    // Build shared payloads from Decision Notes form (MP is now row-based)
    const sharedNotesPayload = this.buildBulkSharedPayload(this.bulkNotesSection);
    // Build shared payload for remaining Decision Details fields
    const sharedDecisionDetailsPayload = this.buildBulkSharedPayload(this.bulkDecisionDetailsSection);

    // Build MP rows payload (resolve labels for select values)
    const mpRowsPayload = this.buildBulkMpRowsPayload();

    const userId = Number(sessionStorage.getItem('loggedInUserid') || 0);
    const authDetailId = this.authDetailId;
    if (!authDetailId) return;

    const nowIso = new Date().toISOString();
    const calls: any[] = [];

    for (const row of selectedRows) {
      const procNo = row.procedureNo;

      // ── 1) Decision Details ──
      const ddPayload = {
        ...(row.existingDecisionData ?? {}),
        ...sharedDecisionDetailsPayload,
        procedureNo: procNo,
        decisionStatus: statusVal,
        decisionStatusLabel: statusLabel,
        decisionStatusCode: isPended ? null : (codeVal ?? null),
        decisionStatusCodeLabel: isPended ? '' : codeLabel,
        approved: this.coerceNumber(row.approved),
        denied: this.coerceNumber(row.denied),
        updatedDateTime: nowIso,
      };

      // Timestamp logic
      const oldStatus = row.existingDecisionData?.decisionStatus;
      const oldIsPended = this.isPendedStatus(oldStatus);
      if (isPended) {
        ddPayload.decisionDateTime = null;
      } else if (oldIsPended || (this.asDisplayString(oldStatus).trim() !== statusKey)) {
        ddPayload.decisionDateTime = nowIso;
      }
      if (!ddPayload.createdDateTime) {
        ddPayload.createdDateTime = row.existingDecisionData?.createdDateTime ?? this.authCreatedOn ?? nowIso;
      }

      ddPayload.procedureCode = ddPayload.procedureCode ?? this.authData?.[`procedure${procNo}_procedureCode`] ?? null;
      ddPayload.procedureDescription = ddPayload.procedureDescription ?? this.authData?.[`procedure${procNo}_procedureDescription`] ?? null;

      const ddItemId = row.itemIds['Decision Details'];
      if (ddItemId) {
        calls.push(this.api.updateItem(authDetailId, 'Decision Details', ddItemId, { data: ddPayload } as any, userId));
      } else {
        calls.push(this.api.createItem(authDetailId, 'Decision Details', { data: ddPayload } as any, userId));
      }

      // ── 2) Member Provider Decision Info (one API call per MP row) ──
      const mpItemId = row.itemIds['Member Provider Decision Info'];
      for (let mri = 0; mri < mpRowsPayload.length; mri++) {
        const mpPayload = {
          ...(mri === 0 ? (row.existingMemberProviderData ?? {}) : {}),
          procedureNo: procNo,
          procedureCode: row.existingDecisionData?.procedureCode ?? this.authData?.[`procedure${procNo}_procedureCode`] ?? null,
          procedureDescription: row.existingDecisionData?.procedureDescription ?? this.authData?.[`procedure${procNo}_procedureDescription`] ?? null,
          ...mpRowsPayload[mri]
        };

        // First MP row: update existing item if present, else create
        // Subsequent rows: always create new items
        if (mri === 0 && mpItemId) {
          calls.push(this.api.updateItem(authDetailId, 'Member Provider Decision Info', mpItemId, { data: mpPayload } as any, userId));
        } else {
          calls.push(this.api.createItem(authDetailId, 'Member Provider Decision Info', { data: mpPayload } as any, userId));
        }
      }

      // ── 3) Decision Notes ──
      const notesPayload = {
        ...(row.existingNotesData ?? {}),
        procedureNo: procNo,
        procedureCode: row.existingDecisionData?.procedureCode ?? this.authData?.[`procedure${procNo}_procedureCode`] ?? null,
        procedureDescription: row.existingDecisionData?.procedureDescription ?? this.authData?.[`procedure${procNo}_procedureDescription`] ?? null,
        ...sharedNotesPayload
      };
      const dnItemId = row.itemIds['Decision Notes'];
      if (dnItemId) {
        calls.push(this.api.updateItem(authDetailId, 'Decision Notes', dnItemId, { data: notesPayload } as any, userId));
      } else {
        calls.push(this.api.createItem(authDetailId, 'Decision Notes', { data: notesPayload } as any, userId));
      }
    }

    this.bulkSaving = true;

    forkJoin(calls)
      .pipe(
        finalize(() => (this.bulkSaving = false)),
        catchError((e) => {
          console.error('Bulk save failed:', e);
          this.bulkValidationMsg = e?.error?.message ?? 'Bulk save failed. Please try again.';
          return of(null);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (res: any) => {
          if (res === null) return;

          const count = selectedRows.length;
          this.bulkSuccessMsg = `Successfully updated ${count} decision(s) with all sections.`;
          this.toastSvc.success(`Bulk save: ${count} decision(s) updated successfully.`);

          // Refresh data, exit bulk mode, update shell header
          setTimeout(() => {
            this.closeBulkEdit();
            this.refreshItemsOnly();

            // Sync all saved decision lines back to source data (forward sync)
            for (const row of selectedRows) {
              this.syncBulkDecisionToService(row.procedureNo, row);
            }

            // Reverse sync: Decision → Source section form controls
            for (const row of selectedRows) {
              const reversePay = {
                approved:           this.coerceNumber(row.approved),
                denied:             this.coerceNumber(row.denied),
                requested:          this.coerceNumber(row.requested),
                serviceCode:        row.serviceCode,
                serviceDescription: row.serviceDescription,
              };
              this.fireDecisionReverseSync(row.procedureNo, reversePay);
            }

            // Refresh wizard shell header (status, decision summary, badges)
            if (typeof this._shellRefreshBadgeCounts === 'function') {
              this._shellRefreshBadgeCounts();
            }
            if (typeof this._shellRefreshHeader === 'function') {
              this._shellRefreshHeader();
            }
          }, 900);
        }
      });
  }

  // ── Bulk shared payload builder ──
  // Only includes fields that the user actually filled in (non-empty)
  // so we don't overwrite existing data with blanks.

  private buildBulkSharedPayload(section: DecisionSectionVm | null): any {
    if (!section) return {};
    const obj: any = {};
    for (const f of section.fields) {
      const ctrl = this.bulkSharedForm.get(f.controlName);
      const rawVal = ctrl?.value;
      const val = this.unwrapValue(rawVal);

      if (val !== null && val !== undefined && String(val).trim() !== '' && val !== false) {
        obj[f.id] = val;

        // For selects, persist the label alongside the value
        if (String(f.type ?? '').toLowerCase() === 'select' && val != null) {
          const opts = this.bulkSharedOptions[f.controlName] ?? [];
          const prim = String(this.extractPrimitive(val) ?? val ?? '').trim();
          const matchedOpt = opts.find((o: any) => String((o as any)?.value ?? '').trim() === prim);
          if (matchedOpt) {
            obj[f.id + 'Label'] = String((matchedOpt as any)?.label ?? '').trim();
          }
        }
      }
    }
    return obj;
  }

  /** Build payload array from the editable MP notification table rows.
   *  Each row becomes one Member Provider Decision Info item per decision line. */
  private buildBulkMpRowsPayload(): any[] {
    if (!this.bulkMpRows?.length) return [{}]; // at least one empty payload

    const results: any[] = [];

    for (const mpRow of this.bulkMpRows) {
      const hasAnyValue =
        mpRow.type || mpRow.notificationType || mpRow.notificationDate || mpRow.notificationAttempt;
      if (!hasAnyValue) continue; // skip completely empty rows

      const obj: any = {};

      // Type (Member/Provider)
      const typeFieldId = this.getMpFieldId('type');
      if (mpRow.type != null) {
        obj[typeFieldId] = mpRow.type;
        obj[typeFieldId + 'Label'] = this.resolveOptionLabel(this.bulkMpTypeOptions, mpRow.type);
      }

      // Notification Type
      const notifFieldId = this.getMpFieldId('notificationType');
      if (mpRow.notificationType != null) {
        obj[notifFieldId] = mpRow.notificationType;
        obj[notifFieldId + 'Label'] = this.resolveOptionLabel(this.bulkMpNotifTypeOptions, mpRow.notificationType);
      }

      // Notification Date
      const dateFieldId = this.getMpFieldId('notificationDate');
      if (mpRow.notificationDate) {
        obj[dateFieldId] = mpRow.notificationDate;
      }

      // Notification Attempt
      const attemptFieldId = this.getMpFieldId('notificationAttempt');
      if (mpRow.notificationAttempt !== '' && mpRow.notificationAttempt != null) {
        obj[attemptFieldId] = this.coerceNumber(mpRow.notificationAttempt);
      }

      results.push(obj);
    }

    return results.length ? results : [{}];
  }

  /** Resolve the actual field ID from the MP template for a given semantic key */
  private getMpFieldId(semanticKey: string): string {
    if (!this.bulkMemberProviderSection?.fields?.length) return semanticKey;

    const fields = this.bulkMemberProviderSection.fields;
    const keyLower = semanticKey.toLowerCase();

    // Match field by ID pattern
    const match = fields.find(f => {
      const fid = String(f.id ?? '').toLowerCase();
      switch (keyLower) {
        case 'type':
          return fid.includes('memberprovidertype') || (fid === 'type' && !fid.includes('notification'));
        case 'notificationtype':
          return fid.includes('notificationtype');
        case 'notificationdate':
          return fid.includes('notificationdate');
        case 'notificationattempt':
          return fid.includes('notificationattempt');
        default:
          return fid.includes(keyLower);
      }
    });

    return match?.id ?? semanticKey;
  }

  /** Resolve an option's display label from an options list */
  private resolveOptionLabel(options: UiSmartOption[], value: any): string {
    const v = String(this.extractPrimitive(value) ?? value ?? '').trim();
    const match = (options ?? []).find((o: any) => String((o as any)?.value ?? '').trim() === v);
    return String((match as any)?.label ?? (match as any)?.text ?? v).trim();
  }

  // ═══════════════════════════════════════════════════════════
  //  SOURCE-TYPE HELPERS
  //  Procedure number partitioning:
  //    1 – 999   → Service/Procedure  (procedure{n}_*)
  //    1000–1999 → Medication         (medication{n}_*)
  //    2000+     → Transportation     (tc_r{ride}_c{code}_*)
  // ═══════════════════════════════════════════════════════════

  /**
   * Returns the source type of a decision item based on its virtual procedureNo.
   */
  private getSourceTypeForProcedureNo(procedureNo: number): 'service' | 'medication' | 'transportation' {
    if (procedureNo >= 2000) return 'transportation';
    if (procedureNo >= 1000) return 'medication';
    return 'service';
  }

  /**
   * Human-readable source label used in tab badges / UI indicators.
   */
  getTabSourceLabel(tab: DecisionTab): string {
    const src = this.getSourceTypeForProcedureNo(tab.procedureNo);
    if (src === 'medication')     return 'Medication';
    if (src === 'transportation') return 'Transportation';
    return 'Service';
  }

  /** True when the tab's decision item originated from a Medication entry. */
  isTabMedication(tab: DecisionTab): boolean {
    return this.getSourceTypeForProcedureNo(tab.procedureNo) === 'medication';
  }

  /** True when the tab's decision item originated from a Transportation code entry. */
  isTabTransportation(tab: DecisionTab): boolean {
    return this.getSourceTypeForProcedureNo(tab.procedureNo) === 'transportation';
  }

  // ═══════════════════════════════════════════════════════════
  //  REVERSE SYNC: Decision → Source sections
  // ═══════════════════════════════════════════════════════════

  /**
   * Fires the Decision → Source reverse sync after a successful single-tab
   * or bulk save.
   *
   * Step 1: Updates in-memory authData with the saved approved/denied values
   *         so tab-status badges refresh immediately without a full reload.
   *
   * Step 2: Invokes _shellSyncDecisionToSources, which the wizard shell wires
   *         to AuthdetailsComponent.applyDecisionReverseSync().  This patches
   *         the Service / Medication / Transportation form controls in real time
   *         so the user sees the decision outcome reflected in both wizard steps
   *         without navigating away.
   *
   * @param procedureNo     Virtual procedure number of the saved decision item
   * @param savedPayload    The Decision Details payload just persisted to the backend
   */
  private fireDecisionReverseSync(procedureNo: number, savedPayload: any): void {
    if (!procedureNo || !savedPayload) return;

    const approved  = savedPayload?.approved  ?? null;
    const denied    = savedPayload?.denied    ?? null;
    const requested = savedPayload?.requested ?? null;

    // Step 1: patch in-memory authData for immediate tab label / badge refresh
    const sourceType = this.getSourceTypeForProcedureNo(procedureNo);

    if (sourceType === 'service') {
      const prefix = `procedure${procedureNo}_`;
      if (approved  !== null) this.authData[prefix + 'serviceAppr']   = approved;
      if (denied    !== null) this.authData[prefix + 'serviceDenied'] = denied;
      if (requested !== null) this.authData[prefix + 'serviceReq']    = requested;
    } else if (sourceType === 'medication') {
      const medNo  = procedureNo - 1000;
      const prefix = `medication${medNo}_`;
      if (approved  !== null) this.authData[prefix + 'approvedQuantity'] = approved;
      if (denied    !== null) this.authData[prefix + 'deniedQuantity']   = denied;
    } else if (sourceType === 'transportation') {
      const seqIdx = procedureNo - 2000;
      if (approved !== null) this.authData[`transport${seqIdx}_decisionApproved`] = approved;
      if (denied   !== null) this.authData[`transport${seqIdx}_decisionDenied`]   = denied;
    }

    // Step 2: notify shell → AuthDetails form controls
    if (typeof this._shellSyncDecisionToSources === 'function') {
      this._shellSyncDecisionToSources(
        procedureNo,
        approved,
        denied,
        requested,
        savedPayload
      );
      console.log(`[AuthDecision] Reverse sync fired → procedureNo=${procedureNo} type=${sourceType} approved=${approved} denied=${denied}`);
    } else {
      console.warn(
        '[AuthDecision] _shellSyncDecisionToSources not wired. ' +
        'Add it in AuthWizardShell.pushContextIntoCurrentStep(). ' +
        'Source sections will not update until next AuthDetails visit.'
      );
    }
  }
}
