import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { Observable, Subject, firstValueFrom, of } from 'rxjs';
import { distinctUntilChanged, filter, map, startWith, switchMap, takeUntil, tap } from 'rxjs/operators';
import { AuthNumberService } from 'src/app/service/auth-number-gen.service';
import { AuthService } from 'src/app/service/auth.service';
import { CrudService, DatasourceLookupService } from 'src/app/service/crud.service';
import { MemberenrollmentService } from 'src/app/service/memberenrollment.service';
import { AuthDetailApiService } from 'src/app/service/authdetailapi.service';
import { AuthenticateService } from 'src/app/service/authentication.service';

import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';

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
export class AuthdetailsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private templateDestroy$ = new Subject<void>();
  private visibilitySyncInProgress = false;

  form!: FormGroup;

  // route params
  authNumber = '0';
  memberId = 0;
  memberDetailsId = 0;
  private pendingAuth: any | null = null;

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

  // ---------- Users (Owner dropdown) ----------
  allUsers: any[] = [];
  usersLoaded = false;
  private authOwnerOptions: UiSmartOption[] = [];

  /** Default Owner (logged-in user) */
  private readonly loggedInUserId: number = Number(sessionStorage.getItem('loggedInUserid') || 0);

  // add cascading rules here if UM introduces dependencies
  private readonly dependentDatasourceRules: Array<{ child: string; parent: string; linkProp: string }> = [];

  // ---------- Lookup helpers ----------
  lookupSelectedByControl: Record<string, any> = {};
  private lookupSearchFnCache = new Map<string, (q: string, limit: number) => Observable<any[]>>();
  private lookupDisplayFnCache = new Map<string, (item: any) => string>();
  private lookupTrackByFnCache = new Map<string, (item: any) => any>();

  // ---------- Save ----------
  isSaving = false;

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
    private userService: AuthenticateService,
    private authNumberService: AuthNumberService,
  ) { }

  ngOnInit(): void {
    // Create form first (route subscription will call resetAuthScreenState)
    this.form = this.fb.group({
      authClassId: new FormControl(null, Validators.required),
      authTypeId: new FormControl(null, Validators.required),
    });

    this.memberId = this.getNumberParamFromAncestors('id') || 0;
    this.memberDetailsId = Number(sessionStorage.getItem('selectedMemberDetailsId') || 0);

    // Enrollment + Auth Class
    this.loadMemberEnrollment();
    this.loadAuthClass();

    // Load users for Owner dropdown (authActualOwner)
    this.loadAllUsers();

    // React to authNumber changes (works even when authNumber is on parent route)
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      startWith(null),
      takeUntil(this.destroy$),
      map(() => this.getStringParamFromAncestors('authNumber') ?? '0'),
      distinctUntilChanged(),
      tap(authNo => {
        this.authNumber = String(authNo);
        this.resetAuthScreenState();
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
  // Route param helpers
  // ============================================================
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
  private loadMemberEnrollment(): void {
    const mdId = Number(sessionStorage.getItem('selectedMemberDetailsId') || 0);
    if (!mdId) return;

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
          const desiredTypeId = Number(this.pendingAuth?.authTypeId ?? this.pendingAuth?.templateId ?? 0);
          if (desiredTypeId > 0) {
            this.form.get('authTypeId')?.setValue(desiredTypeId, { emitEvent: true });
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

          // Patch values after controls exist
          if (this.pendingAuth) {
            this.patchAuthorizationToForm(this.pendingAuth);
          }

          this.setupVisibilityWatcher();
        },
        error: (e) => console.error('Template json load failed', e)
      });
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
        const fieldsSorted = (sec.fields || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
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
          instances = this.buildRepeatInstances(sec.fields || [], repeatPrefix, count);

          this.repeatRegistry[repeatKey] = {
            key: repeatKey,
            kind: 'section',
            title,
            prefix: repeatPrefix,
            fieldIds: (sec.fields || []).map(x => x.id),
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
    const fieldsSorted = (rawSub.fields || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const baseFields: RenderField[] = fieldsSorted.map(f => this.toRenderField(f, this.safeControlName(f.id)));

    let instances: RenderRepeatInstance[] | undefined;
    let repeatKey: string | undefined;
    let repeatPrefix: string | undefined;

    if (subRepeat?.enabled) {
      // UM repeat: prefer baseKey (template provides it), else subsectionKey
      repeatPrefix = String(rawSub.baseKey ?? rawSub.subsectionKey ?? this.safeKey(title)).trim() || this.safeKey(title);
      repeatKey = `${repeatPrefix}__repeat__sub`;

      const count = this.getInitialRepeatCount(repeatKey, subRepeat, repeatPrefix, persistedObj);
      instances = this.buildRepeatInstances(rawSub.fields || [], repeatPrefix, count);

      this.repeatRegistry[repeatKey] = {
        key: repeatKey,
        kind: 'subsection',
        title,
        prefix: repeatPrefix,
        fieldIds: (rawSub.fields || []).map(x => x.id),
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

      const ctrl = new FormControl(null, validators);
      // default: honor template isEnabled flag
      const enabledByTpl = (f as any)?.isEnabled !== false;
      if (!enabledByTpl) ctrl.disable({ emitEvent: false });

      this.form.addControl(f.controlName, ctrl);

      const rawId = String((f as any)?._rawId ?? (f as any)?.id ?? '').trim();
      if (rawId && !this.fieldIdToControlName.has(rawId)) this.fieldIdToControlName.set(rawId, f.controlName);

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
        if (staticOpts.length) this.optionsByControlName[f.controlName] = staticOpts;
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

  // ============================================================
  // Save (AuthDetails step)
  // ============================================================
  async save(): Promise<void> {
    if (!this.form) return;

    this.form.markAllAsTouched();
    if (this.form.invalid) return;

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

    // Backend-required-ish fields (based on your insert parameters)
    const authDueDate = toIsoOrNull(pick('authDueDate', 'authduedate'));
    const nextReviewDate = toIsoOrNull(pick('nextReviewDate', 'nextreviewdate'));
    const treatementType = pick<string>('treatementType', 'treatmentType'); // supports both spellings
    const authAssignedTo = pick<number>('authAssignedTo', 'authassignedto');
    const authStatus = pick<any>('authStatus', 'authstatus') ?? 'Draft';

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

      jsonData: safeJsonData
    };

    try {
      this.isSaving = true;

      if (authDetailId > 0) {
        // UPDATE: do NOT regenerate authNumber
        payload.authNumber = this.authNumber === '0' ? null : this.authNumber;

        await firstValueFrom(this.authApi.update(authDetailId, payload, userId));
        this.form.markAsPristine();
      } else {
        // CREATE: generate authNumber ONLY here
        this.authNumber = this.authNumberService.generateAuthNumber(9, true, true, false, false);
        payload.authNumber = this.authNumber;

        const newId = await firstValueFrom(this.authApi.create(payload, userId));

        if (newId) {
          const fresh = await firstValueFrom(this.authApi.getById(Number(newId), false));
          this.pendingAuth = fresh as any;

          const newAuthNumber = (fresh as any)?.authNumber;
          if (newAuthNumber) this.authNumber = String(newAuthNumber);
        }

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
  // Bind + Patch existing auth
  // ============================================================

  private bindAuthorization(auth: any): void {
    // normalize payload key so rest of code works
    const normalized = {
      ...auth,
      jsonData: auth?.jsonData ?? auth?.dataJson ?? auth?.data ?? auth?.json
    };

    this.pendingAuth = normalized;

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


}
