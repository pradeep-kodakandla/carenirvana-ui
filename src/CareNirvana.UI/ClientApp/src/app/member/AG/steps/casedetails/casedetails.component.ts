import { Component, OnDestroy, OnInit } from '@angular/core';
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

type ShowWhen = 'always' | 'fieldEquals' | 'fieldNotEquals';

interface TplCondition {
  referenceFieldId: string | null;
  showWhen: ShowWhen;
  value: any;
}

interface TplField {
  id: string;
  type: string;
  label: string;
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

          // Load active level data whenever tab/active level changes
          this.state.activeLevelId$
            .pipe(takeUntil(this.destroy$))
            .subscribe(levelId => {
              this.loadLevelIntoForm(levelId);
            });
        },
        error: (err: any) => console.error(err)
      });
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
    const existingDetail = this.state.getDetailForLevel(levelId);
    const caseHeaderId = this.state.getHeaderId() ?? this.getHeaderIdFromRoute();
    const caseNumber = this.authNumberService.generateAuthNumber(9, true, true, false, false); //this.state.getCaseNumber() ?? this.getCaseNumberFromRoute() ?? this.getValueByFieldId('caseNumber');

    const userId = this.getCurrentUserId();

    const jsonData = JSON.stringify(this.form.getRawValue());

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
            const key = sub.subsectionKey ?? sub.sectionName ?? 'sub';
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
      this.crudService.getData('AG', f.datasource!.toLowerCase())
        .pipe(takeUntil(this.destroy$))
        .subscribe((rows: any[]) => {
          this.optionsByControlName[f.controlName] = (rows ?? []).map(r => {
            const value = r.value ?? r.id ?? r.code;
            const label = r.text ?? r.name ?? r.description ?? String(value ?? '');
            return { value, label } as UiSmartOption;
          });
        });
    }
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
    if (f.isEnabled === false) return false;
    if (f.isActive === false) return false;

    return this.evalShowWhen(f.showWhen ?? 'always', f.conditions ?? []);
  }

  private evalShowWhen(showWhen: ShowWhen, conditions: TplCondition[]): boolean {
    if (showWhen === 'always') return true;
    if (!conditions || conditions.length === 0) return true;

    return conditions.every(c => {
      const resolved = this.resolveControlName(c?.referenceFieldId);
      if (!resolved) return true;

      const ctrl = this.form.get(resolved);
      const refVal = ctrl?.value;

      // If the referenced control isn't in the form yet, don't accidentally show things.
      if (!ctrl) return false;

      // Normalize values for comparison
      const left = refVal === undefined || refVal === null ? null : String(refVal);
      const right = c.value === undefined || c.value === null ? null : String(c.value);

      if (c.showWhen === 'fieldEquals') return left === right;
      if (c.showWhen === 'fieldNotEquals') return left !== right;

      return true;
    });
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


}
