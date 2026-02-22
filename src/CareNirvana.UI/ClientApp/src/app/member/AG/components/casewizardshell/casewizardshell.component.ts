import {
  Component,
  ViewChild,
  ViewContainerRef,
  ComponentFactoryResolver,
  ComponentRef,
  Type,
  OnDestroy,
  OnInit,
  AfterViewInit
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Subject, combineLatest } from 'rxjs';
import { distinctUntilChanged, map, takeUntil } from 'rxjs/operators';

import { AuthService } from 'src/app/service/auth.service';
import { CasedetailService } from 'src/app/service/casedetail.service';
import { DatasourceLookupService } from 'src/app/service/crud.service';
import { AuthenticateService } from 'src/app/service/authentication.service';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';

import { CaseWizardStoreService } from 'src/app/member/AG/services/case-wizard-store.service';

import { CasedetailsComponent } from 'src/app/member/AG/steps/casedetails/casedetails.component';
import { CasedispositionComponent } from 'src/app/member/AG/steps/casedisposition/casedisposition.component';
import { CasemdreviewComponent } from 'src/app/member/AG/steps/casemdreview/casemdreview.component';
import { CaseactivitiesComponent } from 'src/app/member/AG/steps/caseactivities/caseactivities.component';
import { CasenotesComponent } from 'src/app/member/AG/steps/casenotes/casenotes.component';
import { CasedocumentsComponent } from 'src/app/member/AG/steps/casedocuments/casedocuments.component';
import { CasecloseComponent } from 'src/app/member/AG/steps/caseclose/caseclose.component';
import { CaseUnsavedChangesAwareService } from 'src/app/member/AG/guards/services/caseunsavedchangesaware.service';

export interface CaseStep {
  id: string;
  label: string;
  route: string;
  disabled?: boolean;

  // Optional (doesn't break existing usage):
  icon?: string;             // material icon name (e.g., 'assignment')
  badge?: number | string;   // count badge (e.g., 2)
  hasError?: boolean;        // true when step has validation errors (shows red in stepper)
}

// ── AI panel interfaces ──
export interface SlaItem {
  label: string;
  deadline: string;
  remaining: string;
  status: 'ok' | 'warning' | 'critical';
}

export interface QuickAction {
  icon: string;
  label: string;
  description: string;
  actionId: string;
}

export interface AiSuggestion {
  type: 'insight' | 'action' | 'recommendation';
  icon: string;
  title: string;
  body: string;
  confidence: number;
  actionLabel?: string;
  actionId?: string;
}

@Component({
  selector: 'app-casewizardshell',
  templateUrl: './casewizardshell.component.html',
  styleUrls: ['./casewizardshell.component.css']
})
export class CasewizardshellComponent implements OnInit, AfterViewInit, OnDestroy, CaseUnsavedChangesAwareService {

  @ViewChild('stepContainer', { read: ViewContainerRef }) stepContainer!: ViewContainerRef;

  // Header
  headerForm!: FormGroup;
  caseTypeOptions: UiSmartOption[] = [];
  savingTop = false;

  // Expose store streams to template
  tabs$ = this.state.tabs$;
  activeLevelId$ = this.state.activeLevelId$;
  aggregate$ = this.state.aggregate$;

  // Stepper
  steps: CaseStep[] = [
    { id: 'details',     label: 'Case Details',         route: 'details',     icon: 'assignment' },
    { id: 'disposition', label: 'Disposition Details',   route: 'disposition', icon: 'task_alt' },
    { id: 'mdReview',   label: 'MD Review',             route: 'mdReview',    icon: 'medical_services' },
    { id: 'activities',  label: 'Activities',            route: 'activities',  icon: 'timeline' },
    { id: 'notes',       label: 'Notes',                 route: 'notes',       icon: 'note_alt' },
    { id: 'documents',   label: 'Documents',             route: 'documents',   icon: 'folder' },
  ];

  activeStepId = 'details';
  private currentStepRef?: ComponentRef<any>;
  private destroy$ = new Subject<void>();

  /** Tracks which step IDs have validation errors — drives red stepper indicators */
  stepErrors: Record<string, boolean> = {};

  private stepMap: Record<string, Type<any>> = {
    details: CasedetailsComponent,
    disposition: CasedispositionComponent,
    mdReview: CasemdreviewComponent,
    activities: CaseactivitiesComponent,
    notes: CasenotesComponent,
    documents: CasedocumentsComponent,
    close: CasecloseComponent
  };

  // ════════════════════════════════════
  //  NEW: Escalate
  // ════════════════════════════════════
  showEscalateConfirm = false;

  // ════════════════════════════════════
  //  RIGHT PANEL — unified (AI / Auth / Claim)
  // ════════════════════════════════════
  /** Which panel mode is active: 'ai' | 'auth' | 'claim' | null */
  rightPanelMode: 'ai' | 'auth' | 'claim' | null = null;
  /** Whether the right panel is open */
  rightPanelOpen = false;
  /** Whether the right panel is in expanded (wide) mode */
  rightPanelExpanded = false;
  /** Backward compat — old code can still reference aiPanelOpen */
  get aiPanelOpen(): boolean { return this.rightPanelOpen && this.rightPanelMode === 'ai'; }
  set aiPanelOpen(val: boolean) {
    if (val) { this.openRightPanel('ai'); } else if (this.rightPanelMode === 'ai') { this.closeRightPanel(); }
  }
  aiQuery = '';

  /** Selected auth/claim number for the detail panels */
  selectedAuthNumber = '';
  selectedClaimNumber = '';

  // ════════════════════════════════════
  //  Header field lookups (from jsonData)
  // ════════════════════════════════════
  private statusLookup: Map<string, string> = new Map();   // id → label
  private priorityLookup: Map<string, string> = new Map(); // id → label
  private userLookup: Map<string, string> = new Map();     // userId → userName

