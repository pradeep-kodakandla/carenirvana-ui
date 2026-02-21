import { Component, Input, Output, EventEmitter, OnDestroy, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Subject, of } from 'rxjs';
import { catchError, finalize, takeUntil, tap } from 'rxjs/operators';
import { CasedetailService, CaseDocumentDto } from 'src/app/service/casedetail.service';
import { DatasourceLookupService } from 'src/app/service/crud.service';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';

export interface AnyField {
  id: string;
  type: string;
  displayName?: string;
  label?: string;
  sectionName?: string;
  datasource?: string;
  options?: any[];
  selectedOptions?: string[];
  required?: boolean;
  requiredMsg?: string;
  info?: string;
  order?: number;

  // IMPORTANT: required so HTML never sees undefined
  controlName: string;
}

@Component({
  selector: 'app-casedocuments',
  templateUrl: './casedocuments.component.html',
  styleUrls: ['./casedocuments.component.css'],
})
export class CasedocumentsComponent implements OnInit, OnDestroy, OnChanges {
  // --------------------------
  // Inputs/Outputs (Dashboard / Embedded support)
  // --------------------------
  @Input() caseHeaderId?: number = 27;
  @Input() levelId?: number = 1;
  @Input() caseTemplateId?: number = 2;

  /** When true, this component is rendered inside a dashboard/single panel area */
  @Input() singlePane: boolean = false;

  /** Parent can pulse this true to force opening Add screen */
  @Input() startAdd: boolean = false;

  /** Back-compat */
  @Input() mode: 'add' | 'full' = 'full';

  /** Preferred input */
  @Input() inputMode: 'add' | 'full' = 'full';

  /** Read-only flag — set by shell for non-latest levels. */
  private _readOnly = false;

  @Input()
  set readOnly(v: boolean) {
    this._readOnly = !!v;
    this.applyReadOnly();
  }
  get readOnly(): boolean {
    return this._readOnly;
  }

  setReadOnly(v: boolean): void {
    this.readOnly = v;
  }

  private applyReadOnly(): void {
    if (!this.form) return;
    if (this._readOnly) {
      this.form.disable({ emitEvent: false });
    } else {
      this.form.enable({ emitEvent: false });
    }
  }

  /** Parent can switch to view-all/list mode */
  @Output() requestViewAll = new EventEmitter<void>();

  /** Parent can switch to add-only/editor mode */
  @Output() requestAddOnly = new EventEmitter<void>();

  // Layout flags for embedded mode
  isAddOnly: boolean = false;
  showLeftPane: boolean = true;
  showRightPane: boolean = true;
  editorOnlyLayout: boolean = false;

  loading = false;
  saving = false;
  errorMsg = '';

  templateSection: any;
  fields: AnyField[] = [];

  documents: CaseDocumentDto[] = [];

  showEditor = false;
  editing?: CaseDocumentDto;

  form!: FormGroup;

  selectedFiles: File[] = [];
  selectedFileNames: string[] = [];

  // ✅ like CaseDetails: options are cached by CONTROL NAME
  dropdownOptions: Record<string, UiSmartOption[]> = {};

  private destroy$ = new Subject<void>();

  // When in embedded list-only mode, clicking add/edit needs to switch mode first
  private pendingAddFromList = false;
  private pendingEditDoc: CaseDocumentDto | null = null;

  // --------------------------
  // AuthActivity/AuthNotes-style UX state
  // --------------------------
  searchTerm = '';
  showSort = false;
  sortBy: 'created_desc' | 'created_asc' | 'type_asc' | 'type_desc' | 'files_first' = 'created_desc';
  selectedDocId: string | null = null;

  constructor(
    private fb: FormBuilder,
    private api: CasedetailService,
    private dsLookup: DatasourceLookupService
  ) { }

