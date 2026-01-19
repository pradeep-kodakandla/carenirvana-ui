import { AfterViewInit, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { WizardToastService, WizardToastMessage } from './wizard-toast.service';

import { AuthDetailApiService } from 'src/app/service/authdetailapi.service';
import { AuthDetailRow } from 'src/app/member/UM/services/authdetail';

export interface AuthWizardStep {
  id: string;
  label: string;
  route: string;
  disabled?: boolean;
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
export class AuthwizardshellComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild(RouterOutlet) outlet?: RouterOutlet;

  steps: AuthWizardStep[] = [];
  activeStepId = '';

  authNumber: string = '0';
  isNewAuth = true;

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

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authApi: AuthDetailApiService,
    private toastSvc: WizardToastService
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

  ngAfterViewInit(): void {
    // When routed step activates, push context and also try to hydrate header from that step
    if ((this.outlet as any)?.activateEvents) {
      this.sub.add(
        (this.outlet as any).activateEvents.subscribe((cmp: any) => {
          this.refreshHeaderFromStep(cmp);
        })
      );
    }
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
  private refreshHeaderFromStep(inst: any): void {
    if (!inst) return;

    // Auth # always comes from route/context
    this.header.authNumber = String(this.ctx?.authNumber ?? this.authNumber ?? this.header.authNumber ?? '');

    // Try common places where steps keep the loaded auth
    const p = inst?.pendingAuth ?? inst?.auth ?? inst?.authDetails ?? inst?.model ?? null;
    if (!p) return;

    const createdBy = p?.createdBy ?? p?.createdby ?? p?.created_user ?? p?.createdUser ?? null;
    const createdOn = p?.createdOn ?? p?.createdon ?? p?.createdDate ?? p?.created_date ?? null;
    const due = p?.authDueDate ?? p?.authduedate ?? p?.dueDate ?? p?.duedate ?? null;

    if (createdBy != null) this.header.createdBy = String(createdBy);
    if (createdOn != null) this.header.createdOn = this.formatDate(createdOn);
    if (due != null) this.header.dueDate = this.formatDate(due);
  }

  private refreshHeaderFromAuthRow(row: any, dataObj: any): void {
    // Prefer explicit row fields; fallback to parsed json
    const createdBy = row?.createdBy ?? row?.createdby ?? dataObj?.createdBy ?? dataObj?.createdby ?? null;
    const createdOn = row?.createdOn ?? row?.createdon ?? dataObj?.createdOn ?? dataObj?.createdon ?? null;
    const due = row?.authDueDate ?? row?.authduedate ?? dataObj?.authDueDate ?? dataObj?.authduedate ?? dataObj?.dueDate ?? null;

    if (createdBy != null) this.header.createdBy = String(createdBy);
    if (createdOn != null) this.header.createdOn = this.formatDate(createdOn);
    if (due != null) this.header.dueDate = this.formatDate(due);
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
    this.ctx = { ...this.ctx, ...patch };
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
  // Steps list / routing helpers
  // ---------------------------
  private buildSteps(): void {
    const base: AuthWizardStep[] = [
      { id: 'details', label: 'Auth Details', route: 'details' },
      { id: 'decision', label: 'Decision', route: 'decision' },
      { id: 'mdReview', label: 'MD Review', route: 'mdReview' },
      { id: 'activities', label: 'Activities', route: 'activities' },
      { id: 'notes', label: 'Notes', route: 'notes' },
      { id: 'documents', label: 'Documents', route: 'documents' }
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

  // ---------------------------
  // ✅ CaseWizardShell-style push
  // ---------------------------
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
}
