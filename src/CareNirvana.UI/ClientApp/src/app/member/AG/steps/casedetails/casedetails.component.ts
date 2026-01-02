import { Component, OnDestroy, OnInit, Input } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Subject, takeUntil, Observable, of } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import { AuthService } from 'src/app/service/auth.service';
import { CaseUnsavedChangesAwareService } from 'src/app/member/AG/guards/services/caseunsavedchangesaware.service';
import { CasedetailService, CaseAggregateDto } from 'src/app/service/casedetail.service';
import { CaseWizardStoreService } from 'src/app/member/AG/services/case-wizard-store.service';
import { ActivatedRoute, Router } from '@angular/router';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';
import { CrudService, DatasourceLookupService } from 'src/app/service/crud.service';
import { AuthNumberService } from 'src/app/service/auth-number-gen.service';
import { AuthenticateService } from 'src/app/service/authentication.service';
import { tap, catchError } from 'rxjs/operators';
import { HeaderService } from 'src/app/service/header.service';

export type WizardMode = 'new' | 'edit';

type ShowWhen = 'always' | 'fieldEquals' | 'fieldNotEquals' | 'fieldhasvalue';

interface TplCondition {
  referenceFieldId: string | null;
  showWhen: ShowWhen;
  value: any;
  /** Optional: how this condition combines with the previous one (default AND) */
  operatorWithPrev?: 'AND' | 'OR';
}

interface TplRepeat {
  enabled?: boolean;
  defaultCount?: number;
  min?: number;
  max?: number;
  showControls?: boolean;
  instanceLabel?: string;
}

interface TplField {
  id: string;
  type: string;
  label: string;
  displayName: string;
  order?: number;
  required?: boolean;
  requiredMsg?: string;
  isActive?: boolean;
  isEnabled?: boolean;
  datasource?: string;
  defaultValue?: any;

  // dropdown
  selectedOptions?: any[];

  // static dropdown options
  options?: any[];

  // visibility
  showWhen?: ShowWhen;
  referenceFieldId?: string | null;
  visibilityValue?: any;

  conditions?: TplCondition[];
}

interface TplSubsection {
  subsectionKey?: string;
  sectionName?: string;
  displayName?: string;
  order?: number;

  // repeat (new)
  repeat?: TplRepeat;

  // nested subsections (new)
  subsections?: Record<string, TplSubsection> | TplSubsection[];

  // visibility
  showWhen?: ShowWhen;
  referenceFieldId?: string | null;
  visibilityValue?: any;
  conditions?: TplCondition[];

  fields: TplField[];
}

interface TplSection {
  sectionName: string;
  sectionDisplayName?: string;
  order?: number;

  // repeat (rare, but supported)
  repeat?: TplRepeat;

  fields: TplField[];
  subsections?: Record<string, TplSubsection> | TplSubsection[];
}

interface TemplateJsonRoot {
  sections: TplSection[];
}

type RenderField = TplField & {
  controlName: string;
  _rawId: string;
};

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

  /** Normal (non-repeat) fields */
  fields: RenderField[];

  /** Nested subsections */
  subsections: RenderSubsection[];

  /** Repeat meta + instances */
  repeat?: RenderRepeat;
  instances?: RenderRepeatInstance[];
  repeatKey?: string;
  repeatPrefix?: string;

  /** Stable unique key for trackBy and repeat maps */
  pathKey: string;
};

type RenderSection = {
  title: string;
  order: number;
  raw: TplSection;

  /** Normal (non-repeat) fields */
  fields: RenderField[];

  /** Nested subsections */
  subsections: RenderSubsection[];

  /** Repeat meta + instances (optional) */
  repeat?: RenderRepeat;
  instances?: RenderRepeatInstance[];
  repeatKey?: string;
  repeatPrefix?: string;

  /** Stable unique key for trackBy */
  pathKey: string;
};

type RepeatKind = 'section' | 'subsection';

type RepeatRegistryMeta = {
  key: string;
  kind: RepeatKind;
  title: string;
  prefix: string;     // controlName prefix ending with "_"
  fieldIds: string[]; // raw field ids in that group
  min: number;
  max: number;
  pathKey: string;
};

type RepeatContext = { repeatPrefix: string; repeatIndex: number };

export interface UiOption {
  value: any;
  text: string;
}

@Component({
  selector: 'app-casedetails',
  templateUrl: './casedetails.component.html',
  styleUrl: './casedetails.component.css'
})
export class CasedetailsComponent implements CaseUnsavedChangesAwareService, OnInit, OnDestroy {

  @Input() wizardMode: WizardMode = 'new';

  private _stepId: string = 'details';

  /** Step id is injected by shell/wrappers. Use setter to rebuild when it changes. */
  @Input()
  set stepId(v: string) {
    const next = (v ?? 'details').trim() || 'details';
    if (next === this._stepId) return;
    this._stepId = next;

    // If template already loaded, rebuild for the new step without refetch.
    if (this.normalizedTemplate) {
      this.rebuildForStep();
    }
  }
  get stepId(): string {
    return this._stepId;
  }

  private currentLevelId = 1;            // <- keep latest active level
  templateId: number | null = null;

  caseNumberFromRoute = '';

  /** Cache the last normalized template so we can rebuild when step changes. */
  private normalizedTemplate: TemplateJsonRoot | null = null;
  private templateLoaded = false;

  // Step -> which sections belong to this step (match sectionName/sectionDisplayName from your template JSON)
  // NOTE: update these strings if your console.table shows different names.
  private stepSectionNames: Record<string, string[]> = {
    // details: empty => all sections EXCEPT the other steps below
    details: [],

    // common sectionName patterns seen in your JSON keys:
    // Case_Notes_*, Case_Documents_*, Disposition_Details_*, Reviewer_Information_*, etc.
    notes: ['Case_Notes', 'Case Notes', 'Notes'],
    documents: ['Case_Documents', 'Case Documents', 'Documents'],
    activities: ['Case_Activities', 'Case Activity Type', 'Activities'],
    mdReview: ['Reviewer_Information', 'MD Review', 'MD_Review'],
    disposition: ['Disposition_Details', 'Disposition', 'Disposition Details'],
    // close: ['Case_Close', 'Case Close', 'Close', 'Case_Status_Details', 'Case Status Details'],
  };

  form!: FormGroup;
  renderSections: RenderSection[] = [];
  optionsByControlName: Record<string, UiSmartOption[]> = {};

  isSaving = false;

  private destroy$ = new Subject<void>();

  // ---------- Repeat state ----------
  /** Current instance count per repeatKey (survives rebuilds) */
  private repeatCounts: Record<string, number> = {};
  /** Metadata per repeatKey, rebuilt each render-model build */
  private repeatRegistry: Record<string, RepeatRegistryMeta> = {};