  ngOnInit(): void {
    this.form = this.fb.group({});
    this.reload();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const effectiveMode: 'add' | 'full' = (this.inputMode ?? this.mode ?? 'full') as any;

    // Embedded behavior (singlePane): mutually exclusive panes
    if (this.singlePane) {
      this.isAddOnly = effectiveMode === 'add';
      this.editorOnlyLayout = this.isAddOnly;

      // View-all: left only
      if (!this.isAddOnly) {
        this.showLeftPane = true;
        this.showRightPane = false;
        this.showEditor = false;
      } else {
        // Add/Edit: right only
        this.showLeftPane = false;
        this.showRightPane = true;
        this.showEditor = true;
      }
    } else {
      // Standalone behavior: keep both panes
      this.isAddOnly = false;
      this.editorOnlyLayout = false;
      this.showLeftPane = true;
      this.showRightPane = true;
    }

    // Reload when case context changes
    if (changes['caseHeaderId'] || changes['levelId'] || changes['caseTemplateId']) {
      if (this.form) this.reload();
    }

    // Parent pulse: open Add screen when in editor-only mode (or standalone)
    if (changes['startAdd'] && this.startAdd && (this.singlePane ? this.isAddOnly : true)) {
      this.openAddInternal();
    }

    // Apply pending action after switching list-only -> editor-only
    if (this.singlePane && this.isAddOnly) {
      if (this.pendingEditDoc) {
        const d = this.pendingEditDoc;
        this.pendingEditDoc = null;
        this.openEditInternal(d);
      } else if (this.pendingAddFromList) {
        this.pendingAddFromList = false;
        this.openAddInternal();
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // --------------------------
  // Embedded mode: parent mode-switch requests
  // --------------------------
  emitViewAll(): void {
    this.requestViewAll.emit();
  }

  emitAddOnly(): void {
    this.requestAddOnly.emit();
  }

  // ---------------------- LOAD -------------------
  reload(): void {
    this.loading = true;
    this.errorMsg = '';
    this.documents = [];
    this.templateSection = undefined;
    this.fields = [];
    this.dropdownOptions = {};

    // Keep embedded add-only mode in editor view
    if (this.singlePane && this.isAddOnly) {
      this.openAddInternal();
    } else {
      this.closeEditor();
    }

    if (this.caseHeaderId == null || this.levelId == null) {
      this.loading = false;
      this.errorMsg = 'Pass caseHeaderId and levelId (and caseTemplateId for template-driven editor).';
      return;
    }

    // 1) load documents list
    this.api
      .getDocuments(this.caseHeaderId, this.levelId)
      .pipe(
        tap((res) => {
          const list = res?.documents ?? [];
          this.documents = list.filter((x: any) => !!x && !!x.documentId);
        }),
        catchError((err) => {
          this.errorMsg = err?.error?.message ?? 'Unable to load documents.';
          return of(null);
        }),
        finalize(() => (this.loading = false))
      )
      .subscribe();

    // 2) load template (optional but needed for dynamic editor)
    if (this.caseTemplateId != null) {
      this.api
        .getTemplate(this.caseTemplateId)
        .pipe(
          tap((tpl) => {
            // depending on your API shape
            this.templateSection = tpl?.section ?? tpl?.Section ?? tpl;
            this.applyTemplate(this.templateSection);
          }),
          catchError(() => of(null))
        )
        .subscribe();
    }
  }

  // --------------------------
  // Left panel search/sort
  // --------------------------
  applySearch(): void {
    // getter handles filtering
  }

  applySort(key: 'created_desc' | 'created_asc' | 'type_asc' | 'type_desc' | 'files_first'): void {
    this.sortBy = key;
    this.showSort = false;
  }

  get filteredDocuments(): CaseDocumentDto[] {
    const src = Array.isArray(this.documents) ? [...this.documents] : [];

    const q = (this.searchTerm ?? '').trim().toLowerCase();
    const searched = q
      ? src.filter((d) => {
        const type = (this.getDocTypeLabel(d) ?? '').toLowerCase();
        const level = (this.getDocLevelLabel(d) ?? '').toLowerCase();
        const desc = String((d as any)?.documentDescription ?? '').toLowerCase();
        const created = String((d as any)?.createdOn ?? '').toLowerCase();
        const files = this.getFiles(d).join(' ').toLowerCase();
        return type.includes(q) || level.includes(q) || desc.includes(q) || created.includes(q) || files.includes(q);
      })
      : src;

    const asDate = (d: CaseDocumentDto) => {
      const raw = (d as any)?.createdOn;
      const dt = raw ? new Date(raw) : null;
      return dt && !isNaN(dt.getTime()) ? dt.getTime() : 0;
    };

    switch (this.sortBy) {
      case 'created_asc':
        searched.sort((a, b) => asDate(a) - asDate(b));
        break;
      case 'type_asc':
        searched.sort((a, b) => (this.getDocTypeLabel(a) || '').localeCompare(this.getDocTypeLabel(b) || ''));
        break;
      case 'type_desc':
        searched.sort((a, b) => (this.getDocTypeLabel(b) || '').localeCompare(this.getDocTypeLabel(a) || ''));
        break;
      case 'files_first':
        searched.sort((a, b) => this.getFiles(b).length - this.getFiles(a).length || (asDate(b) - asDate(a)));
        break;
      case 'created_desc':
      default:
        searched.sort((a, b) => asDate(b) - asDate(a));
        break;
    }

    return searched;
  }

  clearSelection(): void {
    if (this.singlePane) {
      // in embedded/dashboard mode, delegate to parent
      this.emitViewAll();
      return;
    }
    this.selectedDocId = null;
    this.closeEditor();
  }

  getSelectedDoc(): CaseDocumentDto | null {
    if (!this.selectedDocId) return null;
    return this.documents.find(d => String(this.getDocumentId(d)) === String(this.selectedDocId)) ?? null;
  }

  // ---------------------- TEMPLATE -> FORM ----------------------
  private applyTemplate(sectionOrTemplate: any): void {
    const all = this.flattenFields(sectionOrTemplate);

    // keep everything except the grid row; label can be rendered as info (no control)
    this.fields = all
      .filter((f) => !!f?.id && f.id !== 'caseDocumentsGrid')
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const group: Record<string, FormControl> = {};

    for (const f of this.fields) {
      if (!this.isInputField(f)) continue; // label etc. -> no control

      const v: any[] = [];
      if (f.required) v.push(Validators.required);

      group[f.controlName] = new FormControl(this.defaultValueForField(f), v);
    }

    this.form = this.fb.group(group);

    // ✅ load dropdowns exactly like CaseDetails
    this.prefetchDropdownOptions(this.fields);
  }

  private isInputField(f: AnyField): boolean {
    if (!f) return false;
    if (f.type === 'label') return false;
    // template says "caseSelectFiles" type is text, so special-case by id
    if (f.id === 'caseSelectFiles') return false; // we handle with <input type=file>
    return true;
  }

  private defaultValueForField(f: AnyField): any {
    if (f.type === 'checkbox') return false;
    return null;
  }

  // supports: section.fields, section.subsections[].fields, template.sections[].(fields/subsections), deep nesting
  private flattenFields(sectionOrTemplate: any): AnyField[] {
    const out: AnyField[] = [];

    const walk = (node: any, currentSectionName?: string) => {
      if (!node) return;

      const secName =
        node?.sectionName ??
        node?.sectionDisplayName ??
        currentSectionName ??
        'Case Documents';

      if (Array.isArray(node.fields)) {
        for (const raw of node.fields) {
          const sectionName = raw?.sectionName ?? secName;
          out.push({
            ...raw,
            sectionName,
            controlName: this.buildControlName(sectionName, raw.id),
          } as AnyField);
        }
      }

      if (Array.isArray(node.subsections)) {
        for (const sub of node.subsections) walk(sub, secName);
      }

      if (Array.isArray(node.sections)) {
        for (const s of node.sections) walk(s, secName);
      }
    };

    walk(sectionOrTemplate, 'Case Documents');
    return out;
  }

  private normalizeKey(s: string): string {
    return (s ?? '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\w]/g, '');
  }

  private buildControlName(sectionName: string, fieldId: string): string {
    return `${this.normalizeKey(sectionName)}_${fieldId}`;
  }

  // ---------------------- DROPDOWNS (CaseDetails-style) ----------------------
  private prefetchDropdownOptions(fields: AnyField[]): void {
    // 1) static dropdowns (no datasource) -> options[]
    for (const f of fields) {
      const hasDs = !!String(f.datasource ?? '').trim();
      if (f.type === 'select' && !hasDs) {
        const opts = this.mapStaticOptions(f.options ?? f.selectedOptions ?? []);
        if (opts.length) {
          this.dropdownOptions[f.controlName] = opts;
          this.reconcileControlValue(f.controlName);
        }
      }
    }

    // 2) datasource dropdowns -> getOptionsWithFallback()
    const selects = fields.filter((f) => f.type === 'select' && !!String(f.datasource ?? '').trim());

    // group by datasource
    const byDs = new Map<string, AnyField[]>();
    for (const f of selects) {
      const ds = String(f.datasource ?? '').trim();
      if (!ds) continue;
      const list = byDs.get(ds) ?? [];
      list.push(f);
      byDs.set(ds, list);
    }

    for (const [ds, dsFields] of byDs.entries()) {
      this.dsLookup
        .getOptionsWithFallback(
          ds,
          (r: any) => {
            const value = r?.value ?? r?.id ?? r?.code;
            const label =
              r?.text ??
              r?.name ??
              r?.description ??
              this.pickDisplayField(r) ??
              String(value ?? '');
            return { value, label } as UiSmartOption;
          },
          ['AG']
        )
        .pipe(takeUntil(this.destroy$))
        .subscribe((opts: UiSmartOption[] | null) => {
          for (const f of dsFields) {
            this.dropdownOptions[f.controlName] = opts ?? [];
            this.reconcileControlValue(f.controlName);
          }
        });
    }
  }

  private mapStaticOptions(raw: any[]): UiSmartOption[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((x) => {
        if (x == null) return null;
        if (typeof x === 'string' || typeof x === 'number') return { value: x, label: String(x) } as UiSmartOption;

        const value = x?.value ?? x?.id ?? x?.code ?? x?.key;
        const label = x?.label ?? x?.text ?? x?.name ?? x?.description ?? String(value ?? '');
        return { value, label } as UiSmartOption;
      })
      .filter(Boolean) as UiSmartOption[];
  }

  private pickDisplayField(row: any): string | null {
    if (!row) return null;
    const skip = new Set([
      'id',
      'value',
      'code',
      'activeFlag',
      'createdBy',
      'createdOn',
      'updatedBy',
      'updatedOn',
      'deletedBy',
      'deletedOn',
    ]);

    for (const k of Object.keys(row)) {
      if (skip.has(k)) continue;
      const v = row[k];
      if (typeof v === 'string' && v.trim().length > 0) return v;
    }
    return null;
  }

  // HTML helper
  getDropdownOptions(controlName: string): UiSmartOption[] {
    return this.dropdownOptions?.[controlName] ?? [];
  }

  // ---------------------- UI ACTIONS ----------------------
  openAdd(): void {
    if (this._readOnly) return;
    // In embedded list-only mode, switch to editor-only first.
    if (this.singlePane && !this.isAddOnly) {
      this.pendingAddFromList = true;
      this.emitAddOnly();
      return;
    }
    this.openAddInternal();
  }

  private openAddInternal(): void {
    this.editing = undefined;
    this.showEditor = true;
    this.selectedFiles = [];
    this.selectedFileNames = [];
    this.errorMsg = '';
    this.form?.reset();

    // keep selection consistent
    this.selectedDocId = null;
  }

  openEdit(doc: CaseDocumentDto): void {
    if (this._readOnly) {
      this.selectedDocId = '' + this.getDocumentId(doc);
      return;
    }
    // In embedded list-only mode, switch to editor-only first.
    if (this.singlePane && !this.isAddOnly) {
      this.pendingEditDoc = doc;
      this.emitAddOnly();
      return;
    }
    this.openEditInternal(doc);
  }

  private openEditInternal(doc: CaseDocumentDto): void {
    this.editing = doc;
    this.showEditor = true;
    this.errorMsg = '';

    // keep selection in sync
    this.selectedDocId = String(this.getDocumentId(doc) ?? '');

    this.selectedFiles = [];
    this.selectedFileNames = this.getFiles(doc);

    // patch using field IDs (template-driven)
    const typeCn = this.getControlNameByFieldId('caseDocumentType');
    const levelCn = this.getControlNameByFieldId('documentLevel');

    const typeVal = typeCn ? (this.findOption(typeCn, doc.documentType)?.value ?? doc.documentType) : doc.documentType;
    const levelVal = levelCn ? (this.findOption(levelCn, doc.documentLevel)?.value ?? doc.documentLevel) : doc.documentLevel;

    this.form?.reset();
    this.setValueByFieldId('caseDocumentType', typeVal);
    this.setValueByFieldId('documentLevel', levelVal);
    this.setValueByFieldId('caseDocumentDesc', doc.documentDescription);
  }

  closeEditor(): void {
    this.showEditor = false;
    this.editing = undefined;
    this.selectedFiles = [];
    this.selectedFileNames = [];
    this.errorMsg = '';
    this.form?.reset();
  }

  onFilesSelected(evt: Event): void {
    const input = evt.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.selectedFiles = files;
    this.selectedFileNames = files.map((f) => f.name);
  }

  removeFile(i: number): void {
    this.selectedFiles.splice(i, 1);
    this.selectedFileNames.splice(i, 1);
  }

  // ---------------------- SAVE / DELETE ----------------------
  onSave(): void {
    if (this._readOnly) return;
    if (this.caseHeaderId == null || this.levelId == null) return;

    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const docType = Number(this.getValueByFieldId('caseDocumentType') ?? 0);
    const docLevel = Number(this.getValueByFieldId('documentLevel') ?? 0);
    const desc = String(this.getValueByFieldId('caseDocumentDesc') ?? '');

    this.saving = true;

    if (!this.editing) {
      this.api
        .createDocument(this.caseHeaderId, this.levelId, {
          documentType: docType,
          documentLevel: docLevel,
          documentDescription: desc,
          fileNames: this.selectedFileNames, // ✅ only filenames for now
        })
        .pipe(finalize(() => (this.saving = false)))
        .subscribe({
          next: () => {
            this.closeEditor();
            this.reload();
            (this as any).showSavedMessage?.('Document saved successfully');
          },
          error: (err) => (this.errorMsg = err?.error?.message ?? 'Unable to save document.'),
        });
    } else {
      this.api
        .updateDocument(this.caseHeaderId, this.levelId, this.editing.documentId, {
          documentType: docType,
          documentLevel: docLevel,
          documentDescription: desc,
          // not updating files here (can be a later endpoint)
        })
        .pipe(finalize(() => (this.saving = false)))
        .subscribe({
          next: () => {
            this.clearSelection();
            this.reload();
            (this as any).showSavedMessage?.('Document updated successfully');
          },
          error: (err) => (this.errorMsg = err?.error?.message ?? 'Unable to update document.'),
        });
    }
  }

  onDelete(doc: CaseDocumentDto): void {
    if (this._readOnly) return;
    if (this.caseHeaderId == null || this.levelId == null) return;
    if (!confirm('Delete this document?')) return;

    this.saving = true;
    this.api
      .deleteDocument(this.caseHeaderId, this.levelId, doc.documentId)
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          // if deleted selected doc, clear selection
          if (this.selectedDocId && String(doc.documentId) === String(this.selectedDocId)) {
            this.selectedDocId = null;
          }
          this.reload();
        },
        error: (err) => (this.errorMsg = err?.error?.message ?? 'Unable to delete document.'),
      });
  }

  // ----------------------
  // Read-only Selected display helpers
  // ----------------------
  getDisplayFieldsForSelected(): AnyField[] {
    const hiddenIds = new Set(['caseselectfiles']);
    return (this.fields ?? []).filter(f => {
      const t = String(f.type ?? '').toLowerCase();
      const id = String(f.id ?? '').toLowerCase();
      if (t === 'label') return false;
      if (hiddenIds.has(id)) return false;
      return true;
    });
  }

  getSelectedFieldDisplayValue(doc: CaseDocumentDto, f: AnyField): string {
    const raw = this.getSelectedFieldRawValue(doc, f);
    if (raw === null || raw === undefined || raw === '') return '—';

    const t = String(f.type ?? '').toLowerCase();
    if (t === 'select') {
      return this.getLabelFromControlOptions(f.controlName, raw);
    }
    if (t === 'checkbox') {
      return raw === true ? 'Yes' : 'No';
    }
    return String(raw);
  }

  private getSelectedFieldRawValue(doc: CaseDocumentDto, f: AnyField): any {
    const id = String(f.id ?? '').toLowerCase();

    switch (id) {
      case 'casedocumenttype':
        return (doc as any)?.documentType ?? (doc as any)?.caseDocumentType ?? (doc as any)?.documentTypeId ?? null;

      case 'documentlevel':
        return (doc as any)?.documentLevel ?? (doc as any)?.level ?? (doc as any)?.documentLevelId ?? null;

      case 'casedocumentdesc':
        return (doc as any)?.documentDescription ?? '';

      default:
        // fallback: if dto has matching key
        const direct = (doc as any)?.[f.id as any];
        return direct !== undefined ? direct : null;
    }
  }

  // ---------------------- FIELD ID HELPERS ----------------------
  private getControlNameByFieldId(fieldId: string): string | null {
    const f = this.fields.find((x) => x.id === fieldId);
    return f?.controlName ?? null;
  }

  private getValueByFieldId(fieldId: string): any {
    const cn = this.getControlNameByFieldId(fieldId);
    if (!cn) return null;
    return this.form.get(cn)?.value;
  }

  private setValueByFieldId(fieldId: string, value: any): void {
    const cn = this.getControlNameByFieldId(fieldId);
    if (!cn) return;
    this.form.get(cn)?.setValue(value);
  }

  getDocumentId(d?: CaseDocumentDto): any {
    return (d as any)?.documentId;
  }

  getFiles(d: CaseDocumentDto): string[] {
    const arr = (d as any)?.fileNames ?? (d as any)?.files;
    return Array.isArray(arr) ? arr.map((x: any) => String(x)) : [];
  }

  // trackBy
  trackByDoc = (i: number, d: any) => d?.documentId ?? i;
  trackByField = (_: number, f: AnyField) => f.controlName;

  private findOption(controlName: string, rawValue: any): UiSmartOption | null {
    const opts = this.dropdownOptions?.[controlName] ?? [];
    if (!opts.length) return null;

    // strict match first
    const exact = opts.find(o => o.value === rawValue);
    if (exact) return exact;

    // then loose match (string/number mismatch)
    const loose = opts.find(o => String(o.value) === String(rawValue));
    return loose ?? null;
  }

  private reconcileControlValue(controlName: string): void {
    const ctrl = this.form?.get(controlName);
    if (!ctrl) return;

    const val = ctrl.value;
    if (val == null || val === '') return;

    const found = this.findOption(controlName, val);
    if (!found) return;

    // Force the control value to EXACT option.value (fixes "2" vs 2)
    if (found.value !== val) {
      ctrl.setValue(found.value, { emitEvent: false });
    }

    ctrl.updateValueAndValidity({ emitEvent: false });
  }

  private getLabelFromControlOptions(controlName: string | null, rawValue: any): string {
    if (!controlName) return String(rawValue ?? '');
    const opts = this.dropdownOptions?.[controlName] ?? [];
    const hit = opts.find(o => String((o as any).value) === String(rawValue));
    return hit ? String((hit as any).label ?? (hit as any).text ?? (hit as any).name ?? rawValue) : String(rawValue ?? '');
  }

  // For cards: show label instead of id
  getDocTypeLabel(d: CaseDocumentDto): string {
    const cn = this.getControlNameByFieldId('caseDocumentType');
    const opt = cn ? this.findOption(cn, (d as any)?.documentType) : null;
    return opt?.label ?? String((d as any)?.documentType ?? '');
  }

  getDocLevelLabel(d: CaseDocumentDto): string {
    const cn = this.getControlNameByFieldId('documentLevel');
    const opt = cn ? this.findOption(cn, (d as any)?.documentLevel) : null;
    return opt?.label ?? String((d as any)?.documentLevel ?? '');
  }

  get documentsWithFilesCount(): number {
    const docs = this.documents ?? [];
    return docs.filter(d => (this.getFiles(d)?.length ?? 0) > 0).length;
  }

}
