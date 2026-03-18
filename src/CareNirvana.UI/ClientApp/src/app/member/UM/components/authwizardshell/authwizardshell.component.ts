import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild, ComponentRef } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, Subscription, take } from 'rxjs';
import { WizardToastService, WizardToastMessage } from './wizard-toast.service';
import { AuthDetailApiService } from 'src/app/service/authdetailapi.service';
import { AuthDetailRow } from 'src/app/member/UM/services/authdetail';
import { AuthService } from 'src/app/service/auth.service';
import { CrudService, DatasourceLookupService } from 'src/app/service/crud.service';
import { AuthunsavedchangesawareService } from 'src/app/member/UM/services/authunsavedchangesaware.service';
import { AuthenticateService } from 'src/app/service/authentication.service';
export interface AuthWizardStep {
  id: string;
  label: string;
  route: string;
  disabled?: boolean;
  // Optional (doesn't break existing usage):
  icon?: string;       // material icon name (e.g., 'folder')
  badge?: number | string; // count (e.g., 2)
}

export interface AuthWizardContext {
  authNumber: string;              // route param
  isNewAuth: boolean;

  // resolved/derived values (shell or details step sets these)
  authDetailId: number | null;
  authTemplateId: number | null;   // used by /template/{authTemplateId}/...
  authClassId: number | null;
  authTypeId: number | null;
  memberDetailsId: number | null;
  memberEnrollmentId: number | null;

  // common
  userId: number;
}

@Component({
  selector: 'app-authwizardshell',
  templateUrl: './authwizardshell.component.html',
  styleUrls: ['./authwizardshell.component.css']
})
export class AuthwizardshellComponent implements OnInit, AfterViewInit, OnDestroy, AuthunsavedchangesawareService {
  @ViewChild(RouterOutlet) outlet?: RouterOutlet;

  steps: AuthWizardStep[] = [];
  activeStepId = '';

  authNumber: string = '0';
  isNewAuth = true;

  /** Hide MD Review step by default; enable when user opts-in or when an existing MD Review is detected */
  showMdReview = false;

  /** True when the authorization is in a "Closed" status — puts the entire wizard into view-only mode */
  isAuthClosed = false;

  /** When true, detectClosedStatus() skips re-closing (set by reopenAuth, cleared on next save) */
  private _reopenOverrideActive = false;

  // ---------------------------
  // Header bar (above stepper)
  // ---------------------------
  shellSaving = false;

  header = {
    authNumber: '',
    createdBy: '',
    createdOn: '',
    dueDate: '',
    // ── New rich-header fields ──
    authTypeName: '',
    authClassName: '',
    priorityLabel: '',
    priorityCode: '',
    authStatusLabel: '',
    authStatusCode: '',
    daysLeft: null as number | null,
    daysLeftStatus: 'ok' as 'ok' | 'warning' | 'danger',
    overallDecision: 'Pending',
    overallDecisionCode: 'pending',
    decisionSummary: { total: 0, approved: 0, partial: 0, denied: 0, pending: 0 }
  };

  // ── Dynamic lookup caches (fetched from API, same sources as Auth Details step) ──
  private authClassMap: Map<string, string> = new Map();
  private authTypeMap: Map<string, string> = new Map();
  private statusLookup: Map<string, string> = new Map();    // authStatus id → label
  private priorityLookup: Map<string, string> = new Map();  // requestPriority id → label
  private userLookup: Map<string, string> = new Map();      // userId → userName (for Created By)
  private lastAuthClassIdForTypeLookup: number | null = null;

  /** Reference to the currently active child step instance (for reading resolved options) */
  private activeChildInst: any = null;

  // ---------------------------
  // Common toast beside stepper
  // ---------------------------
  toast = {
    visible: false,
    type: 'success' as 'success' | 'error' | 'info',
    text: ''
  };

  private toastTimer: any = null;

  // ════════════════════════════════════
  //  RIGHT PANEL — unified (AI / Provider)
  // ════════════════════════════════════
  rightPanelMode: 'ai' | 'provider' | null = null;
  rightPanelOpen = false;
  rightPanelExpanded = false;
  aiQuery = '';

  /** Selected provider for the detail panel */
  selectedProviderId = '';
  selectedProviderName = '';
  selectedProviderData: any = null;

  // ── AI Panel data ──
  slaItems: { label: string; deadline: string; remaining: string; status: string }[] = [];
  slaAtRiskCount = 0;

  quickActions: { icon: string; label: string; description: string; actionId: string }[] = [];

  aiSuggestions: {
    icon: string; title: string; body: string; confidence: number;
    type: string; actionLabel?: string; actionId?: string;
  }[] = [];

  // ── Dynamic badge counts (keyed by step id) ──
  badgeCounts: Record<string, number> = {
    decision: 0,
    mdReview: 0,
    activities: 0,
    notes: 0,
    documents: 0
  };

  /** Cached parsed dataJson so child steps can trigger recount */
  private cachedDataObj: any = null;


  /** Single source of truth for all steps */
  private ctx: AuthWizardContext = {
    authNumber: '0',
    isNewAuth: true,

    authDetailId: null,
    authTemplateId: null,
    authClassId: null,
    authTypeId: null,
    memberDetailsId: null,
    memberEnrollmentId: null,

    userId: Number(sessionStorage.getItem('loggedInUserid') || 0)
  };

