import { Component, OnDestroy, OnInit, Optional } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { Observable, Subject, firstValueFrom, of } from 'rxjs';
import { distinctUntilChanged, filter, map, startWith, switchMap, takeUntil, tap, catchError } from 'rxjs/operators';
import { AuthNumberService } from 'src/app/service/auth-number-gen.service';
import { AuthService } from 'src/app/service/auth.service';
import { CrudService, DatasourceLookupService } from 'src/app/service/crud.service';
import { MemberenrollmentService } from 'src/app/service/memberenrollment.service';
import { AuthDetailApiService } from 'src/app/service/authdetailapi.service';
import { AuthDecisionSeedService } from 'src/app/member/UM/steps/authdecision/authdecisionseed.service';
import { AuthenticateService } from 'src/app/service/authentication.service';
import { WorkbasketService } from 'src/app/service/workbasket.service';
import { HeaderService } from 'src/app/service/header.service';
import { MatDialog } from '@angular/material/dialog';
import { RulesengineService, ExecuteTriggerResponse } from 'src/app/service/rulesengine.service';
import { ValidationErrorDialogComponent } from 'src/app/member/validation-error-dialog/validation-error-dialog.component';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';
import { AuthunsavedchangesawareService } from 'src/app/member/UM/services/authunsavedchangesaware.service';
import { AuthwizardshellComponent } from 'src/app/member/UM/components/authwizardshell/authwizardshell.component';

/** ---- Enrollment interfaces ---- */
interface LevelItem {
  levelcode: string;
  levelname: string;
  levelsequence: number;
  level_value_id: number;
  level_value_code: string;
  level_value_name: string;
}

interface MemberEnrollment {
  memberEnrollmentId?: number;
  memberDetailsId?: number;
  startDate?: string;
  endDate?: string;
  status?: boolean;

  levels?: string;   // JSON array
  levelMap?: string; // JSON object
  [k: string]: any;
}


/** ---- Smart Check prefill (from previous step) ---- */
interface SmartCheckPrefill {
  authClassId?: number;
  authTypeId?: number;
  enrollmentId?: number;
  icdCodes?: string[];
  serviceCodes?: string[];
  fromDateIso?: any;
  toDateIso?: any;
  procedureFromDateIso?: any;
  procedureToDateIso?: any;
}

/** ---- Template shapes ---- */
interface TplRepeat {
  enabled?: boolean;
  defaultCount?: number;
  min?: number;
  max?: number;
  showControls?: boolean;
  instanceLabel?: string;
}

type ShowWhen = 'always' | 'fieldEquals' | 'fieldNotEquals' | 'fieldhasvalue';

type LogicalOp = 'AND' | 'OR';

interface TplCondition {
  id?: number;
  value?: any;
  showWhen: ShowWhen;
  referenceFieldId?: string | null;
  operatorWithPrev?: LogicalOp;
}

interface TplField {
  id: string;
  type: string;                 // text/select/textarea/datetime-local/checkbox/search
  displayName: string;
  label?: string;
  required?: boolean;
  requiredMsg?: string;

  datasource?: string;          // datasource dropdown
  options?: any[];              // static dropdown
  selectedOptions?: any[];      // yes/no override guard
  order?: number;

  // lookup config (for type === 'search')
  lookup?: {
    placeholder?: string;
    minChars?: number;
    debounceMs?: number;
    limit?: number;
    entity?: string;
    datasource?: string;
    valueField?: string;
    displayField?: string;
    displayTemplate?: string;
    clearOnTextChange?: boolean;
    fill?: Array<{ targetFieldId: string; sourcePath: string }>;
  };

  [k: string]: any;
}

interface TplSubsection {
  subsectionKey?: string;
  sectionName?: string;
  sectionDisplayName?: string;
  displayName?: string;
  title?: string;
  order?: number;

  // UM repeat
  repeat?: TplRepeat;
  baseKey?: string; // UM template often provides baseKey for repeat (e.g. "provider", "icd")

  // UM templates: array or object map
  subsections?: Record<string, TplSubsection> | TplSubsection[];

  fields?: TplField[];
  [k: string]: any;
}

interface TplSection {
  sectionName: string;
  sectionDisplayName?: string;
  order?: number;

  repeat?: TplRepeat;
  baseKey?: string;

  fields: TplField[];
  subsections?: Record<string, TplSubsection> | TplSubsection[];
  [k: string]: any;
}

interface TemplateJsonRoot {
  sections: TplSection[];
}

type RenderField = TplField & { controlName: string; _rawId: string };

type RenderRepeat = {
  enabled: boolean;
  defaultCount: number;
  min: number;
  max: number;
  showControls: boolean;
  instanceLabel: string;
};

type RenderRepeatInstance = {
  index: number; // 1-based
  fields: RenderField[];
};

type RenderSubsection = {
  key: string;
  title: string;
  order: number;
  raw: TplSubsection;

  fields: RenderField[];
  subsections: RenderSubsection[];

  repeat?: RenderRepeat;
  instances?: RenderRepeatInstance[];
  repeatKey?: string;
  repeatPrefix?: string;

  pathKey: string;
};

type RenderSection = {
  title: string;
  order: number;
  raw: TplSection;

  fields: RenderField[];
  subsections: RenderSubsection[];

  repeat?: RenderRepeat;
  instances?: RenderRepeatInstance[];
  repeatKey?: string;
  repeatPrefix?: string;

  expanded: boolean;
  pathKey: string;
};

type DepDropdownCfg = {
  parentControlName: string;
  linkProp: string;
};

/**
 * Some templates introduce "field groups" that look like a field but actually contain a
 * nested `fields: []` array (e.g., a row with a select + checkbox).
 *
 * Older rendering assumed `section.fields` was a flat list of real fields (each with an `id`).
 * If a group object is passed through as-is, it will have no `id` / `controlName`, so it will
 * not render and none of its children will be added to the reactive form.
 *
 * We fix this by flattening any group objects into their child fields while preserving
 * the overall ordering (group order first, then child order).
 */

type RepeatKind = 'section' | 'subsection';

type RepeatRegistryMeta = {
  key: string;
  kind: RepeatKind;
  title: string;
  prefix: string;     // repeatPrefix used in control naming (NO trailing underscore)
  fieldIds: string[]; // raw field ids
  min: number;
  max: number;
  pathKey: string;
};

@Component({
  selector: 'app-authdetails',
  templateUrl: './authdetails.component.html',
  styleUrl: './authdetails.component.css'
})
export class AuthdetailsComponent implements OnInit, OnDestroy, AuthunsavedchangesawareService {
  private destroy$ = new Subject<void>();
  private templateDestroy$ = new Subject<void>();
  private visibilitySyncInProgress = false;
  // When we change only the authNumber segment (0 -> generated) after the first SAVE,
  // we don't want to wipe the already-built template UI and briefly show the "initial" screen.
  private skipNextResetOnNav = false;

  form!: FormGroup;

  // route params
  authNumber = '0';
  memberId = 0;
  memberDetailsId = 0;
  private pendingAuth: any | null = null;
  // Smart Check prefill (from Auth Smart Check step)
  private readonly SMARTCHECK_PREFILL_KEY = 'SMART_AUTH_CHECK_PREFILL';
  private smartCheckPrefill: SmartCheckPrefill | null = null;
  private smartCheckPrefillApplied = false;


  // ---------- Enrollment ----------
  memberEnrollments: MemberEnrollment[] = [];
  selectedDiv = 0;               // 1-based
  enrollmentSelect = false;

  // ---------- Auth Class + Auth Type ----------
  authClassRaw: any[] = [];
  authTemplatesRaw: any[] = [];

  authClassOptions: UiSmartOption[] = [];
  authTypeOptions: UiSmartOption[] = [];

  // ---------- Template ----------
  templateId: number | null = null;
  renderSections: RenderSection[] = [];

  // cache normalized template to rebuild for repeat +/- without refetch
  private normalizedTemplate: TemplateJsonRoot | null = null;

  // ---------- Repeat state ----------
  private repeatCounts: Record<string, number> = {};
  private repeatRegistry: Record<string, RepeatRegistryMeta> = {};

  // ---------- Dropdown cache ----------
  optionsByControlName: Record<string, UiSmartOption[]> = {};
  private fieldIdToControlName = new Map<string, string>();
  private dependentDropdowns: Record<string, DepDropdownCfg> = {};

  // Treat these field types as "option pickers" rendered as buttons
  isButtonType(type: any): boolean {
    const t = String(type ?? '').trim().toLowerCase();
    return t === 'button' || t === 'buttons' || t === 'button-group' || t === 'radio-buttons' || t === 'radiobuttons';
  }

  /** Options for button-type fields (same sources as dropdowns: datasource or static options) */
  getButtonOptions(f: any): UiSmartOption[] {
    const controlName = String(f?.controlName ?? '').trim();
    if (controlName && (this.optionsByControlName[controlName]?.length ?? 0) > 0) {
      return this.getDropdownOptions(controlName);
    }

    // If not prefetched (or no datasource), fall back to static options on the field
    const staticOpts = this.mapStaticOptions((f as any)?.options);
    return staticOpts.length ? staticOpts : this.getDropdownOptions(controlName);
  }

  isButtonOptionSelected(f: any, opt: UiSmartOption): boolean {
    const ctrl = this.form?.get(f?.controlName);
    if (!ctrl) return false;
    const cv = this.unwrapValue(ctrl.value);
    return String(cv ?? '') === String((opt as any)?.value ?? '');
  }

  onButtonOptionClick(f: any, opt: UiSmartOption): void {
    const ctrl = this.form?.get(f?.controlName);
    if (!ctrl || ctrl.disabled) return;

    ctrl.setValue((opt as any)?.value ?? null);
    ctrl.markAsDirty();
    ctrl.markAsTouched();

    // Optional: allow templates to specify a handler method name
    const handler = (f as any)?.onClick || (f as any)?.action || (f as any)?.clickHandler;
    if (handler && typeof (this as any)[handler] === 'function') {
      try {
        (this as any)[handler](f, opt);
      } catch {
        // ignore handler errors to avoid breaking form input
      }
    }
  }

  /**
   * Action buttons (template fields of type "button" with a buttonText) are NOT data-entry controls.
   * We render them as real buttons at the section/subsection level.
   */
  getActionButtons(fields: any[] | null | undefined): any[] {
    return (fields ?? []).filter(f => this.isButtonType((f as any)?.type) && !!String((f as any)?.buttonText ?? '').trim());
  }

  getNonActionFields(fields: any[] | null | undefined): any[] {
    return (fields ?? []).filter(f => !(this.isButtonType((f as any)?.type) && !!String((f as any)?.buttonText ?? '').trim()));
  }

  isActionButtonEnabled(f: any): boolean {
    // honor reactive-form disabled state if a control exists
    const cn = String((f as any)?.controlName ?? '').trim();
    const ctrl = cn ? this.form?.get(cn) : null;
    if (ctrl && ctrl.disabled) return false;

    // honor template isEnabled flag
    return (f as any)?.isEnabled !== false;
  }


  // ---------- Users (Owner dropdown) ----------
  allUsers: any[] = [];
  usersLoaded = false;
  private authOwnerOptions: UiSmartOption[] = [];

  /** Default Owner (logged-in user) */
  private readonly loggedInUserId: number = Number(sessionStorage.getItem('loggedInUserid') || 0);

  // ---------- Work Group / Work List (Workbasket) ----------
  private workBasketOptions: UiSmartOption[] = [];
  private workGroupOptions: UiSmartOption[] = [];
  private workBasketLoaded = false;

  // add cascading rules here if UM introduces dependencies
  private readonly dependentDatasourceRules: Array<{ child: string; parent: string; linkProp: string }> = [];

  // ---------- Lookup helpers ----------
  lookupSelectedByControl: Record<string, any> = {};
  private lookupSearchFnCache = new Map<string, (q: string, limit: number) => Observable<any[]>>();
  private lookupDisplayFnCache = new Map<string, (item: any) => string>();
  private lookupTrackByFnCache = new Map<string, (item: any) => any>();

  // ---------- Save ----------
  isSaving = false;


  // ---------- Template validation (same as AuthorizationComponent) ----------
  validationRules: any[] = [];
  sectionValidationMessages: { [sectionTitle: string]: string[] } = {};

