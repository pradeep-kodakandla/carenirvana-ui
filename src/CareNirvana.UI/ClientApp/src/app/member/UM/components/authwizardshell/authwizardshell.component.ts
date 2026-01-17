import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, Subscription } from 'rxjs';

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
export class AuthwizardshellComponent implements OnInit, OnDestroy {
  @ViewChild(RouterOutlet) outlet?: RouterOutlet;

  steps: AuthWizardStep[] = [];
  activeStepId = '';

  authNumber: string = '0';
  isNewAuth = true;

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
    private authApi: AuthDetailApiService
  ) { }

  ngOnInit(): void {
    // param from routing: path: ':authNumber'
    this.sub.add(
      this.route.paramMap.subscribe(pm => {
        this.authNumber = pm.get('authNumber') || '0';

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
  }

  ngOnDestroy(): void {
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
      { id: 'details', label: 'Details', route: 'details' },
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