  private sub = new Subscription();
  private currentStepRef?: ComponentRef<any>;
  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authApi: AuthDetailApiService,
    private toastSvc: WizardToastService,
    private activityService: AuthService,
    private crudService: CrudService,
    private dsLookup: DatasourceLookupService,
    private authenticateService: AuthenticateService
  ) { }

  ngOnInit(): void {
    // param from routing: path: ':authNumber'
    this.sub.add(
      this.route.paramMap.subscribe(pm => {
        this.authNumber = pm.get('authNumber') || '0';

        // Header always shows auth number immediately
        this.header.authNumber = this.authNumber;

        // treat 0 as "new"
        this.isNewAuth = (this.authNumber === '0' || this.authNumber.trim() === '');

        // reset per-auth; MD Review becomes visible either when user opts-in or when an existing MD Review is detected
        this.showMdReview = this.shouldShowMdReviewFromRoute();

        // base context every time
        this.ctx = {
          ...this.ctx,
          authNumber: this.authNumber,
          isNewAuth: this.isNewAuth,
          memberDetailsId: Number(sessionStorage.getItem('selectedMemberDetailsId') || 0) || null,
          userId: Number(sessionStorage.getItem('loggedInUserid') || 0),

          // reset detail/template when starting new auth
          ...(this.isNewAuth
            ? {
              authDetailId: null,
              authTemplateId: null,
              authClassId: null,
              authTypeId: null,
              memberEnrollmentId: null
            }
            : {})
        };

        this.buildSteps();
        this.ensureDefaultChild();
        this.syncActiveStepFromRoute();

        // Header always shows authNumber immediately
        this.header.authNumber = this.authNumber;

        // ✅ For EDIT: fetch the missing context from API by authNumber
        if (!this.isNewAuth && this.authNumber && this.authNumber !== '0') {
          this.resolveContextFromAuthNumber(this.authNumber);
        }

        // push into current step after route param resolves
        queueMicrotask(() => this.pushContextIntoCurrentStep());
      })
    );

    // on every child navigation, push context into the newly activated component
    // ✅ Fetch auth class lookup once at shell init (auth type lookup is loaded per auth class)
    this.loadAuthClassLookup();
    // ✅ Fetch requestpriority + authstatus from datasource lookups (same pattern as CaseWizardShell)
    this.loadHeaderLookups();

    this.sub.add(
      this.router.events
        .pipe(filter(e => e instanceof NavigationEnd))
        .subscribe(() => {
          this.enableMdReviewStepIfNeeded(this.shouldShowMdReviewFromRoute());
          this.syncActiveStepFromRoute();
          queueMicrotask(() => this.pushContextIntoCurrentStep());
        })
    );

    // Listen for save notifications from any step (Decision/Activity/Notes/etc.)
    this.sub.add(
      this.toastSvc.toast$.subscribe((m: WizardToastMessage) => {
        this.showToast(m);
      })
    );
  }

  //ngAfterViewInit(): void {
  //  // When routed step activates, push context and also try to hydrate header from that step
  //  if ((this.outlet as any)?.activateEvents) {
  //    this.sub.add(
  //      (this.outlet as any).activateEvents.subscribe((cmp: any) => {
  //        this.refreshHeaderFromStep(cmp);
  //      })
  //    );
  //  }
  //}

  ngAfterViewInit(): void {
    // Track the currently-active routed step so shell-level guards (unsaved changes) can query it.
    const outletAny: any = this.outlet as any;

    if (outletAny?.activateEvents) {
      this.sub.add(
        outletAny.activateEvents.subscribe((cmp: any) => {
          // RouterOutlet emits the *instance*; some Angular versions also keep a ComponentRef internally.
          this.setCurrentStepRef(cmp);

          // Hydrate header + ensure the step gets the latest context
          this.refreshHeaderFromStep(cmp);
          queueMicrotask(() => this.pushContextIntoCurrentStep());
        })
      );
    }

    if (outletAny?.deactivateEvents) {
      this.sub.add(
        outletAny.deactivateEvents.subscribe(() => {
          this.currentStepRef = undefined;
          this.activeChildInst = null;
        })
      );
    }
  }


  private setCurrentStepRef(activatedInstance: any): void {
    const outletAny: any = this.outlet as any;

    const refCandidate =
      outletAny?._activated ??          // common internal name
      outletAny?.activatedRef ??        // just in case of custom outlet wrappers
      outletAny?.activated ??           // may be ComponentRef<any> in some versions
      null;

    if (refCandidate && typeof refCandidate === 'object' && (refCandidate as any).instance) {
      this.currentStepRef = refCandidate as ComponentRef<any>;
      return;
    }

    if (activatedInstance) {
      // Fallback: wrap the instance to satisfy `.instance` usage.
      this.currentStepRef = ({ instance: activatedInstance } as unknown) as ComponentRef<any>;
      return;
    }

    this.currentStepRef = undefined;
  }


  public notifySaveSuccess(text: string): void {
    this.toastSvc.success(text);
  }

  public notifySaveError(text: string): void {
    this.toastSvc.error(text);
  }

  public notifySaveInfo(text: string): void {
    this.toastSvc.info(text);
  }

  // ---------------------------
  // Shell Save (saves active step)
  // ---------------------------
  public async saveCurrentStep(): Promise<void> {
    // ── View-Only guard: block saves when authorization is Closed ──
    if (this.isAuthClosed) {
      this.notifySaveInfo('This authorization is in Closed status and cannot be edited. Reopen to make changes.');
      return;
    }

    const inst: any =
      (this.outlet as any)?.activatedComponent ??
      (this.outlet as any)?.component ??
      null;

    if (!inst) return;

    // Try common save method names across steps
    const saveFn =
      (typeof inst.save === 'function' && inst.save.bind(inst)) ||
      (typeof inst.saveCurrentTab === 'function' && inst.saveCurrentTab.bind(inst)) ||
      (typeof inst.onSave === 'function' && inst.onSave.bind(inst)) ||
      null;

    if (!saveFn) {
      this.notifySaveInfo('Nothing to save for this step.');
      return;
    }

    const stepLabel = this.steps.find(s => s.id === this.activeStepId)?.label || 'Step';

    try {
      this.shellSaving = true;

      const res = saveFn();
      // supports Observable, Promise, or sync
      if (res?.subscribe) {
        await new Promise<void>((resolve, reject) => {
          const sub = res.subscribe({
            next: () => { /* no-op */ },
            error: (e: any) => { sub?.unsubscribe(); reject(e); },
            complete: () => { sub?.unsubscribe(); resolve(); }
          });
        });
      } else if (res?.then) {
        await res;
      }

      // Only show success toast if save actually completed (no throw)
      this.notifySaveSuccess(`${stepLabel} saved successfully.`);

      // Clear the reopen override — after save the DB status is now whatever the user set
      this._reopenOverrideActive = false;

      // Refresh header after save (if the step has fresh pendingAuth)
      this.refreshHeaderFromStep(inst);
    } catch (e: any) {
      // If it's a validation error thrown by the step, the step already
      // displayed its own messages — don't show a generic "Save failed."
      if (e?.validation) {
        // Validation was handled by the child component (toast + scroll)
        // Do nothing here — no duplicate toast needed.
      } else {
        console.error('AuthWizardShell: save failed', e);
        this.notifySaveError('Save failed.');
      }
    } finally {
      this.shellSaving = false;
    }
  }

  // ---------------------------
  // Header hydration
  // ---------------------------
  /**
   * Public hook for child steps (e.g., Auth Details after first CREATE)
   * to force the shell header to re-hydrate from the currently active step.
   */
  public refreshHeader(): void {
    const inst: any =
      (this.outlet as any)?.activatedComponent ??
      (this.outlet as any)?.component ??
      null;

    this.refreshHeaderFromStep(inst);
  }

  private refreshHeaderFromStep(inst: any): void {
    if (!inst) return;

    // Track active child for resolving dropdown labels dynamically
    this.activeChildInst = inst;

    this.header.authNumber = String(this.ctx?.authNumber ?? this.authNumber ?? this.header.authNumber ?? '');

    const p = inst?.pendingAuth ?? inst?.auth ?? inst?.authDetails ?? inst?.model ?? null;
    if (!p) return;

    // ── Parse jsonData to get dataObj (fields like requestPriority live inside jsonData, not on the row) ──
    const dataObj = this.safeParseJson(p?.jsonData ?? p?.dataJson) ?? {};

    // ── Created By: resolve userId → userName via userLookup, then fallback ──
    const createdByRaw = p?.createdBy ?? p?.createdby ?? '';
    const createdByName = p?.createdByName ?? p?.createdByUserName ?? p?.created_by_name ?? '';
    //this.header.createdBy = createdByName
    //  || this.resolveLabel(createdByRaw, this.userLookup)
    //  || sessionStorage.getItem('loggedInUsername')
    //  || '';
    // Cache raw createdBy id for re-resolution when userLookup loads later
    if (createdByRaw) (this as any)._cachedCreatedById = String(createdByRaw);

    const createdOn = p?.createdOn ?? p?.createdon ?? p?.createdDate ?? p?.created_date ?? null;
    const due = p?.authDueDate ?? p?.authduedate ?? dataObj?.authDueDate ?? dataObj?.authduedate ?? dataObj?.dueDate ?? p?.dueDate ?? null;

    if (createdOn != null) this.header.createdOn = this.formatDate(createdOn);
    if (due != null) {
      this.header.dueDate = this.formatDate(due);
      this.computeDaysLeft(due);
    }

    // Ensure auth type lookup is loaded for the current auth class
    const classId = Number(p?.authClassId ?? dataObj?.authClassId ?? 0);
    if (classId > 0 && this.lastAuthClassIdForTypeLookup !== classId) {
      this.loadAuthTypeLookup(classId);
    }

    // Pass row + parsed jsonData (not row + row) so fields in jsonData are resolved
    this.hydrateRichHeader(p, dataObj);
  }

  private refreshHeaderFromAuthRow(row: any, dataObj: any): void {
    // ── Created By: resolve userId → userName via userLookup, then fallback ──
    const createdByRaw = row?.createdBy ?? row?.createdby ?? dataObj?.createdBy ?? dataObj?.createdby ?? '';
    const createdByName = row?.createdByName ?? row?.createdByUserName ?? row?.created_by_name
      ?? dataObj?.createdByName ?? dataObj?.createdByUserName ?? '';
    //this.header.createdBy = createdByName
    //  //|| this.resolveLabel(createdByRaw, this.userLookup)
    //  //|| sessionStorage.getItem('loggedInUsername')
    //  || '';
    // Cache raw createdBy id for re-resolution when userLookup loads later
    if (createdByRaw) (this as any)._cachedCreatedById = String(createdByRaw);

    const createdOn = row?.createdOn ?? row?.createdon ?? dataObj?.createdOn ?? dataObj?.createdon ?? null;
    const due = row?.authDueDate ?? row?.authduedate ?? dataObj?.authDueDate ?? dataObj?.authduedate ?? dataObj?.dueDate ?? null;

    if (createdOn != null) this.header.createdOn = this.formatDate(createdOn);
    if (due != null) {
      this.header.dueDate = this.formatDate(due);
      this.computeDaysLeft(due);
    }

    // Ensure auth type lookup is loaded for the current auth class
    const classId = Number(row?.authClassId ?? dataObj?.authClassId ?? 0);
    if (classId > 0 && this.lastAuthClassIdForTypeLookup !== classId) {
      this.loadAuthTypeLookup(classId);
    }

    this.hydrateRichHeader(row, dataObj);
  }

  /**
   * Populates the rich header fields (authType, priority, status, decisionSummary)
   * from either a row-level object or parsed dataJson.
   * Uses dynamically-fetched lookups and child step resolved labels — no hardcoded maps.
   */
  private hydrateRichHeader(row: any, dataObj: any): void {
    const authClassId = String(row?.authClassId ?? dataObj?.authClassId ?? '');
    const authTypeId = String(row?.authTypeId ?? dataObj?.authTypeId ?? '');

    // ── Auth Class: try child step options first, then API cache ──
    const childClassLabel = this.resolveFromChildOptions('authClassOptions', authClassId);
    this.header.authClassName = childClassLabel
      || this.authClassMap.get(authClassId)
      || '';

    // ── Auth Type: try child step options first, then API cache ──
    const childTypeLabel = this.resolveFromChildOptions('authTypeOptions', authTypeId);
    this.header.authTypeName = childTypeLabel
      || this.authTypeMap.get(authTypeId)
      || '';

    // If auth type cache is empty or stale for this class, trigger a load
    const numericClassId = Number(authClassId);
    if (numericClassId > 0 && !this.header.authTypeName && this.lastAuthClassIdForTypeLookup !== numericClassId) {
      this.loadAuthTypeLookup(numericClassId);
    }

    // ── Priority: resolve from dsLookup map → child options → raw value ──
    const priorityRaw = String(dataObj?.requestPriority ?? row?.requestPriority ?? '');
    const priorityFromLookup = this.resolveLabel(priorityRaw, this.priorityLookup);
    const childPriorityLabel = this.resolveFromChildOptionsMap('requestPriority', priorityRaw);
    this.header.priorityLabel = priorityFromLookup || childPriorityLabel || '';
    this.header.priorityCode = (priorityFromLookup || priorityRaw).toLowerCase().replace(/\s+/g, '');

    // ── Auth Status: resolve from dsLookup map → child options → raw value ──
    const statusRaw = String(dataObj?.authStatus ?? row?.authStatus ?? '');
    const statusFromLookup = this.resolveLabel(statusRaw, this.statusLookup);
    const childStatusLabel = this.resolveFromChildOptionsMap('authStatus', statusRaw);
    this.header.authStatusLabel = statusFromLookup || childStatusLabel || '';
    this.header.authStatusCode = statusRaw;

    // ── Detect Closed status and put wizard into view-only mode ──
    this.detectClosedStatus(statusRaw, this.header.authStatusLabel);

    // Decision Summary — only recompute when decisionDetails is actually present in the data.
    // When called from refreshHeaderFromStep (pendingAuth row), decisionDetails won't exist
    // because decisions are stored separately. Preserve existing summary in that case.
    const decisions = dataObj?.decisionDetails ?? row?.decisionDetails;
    if (decisions !== undefined && decisions !== null) {
      this.computeDecisionSummary(decisions);
    }
  }

  /**
   * Try to resolve a label from the active child step's dropdown options array.
   * E.g., inst.authClassOptions or inst.authTypeOptions.
   */
  private resolveFromChildOptions(optionsKey: string, id: string): string {
    const inst = this.activeChildInst;
    if (!inst || !id) return '';
    const options: any[] = inst?.[optionsKey];
    if (!Array.isArray(options)) return '';
    const match = options.find((o: any) => String(o.value) === id);
    return match?.label ?? '';
  }

  /**
   * Try to resolve a label from child step's optionsByControlName map.
   * Auth Details stores datasource-resolved dropdown options keyed by control name.
   */
  private resolveFromChildOptionsMap(controlName: string, value: string): string {
    const inst = this.activeChildInst;
    if (!inst || !value) return '';
    const optMap: Record<string, any[]> = inst?.optionsByControlName;
    if (!optMap || typeof optMap !== 'object') return '';
    const options = optMap[controlName];
    if (!Array.isArray(options)) return '';
    const match = options.find((o: any) => String(o.value) === value);
    return match?.label ?? '';
  }

  /** Compute daysLeft and status colour from a due date value. */
  private computeDaysLeft(dueRaw: any): void {
    if (!dueRaw) { this.header.daysLeft = null; return; }
    const due = dueRaw instanceof Date ? dueRaw : new Date(dueRaw);
    if (isNaN(due.getTime())) { this.header.daysLeft = null; return; }

    const now = new Date();
    const diffMs = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    this.header.daysLeft = diffDays;
    this.header.daysLeftStatus = diffDays <= 0 ? 'danger' : diffDays <= 3 ? 'warning' : 'ok';
  }

  /** Tally active decisionDetails by decisionStatus into the summary buckets. */
  private computeDecisionSummary(decisions: any[]): void {
    const summary = { total: 0, approved: 0, partial: 0, denied: 0, pending: 0 };

    if (Array.isArray(decisions)) {
      const active = decisions.filter(d => !d?.deletedOn && !d?.deletedBy);
      summary.total = active.length;

      for (const d of active) {
        const statusRaw = String(d?.data?.decisionStatus ?? d?.decisionStatus ?? '').toLowerCase();
        const bucket = this.resolveDecisionBucket(statusRaw);
        summary[bucket]++;
      }
    }

    this.header.decisionSummary = summary;

    // Derive overallDecision from buckets
    if (summary.total === 0) {
      this.header.overallDecision     = 'Pending';
      this.header.overallDecisionCode = 'pending';
    } else if (summary.denied === summary.total) {
      this.header.overallDecision     = 'Denied';
      this.header.overallDecisionCode = 'denied';
    } else if (summary.approved === summary.total) {
      this.header.overallDecision     = 'Approved';
      this.header.overallDecisionCode = 'approved';
    } else if (summary.denied > 0 || summary.partial > 0) {
      this.header.overallDecision     = 'Partial';
      this.header.overallDecisionCode = 'partial';
    } else {
      this.header.overallDecision     = 'Pending';
      this.header.overallDecisionCode = 'pending';
    }
  }

  /** Map raw decision status string → summary bucket key */
  private resolveDecisionBucket(statusRaw: string): 'approved' | 'partial' | 'denied' | 'pending' {
    const s = statusRaw.toLowerCase().trim();
    if (s === '1' || s === 'approved') return 'approved';
    if (s === '2' || s === 'partial') return 'partial';
    if (s === '3' || s === 'denied') return 'denied';
    return 'pending';
  }

  // ═══════════════════════════════════
  //  DYNAMIC LOOKUP LOADING (from API)
  // ═══════════════════════════════════

  /**
   * Fetch auth class options from the same CRUD endpoint used by Auth Details step.
   * Caches results in authClassMap so header can resolve authClassId → label.
   */
  private loadAuthClassLookup(): void {
    this.crudService.getData('um', 'authclass')
      .pipe(take(1))
      .subscribe({
        next: (rows: any[]) => {
          this.authClassMap.clear();
          (rows || []).forEach(r => {
            const id = String(r?.id ?? r?.Id ?? '');
            const label = r?.authClass ?? r?.AuthClass ?? r?.name ?? '';
            if (id && label) this.authClassMap.set(id, label);
          });

          // Re-hydrate header if we already have data
          if (this.header.authStatusCode || this.header.authTypeName === '') {
            this.rehydrateHeaderFromCache();
          }
        },
        error: (e) => console.error('Shell: authclass lookup failed', e)
      });
  }

  /**
   * Fetch auth type (template) options for a given authClassId.
   * Uses the same AuthService.getTemplates() endpoint as Auth Details step.
   */
  private loadAuthTypeLookup(authClassId: number): void {
    if (!authClassId || authClassId <= 0) return;
    this.lastAuthClassIdForTypeLookup = authClassId;

    this.activityService.getTemplates('UM', authClassId)
      .pipe(take(1))
      .subscribe({
        next: (data: any[]) => {
          this.authTypeMap.clear();
          (data || []).forEach(t => {
            const id = String(t?.Id ?? t?.id ?? '');
            const label = t?.TemplateName ?? t?.templateName ?? '';
            if (id && label) this.authTypeMap.set(id, label);
          });

          // Re-hydrate header with the newly loaded type labels
          this.rehydrateHeaderFromCache();
        },
        error: (e) => console.error('Shell: auth type lookup failed for classId=' + authClassId, e)
      });
  }

  /**
   * Re-run header hydration using the cached auth data + freshly-loaded lookup maps.
   * Called after async lookup APIs return AND after child step saves.
   * Always re-resolves all fields (no guards) so real-time updates work.
   */
  private rehydrateHeaderFromCache(): void {
    if (!this.cachedDataObj) return;
    const dataObj = this.cachedDataObj;
    const authTypeId = String(dataObj?.authTypeId ?? '');
    const authClassId = String(dataObj?.authClassId ?? '');

    if (authClassId) {
      const resolved = this.authClassMap.get(authClassId) || '';
      if (resolved) this.header.authClassName = resolved;
    }
    if (authTypeId) {
      const resolved = this.authTypeMap.get(authTypeId) || '';
      if (resolved) this.header.authTypeName = resolved;
    }

    // Always re-resolve priority/status labels (values may have changed after save)
    const priorityRaw = String(dataObj?.requestPriority ?? '');
    if (priorityRaw) {
      const label = this.resolveLabel(priorityRaw, this.priorityLookup);
      if (label) {
        this.header.priorityLabel = label;
        this.header.priorityCode = label.toLowerCase().replace(/\s+/g, '');
      }
    }
    const statusRaw = String(dataObj?.authStatus ?? '');
    if (statusRaw) {
      const label = this.resolveLabel(statusRaw, this.statusLookup);
      if (label) {
        this.header.authStatusLabel = label;
        this.header.authStatusCode = statusRaw;
      }
    }

    // Re-resolve Created By if we have a cached userId
    const cachedCreatedById = (this as any)._cachedCreatedById;
    if (cachedCreatedById && this.userLookup.size > 0) {
      const userName = this.userLookup.get(cachedCreatedById);
      if (userName) this.header.createdBy = userName;
    }
  }

  /**
   * Fetch requestpriority + authstatus from DatasourceLookupService.
   * Same pattern as CaseWizardShell.loadHeaderLookups(), but with UM datasources.
   */
  private loadHeaderLookups(): void {
    // Auth Status lookup (datasource: 'authstatus')
    this.dsLookup
      .getOptionsWithFallback(
        'authstatus',
        (r: any) => ({
          value: r?.value ?? r?.id ?? r?.code,
          label: r?.label ?? r?.authStatus ?? r?.name ?? r?.description ?? String(r?.value ?? '')
        }),
        ['UM']
      )
      .pipe(take(1))
      .subscribe({
        next: (opts: any) => {
          this.statusLookup.clear();
          for (const o of (opts ?? [])) {
            this.statusLookup.set(String(o.value), o.label ?? o.text ?? String(o.value));
          }
          // Re-hydrate header now that status labels are available
          this.rehydrateHeaderFromCache();
        },
        error: (err) => console.error('Shell: authstatus lookup failed', err)
      });

    // Request Priority lookup (datasource: 'requestpriority')
    this.dsLookup
      .getOptionsWithFallback(
        'requestpriority',
        (r: any) => ({
          value: r?.value ?? r?.id ?? r?.code,
          label: r?.label ?? r?.requestPriority ?? r?.name ?? r?.description ?? String(r?.value ?? '')
        }),
        ['UM']
      )
      .pipe(take(1))
      .subscribe({
        next: (opts: any) => {
          this.priorityLookup.clear();
          for (const o of (opts ?? [])) {
            this.priorityLookup.set(String(o.value), o.label ?? o.text ?? String(o.value));
          }
          // Re-hydrate header now that priority labels are available
          this.rehydrateHeaderFromCache();
        },
        error: (err) => console.error('Shell: requestpriority lookup failed', err)
      });

    // User lookup for Created By (userId → userName)
    this.authenticateService.getAllUsers().subscribe({
      next: (users: any[]) => {
        this.userLookup.clear();
        for (const u of (users ?? [])) {
          this.userLookup.set(String(u.userId), u.userName ?? u.name ?? String(u.userId));
        }
        // Re-hydrate header now that user names are available
        this.rehydrateHeaderFromCache();
      },
      error: (e) => console.warn('Shell: user lookup failed', e)
    });
  }

  /**
   * Resolve a raw value (often a numeric ID) to a display label via a lookup map.
   * If the map has no entry but the value is already a non-numeric string, returns it as-is.
   */
  private resolveLabel(rawValue: any, lookup: Map<string, string>): string {
    if (rawValue == null || rawValue === '') return '';
    const key = String(rawValue);

    // Check lookup map
    const label = lookup.get(key);
    if (label) return label;

    // If rawValue is already a string label (not a numeric ID), return as-is
    if (isNaN(Number(key))) return key;

    // Numeric ID but no lookup match yet (options may still be loading) — return empty
    return '';
  }

  private checkMdReviewActivitiesAndEnableStep(authDetailId: number | null): void {
    if (!authDetailId) return;

    const getFn = (this.activityService as any)?.getMdReviewActivities;
    if (typeof getFn !== 'function') return;

    const obs = getFn.call(this.activityService, null, authDetailId);
    if (!obs?.pipe) return;

    obs.pipe(take(1)).subscribe({
      next: (rows: any[]) => {
        if ((rows?.length ?? 0) > 0) {
          this.enableMdReviewStepIfNeeded(true);
        }
      },
      error: () => {
        // non-blocking: if this fails we just fall back to existing behavior
      }
    });
  }

  private formatDate(v: any): string {
    if (v == null || v === '') return '';
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  private showToast(m: WizardToastMessage): void {
    // reset timer
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }

    this.toast = {
      visible: true,
      type: m.type,
      text: m.text
    } as any;

    // Error messages with field names need more reading time
    const duration = m.type === 'error' ? 6000 : 3500;

    this.toastTimer = setTimeout(() => {
      this.toast.visible = false;
    }, duration);
  }

  private dismissToast(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    this.toast.visible = false;
  }

  // ═══════════════════════════════════
  //  RIGHT PANEL (unified: AI / Provider)
  // ═══════════════════════════════════

  openRightPanel(mode: 'ai' | 'provider', identifier?: string, data?: any): void {
    if (this.rightPanelOpen && this.rightPanelMode === mode) {
      this.closeRightPanel();
      return;
    }

    this.rightPanelMode = mode;
    this.rightPanelOpen = true;
    this.rightPanelExpanded = false;

    if (mode === 'provider') {
      this.selectedProviderId = identifier || '';
      this.selectedProviderName = data?.fullName || data?.name || identifier || '';
      this.selectedProviderData = data || null;
    }

    // Load AI data when opening AI panel
    if (mode === 'ai' && !this.slaItems.length) {
      this.loadAiPanelData();
    }
  }

  openProviderPanel(providerId: string, providerData?: any): void {
    this.openRightPanel('provider', providerId, providerData);
  }

  closeRightPanel(): void {
    this.rightPanelOpen = false;
    this.rightPanelExpanded = false;
    setTimeout(() => {
      if (!this.rightPanelOpen) this.rightPanelMode = null;
    }, 350);
  }

  togglePanelExpand(): void {
    this.rightPanelExpanded = !this.rightPanelExpanded;
  }

  // ═══════════════════════════════════
  //  AI PANEL DATA — Auth-specific
  // ═══════════════════════════════════

  private loadAiPanelData(): void {
    // TODO: Replace with actual API calls

    this.slaItems = [
      { label: 'Clinical Review', deadline: '02/23/2026 EOD', remaining: '2d 4h', status: 'warning' },
      { label: 'Decision Due', deadline: '02/28/2026 EOD', remaining: '7d 0h', status: 'ok' },
      { label: 'Member Notification', deadline: '03/02/2026 EOD', remaining: '9d 0h', status: 'ok' }
    ];
    this.slaAtRiskCount = this.slaItems.filter(s => s.status !== 'ok').length;

    this.quickActions = [
      { icon: '📋', label: 'Request Records', description: 'Request medical records from provider', actionId: 'requestRecords' },
      { icon: '👨‍⚕️', label: 'Assign Reviewer', description: 'Route to MD reviewer', actionId: 'assignMd' },
      { icon: '📄', label: 'Generate Letter', description: 'Create determination letter', actionId: 'generateLetter' },
      { icon: '🔄', label: 'Check Eligibility', description: 'Verify member coverage', actionId: 'checkEligibility' }
    ];

    this.aiSuggestions = [
      {
        icon: '🔍', title: 'Similar Auth Detected', body: 'A prior auth for the same procedure was denied 3 months ago. Review denial reason before proceeding.',
        confidence: 89, type: 'warning', actionLabel: 'View Prior Auth', actionId: 'viewPriorAuth'
      },
      {
        icon: '📊', title: 'Clinical Criteria Match', body: 'Submitted documentation meets InterQual criteria for requested service based on diagnosis codes.',
        confidence: 94, type: 'success', actionLabel: 'View Criteria', actionId: 'viewCriteria'
      },
      {
        icon: '⚠️', title: 'Missing Documentation', body: 'Operative report and recent imaging results not found in submitted documents.',
        confidence: 76, type: 'danger', actionLabel: 'Request Docs', actionId: 'requestDocs'
      }
    ];
  }

  onQuickAction(action: any): void {
    // TODO: implement quick action handlers
    console.log('Quick action:', action.actionId);
  }

  onAiAction(suggestion: any): void {
    // TODO: implement AI suggestion action handlers
    console.log('AI action:', suggestion.actionId);
  }

  askAi(): void {
    if (!this.aiQuery?.trim()) return;
    // TODO: implement AI query
    console.log('AI query:', this.aiQuery);
    this.aiQuery = '';
  }

  // ═══════════════════════════════════
  //  CLOSED STATUS — View-Only Mode
  // ═══════════════════════════════════

  /**
   * Detects if the auth status is "Closed" (by code or label) and flips the
   * isAuthClosed flag, which puts the entire wizard into view-only mode.
   */
  private detectClosedStatus(statusCode: string, statusLabel: string): void {
    // If a manual reopen is active, skip re-detecting Closed from the DB
    // (the DB still says "Closed" until the next save persists the new status)
    if (this._reopenOverrideActive) return;

    const code = (statusCode ?? '').toLowerCase().trim();
    const label = (statusLabel ?? '').toLowerCase().trim();

    const wasClosed = this.isAuthClosed;

    this.isAuthClosed =
      code === 'closed' || code === 'close' ||
      label === 'closed' || label === 'close' ||
      label.startsWith('close');

    // If state changed, re-push context into the current step so it picks up the new viewOnly flag
    if (this.isAuthClosed !== wasClosed) {
      queueMicrotask(() => this.pushContextIntoCurrentStep());
    }
  }

  /**
   * Reopens a closed authorization by changing its status back to a reviewable state.
   * Steps call this via the "Reopen Authorization" button in the closed banner.
   */
  public reopenAuth(): void {
    if (!this.ctx.authDetailId) {
      this.notifySaveError('Cannot reopen: authorization has not been saved yet.');
      return;
    }

    // Activate the override so detectClosedStatus() won't re-close
    // when the header refreshes (DB still says "Closed" until saved)
    this._reopenOverrideActive = true;

    // Remove the closed banner and enable editing
    this.isAuthClosed = false;
    queueMicrotask(() => this.pushContextIntoCurrentStep());

    // Update the header status locally so the UI reflects "Open" immediately
    this.header.authStatusLabel = 'Open';
    this.header.authStatusCode = 'open';

    this.notifySaveInfo('Authorization reopened — you may now edit all fields. Please save to persist the change.');
  }

  ngOnDestroy(): void {
    this.dismissToast();
    this.sub.unsubscribe();
  }

  onStepSelected(step: AuthWizardStep): void {
    if (step.disabled) return;
    this.router.navigate([step.route], { relativeTo: this.route });
  }

  /**
   * Steps can call this to update context after they load/create auth.
   * Example in details step after GET/CREATE:
   *   this.shell.setContext({ authDetailId, authTemplateId, authClassId, authTypeId, memberEnrollmentId });
   */
  public setContext(patch: Partial<AuthWizardContext>): void {
    const prevAuthNumber = this.ctx.authNumber;
    const prevIsNewAuth = this.ctx.isNewAuth;

    this.ctx = { ...this.ctx, ...patch };

    // Keep shell-level fields in sync (these drive step list + header)
    if (patch.authNumber != null) {
      this.authNumber = String(this.ctx.authNumber ?? this.authNumber);
      this.header.authNumber = this.authNumber;
    }

    if (patch.isNewAuth != null) {
      this.isNewAuth = !!this.ctx.isNewAuth;
    } else if (patch.authNumber != null) {
      // Derive isNewAuth when authNumber changes but isNewAuth wasn't passed
      const an = String(this.ctx.authNumber ?? '0');
      this.isNewAuth = (an === '0' || an.trim() === '');
      this.ctx = { ...this.ctx, isNewAuth: this.isNewAuth };
    }

    // If we just flipped from NEW -> EDIT, remove Smart Check and ensure the route isn't stuck there.
    const authNumberChanged = prevAuthNumber !== this.ctx.authNumber;
    const isNewChanged = prevIsNewAuth !== this.ctx.isNewAuth;
    if (authNumberChanged || isNewChanged) {
      this.buildSteps();
      this.syncActiveStepFromRoute();

      const childPath = this.route.firstChild?.snapshot?.url?.[0]?.path;
      if (!this.isNewAuth && childPath === 'smartcheck') {
        this.router.navigate(['details'], { relativeTo: this.route, replaceUrl: true });
      }
    }

    this.pushContextIntoCurrentStep();
  }

  public getContext(): AuthWizardContext {
    return this.ctx;
  }

  // ---------------------------
  // ✅ Fetch required values for EDIT flow
  // ---------------------------
  private resolveContextFromAuthNumber(authNumber: string): void {
    const includeDeleted = false;

    const s = this.authApi.getByNumber(authNumber, includeDeleted).subscribe({
      next: (row: AuthDetailRow | any) => {
        const dataObj = this.safeParseJson(row?.dataJson) ?? {};

        // Populate header by default when opening an existing auth
        this.refreshHeaderFromAuthRow(row, dataObj);

        // ✅ Compute dynamic badge counts from the auth data
        this.cachedDataObj = dataObj;
        this.computeBadgeCounts(row, dataObj);

        // If this auth already has an MD Review, make the MD Review step visible.
        this.enableMdReviewStepIfNeeded(this.detectExistingMdReview(row, dataObj));

        // Also: if MD Review activities already exist, show the stepper by default.
        const authDetailId = this.toNum(row?.authDetailId);
        this.checkMdReviewActivitiesAndEnableStep(authDetailId);

        // ✅ Fetch activity + document counts from their respective APIs
        this.fetchActivityCount(authDetailId);
        this.fetchDocumentCount(authDetailId);

        // authTemplateId is not in AuthDetailRow interface today.
        // Try server-provided authTemplateId first; otherwise derive from authClassId (common mapping).
        const authClassId = this.toNum(row?.authClassId ?? dataObj?.authClassId);
        const authTypeId = this.toNum(row?.authTypeId ?? dataObj?.authTypeId);
        const authTemplateId =
          this.toNum((row as any)?.authTypeId ?? dataObj?.authTypeId ?? authClassId);

        const memberEnrollmentId =
          this.toNum((row as any)?.memberEnrollmentId ?? dataObj?.memberEnrollmentId);

        this.setContext({
          authDetailId: this.toNum(row?.authDetailId),
          authTemplateId,
          authClassId,
          authTypeId,
          memberDetailsId: this.toNum(row?.memberDetailsId) ?? this.ctx.memberDetailsId,
          memberEnrollmentId
        });
      },
      error: (e) => {
        console.error('AuthWizardShell: failed to resolve context by authNumber', authNumber, e);
      }
    });

    this.sub.add(s);
  }

  private safeParseJson(raw: any): any | null {
    if (raw == null || raw === '') return null;
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  }

  private toNum(v: any): number | null {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }


  // ---------------------------
  // ✅ Dynamic badge count computation
  // ---------------------------

  /**
   * Computes badge counts from the auth detail row and parsed dataJson.
   * Counts non-deleted items in each repeating array.
   * Called after initial load and can be re-triggered by child steps via refreshBadgeCounts().
   */
  private computeBadgeCounts(row?: any, dataObj?: any): void {
    const data = dataObj ?? this.cachedDataObj ?? {};

    // Decisions: count non-deleted entries in decisionDetails
    this.badgeCounts.decision = this.countActiveItems(data.decisionDetails);

    // Notes: count non-deleted entries in decisionNotes
    this.badgeCounts.notes = this.countActiveItems(data.decisionNotes);

    // MD Review: count from mdReviewDetails or similar array if present
    this.badgeCounts.mdReview = this.countActiveItems(
      data.mdReviewDetails ?? data.md_review_details ?? data.mdReviewActivities
    );

    // Member/Provider Decision Info (used as a fallback reference)
    // Activities & Documents: these typically come from separate API endpoints.
    // We attempt to read from the row-level counts if the API provides them,
    // otherwise we leave them at 0 until the child step reports its count.
    this.badgeCounts.activities = this.toNum(row?.activityCount) ?? this.countActiveItems(data.activities) ?? 0;
    this.badgeCounts.documents  = this.toNum(row?.documentCount) ?? this.countActiveItems(data.documents) ?? 0;

    // Rebuild steps so the stepper picks up the new badge values
    this.buildSteps();
  }

  /**
   * Counts non-deleted items in an array (items without a deletedOn timestamp).
   */
  private countActiveItems(arr: any): number {
    if (!Array.isArray(arr)) return 0;
    return arr.filter((item: any) => !item?.deletedOn && !item?.deletedBy).length;
  }

  /**
   * Public method for child steps to call after they add/remove items.
   * Accepts an optional partial map of step id → count.
   *
   * Usage from a child step (e.g., Decision):
   *   this.shell.refreshBadgeCounts({ decision: this.decisionRows.length });
   *
   * Or without args to re-derive from the cached dataJson:
   *   this.shell.refreshBadgeCounts();
   */
  public refreshBadgeCounts(patch?: Partial<Record<string, number>>): void {
    if (patch) {
      Object.entries(patch).forEach(([key, val]) => {
        if (key in this.badgeCounts && typeof val === 'number') {
          this.badgeCounts[key] = val;
        }
      });
      this.buildSteps();
    } else {
      // Re-derive from cached auth data
      this.computeBadgeCounts(null, this.cachedDataObj);
    }
  }

  /**
   * Public method for child steps to update a single step's badge count.
   * Usage: this.shell.updateBadgeCount('notes', 5);
   */
  public updateBadgeCount(stepId: string, count: number): void {
    if (stepId in this.badgeCounts) {
      this.badgeCounts[stepId] = count;
      this.buildSteps();
    }
  }

  /**
   * Fetch activity count from the activity service API.
   * Falls back gracefully if the API method isn't available.
   */
  private fetchActivityCount(authDetailId: number | null): void {
    if (!authDetailId) return;

    const getActivitiesFn = (this.activityService as any)?.getActivitiesByAuthDetailId
      ?? (this.activityService as any)?.getActivities;

    if (typeof getActivitiesFn !== 'function') return;

    const obs = getActivitiesFn.call(this.activityService, authDetailId);
    if (!obs?.pipe) return;

    obs.pipe(take(1)).subscribe({
      next: (rows: any[]) => {
        this.badgeCounts.activities = Array.isArray(rows) ? rows.filter((r: any) => !r?.deletedOn).length : 0;
        this.buildSteps();
      },
      error: () => { /* non-blocking */ }
    });
  }

  /**
   * Fetch document count from the document/attachment service API.
   * Falls back gracefully if the API method isn't available.
   */
  private fetchDocumentCount(authDetailId: number | null): void {
    if (!authDetailId) return;

    const getDocsFn = (this.activityService as any)?.getDocumentsByAuthDetailId
      ?? (this.activityService as any)?.getDocuments
      ?? (this.activityService as any)?.getAttachmentsByAuthDetailId;

    if (typeof getDocsFn !== 'function') return;

    const obs = getDocsFn.call(this.activityService, authDetailId);
    if (!obs?.pipe) return;

    obs.pipe(take(1)).subscribe({
      next: (rows: any[]) => {
        this.badgeCounts.documents = Array.isArray(rows) ? rows.filter((r: any) => !r?.deletedOn).length : 0;
        this.buildSteps();
      },
      error: () => { /* non-blocking */ }
    });
  }

  private shouldShowMdReviewFromRoute(): boolean {
    const childPath = this.route.firstChild?.snapshot?.url?.[0]?.path;
    if (childPath === 'mdReview') return true;

    const qp = this.route.snapshot.queryParamMap.get('showMdReview');
    return qp === '1' || qp === 'true';
  }

  /** Best-effort detection (based on server dataJson / row shape) that an MD Review already exists for this auth. */
  private detectExistingMdReview(row: any, dataObj: any): boolean {
    // If the API ever exposes a dedicated id/flag on the row, honor it.
    if (row && (row.mdReviewId || row.mdReviewDetailId || row.medicalDirectorReviewId || row.hasMdReview)) return true;

    if (!dataObj || typeof dataObj !== 'object') return false;

    // Look for a likely MD Review payload in dataJson (case-insensitive).
    const keys = Object.keys(dataObj);
    const hitKey = keys.find(k => {
      const lk = k.toLowerCase();
      return lk.includes('mdreview') || lk.includes('md_review') || lk.includes('medicaldirectorreview') || lk.includes('medical_director_review');
    });

    if (!hitKey) return false;

    const val = (dataObj as any)[hitKey];
    if (val == null) return false;
    if (typeof val === 'object') return Object.keys(val).length > 0;
    return true;
  }

  private enableMdReviewStepIfNeeded(enable: boolean): void {
    if (!enable) return;
    if (this.showMdReview) return;

    this.showMdReview = true;
    this.buildSteps();
  }

  // ---------------------------
  // Steps list / routing helpers
  // ---------------------------
  private buildSteps(): void {
    const bc = this.badgeCounts;

    const base: AuthWizardStep[] = [
      { id: 'details', label: 'Auth Details', route: 'details' },
      { id: 'decision', label: 'Decisions', route: 'decision', badge: bc.decision || undefined },
      ...(this.showMdReview ? [{ id: 'mdReview', label: 'MD Review', route: 'mdReview', badge: bc.mdReview || undefined } as AuthWizardStep] : []),
      { id: 'activities', label: 'Activities', route: 'activities', badge: bc.activities || undefined },
      { id: 'notes', label: 'Notes', route: 'notes', badge: bc.notes || undefined },
      { id: 'documents', label: 'Documents', route: 'documents', badge: bc.documents || undefined }
    ];

    // show Smart Check only for NEW auth (authNumber = 0)
    this.steps = this.isNewAuth
      ? [{ id: 'smartcheck', label: 'Smart Check', route: 'smartcheck' }, ...base]
      : base;
  }

  private ensureDefaultChild(): void {
    const childPath = this.route.firstChild?.snapshot?.url?.[0]?.path;

    // if user hits /.../auth/:authNumber (no child), route to correct first step
    if (!childPath) {
      this.router.navigate([this.isNewAuth ? 'smartcheck' : 'details'], {
        relativeTo: this.route,
        replaceUrl: true
      });
      return;
    }

    // if existing auth and user somehow lands on smartcheck -> force details
    if (!this.isNewAuth && childPath === 'smartcheck') {
      this.router.navigate(['details'], { relativeTo: this.route, replaceUrl: true });
    }
  }

  private syncActiveStepFromRoute(): void {
    const childPath = this.route.firstChild?.snapshot?.url?.[0]?.path;
    const match = this.steps.find(s => s.route === childPath);
    this.activeStepId = match?.id ?? (this.isNewAuth ? 'smartcheck' : 'details');
  }

  private pushContextIntoCurrentStep(): void {
    const inst: any =
      (this.outlet as any)?.activatedComponent ??
      (this.outlet as any)?.component ??
      null;

    if (!inst) return;

    const ctx = this.ctx;

    // Set common fields only if the step declares them (safe)
    if ('authNumber' in inst) inst.authNumber = ctx.authNumber;
    if ('isNewAuth' in inst) inst.isNewAuth = ctx.isNewAuth;

    if ('authDetailId' in inst) inst.authDetailId = ctx.authDetailId;
    if ('authTemplateId' in inst) inst.authTemplateId = ctx.authTemplateId;

    if ('authClassId' in inst) inst.authClassId = ctx.authClassId;
    if ('authTypeId' in inst) inst.authTypeId = ctx.authTypeId;

    if ('memberDetailsId' in inst) inst.memberDetailsId = ctx.memberDetailsId;
    if ('memberEnrollmentId' in inst) inst.memberEnrollmentId = ctx.memberEnrollmentId;

    if ('userId' in inst) inst.userId = ctx.userId;

    // ── View-Only Mode (Closed Authorization) ──
    if ('isViewOnly' in inst) inst.isViewOnly = this.isAuthClosed;

    // Preferred hook
    if (typeof inst?.setContext === 'function') {
      inst.setContext(ctx);
    }

    // ✅ Inject provider panel opener so provider cards can open the right panel
    inst._shellOpenProviderPanel = (providerId: string, providerData?: any) => {
      this.openProviderPanel(providerId, providerData);
    };

    // ✅ Inject badge count updater so child steps can update their badge after add/remove
    inst._shellRefreshBadgeCounts = (patch?: Partial<Record<string, number>>) => {
      this.refreshBadgeCounts(patch);
    };
    inst._shellUpdateBadgeCount = (stepId: string, count: number) => {
      this.updateBadgeCount(stepId, count);
    };

    // ✅ Inject header refresh so child steps (e.g., Decision bulk save) can re-hydrate the shell header
    inst._shellRefreshHeader = () => {
      if (!this.isNewAuth && this.authNumber && this.authNumber !== '0') {
        this.resolveContextFromAuthNumber(this.authNumber);
      }
    };

    // Optional reload hook
    if (typeof inst?.reload === 'function' && inst.reload.length === 0) {
      inst.reload();
    }
  }
  authHasUnsavedChanges(): boolean {
    const inst: any = this.currentStepRef?.instance;

    // support both naming styles so all steps work
    return !!(
      inst?.authHasUnsavedChanges?.() ??
      inst?.hasUnsavedChanges?.() ??
      false
    );
  }
  // Alias for CanDeactivate guards that expect hasPendingChanges()
  hasPendingChanges(): boolean {
    return this.authHasUnsavedChanges();
  }
}