  /**
   * Known jsonData keys for header fields.
   * Pattern: SectionName_fieldId (safe() converts spaces → underscores)
   *
   *  Status   → Case_Status_Details_caseStatus
   *  Priority → Case_Overview_casePriority
   *  Assignee → Case_Status_Details_caseOwner
   *  Due Date → Case_Overview_receivedDateTime (computed) or header.dueDate
   */
  private readonly JSON_KEYS = {
    status:   ['Case_Status_Details_caseStatus', 'caseStatus', 'status'],
    priority: ['Case_Overview_casePriority', 'casePriority', 'priority'],
    assignee: ['Case_Status_Details_caseOwner', 'caseOwner', 'assignedTo', 'assigneeName'],
    dueDate:  ['dueDate', 'targetDate', 'Case_Overview_extendDueDate'],
  };

  // Read-only for non-latest levels
  isReadOnly = false;
  latestLevelId: number | null = null;

  // Escalation stepper — hover tooltip
  hoveredLevelId: number | null = null;

  /** Fixed max levels to always display in stepper (matches screenshot: 5 nodes) */
  readonly maxLevels = 5;

  /** Generates an array [1, 2, 3, 4, 5] for the stepper template */
  get allLevelSlots(): number[] {
    return Array.from({ length: this.maxLevels }, (_, i) => i + 1);
  }

  /** True if a level actually exists in the data (has a detail record) */
  levelExists(levelId: number): boolean {
    return !!this.getLevelDetail(levelId);
  }

  // SLA data (populated from API or derived from aggregate)
  slaItems: SlaItem[] = [];
  slaAtRiskCount = 0;

  // Quick actions (context-sensitive per level/step)
  quickActions: QuickAction[] = [];

  // AI suggestions (populated from AI service)
  aiSuggestions: AiSuggestion[] = [];

  constructor(
    private componentFactoryResolver: ComponentFactoryResolver,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private authService: AuthService,
    private caseApi: CasedetailService,
    private state: CaseWizardStoreService,
    private dsLookup: DatasourceLookupService,
    private userService: AuthenticateService
    // TODO: inject your AI suggestion service here
    // private aiService: CaseAiService
  ) { }

