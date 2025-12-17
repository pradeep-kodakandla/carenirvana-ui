import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup, FormBuilder, Validators } from '@angular/forms';
import { CaseUnsavedChangesAwareService } from 'src/app/member/AG/guards/services/caseunsavedchangesaware.service';
import { Subject, takeUntil } from 'rxjs';
import { UiSmartDropdownComponent, UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';
import { AuthService } from 'src/app/service/auth.service';
import { CrudService } from 'src/app/service/crud.service';
//type RenderField = TemplateField & { controlName: string; _rawId: string };

//type RenderSubsection = {
//  key: string;
//  order: number;
//  title: string;
//  raw: TemplateSubsection;
//  fields: RenderField[];
//};


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

interface RenderSub {
  key: string;
  title: string;
  order: number;
  fields: Array<{ controlName: string; label: string; type: string; required?: boolean; requiredMsg?: string; datasource?: string; showWhen?: ShowWhen; conditions?: TplCondition[]; defaultValue?: any; isActive?: boolean; isEnabled?: boolean; }>;
  raw: TplSubsection;
}

interface RenderSection {
  title: string;
  order: number;
  fields: Array<{ controlName: string; label: string; type: string; required?: boolean; requiredMsg?: string; datasource?: string; showWhen?: ShowWhen; conditions?: TplCondition[]; defaultValue?: any; isActive?: boolean; isEnabled?: boolean; }>;
  subsections: RenderSub[];
  raw: TplSection;
}

export interface VisibilityRule {
  showWhen: ShowWhen;
  referenceFieldId: string | null;
  value: any;
}

export interface UiOption {
  value: any;
  text: string;
}

@Component({
  selector: 'app-casedetails',
  templateUrl: './casedetails.component.html',
  styleUrl: './casedetails.component.css'
})
export class CasedetailsComponent implements CaseUnsavedChangesAwareService, OnInit {

  //form = new FormGroup({
  //  caseType: new FormControl(''),
  //  status: new FormControl('Open'),
  //});
  form!: FormGroup;

  caseHasUnsavedChanges(): boolean {
    return this.form.dirty;
  }

  save() {
    // call API...
    this.form.markAsPristine();
  }


  renderSections: RenderSection[] = [];
  optionsByControlName: Record<string, UiOption[]> = {};

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    // private tplService: CaseTemplateService
    private authService: AuthService,
    private crudService: CrudService
  ) { }

  ngOnInit(): void {
    this.form = this.fb.group({});

    this.authService.getTemplate('AG', 3)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res: any) => {
          // res might be object OR array depending on your API
          const tpl = Array.isArray(res) ? res[0] : res;
          const jsonRoot: TemplateJsonRoot =
            typeof tpl?.jsonContent === 'string' ? JSON.parse(tpl.jsonContent) : tpl?.jsonContent;

          const normalized = this.normalizeTemplate(jsonRoot);

          this.renderSections = this.buildRenderModel(normalized);
          this.buildFormControls(this.renderSections);
          this.prefetchDropdownOptions(this.renderSections);

          // trigger condition refresh on any value change
          this.form.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => { /* no-op */ });
        },
        error: (err: any) => console.error(err)
      });
  }

  /** Convert subsections object-map to array (so your *ngFor works) */
  private normalizeTemplate(root: TemplateJsonRoot): TemplateJsonRoot {
    const sections = (root?.sections ?? []).map(s => {
      const subs = s.subsections as any;
      let subsectionsArr: TplSubsection[] = [];

      if (subs && !Array.isArray(subs) && typeof subs === 'object') {
        subsectionsArr = Object.entries(subs).map(([key, sub]: any) => ({
          subsectionKey: sub.subsectionKey ?? key,
          ...sub
        }));
      } else if (Array.isArray(subs)) {
        subsectionsArr = subs;
      }

      return {
        ...s,
        fields: (s.fields ?? []).slice(),
        subsections: subsectionsArr
      };
    });

    return { sections };
  }

  private buildRenderModel(root: TemplateJsonRoot): RenderSection[] {
    return (root.sections ?? [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((sec) => {
        const fields = (sec.fields ?? [])
          .slice()
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map(f => ({
            controlName: f.id,           // IMPORTANT: use id as controlName
            label: f.label,
            type: f.type,
            required: !!f.required,
            requiredMsg: f.requiredMsg,
            datasource: f.datasource,
            showWhen: f.showWhen ?? 'always',
            conditions: f.conditions ?? [],
            defaultValue: f.defaultValue,
            isActive: f.isActive,
            isEnabled: f.isEnabled
          }));

        const subsections = (sec.subsections as TplSubsection[] ?? [])
          .slice()
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((sub) => ({
            key: sub.subsectionKey ?? sub.sectionName ?? 'sub',
            title: sub.sectionName ?? sub.subsectionKey ?? 'Subsection',
            order: sub.order ?? 0,
            fields: (sub.fields ?? [])
              .slice()
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
              .map(f => ({
                controlName: f.id,
                label: f.label,
                type: f.type,
                required: !!f.required,
                requiredMsg: f.requiredMsg,
                datasource: f.datasource,
                showWhen: f.showWhen ?? 'always',
                conditions: f.conditions ?? [],
                defaultValue: f.defaultValue,
                isActive: f.isActive,
                isEnabled: f.isEnabled
              })),
            raw: sub
          }));

        return {
          title: sec.sectionDisplayName ?? sec.sectionName,
          order: sec.order ?? 0,
          fields,
          subsections,
          raw: sec
        };
      });
  }

  private buildFormControls(sections: RenderSection[]): void {
    const allFields = [
      ...sections.flatMap(s => s.fields),
      ...sections.flatMap(s => s.subsections.flatMap(sub => sub.fields))
    ];

    for (const f of allFields) {
      if (this.form.contains(f.controlName)) continue;

      const initial = this.resolveDefaultValue(f.defaultValue);
      const validators = f.required ? [Validators.required] : [];

      this.form.addControl(f.controlName, new FormControl(initial, validators));
    }
  }

  /** Supports defaultValue like 'd', 'd+1', 'd-1' */
  private resolveDefaultValue(v: any): any {
    if (typeof v !== 'string') return v;

    const s = v.trim().toLowerCase();
    if (s === 'd') return new Date();

    const m = /^d([+-]\d+)$/.exec(s);
    if (m) {
      const days = parseInt(m[1], 10);
      const dt = new Date();
      dt.setDate(dt.getDate() + days);
      return dt;
    }

    return v;
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
      this.crudService.getData('AG', f.datasource!)
        .pipe(takeUntil(this.destroy$))
        .subscribe((rows: any[]) => {
          this.optionsByControlName[f.controlName] =
            (rows ?? []).map(r => ({
              value: r.value ?? r.id ?? r.code,
              text: r.text ?? r.name ?? r.description ?? String(r.value ?? r.id ?? r.code)
            }));
        });
    }
  }

  /** Visibility helpers used in HTML */
  visibleSection(sec: RenderSection): boolean {
    return true;
  }

  visibleSubsection(sub: RenderSub, sec: RenderSection): boolean {
    // subsection has its own showWhen/conditions on raw
    const raw = sub.raw;
    if ((raw as any)?.isEnabled === false) return false;
    return this.evalShowWhen(raw.showWhen ?? 'always', raw.conditions ?? []);
  }

  visibleField(f: any, sec: RenderSection, sub?: RenderSub): boolean {
    if (f.isEnabled === false) return false;
    if (f.isActive === false) return false;

    return this.evalShowWhen(f.showWhen ?? 'always', f.conditions ?? []);
  }

  private evalShowWhen(showWhen: ShowWhen, conditions: TplCondition[]): boolean {
    if (!conditions || conditions.length === 0 || showWhen === 'always') return true;

    // treat multiple conditions as AND
    return conditions.every(c => {
      if (!c?.referenceFieldId) return true;
      const refVal = this.form.get(c.referenceFieldId)?.value;

      if (c.showWhen === 'fieldEquals') return refVal == c.value;
      if (c.showWhen === 'fieldNotEquals') return refVal != c.value;

      return true;
    });
  }

  // trackBy
  trackBySection = (_: number, s: RenderSection) => s.title;
  trackBySub = (_: number, s: RenderSub) => s.key;
  trackByField = (_: number, f: any) => f.controlName;
}
