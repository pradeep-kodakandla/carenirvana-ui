import { Component, OnDestroy, OnInit, Input } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import { AuthService } from 'src/app/service/auth.service';
import { CaseUnsavedChangesAwareService } from 'src/app/member/AG/guards/services/caseunsavedchangesaware.service';
import { CasedetailService, CaseAggregateDto } from 'src/app/service/casedetail.service';
import { CaseWizardStoreService } from 'src/app/member/AG/services/case-wizard-store.service';
import { ActivatedRoute } from '@angular/router';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';
import { CrudService, DatasourceLookupService } from 'src/app/service/crud.service';
import { AuthNumberService } from 'src/app/service/auth-number-gen.service';


export type WizardMode = 'new' | 'edit';

type ShowWhen = 'always' | 'fieldEquals' | 'fieldNotEquals' | 'fieldhasvalue';

interface TplCondition {
  referenceFieldId: string | null;
  showWhen: ShowWhen;
  value: any;
  /** Optional: how this condition combines with the previous one (default AND) */
  operatorWithPrev?: 'AND' | 'OR';
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
  order?: number;
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

type RenderSubsection = {
  key: string;
  title: string;
  order: number;
  raw: TplSubsection;
  fields: RenderField[];
};

type RenderSection = {
  title: string;
  order: number;
  raw: TplSection;
  fields: RenderField[];
  subsections: RenderSubsection[];
};

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
    // "close" typically lives under status/close sections (adjust as needed)
    //  close: ['Case_Close', 'Case Close', 'Close', 'Case_Status_Details', 'Case Status Details'],
  };



  form!: FormGroup;
  renderSections: RenderSection[] = [];
  optionsByControlName: Record<string, UiSmartOption[]> = {};

  isSaving = false;

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private caseApi: CasedetailService,
    private state: CaseWizardStoreService,
    private route: ActivatedRoute,
    private crudService: CrudService,
    private authNumberService: AuthNumberService,
    private dsLookup: DatasourceLookupService
  ) { }

  caseHasUnsavedChanges(): boolean {
    return this.form?.dirty ?? false;
  }

  ngOnInit(): void {
    this.form = this.fb.group({});

    // caseNumber is defined on the shell route (":caseNumber") - find it from any ancestor.
    this.caseNumberFromRoute = this.getCaseNumberFromRoute() ?? '';
    //if (this.caseNumberFromRoute) {
    //  console.log('✅ caseNumber from route:', this.caseNumberFromRoute);
    //}

    // Track active level and load json into current step form (edit mode).
    this.state.activeLevelId$
      .pipe(takeUntil(this.destroy$))
      .subscribe(levelId => {
        this.currentLevelId = levelId ?? 1;

        // Don't overwrite user edits
        if (this.templateLoaded && this.form && !this.form.dirty) {
          this.loadLevelIntoForm(this.currentLevelId);
        }
      });

    // Keep in sync with the shell dropdown (fixes: first load shows blank until you navigate away/back)
    this.state.templateId$
      .pipe(takeUntil(this.destroy$), distinctUntilChanged())
      .subscribe(tid => this.setTemplateId(tid));

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

          console.table((normalized.sections ?? []).map(s => ({
            sectionName: s.sectionName,
            displayName: s.sectionDisplayName
          })));
          console.log('Normalized template loaded:', normalized);
          this.normalizedTemplate = normalized;
          this.rebuildForStep();
        },
        error: (err: any) => console.error(err)
      });
  }

  private rebuildForStep(): void {
    if (!this.normalizedTemplate) return;

    this.templateLoaded = false;
    this.optionsByControlName = {};
    this.renderSections = [];
    this.fieldIdToControlName = {};

    // rebuild form controls for the current step
    this.form = this.fb.group({});

    const filtered = this.filterSectionsForStep(this.normalizedTemplate, this.stepId);

    this.renderSections = this.buildRenderModel(filtered);
    this.buildFormControls(this.renderSections);
    this.prefetchDropdownOptions(this.renderSections);

    this.templateLoaded = true;

    // push caseNumber into the form if the template has it
    const ctrl = this.form.get('caseNumber');
    if (ctrl && this.caseNumberFromRoute) {
      ctrl.setValue(this.caseNumberFromRoute, { emitEvent: false });
      ctrl.markAsPristine();
    }

    // load saved json for the current level (edit mode)
    this.tryLoadSelectedLevel(true);
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
        .filter(([k, v]) => k !== 'details')
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

    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const levelId = this.getSelectedLevelId() ?? 1;

    console.log('Saving for levelId:', levelId);
    // If this level already exists => update; else => add or create
    //const existingDetail = this.state.getDetailForLevel(levelId);
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
      this.authNumberService.generateAuthNumber(9, true, true, false, false);


    const userId = Number(sessionStorage.getItem('loggedInUserid')) || 0;

    //const jsonData = JSON.stringify(this.form.getRawValue());
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

        const caseType = this.getValueByFieldId('caseType') ?? '';
        const status = this.getValueByFieldId('status') ?? '';

        const memberDetailIdRaw = this.getValueByFieldId('memberDetailId');
        const memberDetailId = memberDetailIdRaw ? Number(memberDetailIdRaw) : 1;

        await this.caseApi.createCase(
          { caseNumber, caseType, status, memberDetailId, levelId, jsonData },
          userId
        ).toPromise();
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
    for (const sec of this.renderSections) {
      for (const f of sec.fields) if (f._rawId === rawId) return f.controlName;
      for (const sub of sec.subsections) {
        for (const f of sub.fields) if (f._rawId === rawId) return f.controlName;
      }
    }
    return null;
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
    const sections = (root?.sections ?? []).map(sec => {
      const fields = (sec.fields ?? []).map(f => ({
        ...f,
        showWhen: f.showWhen ?? 'always',
        referenceFieldId: f.referenceFieldId ?? null
      }));

      const subsAny = sec.subsections ?? {};
      const subsArr: TplSubsection[] = Array.isArray(subsAny)
        ? subsAny
        : Object.keys(subsAny).map(k => ({ ...(subsAny as any)[k], subsectionKey: k }));

      const subsections = subsArr.map(s => ({
        ...s,
        showWhen: s.showWhen ?? 'always',
        referenceFieldId: s.referenceFieldId ?? null,
        fields: (s.fields ?? []).map(f => ({
          ...f,
          showWhen: f.showWhen ?? 'always',
          referenceFieldId: f.referenceFieldId ?? null
        }))
      }));

      return { ...sec, fields, subsections };
    });

    return { sections };
  }

  private buildRenderModel(root: TemplateJsonRoot): RenderSection[] {
    const sections = (root?.sections ?? [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(sec => {
        const sectionTitle = sec.sectionDisplayName || sec.sectionName;

        const sectionPrefix = this.safe(sectionTitle) + '_';
        const secFields = (sec.fields ?? [])
          .slice()
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map(f => this.toRenderField(f, this.uniqueControlName(sectionPrefix, f.id)));

        const subsAny: any = (sec as any).subsections ?? [];
        const subsArr: any[] = Array.isArray(subsAny) ? subsAny : Object.keys(subsAny).map(k => ({ ...subsAny[k], subsectionKey: k }));

        const sectionFields: RenderField[] = (sec.fields ?? [])
          .slice()
          .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
          .map((f: TplField) => {
            const cn = this.uniqueControlName(sectionPrefix, f.id);
            this.registerFieldControlName(f.id, cn);
            return this.toRenderField(f, cn);
          });

        const subsections: RenderSubsection[] = subsArr
          .slice()
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map(sub => {
            const key = sub.displayName ?? sub.sectionName ?? 'sub';
            const title = key;
            const subPrefix = sectionPrefix + this.safe(key) + '_';
            const subFields: RenderField[] = (sub.fields ?? [])
              .slice()
              .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
              .map((f: TplField) => this.toRenderField(f, this.uniqueControlName(subPrefix, f.id)));

            return { key, title, order: sub.order ?? 0, raw: sub, fields: subFields };
          });

        return {
          title: sectionTitle,
          order: sec.order ?? 0,
          raw: sec,
          fields: secFields,
          subsections
        };
      });

    return sections;
  }

  private buildFormControls(render: RenderSection[]) {
    const controls: Record<string, FormControl> = {};

    for (const sec of render) {
      for (const f of sec.fields) {
        controls[f.controlName] = this.createControlForField(f);
      }
      for (const sub of sec.subsections) {
        for (const f of sub.fields) {
          controls[f.controlName] = this.createControlForField(f);
        }
      }
    }

    this.form = this.fb.group(controls);
  }

  private createControlForField(f: RenderField): FormControl {
    const val = this.computeDefaultValue(f);

    const validators = [];
    if (f.required) validators.push(Validators.required);

    // note: disabled state comes from template isEnabled/isActive etc if needed
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

  //prefetchDropdownOptions(sections: RenderSection[]): void {
  //  const allFields = [
  //    ...sections.flatMap(s => s.fields),
  //    ...sections.flatMap(s => s.subsections.flatMap(sub => sub.fields))
  //  ];

  //  const selects = allFields.filter(f => f.type === 'select' && !!f.datasource);

  //  for (const f of selects) {
  //    if (this.optionsByControlName[f.controlName]) continue;

  //    this.crudService.getData('AG', f.datasource!.toLowerCase())
  //      .pipe(takeUntil(this.destroy$))
  //      .subscribe((rows: any[]) => {

  //        const ds = (f.datasource ?? '').trim();
  //        const dsKey = ds ? this.toCamelCase(ds) : '';

  //        this.optionsByControlName[f.controlName] = (rows ?? []).map(r => {
  //          const value = r?.value ?? r?.id ?? r?.code;

  //          const label =
  //            r?.text ??
  //            r?.name ??
  //            r?.description ??
  //            (dsKey ? (r?.[dsKey] ?? r?.[dsKey.charAt(0).toUpperCase() + dsKey.slice(1)] ?? r?.[ds]) : null) ??
  //            this.pickDisplayField(r) ??
  //            String(value ?? '');

  //          return { value, label } as UiSmartOption;
  //        });

  //      });
  //  }
  //}

  prefetchDropdownOptions(sections: RenderSection[]): void {
    const allFields = [
      ...sections.flatMap((s: RenderSection) => s.fields ?? []),
      ...sections.flatMap((s: RenderSection) => (s.subsections ?? []).flatMap((sub: any) => sub.fields ?? []))
    ];

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
     // console.log(`Prefetching options for datasource "${ds}" for fields:`, fields.map((f: any) => f.controlName));
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
            console.log('Mapping row to option:', { row: r, value, label });
            return { value, label } as UiSmartOption;
          },
          ['AG', 'Admin', 'Provider']
        )
        .pipe(takeUntil(this.destroy$))
        .subscribe((opts: UiSmartOption[] | null) => {
          for (const f of fields) {
         //   console.log(`Setting options for field "${f.controlName}":`, opts);
            if (this.optionsByControlName[f.controlName]) continue;
            this.optionsByControlName[f.controlName] = opts ?? [];
          }
        });
    }
  }




  private toCamelCase(input: string): string {
    // caselevel -> caselevel, request_source -> requestSource, request-source -> requestSource
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

  // ---------------- Visibility (keep your existing logic) ----------------
  /** Visibility helpers used in HTML */
  visibleSection(sec: RenderSection): boolean {
    if (!sec) return false;

    // Show the section only if it has at least one visible field OR at least one
    // visible subsection that itself contains a visible field.
    const anyVisibleInSection = (sec.fields ?? []).some(f => this.visibleField(f, sec));
    if (anyVisibleInSection) return true;

    const anyVisibleInSubsections = (sec.subsections ?? []).some(sub => this.visibleSubsection(sub, sec));
    return anyVisibleInSubsections;
  }

  visibleSubsection(sub: RenderSubsection, sec: RenderSection): boolean {
    // subsection has its own showWhen/conditions on raw
    const raw = sub.raw;
    if ((raw as any)?.isEnabled === false) return false;

    const isVisible = this.evalShowWhen(raw.showWhen ?? 'always', raw.conditions ?? []);
    if (!isVisible) return false;

    // Hide empty subsections (no visible fields)
    return (sub.fields ?? []).some(f => this.visibleField(f, sec, sub));
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

  visibleField(f: any, sec: RenderSection, sub?: RenderSubsection): boolean {
    //if (f?.isEnabled === false) return false;
    //if (f?.isActive === false) return false;
    //console.log('visibleField called for', f.controlName);
    //console.log('Conditions:', f.conditions);
    //console.log('IsEnabled:', f.isEnabled);
    //console.log('IsActive:', f.isActive);
    return this.evalShowWhen(f.showWhen ?? 'always', f.conditions ?? []);
  }

  private evalShowWhen(showWhen: ShowWhen, conditions: TplCondition[]): boolean {
    // Backward compatible:
    // - If no conditions exist => always visible
    // - If conditions exist => evaluate them (even if showWhen is missing/always)
    if (!conditions || conditions.length === 0) return true;

    // Support AND/OR chaining (defaults to AND)
    let result: boolean | null = null;

    for (const c of conditions) {
      const condResult = this.evalSingleCondition(c);

      if (result === null) {
        result = condResult;
        continue;
      }

      const op = ((c as any).operatorWithPrev ?? 'AND') as 'AND' | 'OR';
      result = op === 'OR' ? (result || condResult) : (result && condResult);
    }

    return result ?? true;
  }

  private evalSingleCondition(c: TplCondition): boolean {

    if (!c) return true;
    if ((c.showWhen ?? 'always') === 'always') return true;
    const resolved = this.resolveControlName(c.referenceFieldId);
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

    // If the value is a date/datetime string, normalize whitespace
    if (typeof v === 'string') {
      const s = v.trim();


      // ISO date/datetime strings: normalize to match the condition value format
      const hint = typeof otherSide === 'string' ? otherSide.trim() : '';
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
        // If condition is date-only, compare only date part
        if (this.looksLikeIsoDateOnly(hint)) return s.slice(0, 10);
        // Compare yyyy-mm-ddThh:mm
        return s.slice(0, 16);
      }
      if (this.looksLikeIsoDateOnly(s)) {
        return s;
      }

      // numeric-like strings: compare as numbers when both sides are numeric-like
      const other = (typeof otherSide === 'string' || typeof otherSide === 'number') ? String(otherSide).trim() : '';
      if (this.isNumericLike(s) && this.isNumericLike(other)) {
        const n1 = Number(s);
        const n2 = Number(other);
        if (!Number.isNaN(n1) && !Number.isNaN(n2)) return n1; // caller will convert other too
      }

      return s.toLowerCase();
    }

    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v;

    // Fallback for objects
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
    // yyyy-mm-ddThh:mm (allow seconds)
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

  trackBySection = (_: number, item: RenderSection) => item.title;
  trackBySub = (_: number, item: RenderSubsection) => item.key;
  trackByField = (_: number, item: RenderField) => item.controlName;

  // ---------------- Utilities ----------------
  private toRenderField(f: TplField, controlName: string): RenderField {
    return { ...f, controlName, _rawId: f.id };
  }

  private uniqueControlName(prefix: string, fieldId: string) {
    return prefix + this.safe(fieldId);
  }

  private safe(v: string): string {
    return String(v ?? '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\w]/g, '_');
  }

  getDropdownOptions(controlName: string): UiSmartOption[] {
    return this.optionsByControlName[controlName] ?? [];
  }

  // maps template field id -> actual reactive form controlName
  private fieldIdToControlName: Record<string, string> = {};

  private registerFieldControlName(fieldId: string, controlName: string): void {
    const key = this.safe(fieldId);
    this.fieldIdToControlName[key] = controlName;
  }

  private resolveControlName(fieldId: string | null | undefined): string | null {
    if (!fieldId) return null;
    const key = this.safe(fieldId);
    return this.fieldIdToControlName[key] ?? key; // fallback (in case ids already match controlName)
  }


  private openSections = new Set<string>();

  private sectionKey(sec: any, index: number): string {
    // Prefer a stable id if you have one; fallback to title+index
    return String(sec?.id ?? sec?.sectionId ?? sec?.title ?? index) + ':' + index;
  }

  isSectionOpen(sec: any, index: number): boolean {
    const key = this.sectionKey(sec, index);
    // Default: OPEN unless user collapsed it
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
    // normalize common patterns: dropdown objects etc.
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
    this.form.markAsPristine(); // optional: keeps pristine UI clean after load
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
    const key = f?.id ?? f?.controlName;
    return !!key && this.changedFieldSet.has(key);
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

}
