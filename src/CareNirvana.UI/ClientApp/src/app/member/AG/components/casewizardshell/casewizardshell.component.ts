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
    { id: 'details', label: 'Case Details', route: 'details' },
    { id: 'disposition', label: 'Disposition Details', route: 'disposition' },
    { id: 'mdReview', label: 'MD Review', route: 'mdReview' },
    { id: 'activities', label: 'Activities', route: 'activities' },
    { id: 'notes', label: 'Notes', route: 'notes' },
    { id: 'documents', label: 'Documents', route: 'documents' },
  ];

  activeStepId = 'details';
  private currentStepRef?: ComponentRef<any>;
  private destroy$ = new Subject<void>();

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
  //  NEW: AI Panel state
  // ════════════════════════════════════
  aiPanelOpen = false;
  aiQuery = '';

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
    private state: CaseWizardStoreService
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

              const level = this.deriveActiveLevelIdFromAggregate(agg) ?? 1;
              this.state.setActiveLevel(level);

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

  /** Status text from aggregate (map your actual status codes) */
  getStatus(agg: any): string {
    return agg?.header?.caseStatus ?? agg?.header?.status ?? '';
  }

  /** Slug for CSS class binding: "In Review" → "in-review" */
  getStatusSlug(agg: any): string {
    const raw = this.getStatus(agg);
    if (!raw) return '';
    return raw.toLowerCase().replace(/\s+/g, '-');
  }

  getPriority(agg: any): string {
    return agg?.header?.priority ?? '';
  }

  getPrioritySlug(agg: any): string {
    return (this.getPriority(agg) || '').toLowerCase();
  }

  getDueDate(agg: any): any {
    return agg?.header?.dueDate ?? agg?.header?.targetDate ?? null;
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
    return agg?.header?.assigneeName ?? agg?.header?.assignedTo ?? '';
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
  //  ESCALATE
  // ═══════════════════════════════════

  toggleEscalateConfirm(): void {
    this.showEscalateConfirm = !this.showEscalateConfirm;
  }

  confirmEscalate(): void {
    this.showEscalateConfirm = false;

    // TODO: Call your escalation API
    // this.caseApi.escalateCase(caseHeaderId).subscribe(...)

    this.showSaveBanner('Case escalated successfully.', 3000);
    // Optionally refresh aggregate to reflect new status
  }

  cancelEscalate(): void {
    this.showEscalateConfirm = false;
  }

  // ═══════════════════════════════════
  //  AI PANEL
  // ═══════════════════════════════════

  toggleAiPanel(): void {
    this.aiPanelOpen = !this.aiPanelOpen;
  }

  closeAiPanel(): void {
    this.aiPanelOpen = false;
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

    this.currentStepRef?.setInput?.('levelId', levelId);

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

    this.activeStepId = stepId;
    this.loadStep(stepId);
  }

  saveFromTop(): void {
    const inst: any = this.currentStepRef?.instance;
    if (!inst || typeof inst.save !== 'function') {
      console.warn('Current step has no save() method.');
      return;
    }

    try {
      this.savingTop = true;
      inst.save();
    } finally {
      this.savingTop = false;
    }
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

    if (typeof inst?.setContext === 'function') {
      inst.setContext({ caseHeaderId, caseTemplateId, levelId, caseNumber, memeberDetailsId });
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

    return ids.length ? ids[0] : null;
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

    const first = agg?.details?.[0];
    const json = first?.jsonData;
    if (!json) return null;

    try {
      const obj = typeof json === 'string' ? JSON.parse(json) : json;
      return obj?.Case_Overview_receivedDateTime ?? null;
    } catch {
      return null;
    }
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
}