  /** Persisted json used to infer repeat counts for the current level during model build */
  private persistedForBuild: any | null = null;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private caseApi: CasedetailService,
    private state: CaseWizardStoreService,
    private route: ActivatedRoute,
    private crudService: CrudService,
    private caseNumberService: AuthNumberService,
    private dsLookup: DatasourceLookupService,
    private userService: AuthenticateService,
    private headerService: HeaderService,
    private router: Router
  ) { }

  caseHasUnsavedChanges(): boolean {
    return this.form?.dirty ?? false;
  }

  ngOnInit(): void {
    this.form = this.fb.group({});

    // caseNumber is defined on the shell route (":caseNumber") - find it from any ancestor.
    this.caseNumberFromRoute = this.getCaseNumberFromRoute() ?? '';

    // Track active level and load json into current step form (edit mode).
    this.state.activeLevelId$
      .pipe(takeUntil(this.destroy$))
      .subscribe(levelId => {
        this.currentLevelId = levelId ?? 1;

        // For level switch: rebuild (so repeat counts match the selected level) unless user has unsaved edits.
        if (this.normalizedTemplate && this.templateLoaded && this.form && !this.form.dirty) {
          this.rebuildForStep();
          return;
        }

        // Don't overwrite user edits
        if (this.templateLoaded && this.form && !this.form.dirty) {
          this.loadLevelIntoForm(this.currentLevelId);
        }
      });

    // Keep in sync with the shell dropdown (fixes: first load shows blank until you navigate away/back)
    this.state.templateId$
      .pipe(takeUntil(this.destroy$), distinctUntilChanged())
      .subscribe(tid => this.setTemplateId(tid));
    // Load users for Case Owner dropdown
    this.loadAllUsers();
    // If templateId was set before OnInit (rare), load it
    if (this.templateId) {
      this.loadTemplateJson();
    }
  }

  setTemplateId(id: number | string | null | undefined) {
    const n = id == null ? NaN : Number(id);
    const next = Number.isFinite(n) && n > 0 ? n : null;

    if (next === this.templateId) return;

    this.templateId = next;
    this.normalizedTemplate = null;
    this.templateLoaded = false;

    // Reset repeat state on template switch
    this.repeatCounts = {};
    this.repeatRegistry = {};

    if (this.templateId) {
      this.loadTemplateJson();
    } else {
      this.renderSections = [];
      this.optionsByControlName = {};
      this.form.reset({}, { emitEvent: false });
      this.form.markAsPristine();
    }
  }

  private loadTemplateJson(): void {
    if (!this.templateId) return;

    this.authService.getTemplate('AG', this.templateId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          const tpl = Array.isArray(res) ? res[0] : res;
          const jsonRoot: TemplateJsonRoot =
            typeof tpl?.jsonContent === 'string' ? JSON.parse(tpl.jsonContent) : tpl?.jsonContent;

          const normalized = this.normalizeTemplate(jsonRoot);

          //console.table((normalized.sections ?? []).map(s => ({
          //  sectionName: s.sectionName,
          //  displayName: s.sectionDisplayName
          //})));
          //console.log('Normalized template loaded:', normalized);
          this.normalizedTemplate = normalized;
          this.rebuildForStep();
        },
        error: (err: any) => console.error(err)
      });
  }

  private rebuildForStep(): void {
    this.rebuildForStepInternal({ preserveFormValues: false });
  }

  private rebuildForStepInternal(opts: { preserveFormValues: boolean; snapshot?: any; keepDirty?: boolean }): void {
    if (!this.normalizedTemplate) return;

    const preserve = !!opts?.preserveFormValues;
    const snapshot = opts?.snapshot ?? null;

    this.templateLoaded = false;
    this.optionsByControlName = {};
    this.renderSections = [];
    this.fieldIdToControlName = {};
    this.repeatRegistry = {}; // rebuilt each time

    // Decide persisted json used for repeat inference (build-time only)
    if (preserve && snapshot && typeof snapshot === 'object') {
      this.persistedForBuild = snapshot;
    } else {
      const levelId = this.currentLevelId ?? 1;
      const detail = this.state.getDetailForLevel(levelId);
      this.persistedForBuild = this.safeParseJson(detail?.jsonData);
    }

    // rebuild form controls for the current step
    this.form = this.fb.group({});

    // Load users for Case Owner dropdown
    this.loadAllUsers();

    const filtered = this.filterSectionsForStep(this.normalizedTemplate, this.stepId);

    this.renderSections = this.buildRenderModel(filtered, this.persistedForBuild);
    this.buildFormControls(this.renderSections);
    this.prefetchDropdownOptions(this.renderSections);
    this.applyCaseOwnerOptions();
    this.templateLoaded = true;

    // push caseNumber into the form if the template has it
    const ctrl = this.form.get('caseNumber');
    if (ctrl && this.caseNumberFromRoute) {
      ctrl.setValue(this.caseNumberFromRoute, { emitEvent: false });
      ctrl.markAsPristine();
    }

    if (preserve && snapshot && typeof snapshot === 'object') {
      this.form.patchValue(snapshot, { emitEvent: false });
      if (opts.keepDirty) this.form.markAsDirty();
    } else {
      // load saved json for the current level (edit mode)
      this.tryLoadSelectedLevel(true);
    }

    this.syncFormControlVisibility();
  }

  private tryLoadSelectedLevel(force: boolean): void {
    if (!this.templateLoaded) return;
    if (!force && (this.form?.dirty ?? false)) return;

    const levelId = this.currentLevelId ?? 1;
    this.loadLevelIntoForm(levelId);
  }

  private filterSectionsForStep(root: TemplateJsonRoot, stepId: string): TemplateJsonRoot {
    const sections = root?.sections ?? [];
    const pickList = (this.stepSectionNames[stepId] ?? []).map(x => (x ?? '').toLowerCase()).filter(Boolean);

    // If step has explicit list => include only those
    if (pickList.length > 0) {
      return {
        sections: sections.filter(s => {
          const a = (s.sectionName ?? '').toLowerCase();
          const b = (s.sectionDisplayName ?? '').toLowerCase();
          return pickList.includes(a) || pickList.includes(b);
        })
      };
    }

    // For "details": exclude sections owned by other steps (so details doesn’t show notes/docs/etc)
    const exclude = new Set(
      Object.entries(this.stepSectionNames)
        .filter(([k, _]) => k !== 'details')
        .flatMap(([_, v]) => v.map(x => (x ?? '').toLowerCase()))
        .filter(Boolean)
    );

    return {
      sections: sections.filter(s => {
        const a = (s.sectionName ?? '').toLowerCase();
        const b = (s.sectionDisplayName ?? '').toLowerCase();
        return !exclude.has(a) && !exclude.has(b);
      })
    };
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ---------------- SAVE ----------------
  async save(): Promise<void> {
    if (!this.form) return;

    // Validate ONLY what is currently visible
    this.syncFormControlVisibility();
    this.markVisibleControlsTouched();
    if (this.form.invalid) return;

    const levelId = this.getSelectedLevelId() ?? 1;

    const caseHeaderId = this.state.getHeaderId() ?? this.getHeaderIdFromRoute();
    // ✅ only Details step should create a new case header
    if (!caseHeaderId && this.stepId !== 'details') {
      alert('Please save Case Details first to create the case.');
      return;
    }
    const caseNumber =
      this.normalizeCaseNumber(this.getCaseNumberFromRoute()) ??
      this.normalizeCaseNumber(this.state.getCaseNumber()) ??
      this.normalizeCaseNumber(this.getValueByFieldId('caseNumber')) ??
      this.caseNumberService.generateAuthNumber(9, true, true, false, false);

    const userId = Number(sessionStorage.getItem('loggedInUserid')) || 0;

    const existingDetail = this.state.getDetailForLevel(levelId);
    const existingObj = this.safeParseJson(existingDetail?.jsonData);
    const stepObj = this.form.getRawValue();

    // ✅ MERGE (step values overwrite same keys, but keep other keys)
    const merged = { ...(existingObj ?? {}), ...(stepObj ?? {}) };
    const jsonData = JSON.stringify(merged);

    try {
      this.isSaving = true;
      console.log('Saving case detail...', { caseHeaderId, levelId, existingDetail, jsonData });
      if (existingDetail) {
        // UPDATE existing level row
        await this.caseApi.updateCaseDetail({ caseDetailId: existingDetail.caseDetailId, jsonData }, userId).toPromise();
      } else if (caseHeaderId) {
        // ADD level row
        const caseNumber = this.form.get('caseNumber')?.value ?? '';
        await this.caseApi.addCaseLevel({ caseHeaderId, caseNumber, levelId, jsonData }, userId).toPromise();

      } else {
        // CREATE header + first detail
        if (!caseNumber) throw new Error('caseNumber is required to create a new case.');

        const caseType = String(this.templateId) || "0";// this.getValueByFieldId('caseType') ?? '';
        const status = this.getValueByFieldId('status') ?? '';

        // const memberDetailIdRaw = Number(sessionStorage.getItem('selectedMemberDetailsId') || 0);// this.getValueByFieldId('memberDetailId');
        const memberDetailId = Number(sessionStorage.getItem('selectedMemberDetailsId') || 0); //memberDetailIdRaw ? Number(memberDetailIdRaw) : 1;

        await this.caseApi.createCase(
          { caseNumber, caseType, status, memberDetailId, levelId, jsonData },
          userId
        ).toPromise();

        const memberId = this.headerService.getMemberId(this.headerService.getSelectedTab() || '') || '';
        const currentRoute = `/case/0/details/${memberId}`;

        const urlTree = this.router.createUrlTree(
          ['/member-info', memberId, 'case', caseNumber, 'details']
        );

        const newRoute = this.router.serializeUrl(urlTree);
        const newLabel = `Case # ${caseNumber}`;

        this.headerService.updateTab(currentRoute, {
          label: newLabel,
          route: newRoute,
          memberId: String(memberId)
        });

        this.headerService.selectTab(newRoute);
      }

      // Reload aggregate + publish tabs
      let agg: CaseAggregateDto;

      if (caseHeaderId) {
        agg = await this.caseApi.getByHeaderId(caseHeaderId, false).toPromise() as CaseAggregateDto;
      } else {
        // if create, we expect caseNumber present
        agg = await this.caseApi.getCaseByNumber(caseNumber!, false).toPromise() as CaseAggregateDto;
      }

      this.state.setAggregate(agg);
      this.state.setActiveLevel(levelId);

      // ✅ After first save, the UI unlocks remaining sections (caseNumber/headerId exists).
      // Re-apply persisted identity into the form and re-sync enable/disable state so newly shown fields are editable.
      this.applyPersistedIdentityToForm();
      this.syncFormControlVisibility();

      this.form.markAsPristine();
    } catch (e) {
      console.error(e);
    } finally {
      this.isSaving = false;
    }
  }

  private normalizeCaseNumber(v: any): string | null {
    const s = String(v ?? '').trim();
    if (!s) return null;
    if (s === '0') return null;         // ✅ important
    if (s.toLowerCase() === 'null') return null;
    if (s.toLowerCase() === 'undefined') return null;
    return s;
  }

  private safeParseJson(input: any): any | null {
    if (!input) return null;
    try {
      return typeof input === 'string' ? JSON.parse(input) : input;
    } catch {
      return null;
    }
  }

  // ---------------- Tabs => Load JSON ----------------
  private loadLevelIntoForm(levelId: number) {
    const detail = this.state.getDetailForLevel(levelId);
    if (!detail?.jsonData) return;

    let parsed: any = null;
    try {
      parsed = typeof detail.jsonData === 'string' ? JSON.parse(detail.jsonData) : detail.jsonData;
    } catch {
      parsed = null;
    }

    if (!parsed || typeof parsed !== 'object') return;

    this.form.patchValue(parsed, { emitEvent: false });
    this.form.markAsPristine();
    this.syncFormControlVisibility();
  }

  // ---------------- Helpers to get field values ----------------
  private getSelectedLevelId(): number | null {
    const v = this.getValueByFieldId('level');
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private getValueByFieldId(fieldId: string): any {
    const controlName = this.findControlNameByRawId(fieldId);
    if (!controlName) return null;
    return this.form.get(controlName)?.value ?? null;
  }

  private findControlNameByRawId(rawId: string): string | null {
    if (!rawId) return null;
    const key = this.safe(rawId);
    const mapped = this.fieldIdToControlName[key];
    if (mapped) return mapped;

    // fallback: scan render model (includes repeats/nesting)
    const all = this.collectAllRenderFields(this.renderSections);
    const found = all.find(f => f._rawId === rawId);
    return found?.controlName ?? null;
  }

  private getHeaderIdFromRoute(): number | null {
    const q = this.route.snapshot.queryParamMap.get('caseHeaderId');
    const n = q ? Number(q) : NaN;
    return Number.isFinite(n) ? n : null;
  }

  private getCaseNumberFromRoute(): string | null {
    // caseNumber is on a parent route (shell path ':caseNumber')
    let r: ActivatedRoute | null = this.route;
    while (r) {
      const v = r.snapshot?.paramMap?.get('caseNumber');
      if (v) return v;
      r = r.parent;
    }
    // fallback: query param (in case you ever switch to query-param style)
    return this.route.snapshot.queryParamMap.get('caseNumber');
  }

  private getCurrentUserId(): number {
    const a: any = this.authService as any;
    const id =
      a?.userId ??
      a?.UserId ??
      a?.currentUserValue?.userId ??
      a?.currentUserValue?.UserId ??
      Number(localStorage.getItem('userId'));
    return Number.isFinite(Number(id)) ? Number(id) : 1;
  }

  // ---------------- Template -> Render model ----------------
  private normalizeTemplate(root: TemplateJsonRoot): TemplateJsonRoot {
    const normalizeFields = (arr: any[] | undefined): TplField[] => {
      return (arr ?? []).map((f: any) => ({
        ...f,
        showWhen: (f?.showWhen ?? 'always') as ShowWhen,
        referenceFieldId: f?.referenceFieldId ?? null,
        conditions: Array.isArray(f?.conditions) ? f.conditions : (f?.conditions ? [f.conditions] : [])
      }));
    };

    const normalizeSubsections = (subsAny: any): TplSubsection[] => {
      if (!subsAny) return [];
      const subsArr: any[] = Array.isArray(subsAny)
        ? subsAny
        : Object.keys(subsAny).map(k => ({ ...(subsAny as any)[k], subsectionKey: k }));

      return subsArr
        .map((s: any) => {
          const nested = normalizeSubsections(s?.subsections);
          return {
            ...s,
            showWhen: (s?.showWhen ?? 'always') as ShowWhen,
            referenceFieldId: s?.referenceFieldId ?? null,
            conditions: Array.isArray(s?.conditions) ? s.conditions : (s?.conditions ? [s.conditions] : []),
            fields: normalizeFields(s?.fields),
            subsections: nested
          } as TplSubsection;
        });
    };

    const sections = (root?.sections ?? []).map((sec: any) => {
      const fields = normalizeFields(sec?.fields);
      const subsections = normalizeSubsections(sec?.subsections);
      return { ...sec, fields, subsections } as TplSection;
    });

    return { sections };
  }

  private buildRenderModel(root: TemplateJsonRoot, persistedObj: any | null): RenderSection[] {
    const sections = (root?.sections ?? [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((sec, secIndex) => {
        const sectionTitle = sec.sectionDisplayName || sec.sectionName;
        const sectionPrefix = this.safe(sectionTitle) + '_';
        const pathKey = `sec:${this.safe(sectionTitle)}:${secIndex}`;

        const secRepeat = this.normalizeRepeat((sec as any).repeat, sectionTitle);

        // base (non-repeat) section fields
        const baseFields: RenderField[] = (sec.fields ?? [])
          .slice()
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((f: TplField) => {
            const cn = this.uniqueControlName(sectionPrefix, f.id);
            this.registerFieldControlName(f.id, cn);
            return this.toRenderField(f, cn);
          });

        // Section repeat instances (optional)
        let instances: RenderRepeatInstance[] | undefined;
        let repeatKey: string | undefined;
        let repeatPrefix: string | undefined;

        if (secRepeat?.enabled) {
          repeatPrefix = sectionPrefix;
          repeatKey = `${sectionPrefix}__repeat__sec`;

          const count = this.getInitialRepeatCount(repeatKey, secRepeat, sectionPrefix, persistedObj);
          instances = this.buildRepeatInstances(sec.fields ?? [], sectionPrefix, count);

          // register first instance control names (for showWhen resolution)
          for (const f of (instances[0]?.fields ?? [])) {
            this.registerFieldControlName(f._rawId, f.controlName);
          }

          this.repeatRegistry[repeatKey] = {
            key: repeatKey,
            kind: 'section',
            title: sectionTitle,
            prefix: sectionPrefix,
            fieldIds: (sec.fields ?? []).map(f => f.id),
            min: secRepeat.min,
            max: secRepeat.max,
            pathKey
          };
        }

        // subsections (recursive)
        const subsections = this.asSubArray(sec.subsections)
          .slice()
          .sort((a: TplSubsection, b: TplSubsection) => (a.order ?? 0) - (b.order ?? 0))
          .map((sub: TplSubsection, subIndex: number) => this.buildRenderSubsection(sub, sectionPrefix, `${pathKey}/sub:${subIndex}`, persistedObj));

        return {
          title: sectionTitle,
          order: sec.order ?? 0,
          raw: sec,
          fields: secRepeat?.enabled ? [] : baseFields,
          subsections,
          repeat: secRepeat ?? undefined,
          instances,
          repeatKey,
          repeatPrefix,
          pathKey
        } as RenderSection;
      });

    return sections;
  }

  private buildRenderSubsection(rawSub: TplSubsection, parentPrefix: string, parentPathKey: string, persistedObj: any | null): RenderSubsection {
    const key = (rawSub.displayName ?? rawSub.sectionName ?? rawSub.subsectionKey ?? 'sub').toString();
    const title = key;
    const prefix = parentPrefix + this.safe(key) + '_';
    const pathKey = `${parentPathKey}/${this.safe(key)}`;

    const subRepeat = this.normalizeRepeat((rawSub as any).repeat, title);

    // Base (non-repeat) subsection fields
    const baseFields: RenderField[] = (rawSub.fields ?? [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((f: TplField) => {
        const cn = this.uniqueControlName(prefix, f.id);
        this.registerFieldControlName(f.id, cn);
        return this.toRenderField(f, cn);
      });

    // Repeat instances (optional)
    let instances: RenderRepeatInstance[] | undefined;
    let repeatKey: string | undefined;

    if (subRepeat?.enabled) {
      repeatKey = `${prefix}__repeat__sub`;
      const count = this.getInitialRepeatCount(repeatKey, subRepeat, prefix, persistedObj);
      instances = this.buildRepeatInstances(rawSub.fields ?? [], prefix, count);

      // Register first instance for showWhen resolution
      for (const f of (instances[0]?.fields ?? [])) {
        this.registerFieldControlName(f._rawId, f.controlName);
      }

      this.repeatRegistry[repeatKey] = {
        key: repeatKey,
        kind: 'subsection',
        title,
        prefix,
        fieldIds: (rawSub.fields ?? []).map(f => f.id),
        min: subRepeat.min,
        max: subRepeat.max,
        pathKey
      };
    }

    const nested = this.asSubArray(rawSub.subsections)
      .slice()
      .sort((a: TplSubsection, b: TplSubsection) => (a.order ?? 0) - (b.order ?? 0))
      .map((child: TplSubsection, idx: number) => this.buildRenderSubsection(child, prefix, `${pathKey}/sub:${idx}`, persistedObj));

    return {
      key,
      title,
      order: rawSub.order ?? 0,
      raw: rawSub,
      fields: subRepeat?.enabled ? [] : baseFields,
      subsections: nested,
      repeat: subRepeat ?? undefined,
      instances,
      repeatKey,
      repeatPrefix: prefix,
      pathKey
    };
  }

  private buildRepeatInstances(templateFields: TplField[], prefix: string, count: number): RenderRepeatInstance[] {
    const fieldsSorted = (templateFields ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const instances: RenderRepeatInstance[] = [];
    for (let i = 1; i <= count; i++) {
      const instFields = fieldsSorted.map(f => this.toRenderField(f, this.repeatControlName(prefix, i, f.id)));
      instances.push({ index: i, fields: instFields });
    }
    return instances;
  }

  private buildFormControls(render: RenderSection[]) {
    const controls: Record<string, FormControl> = {};
    const allFields = this.collectAllRenderFields(render);

    for (const f of allFields) {
      controls[f.controlName] = this.createControlForField(f);
    }

    this.form = this.fb.group(controls);
  }

  private collectAllRenderFields(sections: RenderSection[]): RenderField[] {
    const out: RenderField[] = [];

    const walkSub = (sub: RenderSubsection) => {
      if (sub.repeat?.enabled && Array.isArray(sub.instances)) {
        for (const inst of sub.instances) out.push(...(inst.fields ?? []));
      } else {
        out.push(...(sub.fields ?? []));
      }
      for (const child of (sub.subsections ?? [])) walkSub(child);
    };

    for (const sec of (sections ?? [])) {
      if (sec.repeat?.enabled && Array.isArray(sec.instances)) {
        for (const inst of sec.instances) out.push(...(inst.fields ?? []));
      } else {
        out.push(...(sec.fields ?? []));
      }
      for (const sub of (sec.subsections ?? [])) walkSub(sub);
    }

    return out;
  }

  private createControlForField(f: RenderField): FormControl {
    const val = this.computeDefaultValue(f);
    const validators = [];
    if (f.required) validators.push(Validators.required);
    return new FormControl(val, validators);
  }

  private computeDefaultValue(field: TplField): any {
    const v = field.defaultValue;
    if (typeof v === 'string') {
      const s = v.trim().toUpperCase();
      if (s === 'D') return new Date().toISOString();
    }
    if (field.type === 'checkbox') return !!field.isEnabled;
    return v ?? null;
  }

  prefetchDropdownOptions(sections: RenderSection[]): void {
    const allFields = this.collectAllRenderFields(sections);

    // 1) Static dropdowns (no datasource)
    for (const f of allFields as any[]) {
      const hasDs = !!String(f.datasource ?? '').trim();
      if (f.type === 'select' && !hasDs) {
        const staticOpts = this.mapStaticOptions(f.options);
        if (staticOpts.length) {
          this.optionsByControlName[f.controlName] = staticOpts;
        }
      }
    }

    // 2) Datasource dropdowns 
    const selects = allFields.filter((f: any) => f.type === 'select' && !!f.datasource);

    // Group fields by datasource so we resolve each datasource only once
    const byDatasource = new Map<string, any[]>();
    for (const f of selects) {
      const ds = String(f.datasource ?? '').trim();
      if (!ds) continue;

      const list = byDatasource.get(ds) ?? [];
      list.push(f);
      byDatasource.set(ds, list);
    }

    for (const [ds, fields] of byDatasource.entries()) {
      const allLoaded = fields.every((f: any) => !!this.optionsByControlName?.[f.controlName]);
      if (allLoaded) continue;

      this.dsLookup
        .getOptionsWithFallback(
          ds,
          (r: any) => {
            const dsKey = ds ? this.toCamelCase(ds) : '';
            const value = r?.value ?? r?.id ?? r?.code;

            const label =
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
            return { value, label } as UiSmartOption;
          },
          ['AG', 'Admin', 'Provider']
        )
        .pipe(takeUntil(this.destroy$))
        .subscribe((opts: UiSmartOption[] | null) => {
          for (const f of fields) {
            if (this.optionsByControlName[f.controlName]) continue;

            // If datasource unexpectedly returns a generic Yes/No list for a field that clearly expects more options,
            // keep it empty so we don't show the wrong values (e.g., Request Source showing Yes/No).
            const hasStatic = Array.isArray((f as any).options) && ((f as any).options?.length ?? 0) > 0;
            if (!hasStatic && this.hasNonBooleanSelectedOptions(f) && this.looksLikeYesNo(opts)) {
              // eslint-disable-next-line no-console

              this.optionsByControlName[f.controlName] = [];
              continue;
            }

            this.optionsByControlName[f.controlName] = opts ?? [];
          }
        });
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

    const skip = new Set([
      'id', 'value', 'code',
      'activeFlag',
      'createdBy', 'createdOn',
      'updatedBy', 'updatedOn',
      'deletedBy', 'deletedOn'
    ]);

    for (const k of Object.keys(row)) {
      if (skip.has(k)) continue;
      const v = row[k];
      if (typeof v === 'string' && v.trim().length > 0) return v;
    }
    return null;
  }

  // ---------------- New case section gating ----------------
  /**
   * For a brand-new case (ex: /case/0/details?mode=new), we want to show ONLY "Case Overview"
   * until the first successful save (when case number/header id are persisted in the store).
   */
  shouldShowSection(sec: RenderSection): boolean {
    if (!sec) return false;

    // Not a new case -> show everything as usual
    if (!this.isNewCaseFlow()) return true;

    // After save (case number + header created) -> show everything
    if (this.hasPersistedCaseIdentity()) return true;

    // Before save -> show only Case Overview section
    return this.isCaseOverviewSection(sec);
  }

  private isCaseOverviewSection(sec: RenderSection): boolean {
    const title = (sec?.title ?? '').toLowerCase();
    const rawName = ((sec?.raw as any)?.sectionName ?? '').toLowerCase();
    const rawDisplay = ((sec?.raw as any)?.sectionDisplayName ?? '').toLowerCase();
    return title.includes('case overview') || rawName.includes('case overview') || rawDisplay.includes('case overview');
  }

  private isNewCaseFlow(): boolean {
    const mode = (this.getQueryParamFromRouteTree('mode') ?? '').toLowerCase();
    if (mode === 'new') return true;

    const routeCase = String(this.getCaseNumberFromRoute() ?? '').trim();
    if (!routeCase || routeCase === '0') return true;

    const headerId = this.state.getHeaderId() ?? this.getHeaderIdFromRoute();
    if (!headerId || Number(headerId) === 0) return true;

    return false;
  }

  /** True only when the case has been created/persisted (after first save). */
  private hasPersistedCaseIdentity(): boolean {
    const headerId = this.state.getHeaderId() ?? this.getHeaderIdFromRoute();
    const cn = this.normalizeCaseNumber(this.state.getCaseNumber()) ?? this.normalizeCaseNumber(this.getCaseNumberFromRoute());
    return !!headerId && Number(headerId) > 0 && !!cn && cn !== '0';
  }

  private getQueryParamFromRouteTree(key: string): string | null {
    let r: ActivatedRoute | null = this.route;
    while (r) {
      const v = r.snapshot?.queryParamMap?.get(key);
      if (v != null) return v;
      r = r.parent;
    }
    return null;
  }

  // ---------------- Visible-only validation ----------------
  private visibilitySyncInProgress = false;

  private applyPersistedIdentityToForm(): void {
    const persisted =
      this.normalizeCaseNumber(this.state.getCaseNumber()) ??
      this.normalizeCaseNumber(this.getValueByFieldId('caseNumber')) ??
      this.normalizeCaseNumber(this.getCaseNumberFromRoute());

    if (!persisted) return;

    this.caseNumberFromRoute = persisted;

    const ctrlName = this.findControlNameByRawId('caseNumber');
    if (!ctrlName) return;

    const ctrl = this.form.get(ctrlName);
    if (!ctrl) return;

    const cur = String(ctrl.value ?? '').trim();
    if (!cur || cur === '0') {
      ctrl.setValue(persisted, { emitEvent: false });
      ctrl.markAsPristine();
    }
  }

  private syncFormControlVisibility(): void {
    if (!this.form) return;
    if (this.visibilitySyncInProgress) return;

    this.visibilitySyncInProgress = true;
    try {
      const apply = (controlName: string, visible: boolean) => {
        if (!controlName) return;
        const ctrl = this.form.get(controlName);
        if (!ctrl) return;

        if (visible) {
          if (ctrl.disabled) ctrl.enable({ emitEvent: false });
        } else {
          if (ctrl.enabled) ctrl.disable({ emitEvent: false });
        }
      };

      const syncSubtree = (sub: RenderSubsection, sec: RenderSection, parentVisible: boolean) => {
        const raw = sub?.raw;
        const subVisible =
          parentVisible &&
          !!raw &&
          (raw as any)?.isEnabled !== false &&
          this.evalShowWhen(raw.showWhen ?? 'always', raw.conditions ?? []) &&
          this.visibleSubsection(sub, sec); // preserves your "hide empty subsection" rule

        if (sub.repeat?.enabled && Array.isArray(sub.instances)) {
          for (const inst of sub.instances) {
            const ctx: RepeatContext = { repeatPrefix: sub.repeatPrefix ?? '', repeatIndex: inst.index };
            for (const f of (inst.fields ?? [])) {
              const fieldVisible = subVisible && this.visibleField(f, sec, sub, ctx);
              apply(f.controlName, fieldVisible);
            }
          }
        } else {
          for (const f of (sub?.fields ?? [])) {
            const fieldVisible = subVisible && this.visibleField(f, sec, sub);
            apply(f.controlName, fieldVisible);
          }
        }

        for (const nested of (sub?.subsections ?? [])) {
          syncSubtree(nested, sec, subVisible);
        }
      };

      for (const sec of (this.renderSections ?? [])) {
        const secVisible = this.visibleSection(sec) && this.shouldShowSection(sec);

        // Section-level fields
        if (sec.repeat?.enabled && Array.isArray(sec.instances)) {
          for (const inst of sec.instances) {
            const ctx: RepeatContext = { repeatPrefix: sec.repeatPrefix ?? '', repeatIndex: inst.index };
            for (const f of (inst.fields ?? [])) {
              const fieldVisible = secVisible && this.visibleField(f, sec, undefined, ctx);
              apply(f.controlName, fieldVisible);
            }
          }
        } else {
          for (const f of (sec.fields ?? [])) {
            const fieldVisible = secVisible && this.visibleField(f, sec);
            apply(f.controlName, fieldVisible);
          }
        }

        // Subsections
        for (const sub of (sec.subsections ?? [])) {
          syncSubtree(sub, sec, secVisible);
        }
      }

      // Recompute validity after enable/disable
      this.form.updateValueAndValidity({ emitEvent: false });
    } finally {
      this.visibilitySyncInProgress = false;
    }
  }

  private markVisibleControlsTouched(): void {
    if (!this.form) return;
    Object.keys(this.form.controls ?? {}).forEach(key => {
      const c = this.form.get(key);
      if (c && c.enabled) c.markAsTouched();
    });
  }

  // ---------------- Visibility (keep your existing logic) ----------------
  /** Visibility helpers used in HTML */
  visibleSection(sec: RenderSection): boolean {
    if (!sec) return false;

    const anyVisibleInSection =
      (sec.repeat?.enabled && Array.isArray(sec.instances))
        ? sec.instances.some(inst => (inst.fields ?? []).some(f => this.visibleField(f, sec, undefined, { repeatPrefix: sec.repeatPrefix ?? '', repeatIndex: inst.index })))
        : (sec.fields ?? []).some(f => this.visibleField(f, sec));

    if (anyVisibleInSection) return true;

    const anyVisibleInSubsections = (sec.subsections ?? []).some(sub => this.visibleSubsection(sub, sec));
    return anyVisibleInSubsections;
  }

  visibleSubsection(sub: RenderSubsection, sec: RenderSection): boolean {
    const raw = sub.raw;
    if ((raw as any)?.isEnabled === false) return false;

    const isVisible = this.evalShowWhen(raw.showWhen ?? 'always', raw.conditions ?? []);
    if (!isVisible) return false;

    const anyVisibleFields =
      (sub.repeat?.enabled && Array.isArray(sub.instances))
        ? sub.instances.some(inst => (inst.fields ?? []).some(f => this.visibleField(f, sec, sub, { repeatPrefix: sub.repeatPrefix ?? '', repeatIndex: inst.index })))
        : (sub.fields ?? []).some(f => this.visibleField(f, sec, sub));

    const anyVisibleNested = (sub.subsections ?? []).some(s => this.visibleSubsection(s, sec));
    return anyVisibleFields || anyVisibleNested;
  }

  /** Used by template to show a red '*' for required controls */
  isRequired(ctrl: any, f: any): boolean {
    if (f?.required === true) return true;
    if (!ctrl) return false;
    const c: any = ctrl as any;
    if (typeof c.hasValidator === 'function') {
      return c.hasValidator(Validators.required);
    }
    return false;
  }

  visibleField(f: any, sec: RenderSection, sub?: RenderSubsection, ctx?: RepeatContext): boolean {
    return this.evalShowWhen(f.showWhen ?? 'always', f.conditions ?? [], ctx);
  }

  private evalShowWhen(_showWhen: ShowWhen, conditions: TplCondition[], ctx?: RepeatContext): boolean {
    if (!conditions || conditions.length === 0) return true;

    // Support AND/OR chaining (defaults to AND)
    let result: boolean | null = null;

    for (const c of conditions) {
      const condResult = this.evalSingleCondition(c, ctx);

      if (result === null) {
        result = condResult;
        continue;
      }

      const op = ((c as any).operatorWithPrev ?? 'AND') as 'AND' | 'OR';
      result = op === 'OR' ? (result || condResult) : (result && condResult);
    }

    return result ?? true;
  }

  private evalSingleCondition(c: TplCondition, ctx?: RepeatContext): boolean {
    if (!c) return true;
    if ((c.showWhen ?? 'always') === 'always') return true;

    const resolved = this.resolveControlName(c.referenceFieldId, ctx);

    if (!resolved) return true;

    const ctrl = this.form.get(resolved);
    if (!ctrl) return false; // referenced control not present in this step

    const refValRaw = ctrl.value;
    const refVal = this.unwrapValue(refValRaw);

    if (c.showWhen === 'fieldhasvalue') {
      return this.hasValue(refVal);
    }

    const left = this.toComparable(refVal, c.value);
    const right = this.toComparable(c.value, refVal);

    // Arrays: treat equals as "contains"
    if (Array.isArray(refVal)) {
      const arr = refVal.map(v => this.toComparable(v, c.value));
      if (c.showWhen === 'fieldEquals') return arr.some(v => v === right);
      if (c.showWhen === 'fieldNotEquals') return !arr.some(v => v === right);
    }

    if (c.showWhen === 'fieldEquals') return left === right;
    if (c.showWhen === 'fieldNotEquals') return left !== right;

    return true;
  }

  private unwrapValue(val: any): any {
    // ui-smart-dropdown may store { value, label } or an option object
    if (val && typeof val === 'object') {
      if (val instanceof Date) return val;
      if ('value' in val) return (val as any).value;
      if ('id' in val && (typeof (val as any).id === 'string' || typeof (val as any).id === 'number')) return (val as any).id;
    }
    return val;
  }

  private hasValue(val: any): boolean {
    if (val === null || val === undefined) return false;
    if (typeof val === 'string') return val.trim().length > 0;
    if (Array.isArray(val)) return val.length > 0;
    return true;
  }

  private toComparable(val: any, otherSide?: any): string | number | boolean | null {
    if (val === undefined || val === null) return null;

    const v = this.unwrapValue(val);

    // Dates: normalize to match how the condition value is stored (date or datetime-local string)
    if (v instanceof Date) {
      const hint = typeof otherSide === 'string' ? otherSide : '';
      if (this.looksLikeIsoDateOnly(hint)) return this.formatLocalDate(v);
      if (this.looksLikeIsoDateTime(hint)) return this.formatLocalDateTime(v);
      return v.toISOString(); // fallback
    }

    if (typeof v === 'string') {
      const s = v.trim();
      const hint = typeof otherSide === 'string' ? otherSide.trim() : '';

      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
        if (this.looksLikeIsoDateOnly(hint)) return s.slice(0, 10);
        return s.slice(0, 16);
      }
      if (this.looksLikeIsoDateOnly(s)) {
        return s;
      }

      const other = (typeof otherSide === 'string' || typeof otherSide === 'number') ? String(otherSide).trim() : '';
      if (this.isNumericLike(s) && this.isNumericLike(other)) {
        const n1 = Number(s);
        const n2 = Number(other);
        if (!Number.isNaN(n1) && !Number.isNaN(n2)) return n1;
      }

      return s.toLowerCase();
    }

    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v;

    try {
      return String(v).trim().toLowerCase();
    } catch {
      return null;
    }
  }

  private looksLikeIsoDateOnly(s: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test((s ?? '').trim());
  }

  private looksLikeIsoDateTime(s: string): boolean {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test((s ?? '').trim());
  }

  private formatLocalDate(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private formatLocalDateTime(d: Date): string {
    const date = this.formatLocalDate(d);
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${date}T${hh}:${mi}`;
  }

  private isNumericLike(s: string): boolean {
    return /^-?\d+(\.\d+)?$/.test((s ?? '').trim());
  }

  // ---------------- TrackBy helpers ----------------
  trackBySection = (_: number, item: RenderSection) => item.pathKey;
  trackBySub = (_: number, item: RenderSubsection) => item.pathKey;
  trackByField = (_: number, item: RenderField) => item.controlName;
  trackByRepeatInst = (_: number, inst: RenderRepeatInstance) => inst.index;

  // ---------------- Utilities ----------------
  private toRenderField(f: TplField, controlName: string): RenderField {
    return { ...f, controlName, _rawId: f.id };
  }

  private uniqueControlName(prefix: string, fieldId: string) {
    return prefix + this.safe(fieldId);
  }

  private repeatControlName(prefix: string, index: number, fieldId: string): string {
    // prefix already ends with "_"
    return `${prefix}r${index}_${this.safe(fieldId)}`;
  }

  private safe(v: string): string {
    return String(v ?? '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\w]/g, '_');
  }


  /** Safely treat subsections as an array (template JSON may send an object map). */
  private asSubArray(subsections: any): TplSubsection[] {
    if (!subsections) return [];
    if (Array.isArray(subsections)) return subsections as TplSubsection[];
    if (typeof subsections === 'object') return Object.values(subsections) as TplSubsection[];
    return [];
  }

  private looksLikeYesNo(opts: UiSmartOption[] | null | undefined): boolean {
    if (!opts || opts.length !== 2) return false;
    const labels = opts.map(o => String(o?.label ?? '').trim().toLowerCase());
    return labels.includes('yes') && labels.includes('no');
  }

  private hasNonBooleanSelectedOptions(field: any): boolean {
    const so = field?.selectedOptions;
    return Array.isArray(so) && so.length > 2;
  }

  getDropdownOptions(controlName: string): UiSmartOption[] {
    return this.optionsByControlName[controlName] ?? [];
  }

  private isCaseOwnerField(f: any): boolean {
    const id = String(f?._rawId ?? f?.id ?? f?.controlName ?? '').toLowerCase();
    const name = String(f?.displayName ?? f?.label ?? '').toLowerCase();
    return id.includes('caseowner') || name.includes('case owner');
  }

  private applyCaseOwnerOptions(): void {
    if (!this.caseOwnerOptions?.length) return;
    if (!this.renderSections?.length) return;

    // Set options for any "Case Owner" select in this render model (section or subsection).
    for (const sec of this.renderSections) {
      for (const f of (sec.fields ?? [])) {
        if (f.type === 'select' && this.isCaseOwnerField(f)) {
          this.optionsByControlName[f.controlName] = this.caseOwnerOptions;
        }
      }
      for (const sub of (sec.subsections ?? [])) {
        for (const f of (sub.fields ?? [])) {
          if (f.type === 'select' && this.isCaseOwnerField(f)) {
            this.optionsByControlName[f.controlName] = this.caseOwnerOptions;
          }
        }
      }
    }
  }

  // maps template field id -> actual reactive form controlName (first occurrence / first instance)
  private fieldIdToControlName: Record<string, string> = {};

  // ==========================
  // Lookup (ui-smart-lookup) helpers
  // ==========================
  private lookupSearchFnCache = new Map<string, (q: string, limit: number) => Observable<any[]>>();
  private lookupDisplayFnCache = new Map<string, (item: any) => string>();
  private lookupTrackByFnCache = new Map<string, (item: any) => any>();

  /** Template-driven lookup config lives under field.lookup in JSON (optional). */
  private getLookupCfg(f: any): any {
    return (f as any)?.lookup ?? null;
  }

  /** Decide lookup "entity" (icd / members / medicalcodes / provider etc.) */
  private getLookupEntity(f: any): string | null {
    const cfg = this.getLookupCfg(f);
    const raw = (cfg?.entity || cfg?.datasource || f?.datasource || f?.lookupEntity || f?.id || '').toString();
    const k = raw.trim().toLowerCase();
    if (!k) return null;
    if (k.includes('icd')) return 'icd';
    if (k.includes('member')) return 'members';
    if (k.includes('provider')) return 'providers';
    //if (k.includes('medical') || k.includes('cpt')) return 'medicalcodes';
    //if (k.includes('staff')) return 'staff';
    //if (k.includes('medication') || k.includes('medications')) return 'medication';
    return k;
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

  getLookupSearchFn(f: any): (q: string, limit: number) => Observable<any[]> {
    const key = (f?.controlName || f?.id || Math.random().toString()).toString();
    const cached = this.lookupSearchFnCache.get(key);
    if (cached) return cached;

    const entity = this.getLookupEntity(f);
    const svc: any = this.authService as any;

    const fn = (q: string, limit: number): Observable<any[]> => {
      if (!entity) return of([]);
      switch (entity) {
        case 'icd':
          return (svc.searchIcd ? svc.searchIcd(q, limit) : of([]));
        case 'medicalcodes':
          return (svc.searchMedicalCodes ? svc.searchMedicalCodes(q, limit) : of([]));
        case 'members':
          return (svc.searchMembers ? svc.searchMembers(q, limit) : of([]));
        case 'providers':
          return (svc.searchProviders ? svc.searchProviders(q, limit) : of([]));
        case 'staff':
          return (svc.searchStaff ? svc.searchStaff(q, limit) : of([]));

        case 'medication':
          return (svc.searchMedications ? svc.searchMedications(q, limit) : of([]));
        default:
          // support custom function name if provided in lookup config
          const cfg = this.getLookupCfg(f);
          const method = cfg?.serviceMethod ? String(cfg.serviceMethod) : null;
          const callable = method && typeof (svc as any)[method] === 'function' ? (svc as any)[method] : null;
          return callable ? callable.call(svc, q, limit) : of([]);
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
    const entity = this.getLookupEntity(f);

    const fn = (item: any): string => {
      if (!item) return '';
      if (tpl) return this.applyLookupTemplate(tpl, item);

      // sensible defaults
      if (entity === 'icd' || entity === 'medicalcodes' || entity === 'medication') {
        const code = item.code ?? item.Code ?? item.icdcode ?? item.cptcode ?? '';
        const desc = item.codeDesc ?? item.codedescription ?? item.description ?? '';
        return [code, desc].filter(Boolean).join(' - ');
      }
      if (entity === 'members') {
        const memberId = item.memberid ?? item.memberId ?? item.id ?? '';
        const name = [item.firstname ?? item.firstName ?? '', item.lastname ?? item.lastName ?? ''].filter(Boolean).join(' ');
        const phone = item.phone ?? item.phonenumber ?? '';
        const parts = [memberId, name].filter(Boolean);
        return phone ? `${parts.join(' - ')} (${phone})` : parts.join(' - ');
      }
      if (entity === 'providers') {
        const npi = item.npi ?? item.NPI ?? '';
        const name = [item.lastname ?? item.lastName ?? '', item.firstname ?? item.firstName ?? ''].filter(Boolean).join(', ');
        return npi ? `${name} (NPI: ${npi})` : name;
      }

      return (item.display ?? item.label ?? item.name ?? item.code ?? '').toString();
    };

    this.lookupDisplayFnCache.set(key, fn);
    return fn;
  }

  getLookupTrackBy(f: any): (item: any) => any {
    const key = (f?.controlName || f?.id || Math.random().toString()).toString();
    const cached = this.lookupTrackByFnCache.get(key);
    if (cached) return cached;

    const cfg = this.getLookupCfg(f);
    const path = cfg?.trackByPath ? String(cfg.trackByPath) : null;

    const fn = (item: any): any => {
      if (!item) return item;
      if (path) return this.pickPath(item, path);
      return item.id ?? item.code ?? item.memberdetailsid ?? item.memberdetailsId ?? item.npi ?? item;
    };

    this.lookupTrackByFnCache.set(key, fn);
    return fn;
  }

  onLookupSelected(f: any, item: any, ctx?: RepeatContext): void {
    if (!f || !item) return;

    // store a stable string value into the bound control (prevents saving full objects)
    const cfg = this.getLookupCfg(f);
    const valueField = cfg?.valueField ? String(cfg.valueField) : null;
    const storeValue = valueField ? this.pickPath(item, valueField) : this.getLookupDisplayWith(f)(item);
    const ctrl = this.form.get(f.controlName);
    if (ctrl) {
      ctrl.setValue(storeValue ?? null, { emitEvent: true });
      ctrl.markAsDirty();
    }

    const fill = (cfg?.fill && Array.isArray(cfg.fill)) ? cfg.fill : this.defaultLookupFill(f);
    for (const m of (fill ?? [])) {
      const targetId = m?.targetFieldId || m?.target || m?.fieldId;
      const sourcePath = m?.sourcePath || m?.source || m?.path;
      if (!targetId || !sourcePath) continue;

      const targetControlName = this.resolveControlName(String(targetId), ctx) ?? this.findControlNameByRawId(String(targetId));

      if (!targetControlName) continue;

      const v = this.pickPath(item, String(sourcePath));
      const tctrl = this.form.get(targetControlName);
      if (tctrl) {
        tctrl.setValue(v ?? null, { emitEvent: true });
        tctrl.markAsDirty();
      }
    }

    // Update conditional visibility (showWhen rules) after programmatic fill
    this.syncFormControlVisibility();
  }

  onLookupTextChange(_f: any, _text: string, _ctx?: RepeatContext): void {
    // optional hook (kept for future: you can clear dependent fields when user edits the search term)
  }

  onLookupCleared(f: any, ctx?: RepeatContext): void {
    const cfg = this.getLookupCfg(f);
    const fill = (cfg?.fill && Array.isArray(cfg.fill)) ? cfg.fill : this.defaultLookupFill(f);
    for (const m of (fill ?? [])) {
      const targetId = m?.targetFieldId || m?.target || m?.fieldId;
      if (!targetId) continue;
      const targetControlName = this.resolveControlName(String(targetId), ctx) ?? this.findControlNameByRawId(String(targetId));
      const tctrl = targetControlName ? this.form.get(targetControlName) : null;
      if (tctrl) {
        tctrl.setValue(null, { emitEvent: true });
        tctrl.markAsDirty();
      }
    }
    this.syncFormControlVisibility();
  }

  private defaultLookupFill(f: any): Array<{ targetFieldId: string; sourcePath: string }> {
    const id = String(f?._rawId || f?.id || '').toLowerCase();

    // ✅ sensible fallbacks if lookup.fill not provided in JSON
    if (id.includes('icd') && id.includes('search')) {
      return [
        { targetFieldId: 'icdCode', sourcePath: 'code' },
        { targetFieldId: 'icdDescription', sourcePath: 'codeDesc' }
      ];
    }
    if (id.includes('member') && id.includes('search')) {
      return [
        { targetFieldId: 'memberFirstName', sourcePath: 'firstname' },
        { targetFieldId: 'memberLastName', sourcePath: 'lastname' },
        { targetFieldId: 'memberPhone', sourcePath: 'phone' }
      ];
    }
    //if (id.includes('provider') && id.includes('search')) {
    //  return [
    //    { targetFieldId: 'providerFirstName', sourcePath: 'firstname' },
    //    { targetFieldId: 'providerLastName', sourcePath: 'lastname' },
    //    { targetFieldId: 'providerPhone', sourcePath: 'phone' },
    //    { targetFieldId: 'providerFax', sourcePath: 'fax' },
    //    { targetFieldId: 'providerNpi', sourcePath: 'npi' }
    //  ];
    //}
    //if (id.includes('medication') && id.includes('search')) {
    //  return [
    //    { targetFieldId: 'medicationCode', sourcePath: 'code' },
    //    { targetFieldId: 'medicationDescription', sourcePath: 'codeDesc' }
    //  ];
    //}
    //if (id.includes('staff') && id.includes('search')) {
    //  return [
    //    { "targetFieldId": "staffUserName", "sourcePath": "username" }
    //  ];
    //}

    return [];
  }

  private pickPath(obj: any, path: string): any {
    if (!obj || !path) return null;
    const parts = String(path).split('.').map(p => p.trim()).filter(Boolean);
    let cur: any = obj;
    for (const p of parts) {
      if (cur == null) return null;
      cur = cur[p];
    }
    return cur;
  }

  private applyLookupTemplate(tpl: string, item: any): string {
    return String(tpl).replace(/\{\{\s*([^}]+)\s*\}\}/g, (_m, p1) => {
      const v = this.pickPath(item, String(p1).trim());
      return v == null ? '' : String(v);
    });
  }

  private registerFieldControlName(fieldId: string, controlName: string): void {
    const key = this.safe(fieldId);
    if (!this.fieldIdToControlName[key]) {
      this.fieldIdToControlName[key] = controlName;
    }
  }

  private resolveControlName(fieldId: string | null | undefined, ctx?: RepeatContext): string | null {

    if (!fieldId) return null;

    // If we are rendering inside a repeat instance, bind reference to the same instance.
    if (ctx?.repeatPrefix && ctx.repeatIndex != null) {
      return this.repeatControlName(ctx.repeatPrefix, ctx.repeatIndex, fieldId);
    }

    const key = this.safe(fieldId);
    return this.fieldIdToControlName[key] ?? this.findControlNameByRawId(fieldId) ?? key;
  }

  // ---------------- Accordion open/close ----------------
  private openSections = new Set<string>();

  private sectionKey(sec: any, index: number): string {
    return String(sec?.id ?? sec?.sectionId ?? sec?.title ?? index) + ':' + index;
  }

  isSectionOpen(sec: any, index: number): boolean {
    const key = this.sectionKey(sec, index);
    return !this.openSections.has(key + ':closed');
  }

  toggleSection(sec: any, index: number): void {
    const base = this.sectionKey(sec, index);
    const closedKey = base + ':closed';

    if (this.openSections.has(closedKey)) this.openSections.delete(closedKey);
    else this.openSections.add(closedKey);
  }

  /************* Selected and changed field functionality and styles *********/
  selectedFieldId: string | null = null;

  selectField(f: any) {
    this.selectedFieldId = f?.id ?? f?.controlName ?? null;
  }

  isSelected(f: any): boolean {
    const id = f?.id ?? f?.controlName;
    return !!id && this.selectedFieldId === id;
  }

  private initialSnapshot: any = null;
  private changedFieldSet = new Set<string>();

  private deepClone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v));
  }

  private normalizeValue(v: any) {
    if (v && typeof v === 'object') {
      if ('value' in v) return v.value;
      if ('id' in v) return v.id;
      if ('code' in v) return v.code;
    }
    return v;
  }

  captureInitialSnapshot() {
    this.initialSnapshot = this.deepClone(this.form.getRawValue());
    this.changedFieldSet.clear();
    this.form.markAsPristine();
  }

  trackChangedFields() {
    this.form.valueChanges.subscribe(() => {
      this.changedFieldSet.clear();
      const current = this.form.getRawValue();

      Object.keys(current).forEach(key => {
        const a = this.normalizeValue(current[key]);
        const b = this.normalizeValue(this.initialSnapshot?.[key]);
        if (JSON.stringify(a) !== JSON.stringify(b)) {
          this.changedFieldSet.add(key);
        }
      });
    });
  }

  isChangedField(f: any): boolean {
    const key = f?.controlName ?? f?.id;
    return !!key && this.changedFieldSet.has(key);
  }

  // ---------------- Repeat UI actions ----------------
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
    this.rebuildForStepInternal({ preserveFormValues: true, snapshot: snap, keepDirty: true });
    this.syncFormControlVisibility();
  }

  removeRepeat(target: any, index: number): void {
    const key = target?.repeatKey;
    const rep: RenderRepeat | undefined = target?.repeat;
    if (!key || !rep?.enabled) return;

    const cur = this.repeatCounts[key] ?? (target?.instances?.length ?? rep.defaultCount);
    if (cur <= rep.min) return;
    if (!Number.isFinite(Number(index)) || Number(index) < 1 || Number(index) > cur) return;

    const meta = this.repeatRegistry[key];
    const snap0 = this.form.getRawValue();
    const snap = meta ? this.shiftRepeatSnapshotDown(snap0, meta, index, cur) : snap0;

    this.repeatCounts[key] = cur - 1;

    this.rebuildForStepInternal({ preserveFormValues: true, snapshot: snap, keepDirty: true });
    this.syncFormControlVisibility();
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

  // ---------------- Repeat helpers ----------------
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

  private getInitialRepeatCount(repeatKey: string, rep: RenderRepeat, prefix: string, persistedObj: any | null): number {
    const existing = this.repeatCounts[repeatKey];
    if (Number.isFinite(existing) && existing > 0) return existing;

    const inferred = this.inferRepeatCountFromPersisted(persistedObj, prefix);
    const count = Math.max(rep.min, Math.min(rep.max, Math.max(rep.defaultCount, inferred)));

    this.repeatCounts[repeatKey] = count;
    return count;
  }

  private inferRepeatCountFromPersisted(persistedObj: any | null, prefix: string): number {
    if (!persistedObj || typeof persistedObj !== 'object') return 0;
    const keys = Object.keys(persistedObj);
    if (keys.length === 0) return 0;

    const re = new RegExp('^' + this.escapeRegex(prefix) + 'r(\\d+)_');
    let maxIdx = 0;
    for (const k of keys) {
      const m = re.exec(k);
      if (!m) continue;
      const idx = Number(m[1]);
      if (Number.isFinite(idx) && idx > maxIdx) maxIdx = idx;
    }
    return maxIdx;
  }

  private escapeRegex(s: string): string {
    return (s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private clampInt(v: any, fallback: number, lo: number, hi: number): number {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    const t = Math.trunc(n);
    return Math.min(hi, Math.max(lo, t));
  }

  private mapStaticOptions(options: any[] | undefined): UiSmartOption[] {
    if (!Array.isArray(options)) return [];

    return options
      .filter(o => o !== null && o !== undefined && o !== '')
      .map(o => {
        if (typeof o === 'object') {
          const value =
            (o as any).value ?? (o as any).id ?? (o as any).code ?? (o as any).key ?? o;
          const label =
            (o as any).label ?? (o as any).text ?? (o as any).name ?? (o as any).description ?? String(value ?? '');
          return { value, label } as UiSmartOption;
        }
        return { value: o, label: String(o) } as UiSmartOption;
      });
  }


  allUsers: any[] = [];

  usersLoaded: boolean = false;
  private caseOwnerOptions: UiSmartOption[] = [];

  loadAllUsers(): void {

    if (this.usersLoaded) {
      this.applyCaseOwnerOptions();
      return;
    }

    this.userService.getAllUsers().subscribe({
      next: (users: any[]) => {
        this.allUsers = users || [];
        this.usersLoaded = true;

        this.caseOwnerOptions = this.allUsers.map(u => ({
          value: u.userId,
          label: u.userName
        })) as UiSmartOption[];

        this.applyCaseOwnerOptions();
      },
      error: (err) => {
        console.error('Failed to load users:', err);
        this.usersLoaded = false;
      }
    });
  }

  hasUnsavedChanges(): boolean {
    return this.caseHasUnsavedChanges();
  }
}
