import { Component, OnDestroy, OnInit, Input } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from 'src/app/service/auth.service';
import { CaseUnsavedChangesAwareService } from 'src/app/member/AG/guards/services/caseunsavedchangesaware.service';
import { CasedetailService, CaseAggregateDto } from 'src/app/service/casedetail.service';
import { CaseWizardStoreService } from 'src/app/member/AG/services/case-wizard-store.service';
import { ActivatedRoute } from '@angular/router';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';
import { CrudService } from 'src/app/service/crud.service';
import { AuthNumberService } from 'src/app/service/auth-number-gen.service';

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

  @Input() stepId: string = 'details';   // <- injected by shell
  private currentLevelId = 1;            // <- keep latest active level

  // Step -> which sections belong to this step (UPDATE THESE NAMES after you log them)
  private stepSectionNames: Record<string, string[]> = {
    details: [], // empty => “all except other step sections” (we’ll handle below)
    notes: ['Case Notes', 'Notes', 'Case_Notes'],
    documents: ['Case Documents', 'Documents', 'Case_Documents'],
    activities: ['Case Activity Type', 'Activities', 'Case_Activities'],
    mdReview: ['MD Review', 'MD_Review'],
    disposition: ['Disposition', 'Disposition Details', 'Case_Disposition'],
    close: ['Close', 'Case Close', 'Case_Close'],
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
    private authNumberService: AuthNumberService
  ) { }

  caseHasUnsavedChanges(): boolean {
    return this.form?.dirty ?? false;
  }

  ngOnInit(): void {
    this.form = this.fb.group({});

    // Build template-driven form
    this.authService.getTemplate('AG', 3)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          const tpl = Array.isArray(res) ? res[0] : res;
          const jsonRoot: TemplateJsonRoot =
            typeof tpl?.jsonContent === 'string' ? JSON.parse(tpl.jsonContent) : tpl?.jsonContent;

          const normalized = this.normalizeTemplate(jsonRoot);

          this.renderSections = this.buildRenderModel(normalized);
          this.buildFormControls(this.renderSections);
          this.prefetchDropdownOptions(this.renderSections);

          console.table((normalized.sections ?? []).map(s => ({
            sectionName: s.sectionName,
            displayName: s.sectionDisplayName
          })));

          // ✅ Filter sections for the current step
          const filtered = this.filterSectionsForStep(normalized, this.stepId);

          this.renderSections = this.buildRenderModel(filtered);
          this.buildFormControls(this.renderSections);
          this.prefetchDropdownOptions(this.renderSections);

          // ✅ track active level and load json into current step form
          this.state.activeLevelId$
            .pipe(takeUntil(this.destroy$))
            .subscribe(levelId => {
              this.currentLevelId = levelId ?? 1;
              this.loadLevelIntoForm(this.currentLevelId);
            });

          //// Load active level data whenever tab/active level changes
          //this.state.activeLevelId$
          //  .pipe(takeUntil(this.destroy$))
          //  .subscribe(levelId => {
          //    this.loadLevelIntoForm(levelId);
          //  });
        },
        error: (err: any) => console.error(err)
      });
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

    // If this level already exists => update; else => add or create
    //const existingDetail = this.state.getDetailForLevel(levelId);
    const caseHeaderId = this.state.getHeaderId() ?? this.getHeaderIdFromRoute();
    // ✅ only Details step should create a new case header
    if (!caseHeaderId && this.stepId !== 'details') {
      alert('Please save Case Details first to create the case.');
      return;
    }
    const caseNumber = this.authNumberService.generateAuthNumber(9, true, true, false, false); //this.state.getCaseNumber() ?? this.getCaseNumberFromRoute() ?? this.getValueByFieldId('caseNumber');

    const userId = this.getCurrentUserId();

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
    return this.route.snapshot.paramMap.get('caseNumber') || this.route.snapshot.queryParamMap.get('caseNumber');
  }

  private getCurrentUserId(): number {
    const a: any = this.authService as any;
    const id =
      a?.userId ??
      a?.UserId ??
      a?.currentUserValue?.userId ??
      a?.currentUserValue?.UserId ??
      Number(localStorage.getItem('userId'));
    return Number.isFinite(Number(id)) ? Number(id) : 0;
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

  prefetchDropdownOptions(sections: RenderSection[]): void {
    const allFields = [
      ...sections.flatMap(s => s.fields),
      ...sections.flatMap(s => s.subsections.flatMap(sub => sub.fields))
    ];

    const selects = allFields.filter(f => f.type === 'select' && !!f.datasource);

    for (const f of selects) {
      if (this.optionsByControlName[f.controlName]) continue;

      // adapt this call to your actual lookup API
      //this.crudService.getData('AG', f.datasource!.toLowerCase())
      //  .pipe(takeUntil(this.destroy$))
      //  .subscribe((rows: any[]) => {
      //    console.log(`Fetched options for datasource '${f.datasource}':`, rows);
      //    this.optionsByControlName[f.controlName] = (rows ?? []).map(r => {
      //      const value = r.value ?? r.id ?? r.code;
      //      const label = r.text ?? r.name ?? r.description ?? String(value ?? '');
      //      return { value, label } as UiSmartOption;
      //    });
      //    console.log(`Mapped options for control '${f.controlName}':`, this.optionsByControlName[f.controlName]);
      //  });
      this.crudService.getData('AG', f.datasource!.toLowerCase())
        .pipe(takeUntil(this.destroy$))
        .subscribe((rows: any[]) => {

          const ds = (f.datasource ?? '').trim();
          const dsKey = ds ? this.toCamelCase(ds) : '';

          this.optionsByControlName[f.controlName] = (rows ?? []).map(r => {
            const value = r?.value ?? r?.id ?? r?.code;

            const label =
              r?.text ??
              r?.name ??
              r?.description ??
              (dsKey ? (r?.[dsKey] ?? r?.[dsKey.charAt(0).toUpperCase() + dsKey.slice(1)] ?? r?.[ds]) : null) ??
              this.pickDisplayField(r) ??
              String(value ?? '');

            return { value, label } as UiSmartOption;
          });

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
    return true;
  }

  visibleSubsection(sub: RenderSubsection, sec: RenderSection): boolean {
    // subsection has its own showWhen/conditions on raw
    const raw = sub.raw;
    if ((raw as any)?.isEnabled === false) return false;
    return this.evalShowWhen(raw.showWhen ?? 'always', raw.conditions ?? []);
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

}
