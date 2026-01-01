import { Component, ViewChild, OnInit, EventEmitter, Output, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { TemplateService } from 'src/app/service/template.service';
import { KeyValue } from '@angular/common';
import { AuthService } from 'src/app/service/auth.service';
import { MatDialog } from '@angular/material/dialog';
import { SettingsDialogComponent } from 'src/app/admin/UM/settings-dialog/settings-dialog.component';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CrudService } from 'src/app/service/crud.service';
import { ValidationDialogComponent } from 'src/app/admin/UM/validation-dialog/validation-dialog.component';


// Define an interface for a field.
// Note: displayName is now optional so that objects without it won't cause compile errors.
interface TemplateField {
  label: string;
  displayName?: string;
  type: string;
  id: string;
  options?: string[];
  required?: boolean;
  requiredMsg?: string;
  buttonText?: string;
  datasource?: string;
  selectedOptions?: string[];
  defaultValue?: string;
  order?: number;
  // For layout containers:
  layout?: string;
  fields?: TemplateField[];        // sub-fields if this is a row container
  authStatus?: string[];
  isActive?: boolean;
  isEnabled?: boolean;
  sectionName?: string;
  dateOnly?: boolean;
  level?: string[];
  // Conditional visibility (used in your JSON)
  showWhen?: ShowWhen;
  referenceFieldId?: string | null;
  visibilityValue?: string | number | null;
  conditions?: any[];
  isVisible?: boolean | null;
  info?: string;
  primary?: boolean;
  caseStatus?: string[];
  lookup?: LookupConfig;
}

export type LookupEntity =
  | 'icd'
  | 'medicalcodes'   // procedures/CPT from cfgmedicalcodesmaster
  | 'procedure'      // alias if you prefer (map it to medicalcodes in runtime)
  | 'medication'
  | 'member'
  | 'provider'
  | 'staff'
  | (string & {});   // allow future entities without changing typings

export interface LookupFillMap {
  targetFieldId: string;   // field id in same subsection/repeat instance
  sourcePath: string;      // property path from selected item e.g. "codeDesc" or "address.city"
  transform?: 'trim' | 'upper' | 'lower' | 'phoneDigits'; // optional simple transform
  defaultValue?: any;      // optional when sourcePath is missing/null
}

export interface LookupConfig {
  enabled?: boolean;

  /** what kind of lookup */
  entity?: LookupEntity;

  /**
   * optional backend key; if you use a router map in code you can keep this empty.
   * Example: 'icd', 'members', 'medicalcodes'
   */
  datasource?: string;

  /** UX controls */
  minChars?: number;        // default 2
  debounceMs?: number;      // default 250
  limit?: number;           // default 25
  placeholder?: string;

  /** how dropdown rows should display */
  displayTemplate?: string; // e.g. "{{code}} - {{codeDesc}}"
  displayFields?: string[]; // optional simple fallback if template not set

  /** what gets stored in the FormControl (if you store scalar value) */
  valueField?: string;      // e.g. "code" or "memberdetailsid"

  /** advanced: when selected, fill other fields in that same repeat instance */
  fill?: LookupFillMap[];

  /** optional: allow clearing selection resets filled targets */
  clearOnEmpty?: boolean;   // if true, clearing lookup clears fill targets
  clearTargets?: string[];  // explicit targetFieldIds to clear (if not using fill)

  /** optional: for API param variations */
  queryParam?: string;      // default "q"
  limitParam?: string;      // default "limit"
}

type ShowWhen = 'always' | 'fieldEquals' | 'fieldNotEquals' | 'fieldhasvalue';

interface RepeatConfig {
  enabled?: boolean;
  min?: number;
  max?: number;
  defaultCount?: number;
  showControls?: boolean;
  instanceLabel?: string;
}

type PredefinedSubsectionKey =
  | 'provider'
  | 'member'
  | 'icd'
  | 'procedure'
  | 'medication'
  | 'staff';

interface PredefinedSubsectionTemplate {
  key: PredefinedSubsectionKey;
  title: string;
  subtitle: string;
  icon: string;
  subsection: Partial<TemplateSectionModel>;
}


// Define an interface for a section.
interface TemplateSectionModel {
  sectionName: string;
  sectionDisplayName?: string;
  order?: number;
  fields: TemplateField[];
  /** Map of subsections keyed by subsectionKey or sectionName */
  subsections?: { [key: string]: TemplateSectionModel };
  /** Optional stable key for subsection maps */
  subsectionKey?: string;
  /** Repeatable group config for runtime (FormArray) */
  repeat?: RepeatConfig;
  /** Optional base key for predefined subsection types */
  baseKey?: string;
  parentSectionName?: string;


  showWhen?: ShowWhen;
  referenceFieldId?: string | null;
  visibilityValue?: string | number | null;
}
@Component({
  selector: 'app-templatebuilder',
  templateUrl: './templatebuilder.component.html',
  styleUrls: ['./templatebuilder.component.css']
})
export class TemplatebuilderComponent implements OnInit, OnChanges {

  /**
   * Normalize subsections so the rest of the code can always treat them as a MAP:
   *   subsections: TemplateSectionModel[]  --> { [key]: TemplateSectionModel }
   * Also ensures fields arrays exist and tags field.sectionName for move/delete logic.
   * This lets the UI "auto-detect" structure from JSON.
   */
  private normalizeTemplateStructure(): void {
    if (!this.masterTemplate?.sections || !Array.isArray(this.masterTemplate.sections)) return;

    const normalizeNode = (node: any, parentPath?: string) => {
      if (!node) return;

      // Ensure fields is an array
      if (!Array.isArray(node.fields)) {
        node.fields = [];
      }

      const thisPath = parentPath ? `${parentPath}.${node.sectionName}` : node.sectionName;

      // Tag sectionName for fields (used by move/delete logic)
      (node.fields as any[]).forEach((f: any) => {
        if (f && typeof f === 'object') {
          f.sectionName = f.sectionName ?? thisPath;
        }
      });

      const subs = node.subsections;

      // Normalize subsections to an object map, then recurse
      if (Array.isArray(subs)) {
        const map: { [key: string]: any } = {};
        subs.forEach((s: any, idx: number) => {
          const key = (s?.subsectionKey || s?.sectionName || `Subsection${idx}`).toString();
          map[key] = s;
        });
        node.subsections = map;
      }

      if (node.subsections && typeof node.subsections === 'object' && !Array.isArray(node.subsections)) {
        Object.keys(node.subsections).forEach((key: string) => {
          const child = node.subsections[key];
          if (child && typeof child === 'object') {
            child.subsectionKey = child.subsectionKey ?? key;
            child.sectionName = child.sectionName ?? key;
            normalizeNode(child, thisPath);
          }
        });
      } else {
        delete node.subsections;
      }
    };

    this.masterTemplate.sections.forEach((s: any) => {
      if (!s?.sectionName) return;
      s.sectionName = s.sectionName;
      normalizeNode(s);
    });
  }


  /** Rebuild droplist IDs based on normalized sections + subsections (recursive) */
  private rebuildAllDropLists(): void {
    const all = new Set<string>(['available', 'unavailable']);
    const targets = new Set<string>();

    if (!this.masterTemplate?.sections) {
      this.allDropLists = Array.from(all);
      this.subsectionDropTargets = Array.from(targets);
      return;
    }

    const walk = (container: any, path: string) => {
      if (!container || !path) return;

      // Field drop list IDs
      all.add(path);

      // Predefined-subsection drop zone IDs
      targets.add(this.getSubsectionZoneId(path));

      const subs = container.subsections;
      if (subs && typeof subs === 'object' && !Array.isArray(subs)) {
        Object.keys(subs).forEach((subKey: string) => {
          const child = subs[subKey];
          walk(child, `${path}.${subKey}`);
        });
      }
    };

    this.masterTemplate.sections.forEach((section: any) => {
      if (!section?.sectionName) return;
      walk(section, section.sectionName);
    });

    this.allDropLists = Array.from(all);
    this.subsectionDropTargets = Array.from(targets);
  }


