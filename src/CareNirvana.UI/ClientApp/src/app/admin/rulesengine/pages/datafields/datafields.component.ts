import { Component, OnInit } from '@angular/core';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';
import { RulesengineService } from 'src/app/service/rulesengine.service';

type ModuleOptionValue = number; // -1 = ALL

interface RuleDataFieldRowApi {
  ruleDataFieldId: number;
  moduleId: number;
  moduleName: string;
  ruleDataFieldJson: string; // json string from API (ruledatafieldjson::text)
  activeFlag: boolean;
}

interface DataFieldItem {
  fieldKey: string;
  fieldName: string;
  path: string;
  uiType?: string;
  valueType?: string;
  datasource?: string;
  required?: boolean;
  isEnabled?: boolean;
}

interface DatasetItem {
  datasetKey: string;
  datasetName: string;
  sourceSectionName?: string;
  dataFields: DataFieldItem[];
}

interface ModulePayload {
  schema?: string;
  moduleKey?: string;
  moduleName?: string;
  generatedOn?: string;
  datasets?: DatasetItem[];
}

interface DatasetRow {
  id: string;                 // unique row id for expand/collapse
  moduleId: number;
  moduleName: string;
  datasetKey: string;
  datasetName: string;
  fieldsCount: number;
  dataFields: DataFieldItem[];
}

@Component({
  selector: 'app-datafields',
  templateUrl: './datafields.component.html',
  styleUrls: ['./datafields.component.css']
})
export class DatafieldsComponent implements OnInit {
  loading = false;

  // filters
  searchText = '';
  selectedModuleId: ModuleOptionValue = -1; // ALL default
  moduleOptions: UiSmartOption<ModuleOptionValue>[] = [{ value: -1, label: 'ALL' }];

  // data
  apiRows: RuleDataFieldRowApi[] = [];
  datasetRows: DatasetRow[] = [];

  // expand state
  expanded: Record<string, boolean> = {};

  constructor(private svc: RulesengineService) { }

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.loading = true;

    // IMPORTANT: call without moduleId => fetch all, then filter in UI
    this.svc.getRuleDataFields(undefined as any).subscribe({
      next: (rows: any) => {
        this.apiRows = Array.isArray(rows) ? (rows as RuleDataFieldRowApi[]) : [];
        this.buildModuleOptions();
        this.buildDatasetRows();
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Failed to load rule datafields', err);
        this.apiRows = [];
        this.datasetRows = [];
        this.moduleOptions = [{ value: -1, label: 'ALL' }];
        this.loading = false;
      }
    });
  }

  private buildModuleOptions(): void {
    const distinct = new Map<number, string>();
    for (const r of this.apiRows) {
      if (r?.moduleId != null) distinct.set(r.moduleId, r.moduleName ?? `Module ${r.moduleId}`);
    }

    const opts: UiSmartOption<ModuleOptionValue>[] = [{ value: -1, label: 'ALL' }];
    for (const [id, name] of Array.from(distinct.entries()).sort((a, b) => (a[1] ?? '').localeCompare(b[1] ?? ''))) {
      opts.push({ value: id, label: name });
    }

    this.moduleOptions = opts;

    // keep selected as ALL unless current selection is valid
    if (this.selectedModuleId !== -1 && !distinct.has(this.selectedModuleId)) {
      this.selectedModuleId = -1;
    }
  }

  private buildDatasetRows(): void {
    const out: DatasetRow[] = [];

    for (const r of this.apiRows) {
      const parsed = this.safeParse(r.ruleDataFieldJson) as ModulePayload | null;
      const datasets = Array.isArray(parsed?.datasets) ? parsed!.datasets! : [];

      for (const ds of datasets) {
        const dataFields = Array.isArray(ds.dataFields) ? ds.dataFields : [];
        out.push({
          id: `${r.moduleId}::${ds.datasetKey}`,
          moduleId: r.moduleId,
          moduleName: r.moduleName ?? '',
          datasetKey: ds.datasetKey ?? '',
          datasetName: ds.datasetName ?? ds.sourceSectionName ?? ds.datasetKey ?? '',
          fieldsCount: dataFields.length,
          dataFields: dataFields.map(f => ({
            fieldKey: (f as any).fieldKey ?? '',
            fieldName: (f as any).fieldName ?? (f as any).name ?? '',
            path: (f as any).path ?? '',
            uiType: (f as any).uiType ?? (f as any).type ?? '',
            valueType: (f as any).valueType ?? '',
            datasource: (f as any).datasource ?? '',
            required: (f as any).required ?? false,
            isEnabled: (f as any).isEnabled ?? true
          }))
        });
      }
    }

    // sort: module then dataset name
    out.sort((a, b) => {
      const m = (a.moduleName ?? '').localeCompare(b.moduleName ?? '');
      if (m !== 0) return m;
      return (a.datasetName ?? '').localeCompare(b.datasetName ?? '');
    });

    this.datasetRows = out;
  }

  private safeParse(jsonText: string): any | null {
    if (!jsonText) return null;
    try {
      return JSON.parse(jsonText);
    } catch {
      return null;
    }
  }

  // UI helpers
  onModuleChange(v: ModuleOptionValue): void {
    this.selectedModuleId = v;
    // collapse all when module changes
    this.expanded = {};
  }

  clearSearch(): void {
    this.searchText = '';
  }

  toggleRow(row: DatasetRow): void {
    this.expanded[row.id] = !this.expanded[row.id];
  }

  isExpanded(row: DatasetRow): boolean {
    return !!this.expanded[row.id];
  }

  // filtering
  get filteredRows(): DatasetRow[] {
    const moduleId = this.selectedModuleId;
    const q = (this.searchText ?? '').trim().toLowerCase();

    let rows = this.datasetRows;

    if (moduleId !== -1) {
      rows = rows.filter(x => x.moduleId === moduleId);
    }

    if (!q) return rows;

    return rows.filter(r => {
      // match dataset + module
      if ((r.moduleName ?? '').toLowerCase().includes(q)) return true;
      if ((r.datasetName ?? '').toLowerCase().includes(q)) return true;
      if ((r.datasetKey ?? '').toLowerCase().includes(q)) return true;

      // also match inside datafields (key/name/path)
      return (r.dataFields ?? []).some(f =>
        (f.fieldName ?? '').toLowerCase().includes(q) ||
        (f.fieldKey ?? '').toLowerCase().includes(q) ||
        (f.path ?? '').toLowerCase().includes(q)
      );
    });
  }

  // “show all jsons data” (current filter)
  get jsonPreview(): string {
    const moduleId = this.selectedModuleId;

    const selected = (moduleId === -1)
      ? this.apiRows
      : this.apiRows.filter(x => x.moduleId === moduleId);

    const payload = selected.map(r => ({
      moduleId: r.moduleId,
      moduleName: r.moduleName,
      ruleDataFieldId: r.ruleDataFieldId,
      activeFlag: r.activeFlag,
      json: this.safeParse(r.ruleDataFieldJson)
    }));

    return JSON.stringify(payload, null, 2);
  }

  trackById(_: number, r: DatasetRow): string {
    return r.id;
  }

  trackByField(_: number, f: DataFieldItem): string {
    return `${f.fieldKey}::${f.path}`;
  }
}
