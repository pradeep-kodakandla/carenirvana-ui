import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild, ComponentRef } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, Subscription, take } from 'rxjs';
import { WizardToastService, WizardToastMessage } from './wizard-toast.service';
import { AuthDetailApiService } from 'src/app/service/authdetailapi.service';
import { AuthDetailRow } from 'src/app/member/UM/services/authdetail';
import { AuthService } from 'src/app/service/auth.service';
import { AuthunsavedchangesawareService } from 'src/app/member/UM/services/authunsavedchangesaware.service';
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

  // ---------------------------
  // Header bar (above stepper)
  // ---------------------------
  shellSaving = false;

  header = {
    authNumber: '',
    createdBy: '',
    createdOn: '',
    dueDate: ''
  };

  // ---------------------------
  // Common toast beside stepper
  // ---------------------------
  toast = {
    visible: false,
    type: 'success' as 'success' | 'error' | 'info',
    text: ''
  };

  private toastTimer: any = null;


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
    private activityService: AuthService
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

      // If the step didn't emit toast itself, show a generic success toast
      this.notifySaveSuccess(`${stepLabel} saved successfully.`);

      // Refresh header after save (if the step has fresh pendingAuth)
      this.refreshHeaderFromStep(inst);
    } catch (e) {
      console.error('AuthWizardShell: save failed', e);
      this.notifySaveError('Save failed.');
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

    // Auth # always comes from route/context
    this.header.authNumber = String(this.ctx?.authNumber ?? this.authNumber ?? this.header.authNumber ?? '');

    // Try common places where steps keep the loaded auth
    const p = inst?.pendingAuth ?? inst?.auth ?? inst?.authDetails ?? inst?.model ?? null;
    if (!p) return;

    const createdBy = sessionStorage.getItem('loggedInUsername') || ''; //p?.createdBy ?? p?.createdby ?? p?.created_user ?? p?.createdUser ?? null;
    const createdOn = p?.createdOn ?? p?.createdon ?? p?.createdDate ?? p?.created_date ?? null;
    const due = p?.authDueDate ?? p?.authduedate ?? p?.dueDate ?? p?.duedate ?? null;

    if (createdBy != null) this.header.createdBy = String(createdBy);
    if (createdOn != null) this.header.createdOn = this.formatDate(createdOn);
    if (due != null) this.header.dueDate = this.formatDate(due);
  }

  private refreshHeaderFromAuthRow(row: any, dataObj: any): void {
    // Prefer explicit row fields; fallback to parsed json
    const createdBy = sessionStorage.getItem('loggedInUsername') || ''; //row?.createdBy ?? row?.createdby ?? dataObj?.createdBy ?? dataObj?.createdby ?? null;
    const createdOn = row?.createdOn ?? row?.createdon ?? dataObj?.createdOn ?? dataObj?.createdon ?? null;
    const due = row?.authDueDate ?? row?.authduedate ?? dataObj?.authDueDate ?? dataObj?.authduedate ?? dataObj?.dueDate ?? null;

    if (createdBy != null) this.header.createdBy = String(createdBy);
    if (createdOn != null) this.header.createdOn = this.formatDate(createdOn);
    if (due != null) this.header.dueDate = this.formatDate(due);
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

    this.toastTimer = setTimeout(() => {
      this.toast.visible = false;
    }, 3500);
  }

  private dismissToast(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    this.toast.visible = false;
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

        // If this auth already has an MD Review, make the MD Review step visible.
        this.enableMdReviewStepIfNeeded(this.detectExistingMdReview(row, dataObj));

        // Also: if MD Review activities already exist, show the stepper by default.
        const authDetailId = this.toNum(row?.authDetailId);
        this.checkMdReviewActivitiesAndEnableStep(authDetailId);

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
    const base: AuthWizardStep[] = [
      { id: 'details', label: 'Auth Details', route: 'details'},
      { id: 'decision', label: 'Decisions', route: 'decision', badge: 1 },
      ...(this.showMdReview ? [{ id: 'mdReview', label: 'MD Review', route: 'mdReview', badge: 2 } as AuthWizardStep] : []),
      { id: 'activities', label: 'Activities', route: 'activities', badge: 3 },
      { id: 'notes', label: 'Notes', route: 'notes', badge: 4 },
      { id: 'documents', label: 'Documents', route: 'documents', badge: 1 }
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


    // Preferred hook
    if (typeof inst?.setContext === 'function') {
      inst.setContext(ctx);
    }

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