  /** Safe ID for CDK droplist ids (no spaces/special chars) */
  private safeId(val: string): string {
    return (val ?? '')
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-_]/g, '');
  }

  getSubsectionZoneId(sectionName: string): string {
    return `subsection-zone-${this.safeId(sectionName)}`;
  }
  /** Returns subsection key for a subsection node */
  getSubKey(subSection: any): string {
    return (subSection?.subsectionKey || subSection?.sectionName || '').toString();
  }

  /** Returns full path (e.g., "CaseInfo.Provider") */
  getSubPath(parentPath: string, subSection: any): string {
    const key = this.getSubKey(subSection);
    return parentPath ? `${parentPath}.${key}` : key;
  }

  /** Resolve a section/subsection container by its path (sectionName[.subKey[.childKey...]]). */
  private resolveContainerByPath(path: string): any | null {
    if (!path || !this.masterTemplate?.sections) return null;

    const parts = path.split('.').filter(Boolean);
    if (parts.length === 0) return null;

    const mainName = parts[0];
    const main = this.masterTemplate.sections.find((s: any) => s.sectionName === mainName);
    if (!main) return null;

    let container: any = main;
    for (let i = 1; i < parts.length; i++) {
      const key = parts[i];
      if (!container?.subsections?.[key]) return null;
      container = container.subsections[key];
    }
    return container;
  }

  selectSubSectionByPath(subPath: string, subSection: any, event?: Event): void {
    event?.stopPropagation();
    if (this.selectedField) this.selectedField.isActive = false;

    this.selectedField = null;
    this.selectedSubSectionObject = subSection;
    this.selectedSubSectionPath = subPath;

    const mainName = subPath?.split('.')?.[0];
    this.selectedSectionObject = this.masterTemplate.sections?.find((s: any) => s.sectionName === mainName) ?? null;

    console.log('Selected subsection:', this.selectedSubSectionPath);
  }

  moveSubSectionByPath(parentPath: string, subKey: string, direction: 'up' | 'down', event: Event): void {
    event.stopPropagation();

    const parent = this.resolveContainerByPath(parentPath);
    if (!parent?.subsections) return;

    const keys = Object.keys(parent.subsections);
    // sort by current order
    const sorted = keys
      .map(k => ({ key: k, order: Number(parent.subsections[k]?.order ?? 0) }))
      .sort((a, b) => a.order - b.order)
      .map(x => x.key);

    const idx = sorted.indexOf(subKey);
    if (idx < 0) return;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const aKey = sorted[idx];
    const bKey = sorted[swapIdx];

    const a = parent.subsections[aKey];
    const b = parent.subsections[bKey];

    const tmp = Number(a?.order ?? 0);
    a.order = Number(b?.order ?? 0);
    b.order = tmp;

    this.forceAngularChangeDetection();
  }

  deleteSubSectionByPath(parentPath: string, subKey: string, event: Event): void {
    event.stopPropagation();

    const parent = this.resolveContainerByPath(parentPath);
    if (!parent?.subsections?.[subKey]) return;

    delete parent.subsections[subKey];

    this.normalizeTemplateStructure();
    this.rebuildAllDropLists();
    this.forceAngularChangeDetection();
  }


  // Predicate: deny dropping back into the template palette
  denyDropPredicate = (_drag: any, _drop: any): boolean => false;

  // Predicate: allow only subsection templates to enter section drop zones
  subsectionEnterPredicate = (drag: any, _drop: any): boolean => {
    const data = drag?.data;
    return !!data && data.kind === 'subsectionTemplate';
  };

  onSubsectionTemplateDragStart(): void {
    this.isDraggingSubsectionTemplate = true;
    this.forceAngularChangeDetection();
  }

  onSubsectionTemplateDragEnd(): void {
    this.isDraggingSubsectionTemplate = false;
    this.forceAngularChangeDetection();
  }

  private getNextSubsectionOrder(container: any): number {
    const subs = container?.subsections;
    if (!subs || typeof subs !== 'object') return 10;
    const orders = Object.values(subs).map((s: any) => Number((s as any)?.order ?? 0));
    const maxOrder = orders.length ? Math.max(...orders) : 0;
    return maxOrder + 10;
  }


  private generateUniqueSubsectionKey(container: any, baseKey: string): string {
    const subs = container?.subsections || {};
    let key = baseKey;
    let n = 2;
    while (subs && subs[key]) {
      key = `${baseKey}_${n}`;
      n++;
    }
    return key;
  }


  dropPredefinedSubsection(event: CdkDragDrop<any>, containerPath: string): void {
    const data = event?.item?.data;
    if (!data || data.kind !== 'subsectionTemplate') return;

    const tpl = this.predefinedSubsections.find(x => x.key === data.templateKey);
    if (!tpl) return;

    const container = this.resolveContainerByPath(containerPath);
    if (!container) return;

    if (!container.subsections) container.subsections = {};

    const baseKey = tpl.key;
    const newKey = this.generateUniqueSubsectionKey(container, baseKey);

    // Deep clone to avoid shared references
    const newSub: any = JSON.parse(JSON.stringify(tpl.subsection));
    newSub.subsectionKey = newKey;
    newSub.baseKey = baseKey;
    newSub.parentSectionName = containerPath;

    // Use template label if sectionName missing
    newSub.sectionName = newSub.sectionName ?? tpl.title ?? newKey;

    // Order within THIS container
    newSub.order = this.getNextSubsectionOrder(container);

    if (!Array.isArray(newSub.fields)) newSub.fields = [];

    const newPath = `${containerPath}.${newKey}`;

    // Tag sectionName for each field so move/delete logic works
    newSub.fields = (newSub.fields || []).map((f: any) => ({
      ...f,
      sectionName: newPath
    }));

    container.subsections[newKey] = newSub;

    this.normalizeTemplateStructure();
    this.rebuildAllDropLists();
    this.forceAngularChangeDetection();
  }


  moveSubSection(mainSectionName: string, subKey: string, direction: 'up' | 'down', event: Event): void {
    event.stopPropagation();
    const main = this.masterTemplate.sections?.find(sec => sec.sectionName === mainSectionName);
    if (!main?.subsections) return;

    const entries = Object.keys(main.subsections)
      .map(k => ({ key: k, sub: main.subsections![k] }))
      .sort((a, b) => (a.sub?.order ?? 0) - (b.sub?.order ?? 0));

    const idx = entries.findIndex(x => x.key === subKey);
    if (idx < 0) return;

    const swapWith = direction === 'up' ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= entries.length) return;

    // ensure both have order
    if (entries[idx].sub.order == null) entries[idx].sub.order = idx * 10;
    if (entries[swapWith].sub.order == null) entries[swapWith].sub.order = swapWith * 10;

    const tmp = entries[idx].sub.order;
    entries[idx].sub.order = entries[swapWith].sub.order;
    entries[swapWith].sub.order = tmp;

    this.forceAngularChangeDetection();
  }

  /**
   * Move a MAIN section up/down by swapping its `order` with neighbor.
   * Keeps JSON stable and works with your existing `order`-based sorting.
   */
  moveMainSection(sectionName: string, direction: 'up' | 'down', event: Event): void {
    event.stopPropagation();
    if (!this.masterTemplate?.sections || this.masterTemplate.sections.length === 0) return;

    // Ensure every section has an order (use current array order as fallback)
    this.masterTemplate.sections.forEach((s: any, idx: number) => {
      if (s?.order == null) s.order = (idx + 1) * 10;
    });

    const sorted = [...this.masterTemplate.sections].sort((a: any, b: any) => (a?.order ?? 0) - (b?.order ?? 0));
    const idx = sorted.findIndex((s: any) => s.sectionName === sectionName);
    if (idx < 0) return;

    const swapWith = direction === 'up' ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= sorted.length) return;

    const a = sorted[idx];
    const b = sorted[swapWith];
    const tmp = a.order;
    a.order = b.order;
    b.order = tmp;

    // Write back sorted array so *ngFor reflects the new order
    this.masterTemplate.sections = [...this.masterTemplate.sections].sort((x: any, y: any) => (x?.order ?? 0) - (y?.order ?? 0));

    // Drop lists don't depend on order, but keep it safe
    this.rebuildAllDropLists();
    this.forceAngularChangeDetection();
  }

  incRepeatDefaultCount(parentPath: string, subKey: string, event: Event): void {
    event.stopPropagation();
    const parent = this.resolveContainerByPath(parentPath);
    const sub = parent?.subsections?.[subKey];
    if (!sub) return;

    sub.repeat = sub.repeat ?? {};
    const current = Number(sub.repeat.defaultCount ?? 1);
    const max = Number(sub.repeat.max ?? 99);
    sub.repeat.defaultCount = Math.min(current + 1, max);

    this.forceAngularChangeDetection();
  }


  decRepeatDefaultCount(parentPath: string, subKey: string, event: Event): void {
    event.stopPropagation();
    const parent = this.resolveContainerByPath(parentPath);
    const sub = parent?.subsections?.[subKey];
    if (!sub) return;

    sub.repeat = sub.repeat ?? {};
    const current = Number(sub.repeat.defaultCount ?? 1);
    const min = Number(sub.repeat.min ?? 1);
    sub.repeat.defaultCount = Math.max(current - 1, min);

    this.forceAngularChangeDetection();
  }

  /** Template-safe helpers (avoid strict template 'possibly undefined' errors) */
  getRepeatDefaultCount(subSection: any): number {
    return Number(subSection?.repeat?.defaultCount ?? 1);
  }

  getRepeatMin(subSection: any): number {
    return Number(subSection?.repeat?.min ?? 1);
  }


  // Our master template now holds a sections array.
  masterTemplate: { sections?: TemplateSectionModel[] } = {};

  /** Middle-column special case: Provider Details renders non-button fields in the grid.
   *  We keep a STABLE array reference for CDK drag/drop (do NOT use Array.filter() directly in the template).
   */
  private readonly PROVIDER_SECTION_NAME = 'Provider Details';
  private providerNonButtonFieldsCache = new Map<string, TemplateField[]>();
  availableFields: TemplateField[] = [];
  selectedField: TemplateField | null = null;
  selectedSection: string = '';
  allDropLists: string[] = ['available'];
  // Predefined subsections drag/drop
  readonly subsectionTemplatesDropId = 'subsection-templates';
  subsectionDropTargets: string[] = [];
  subsectionDropDummy: any[] = [];
  isDraggingSubsectionTemplate: boolean = false;

  predefinedSubsections: PredefinedSubsectionTemplate[] = [
    {
      key: 'provider',
      title: 'Provider',
      subtitle: 'Search + First/Last/Phone/Fax',
      icon: 'local_hospital',
      subsection: {
        sectionName: 'Provider',
        subsectionKey: 'provider',
        order: 0,
        repeat: { enabled: true, min: 1, max: 10, defaultCount: 1, showControls: true, instanceLabel: 'Provider' },
        fields: [
          {
            id: 'providerSearch',
            label: 'Search Provider',
            displayName: 'Search Provider',
            type: 'search',
            order: 0,
            isEnabled: true,
            info: 'Search by NPI/Name/Phone',
            "lookup": {
              "enabled": true,
              "entity": "provider",
              "datasource": "providers",
              "minChars": 2,
              "debounceMs": 250,
              "limit": 25,
              "placeholder": "Search Provider (Last/First Name)",
              "valueField": "providerid",
              "displayTemplate": "{{lastName}}, {{firstName}} (ID: {{providerId}})",
              "fill": [
                { "targetFieldId": "providerFirstName", "sourcePath": "firstName" },
                { "targetFieldId": "providerLastName", "sourcePath": "lastName" }
              ]
            }
          },
          { id: 'providerFirstName', label: 'First Name', displayName: 'First Name', type: 'text', order: 1, isEnabled: true },
          { id: 'providerLastName', label: 'Last Name', displayName: 'Last Name', type: 'text', order: 2, isEnabled: true }
        ]
      }
    },

    {
      key: 'member',
      title: 'Member',
      subtitle: 'Search + First/Last/Phone',
      icon: 'person',
      subsection: {
        sectionName: 'Member',
        subsectionKey: 'member',
        order: 0,
        repeat: { enabled: true, min: 1, max: 5, defaultCount: 1, showControls: true, instanceLabel: 'Member' },
        fields: [
          {
            id: 'memberSearch',
            label: 'Search Member',
            displayName: 'Search Member',
            type: 'search',
            order: 0,
            isEnabled: true,
            info: 'Search by Member ID/Name/Phone',
            lookup: {
              enabled: true,
              entity: 'member',
              minChars: 2,
              debounceMs: 250,
              limit: 25,
              placeholder: 'Search by Member ID / Name / Phone',
              valueField: 'memberdetailsid',
              displayTemplate: '{{memberid}} - {{firstname}} {{lastname}} ({{phone}})',
              fill: [
                { targetFieldId: 'memberFirstName', sourcePath: 'firstname' },
                { targetFieldId: 'memberLastName', sourcePath: 'lastname' },
                { targetFieldId: 'memberPhone', sourcePath: 'phone' }
              ]
            }
          },
          { id: 'memberFirstName', label: 'First Name', displayName: 'First Name', type: 'text', order: 1, isEnabled: true },
          { id: 'memberLastName', label: 'Last Name', displayName: 'Last Name', type: 'text', order: 2, isEnabled: true },
          { id: 'memberPhone', label: 'Phone', displayName: 'Phone', type: 'text', order: 3, isEnabled: true }
        ]
      }
    },

    // ✅ ICD: remove icdSearch and use icdCode as the lookup field
    {
      key: 'icd',
      title: 'ICD',
      subtitle: 'ICD Code (search) + Description',
      icon: 'assignment',
      subsection: {
        sectionName: 'ICD',
        subsectionKey: 'icd',
        order: 0,
        repeat: { enabled: true, min: 1, max: 30, defaultCount: 1, showControls: true, instanceLabel: 'ICD' },
        fields: [
          {
            id: 'icdCode',
            label: 'ICD Code',
            displayName: 'ICD Code',
            type: 'search',
            order: 1,
            isEnabled: true,
            info: 'Search ICD code/description',
            lookup: {
              enabled: true,
              entity: 'icd',
              minChars: 2,
              debounceMs: 250,
              limit: 25,
              placeholder: 'Search ICD (Code / Description)',
              valueField: 'code',
              displayTemplate: '{{code}} - {{codeDesc}}',
              fill: [
                { targetFieldId: 'icdCode', sourcePath: 'code' },
                { targetFieldId: 'icdDescription', sourcePath: 'codeDesc' }
              ]
            }
          },
          { id: 'icdDescription', label: 'Description', displayName: 'Description', type: 'text', order: 2, isEnabled: true }
        ]
      }
    },

    // ✅ Procedure: same pattern as ICD, calls your cfgmedicalcodesmaster endpoint
    {
      key: 'procedure',
      title: 'Procedure',
      subtitle: 'Procedure Code (search)',
      icon: 'fact_check',
      subsection: {
        sectionName: 'Procedure',
        subsectionKey: 'procedure',
        order: 0,
        repeat: { enabled: true, min: 1, max: 30, defaultCount: 1, showControls: true, instanceLabel: 'Procedure' },
        fields: [
          {
            id: 'procedureCode',
            label: 'Procedure Code',
            displayName: 'Procedure Code',
            type: 'search',
            order: 1,
            isEnabled: true,
            info: 'Search procedure code/description',
            lookup: {
              enabled: true,
              entity: 'medicalcodes',   // aligns to /search/medicalcodes
              minChars: 2,
              debounceMs: 250,
              limit: 25,
              placeholder: 'Search Procedure (Code / Description)',
              valueField: 'code',
              displayTemplate: '{{code}} - {{codeDesc}}',
              fill: [
                { targetFieldId: 'procedureCode', sourcePath: 'code' },
                { targetFieldId: 'procedureDescription', sourcePath: 'codeDesc' }
              ]
            }
          },
          { id: 'procedureDescription', label: 'Description', displayName: 'Description', type: 'text', order: 2, isEnabled: true }
        ]
      }
    },

    // ✅ Medication: same UI as ICD; backend must support /search/medications
    {
      key: 'medication',
      title: 'Medication',
      subtitle: 'Medication Code/Name (search)',
      icon: 'medication',
      subsection: {
        sectionName: 'Medication',
        subsectionKey: 'medication',
        order: 0,
        repeat: { enabled: true, min: 1, max: 30, defaultCount: 1, showControls: true, instanceLabel: 'Medication' },
        fields: [
          {
            id: 'medicationCode',
            label: 'Medication',
            displayName: 'Medication',
            type: 'search',
            order: 1,
            isEnabled: true,
            info: 'Search medication code/name/description',
            lookup: {
              enabled: true,
              entity: 'medication',
              minChars: 2,
              debounceMs: 250,
              limit: 25,
              placeholder: 'Search Medication',
              valueField: 'ndc',
              displayTemplate: '{{ndc}} - {{drugName}}',
              fill: [
                { targetFieldId: 'medicationCode', sourcePath: 'ndc' },
                { targetFieldId: 'medicationDescription', sourcePath: 'drugName' }
              ]
            }
          },
          { id: 'medicationDescription', label: 'Description', displayName: 'Description', type: 'text', order: 2, isEnabled: true }
        ]
      }
    },

    // ✅ Staff: Username (search) + First/Last/Username/Phone/Email
    {
      key: 'staff',
      title: 'Staff',
      subtitle: 'Search + First/Last/Username',
      icon: 'badge',
      subsection: {
        sectionName: 'Staff',
        subsectionKey: 'staff',
        order: 0,
        repeat: { enabled: true, min: 1, max: 10, defaultCount: 1, showControls: true, instanceLabel: 'Staff' },
        fields: [
          {
            id: 'staffSearch',
            label: 'Search Staff',
            displayName: 'Search Staff',
            type: 'search',
            order: 0,
            isEnabled: true,
            info: 'Search staff by username/name/email',
            lookup: {
              enabled: true,
              entity: 'staff',
              minChars: 2,
              debounceMs: 250,
              limit: 25,
              placeholder: 'Search Staff (Username / Name / Email)',
              valueField: 'userdetailid',
              displayTemplate: '{{userdetailid}} - {{username}}',
              fill: [
                { "targetFieldId": "staffUserName", "sourcePath": "username" }
              ]
            }
          },
          { id: 'staffUserName', label: 'Username', displayName: 'Username', type: 'text', order: 1, isEnabled: true }
        ]
      }
    }
  ];

  defaultFieldIds: string[] = [];
  authTemplates: any[] = [];
  selectedTemplateId: number = 0;
  newTemplateName: string = '';
  showTemplateNameError: boolean = false;
  //displayedColumns: string[] = ['Id', 'TemplateName', 'authClass', 'CreatedBy', 'CreatedOn', 'actions'];
  displayedColumns: string[] = [];
  isFormVisible: boolean = false;
  formMode: 'add' | 'edit' | 'view' = 'add';
  selectedEntry: any = {};
  visibleColumns: string[] = [];
  editingRowId: string | null = null;
  dataSource = new MatTableDataSource<any>();
  selectedSectionObject: TemplateSectionModel | null = null;
  selectedSubSectionObject: any = null;
  selectedSubSectionPath: string = '';
  authClass: any[] = [];
  selectedClassId: number = 0;

  originalMasterTemplate: { sections?: TemplateSectionModel[] } = {};

  unavailableSections: string[] = [];
  unavailableFieldsList: TemplateField[] = [];
  unavailableFieldsGrouped: { [sectionName: string]: TemplateField[] } = {};

  emptySectionCounter = 1;

  @Input() module: string = 'UM';
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @Output() menuCollapse: EventEmitter<void> = new EventEmitter<void>();

  isFocused = false;
  isVisible = false;

  // Track expanded state of sections using sectionName as key.
  activeSections: { [key: string]: boolean } = {};

  // Preserve JSON insertion order (if needed)
  originalOrderComparator(a: KeyValue<string, any>, b: KeyValue<string, any>): number {
    return 0;
  }

  // Alias mapping for section keys (if needed)
  aliasMapping: { [key: string]: string } = {
    'authDetails': 'Auth Details',
    'providerDetails': 'Provider Details',
    'diagnosisDetails': 'Diagnosis Details',
    'serviceDetails': 'Service Details',
    'additionalDetails': 'Additional Details'
  };

  constructor(
    private templateService: TemplateService,
    private authService: AuthService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private crudService: CrudService
  ) { }

  ngOnInit() {
    this.setupColumns();
    this.loadAuthClass();
    if (this.module == 'AG') {
      this.loadAuthTemplates();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['module']) {
      this.setupColumns();
    }
  }


  private setupColumns(): void {
    // base columns
    const cols = ['Id', 'TemplateName'];

    // only add Auth Case for UM
    if (this.module === 'UM') {
      cols.push('authClass');
    }

    cols.push('CreatedBy', 'CreatedOn', 'actions');

    this.displayedColumns = cols;
  }

  loadAuthTemplates(): void {
    this.authService.getTemplates(this.module, this.selectedClassId).subscribe({
      next: (data: any[]) => {
        this.authTemplates = [
          { Id: 0, TemplateName: 'Select Auth Type' },
          ...data
        ];
      },
      error: (err) => {
        console.error('Error fetching auth templates:', err);
        this.authTemplates = [{ Id: 0, TemplateName: 'Select Auth Type' }];
      }
    });
  }

  loadAuthClass(): void {
    this.crudService.getData('um', 'authclass').subscribe({

      next: (response: any[]) => {
        this.authClass = [
          { id: 0, authClass: 'Select Auth Case' },  // optional default option
          ...response
        ];
        this.loadData();
      },
      error: (err) => {
        console.error('Error fetching auth class:', err);
        this.authClass = [{ id: 0, authClass: 'Select Auth Class' }];
      }
    });
  }

  loadData() {
    this.authService.getTemplates(this.module, 0).subscribe((response) => {
      this.dataSource.data = response.map((item: any) => {
        const matchingClass = this.authClass.find(c => String(c.id) === String(item.authclassid));
        return {
          ...item,
          authClass: matchingClass ? matchingClass.authClass : ''
        };
      });
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    });
  }

  onAuthClassChange(): void {
    // Reset template ID to default
    this.selectedTemplateId = 0;

    // Clear existing template list and reload based on selected class
    this.loadAuthTemplates();
  }


  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  selectSection(section: TemplateSectionModel) {
    this.selectedSectionObject = section; // Directly reference the selected section
  }

  onFocus() {
    this.isFocused = true;
  }

  onBlur() {
    this.isFocused = false;
  }

  openForm(mode: 'add' | 'edit' | 'view', element: any = null) {
    this.formMode = mode;
    this.isVisible = true;

    // Emit event to collapse menu
    this.menuCollapse.emit();

    // Clear previous selection in the right column
    this.selectedField = null;
    this.selectedSectionObject = null;
    this.selectedSection = '';

    if (mode === 'edit' && element) {
      this.newTemplateName = element.templateName;
      this.selectedClassId = element.id;

      // ✅ Load templates first, then set selectedTemplateId
      this.authService.getTemplates(this.module, this.selectedClassId).subscribe({
        next: (data: any[]) => {
          this.authTemplates = [{ Id: 0, TemplateName: 'Select Auth Type' }, ...data];

          // ✅ Set selectedTemplateId after dropdown is populated
          this.selectedTemplateId = element.id;
          this.onTemplateChange(); // Load masterTemplate after setting TemplateId
        },
        error: (err) => {
          console.error('Error fetching auth templates for edit mode:', err);
          this.authTemplates = [{ Id: 0, TemplateName: 'Select Auth Type' }];
        }
      });

      this.selectedEntry = { ...element };
    } else if (mode === 'add') {
      this.newTemplateName = '';
      this.selectedTemplateId = 0;
      this.selectedClassId = 0; // Reset selected class ID
      // Clear the masterTemplate when adding a new template.
      this.masterTemplate = {};
      this.selectedEntry = {};
    } else if (mode === 'view') {
      this.selectedEntry = { ...element };
    }
  }

  cancel() {
    this.isVisible = false;
  }

  confirmDelete(element: any = null) {
    // Implement deletion logic if needed.
  }

  // Map field types to input types.
  // Note: For select fields you might need a dropdown component; here we simply return text.
  getInputType(fieldType: string): string {
    switch (fieldType) {
      case 'datetime-local':
        return 'datetime-local';
      case 'number':
        return 'number';
      case 'select':
        return 'text';
      case 'textarea':
        return 'textarea';
      case 'search':
        return 'text';
      case 'checkbox':
        return 'checkbox';
      default:
        return 'text';
    }
  }

  onTemplateChange(): void {

    if (this.selectedTemplateId && this.selectedTemplateId > 0) {
      this.authService.getTemplate(this.module, this.selectedTemplateId).subscribe({
        next: (data: any) => {
          if (!data || !data.length || !data[0] || !data[0].jsonContent) {
            console.error('API returned invalid data or missing JsonContent');
            return;
          }
          try {
            // Parse the new JSON format with a sections array.
            this.masterTemplate = JSON.parse(data[0].jsonContent);
            this.normalizeTemplateStructure();
            this.rebuildAllDropLists();
            this.providerNonButtonFieldsCache.clear();
            console.log('Loaded master template Sections:', this.masterTemplate.sections);
            if (this.masterTemplate.sections && Array.isArray(this.masterTemplate.sections)) {
              // Sort sections by order (using 0 as default if order is missing).
              this.masterTemplate.sections.sort((a, b) => (a.order || 0) - (b.order || 0));
              this.masterTemplate.sections.forEach((section) => {
                // Expand each section by default
                this.activeSections[section.sectionName] = true;

                if (section.fields && Array.isArray(section.fields)) {
                  section.fields.sort((a, b) => (a.order || 0) - (b.order || 0));

                  // ✅ Tag each field with its section name so deletion works later
                  section.fields.forEach(field => {
                    field.sectionName = section.sectionName;
                  });
                }

                if (typeof section.subsections === 'object' && !Array.isArray(section.subsections)) {
                  this.allDropLists.push(...Object.keys(section.subsections).map(sub => section.sectionName + '.' + sub));
                } else {
                  this.allDropLists.push(section.sectionName);
                }
              });
            }
            // Set the original master template for comparison.
            this.authService.getTemplate(this.module, (this.module == 'UM' ? 2 : 1)).subscribe({
              next: (data: any) => {
                if (!data || !data[0]?.jsonContent) {
                  console.error('API returned invalid data:', data);
                  return;
                }

                try {
                  // Parse the new JSON format with a sections array.
                  this.originalMasterTemplate = JSON.parse(data[0].jsonContent);
                  // Normalize original template as well (used for cloning / comparisons)
                  if (this.originalMasterTemplate) {
                    // Temporarily assign for normalization helper
                    const prev = this.masterTemplate;
                    this.masterTemplate = this.originalMasterTemplate;
                    this.normalizeTemplateStructure();
                    this.originalMasterTemplate = this.masterTemplate;
                    this.masterTemplate = prev;
                  }
                  if (this.originalMasterTemplate.sections && Array.isArray(this.originalMasterTemplate.sections)) {
                    // Sort sections by order (using 0 as default if order is missing).
                    this.originalMasterTemplate.sections.sort((a, b) => (a.order || 0) - (b.order || 0));
                    this.originalMasterTemplate.sections.forEach((section) => {
                      // Expand each section by default.
                      this.activeSections[section.sectionName] = true;
                      if (section.fields && Array.isArray(section.fields)) {
                        // Sort fields by order within each section.
                        section.fields.sort((a, b) => (a.order || 0) - (b.order || 0));
                      }
                      // Add the section's identifier to the drop lists.
                      //this.allDropLists.push(section.sectionName);
                      if (typeof section.subsections === 'object' && !Array.isArray(section.subsections)) {
                        this.allDropLists.push(...Object.keys(section.subsections).map(sub => section.sectionName + '.' + sub));
                      }
                      else
                        this.allDropLists.push(section.sectionName);

                    });
                  }
                } catch (error) {
                  console.error('Failed to parse JSON content:', error);
                  this.originalMasterTemplate = {};
                }
                if (this.originalMasterTemplate.sections && this.masterTemplate.sections) {
                  this.compareWithMasterTemplate(this.originalMasterTemplate.sections, this.masterTemplate.sections);
                }
              },
              error: (err) => {
                console.error('Error while fetching template:', err);
                this.originalMasterTemplate = {};
              }
            });
            // Initialize available fields.
            this.availableFields = [
              { label: 'Text Field', displayName: 'Text Field', type: 'text', id: 'newText' },
              { label: 'Number Field', displayName: 'Number Field', type: 'number', id: 'newNumber' },
              { label: 'Date Field', displayName: 'Date Field', type: 'datetime-local', id: 'newDate' },
              { label: 'Drop Down', displayName: 'Drop Down', type: 'select', id: 'newSelect', options: [] }
            ];
            this.defaultFieldIds = this.availableFields.map(field => field.id);
          } catch (error) {
            console.error('Error parsing JSON content:', error);
            this.masterTemplate = {};
          }
        },
        error: (err) => {
          console.error('Error fetching template:', err);
          this.masterTemplate = {};
        }
      });

    } else {
      this.masterTemplate = {};
    }
  }


  compareWithMasterTemplate(master: TemplateSectionModel[], selected: TemplateSectionModel[]) {
    const selectedSectionNames = selected.map(s => s.sectionName);
    const selectedFieldMap: { [section: string]: string[] } = {};

    // Build a map of section name → field IDs from selected template
    selected.forEach(section => {
      if (section.fields) {
        selectedFieldMap[section.sectionName] = section.fields.map(f => f.id);
      } else {
        selectedFieldMap[section.sectionName] = [];
      }
    });

    // Reset tracking structures
    this.unavailableSections = [];
    this.unavailableFieldsList = [];
    this.unavailableFieldsGrouped = {};

    master.forEach(masterSec => {
      const secName = masterSec.sectionName;

      // Section is completely missing
      const isWholeSectionMissing = !selectedSectionNames.includes(secName);
      if (isWholeSectionMissing) {
        this.unavailableSections.push(secName);
        return; // ✅ Skip checking fields in missing sections
      }

      // Process field-level differences
      if (masterSec.fields) {
        masterSec.fields.forEach(field => {
          const isFieldMissing = !selectedFieldMap[secName]?.includes(field.id);
          if (isFieldMissing) {
            const displayName = field.displayName || field.label || field.id;

            const fieldWithSection: TemplateField = {
              ...field,
              sectionName: secName,
              displayName,
              label: displayName
            };

            this.unavailableFieldsList.push(fieldWithSection);

            // Group by section
            if (!this.unavailableFieldsGrouped[secName]) {
              this.unavailableFieldsGrouped[secName] = [];
            }
            this.unavailableFieldsGrouped[secName].push(fieldWithSection);
          }
        });
      }
    });
  }



  drop(event: CdkDragDrop<TemplateField[]>, sectionName: string) {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      const draggedField = event.previousContainer.data[event.previousIndex];
      const isDefaultField = this.defaultFieldIds.includes(draggedField.id);
      let fieldToSelect: TemplateField;

      if (event.previousContainer.id === 'available' || event.previousContainer.id === 'unavailable') {

        if (isDefaultField) {
          const fieldToCopy = { ...draggedField };
          fieldToCopy.id = `${fieldToCopy.id}_copy_${Math.random().toString(36).substr(2, 9)}`;
          fieldToCopy.displayName = fieldToCopy.label; // Ensure display name
          fieldToCopy.isEnabled = true; // ✅ default to true

          // Check if field is already added to prevent duplicates
          if (!event.container.data.some(f => f.id === fieldToCopy.id)) {
            event.container.data.splice(event.currentIndex, 0, fieldToCopy);
            this.addFieldToSection(fieldToCopy, sectionName);
          }
          fieldToSelect = fieldToCopy;

          // Remove from unavailableFieldsList if it came from there
          if (event.previousContainer.id === 'unavailable') {
            const idx = this.unavailableFieldsList.findIndex(f => f.id === fieldToCopy.id);
            if (idx > -1) {
              this.unavailableFieldsList.splice(idx, 1);
            }
          }


        } else {
          transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
          fieldToSelect = event.container.data[event.currentIndex];

          // Ensure field is only added once to the correct section
          this.addFieldToSection(fieldToSelect, sectionName);
        }
        this.selectedField = fieldToSelect;
        fieldToSelect.isEnabled = fieldToSelect.isEnabled ?? true;
      } else if (event.container.id === 'available' && !this.defaultFieldIds.includes(draggedField.id)) {
        transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
        this.selectedField = event.container.data[event.currentIndex];
      } else {
        transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
        this.selectedField = event.container.data[event.currentIndex];

        // Ensure field is added to `masterTemplate.sections` only once
        this.addFieldToSection(this.selectedField, sectionName);
      }
    }


    // ✅ Keep Provider Details (non-button grid) synced with masterTemplate.fields whenever it participates in a drop.
    if (this.isProviderSectionId(event.container.id) || this.isProviderSectionId(event.previousContainer.id)) {
      this.syncProviderSectionFields();
    }
    // Ensure UI updates properly
    this.forceAngularChangeDetection();
  }



  addFieldToSection(field: TemplateField, sectionName: string) {
    // Provider Details: fields are maintained via the cached non-button list + syncProviderSectionFields()
    if (sectionName === this.PROVIDER_SECTION_NAME) {
      if (field?.type !== 'button') {
        const section = this.masterTemplate.sections?.find(s => s.sectionName === this.PROVIDER_SECTION_NAME);
        if (section) {
          const cache = this.getProviderDropFields(section); // ensures cache exists
          if (!cache.some(f => f.id === field.id)) {
            cache.push(field);
          }
          this.syncProviderSectionFields();
        }
      }
      return;
    }

    const fieldsArr = this.resolveFieldsArray(sectionName);
    if (!fieldsArr) {
      console.warn(`Section ${sectionName} not found!`);
      return;
    }

    // Prevent duplicates: Check if the field already exists in the target array
    const existingField = fieldsArr.find(f => f.id === field.id);
    if (!existingField) {
      fieldsArr.push(field);
    } else {
      // No-op (already inserted by transferArrayItem). Keep log for debugging.
      // console.warn(`Field ${field.displayName} already exists in section ${sectionName}`);
    }
  }


  selectField(field: TemplateField, section: string) {
    // Ensure selection only applies to middle column, not available fields
    if (section !== 'available') {
      // Remove highlight from previously selected field
      if (this.selectedField && this.selectedField.id !== field.id) {
        this.selectedField.isActive = false;
      }

      // Temporarily reset selection for smooth UI updates
      this.selectedField = null;
      this.selectedSection = '';
      this.selectedSectionObject = null;

      setTimeout(() => {
        // Ensure displayName exists; if not, default to label
        if (!field.displayName) {
          field.displayName = field.label;
        }

        // Keep the new selection and highlight it
        this.selectedField = field;
        //this.selectedSection = section;
        field.isActive = true;

        // Ensure UI updates correctly
        this.forceAngularChangeDetection();
      }, 10);
    }
  }

  updateField(updatedField: TemplateField | TemplateSectionModel) {
    // SECTION / SUBSECTION update (no `id`)
    if (!('id' in (updatedField as any))) {
      const updatedSection = updatedField as TemplateSectionModel;

      // If a subsection is currently selected, persist the whole object back into the master template
      if (this.selectedSubSectionObject && this.selectedSubSectionPath) {
        Object.assign(this.selectedSubSectionObject, updatedSection);
        this.saveSelectedSubSection();
        this.normalizeTemplateStructure();
        this.rebuildAllDropLists();
        this.forceAngularChangeDetection();
        return;
      }

      // Main section update
      if (this.selectedSectionObject) {
        const oldName = this.selectedSectionObject.sectionName;
        const sectionIndex = this.masterTemplate.sections?.findIndex(sec => sec.sectionName === oldName);

        if (sectionIndex !== undefined && sectionIndex > -1) {
          const current = this.masterTemplate.sections![sectionIndex];

          // Merge ALL section props (including showWhen/referenceFieldId/visibilityValue/conditions)
          const merged: TemplateSectionModel = {
            ...current,
            ...updatedSection,
            // keep existing collections unless updatedSection provides them
            fields: updatedSection.fields ?? current.fields,
            subsections: (updatedSection as any).subsections ?? (current as any).subsections
          } as any;

          this.masterTemplate.sections![sectionIndex] = merged;
          this.selectedSectionObject = merged;

          // If name changed, keep selectedSection in sync
          if (typeof updatedSection.sectionName === 'string' && this.selectedSection === oldName) {
            this.selectedSection = updatedSection.sectionName;
          }
        }
      }

      this.normalizeTemplateStructure();
      this.rebuildAllDropLists();
      this.forceAngularChangeDetection();
      return;
    }

    // FIELD update (has `id`)
    const updated = updatedField as TemplateField;

    const fields: TemplateField[] | null = this.resolveFieldsArray(this.selectedSection);
    if (!fields) return;

    const idx = fields.findIndex(f => f.id === updated.id);

    if (idx > -1) {
      const current = fields[idx];

      // Merge so we never accidentally wipe conditional values if a partial payload comes in.
      const merged: any = { ...current, ...updated };

      // Override conditional props ONLY if they are present on the payload (null is a valid value)
      if (Object.prototype.hasOwnProperty.call(updated, 'showWhen')) merged.showWhen = (updated as any).showWhen;
      if (Object.prototype.hasOwnProperty.call(updated, 'referenceFieldId')) merged.referenceFieldId = (updated as any).referenceFieldId;
      if (Object.prototype.hasOwnProperty.call(updated, 'visibilityValue')) merged.visibilityValue = (updated as any).visibilityValue;
      if (Object.prototype.hasOwnProperty.call(updated, 'conditions')) merged.conditions = (updated as any).conditions;

      fields[idx] = merged as TemplateField;
      this.selectedField = fields[idx];
    } else {
      fields.push(updated);
      this.selectedField = updated;
    }

    this.normalizeTemplateStructure();
    this.rebuildAllDropLists();
    this.forceAngularChangeDetection();
  }

  onFieldOrSubSectionUpdated(updatedItem: any) {
    if (this.selectedSubSectionObject) {
      // Save changes to subsection (like name or condition)
      this.saveSelectedSubSection();
    } else {
      this.updateField(updatedItem);
    }
  }


  deleteField(field: TemplateField, sectionName: string, event: Event): void {
    event.stopPropagation();

    if (sectionName === 'available') {
      const index = this.availableFields.findIndex(f => f.id === field.id);
      if (index > -1) {
        this.availableFields.splice(index, 1);
      }
    } else if (this.masterTemplate.sections && Array.isArray(this.masterTemplate.sections)) {
      const section = this.masterTemplate.sections.find(sec => sec.sectionName === sectionName);
      if (section && section.fields) {
        const index = section.fields.findIndex(f => f.id === field.id);
        if (index > -1) {
          section.fields.splice(index, 1);
        }

        // Move to unavailable group based on original section name
        const originalSection = field.sectionName || sectionName;
        const displayName = field.displayName || field.label || field.id;

        const fieldWithSection: TemplateField = {
          ...field,
          displayName,
          label: displayName,
          sectionName: originalSection
        };

        // Add to flat list (optional if used elsewhere)
        this.unavailableFieldsList.push(fieldWithSection);

        // Add to grouped list
        if (!this.unavailableFieldsGrouped[originalSection]) {
          this.unavailableFieldsGrouped[originalSection] = [];
        }
        this.unavailableFieldsGrouped[originalSection].push(fieldWithSection);
      }
    }

    // Refresh UI
    this.forceAngularChangeDetection();
  }


  saveTemplate(): void {
    if (!this.newTemplateName || this.newTemplateName.trim() === '') {
      this.showTemplateNameError = true;
      console.error('Template Name is required');
      return;
    }
    this.showTemplateNameError = false;

    if (this.masterTemplate.sections) {
      this.masterTemplate.sections.forEach(section => {
        if (section.fields) {
          section.fields.forEach((field, index) => field.order = index);
        }

        if (section.subsections) {
          Object.values(section.subsections).forEach(subSection => {
            if (subSection.fields) {
              subSection.fields.forEach((field, index) => field.order = index);
            }
          });
        }
      });
    }

    this.normalizeVisibilityForSave(this.masterTemplate);

    const jsonData = {
      TemplateName: this.newTemplateName,
      JsonContent: JSON.stringify(this.masterTemplate), // Ensuring subsections are included
      CreatedOn: new Date().toISOString(),
      CreatedBy: 1,
      authclassid: this.selectedClassId,
      Id: this.formMode === 'edit' ? this.selectedTemplateId : 0,
      module: this.module,
      EnrollmentHierarchyId: 1
    };

    this.authService.saveAuthTemplate(jsonData).subscribe({
      next: () => {
        this.isVisible = false;
        this.loadData();
        this.snackBar.open('Auth Template saved successfully!', 'Close', {
          duration: 5000,
          panelClass: ['success-snackbar']
        });
      },
      error: err => console.error('Error saving data:', err)
    });
  }


  onTemplateNameInput(): void {
    if (this.newTemplateName && this.newTemplateName.trim() !== '') {
      this.showTemplateNameError = false;
    }
  }

  isArray(value: any): value is TemplateField[] {
    return Array.isArray(value);
  }

  toggleSection(sectionName: string): void {
    this.activeSections[sectionName] = !this.activeSections[sectionName];
  }

  openSettingsDialog() {
    const dialogRef = this.dialog.open(SettingsDialogComponent, {
      width: '400px',
      data: { visibleColumns: this.visibleColumns }
    });
    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.visibleColumns = result;
        this.updateDisplayedColumns();
      }
    });
  }

  updateDisplayedColumns() {
    const optionalColumns = ['updatedBy', 'updatedOn', 'deletedBy', 'deletedOn'];
    this.displayedColumns = ['Id', 'TemplateName', 'authClass', 'CreatedBy', 'CreatedOn', 'actions'];
    this.displayedColumns.push(...this.visibleColumns.filter((col) => optionalColumns.includes(col)));
  }

  getFieldsByType(fields: TemplateField[], type: string): TemplateField[] {
    return fields.filter(field => field.type === type);
  }

  getNonButtonFields(fields: TemplateField[]): TemplateField[] {
    return fields.filter(field => field.type !== 'button');
  }

  /**
   * ✅ Provider Details drop list uses ONLY non-button fields.
   * Return a stable array reference so CDK can calculate indices correctly.
   */
  getProviderDropFields(section: TemplateSectionModel): TemplateField[] {
    const key = section.sectionName || this.PROVIDER_SECTION_NAME;

    let cached = this.providerNonButtonFieldsCache.get(key);
    if (!cached) {
      cached = [];
      this.providerNonButtonFieldsCache.set(key, cached);
      // initialize once from section.fields
      (section.fields || []).forEach(f => {
        if (f?.type !== 'button') cached!.push(f);
      });
    }
    return cached;
  }

  private isProviderSectionId(listId: string): boolean {
    return listId === this.PROVIDER_SECTION_NAME;
  }

  /** Keep masterTemplate.sections[].fields in sync with the Provider Details grid list (non-buttons). */
  private syncProviderSectionFields(): void {
    const section = this.masterTemplate.sections?.find(s => s.sectionName === this.PROVIDER_SECTION_NAME);
    if (!section) return;

    const nonButtons = this.providerNonButtonFieldsCache.get(this.PROVIDER_SECTION_NAME);
    if (!nonButtons) return;

    const buttons = (section.fields || []).filter(f => f?.type === 'button');

    // Mutate in place to keep references stable for the rest of the UI
    section.fields = section.fields || [];
    section.fields.length = 0;
    section.fields.push(...buttons, ...nonButtons);

    // Re-apply sectionName tag for deletion/move logic
    section.fields.forEach(f => (f.sectionName = section.sectionName));
  }

  /** Rebuild cached non-button list from masterTemplate for Provider Details (used after delete/move). */
  private refreshProviderCacheFromTemplate(): void {
    const section = this.masterTemplate.sections?.find(s => s.sectionName === this.PROVIDER_SECTION_NAME);
    if (!section) return;

    let cached = this.providerNonButtonFieldsCache.get(this.PROVIDER_SECTION_NAME);
    if (!cached) {
      cached = [];
      this.providerNonButtonFieldsCache.set(this.PROVIDER_SECTION_NAME, cached);
    } else {
      cached.length = 0;
    }

    (section.fields || []).forEach(f => {
      if (f?.type !== 'button') cached!.push(f);
    });
  }

  /** Resolve main section vs subsection (sectionName can be "Main.Sub"). */
  private resolveFieldsArray(sectionPath: string): TemplateField[] | null {
    const container = this.resolveContainerByPath(sectionPath);
    return container?.fields ?? null;
  }



  deleteAccordionSection(sectionName: string, event: Event): void {
    event.stopPropagation();
    if (confirm('Are you sure you want to delete this section?')) {
      if (this.masterTemplate.sections && Array.isArray(this.masterTemplate.sections)) {
        const index = this.masterTemplate.sections.findIndex(sec => sec.sectionName === sectionName);
        //if (index > -1) {
        //  this.masterTemplate.sections.splice(index, 1);
        //}
        if (index > -1) {
          const deletedSection = this.masterTemplate.sections[index];
          const sectionName = deletedSection.sectionName;

          // ✅ Move to unavailableSections
          this.unavailableSections.push(sectionName);

          // Remove from current template
          this.masterTemplate.sections.splice(index, 1);
        }
      }
      delete this.activeSections[sectionName];
    }
  }
  activeSubSections: { [key: string]: boolean } = {};

  objectKeys(obj: any): string[] {
    return obj ? Object.keys(obj) : [];
  }

  toggleSubSection(subSectionKey: string): void {
    this.activeSubSections[subSectionKey] = !this.activeSubSections[subSectionKey];
  }

  deleteSubSection(mainSection: string, subKey: string, event: Event): void {
    event.stopPropagation();
    const main = this.masterTemplate.sections?.find(sec => sec.sectionName === mainSection);
    if (main?.subsections) {
      delete main.subsections[subKey];
    }
  }
  getSortedSubsections(subsections: { [key: string]: TemplateSectionModel }): TemplateSectionModel[] {
    return Object.values(subsections).sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  updateSection(updatedSection: TemplateSectionModel) {
    if (this.masterTemplate.sections) {
      const index = this.masterTemplate.sections.findIndex(sec => sec.sectionName === this.selectedSectionObject?.sectionName);
      if (index !== -1) {
        this.masterTemplate.sections[index].sectionName = updatedSection.sectionName;
      }
    }
  }

  moveFieldToAvailable(field: TemplateField, sectionName: string, event: Event): void {
    event.stopPropagation();

    let wasRemoved = false;

    // Remove from current section/subsection
    if (sectionName.includes('.')) {
      const [mainSectionName, subSectionName] = sectionName.split('.');
      const mainSection = this.masterTemplate.sections?.find(sec => sec.sectionName === mainSectionName);
      const subSection = mainSection?.subsections?.[subSectionName];
      if (subSection?.fields) {
        const index = subSection.fields.findIndex((f: TemplateField) => f.id === field.id);
        if (index > -1) {
          subSection.fields.splice(index, 1);
          wasRemoved = true;
        }
      }
    } else {
      const section = this.masterTemplate.sections?.find(sec => sec.sectionName === sectionName);
      if (section?.fields) {
        const index = section.fields.findIndex(f => f.id === field.id);
        if (index > -1) {
          section.fields.splice(index, 1);
          wasRemoved = true;
        }
      }
    }


    // If removed from Provider Details, refresh cached list so the grid stays in sync
    if (wasRemoved && sectionName === this.PROVIDER_SECTION_NAME) {
      this.refreshProviderCacheFromTemplate();
    }

    // Move field to the correct target if it was removed
    if (wasRemoved) {
      const displayName = field.displayName || field.label || field.id;
      const originalSection = field.sectionName || sectionName;

      const fieldWithSection: TemplateField = {
        ...field,
        displayName,
        label: displayName,
        sectionName: originalSection
      };

      // If field came from master template (sectionName exists), add to unavailable
      if (field.sectionName) {
        if (!this.unavailableFieldsGrouped[originalSection]) {
          this.unavailableFieldsGrouped[originalSection] = [];
        }
        this.unavailableFieldsGrouped[originalSection].push(fieldWithSection);

        this.unavailableFieldsList.push(fieldWithSection); // optional: for flat list usage
      } else {
        // Otherwise add to default available list
        this.availableFields.push(fieldWithSection);
      }

      this.forceAngularChangeDetection();
    }
  }

  forceAngularChangeDetection(): void {
    setTimeout(() => {
      this.masterTemplate = { ...this.masterTemplate }; // Trigger change detection
    }, 0);
  }

  onDragStarted(field: TemplateField, section: string) {
    if (section !== 'available') {
      field.isActive = true;
      this.forceAngularChangeDetection();
    }
  }

  onDragEnded(field: TemplateField, section: string) {
    if (section !== 'available') {
      field.isActive = false;
      this.forceAngularChangeDetection();
    }
  }

  dropSection(event: CdkDragDrop<any[]>): void {
    const data = event.item.data;
    console.log('Creating new empty section');
    // 🔹 CASE 1: Dragged "New Empty Section" tile
    if (data && typeof data === 'object' && (data as any).kind === 'emptySection') {
      // Ensure sections array exists
      const sections = this.masterTemplate.sections || [];
      const maxOrder = sections.length
        ? Math.max(...sections.map(s => s.order ?? 0))
        : 0;
      console.log('Creating new empty section');
      const sectionName = `New Section ${this.emptySectionCounter++}`;

      const newSection: TemplateSectionModel = {
        sectionName,
        order: maxOrder + 1,
        fields: []
      };

      this.masterTemplate.sections = [...sections, newSection];

      sections.push(newSection);

      // 🔸 Make this section a valid drop target for fields
      if (!this.allDropLists.includes(sectionName)) {
        this.allDropLists.push(sectionName);
      }

      // Open & select it so user can immediately add fields
      this.activeSections[sectionName] = true;
      this.selectedSectionObject = newSection;

      this.forceAngularChangeDetection();
      return;
    }

    // 🔹 CASE 2: Existing template section (string name) – your original logic
    const sectionName: string = data as string;

    const sectionToRestore = this.originalMasterTemplate.sections?.find(
      s => s.sectionName === sectionName
    );

    if (sectionToRestore) {
      const alreadyExists = this.masterTemplate.sections?.some(
        s => s.sectionName === sectionName
      );
      if (alreadyExists) {
        console.warn(`Section '${sectionName}' already exists.`);
        return;
      }

      this.masterTemplate.sections = this.masterTemplate.sections || [];
      this.masterTemplate.sections.push(
        JSON.parse(JSON.stringify(sectionToRestore))
      );

      if (!this.allDropLists.includes(sectionName)) {
        this.allDropLists.push(sectionName);
      }

      this.activeSections[sectionName] = true;

      const index = this.unavailableSections.indexOf(sectionName);
      if (index > -1) {
        this.unavailableSections.splice(index, 1);
      }

      if (this.unavailableFieldsGrouped[sectionName]) {
        delete this.unavailableFieldsGrouped[sectionName];
      }

      this.unavailableFieldsList = this.unavailableFieldsList.filter(
        f => f.sectionName !== sectionName
      );

      this.forceAngularChangeDetection();
    }
  }

  openValidationDialog(): void {
    if (!this.selectedTemplateId || this.selectedTemplateId === 0) {
      this.snackBar.open('Please select a template to manage validations', 'Close', { duration: 3000 });
      return;
    }

    this.authService.getTemplateValidation(this.selectedTemplateId).subscribe({
      next: (response: any) => {
        console.log('Validation API Response:', response); // DEBUG

        let validations: any[] = [];

        try {
          // FIX: Use correct casing "ValidationJson" instead of "validationJson"
          validations = response?.ValidationJson
            ? JSON.parse(response.ValidationJson)
            : [];
        } catch (e) {
          console.error('Failed to parse ValidationJson:', e);
        }


        const dialogRef = this.dialog.open(ValidationDialogComponent, {
          width: '1300px',
          maxWidth: '1300px',
          data: {
            templateId: this.selectedTemplateId,
            validations,
            templateJson: this.masterTemplate
          }
        });

        dialogRef.afterClosed().subscribe((result: any) => {
          console.log('Returned validations:', result);
          if (result) {
            const payload = {
              templateId: this.selectedTemplateId,
              validationJson: JSON.stringify(result)
            };
            this.authService.updateTemplateValidation(payload).subscribe(() => {
              this.snackBar.open('Validations saved successfully!', 'Close', { duration: 3000 });
            });
          }
        });
      },
      error: (err) => {
        console.error('Error fetching validation rules:', err);
      }
    });
  }

  // Left panel collapse state
  leftPanelGroups = {
    available: true,
    predefinedSubsections: true,
    unavailSections: true,
    unavailFields: true
  };

  get totalUnavailableFieldCount(): number {
    if (!this.unavailableFieldsGrouped) return 0;
    return Object.keys(this.unavailableFieldsGrouped)
      .reduce((sum, key) => sum + (this.unavailableFieldsGrouped[key]?.length || 0), 0);
  }

  toggleLeftPanelGroup(key: 'available' | 'predefinedSubsections' | 'unavailSections' | 'unavailFields'): void {
    this.leftPanelGroups[key] = !this.leftPanelGroups[key];
  }

  getSectionFieldCount(section: TemplateSectionModel): number {
    if (!section) {
      return 0;
    }

    let count = 0;

    const countFields = (fields?: TemplateField[]) => {
      if (!Array.isArray(fields)) {
        return;
      }
      fields.forEach(f => {
        // If this is a row layout with sub-fields, count the children
        if (f.layout === 'row' && Array.isArray(f.fields) && f.fields.length) {
          count += f.fields.length;
        } else {
          count += 1;
        }
      });
    };

    countFields(section.fields);

    if (section.subsections) {
      Object.values(section.subsections).forEach((sub: TemplateSectionModel) => {
        countFields(sub.fields);
      });
    }

    return count;
  }

  onAddFieldClicked(section: TemplateSectionModel, event: Event): void {
    event.stopPropagation();
    // For now just select the section – user can drag fields into it
    this.selectSection(section);
  }

  onSectionSettings(section: TemplateSectionModel, event: Event): void {
    event.stopPropagation();
    console.log('Section settings clicked:', section.sectionName);
    // Hook to a settings dialog here later if needed
  }

  private createEmptySection(): any {
    const name = `New Section ${this.emptySectionCounter++}`;

    return {
      sectionName: name,
      fields: []
    };
  }

  private ensureMasterTemplateSections(): void {
    if (!this.masterTemplate) {
      this.masterTemplate = { sections: [] } as any;
    }
    if (!this.masterTemplate.sections) {
      this.masterTemplate.sections = [];
    }
  }

  private normalizeVisibilityForSave(template: any) {
    const walkFields = (fields: any[]) => {
      for (const f of (fields || [])) {
        // row containers
        if (f.layout === 'row' && Array.isArray(f.fields)) walkFields(f.fields);

        // normalize conditions
        const conds = (f.conditions && Array.isArray(f.conditions)) ? f.conditions : [];
        if (conds.length === 0) {
          f.conditions = [{ showWhen: 'always', referenceFieldId: null, value: null }];
        } else {
          // ensure first is valid + first operator cleared
          f.conditions[0].showWhen = f.conditions[0].showWhen ?? 'always';
          delete f.conditions[0].operatorWithPrev;
        }

        // (optional) keep backward-compatible flat fields in sync
        const first = f.conditions[0];
        f.showWhen = first.showWhen ?? 'always';
        f.referenceFieldId = first.referenceFieldId ?? null;
        f.visibilityValue = first.value ?? null;
      }
    };

    const normalizeTarget = (t: any) => {
      if (!t) return;
      const conds = (t.conditions && Array.isArray(t.conditions)) ? t.conditions : [];
      if (conds.length === 0) {
        t.conditions = [{ showWhen: 'always', referenceFieldId: null, value: null }];
      } else {
        t.conditions[0].showWhen = t.conditions[0].showWhen ?? 'always';
        delete t.conditions[0].operatorWithPrev;
      }

      const first = t.conditions[0];
      t.showWhen = first.showWhen ?? 'always';
      t.referenceFieldId = first.referenceFieldId ?? null;
      t.visibilityValue = (first.value === undefined ? null : first.value);
    };

    const walkSections = (sections: any[]) => {
      for (const s of (sections || [])) {
        // normalize section/subsection conditional rules as well
        normalizeTarget(s);
        walkFields(s.fields || []);
        const subs = s.subsections;
        if (Array.isArray(subs)) walkSections(subs);
        else if (subs && typeof subs === 'object') walkSections(Object.values(subs));
      }
    };

    walkSections(template?.sections || []);
  }

  selectSubSection(section: any, subSection: any, event?: Event): void {
    event?.stopPropagation();
    if (this.selectedField) this.selectedField.isActive = false;

    this.selectedField = null;
    this.selectedSubSectionObject = subSection;
    this.selectedSubSectionPath = `${section.sectionName}.${subSection.subsectionKey || subSection.sectionName}`;
    this.selectedSectionObject = section;
    this.selectedSectionObject = subSection;
    console.log('Selected subsection:', this.selectedSubSectionPath);
  }


  saveSelectedSubSection(): void {
    if (!this.selectedSubSectionObject || !this.selectedSubSectionPath) return;

    const container = this.resolveContainerByPath(this.selectedSubSectionPath);
    if (!container) return;

    Object.assign(container, this.selectedSubSectionObject);
  }

}