  ngOnInit(): void {
    this.headerForm = this.fb.group({
      caseType: [null]
    });

    // Load Case Types
    this.authService.getTemplates('AG', 0)
      .pipe(takeUntil(this.destroy$))
      .subscribe((rows: any[]) => {
        const list = rows ?? [];
        this.caseTypeOptions = list.map(x => ({
          value: x.id,
          label: x.templateName
        }));
      });

    // ✅ Load header field lookups (status, priority, users)
    this.loadHeaderLookups();

    // Keep header caseType in sync with wizard store
    this.state.templateId$
      .pipe(takeUntil(this.destroy$), distinctUntilChanged())
      .subscribe((templateId: number | null) => {
        this.headerForm.patchValue({ caseType: templateId }, { emitEvent: false });
        this.updateStepDisabled(templateId);
        this.pushTemplateIdIntoCurrentStep(templateId);
      });

    // EDIT MODE detection
    this.watchParamFromAnyLevel('caseNumber')
      .pipe(takeUntil(this.destroy$), distinctUntilChanged())
      .subscribe(caseNumber => {
        if (!caseNumber || caseNumber === '0') {
          this.state.resetForNew();
          this.updateStepDisabled(this.state.getTemplateId());
          this.closeAiPanel(); // no AI for brand-new unsaved cases
          return;
        }

        this.caseApi.getCaseByNumber(caseNumber)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (agg: any) => {
              this.state.setAggregate(agg);

              const templateId = this.deriveTemplateIdFromAggregate(agg);
              this.state.setTemplateId(templateId);
              this.headerForm.patchValue({ caseType: templateId }, { emitEvent: false });
              this.updateStepDisabled(templateId);

              // ✅ Compute latest (highest) level and default to it
              this.latestLevelId = this.deriveLatestLevelId(agg);
              const level = this.latestLevelId ?? 1;
              this.state.setActiveLevel(level);
              this.isReadOnly = false; // latest level is always editable

              this.pushTemplateIdIntoCurrentStep(templateId);

              // ✅ Load AI panel data now that case is loaded
              this.loadAiPanelData(agg, level);
            },
            error: (e: any) => console.error(e)
          });
      });

    // Recalc disabled whenever aggregate/template changes
    combineLatest([this.state.templateId$, this.state.aggregate$])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([tid]) => this.updateStepDisabled(tid));
  }

  ngAfterViewInit(): void {
    this.loadStep(this.activeStepId);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.currentStepRef?.destroy();
  }

  // ═══════════════════════════════════
  //  HEADER FIELD EXTRACTORS (new)
  // ═══════════════════════════════════

  /**
   * Header status — shows current level's real status,
   * or "Escalated" when viewing a previous (non-latest) level.
   */
  getStatus(agg: any): string {
    // ✅ If viewing a non-latest (read-only) level → "Escalated"
    const activeLevelId = this.state.getActiveLevelId() ?? 1;
    if (this.latestLevelId && activeLevelId !== this.latestLevelId) {
      return 'Escalated';
    }

    // 1) Try header object first
    const headerVal = agg?.header?.caseStatus ?? agg?.header?.status;
    if (headerVal) return this.resolveLabel(headerVal, this.statusLookup);

    // 2) Fallback: parse jsonData from active level
    const json = this.getActiveJsonData(agg);
    const raw = this.pickFirstKey(json, this.JSON_KEYS.status);
    return raw != null ? this.resolveLabel(raw, this.statusLookup) : '';
  }

  /** Slug for CSS class binding: "In Review" → "in-review" */
  getStatusSlug(agg: any): string {
    const raw = this.getStatus(agg);
    if (!raw) return '';
    return raw.toLowerCase().replace(/\s+/g, '-');
  }

  getPriority(agg: any): string {
    const headerVal = agg?.header?.priority;
    if (headerVal) return this.resolveLabel(headerVal, this.priorityLookup);

    const json = this.getActiveJsonData(agg);
    const raw = this.pickFirstKey(json, this.JSON_KEYS.priority);
    return raw != null ? this.resolveLabel(raw, this.priorityLookup) : '';
  }

  getPrioritySlug(agg: any): string {
    return (this.getPriority(agg) || '').toLowerCase();
  }

  getDueDate(agg: any): any {
    // 1) Header
    const headerVal = agg?.header?.dueDate ?? agg?.header?.targetDate;
    if (headerVal) return headerVal;

    // 2) jsonData — no direct "dueDate" field in template,
    //    so check detail-level properties
    const detail = this.getActiveDetail(agg);
    return detail?.dueDate ?? detail?.targetDate ?? null;
  }

  isDueSoon(agg: any): boolean {
    const due = this.getDueDate(agg);
    if (!due) return false;
    const diff = new Date(due).getTime() - Date.now();
    return diff > 0 && diff < 2 * 24 * 60 * 60 * 1000; // < 2 days
  }

  isOverdue(agg: any): boolean {
    const due = this.getDueDate(agg);
    if (!due) return false;
    return new Date(due).getTime() < Date.now();
  }

  getAssignee(agg: any): string {
    const headerVal = agg?.header?.assigneeName ?? agg?.header?.assignedTo;
    if (headerVal) return headerVal;

    const json = this.getActiveJsonData(agg);
    const raw = this.pickFirstKey(json, this.JSON_KEYS.assignee);
    if (raw == null) return '';

    // caseOwner stores userId — resolve to userName
    return this.resolveLabel(raw, this.userLookup) || String(raw);
  }

  getAssigneeInitials(agg: any): string {
    const name = this.getAssignee(agg);
    if (!name) return '';
    return name.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase();
  }

  getLevelLabel(levelId: number | null): string {
    if (!levelId) return '';
    return `Level ${levelId}`;
  }

  // ═══════════════════════════════════
  //  LEVEL CARD HELPERS (Escalation History)
  // ═══════════════════════════════════

  private getLevelDetail(levelId: number): any {
    const agg: any = (this.state as any).getAggregate?.() ?? null;
    const details: any[] = agg?.details ?? [];
    return details.find((d: any) => {
      const id = Number(d?.caseLevelId ?? d?.levelId);
      return id === levelId;
    }) ?? null;
  }

  getLevelDate(levelId: number): string {
    const detail = this.getLevelDetail(levelId);
    const raw = detail?.createdOn ?? detail?.escalatedOn ?? detail?.startDate ?? null;
    if (!raw) return '';
    try {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return '';
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } catch { return ''; }
  }

  getLevelReviewer(levelId: number): string {
    const detail = this.getLevelDetail(levelId);
    return detail?.reviewerName ?? detail?.assigneeName ?? detail?.assignedTo ?? '';
  }

  getLevelStatus(levelId: number): string {
    // ✅ Previous (non-latest) levels → always "Escalated"
    if (this.latestLevelId && levelId !== this.latestLevelId) {
      return 'Escalated';
    }

    // ✅ Latest level → resolve actual status
    const detail = this.getLevelDetail(levelId);

    // 1) Direct properties on the detail record
    const directVal = detail?.levelStatus ?? detail?.status ?? detail?.caseStatus;
    if (directVal) return this.resolveLabel(directVal, this.statusLookup);

    // 2) Parse jsonData for Case_Status_Details_caseStatus
    const raw = detail?.jsonData;
    if (raw) {
      try {
        const json = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const statusId = json?.Case_Status_Details_caseStatus ?? json?.caseStatus ?? json?.status;
        if (statusId != null) return this.resolveLabel(statusId, this.statusLookup);
      } catch { /* ignore parse errors */ }
    }

    return '';
  }

  getLevelStatusSlug(levelId: number): string {
    const raw = this.getLevelStatus(levelId);
    if (!raw) return '';
    return raw.toLowerCase().replace(/\s+/g, '-');
  }

  /** Total number of levels (always 5 for the fixed stepper display) */
  getTotalLevels(): number {
    return this.maxLevels;
  }

  /** True if the level has been escalated (i.e., there's a higher level after it) */
  isCompletedLevel(levelId: number): boolean {
    return !!this.latestLevelId && levelId < this.latestLevelId;
  }

  // ═══════════════════════════════════
  //  ESCALATE
  // ═══════════════════════════════════

  toggleEscalateConfirm(): void {
    this.showEscalateConfirm = !this.showEscalateConfirm;
  }

  confirmEscalate(): void {
    this.showEscalateConfirm = false;

    // ✅ Step 1: Validate current step first
    const hasErrors = this.validateCurrentStep();
    if (hasErrors) {
      this.setStepError(this.activeStepId, true);
      this.scrollToFirstValidationError();
      this.showSaveBanner('Please fix validation errors before escalating.', 3000);
      return;
    }

    // ✅ Step 2: Clear error for current step
    this.setStepError(this.activeStepId, false);

    // ✅ Step 3: Save the current step before escalating
    const inst: any = this.currentStepRef?.instance;
    if (inst && typeof inst.save === 'function') {
      const result = inst.save();

      const doEscalate = () => {
        this.performEscalation();
      };

      if (result && typeof result.then === 'function') {
        result.then(() => doEscalate()).catch((err: any) => {
          console.error('Save before escalate failed:', err);
          this.showSaveBanner('Save failed. Cannot escalate.', 3000);
        });
      } else {
        doEscalate();
      }
    } else {
      this.performEscalation();
    }
  }

  /** Performs the actual escalation — creates next level and moves to it */
  private performEscalation(): void {
    const currentLevel = this.latestLevelId ?? 1;
    const nextLevel = currentLevel + 1;
    const caseHeaderId = this.state.getHeaderId?.() ?? null;
    const userId = Number(sessionStorage.getItem('loggedInUserid')) || 0;

    if (!caseHeaderId) {
      this.showSaveBanner('Please save the case first before escalating.', 3000);
      return;
    }

    const agg: any = (this.state as any).getAggregate?.() ?? null;
    const caseNumber = this.getCaseNumber(agg);

    // ═══════════════════════════════════════════════════════════════
    //  ✅ COPY CURRENT LEVEL'S FULL DATA INTO THE NEW LEVEL
    //  Same merge pattern as casedetails save():
    //    1. Get persisted jsonData from current level (all steps)
    //    2. Merge in any current form values from the active step
    //    3. Pass merged data as the new level's jsonData
    // ═══════════════════════════════════════════════════════════════

    // 1) Get the current level's persisted jsonData (already saved by confirmEscalate → save())
    const currentDetail = this.state.getDetailForLevel(currentLevel);
    let currentJsonObj: any = {};
    if (currentDetail?.jsonData) {
      try {
        currentJsonObj = typeof currentDetail.jsonData === 'string'
          ? JSON.parse(currentDetail.jsonData)
          : currentDetail.jsonData;
      } catch { currentJsonObj = {}; }
    }

    // 2) Also merge in any live form values from the active step component
    //    (safety net: in case save didn't capture everything, e.g. other steps' data)
    const inst: any = this.currentStepRef?.instance;
    let liveFormValues: any = {};
    if (inst) {
      // Direct form (casedetails)
      const form = inst?.form ?? inst?.detailsComp?.form;
      if (form && typeof form.getRawValue === 'function') {
        liveFormValues = form.getRawValue() ?? {};
      }
    }

    // 3) Merge: persisted base ← live form overlay (same as casedetails save merge pattern)
    const mergedData = { ...(currentJsonObj ?? {}), ...(liveFormValues ?? {}) };
    const jsonData = JSON.stringify(mergedData);

    console.log('Escalating with copied data:', {
      currentLevel,
      nextLevel,
      keysFromPersisted: Object.keys(currentJsonObj).length,
      keysFromForm: Object.keys(liveFormValues).length,
      totalMergedKeys: Object.keys(mergedData).length
    });

    // ═══════════════════════════════════════════════════════════════

    this.caseApi.addCaseLevel(
      {
        caseHeaderId,
        caseNumber,
        levelId: nextLevel,
        jsonData,
      },
      userId
    ).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // ✅ Reload aggregate to reflect new level
          this.caseApi.getByHeaderId(caseHeaderId, false)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (updatedAgg: any) => {
                this.state.setAggregate(updatedAgg);
                this.latestLevelId = this.deriveLatestLevelId(updatedAgg);

                // ✅ Auto-move to the new (next) level
                this.state.setActiveLevel(nextLevel);
                this.isReadOnly = false;

                // Push new level into current step
                if (this.currentStepRef) {
                  const stepInst: any = this.currentStepRef.instance;
                  if ('readOnly' in stepInst) this.currentStepRef.setInput('readOnly', false);
                  if (typeof stepInst?.setReadOnly === 'function') stepInst.setReadOnly(false);
                  if ('levelId' in stepInst) this.currentStepRef.setInput('levelId', nextLevel);
                  if (typeof stepInst?.onLevelChanged === 'function') stepInst.onLevelChanged(nextLevel);
                  if (typeof stepInst?.reload === 'function') stepInst.reload();
                }

                // Refresh AI panel
                if (updatedAgg) this.loadAiPanelData(updatedAgg, nextLevel);

                this.showSaveBanner(`Case escalated to Level ${nextLevel} successfully.`, 3000);
                // Clear all step errors since we're now on a fresh level
                this.stepErrors = {};
                this.steps = this.steps.map(s => ({ ...s, hasError: false }));
              },
              error: (e: any) => {
                console.error('Failed to reload aggregate after escalation:', e);
                this.showSaveBanner('Escalated but failed to refresh. Please reload.', 4000);
              }
            });
        },
        error: (e: any) => {
          console.error('Escalation failed:', e);
          this.showSaveBanner(e?.message ? `Escalation failed: ${e.message}` : 'Escalation failed.', 4000);
        }
      });
  }

  cancelEscalate(): void {
    this.showEscalateConfirm = false;
  }

  // ═══════════════════════════════════
  //  RIGHT PANEL (unified: AI / Auth / Claim)
  // ═══════════════════════════════════

  /**
   * Opens the right panel in the specified mode.
   * If same mode is already open, toggles it closed.
   * If a different mode is open, switches to the new mode.
   */
  openRightPanel(mode: 'ai' | 'auth' | 'claim', identifier?: string): void {
    // Toggle off if same mode
    if (this.rightPanelOpen && this.rightPanelMode === mode) {
      this.closeRightPanel();
      return;
    }

    this.rightPanelMode = mode;
    this.rightPanelOpen = true;
    // Reset expanded when switching modes
    this.rightPanelExpanded = false;

    // Set identifier for auth/claim
    if (mode === 'auth' && identifier) {
      this.selectedAuthNumber = identifier;
    } else if (mode === 'claim' && identifier) {
      this.selectedClaimNumber = identifier;
    }
  }

  /** Opens auth detail panel for the given auth number */
  openAuthPanel(authNumber: string): void {
    this.openRightPanel('auth', authNumber);
  }

  /** Opens claim detail panel for the given claim number */
  openClaimPanel(claimNumber: string): void {
    this.openRightPanel('claim', claimNumber);
  }

  /** Close the right panel entirely */
  closeRightPanel(): void {
    this.rightPanelOpen = false;
    this.rightPanelExpanded = false;
    // Keep mode so animation completes before content disappears
    setTimeout(() => {
      if (!this.rightPanelOpen) this.rightPanelMode = null;
    }, 350);
  }

  /** Toggle expanded (wide) mode for the right panel */
  togglePanelExpand(): void {
    this.rightPanelExpanded = !this.rightPanelExpanded;
  }

  /** Backward compat wrappers */
  toggleAiPanel(): void {
    this.openRightPanel('ai');
  }

  closeAiPanel(): void {
    if (this.rightPanelMode === 'ai') this.closeRightPanel();
  }

  /** Load AI panel content after case is saved and has a case number */
  loadAiPanelData(agg: any, levelId: number): void {
    const caseNumber = this.getCaseNumber(agg);
    if (!caseNumber) return;

    // ── SLA (derive from aggregate or call SLA API) ──
    this.loadSlaData(agg, levelId);

    // ── Quick Actions (context-sensitive) ──
    this.loadQuickActions(agg, levelId);

    // ── AI Suggestions (call your AI service) ──
    this.loadAiSuggestions(agg, levelId);
  }

  private loadSlaData(agg: any, levelId: number): void {
    // TODO: Replace with actual SLA API call
    // this.slaService.getSlaForCase(caseHeaderId, levelId).subscribe(items => { ... })

    // Placeholder logic — compute from aggregate dates
    this.slaItems = [
      {
        label: 'Initial Review',
        deadline: '02/16/2026 5:00 PM',
        remaining: '1d 3h',
        status: 'warning'
      },
      {
        label: 'MD Decision Due',
        deadline: '02/20/2026 EOD',
        remaining: '5d 0h',
        status: 'ok'
      },
      {
        label: 'Member Notification',
        deadline: '02/22/2026 EOD',
        remaining: '7d 0h',
        status: 'ok'
      }
    ];

    this.slaAtRiskCount = this.slaItems.filter(s => s.status !== 'ok').length;
  }

  private loadQuickActions(agg: any, levelId: number): void {
    // Build context-sensitive actions based on level and case state
    const actions: QuickAction[] = [
      { icon: '📋', label: 'Request Medical Records', description: 'Send request to provider', actionId: 'requestRecords' },
      { icon: '👨‍⚕️', label: 'Assign MD Reviewer', description: 'Route to clinical review', actionId: 'assignMd' },
      { icon: '📞', label: 'Log Member Contact', description: 'Record outreach attempt', actionId: 'logContact' },
      { icon: '📄', label: 'Generate Letter', description: 'Create determination letter', actionId: 'generateLetter' },
    ];

    // Conditionally add/remove based on level
    if (levelId >= 2) {
      actions.push({
        icon: '🔄', label: 'Request Peer Review',
        description: 'Initiate peer-to-peer review', actionId: 'peerReview'
      });
    }

    this.quickActions = actions;
  }

  private loadAiSuggestions(agg: any, levelId: number): void {
    // TODO: Replace with actual AI service call
    // this.aiService.getSuggestions(caseHeaderId, levelId).subscribe(suggestions => { ... })

    // Placeholder suggestions
    this.aiSuggestions = [
      {
        type: 'insight',
        icon: '💡',
        title: 'Similar Case Pattern Detected',
        body: '3 cases with matching diagnosis and procedure were approved in the last 90 days. Average turnaround: 4.2 days.',
        confidence: 92,
        actionLabel: 'View Similar Cases',
        actionId: 'viewSimilar'
      },
      {
        type: 'action',
        icon: '⚡',
        title: 'Missing Documentation Alert',
        body: 'Clinical notes from referring provider are not yet attached. This is required for MD review per protocol.',
        confidence: 88,
        actionLabel: 'Request Documents',
        actionId: 'requestDocs'
      },
      {
        type: 'recommendation',
        icon: '🎯',
        title: 'Recommended Next Step',
        body: 'Based on case type and current level, consider routing to specialist reviewer with relevant expertise.',
        confidence: 85,
        actionLabel: 'Route Case',
        actionId: 'routeCase'
      }
    ];
  }

  onQuickAction(action: QuickAction): void {
    // TODO: Implement quick action routing
    console.log('Quick action:', action.actionId);

    switch (action.actionId) {
      case 'requestRecords':
        // navigate or open dialog
        break;
      case 'assignMd':
        // navigate to MD review step or open assignment dialog
        break;
      case 'logContact':
        // navigate to activities step
        this.onStepSelected('activities');
        break;
      case 'generateLetter':
        // open letter generation dialog
        break;
    }
  }

  onAiAction(suggestion: AiSuggestion): void {
    // TODO: Implement AI action routing
    console.log('AI action:', suggestion.actionId);
  }

  askAi(): void {
    if (!this.aiQuery?.trim()) return;

    const query = this.aiQuery.trim();
    this.aiQuery = '';

    // TODO: Call your AI chat service
    // this.aiService.askQuestion(caseHeaderId, query).subscribe(response => {
    //   this.aiSuggestions.unshift({ type: 'insight', ... });
    // });

    console.log('AI query:', query);
  }

  // ═══════════════════════════════════
  //  UI ACTIONS (existing)
  // ═══════════════════════════════════

  selectLevel(levelId: number): void {
    if (!this.canNavigateAway()) return;
    this.state.setActiveLevel(levelId);

    // ✅ Only the latest level is editable; all others are read-only
    this.isReadOnly = !this.isLatestLevel(levelId);

    this.currentStepRef?.setInput?.('levelId', levelId);

    // ✅ Push readOnly into child step
    if (this.currentStepRef) {
      const inst: any = this.currentStepRef.instance;
      if ('readOnly' in inst) this.currentStepRef.setInput('readOnly', this.isReadOnly);
      if (typeof inst?.setReadOnly === 'function') inst.setReadOnly(this.isReadOnly);
    }

    const inst: any = this.currentStepRef?.instance;
    if (typeof inst?.onLevelChanged === 'function') inst.onLevelChanged(levelId);
    if (typeof inst?.reload === 'function') inst.reload();

    // ✅ Refresh AI panel data for new level
    const agg: any = (this.state as any).getAggregate?.() ?? null;
    if (agg) this.loadAiPanelData(agg, levelId);
  }

  onStepSelected(step: any): void {
    const stepId = typeof step === 'string' ? step : (step?.id ?? step?.route);
    if (!stepId || stepId === this.activeStepId) return;

    if (!this.canNavigateAway()) return;

    // ✅ Check if current step has errors and update tracking
    const currentHasErrors = this.validateCurrentStep();
    this.setStepError(this.activeStepId, currentHasErrors);

    this.activeStepId = stepId;
    this.loadStep(stepId);
  }

  saveFromTop(): void {
    // ✅ Block save for read-only (non-latest) levels
    if (this.isReadOnly) {
      this.showSaveBanner('This level is read-only. Only the latest level can be edited.', 3000);
      return;
    }

    const inst: any = this.currentStepRef?.instance;
    if (!inst || typeof inst.save !== 'function') {
      console.warn('Current step has no save() method.');
      return;
    }

    // ✅ Validate current step first and track errors
    const hasErrors = this.validateCurrentStep();
    if (hasErrors) {
      // Mark current step as having errors
      this.setStepError(this.activeStepId, true);
      // Scroll to first validation error on current page
      this.scrollToFirstValidationError();
      return;
    }

    // ✅ Current step is valid — clear its error state
    this.setStepError(this.activeStepId, false);

    try {
      this.savingTop = true;
      const result = inst.save();

      // Handle async save (Promise)
      if (result && typeof result.then === 'function') {
        result.then(() => {
          this.savingTop = false;
          this.afterSaveValidation();
        }).catch(() => {
          this.savingTop = false;
        });
      } else {
        this.savingTop = false;
        this.afterSaveValidation();
      }
    } catch {
      this.savingTop = false;
    }
  }

  /** After save completes, check if there are error steps to navigate to */
  private afterSaveValidation(): void {
    // Check if current step still has errors (e.g. save succeeded but another step has errors)
    const nextErrorStep = this.findNextStepWithError(this.activeStepId);
    if (nextErrorStep) {
      // Navigate to the next step that has validation errors
      this.onStepSelected(nextErrorStep);
      setTimeout(() => this.scrollToFirstValidationError(), 300);
    }
  }

  /** Validate the current step — returns true if there are errors */
  private validateCurrentStep(): boolean {
    const inst: any = this.currentStepRef?.instance;
    if (!inst) return false;

    // Call the component's own validation logic
    if (typeof inst.syncFormControlVisibility === 'function') {
      inst.syncFormControlVisibility();
    }
    if (typeof inst.markVisibleControlsTouched === 'function') {
      inst.markVisibleControlsTouched();
    }

    // Check the details component within wrapper components (like disposition)
    const detailsComp = inst?.detailsComp;
    if (detailsComp) {
      if (typeof detailsComp.syncFormControlVisibility === 'function') {
        detailsComp.syncFormControlVisibility();
      }
      if (typeof detailsComp.markVisibleControlsTouched === 'function') {
        detailsComp.markVisibleControlsTouched();
      }
      return detailsComp.form?.invalid ?? false;
    }

    return inst.form?.invalid ?? false;
  }

  /** Scroll to the first visible validation error on the current page */
  private scrollToFirstValidationError(): void {
    setTimeout(() => {
      const contentEl = document.querySelector('.cw-content');
      if (!contentEl) return;

      const errorEl = contentEl.querySelector('.ff-error:not([hidden])');
      if (!errorEl) {
        // Also look for ff-invalid outline
        const invalidEl = contentEl.querySelector('.ff-invalid');
        if (invalidEl) {
          invalidEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }
      errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  /** Mark a step as having or not having errors — updates the steps array */
  setStepError(stepId: string, hasError: boolean): void {
    this.stepErrors[stepId] = hasError;
    this.steps = this.steps.map(s => ({
      ...s,
      hasError: this.stepErrors[s.id] ?? false
    }));
  }

  /** Clear error for a step (called when validation passes) */
  clearStepError(stepId: string): void {
    this.setStepError(stepId, false);
  }

  /** Find the next step (after the given one) that has errors */
  private findNextStepWithError(afterStepId: string): string | null {
    const idx = this.steps.findIndex(s => s.id === afterStepId);
    if (idx < 0) return null;

    // Look forward from current step
    for (let i = idx + 1; i < this.steps.length; i++) {
      if (this.stepErrors[this.steps[i].id]) return this.steps[i].id;
    }
    // Wrap around — look from beginning
    for (let i = 0; i < idx; i++) {
      if (this.stepErrors[this.steps[i].id]) return this.steps[i].id;
    }
    return null;
  }

  // ═══════════════════════════════════
  //  DYNAMIC STEP LOADING (existing)
  // ═══════════════════════════════════

  private loadStep(stepId: string): void {
    const cmp = this.stepMap[stepId] ?? CasedetailsComponent;

    this.stepContainer.clear();
    this.currentStepRef?.destroy();

    const factory = this.componentFactoryResolver.resolveComponentFactory(cmp);
    this.currentStepRef = this.stepContainer.createComponent(factory);

    const inst: any = this.currentStepRef.instance;
    inst.showSavedMessage = (msg: string) => this.showSaveBanner(msg);

    // ✅ Inject validation reporter so child can update stepper error state
    inst._shellReportValidation = (hasErrors: boolean) => {
      this.setStepError(stepId, hasErrors);
    };

    // ✅ Inject auth/claim panel openers so cards can open the right panel
    inst._shellOpenAuthPanel = (authNumber: string) => {
      this.openAuthPanel(authNumber);
    };
    inst._shellOpenClaimPanel = (claimNumber: string) => {
      this.openClaimPanel(claimNumber);
    };

    if (inst && 'stepId' in inst) {
      inst.stepId = stepId;
    }

    const templateId = this.state.getTemplateId?.() ?? this.headerForm.get('caseType')?.value;
    if (typeof inst?.setTemplateId === 'function') {
      inst.setTemplateId(templateId);
    }

    this.pushContextIntoCurrentStep();
    this.currentStepRef.changeDetectorRef.detectChanges();
  }

  private pushContextIntoCurrentStep(): void {
    if (!this.currentStepRef) return;

    const inst: any = this.currentStepRef.instance;

    const caseHeaderId = this.state.getHeaderId?.() ?? null;
    const caseTemplateId = this.state.getTemplateId?.() ?? null;
    const levelId = this.state.getActiveLevelId() ?? 1;

    const agg: any = (this.state as any).getAggregate?.() ?? null;
    const caseNumber = agg?.header?.caseNumber ?? agg?.caseNumber ?? null;
    const memeberDetailsId = Number(sessionStorage.getItem('selectedMemberDetailsId') || 0);

    if ('caseHeaderId' in inst) this.currentStepRef!.setInput('caseHeaderId', caseHeaderId);
    if ('caseTemplateId' in inst) this.currentStepRef!.setInput('caseTemplateId', caseTemplateId);
    if ('levelId' in inst) this.currentStepRef!.setInput('levelId', levelId);
    if ('caseNumber' in inst) this.currentStepRef!.setInput('caseNumber', caseNumber);
    if ('memberDetailsId' in inst) this.currentStepRef!.setInput('memberDetailsId', memeberDetailsId);

    // ✅ Push readOnly flag into step components
    if ('readOnly' in inst) this.currentStepRef!.setInput('readOnly', this.isReadOnly);
    if (typeof inst?.setReadOnly === 'function') inst.setReadOnly(this.isReadOnly);

    if (typeof inst?.setContext === 'function') {
      inst.setContext({ caseHeaderId, caseTemplateId, levelId, caseNumber, memeberDetailsId, readOnly: this.isReadOnly });
    }
  }

  private pushTemplateIdIntoCurrentStep(templateId: number | null): void {
    const inst: any = this.currentStepRef?.instance;
    if (typeof inst?.setTemplateId === 'function') {
      inst.setTemplateId(templateId);
    } else if (typeof inst?.forwardTemplateId === 'function') {
      inst.forwardTemplateId(templateId);
    }
  }

  private updateStepDisabled(templateId: number | null): void {
    const hasType = !!templateId;
    this.steps = this.steps.map(s => ({
      ...s,
      disabled: !hasType && s.id !== 'details'
    }));
  }

  private canNavigateAway(): boolean {
    const inst: any = this.currentStepRef?.instance;
    const hasUnsaved = !!inst?.hasUnsavedChanges?.();
    if (!hasUnsaved) return true;
    return confirm('You have unsaved changes. Do you want to continue?');
  }

  // ═══════════════════════════════════
  //  ROUTE HELPERS (existing)
  // ═══════════════════════════════════

  private watchParamFromAnyLevel(paramName: string) {
    const chain: ActivatedRoute[] = [];
    let r: ActivatedRoute | null = this.route;
    while (r) {
      chain.push(r);
      r = r.parent;
    }

    return combineLatest(
      chain.map(x => x.paramMap.pipe(map(pm => pm.get(paramName))))
    ).pipe(
      map(list => list.find(v => v != null) ?? null),
      distinctUntilChanged()
    );
  }

  private deriveTemplateIdFromAggregate(agg: any): number | null {
    const raw = agg?.header?.caseType ?? agg?.header?.templateId ?? null;
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  private deriveActiveLevelIdFromAggregate(agg: any): number | null {
    const details: any[] = agg?.details ?? [];
    const ids = (details ?? [])
      .map(d => Number(d?.caseLevelId ?? d?.levelId))
      .filter(x => Number.isFinite(x) && x > 0)
      .sort((a, b) => a - b);

    // ✅ Select the LAST (highest) level
    return ids.length ? ids[ids.length - 1] : null;
  }

  /** Returns the highest level ID (the latest escalation). */
  private deriveLatestLevelId(agg: any): number | null {
    return this.deriveActiveLevelIdFromAggregate(agg);
  }

  /** True only when levelId is the latest (highest) level — only this level is editable. */
  isLatestLevel(levelId: number | null): boolean {
    if (!levelId || !this.latestLevelId) return true;
    return levelId === this.latestLevelId;
  }

  // ═══════════════════════════════════
  //  HEADER EXTRACTORS (existing)
  // ═══════════════════════════════════

  getCaseTypeLabel(id: any): string {
    const n = id == null ? NaN : Number(id);
    if (!Number.isFinite(n) || n <= 0) return '';
    return this.caseTypeOptions.find(o => Number(o.value) === n)?.label ?? '';
  }

  getCaseNumber(agg: any): string {
    return agg?.header?.caseNumber ?? agg?.caseNumber ?? '';
  }

  public isCaseTypeLocked(agg: any): boolean {
    const cn = this.getCaseNumber(agg);
    return !!cn;
  }

  getCreatedOn(agg: any): any {
    return agg?.header?.createdOn ?? agg?.createdOn ?? null;
  }

  getReceivedOn(agg: any): any {
    const direct = agg?.header?.receivedOn ?? agg?.receivedOn ?? null;
    if (direct) return direct;

    const json = this.getActiveJsonData(agg);
    return json?.Case_Overview_receivedDateTime ?? null;
  }

  // ═══════════════════════════════════
  //  UNSAVED CHANGES (existing)
  // ═══════════════════════════════════

  caseHasUnsavedChanges(): boolean {
    const inst: any = this.currentStepRef?.instance;
    return !!(
      inst?.caseHasUnsavedChanges?.() ??
      inst?.hasUnsavedChanges?.() ??
      false
    );
  }

  // ═══════════════════════════════════
  //  SAVE BANNER (existing)
  // ═══════════════════════════════════

  saveBannerText: string | null = null;
  private saveBannerTimer: any;

  showSaveBanner(text: string, autoHideMs = 2500): void {
    this.saveBannerText = text;
    clearTimeout(this.saveBannerTimer);
    this.saveBannerTimer = setTimeout(() => this.saveBannerText = null, autoHideMs);
  }

  clearSaveBanner(): void {
    this.saveBannerText = null;
    clearTimeout(this.saveBannerTimer);
  }

  // ═══════════════════════════════════════════
  //  HEADER FIELD LOOKUPS (status, priority, users)
  // ═══════════════════════════════════════════

  /**
   * Load dropdown lookups so we can resolve IDs → labels
   * for Status, Priority, and Assignee (Case Owner).
   */
  private loadHeaderLookups(): void {
    // Status lookup (datasource: 'casestatus')
    this.dsLookup
      .getOptionsWithFallback(
        'casestatus',
        (r: any) => ({
          value: r?.value ?? r?.id ?? r?.code,
          label: r?.label ?? r?.caseStatus ?? r?.name ?? r?.description ?? String(r?.value ?? '')
        }),
        ['AG']
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (opts: any) => {
          console.log('[casestatus] opts:', opts);
          console.log('[casestatus] count:', (opts ?? []).length);
          console.log('[casestatus] first:', (opts ?? [])[0]);

          this.statusLookup.clear();
          for (const o of (opts ?? [])) {
            this.statusLookup.set(String(o.value), o.label ?? o.text ?? String(o.value));
          }

          console.log('[casestatus] map size:', this.statusLookup.size);
          console.log('[casestatus] map entries sample:', Array.from(this.statusLookup.entries()).slice(0, 5));
        },
        error: (err) => console.error('[casestatus] error:', err),
        complete: () => console.log('[casestatus] complete')
      });

    // Priority lookup (datasource: 'casepriority')
    this.dsLookup
      .getOptionsWithFallback(
        'casepriority',
        (r: any) => ({
          value: r?.value ?? r?.id ?? r?.code,
          label: r?.label ?? r?.casePriority ?? r?.name ?? r?.description ?? String(r?.value ?? '')
        }),
        ['AG']
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe((opts: any) => {
        this.priorityLookup.clear();
        for (const o of (opts ?? [])) {
          this.priorityLookup.set(String(o.value), o.label ?? o.text ?? String(o.value));
        }
      });

    // User lookup for Case Owner (userId → userName)
    this.userService.getAllUsers()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (users: any[]) => {
          this.userLookup.clear();
          for (const u of (users ?? [])) {
            this.userLookup.set(String(u.userId), u.userName ?? u.name ?? String(u.userId));
          }
        },
        error: (e) => console.warn('Failed to load users for header lookup:', e)
      });
  }

  // ═══════════════════════════════════════════
  //  JSON DATA HELPERS
  // ═══════════════════════════════════════════

  /**
   * Returns the parsed jsonData from the ACTIVE level's detail record.
   * This is where all form field values are stored.
   */
  private getActiveJsonData(agg: any): any {
    const detail = this.getActiveDetail(agg);
    if (!detail) return null;

    const raw = detail?.jsonData;
    if (!raw) return null;

    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  }

  /** Returns the detail record for the currently active level. */
  private getActiveDetail(agg: any): any {
    const activeLevelId = this.state.getActiveLevelId() ?? 1;
    const details: any[] = agg?.details ?? [];
    return details.find((d: any) => {
      const id = Number(d?.caseLevelId ?? d?.levelId);
      return id === activeLevelId;
    }) ?? details[0] ?? null;
  }

  /**
   * Given a parsed jsonData object, returns the value for the first matching key.
   * Tries multiple candidate keys (to handle different naming conventions).
   */
  private pickFirstKey(obj: any, keys: string[]): any {
    if (!obj || typeof obj !== 'object') return null;
    for (const k of keys) {
      if (obj[k] != null && obj[k] !== '') return obj[k];
    }
    return null;
  }

  /**
   * Resolves a raw ID to a display label via a lookup map.
   * If no match found, returns the raw value as-is (might already be a label).
   */
  private resolveLabel(rawValue: any, lookup: Map<string, string>): string {
    if (rawValue == null || rawValue === '') return '';
    const key = String(rawValue);

    // Check lookup map
    const label = lookup.get(key);
    if (label) return label;

    // If rawValue is already a string label (not a numeric ID), return as-is
    if (isNaN(Number(key))) return key;

    // Numeric ID but no lookup match yet (options may still be loading) — return raw
    return key;
  }
}