  // ---------- Hide sections (other steps) ----------
  private readonly hiddenSectionTitles = new Set([
    'decision',
    'decision details',
    'member provider decision info',
    'decision notes',
    'authorization notes',
    'authorization documents'
  ]);

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private crudService: CrudService,
    private dsLookup: DatasourceLookupService,
    private memberEnrollment: MemberenrollmentService,
    private authApi: AuthDetailApiService,
    private decisionSeed: AuthDecisionSeedService,
    private userService: AuthenticateService,
    private authNumberService: AuthNumberService,
    private wbService: WorkbasketService,
    private rulesengineService: RulesengineService,
    private dialog: MatDialog,
    private headerService: HeaderService,
    @Optional() private shell?: AuthwizardshellComponent
  ) { }

  ngOnInit(): void {
    // Create form first (route subscription will call resetAuthScreenState)
    this.form = this.fb.group({
      authClassId: new FormControl(null, Validators.required),
      authTypeId: new FormControl(null, Validators.required),
    });

    // Read Smart Auth Check prefill (if user came from Smart Check step)
    this.smartCheckPrefill = this.readSmartCheckPrefill();

    this.memberId = this.getNumberParamFromAncestors('id') || 0;
    this.memberDetailsId = Number(sessionStorage.getItem('selectedMemberDetailsId') || 0);

    // Enrollment + Auth Class
    this.loadMemberEnrollment();
    this.loadAuthClass();

    // Load users for Owner dropdown (authActualOwner)
    this.loadAllUsers();

    // Load Work Group / Work List dropdowns (from WorkbasketService)
    this.loadWorkBasket();

    // Work Group / Work List dropdowns (same approach as Case Details)
    this.loadWorkBasket();

    // React to authNumber changes (works even when authNumber is on parent route)
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      startWith(null),
      takeUntil(this.destroy$),
      map(() => this.getStringParamFromAncestors('authNumber') ?? '0'),
      distinctUntilChanged(),
      tap(authNo => {
        this.authNumber = String(authNo);
        if (this.skipNextResetOnNav) {
          // Keep the current template rendering intact; we'll still refresh data via getByNumber below.
          this.skipNextResetOnNav = false;
        } else {
          this.resetAuthScreenState();
        }
      }),
      switchMap(authNo => {
        if (!authNo || authNo === '0') return of(null);
        console.log('Loading auth details for auth number:', authNo);
        return this.authApi.getByNumber(String(authNo));
      })
    ).subscribe((auth: any) => {
      if (!auth) return;
      this.bindAuthorization(auth);
    });

    // Auth class -> templates
    this.form.get('authClassId')!.valueChanges
      .pipe(distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((val: any) => {
        const authClassId = Number(this.unwrapValue(val) || 0);

        this.form.get('authTypeId')!.setValue(null, { emitEvent: false });
        this.authTemplatesRaw = [];
        this.authTypeOptions = [];

        this.templateId = null;
        this.clearTemplate(true);

        if (authClassId > 0) {
          this.loadAuthTemplates(authClassId);
        }
      });

    // Auth type -> template json
    this.form.get('authTypeId')!.valueChanges
      .pipe(distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((val: any) => {
        const tplId = Number(this.unwrapValue(val) || 0);

        this.templateId = tplId > 0 ? tplId : null;
        this.clearTemplate(true);
        this.validationRules = [];
        this.sectionValidationMessages = {};

        if (this.templateId) {
          this.loadTemplateJson(this.templateId);
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ============================================================
  // Wizard context hooks (called by Authwizardshell)
  // ============================================================
  /**
   * Shell will call this whenever the active step changes.
   * We MUST react to late-arriving memberDetailsId (tabs/stepper navigation)
   * otherwise enrollment-dependent UI renders blank.
   */
  public setContext(ctx: any): void {
    const nextMemberDetailsId = Number(ctx?.memberDetailsId ?? 0);
    if (nextMemberDetailsId && Number.isFinite(nextMemberDetailsId)) {
      const changed = nextMemberDetailsId !== Number(this.memberDetailsId || 0);
      this.memberDetailsId = nextMemberDetailsId;

      try { sessionStorage.setItem('selectedMemberDetailsId', String(nextMemberDetailsId)); } catch { /* ignore */ }

      // If enrollments aren't loaded yet (common when session storage was empty on init), load now.
      if (changed || !(this.memberEnrollments?.length)) {
        this.loadMemberEnrollment(nextMemberDetailsId);
      }
    }

    // If shell provides authNumber and we're currently showing NEW/empty, rehydrate by number.
    const nextAuthNumber = String(ctx?.authNumber ?? '').trim();
    if (nextAuthNumber && nextAuthNumber !== '0' && nextAuthNumber !== String(this.authNumber ?? '').trim()) {
      this.authNumber = nextAuthNumber;
      // reload from API (idempotent)
      void this.reload();
    }
  }

  /** Optional hook the shell calls on activation (if present). */
  public reload(): void {
    // Ensure enrollment data is available
    const mdId = Number(this.memberDetailsId ?? sessionStorage.getItem('selectedMemberDetailsId') ?? 0);
    if (mdId && Number.isFinite(mdId) && !(this.memberEnrollments?.length)) {
      this.loadMemberEnrollment(mdId);
    }

    // Ensure auth data is hydrated when re-entering this step
    const authNo = String(this.getStringParamFromAncestors('authNumber') ?? this.authNumber ?? '0');
    if (!authNo || authNo === '0') return;

    // Only refetch if we don't already have the same auth loaded
    const loadedNo = String((this.pendingAuth as any)?.authNumber ?? (this.pendingAuth as any)?.AuthNumber ?? this.authNumber ?? '');
    if (this.pendingAuth && loadedNo && loadedNo.trim() === authNo.trim()) return;

    this.authApi.getByNumber(authNo).pipe(takeUntil(this.destroy$)).subscribe({
      next: (row: any) => row && this.bindAuthorization(row),
      error: (e: any) => console.error('Failed to reload auth by number', authNo, e)
    });
  }

  // ============================================================
  // Route param helpers
  // ============================================================

  private readSmartCheckPrefill(): SmartCheckPrefill | null {
    try {
      const raw = sessionStorage.getItem(this.SMARTCHECK_PREFILL_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      return obj as SmartCheckPrefill;
    } catch {
      return null;
    }
  }

  private clearSmartCheckPrefill(): void {
    try { sessionStorage.removeItem(this.SMARTCHECK_PREFILL_KEY); } catch { /* ignore */ }
  }

  private getStringParamFromAncestors(param: string): string | null {
    let r: ActivatedRoute | null = this.route;
    while (r) {
      const v = r.snapshot.paramMap.get(param);
      if (v != null && v !== '') return v;
      r = r.parent;
    }
    return null;
  }

  private getNumberParamFromAncestors(param: string): number | null {
    let r: ActivatedRoute | null = this.route;
    while (r) {
      const v = r.snapshot.paramMap.get(param);
      if (v) return Number(v);
      r = r.parent;
    }
    return null;
  }

  // ============================================================
  // Enrollment
  // ============================================================
  private loadMemberEnrollment(mdIdOverride?: number): void {
    const mdId = Number(mdIdOverride ?? this.memberDetailsId ?? sessionStorage.getItem('selectedMemberDetailsId') ?? 0);
    if (!mdId || !Number.isFinite(mdId)) return;

    // keep local + session storage consistent (many other screens rely on this)
    this.memberDetailsId = mdId;
    try { sessionStorage.setItem('selectedMemberDetailsId', String(mdId)); } catch { /* ignore */ }

    this.memberEnrollment.getMemberEnrollment(mdId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: MemberEnrollment[]) => this.setMemberEnrollments(data),
        error: (e) => console.error('Error fetching member enrollment data:', e)
      });
  }

  private setMemberEnrollments(data: MemberEnrollment[]): void {
    this.memberEnrollments = (data ?? []).map(d => ({ ...d }));

    if (!this.memberEnrollments.length) {
      this.selectedDiv = 0;
      this.enrollmentSelect = false;
      return;
    }

    // If editing an auth and it belongs to a specific enrollment, select it
    const targetEnrollmentId = this.pendingAuth?.memberEnrollmentId;
    if (targetEnrollmentId) {
      const idx = this.memberEnrollments.findIndex((e: any) => e.memberEnrollmentId === targetEnrollmentId);
      if (idx >= 0) {
        this.selectEnrollment(idx);
        return;
      }
    }

    // If coming from Smart Check (new auth), preselect the same enrollment if possible
    if (!this.pendingAuth && this.smartCheckPrefill?.enrollmentId) {
      const prefId = Number(this.smartCheckPrefill.enrollmentId || 0);
      const idx2 = this.memberEnrollments.findIndex((e: any) => Number(e?.memberEnrollmentId || 0) === prefId);
      if (idx2 >= 0) {
        this.selectEnrollment(idx2);
        return;
      }
    }

    this.selectEnrollment(0);
  }

  selectEnrollment(i: number): void {
    this.selectedDiv = i + 1;
    this.enrollmentSelect = true;
  }

  getEnrollmentDisplayPairs(enr: MemberEnrollment): Array<{ label: string; value: string }> {
    let levelMap: Record<string, string> = {};
    let levels: LevelItem[] = [];

    try { levelMap = JSON.parse(enr.levelMap || '{}'); } catch { levelMap = {}; }
    try { levels = JSON.parse(enr.levels || '[]') as LevelItem[]; } catch { levels = []; }

    const orderedLevels = [...levels].sort((a, b) => (a?.levelsequence ?? 0) - (b?.levelsequence ?? 0));
    const pairs: Array<{ label: string; value: string }> = [];

    for (const lvl of orderedLevels) {
      const code = (lvl.levelcode || '').trim();
      const label = code || lvl.levelname || 'Level';

      const value =
        (lvl.level_value_name?.trim?.() || '') ||
        (levelMap[code] ?? '') ||
        (lvl.level_value_code ? String(lvl.level_value_code) : '') ||
        '';

      if (label && value) pairs.push({ label, value });
    }

    const start = enr.startDate ? this.formatDateMMDDYYYY(enr.startDate) : '';
    const end = enr.endDate ? this.formatDateMMDDYYYY(enr.endDate) : '';
    if (start) pairs.push({ label: 'Start Date', value: start });
    if (end) pairs.push({ label: 'End Date', value: end });

    return pairs;
  }

  private formatDateMMDDYYYY(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  // ============================================================
  // Auth Class + Templates
  // ============================================================
  private loadAuthClass(): void {
    this.crudService.getData('um', 'authclass')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: any[]) => {
          this.authClassRaw = response || [];
          this.authClassOptions = this.authClassRaw
            .map(x => ({
              value: Number(x.id ?? x.Id),
              label: x.authClass ?? x.AuthClass ?? x.name ?? ''
            }) as UiSmartOption)
            .filter(o => !!o.label && Number(o.value) > 0);

          // Smart Check prefill: preselect Auth Class for new auth flows
          if (!this.pendingAuth && this.smartCheckPrefill?.authClassId && (this.authNumber === '0' || !this.authNumber)) {
            const desired = Number(this.smartCheckPrefill.authClassId || 0);
            const cur = Number(this.unwrapValue(this.form.get('authClassId')?.value) || 0);
            if (desired > 0 && cur === 0) {
              this.form.get('authClassId')?.setValue(desired, { emitEvent: true });
            }
          }
        },
        error: (e) => {
          console.error('Error fetching auth class:', e);
          this.authClassRaw = [];
          this.authClassOptions = [];
        }
      });
  }

  private loadAuthTemplates(authClassId: number): void {
    this.authService.getTemplates('UM', authClassId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data: any[]) => {
          this.authTemplatesRaw = data || [];
          this.authTypeOptions = (this.authTemplatesRaw || [])
            .map(t => ({
              value: Number(t.Id ?? t.id),
              label: t.TemplateName ?? t.templateName ?? ''
            }) as UiSmartOption)
            .filter(o => !!o.label && Number(o.value) > 0);

          // If editing an existing auth, force-select template/type
          const desiredTypeId = Number(
            (this.pendingAuth as any)?.authTypeId ??
            (this.pendingAuth as any)?.authTypeID ??
            (this.pendingAuth as any)?.authTemplateId ??
            (this.pendingAuth as any)?.AuthTemplateId ??
            (this.pendingAuth as any)?.templateId ??
            (this.pendingAuth as any)?.TemplateId ??
            0
          );
          if (desiredTypeId > 0) {
            this.form.get('authTypeId')?.setValue(desiredTypeId, { emitEvent: true });
            return; // don't let Smart Check prefill override edit flow
          }

          // Smart Check prefill: preselect Auth Type (template) for new auth flows
          if (!this.pendingAuth && this.smartCheckPrefill?.authTypeId && (this.authNumber === '0' || !this.authNumber)) {
            const desired = Number(this.smartCheckPrefill.authTypeId || 0);
            const cur = Number(this.unwrapValue(this.form.get('authTypeId')?.value) || 0);
            if (desired > 0 && cur === 0) {
              this.form.get('authTypeId')?.setValue(desired, { emitEvent: true });
            }
          }
        },
        error: (e) => console.error('Auth templates load failed', e)
      });
  }

  // ============================================================
  // Template load + build + dropdown/lookup pipeline
  // ============================================================
  private loadTemplateJson(templateId: number): void {
    this.authService.getTemplate('UM', templateId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          const tpl = Array.isArray(res) ? res[0] : res;
          const jsonRoot: TemplateJsonRoot =
            typeof tpl?.jsonContent === 'string' ? JSON.parse(tpl.jsonContent) : tpl?.jsonContent;

          const normalized = this.normalizeTemplate(jsonRoot);
          this.normalizedTemplate = normalized;

          // Parse persisted jsonData (used to infer repeat counts + patch)
          const persistedObj = this.safeParseJson(this.pendingAuth?.jsonData);

          // Build render model (repeat-aware) + hide certain sections
          const built = this.buildRenderModel(normalized, persistedObj);
          this.renderSections = this.pruneHiddenSections(built);

          // Build controls for ALL fields including repeat instances
          this.buildFormControls(this.renderSections);

          // Dropdown pipeline
          this.optionsByControlName = {};
          this.setupDependentDropdowns(this.renderSections);
          this.prefetchDropdownOptions(this.renderSections);
          this.applyAuthOwnerOptions();
          this.applyWorkGroupAndBasketOptions();

          // Patch values after controls exist
          if (this.pendingAuth) {
            this.patchAuthorizationToForm(this.pendingAuth);
          }

          // Smart Check prefill: if user arrived from Smart Check, fill ICD + Procedure codes (new auth only)
          void this.applySmartCheckPrefillToTemplateFields();

          // Load validation rules for this template (same behavior as AuthorizationComponent)
          this.getValidationRules();

          this.setupVisibilityWatcher();
        },
        error: (e) => console.error('Template json load failed', e)
      });
  }

  // ============================================================
  // Smart Check prefill into Auth Details template
  // ============================================================
  private getSearchFieldsByEntity(entity: string): RenderField[] {
    const e = String(entity || '').toLowerCase();
    const all = this.collectAllRenderFields(this.renderSections);
    return (all || [])
      .filter(f => String((f as any)?.type || '').toLowerCase() === 'search')
      .filter(f => String(this.getLookupEntity(f) || '').toLowerCase() === e);
  }

  private findRepeatKeyForKind(kind: 'icd' | 'medicalcodes'): string | null {
    const patterns = kind === 'icd'
      ? ['icd', 'diag', 'diagn']
      : ['medical', 'cpt', 'procedure', 'proc', 'service', 'code'];

    const metas = Object.values(this.repeatRegistry || {});
    const candidate = metas.find(m => {
      const s = `${m?.prefix ?? ''} ${m?.title ?? ''}`.toLowerCase();
      return patterns.some(p => s.includes(p));
    });

    return candidate?.key ?? null;
  }

  private ensureRepeatCountForKind(kind: 'icd' | 'medicalcodes', desiredCount: number): void {
    const desired = Number(desiredCount || 0);
    if (desired <= 1) return;

    const current = this.getSearchFieldsByEntity(kind).length;
    if (current >= desired) return;

    const key = this.findRepeatKeyForKind(kind);
    if (!key) return;

    const curCount = Number(this.repeatCounts?.[key] || 0);
    this.repeatCounts[key] = Math.max(desired, curCount || 0);

    const snap = this.form.getRawValue();
    this.rebuildFromNormalizedTemplate(snap);
  }

  private pickCode(item: any): string {
    if (!item) return '';
    if (typeof item === 'string') return item;
    return String(
      item.code ??
      item.Code ??
      item.icdcode ??
      item.icdCode ??
      item.cptcode ??
      item.cptCode ??
      item.medicalcode ??
      item.medicalCode ??
      ''
    ).trim();
  }

  private async prefillLookupFieldByCode(f: any, code: string): Promise<void> {
    if (!f?.controlName || !code) return;

    const ctrl = this.form.get(f.controlName);
    if (!ctrl) return;

    const cur = String(ctrl.value ?? '').trim();
    if (cur) return; // do not override user / existing values

    const searchFn = this.getLookupSearchFn(f);
    if (!searchFn) {
      ctrl.setValue(code, { emitEvent: true });
      ctrl.markAsDirty();
      return;
    }

    try {
      const results = await firstValueFrom(
        searchFn(String(code), 25).pipe(catchError(() => of([])))
      ) as any[];

      const wanted = String(code).trim().toLowerCase();
      const match =
        (results || []).find(x => this.pickCode(x).toLowerCase() === wanted) ||
        (results || [])[0];

      if (match) {
        this.onLookupSelected(f, match);
      } else {
        ctrl.setValue(code, { emitEvent: true });
        ctrl.markAsDirty();
      }
    } catch {
      ctrl.setValue(code, { emitEvent: true });
      ctrl.markAsDirty();
    }
  }

  private prefillProcedureFromToDates(fromVal: any, toVal: any, desiredCount: number): void {
    const from = this.normalizeSmartCheckDateValue(fromVal);
    const to = this.normalizeSmartCheckDateValue(toVal);
    if (!from && !to) return;

    const procSecs = this.getProcedureCandidateSections();
    const baseFields = this.collectAllRenderFields((procSecs && procSecs.length) ? procSecs : this.renderSections);
    const dtFields = (baseFields || [])
      .filter(f => String((f as any)?.type || '').toLowerCase() === 'datetime-local');

    let fromFields = dtFields.filter(f => this.isFromDateField(f));
    let toFields = dtFields.filter(f => this.isToDateField(f));

    // Fallback: sometimes Procedure is nested under a differently-named section - use rawId/controlName hints
    if (!fromFields.length && !toFields.length) {
      const all = this.collectAllRenderFields(this.renderSections)
        .filter(f => String((f as any)?.type || '').toLowerCase() === 'datetime-local');

      fromFields = all.filter(f => this.isProcedureRelatedField(f) && this.isFromDateField(f));
      toFields = all.filter(f => this.isProcedureRelatedField(f) && this.isToDateField(f));
    }

    const n = Math.max(Number(desiredCount || 1), fromFields.length, toFields.length);
    for (let i = 0; i < n; i++) {
      if (from && fromFields[i]) this.setControlIfEmpty(fromFields[i].controlName, from);
      if (to && toFields[i]) this.setControlIfEmpty(toFields[i].controlName, to);
    }
  }

  private normalizeSmartCheckDateValue(v: any): any {
    if (v === undefined || v === null) return null;
    if (v instanceof Date) return v.toISOString();
    const s = String(v).trim();
    if (!s) return null;
    // If it is parseable, store as ISO to match ui-datetime-picker expectations
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return s;
  }

  private setControlIfEmpty(controlName: string, value: any): void {
    if (!controlName) return;
    const ctrl = this.form.get(controlName);
    if (!ctrl) return;
    const cur = ctrl.value;
    if (cur !== undefined && cur !== null && String(cur).trim() !== '') return;
    ctrl.setValue(value, { emitEvent: true });
    ctrl.markAsDirty();
  }

  private getProcedureCandidateSections(): RenderSection[] {
    const secs = this.renderSections || [];
    const proc = secs.filter(s => {
      const t = String(s?.title || '').toLowerCase();
      // prefer explicit Procedure; otherwise Service (but not Diagnosis/ICD)
      if (t.includes('procedure')) return true;
      if (t.includes('service') && !t.includes('diagnos') && !t.includes('icd')) return true;
      return false;
    });
    return proc;
  }

  private isProcedureRelatedField(f: any): boolean {
    const s = this.fieldSearchText(f);
    return s.includes('procedure') || s.includes('service') || s.includes('cpt') || (s.includes('medical') && s.includes('code'));
  }

  private isFromDateField(f: any): boolean {
    const s = this.fieldSearchText(f);
    return (s.includes('from') || s.includes('start') || s.includes('begin')) && (s.includes('date') || s.includes('dt'));
  }

  private isToDateField(f: any): boolean {
    const s = this.fieldSearchText(f);
    return (s.includes('to') || s.includes('end') || s.includes('thru') || s.includes('through')) && (s.includes('date') || s.includes('dt'));
  }

  private fieldSearchText(f: any): string {
    return [
      String(f?.displayName ?? ''),
      String(f?.label ?? ''),
      String(f?.controlName ?? ''),
      String((f as any)?._rawId ?? ''),
      String((f as any)?.id ?? '')
    ].join(' ').toLowerCase();
  }

  private async applySmartCheckPrefillToTemplateFields(): Promise<void> {
    // Only apply for new auth flows (no auth number) and only once
    if (this.smartCheckPrefillApplied) return;
    if (this.pendingAuth) return;
    if (this.authNumber && this.authNumber !== '0') return;

    const pre = this.smartCheckPrefill;
    if (!pre) return;

    const icds = Array.isArray(pre.icdCodes) ? pre.icdCodes.filter(Boolean) : [];
    const svcs = Array.isArray(pre.serviceCodes) ? pre.serviceCodes.filter(Boolean) : [];

    // Ensure repeat instances exist (if template uses repeats)
    if (icds.length > 1) this.ensureRepeatCountForKind('icd', icds.length);
    if (svcs.length > 1) this.ensureRepeatCountForKind('medicalcodes', svcs.length);

    // Re-collect fields after potential rebuild
    let icdFields = this.getSearchFieldsByEntity('icd');
    let svcFields = this.getSearchFieldsByEntity('medicalcodes');

    // Fallback: some templates may not set entity; infer by control name/id
    if (!icdFields.length && icds.length) {
      const allSearch = this.collectAllRenderFields(this.renderSections)
        .filter(f => String((f as any)?.type || '').toLowerCase() === 'search');
      icdFields = allSearch.filter(f => {
        const k = String((f as any)?._rawId ?? (f as any)?.id ?? (f as any)?.controlName ?? '').toLowerCase();
        return k.includes('icd') || k.includes('diag');
      });
    }

    if (!svcFields.length && svcs.length) {
      const allSearch = this.collectAllRenderFields(this.renderSections)
        .filter(f => String((f as any)?.type || '').toLowerCase() === 'search');
      svcFields = allSearch.filter(f => {
        const k = String((f as any)?._rawId ?? (f as any)?.id ?? (f as any)?.controlName ?? '').toLowerCase();
        return k.includes('procedure') || k.includes('service') || k.includes('cpt') || (k.includes('medical') && k.includes('code'));
      });
    }

    // Fill ICD codes
    for (let i = 0; i < icds.length; i++) {
      const f = icdFields[i];
      if (!f) break;
      // For some templates the code field is not the first 'search' in the ICD repeat; still, filling in order is safest.
      await this.prefillLookupFieldByCode(f, icds[i]);
    }

    // Fill Procedure/Service codes
    for (let i = 0; i < svcs.length; i++) {
      const f = svcFields[i];
      if (!f) break;
      await this.prefillLookupFieldByCode(f, svcs[i]);
    }

    // Prefill Procedure From/To dates (Smart Check → Auth Details)
    const fromDt = (pre as any)?.procedureFromDateIso ?? (pre as any)?.fromDateIso ?? null;
    const toDt = (pre as any)?.procedureToDateIso ?? (pre as any)?.toDateIso ?? null;
    this.prefillProcedureFromToDates(fromDt, toDt, Math.max(1, svcs.length));

    this.smartCheckPrefillApplied = true;
    this.clearSmartCheckPrefill();
  }


  private clearTemplate(resetRepeat: boolean): void {
    // stop previous template-based subscriptions (visibility, etc.)
    this.templateDestroy$.next();
    this.renderSections = [];
    this.optionsByControlName = {};
    this.dependentDropdowns = {};

    if (resetRepeat) {
      this.repeatRegistry = {};
      this.repeatCounts = {};
      this.normalizedTemplate = null;
    }

    Object.keys(this.form.controls).forEach(k => {
      if (k !== 'authClassId' && k !== 'authTypeId') this.form.removeControl(k);
    });
  }

  toggleSection(sec: RenderSection): void {
    sec.expanded = !sec.expanded;
  }

  // ============================================================
  // Hide sections (Decision / Notes / Docs)
  // ============================================================
  private shouldHideSectionTitle(title?: string | null): boolean {
    const t = (title ?? '').trim().toLowerCase();
    return this.hiddenSectionTitles.has(t);
  }

  private pruneHiddenSections(sections: RenderSection[]): RenderSection[] {
    return (sections ?? [])
      .filter(s => !this.shouldHideSectionTitle(s.title))
      .map(s => ({
        ...s,
        subsections: this.pruneHiddenSubsections(s.subsections)
      }));
  }

  private pruneHiddenSubsections(subs: RenderSubsection[]): RenderSubsection[] {
    return (subs ?? []).map(sub => ({
      ...sub,
      subsections: this.pruneHiddenSubsections(sub.subsections)
    }));
  }

  // ============================================================
  // Render-model build (repeat aware)
  // ============================================================

  /**
   * Flatten any template "group" fields that contain a nested `fields: []` array.
   *
   * Example payload (simplified):
   * {
   *   type: 'select',
   *   order: 4,
   *   layout: 'row',
   *   fields: [ { id: 'requestPriority', type:'select', ... }, { id:'extension', type:'checkbox', ... } ]
   * }
   */
  private expandTplFields(fields: any[] | null | undefined): TplField[] {
    const out: TplField[] = [];
    const src = Array.isArray(fields) ? fields : [];

    for (const item of src) {
      const nested = (item as any)?.fields;
      if (Array.isArray(nested) && nested.length > 0) {
        const groupOrder = Number((item as any)?.order ?? 0);
        const groupLayout = (item as any)?.layout;
        const groupId = (item as any)?.id;

        for (const child of nested) {
          const c: any = { ...(child as any) };
          // Preserve group context for debugging / future layout work (no functional dependency today)
          c._group = { id: groupId ?? null, order: groupOrder, layout: groupLayout ?? null };

          // Preserve ordering: group order first, then child order.
          // Use a fractional offset so we don't distort ordering relative to other fields.
          // Example: group order 4 with children 1,2 => 4.001, 4.002
          const childOrder = Number(c?.order ?? 0);
          c.order = groupOrder + (childOrder / 1000);

          out.push(c as TplField);
        }
        continue;
      }

      out.push(item as TplField);
    }

    return out;
  }

  private normalizeTemplate(root: TemplateJsonRoot): TemplateJsonRoot {
    const sections = (root?.sections || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    return { sections };
  }

  private buildRenderModel(root: TemplateJsonRoot, persistedObj: any | null): RenderSection[] {
    this.repeatRegistry = {};

    return (root.sections || [])
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((sec, i) => {
        const title = sec.sectionDisplayName || sec.sectionName;
        const pathKey = `sec:${this.safeKey(title)}:${i}`;

        // non-repeat fields keep original naming: controlName = safeControlName(field.id)
        const flatFields = this.expandTplFields(sec.fields);
        const fieldsSorted = flatFields.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
        const baseFields: RenderField[] = fieldsSorted.map(f => this.toRenderField(f, this.safeControlName(f.id)));

        // section repeat (rare). Use baseKey if available, else sectionName.
        const secRepeat = this.normalizeRepeat(sec.repeat, title);
        let instances: RenderRepeatInstance[] | undefined;
        let repeatKey: string | undefined;
        let repeatPrefix: string | undefined;

        if (secRepeat?.enabled) {
          repeatPrefix = String(sec.baseKey ?? sec.sectionName ?? this.safeKey(title)).trim() || this.safeKey(title);
          repeatKey = `${repeatPrefix}__repeat__sec`;

          const count = this.getInitialRepeatCount(repeatKey, secRepeat, repeatPrefix, persistedObj);
          instances = this.buildRepeatInstances(flatFields, repeatPrefix, count);

          this.repeatRegistry[repeatKey] = {
            key: repeatKey,
            kind: 'section',
            title,
            prefix: repeatPrefix,
            fieldIds: (flatFields || []).map(x => x.id).filter(Boolean),
            min: secRepeat.min,
            max: secRepeat.max,
            pathKey
          };
        }

        const subsections = this.asSubArray(sec.subsections)
          .slice()
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map((sub, subIndex) => this.buildRenderSubsection(sub, `${pathKey}/sub:${subIndex}`, persistedObj));

        return {
          title,
          order: sec.order || (i + 1),
          raw: sec,
          fields: secRepeat?.enabled ? [] : baseFields,
          subsections,
          repeat: secRepeat ?? undefined,
          instances,
          repeatKey,
          repeatPrefix,
          expanded: true,
          pathKey
        };
      });
  }

  private buildRenderSubsection(rawSub: TplSubsection, parentPathKey: string, persistedObj: any | null): RenderSubsection {
    const key = (rawSub.subsectionKey ?? rawSub.sectionName ?? rawSub.displayName ?? rawSub.sectionDisplayName ?? rawSub.title ?? 'sub').toString();
    const title = (rawSub.sectionDisplayName ?? rawSub.displayName ?? rawSub.title ?? rawSub.sectionName ?? rawSub.subsectionKey ?? key).toString();
    const pathKey = `${parentPathKey}/${this.safeKey(title)}`;

    const subRepeat = this.normalizeRepeat(rawSub.repeat, title);

    // non-repeat fields keep original naming: safeControlName(field.id)
    const flatFields = this.expandTplFields(rawSub.fields);
    const fieldsSorted = flatFields.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const baseFields: RenderField[] = fieldsSorted.map(f => this.toRenderField(f, this.safeControlName(f.id)));

    let instances: RenderRepeatInstance[] | undefined;
    let repeatKey: string | undefined;
    let repeatPrefix: string | undefined;

    if (subRepeat?.enabled) {
      // UM repeat: prefer baseKey (template provides it), else subsectionKey
      repeatPrefix = String(rawSub.baseKey ?? rawSub.subsectionKey ?? this.safeKey(title)).trim() || this.safeKey(title);
      repeatKey = `${repeatPrefix}__repeat__sub`;

      const count = this.getInitialRepeatCount(repeatKey, subRepeat, repeatPrefix, persistedObj);
      instances = this.buildRepeatInstances(flatFields, repeatPrefix, count);

      this.repeatRegistry[repeatKey] = {
        key: repeatKey,
        kind: 'subsection',
        title,
        prefix: repeatPrefix,
        fieldIds: (flatFields || []).map(x => x.id).filter(Boolean),
        min: subRepeat.min,
        max: subRepeat.max,
        pathKey
      };
    }

    const nested = this.asSubArray(rawSub.subsections)
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((child, idx) => this.buildRenderSubsection(child, `${pathKey}/sub:${idx}`, persistedObj));

    return {
      key,
      title,
      order: rawSub.order || 0,
      raw: rawSub,
      fields: subRepeat?.enabled ? [] : baseFields,
      subsections: nested,
      repeat: subRepeat ?? undefined,
      instances,
      repeatKey,
      repeatPrefix,
      pathKey
    };
  }

  private asSubArray(subs: any): TplSubsection[] {
    if (!subs) return [];
    if (Array.isArray(subs)) return subs as TplSubsection[];
    if (typeof subs === 'object') {
      return Object.entries(subs).map(([k, v]: any) => {
        const obj = v ?? {};
        return {
          ...obj,
          subsectionKey: obj.subsectionKey ?? k,
          sectionName: obj.sectionName ?? k,
          displayName: obj.displayName ?? obj.sectionDisplayName ?? obj.title ?? k
        } as TplSubsection;
      });
    }
    return [];
  }

  private normalizeRepeat(rep: any, fallbackLabel: string): RenderRepeat | null {
    if (!rep || rep.enabled !== true) return null;

    const min = this.clampInt(rep.min, 1, 0, 9999);
    const max = this.clampInt(rep.max, 99, min, 9999);
    const def = this.clampInt(rep.defaultCount, min, min, max);

    return {
      enabled: true,
      defaultCount: def,
      min,
      max,
      showControls: rep.showControls !== false,
      instanceLabel: String(rep.instanceLabel ?? fallbackLabel ?? '').trim() || 'Item'
    };
  }

  private getInitialRepeatCount(repeatKey: string, rep: RenderRepeat, repeatPrefix: string, persistedObj: any | null): number {
    const existing = this.repeatCounts[repeatKey];
    if (Number.isFinite(existing) && existing > 0) return existing;

    const inferred = this.inferRepeatCountFromPersisted(persistedObj, repeatPrefix);
    const count = Math.max(rep.min, Math.min(rep.max, Math.max(rep.defaultCount, inferred)));

    this.repeatCounts[repeatKey] = count;
    return count;
  }

  private inferRepeatCountFromPersisted(persistedObj: any | null, repeatPrefix: string): number {
    if (!persistedObj || typeof persistedObj !== 'object') return 0;

    const keys = Object.keys(persistedObj);
    let maxIndex = 0;

    // matches: `${repeatPrefix}${i}_...`
    const p = this.safeControlName(repeatPrefix);
    const re = new RegExp('^' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)_', 'i');

    for (const k of keys) {
      const m = k.match(re);
      if (!m) continue;
      const idx = Number(m[1]);
      if (Number.isFinite(idx)) maxIndex = Math.max(maxIndex, idx);
    }
    return maxIndex;
  }

  private buildRepeatInstances(templateFields: TplField[], repeatPrefix: string, count: number): RenderRepeatInstance[] {
    const fieldsSorted = (templateFields ?? []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const instances: RenderRepeatInstance[] = [];

    for (let i = 1; i <= count; i++) {
      const instFields = fieldsSorted.map(f =>
        this.toRenderField(f, this.repeatControlName(repeatPrefix, i, f.id))
      );
      instances.push({ index: i, fields: instFields });
    }
    return instances;
  }

  private repeatControlName(repeatPrefix: string, index: number, rawId: string): string {
    // UM pattern: provider1_providerPhone, icd2_codeType, etc.
    return this.safeControlName(`${repeatPrefix}${index}_${rawId}`);
  }

  // ============================================================
  // Build form controls (includes repeat instances)
  // ============================================================
  private buildFormControls(sections: RenderSection[]): void {
    this.fieldIdToControlName.clear();
    const allFields = this.collectAllRenderFields(sections);
    this.addFieldsAsControls(allFields);
  }

  private collectAllRenderFields(sections: RenderSection[]): RenderField[] {
    const out: RenderField[] = [];

    const walkSub = (sub: RenderSubsection) => {
      if (sub.repeat?.enabled && Array.isArray(sub.instances)) {
        for (const inst of sub.instances) out.push(...(inst.fields || []));
      } else {
        out.push(...(sub.fields || []));
      }
      for (const child of (sub.subsections || [])) walkSub(child);
    };

    for (const sec of (sections || [])) {
      if (sec.repeat?.enabled && Array.isArray(sec.instances)) {
        for (const inst of sec.instances) out.push(...(inst.fields || []));
      } else {
        out.push(...(sec.fields || []));
      }
      for (const sub of (sec.subsections || [])) walkSub(sub);
    }

    return out;
  }

  private addFieldsAsControls(fields: RenderField[]): void {
    for (const f of fields || []) {
      if (!f.controlName) continue;
      if (this.form.contains(f.controlName)) continue;

      const validators = [];
      if (f.required) validators.push(Validators.required);

      const defaultVal = this.computeDefaultValue(f as any);
      const ctrl = new FormControl(defaultVal, validators);
      // default: honor template isEnabled flag
      const enabledByTpl = (f as any)?.isEnabled !== false;
      if (!enabledByTpl) ctrl.disable({ emitEvent: false });

      this.form.addControl(f.controlName, ctrl);

      const rawId = String((f as any)?._rawId ?? (f as any)?.id ?? '').trim();
      if (rawId && !this.fieldIdToControlName.has(rawId)) this.fieldIdToControlName.set(rawId, f.controlName);

    }
  }


  /**
   * Compute template-driven default value for a field.
   * Mirrors CaseDetails behavior so ui-smart-dropdown can show a selected label on load.
   */
  private computeDefaultValue(field: any): any {
    const v = field?.defaultValue;

    // Special template token: 'D' -> current datetime (ISO)
    if (typeof v === 'string') {
      const s = v.trim().toUpperCase();
      if (s === 'D') return new Date().toISOString();

      // if the template stores numeric defaults as strings ("2"), keep as string for now;
      // we reconcile to actual option value after options load.
      return v;
    }

    // Checkbox: honor isEnabled flag as initial checked state (matches CaseDetails)
    if (field?.type === 'checkbox') return !!field?.isEnabled;

    return v ?? null;
  }

  /**
   * If a select control has a value that matches an option only by string/number coercion,
   * coerce the control to the exact option.value so the dropdown displays its label.
   */
  private reconcileSelectControlValue(controlName: string): void {
    if (!controlName) return;
    const ctrl = this.form?.get(controlName);
    if (!ctrl) return;

    const cur = ctrl.value;
    if (cur === null || cur === undefined || cur === '') return;

    const opts: any[] = this.optionsByControlName?.[controlName] ?? [];
    if (!Array.isArray(opts) || opts.length === 0) return;

    // already a strict match
    if (opts.some(o => o?.value === cur)) return;

    const curStr = String(cur);
    const hit = opts.find(o => String(o?.value) === curStr);
    if (hit) {
      ctrl.setValue(hit.value, { emitEvent: false });
      ctrl.markAsPristine();
    }
  }

  // ============================================================
  // Repeat actions for template (+ / -)
  // ============================================================
  canAddRepeat(target: any): boolean {
    const key = target?.repeatKey;
    const rep: RenderRepeat | undefined = target?.repeat;
    if (!key || !rep?.enabled) return false;

    const count = this.repeatCounts[key] ?? (target?.instances?.length ?? rep.defaultCount);
    return count < rep.max;
  }

  canRemoveRepeat(target: any): boolean {
    const key = target?.repeatKey;
    const rep: RenderRepeat | undefined = target?.repeat;
    if (!key || !rep?.enabled) return false;

    const count = this.repeatCounts[key] ?? (target?.instances?.length ?? rep.defaultCount);
    return count > rep.min;
  }

  addRepeat(target: any): void {
    const key = target?.repeatKey;
    const rep: RenderRepeat | undefined = target?.repeat;
    if (!key || !rep?.enabled) return;

    const cur = this.repeatCounts[key] ?? (target?.instances?.length ?? rep.defaultCount);
    if (cur >= rep.max) return;

    this.repeatCounts[key] = cur + 1;

    const snap = this.form.getRawValue();
    this.rebuildFromNormalizedTemplate(snap);
  }

  removeRepeat(target: any, index: number): void {
    const key = target?.repeatKey;
    const rep: RenderRepeat | undefined = target?.repeat;
    if (!key || !rep?.enabled) return;

    const cur = this.repeatCounts[key] ?? (target?.instances?.length ?? rep.defaultCount);
    if (cur <= rep.min) return;

    const idx = Number(index);
    if (!Number.isFinite(idx) || idx < 1 || idx > cur) return;

    const meta = this.repeatRegistry[key];
    const snap0 = this.form.getRawValue();
    const snap = meta ? this.shiftRepeatSnapshotDown(snap0, meta, idx, cur) : snap0;

    this.repeatCounts[key] = cur - 1;
    this.rebuildFromNormalizedTemplate(snap);
  }

  private rebuildFromNormalizedTemplate(snapshot: any): void {
    if (!this.normalizedTemplate) return;

    // keep templateId + authClassId/authTypeId in form
    this.clearTemplate(false);

    const persistedObj = snapshot ?? null;

    const built = this.buildRenderModel(this.normalizedTemplate, persistedObj);
    this.renderSections = this.pruneHiddenSections(built);

    this.buildFormControls(this.renderSections);

    this.optionsByControlName = {};
    this.setupDependentDropdowns(this.renderSections);
    this.prefetchDropdownOptions(this.renderSections);
    this.applyAuthOwnerOptions();

    if (snapshot && typeof snapshot === 'object') {
      this.form.patchValue(snapshot, { emitEvent: false });
    }

    this.setupVisibilityWatcher();
  }

  private shiftRepeatSnapshotDown(snapshot: any, meta: RepeatRegistryMeta, removeIndex: number, totalCount: number): any {
    if (!snapshot || typeof snapshot !== 'object') return snapshot;
    const out: any = { ...snapshot };

    for (const fieldId of (meta.fieldIds ?? [])) {
      for (let i = removeIndex; i < totalCount; i++) {
        const from = this.repeatControlName(meta.prefix, i + 1, fieldId);
        const to = this.repeatControlName(meta.prefix, i, fieldId);

        if (Object.prototype.hasOwnProperty.call(out, from)) out[to] = out[from];
        else delete out[to];
      }
      const last = this.repeatControlName(meta.prefix, totalCount, fieldId);
      delete out[last];
    }
    return out;
  }

  // ============================================================
  // Dropdown pipeline
  // ============================================================

  private isAuthOwnerField(f: any): boolean {
    const id = String((f as any)?._rawId ?? (f as any)?.id ?? (f as any)?.controlName ?? '').toLowerCase();
    const name = String((f as any)?.displayName ?? (f as any)?.label ?? '').toLowerCase();

    // template field id provided in JSON: authActualOwner
    if (id === 'authactualowner' || id.includes('authactualowner')) return true;

    // fallback: display label/name is literally "Owner"
    return name === 'owner' || name === 'auth owner';
  }

  private applyAuthOwnerOptions(): void {
    if (!this.authOwnerOptions?.length) return;
    if (!this.renderSections?.length) return;

    const allFields = this.collectAllRenderFields(this.renderSections);
    for (const f of allFields) {
      if (f.type === 'select' && this.isAuthOwnerField(f)) {
        this.optionsByControlName[f.controlName] = this.authOwnerOptions;
        this.reconcileSelectControlValue(f.controlName);
      }
    }

    // If this is a new auth (or owner not set yet), default owner to logged-in user
    this.setDefaultAuthOwnerIfEmpty();
  }

  private setDefaultAuthOwnerIfEmpty(): void {
    if (!this.loggedInUserId || this.loggedInUserId <= 0) return;
    if (!this.renderSections?.length) return;

    const allFields = this.collectAllRenderFields(this.renderSections);
    const ownerField = allFields.find(f => f.type === 'select' && this.isAuthOwnerField(f));
    if (!ownerField) return;

    const ctrl = this.form?.get(ownerField.controlName);
    if (!ctrl) return;

    const cur = this.unwrapValue(ctrl.value);
    if (cur === null || cur === undefined || String(cur).trim() === '' || Number(cur) === 0) {
      // Don't override when editing an existing auth that already has an owner
      ctrl.setValue(this.loggedInUserId, { emitEvent: false });
    }
  }

  loadAllUsers(): void {
    if (this.usersLoaded) {
      this.applyAuthOwnerOptions();
      return;
    }

    this.userService.getAllUsers().subscribe({
      next: (users: any[]) => {
        this.allUsers = users || [];
        this.usersLoaded = true;

        this.authOwnerOptions = this.allUsers.map(u => ({
          value: u.userId,
          label: u.userName
        })) as UiSmartOption[];

        this.applyAuthOwnerOptions();
      },
      error: (err) => {
        console.error('Failed to load users:', err);
        this.usersLoaded = false;
      }
    });
  }

  // ============================================================
  // Work Group / Work List dropdowns (from WorkbasketService)
  // ============================================================
  loadWorkBasket(): void {
    if (this.workBasketLoaded) {
      this.applyWorkGroupAndBasketOptions();
      return;
    }

    const uid = Number(sessionStorage.getItem('loggedInUserid')) || 0;
    this.wbService.getByUserId(uid).subscribe({
      next: (res: any) => {
        this.workBasketLoaded = true;

        if (!Array.isArray(res)) {
          console.warn('wbService.getByUserId did not return an array', res);
          this.workBasketOptions = [];
          this.workGroupOptions = [];
          this.applyWorkGroupAndBasketOptions();
          return;
        }

        const distinctWB = res.filter(
          (item: any, index: number, self: any[]) =>
            index === self.findIndex((t: any) => t.workBasketId === item.workBasketId)
        );

        const distinctWG = res.filter(
          (item: any, index: number, self: any[]) =>
            index === self.findIndex((t: any) => t.workGroupId === item.workGroupId)
        );

        // Work Lists (Work Baskets) – use workGroupWorkBasketId if available
        this.workBasketOptions = distinctWB
          .filter((r: any) => r.activeFlag !== false)
          .map((r: any) => ({
            value: Number(r.workGroupWorkBasketId ?? r.workBasketId),
            label: r.workBasketName || r.workBasketCode || `WB #${r.workBasketId}`
          }))
          .filter((o: any) => !isNaN(o.value));

        // Work Groups
        this.workGroupOptions = distinctWG
          .filter((r: any) => r.activeFlag !== false)
          .map((r: any) => ({
            value: Number(r.workGroupId),
            label: r.workGroupName || r.workGroupCode || `WG #${r.workGroupId}`
          }))
          .filter((o: any) => !isNaN(o.value));
        console.log('Loaded work basket options:', this.workGroupOptions);
        this.applyWorkGroupAndBasketOptions();
      },
      error: (err: any) => {
        console.error('Error fetching user workgroups/workbaskets', err);
        this.workBasketLoaded = false;
        this.workBasketOptions = [];
        this.workGroupOptions = [];
        this.applyWorkGroupAndBasketOptions();
      }
    });
  }

  private isWorkGroupField(f: any): boolean {
    const id = String((f as any)?._rawId ?? (f as any)?.id ?? (f as any)?.controlName ?? '').toLowerCase();
    const name = String((f as any)?.displayName ?? (f as any)?.label ?? '').toLowerCase();
    const lookupEntity = String((f as any)?.lookup?.entity ?? (f as any)?.lookupEntity ?? '').toLowerCase();

    if (lookupEntity.includes('workgroup')) return true;
    return id.includes('workgroup') || name.includes('work group');
  }

  /** Treat "work list" as work basket in UI */
  private isWorkBasketField(f: any): boolean {
    const id = String((f as any)?._rawId ?? (f as any)?.id ?? (f as any)?.controlName ?? '').toLowerCase();
    const name = String((f as any)?.displayName ?? (f as any)?.label ?? '').toLowerCase();
    const lookupEntity = String((f as any)?.lookup?.entity ?? (f as any)?.lookupEntity ?? '').toLowerCase();

    if (lookupEntity.includes('workbasket')) return true;

    // support both "work basket" and "work list" wording
    return (
      id.includes('workbasket') ||
      id.includes('work_basket') ||
      id.includes('worklist') ||
      name.includes('work basket') ||
      name.includes('work list')
    );
  }

  private applyWorkGroupAndBasketOptions(): void {
    if (!this.renderSections?.length) return;

    const wbOpts = this.workBasketOptions ?? [];
    const wgOpts = this.workGroupOptions ?? [];

    const allFields = this.collectAllRenderFields(this.renderSections);
    for (const f of allFields) {
      if ((f as any).type !== 'select') continue;
      if (this.isWorkBasketField(f) && wbOpts.length) {
        this.optionsByControlName[f.controlName] = wbOpts;
        this.reconcileSelectControlValue(f.controlName);
      }
      if (this.isWorkGroupField(f) && wgOpts.length) {
        this.optionsByControlName[f.controlName] = wgOpts;
        this.reconcileSelectControlValue(f.controlName);
      }
    }
  }

  getDropdownOptions(controlName: string): UiSmartOption[] {
    const all = this.optionsByControlName[controlName] ?? [];
    return this.filterDependentOptions(controlName, all);
  }

  private prefetchDropdownOptions(sections: RenderSection[]): void {
    const allFields = this.collectAllRenderFields(sections);

    // 1) static options (select + button types)
    for (const f of allFields) {
      const hasDs = !!String((f as any).datasource ?? '').trim();
      if ((f.type === 'select' || this.isButtonType(f.type)) && !hasDs) {
        const staticOpts = this.mapStaticOptions((f as any).options);
        if (staticOpts.length) {
          this.optionsByControlName[f.controlName] = staticOpts;
          this.reconcileSelectControlValue(f.controlName);
        }
      }
    }

    // 2) datasource options (select + button types)
    const selects = allFields.filter((f: any) => (f.type === 'select' || this.isButtonType(f.type)) && !!f.datasource);
    const byDatasource = new Map<string, RenderField[]>();

    for (const f of selects) {
      const ds = String((f as any).datasource ?? '').trim();
      if (!ds) continue;
      const list = byDatasource.get(ds) ?? [];
      list.push(f);
      byDatasource.set(ds, list);
    }

    for (const [ds, fields] of byDatasource.entries()) {
      this.dsLookup
        .getOptionsWithFallback(
          ds,
          (r: any) => {
            const dsKey = ds ? this.toCamelCase(ds) : '';
            const value = r?.value ?? r?.id ?? r?.code;

            // Prefer meaningful display fields (some datasources don't use `name/text`)
            const specialLabel = this.getDatasourcePreferredLabel(ds, r);
            const label =
              specialLabel ??
              r?.text ??
              r?.name ??
              r?.description ??
              (dsKey
                ? (r?.[dsKey] ??
                  r?.[dsKey.charAt(0).toUpperCase() + dsKey.slice(1)] ??
                  r?.[ds])
                : null) ??
              this.pickDisplayField(r) ??
              String(value ?? '');

            return { value, label, raw: r } as any;
          },
          ['UM', 'Admin', 'Provider']
        )
        .pipe(takeUntil(this.destroy$))
        .subscribe((opts: UiSmartOption[] | null) => {
          for (const f of fields) {
            const hasStatic = Array.isArray((f as any).options) && (((f as any).options?.length ?? 0) > 0);

            // guard: if field has selectedOptions (non-bool) and datasource returns Yes/No, hide
            if (!hasStatic && this.hasNonBooleanSelectedOptions(f) && this.looksLikeYesNo(opts)) {
              this.optionsByControlName[f.controlName] = [];
              continue;
            }
            this.optionsByControlName[f.controlName] = opts ?? [];
            this.reconcileSelectControlValue(f.controlName);
          }

          for (const f of fields) this.updateDependentChild(f.controlName);
        });
    }
  }

  private setupDependentDropdowns(sections: RenderSection[]): void {
    this.dependentDropdowns = {};

    const allFields = this.collectAllRenderFields(sections);
    const dsToControls = new Map<string, string[]>();

    for (const f of allFields) {
      if (!(f.type === 'select' || this.isButtonType(f.type))) continue;
      const ds = String((f as any).datasource ?? '').trim();
      if (!ds) continue;

      const key = this.normDs(ds);
      const list = dsToControls.get(key) ?? [];
      list.push(f.controlName);
      dsToControls.set(key, list);
    }

    for (const rule of this.dependentDatasourceRules) {
      const parentControls = dsToControls.get(this.normDs(rule.parent)) ?? [];
      const childControls = dsToControls.get(this.normDs(rule.child)) ?? [];

      const parentControlName = parentControls[0];
      if (!parentControlName || childControls.length === 0) continue;

      for (const childControlName of childControls) {
        this.dependentDropdowns[childControlName] = {
          parentControlName,
          linkProp: rule.linkProp
        };

        const parentCtrl = this.form.get(parentControlName);
        if (parentCtrl) {
          parentCtrl.valueChanges
            .pipe(distinctUntilChanged(), takeUntil(this.destroy$))
            .subscribe(() => this.updateDependentChild(childControlName));
        }

        this.updateDependentChild(childControlName);
      }
    }
  }

  private filterDependentOptions(controlName: string, all: UiSmartOption[]): UiSmartOption[] {
    const dep = this.dependentDropdowns[controlName];
    if (!dep) return all ?? [];

    const pv = String(this.unwrapValue(this.form.get(dep.parentControlName)?.value) ?? '').trim();
    if (!pv) return [];

    return (all ?? []).filter(o => {
      const raw = (o as any)?.raw;
      const linkVal = raw?.[dep.linkProp];
      const ids = this.asIdArray(linkVal);
      return ids.includes(pv);
    });
  }

  private updateDependentChild(childControlName: string): void {
    const dep = this.dependentDropdowns[childControlName];
    if (!dep) return;

    const parentCtrl = this.form.get(dep.parentControlName);
    const childCtrl = this.form.get(childControlName);
    if (!parentCtrl || !childCtrl) return;

    const parentVal = String(this.unwrapValue(parentCtrl.value) ?? '').trim();

    if (!parentVal) {
      if (!childCtrl.disabled) childCtrl.disable({ emitEvent: false });
      if (String(childCtrl.value ?? '').trim()) childCtrl.setValue(null, { emitEvent: false });
      return;
    }

    if (childCtrl.disabled) childCtrl.enable({ emitEvent: false });

    const all = this.optionsByControlName[childControlName] ?? [];
    const filtered = this.filterDependentOptions(childControlName, all);
    const allowed = new Set(filtered.map(x => String((x as any).value)));

    const cv = String(this.unwrapValue(childCtrl.value) ?? '').trim();
    if (cv && !allowed.has(cv)) childCtrl.setValue(null, { emitEvent: false });
  }

  // ============================================================
  // Lookup (ui-smart-lookup) helpers + handlers
  // ============================================================
  private getLookupCfg(f: any): any {
    return (f as any)?.lookup ?? null;
  }

  getLookupPlaceholder(f: any): string {
    const cfg = this.getLookupCfg(f);
    return (cfg?.placeholder || f?.info || f?.label || 'Search...')?.toString();
  }

  getLookupMinChars(f: any): number {
    const cfg = this.getLookupCfg(f);
    const n = Number(cfg?.minChars ?? 2);
    return Number.isFinite(n) ? n : 2;
  }

  getLookupDebounceMs(f: any): number {
    const cfg = this.getLookupCfg(f);
    const n = Number(cfg?.debounceMs ?? 250);
    return Number.isFinite(n) ? n : 250;
  }

  getLookupLimit(f: any): number {
    const cfg = this.getLookupCfg(f);
    const n = Number(cfg?.limit ?? 25);
    return Number.isFinite(n) ? n : 25;
  }

  private getLookupEntity(f: any): string | null {
    const cfg = this.getLookupCfg(f);
    const raw = (cfg?.entity || cfg?.datasource || f?.datasource || f?.lookupEntity || f?.id || '').toString();
    const k = raw.trim().toLowerCase();
    if (!k) return null;
    if (k.includes('icd')) return 'icd';
    if ((k.includes('medical') && k.includes('code')) || k.includes('cpt')) return 'medicalcodes';
    if (k.includes('member')) return 'members';
    if (k.includes('provider')) return 'providers';
    if (k.includes('claim')) return 'claims';
    if (k.includes('medication')) return 'medication';
    if (k.includes('staff') || k.includes('user')) return 'staff';
    return k;
  }

  getLookupSearchFn(f: any): (q: string, limit: number) => Observable<any[]> {
    const key = (f?.controlName || f?.id || '').toString();
    const cached = this.lookupSearchFnCache.get(key);
    if (cached) return cached;

    const cfg = this.getLookupCfg(f);

    // Allow template to inject a custom search function
    if (typeof cfg?.searchFn === 'function') {
      const fn = cfg.searchFn.bind(cfg);
      this.lookupSearchFnCache.set(key, fn);
      return fn;
    }

    const entity = this.getLookupEntity(f);
    const svc: any = this.authService as any;

    const fn = (q: string, limit: number): Observable<any[]> => {
      if (!entity) return of([]);

      switch (entity) {
        case 'icd':
          return svc.searchIcd ? svc.searchIcd(q, limit) : of([]);

        case 'medicalcodes':
          return svc.searchMedicalCodes ? svc.searchMedicalCodes(q, limit) : of([]);

        case 'members':
          return svc.searchMembers ? svc.searchMembers(q, limit) : of([]);

        case 'providers':
          return svc.searchProviders ? svc.searchProviders(q, limit) : of([]);

        case 'claims':
        case 'claim':
          return svc.searchClaims ? svc.searchClaims(q, limit) : of([]);

        case 'medication':
          // support both method names seen across modules
          return svc.searchMedications
            ? svc.searchMedications(q, limit)
            : (svc.searchMedication ? svc.searchMedication(q, limit) : of([]));

        case 'staff':
          return svc.searchStaff ? svc.searchStaff(q, limit) : of([]);

        default:
          // Optional: template can specify the exact service method name to call
          const method = cfg?.serviceMethod ? String(cfg.serviceMethod) : null;
          const callable = method && typeof (svc as any)[method] === 'function' ? (svc as any)[method] : null;
          if (callable) return callable.call(svc, q, limit);

          // Fallback to generic lookup if available
          return svc.searchLookup ? svc.searchLookup(entity, q, limit) : of([]);
      }
    };

    this.lookupSearchFnCache.set(key, fn);
    return fn;
  }

  getLookupDisplayWith(f: any): (item: any) => string {
    const key = (f?.controlName || f?.id || Math.random().toString()).toString();
    const cached = this.lookupDisplayFnCache.get(key);
    if (cached) return cached;

    const cfg = this.getLookupCfg(f);
    const tpl = cfg?.displayTemplate ? String(cfg.displayTemplate) : null;
    const displayField = cfg?.displayField ? String(cfg.displayField) : null;
    const valueField = cfg?.valueField ? String(cfg.valueField) : null;
    const entity = this.getLookupEntity(f);

    const fn = (item: any): string => {
      if (item == null) return '';

      // If the control stores a primitive (ID or display text), render safely.
      if (typeof item !== 'object') {
        const selected = this.lookupSelectedByControl?.[f?.controlName];
        if (selected && valueField) {
          const selectedId = this.pickPath(selected, valueField);
          if (String(selectedId ?? '') === String(item ?? '')) {
            item = selected; // swap to full object for formatting below
          }
        }

        // Still primitive after attempting to swap:
        if (typeof item !== 'object') {
          // If valueField isn't configured, we stored display text in the control.
          if (!valueField) return String(item ?? '');
          // If valueField is configured, control likely stores an ID. Don't show raw IDs.
          return '';
        }
      }

      // item is an object now
      if (tpl) return this.applyLookupTemplate(tpl, item);

      // Prefer explicit displayField when provided
      if (displayField) {
        const v = this.pickPath(item, displayField);
        if (v != null && String(v).trim()) return String(v);
      }

      // Parity with CaseDetails: sensible defaults by entity
      if (entity === 'icd' || entity === 'medicalcodes' || entity === 'medication') {
        const code = item.code ?? item.Code ?? item.icdcode ?? item.cptcode ?? item.cptCode ?? '';
        const desc = item.codeDesc ?? item.codedescription ?? item.description ?? item.desc ?? '';
        return [code, desc].filter(Boolean).join(' - ');
      }

      if (entity === 'members') {
        const memberId = item.memberid ?? item.memberId ?? item.id ?? '';
        const name = [item.firstname ?? item.firstName ?? '', item.lastname ?? item.lastName ?? ''].filter(Boolean).join(' ');
        const phone = item.phone ?? item.phonenumber ?? item.phoneNumber ?? '';
        const parts = [memberId, name].filter(Boolean);
        return phone ? `${parts.join(' - ')} (${phone})` : parts.join(' - ');
      }

      if (entity === 'providers') {
        const display = (
          item.providerName ??
          item.organizationname ??
          item.organizationName ??
          item.name ??
          [item.lastName ?? item.lastname ?? '', item.firstName ?? item.firstname ?? ''].filter(Boolean).join(', ')
        );
        const npi = item.npi ?? item.NPI ?? '';
        return npi ? `${display} (NPI: ${npi})` : String(display ?? '');
      }

      if (entity === 'staff') {
        const uname = item.username ?? item.userName ?? '';
        const name = item.fullName ?? [item.firstname ?? item.firstName ?? '', item.lastname ?? item.lastName ?? ''].filter(Boolean).join(' ');
        const role = item.role ? ` (${item.role})` : '';
        return name ? `${uname} - ${name}${role}` : String(uname ?? '');
      }

      if (entity === 'claim' || entity === 'claims') {
        const code = item.claimNumber ?? item.claimnumber ?? item.claimNo ?? '';
        const df = item.dos_from ?? item.dosFrom ?? '';
        const dt = item.dos_to ?? item.dosTo ?? '';
        const datePart = (df || dt) ? ` (${df}${dt ? ' - ' + dt : ''})` : '';
        return code ? `${code}${datePart}` : String(item.display ?? item.label ?? '');
      }

      return (item.display ?? item.label ?? item.name ?? item.text ?? item.code ?? '').toString();
    };

    this.lookupDisplayFnCache.set(key, fn);
    return fn;
  }


  getLookupTrackBy(f: any): (item: any) => any {
    const key = (f?.controlName || f?.id || Math.random().toString()).toString();
    const cached = this.lookupTrackByFnCache.get(key);
    if (cached) return cached;

    const cfg = this.getLookupCfg(f);
    const valueField = cfg?.valueField ? String(cfg.valueField) : null;
    const path = cfg?.trackByPath ? String(cfg.trackByPath) : null;

    const fn = (item: any): any => {
      if (item == null) return item;
      if (typeof item !== 'object') return item;
      if (path) return this.pickPath(item, path);
      if (valueField) return this.pickPath(item, valueField);
      return (
        item.id ??
        item.userdetailid ??
        item.providerId ??
        item.memberclaimheaderid ??
        item.memberdetailsid ??
        item.memberDetailsId ??
        item.code ??
        item.npi ??
        item.value ??
        item
      );
    };

    this.lookupTrackByFnCache.set(key, fn);
    return fn;
  }

  onLookupSelected(f: any, item: any): void {
    if (!f) return;

    const cfg = this.getLookupCfg(f);
    const valueField = cfg?.valueField ? String(cfg.valueField) : null;

    // Cache the full object so displayWith can render correctly even when the control stores a primitive.
    if (f?.controlName) {
      this.lookupSelectedByControl[f.controlName] = item;
    }

    const ctrl = this.form.get(f.controlName);
    if (ctrl) {
      // Match CaseDetails behavior:
      // - if valueField is provided, store that primitive in the control
      // - otherwise store the display string (so the input does not show an id)
      const storeValue = valueField ? this.pickPath(item, valueField) : this.getLookupDisplayWith(f)(item);
      ctrl.setValue(storeValue ?? null, { emitEvent: true });
      ctrl.markAsDirty();
    }

    const fill = (cfg?.fill && Array.isArray(cfg.fill)) ? cfg.fill : this.defaultLookupFill(f);
    for (const m of fill) {
      const targetId = m?.targetFieldId;
      const sourcePath = m?.sourcePath;
      if (!targetId || !sourcePath) continue;

      // Resolve in the same repeat instance when applicable (provider1_xxx -> provider1_targetField)
      const targetControlName = this.resolveReferenceControlName(f, String(targetId));
      if (!targetControlName) continue;

      const tctrl = this.form.get(targetControlName);
      if (tctrl) {
        tctrl.setValue(this.pickPath(item, String(sourcePath)) ?? null, { emitEvent: true });
        tctrl.markAsDirty();
      }
    }

    // Filling lookup targets can affect visibility/enablement rules.
    this.syncVisibility();
  }

  onLookupTextChange(f: any, _text: string): void {


    const cfg = this.getLookupCfg(f);
    if (cfg?.clearOnTextChange === true) {
      delete this.lookupSelectedByControl[f.controlName];
    }
  }

  onLookupCleared(f: any): void {
    const cfg = this.getLookupCfg(f);
    const fill = (cfg?.fill && Array.isArray(cfg.fill)) ? cfg.fill : this.defaultLookupFill(f);

    delete this.lookupSelectedByControl[f.controlName];

    const ctrl = this.form.get(f.controlName);
    if (ctrl) {
      ctrl.setValue(null, { emitEvent: true });
      ctrl.markAsDirty();
    }

    // Clear filled target fields too (matches CaseDetails behavior)
    for (const m of fill) {
      const targetId = m?.targetFieldId;
      if (!targetId) continue;

      const targetControlName = this.resolveReferenceControlName(f, String(targetId));
      if (!targetControlName) continue;

      const tctrl = this.form.get(targetControlName);
      if (tctrl) {
        tctrl.setValue(null, { emitEvent: true });
        tctrl.markAsDirty();
      }
    }

    this.syncVisibility();
  }

  private defaultLookupFill(f: any): Array<{ targetFieldId: string; sourcePath: string }> {
    const rawId = String((f as any)?._rawId ?? f?.id ?? '').toLowerCase();
    const name = String(f?.displayName ?? f?.label ?? '').toLowerCase();
    const key = `${rawId} ${name}`;

    // Sensible fallbacks when template does not provide lookup.fill.
    if (key.includes('icd') && key.includes('search')) {
      return [
        { targetFieldId: 'icdCode', sourcePath: 'code' },
        { targetFieldId: 'icdDescription', sourcePath: 'codeDesc' }
      ];
    }

    if (key.includes('member') && key.includes('search')) {
      return [
        { targetFieldId: 'memberFirstName', sourcePath: 'firstname' },
        { targetFieldId: 'memberLastName', sourcePath: 'lastname' },
        { targetFieldId: 'memberPhone', sourcePath: 'phone' }
      ];
    }

    if (key.includes('provider') && key.includes('search')) {
      return [
        { targetFieldId: 'providerName', sourcePath: 'providerName' },
        { targetFieldId: 'providerNpi', sourcePath: 'npi' }
      ];
    }

    return [];
  }

  private pickPath(obj: any, path: string): any {
    if (!obj || !path) return null;
    const parts = path.split('.').map(p => p.trim()).filter(Boolean);
    let cur = obj;
    for (const p of parts) {
      cur = cur?.[p];
      if (cur == null) break;
    }
    return cur;
  }

  private applyLookupTemplate(tpl: string, item: any): string {
    return String(tpl).replace(/\{\{\s*([^}]+)\s*\}\}/g, (_m: string, p1: string) => {
      const v = this.pickPath(item, String(p1).trim());
      return v == null ? '' : String(v);
    });
  }

  private async seedDecisionAfterSave(authDetailId: number, mergedAuthData: any, userId: number, authTypeIdFallback?: number): Promise<void> {
    const authTemplateId = Number(this.templateId ?? authTypeIdFallback ?? 0);
    if (!authDetailId || !authTemplateId) return;

    try {
      await this.decisionSeed.ensureSeeded({
        authDetailId,
        authTemplateId,
        authData: mergedAuthData ?? {},
        userId
      });
    } catch (e) {
      console.error('Decision seeding failed', e);
    }
  }


  // ============================================================
  // Auth Due Date calculation (mirrors AuthSmartCheck)
  // ============================================================

  private buildAuthDueDateFacts(): any {
    // Keep keys aligned with the AUTH_DUE_DATE trigger decision table.
    // Prefer dynamic values when available; fall back to sensible defaults.
    const enrollment = this.memberEnrollments?.[Math.max(0, (this.selectedDiv || 1) - 1)] as any;

    const authClassId = Number(this.unwrapValue(this.form.get('authClassId')?.value) || 0);
    const authTypeId = Number(this.unwrapValue(this.form.get('authTypeId')?.value) || 0);

    const authClassLabel = this.authClassOptions?.find(o => Number(o.value) === authClassId)?.label ?? '';
    const authTypeLabel = this.authTypeOptions?.find(o => Number(o.value) === authTypeId)?.label ?? '';

    // Try to infer a program/enrollment label from enrollment payload
    let enrollmentLabel = '';
    try {
      const levelMap = this.safeParseJson((enrollment as any)?.levelMap) ?? (enrollment as any)?.levelMap ?? {};
      enrollmentLabel = String(
        (enrollment as any)?.Coverage_Program ??
        (enrollment as any)?.coverageProgram ??
        (levelMap?.Coverage_Program ?? levelMap?.coverageProgram ?? levelMap?.program ?? '')
      ).trim();
    } catch { /* ignore */ }


    return {
      enrollment: 'Medicare',
      authClass: authClassLabel || 'Inpatient',
      authType: authTypeLabel || 'Standard',
      anchorSource: 'Requested Datetime',
      requestType: (this.form.get('requestType')?.value ?? 'Prospective'),
      requestPriority: (this.form.get('requestPriority')?.value ?? 'Standard')
    };
  }

  private getRequestDateTimeIso(merged: any): string | null {
    const toIsoOrNull = (v: any): string | null => {
      if (!v) return null;
      const d = v instanceof Date ? v : new Date(v);
      return isNaN(d.getTime()) ? null : d.toISOString();
    };

    // 1) Direct "request" / "requested" keys (most explicit)
    const directKeys = [
      'requestedDateTime', 'requestedDatetime', 'requestDateTime', 'requestDatetime',
      'requestedDate', 'requestDate', 'requestedDt', 'requestDt'
    ];
    for (const k of directKeys) {
      const v = merged?.[k];
      const iso = toIsoOrNull(v);
      if (iso) return iso;
    }

    // 2) Look for a datetime-local field whose label/control suggests "requested"
    const allFields = this.collectAllRenderFields(this.renderSections || [])
      .filter(f => String((f as any)?.type || '').toLowerCase() === 'datetime-local');

    const requestedField = allFields.find(f => {
      const s = this.fieldSearchText(f);
      return (s.includes('request') || s.includes('requested')) && (s.includes('date') || s.includes('dt'));
    });

    if (requestedField?.controlName) {
      const iso = toIsoOrNull(merged?.[requestedField.controlName] ?? this.form.get(requestedField.controlName)?.value);
      if (iso) return iso;
    }

    // 3) Fall back to "Procedure From" datetime (SmartCheck uses scheduled/procedure date as anchor)
    const procFrom = allFields.find(f => this.isProcedureRelatedField(f) && this.isFromDateField(f));
    if (procFrom?.controlName) {
      const iso = toIsoOrNull(merged?.[procFrom.controlName] ?? this.form.get(procFrom.controlName)?.value);
      if (iso) return iso;
    }

    return null;
  }

  private async calculateAuthDueDateIso(requestDateIso: string | null): Promise<string | null> {
    const triggerKeyDue = 'AUTH_DUE_DATE';

    const anchorIso = requestDateIso;
    const anchor = anchorIso ? new Date(anchorIso) : null;
    if (!anchor || isNaN(anchor.getTime())) return null;

    try {
      const facts = this.buildAuthDueDateFacts();
      console.log('Calculating auth due date with facts:', facts);
      const res: ExecuteTriggerResponse = await firstValueFrom(
        this.rulesengineService.executeTrigger(triggerKeyDue, facts).pipe(
          catchError((e) => {
            console.error('AUTH_DUE_DATE trigger failed', e);
            return of(null as any);
          })
        )
      );

      const outputs: Record<string, any> = (res as any)?.outputs ?? {};
      const offsetValue = String(outputs['dt.result.OffsetValue'] ?? '').trim();
      const offsetUnit = String(outputs['dt.result.OffsetUnit'] ?? '').trim();
      const dayType = String(outputs['dt.result.DayType'] ?? '').trim();
      console.log('AUTH_DUE_DATE trigger outputs:', { offsetValue, offsetUnit, dayType });
      const computed = this.computeDueDate(anchor, offsetValue, offsetUnit, dayType);
      return computed ? computed.toISOString() : null;
    } catch (e) {
      console.error('Auth due date calculation failed', e);
      return null;
    }
  }

  private computeDueDate(anchor: Date, offsetValue: string, offsetUnit: string, dayType: string): Date | null {
    const n = parseInt(String(offsetValue ?? '').trim(), 10);
    if (!Number.isFinite(n)) return null;

    const unit = String(offsetUnit ?? '').trim().toLowerCase();
    const dtype = String(dayType ?? '').trim().toLowerCase();

    // Months/Years handled via Date setters; Days/Weeks handled as day increments.
    if (unit.startsWith('month')) {
      const d = new Date(anchor);
      d.setMonth(d.getMonth() + n);
      return d;
    }

    if (unit.startsWith('year')) {
      const d = new Date(anchor);
      d.setFullYear(d.getFullYear() + n);
      return d;
    }

    const days = unit.startsWith('week') ? n * 7 : n;

    if (dtype.startsWith('week')) {
      return this.addWeekdays(anchor, days);
    }

    return this.addCalendarDays(anchor, days);
  }

  private addCalendarDays(anchor: Date, days: number): Date {
    const d = new Date(anchor);
    d.setDate(d.getDate() + days);
    return d;
  }

  private addWeekdays(anchor: Date, days: number): Date {
    const d = new Date(anchor);
    const step = days >= 0 ? 1 : -1;
    let remaining = Math.abs(days);

    while (remaining > 0) {
      d.setDate(d.getDate() + step);
      const day = d.getDay(); // 0 Sun, 6 Sat
      if (day !== 0 && day !== 6) remaining--;
    }

    return d;
  }


  // ============================================================
  // Save (AuthDetails step)
  // ============================================================
  async save(): Promise<void> {
    if (!this.form) return;

    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    // Template validation (rules from getTemplateValidation), displayed per section like AuthorizationComponent
    const { failedErrors, failedWarnings, allMessages } = this.runTemplateValidation();

    if (allMessages.length > 0) {
      const allowContinue = failedErrors.length === 0;

      const dialogRef = this.dialog.open(ValidationErrorDialogComponent, {
        width: '600px',
        data: {
          title: 'Validation Results',
          messages: allMessages,
          allowContinue
        }
      });

      const result = await firstValueFrom(dialogRef.afterClosed());
      if (!(result === 'continue' && allowContinue)) {
        this.scrollToFirstValidationSection();
        return;
      }
    }

    const userId = Number(sessionStorage.getItem('loggedInUserid') || 0);

    const authClassId = Number(this.unwrapValue(this.form.get('authClassId')?.value) || 0);
    const authTypeId = Number(this.unwrapValue(this.form.get('authTypeId')?.value) || 0);

    const enrollment = this.memberEnrollments?.[Math.max(0, (this.selectedDiv || 1) - 1)];
    const memberEnrollmentId = Number(enrollment?.memberEnrollmentId || 0);

    const authDetailId = Number(this.pendingAuth?.authDetailId ?? this.pendingAuth?.id ?? 0);

    // Merge existing JSON data + current form step data
    const existingObj = this.safeParseJson(this.pendingAuth?.jsonData) ?? {};
    const stepObj = this.form.getRawValue();
    const merged: any = { ...(existingObj ?? {}), ...(stepObj ?? {}) };

    const jsonData = JSON.stringify(merged ?? {});
    const safeJsonData = jsonData && jsonData.trim() ? jsonData : '{}';

    // Helpers
    const pick = <T = any>(...keys: string[]): T | null => {
      // prefer merged (current form), then pendingAuth fallback
      for (const k of keys) {
        const v = merged?.[k];
        if (v !== undefined && v !== null && v !== '') return v as T;
      }
      for (const k of keys) {
        const v = (this.pendingAuth as any)?.[k];
        if (v !== undefined && v !== null && v !== '') return v as T;
      }
      return null;
    };

    const toIsoOrNull = (v: any): string | null => {
      if (!v) return null;
      const d = v instanceof Date ? v : new Date(v);
      return isNaN(d.getTime()) ? null : d.toISOString();
    };

    // Compute Auth Due Date via AUTH_DUE_DATE trigger (best-effort), anchored on requested datetime
    const requestDateIso = this.getRequestDateTimeIso(merged);
    const computedAuthDueIso = await this.calculateAuthDueDateIso(requestDateIso);
    if (computedAuthDueIso) {
      merged.authDueDate = computedAuthDueIso;
      merged.authduedate = computedAuthDueIso;
    }
    console.log('Computed Auth Due Date ISO:', computedAuthDueIso);
    // Backend-required-ish fields (based on your insert parameters)
    const authDueDate = toIsoOrNull(pick('authDueDate', 'authduedate'));
    const nextReviewDate = toIsoOrNull(pick('nextReviewDate', 'nextreviewdate'));
    const treatementType = pick<string>('treatementType', 'treatmentType'); // supports both spellings
    const authAssignedTo = pick<number>('authAssignedTo', 'authassignedto');
    const authStatus = pick<any>('authStatus', 'authstatus') ?? 'Draft';
    const wgwbIds = this.getSelectedWorkgroupWorkbasketIds();
    console.log('Saving auth with workgroup/workbasket IDs:', wgwbIds);
    // Build base payload used for both CREATE and UPDATE
    const payload: any = {
      authClassId,
      authTypeId,
      memberDetailsId: this.memberDetailsId,
      memberEnrollmentId,

      authDueDate,
      nextReviewDate,
      treatementType,
      authAssignedTo,
      authStatus,

      jsonData: safeJsonData,
      requestType: 'AUTH',
      workgroupWorkbasketId: wgwbIds.length ? wgwbIds[0] : null,
      workgroupWorkbasketIds: wgwbIds
    };

    try {
      this.isSaving = true;

      if (authDetailId > 0) {
        // UPDATE: do NOT regenerate authNumber
        payload.authNumber = this.authNumber === '0' ? null : this.authNumber;

        await firstValueFrom(this.authApi.update(authDetailId, payload, userId));
        this.form.markAsPristine();

        // Seed Decision Details rows (idempotent) after save
        await this.seedDecisionAfterSave(authDetailId, merged, userId, authTypeId);
      } else {
        // CREATE: generate authNumber ONLY here
        this.authNumber = this.authNumberService.generateAuthNumber(9, true, true, false, false);
        payload.authNumber = this.authNumber;

        const newId = await firstValueFrom(this.authApi.create(payload, userId));

        if (newId) {
          const fresh = await firstValueFrom(this.authApi.getById(Number(newId), false));
          this.pendingAuth = fresh as any;

          // Seed Decision Details rows (idempotent) right after create
          //const createdAuthDetailId = Number(
          //  (fresh as any)?.authDetailId ?? (fresh as any)?.AuthDetailId ?? (fresh as any)?.id ?? 0
          //);
          const createdAuthDetailId = Number((this.pendingAuth as any)?.authDetailId ?? (this.pendingAuth as any)?.id ?? 0);

          payload.authDueDate = computedAuthDueIso || toIsoOrNull(pick('authDueDate', 'authduedate'));

          // IMPORTANT: update shell context so header + decision step can load
          this.shell?.setContext({
            authNumber: String(this.authNumber),     // updates shell header
            isNewAuth: false,                        // removes NEW-only behavior
            authDetailId: createdAuthDetailId,       // required for Decision step
            authTemplateId: Number(this.templateId ?? authTypeId ?? 0),
            authClassId,
            authTypeId,
            memberDetailsId: this.memberDetailsId,
            memberEnrollmentId
          });

          // force re-hydrate header immediately (so Auth # updates without waiting on navigation)
          this.shell?.refreshHeader();

          await this.seedDecisionAfterSave(createdAuthDetailId, merged, userId, authTypeId);

          const newAuthNumber = (fresh as any)?.authNumber;
          if (newAuthNumber) this.authNumber = String(newAuthNumber);

          // keep shell + header in sync in case API returns a different authNumber than the locally-generated one
          this.shell?.setContext({ authNumber: String(this.authNumber) });
        }

        // Resolve memberId reliably (don’t depend only on tab metadata)
        const memberId = this.headerService.getMemberId(this.headerService.getSelectedTab() || '') || '';
        //const currentRoute = `/auth/0/details/${memberId}`;

        const urlTree = this.router.createUrlTree(
          ['/member-info', memberId, 'auth', this.authNumber, 'details']
        );

        const newRoute = this.router.serializeUrl(urlTree);

        const currentRoute = this.headerService.getSelectedTab() || this.router.url;

        this.headerService.updateTab(currentRoute, {
          label: `Auth # ${this.authNumber}`,
          route: newRoute,
          memberId: String(memberId),
        });

        this.skipNextResetOnNav = true;

        this.headerService.selectTab(newRoute);

        this.form.markAsPristine();


      }
    } catch (e: any) {
      // shows actual ModelState error response for 400
      console.error('Auth save failed', e?.status, e?.error ?? e);
    } finally {
      this.isSaving = false;
    }
  }


  // ============================================================
  // Template validation (same concept as AuthorizationComponent)
  // ============================================================

  /** DOM id used for scrolling to a section when validation fails */
  sectionDomId(sec: RenderSection): string {
    return `section-${this.safeKey(sec?.title ?? '')}`;
  }

  private scrollToFirstValidationSection(): void {
    const titles = Object.keys(this.sectionValidationMessages || {}).filter(t => (this.sectionValidationMessages[t]?.length ?? 0) > 0);
    if (!titles.length) return;

    const firstId = `section-${this.safeKey(titles[0])}`;
    const el = document.getElementById(firstId);
    if (!el) return;

    setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
  }

  // ============================================================
  // Template Validation: fetch + parse
  // ============================================================

  private parseValidationJson(raw: any): any[] {
    if (!raw) return [];

    // already array
    if (Array.isArray(raw)) return raw;

    // string -> parse (handles possible double-stringify)
    if (typeof raw === 'string') {
      const s = raw.trim();
      if (!s || s === 'null' || s === 'undefined') return [];

      const first = JSON.parse(s);
      if (Array.isArray(first)) return first;

      if (typeof first === 'string') {
        const second = JSON.parse(first);
        return Array.isArray(second) ? second : [];
      }
      return [];
    }

    return [];
  }

  getValidationRules(): void {
    if (!this.templateId) {
      this.validationRules = [];
      return;
    }

    console.log('Fetching template validation rules for templateId:', this.templateId);

    this.authService.getTemplateValidation(this.templateId).subscribe({
      next: (response: any) => {
        try {
          console.log('Received template validation response:', response);

          // Your payload uses `validationJson` (lowercase v).
          // Keep fallbacks for other envelopes/casing.
          const raw =
            response?.validationJson ??
            response?.ValidationJson ??
            response?.data?.validationJson ??
            response?.data?.ValidationJson ??
            response?.result?.validationJson ??
            response?.result?.ValidationJson ??
            null;

          this.validationRules = this.parseValidationJson(raw);

          console.log('Loaded validation rules:', this.validationRules);
        } catch (e) {
          console.error('Failed to parse validationJson:', e);
          this.validationRules = [];
        }
      },
      error: (err: any) => {
        console.error('Error fetching validation rules:', err);
        this.validationRules = [];
      }
    });
  }

  // ============================================================
  // Template Validation: run + display per section
  // ============================================================

  private runTemplateValidation(): {
    failedErrors: any[];
    failedWarnings: any[];
    allMessages: Array<{ msg: string; type: 'error' | 'warning' }>;
  } {
    this.sectionValidationMessages = {};

    const failedErrors: any[] = [];
    const failedWarnings: any[] = [];
    const allMessages: Array<{ msg: string; type: 'error' | 'warning' }> = [];

    const rules = (this.validationRules || []).filter(r => r?.enabled);
    if (!rules.length) return { failedErrors, failedWarnings, allMessages };

    // Build flat values using your existing renderSections + form
    const flatValues: any = {};
    const allFields = this.collectAllRenderFields(this.renderSections);

    for (const f of allFields) {
      const rawId = String((f as any)?._rawId ?? '').trim();
      if (!rawId) continue;

      const ctrl = this.form?.get((f as any).controlName);
      if (!ctrl) continue;

      const v = this.unwrapValue(ctrl.value);
      if (
        flatValues[rawId] === undefined ||
        flatValues[rawId] === null ||
        flatValues[rawId] === ''
      ) {
        flatValues[rawId] = v;
      }
    }

    // Map section -> set of raw field ids (for section-level message display)
    const sectionIdSets = (this.renderSections || []).map((sec: any) => {
      const ids = new Set<string>();
      const fields = this.collectAllRenderFields([sec]);
      for (const f of fields) {
        const rawId = String((f as any)?._rawId ?? '').trim();
        if (rawId) ids.add(rawId);
      }
      return { sec, ids };
    });

    for (const rule of rules) {
      const dependsOn: string[] = Array.isArray(rule?.dependsOn)
        ? rule.dependsOn.map((x: any) => String(x))
        : [];

      // ✅ Skip rule if any dependent field is empty (null/undefined/''/empty array)
      const hasMissingDependsOn =
        dependsOn.length > 0 &&
        dependsOn.some(dep => {
          const v = flatValues[dep];
          return (
            v === null ||
            v === undefined ||
            v === '' ||
            (Array.isArray(v) && v.length === 0)
          );
        });

      if (hasMissingDependsOn) continue;

      const ok = this.evaluateExpression(rule, flatValues);
      if (ok) continue;

      const isError = !!rule.isError;
      const message = String(rule?.errorMessage ?? 'Validation failed.');

      // Attach message to every section that contains at least one dependent field
      for (const { sec, ids } of sectionIdSets) {
        const hit = dependsOn.some(dep => ids.has(String(dep)));
        if (!hit) continue;

        const key = sec.title;
        if (!this.sectionValidationMessages[key]) this.sectionValidationMessages[key] = [];
        this.sectionValidationMessages[key].push(message);
      }

      if (isError) failedErrors.push(rule);
      else failedWarnings.push(rule);

      allMessages.push({
        msg: isError ? `❌ ${message}` : `⚠️ ${message}`,
        type: isError ? 'error' : 'warning'
      });
    }

    return { failedErrors, failedWarnings, allMessages };
  }



  // ============================================================
  // Expression Evaluator (AM/PM dates + IF syntax support)
  // ============================================================

  private parseUsDateTimeToDate(val: string): Date | null {
    // Matches: "01/20/2026 09:10:21 PM" or without seconds
    const m = val.trim().match(
      /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i
    );
    if (!m) return null;

    const month = Number(m[1]);
    const day = Number(m[2]);
    const year = Number(m[3]);
    let hour = Number(m[4]);
    const minute = Number(m[5]);
    const second = m[6] ? Number(m[6]) : 0;
    const ampm = (m[7] || '').toUpperCase();

    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;

    const d = new Date(year, month - 1, day, hour, minute, second, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  private normalizeForExpression(val: any): any {
    if (val === undefined || val === null || val === '') return null;

    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;

    if (typeof val === 'number' || typeof val === 'boolean') return val;

    if (typeof val === 'string') {
      const s = val.trim();
      if (!s) return null;

      // US datetime with AM/PM (your UI format)
      const us = this.parseUsDateTimeToDate(s);
      if (us) return us;

      // ISO or other parseable string
      const t = Date.parse(s);
      if (!isNaN(t)) return new Date(t);

      // numeric string
      if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);

      return s;
    }

    return val;
  }

  private evaluateExpression(rule: any, values: any): boolean {
    let expression: string = String(rule?.expression ?? '').trim();
    const dependsOn: string[] = Array.isArray(rule?.dependsOn) ? rule.dependsOn : [];

    if (!expression) return true;

    // Handle special "IF ..." syntax from your rules:
    // "IF condition" means: rule FAILS when condition is true.
    // So we evaluate `condition` and then invert.
    const isIf = /^IF\s+/i.test(expression);
    if (isIf) expression = expression.replace(/^IF\s+/i, '').trim();

    try {
      const context: any = {};
      const localDependsOn: string[] = [...dependsOn];

      // Support `now` and `createdDateTime` if expression mentions them
      if (expression.includes('now') && !localDependsOn.includes('now')) localDependsOn.push('now');
      if (expression.includes('createdDateTime') && !localDependsOn.includes('createdDateTime')) {
        localDependsOn.push('createdDateTime');
      }

      // Build context values
      for (const key of localDependsOn) {
        let raw: any = values?.[key];

        // fallback: try pulling directly from form if not found in flat values
        if ((raw === undefined || raw === null || raw === '') && key) {
          raw = this.getFieldValueByName(key);
        }

        // dynamic values
        if (key === 'now') raw = new Date();

        context[key] = this.normalizeForExpression(raw);
      }

      // Convert Date objects in context to epoch ms for consistent comparisons
      // (JS compares Date objects okay, but numeric ms avoids surprises)
      const paramNames: string[] = [];
      const paramValues: any[] = [];

      for (const k of localDependsOn) {
        paramNames.push(k);
        const v = context[k];
        if (v instanceof Date) paramValues.push(v.getTime());
        else paramValues.push(v);
      }

      // Also rewrite "fieldName" Date comparisons to work with ms params
      // We already pass ms for Date values, so expression can remain the same.

      // eslint-disable-next-line no-new-func
      const fn = new Function(...paramNames, `return (${expression});`);
      const result = !!fn(...paramValues);

      // IF-rules fail when condition is true
      return isIf ? !result : result;
    } catch (e) {
      console.error('Error evaluating expression:', e, rule);
      // Safer default: treat evaluation failure as PASS? (prevents blocking saves due to bad rule syntax)
      // If you prefer strict: return false;
      return true;
    }
  }


  // ============================================================
  // Helper (fixes TS2339 when referenced elsewhere)
  // ============================================================

  private getFieldValueByName(fieldId: string): any {
    if (!this.form || !fieldId) return null;

    const direct = this.form.get(fieldId);
    if (direct) return this.unwrapValue(direct.value);

    // If you have a safe control name helper in the component, use it.
    const safeName = (this as any).safeControlName ? (this as any).safeControlName(fieldId) : fieldId;
    const safe = this.form.get(safeName);
    if (safe) return this.unwrapValue(safe.value);

    // If you keep any mapping of rawId->controlName
    const mapped = (this as any).fieldIdToControlName?.get?.(fieldId);
    if (mapped) {
      const mappedCtrl = this.form.get(mapped);
      if (mappedCtrl) return this.unwrapValue(mappedCtrl.value);
    }

    return null;
  }


  // ============================================================
  // Bind + Patch existing auth
  // ============================================================

  private bindAuthorization(auth: any): void {
    // normalize payload key so rest of code works
    const normalized = {
      ...auth,
      jsonData: auth?.jsonData ?? auth?.dataJson ?? auth?.data ?? auth?.json
    };

    this.pendingAuth = normalized;

    // If API returns memberDetailsId, keep local state + session storage hydrated so enrollment loads on re-entry.
    const apiMemberDetailsId = Number((normalized as any)?.memberDetailsId ?? (normalized as any)?.MemberDetailsId ?? 0);
    if (apiMemberDetailsId && Number.isFinite(apiMemberDetailsId) && apiMemberDetailsId !== Number(this.memberDetailsId || 0)) {
      this.memberDetailsId = apiMemberDetailsId;
      try { sessionStorage.setItem('selectedMemberDetailsId', String(apiMemberDetailsId)); } catch { /* ignore */ }
      // Ensure enrollments are present (UI often gates rendering on enrollment selection)
      this.loadMemberEnrollment(apiMemberDetailsId);
    } else if (Number(this.memberDetailsId || 0) > 0 && !(this.memberEnrollments?.length)) {
      // If context set memberDetailsId after ngOnInit, load enrollments now.
      this.loadMemberEnrollment(Number(this.memberDetailsId));
    }

    // Select enrollment if list already loaded
    if (normalized.memberEnrollmentId && this.memberEnrollments?.length) {
      const idx = this.memberEnrollments.findIndex((e: any) => e.memberEnrollmentId === normalized.memberEnrollmentId);
      if (idx >= 0) this.selectEnrollment(idx);
    }

    // Trigger template chain
    const authClassId = Number(normalized.authClassId ?? 0);
    if (authClassId > 0) {
      this.form.get('authClassId')?.setValue(authClassId, { emitEvent: true });
    }
  }

  private patchAuthorizationToForm(auth: any): void {
    // Prefer jsonData payload (that’s what contains repeat keys like provider1_providerPhone)
    const obj = this.safeParseJson(auth?.jsonData ?? auth?.dataJson ?? auth?.data ?? auth?.json);
    if (obj && typeof obj === 'object') {
      this.form.patchValue(obj, { emitEvent: false });
      this.form.updateValueAndValidity({ emitEvent: false });
      return;
    }

    // fallback: try other shapes
    const values = auth?.fieldValues ?? auth?.fields ?? auth?.templateValues ?? auth?.dynamicValues ?? auth;
    if (!values || typeof values !== 'object') return;

    for (const key of Object.keys(values)) {
      const rawVal = (values as any)[key];
      if (this.form.get(key)) {
        this.form.get(key)!.setValue(rawVal, { emitEvent: false });
        continue;
      }
      const safe = this.safeControlName(key);
      if (this.form.get(safe)) {
        this.form.get(safe)!.setValue(rawVal, { emitEvent: false });
      }
    }

    this.form.updateValueAndValidity({ emitEvent: false });
  }

  private resetAuthScreenState(): void {
    this.pendingAuth = null;

    // Clear template
    this.templateId = null;
    this.renderSections = [];
    this.optionsByControlName = {};
    this.dependentDropdowns = {};
    this.authTemplatesRaw = [];
    this.authTypeOptions = [];

    // Reset repeat
    this.repeatCounts = {};
    this.repeatRegistry = {};
    this.normalizedTemplate = null;

    // Reset base form
    if (this.form) {
      this.form.reset({ authClassId: null, authTypeId: null }, { emitEvent: false });
      Object.keys(this.form.controls).forEach(k => {
        if (k !== 'authClassId' && k !== 'authTypeId') this.form.removeControl(k);
      });
    }

    // Enrollment selection state
    this.selectedDiv = 0;
    this.enrollmentSelect = false;
  }

  // ============================================================
  // UI helpers
  // ============================================================
  isFullRowField(f: any): boolean {
    return (f?.type || '').toString().toLowerCase() === 'search';
  }


  // ============================================================
  // Conditional visibility + isEnabled handling
  // ============================================================
  isVisible(f: any): boolean {
    return this.evalFieldVisibility(f);
  }

  private setupVisibilityWatcher(): void {
    // stop previous watcher for the current template
    this.templateDestroy$.next();

    // initial sync
    this.syncVisibility();

    // re-sync when any value changes
    this.form.valueChanges
      .pipe(takeUntil(this.templateDestroy$), takeUntil(this.destroy$))
      .subscribe(() => this.syncVisibility());
  }

  private syncVisibility(): void {
    if (!this.form || !this.renderSections?.length) return;
    if (this.visibilitySyncInProgress) return;

    this.visibilitySyncInProgress = true;
    try {
      const allFields = this.collectAllRenderFields(this.renderSections);
      for (const f of allFields) {
        if (!f?.controlName) continue;
        const ctrl = this.form.get(f.controlName);
        if (!ctrl) continue;

        const shouldShow = this.evalFieldVisibility(f);
        const enabledByTpl = (f as any)?.isEnabled !== false;

        // If hidden, keep disabled to avoid validation issues
        if (!shouldShow) {
          if (!ctrl.disabled) ctrl.disable({ emitEvent: false });
          continue;
        }

        // Visible: enable/disable based on isEnabled
        if (enabledByTpl) {
          if (ctrl.disabled) ctrl.enable({ emitEvent: false });
        } else {
          if (!ctrl.disabled) ctrl.disable({ emitEvent: false });
        }
      }

      // keep validators consistent
      this.form.updateValueAndValidity({ emitEvent: false });
    } finally {
      this.visibilitySyncInProgress = false;
    }
  }

  private evalFieldVisibility(field: any): boolean {
    if (!field) return true;

    const conds = Array.isArray(field.conditions) ? field.conditions.filter(Boolean) : [];
    if (conds.length > 0) return this.evalConditions(conds, field);

    const sw: ShowWhen = (field.showWhen ?? 'always');
    if (sw === 'always') return true;

    const refId = field.referenceFieldId ?? null;
    const v = field.visibilityValue ?? null;
    if (!refId) return true;

    return this.evalOne(sw, field, String(refId), v);
  }

  private evalConditions(conds: TplCondition[], fieldCtx: any): boolean {
    let result: boolean | null = null;

    for (const c of (conds || [])) {
      const sw: ShowWhen = (c?.showWhen ?? 'always');
      let current = true;

      if (sw !== 'always') {
        const refId = c?.referenceFieldId ?? null;
        current = refId ? this.evalOne(sw, fieldCtx, String(refId), c?.value) : true;
      }

      if (result === null) {
        result = current;
      } else {
        const op = String(c?.operatorWithPrev ?? 'AND').toUpperCase();
        result = op === 'OR' ? (result || current) : (result && current);
      }
    }

    return result ?? true;
  }

  private evalOne(showWhen: ShowWhen, fieldCtx: any, referenceFieldId: string, visibilityValue: any): boolean {
    const refCtrlName = this.resolveReferenceControlName(fieldCtx, referenceFieldId);
    const ctrl = refCtrlName ? this.form.get(refCtrlName) : null;
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

  private resolveReferenceControlName(fieldCtx: any, referenceFieldId: string): string | null {
    const refId = String(referenceFieldId ?? '').trim();
    if (!refId) return null;

    // direct (non-repeat)
    const direct = this.safeControlName(refId);
    if (this.form.get(direct)) return direct;

    // same repeat-instance (prefixN_field)
    const cur = String(fieldCtx?.controlName ?? '').trim();
    const m = cur.match(/^(.+?)(\d+)_/);
    if (m) {
      const prefix = m[1];
      const idx = m[2];
      const candidate = this.safeControlName(prefix + idx + '_' + refId);
      if (this.form.get(candidate)) return candidate;
    }

    const mapped = this.fieldIdToControlName.get(refId);
    if (mapped && this.form.get(mapped)) return mapped;

    return null;
  }

  // ============================================================
  // Generic helpers
  // ============================================================
  private safeParseJson(input: any): any | null {
    if (!input) return null;
    try { return typeof input === 'string' ? JSON.parse(input) : input; }
    catch { return null; }
  }

  private toRenderField(f: TplField, controlName: string): RenderField {
    return { ...(f as any), controlName, _rawId: f.id };
  }

  private safeControlName(id: string): string {
    return String(id ?? '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\w]/g, '_');
  }

  private safeKey(s: any): string {
    return String(s ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^\w]/g, '_');
  }

  private unwrapValue(val: any): any {
    if (val && typeof val === 'object') {
      if ('value' in val) return (val as any).value;
      if ('id' in val) return (val as any).id;
    }
    return val;
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
    const skip = new Set(['id', 'value', 'code', 'activeFlag', 'createdBy', 'createdOn', 'updatedBy', 'updatedOn', 'deletedBy', 'deletedOn']);
    for (const k of Object.keys(row)) {
      if (skip.has(k)) continue;
      const v = row[k];
      if (typeof v === 'string' && v.trim().length > 0) return v;
    }
    return null;
  }

  /**
   * Some datasources return display values in non-standard properties.
   * Add small targeted mappings here so dropdowns show text instead of ids.
   */
  private getDatasourcePreferredLabel(ds: string, row: any): string | null {
    const k = this.normDs(ds);
    if (!row) return null;

    // Auth Status Reason: UI was showing only ids
    if (k === 'authstatusreason' || k === 'authstatusreasons') {
      return (
        row?.authStatusReason ??
        row?.AuthStatusReason ??
        row?.statusReason ??
        row?.StatusReason ??
        row?.reasonName ??
        row?.ReasonName ??
        row?.reason ??
        row?.Reason ??
        null
      );
    }

    return null;
  }

  private mapStaticOptions(options: any[] | undefined): UiSmartOption[] {
    if (!Array.isArray(options)) return [];
    return options
      .filter(o => o !== null && o !== undefined && o !== '')
      .map(o => {
        if (typeof o === 'object') {
          const value = (o as any).value ?? (o as any).id ?? (o as any).code ?? (o as any).key ?? o;
          const label = (o as any).label ?? (o as any).text ?? (o as any).name ?? (o as any).description ?? String(value ?? '');
          return { value, label } as UiSmartOption;
        }
        return { value: o, label: String(o) } as UiSmartOption;
      });
  }

  private looksLikeYesNo(opts: UiSmartOption[] | null | undefined): boolean {
    if (!opts || opts.length !== 2) return false;
    const labels = opts.map(o => String((o as any)?.label ?? '').trim().toLowerCase());
    return labels.includes('yes') && labels.includes('no');
  }

  private hasNonBooleanSelectedOptions(field: any): boolean {
    const so = field?.selectedOptions;
    return Array.isArray(so) && so.length > 2;
  }

  private normDs(ds: string): string {
    return String(ds ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private asIdArray(v: any): string[] {
    if (Array.isArray(v)) return v.map(x => String(x)).filter(Boolean);
    const s = String(v ?? '').trim();
    return s ? [s] : [];
  }

  private clampInt(v: any, fallback: number, min: number, max: number): number {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
  }


  public onActionButtonClick(field: any): void {
    console.log('Button clicked:', field?.id, field);

    switch (field?.id) {
      case 'providerButton1':
        this.onPriorServicingProviderClick();
        break;

      case 'providerButton2':
        this.onLookupProviderClick();
        break;

      case 'providerButton3':
        this.onAddNewProviderClick();
        break;

      default:
        console.warn('No handler mapped for:', field?.id);
    }
  }

  public onPriorServicingProviderClick(): void {
    alert('Prior Servicing Provider clicked');
  }

  public onLookupProviderClick(): void {
    alert('Lookup Provider clicked');
  }

  public onAddNewProviderClick(): void {
    alert('Add New Provider clicked');
  }

  /**
 * Collect selected WorkgroupWorkbasketId(s) from the rendered template.
 * We treat "Work List" fields (work basket) as the source of WG/WB mapping ids.
 */
  private getSelectedWorkgroupWorkbasketIds(): number[] {
    if (!this.form || !this.renderSections?.length) return [];

    const out: number[] = [];

    const pushVal = (v: any) => {
      if (v == null || v === '') return;
      if (Array.isArray(v)) {
        for (const x of v) pushVal(x);
        return;
      }
      if (typeof v === 'object') {
        if ('value' in v) return pushVal((v as any).value);
        if ('id' in v) return pushVal((v as any).id);
      }
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) out.push(n);
    };

    const fields = this.collectAllRenderFields(this.renderSections)
      .filter((f: any) => String((f as any)?.type ?? '').toLowerCase() === 'select' && this.isWorkBasketField(f));

    for (const f of fields) {
      const ctrlName = String((f as any)?.controlName ?? '').trim();
      if (!ctrlName) continue;
      const ctrl = this.form.get(ctrlName);
      if (!ctrl) continue;
      pushVal(ctrl.value);
    }

    return Array.from(new Set(out));
  }


  private isUsDateTimeString(v: any): v is string {
    return typeof v === 'string'
      && /^\d{2}\/\d{2}\/\d{4}\s+\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)$/i.test(v.trim());
  }

  // Parses "MM/DD/YYYY hh:mm[:ss] AM/PM" into epoch ms
  private parseUsDateTimeToMs(s: string): number | null {
    const str = s.trim();
    const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if (!m) return null;

    let month = Number(m[1]);
    let day = Number(m[2]);
    let year = Number(m[3]);
    let hour = Number(m[4]);
    const minute = Number(m[5]);
    const second = m[6] ? Number(m[6]) : 0;
    const ampm = m[7].toUpperCase();

    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;

    // local time
    const d = new Date(year, month - 1, day, hour, minute, second, 0);
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  private normalizeValue(v: any): any {
    if (v == null || v === '') return null;

    // Date object
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getTime();

    // ISO string -> Date
    if (typeof v === 'string') {
      const t = v.trim();

      // US datetime like your UI
      if (this.isUsDateTimeString(t)) {
        const ms = this.parseUsDateTimeToMs(t);
        return ms ?? null;
      }

      // ISO-like
      const isoMs = Date.parse(t);
      if (!isNaN(isoMs)) return isoMs;

      // numeric string
      if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);

      return t; // keep as string
    }

    // number / boolean
    return v;
  }

  private evaluateRuleExpression(expression: string, ctx: Record<string, any>): boolean {
    if (!expression) return true;

    // Special syntax: "IF <cond>" means "invalid when cond is true"
    // So the rule PASSES when cond is false.
    const trimmed = expression.trim();
    const isIf = /^IF\s+/i.test(trimmed);
    const exprToEval = isIf ? trimmed.replace(/^IF\s+/i, '').trim() : trimmed;

    // Build a function with ctx keys as params
    const keys = Object.keys(ctx);
    const vals = keys.map(k => ctx[k]);

    let result: any;
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function(...keys, `return (${exprToEval});`);
      result = fn(...vals);
    } catch {
      // If expression can't be evaluated, treat as failed (safer)
      return false;
    }

    const ok = !!result;
    return isIf ? !ok : ok;
  }

  authHasUnsavedChanges(): boolean {
    return this.form?.dirty ?? false;
  }

  // Alias for CanDeactivate guards that expect a different method name
  hasPendingChanges(): boolean {
    return this.authHasUnsavedChanges();
  }

  // Alias for older naming
  hasUnsavedChanges(): boolean {
    return this.authHasUnsavedChanges();
  }

  /** Route-level indicator: true when editing an existing case (caseNumber present and not '0'). */
  private hasExistingAuthNumberInRoute(): boolean {
    const routeCase = String(this.authNumber ?? '').trim();
    return !!routeCase && routeCase !== '0';
  }

  get showAuthTypeFirstLoadHint(): boolean {
    if (this.hasExistingAuthNumberInRoute()) return false;
    return true;
  }

}
