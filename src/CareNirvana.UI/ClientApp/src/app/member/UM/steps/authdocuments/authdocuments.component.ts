import { Component, OnDestroy, OnChanges, SimpleChanges, Input, Output, EventEmitter } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError, finalize, mapTo, takeUntil, tap } from 'rxjs/operators';

import { DatasourceLookupService } from 'src/app/service/crud.service';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';
import { AuthDetailApiService } from 'src/app/service/authdetailapi.service';
import { WizardToastService } from 'src/app/member/UM/components/authwizardshell/wizard-toast.service';
import { AuthunsavedchangesawareService } from 'src/app/member/UM/services/authunsavedchangesaware.service';

import {
  AuthDocumentDto,
  CreateAuthDocumentRequest,
  UpdateAuthDocumentRequest,
  TemplateSectionResponse
} from 'src/app/member/UM/services/authdetail';

type AnyField = {
  id: string;
  type: string;
  displayName?: string;
  label?: string;
  datasource?: string;
  options?: any[];
  selectedOptions?: any[];
  required?: boolean;
  isRequired?: boolean;
  requiredMsg?: string;
  info?: string;
  order?: number;

  // MUST exist so HTML never sees undefined
  controlName: string;
};

@Component({
  selector: 'app-authdocuments',
  templateUrl: './authdocuments.component.html',
  styleUrls: ['./authdocuments.component.css']
})
export class AuthdocumentsComponent implements OnDestroy, OnChanges, AuthunsavedchangesawareService {
// --------------------------
// Inputs/Outputs (AssignedAuths embedded mode)
// --------------------------
@Input() authNumber: string = '0';
@Input() authDetailId: number | null = null;
@Input() authTemplateId: number | null = null;

/** When true, component is rendered inside AssignedAuths right panel */
@Input() singlePane: boolean = false;

/** Parent can pulse this true to force opening Add screen */
@Input() startAdd: boolean = false;

/** Back-compat */
@Input() mode: 'add' | 'full' = 'full';

/** Preferred input */
@Input() inputMode: 'add' | 'full' = 'full';

@Output() requestViewAll = new EventEmitter<void>();
@Output() requestAddOnly = new EventEmitter<void>();

// Layout flags for embedded mode
isAddOnly: boolean = false;
showLeftPane: boolean = true;
showRightPane: boolean = true;
editorOnlyLayout: boolean = false;

  loading = false;
  saving = false;
  errorMsg = '';

  template?: TemplateSectionResponse;

  fields: AnyField[] = [];
  documents: AuthDocumentDto[] = [];

  showEditor = false;
  editing?: AuthDocumentDto;

  form: FormGroup = this.fb.group({});

  selectedFileNames: string[] = [];

  dropdownOptions: Record<string, UiSmartOption[]> = {};

  private docTypeControlName: string | null = null;
  private destroy$ = new Subject<void>();

  // When in embedded list-only mode, clicking add/edit needs to switch mode first
  private pendingAddFromList = false;
  private pendingEditDoc: AuthDocumentDto | null = null;

  // --------------------------
  // AuthActivity/AuthNotes-style UX state
  // --------------------------
  searchTerm = '';
  showSort = false;
  sortBy: 'created_desc' | 'created_asc' | 'type_asc' | 'type_desc' | 'files_first' = 'created_desc';
  selectedDocId: string | null = null;

  constructor(
    private fb: FormBuilder,
    private api: AuthDetailApiService,
    private dsLookup: DatasourceLookupService,
    private toastSvc: WizardToastService
  ) { }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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

  // Context changes (auth inputs)
  if (changes['authDetailId'] || changes['authTemplateId'] || changes['authNumber']) {
    this.setContext({
      authNumber: this.authNumber,
      authDetailId: this.authDetailId,
      authTemplateId: this.authTemplateId
    });
  }

  // Parent pulse: open Add screen when in editor-only mode
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


  // --------------------------
  // Context (called by WizardShell)
  // --------------------------
  private resolvingCtx = false;
  private lastLoadedKey: string | null = null;

  setContext(ctx: any): void {
    const nextDetailId = Number(ctx?.authDetailId ?? 0) || null;
    const nextTemplateId = Number(ctx?.authTemplateId ?? 0) || null;

    const changed =
      String(ctx?.authNumber ?? '') !== String(this.authNumber ?? '') ||
      nextDetailId !== this.authDetailId ||
      nextTemplateId !== this.authTemplateId;

    this.authNumber = String(ctx?.authNumber ?? this.authNumber ?? '0');
    this.authDetailId = nextDetailId;
    this.authTemplateId = nextTemplateId;

    if (this.authDetailId && this.authTemplateId) {
      const key = this.makeCtxKey(this.authDetailId, this.authTemplateId);
      if (changed || this.lastLoadedKey !== key) {
        this.reload(this.authDetailId, this.authTemplateId);
        return;
      }
    }

    // Fallback: resolve missing context from authNumber (same idea as AuthNotes)
    if (changed && (!this.authDetailId || !this.authTemplateId)) {
      this.tryResolveContextFromAuthNumber();
    }
  }

  private tryResolveContextFromAuthNumber(): void {
    if (this.resolvingCtx) return;
    const num = String(this.authNumber ?? '').trim();
    if (!num || num === '0') return;

    this.resolvingCtx = true;
    this.api.getByNumber(num)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => (this.resolvingCtx = false)),
        catchError((e) => {
          console.error('AuthDocuments: failed to resolve context by authNumber', num, e);
          return of(null as any);
        })
      )
      .subscribe((row: any) => {
        if (!row) return;

        const detailId = this.toNum(row?.authDetailId ?? row?.authDetailID ?? row?.id);
        const templateId = this.toNum((row as any)?.authTemplateId ?? (row as any)?.authTemplateID ?? row?.authClassId);

        // Only patch missing values to avoid flapping.
        let shouldReload = false;

        if (!this.authDetailId && detailId) {
          this.authDetailId = detailId;
          shouldReload = true;
        }
        if (!this.authTemplateId && templateId) {
          this.authTemplateId = templateId;
          shouldReload = true;
        }

        if (shouldReload && this.authDetailId && this.authTemplateId) {
          this.reload(this.authDetailId, this.authTemplateId);
        }
      });
  }

  private toNum(v: any): number | null {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  private makeCtxKey(authDetailId: number, authTemplateId: number): string {
    return `${authDetailId}|${authTemplateId}`;
  }

  // --------------------------
  // Load
  // --------------------------
  reload(authDetailId: number, authTemplateId: number): void {
    this.loading = true;
    this.errorMsg = '';

    this.lastLoadedKey = this.makeCtxKey(authDetailId, authTemplateId);

    forkJoin({
      docs: this.api.getDocuments(authDetailId).pipe(catchError(() => of([] as any))),
      tmpl: this.api.getAuthDocumentsTemplate(authTemplateId).pipe(catchError(() => of(undefined)))
    })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (res: any) => {
          this.documents = res?.docs ?? [];
          this.template = res?.tmpl;

          const section = (this.template as any)?.section ?? (this.template as any)?.Section;
          this.applyTemplate(section);

          // Keep selection if it still exists; otherwise clear.
          this.repairSelectionAfterListChange();
        },
        error: (e) => {
          this.errorMsg = e?.error?.message ?? 'Unable to load documents.';
        }
      });
  }

  reloadDocsOnly(): void {
    if (!this.authDetailId) return;

    this.loading = true;
    this.api.getDocuments(this.authDetailId)
      .pipe(
        finalize(() => (this.loading = false)),
        catchError((e) => {
          this.errorMsg = e?.error?.message ?? 'Unable to reload documents.';
          return of([] as any);
        })
      )
      .subscribe((d: any) => {
        this.documents = d ?? [];
        this.repairSelectionAfterListChange();
      });
  }

  private repairSelectionAfterListChange(): void {
    if (!this.selectedDocId) return;
    const ids = new Set((this.documents ?? []).map(x => String(this.getDocumentId(x))));
    if (!ids.has(String(this.selectedDocId))) {
      this.selectedDocId = null;
    }
  }

  // --------------------------
  // Template → form fields
  // --------------------------
  private applyTemplate(section: any): void {
    const fields = this.flattenFields(section);

    // stable sort by "order" then name
    this.fields = [...fields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.displayName ?? '').localeCompare(b.displayName ?? ''));

    // Create controls
    const grp: Record<string, FormControl> = {};
    for (const f of this.fields) {
      if (!this.isInputField(f)) continue;

      const validators = [];
      if (this.isRequiredField(f)) {
        validators.push(Validators.required);
      }

      grp[f.controlName] = new FormControl(this.defaultValueForField(f), validators);
    }

    this.form = this.fb.group(grp);

    // Keep handle on docType control for label resolution
    const docType = this.fields.find(x => String(x.id).toLowerCase() === 'authorizationdocumenttype');
    this.docTypeControlName = docType?.controlName ?? null;

    // Preload dropdown options
    this.prefetchDropdownOptions(this.fields);
  }

  private isInputField(f: AnyField): boolean {
    const t = String(f.type ?? '').toLowerCase();
    if (t === 'label') return false;
    // file picker is handled specially in HTML but still an "input" concept for required checks
    return true;
  }

  private isRequiredField(f: AnyField): boolean {
    return !!(f.required || f.isRequired);
  }

  private defaultValueForField(f: AnyField): any {
    const t = String(f.type ?? '').toLowerCase();
    if (t === 'checkbox') return false;
    if (t === 'textarea') return '';
    return null;
  }

  // supports deep nesting; UM may use subsections as {} not []
  private flattenFields(sectionOrTemplate: any): AnyField[] {
    const out: AnyField[] = [];

    const walk = (node: any, currentSectionName?: string) => {
      if (!node) return;

      const secName =
        node?.sectionName ??
        node?.SectionName ??
        node?.name ??
        node?.title ??
        currentSectionName ??
        'Authorization Documents';

      const rawFields = node?.fields ?? node?.Fields ?? node?.elements;
      if (Array.isArray(rawFields)) {
        for (const raw of rawFields) {
          const id = String(raw?.id ?? raw?.ID ?? raw?.key ?? '').trim();
          if (!id) continue;

          out.push({
            id,
            type: String(raw?.type ?? 'text').toLowerCase(),
            displayName: raw?.displayName ?? raw?.DisplayName ?? raw?.label ?? raw?.Label ?? id,
            label: raw?.label ?? raw?.Label,
            datasource: raw?.datasource ?? raw?.Datasource,
            options: raw?.options ?? raw?.Options,
            selectedOptions: raw?.selectedOptions ?? raw?.SelectedOptions,
            required: !!(raw?.required ?? raw?.Required),
            isRequired: !!(raw?.isRequired ?? raw?.IsRequired),
            requiredMsg: raw?.requiredMsg ?? raw?.RequiredMsg,
            info: raw?.info ?? raw?.Info,
            order: raw?.order ?? raw?.Order,
            controlName: this.buildControlName(secName, id)
          } as AnyField);
        }
      }

      const subs = node?.subsections ?? node?.Subsections;
      if (Array.isArray(subs)) {
        for (const s of subs) walk(s, secName);
      } else if (subs && typeof subs === 'object') {
        for (const s of Object.values(subs)) walk(s, secName);
      }

      const secs = node?.sections ?? node?.Sections;
      if (Array.isArray(secs)) {
        for (const s of secs) walk(s, secName);
      } else if (secs && typeof secs === 'object') {
        for (const s of Object.values(secs)) walk(s, secName);
      }
    };

    walk(sectionOrTemplate, 'Authorization Documents');
    return out;
  }

  private normalizeKey(s: string): string {
    return (s ?? '')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\w]/g, '_')
      .replace(/_+/g, '_')
      .toLowerCase();
  }

  private buildControlName(sectionName: string, fieldId: string): string {
    const sec = this.normalizeKey(sectionName);
    const id = this.normalizeKey(fieldId);
    return `${sec}__${id}`;
  }

  private getValueByFieldId(fieldId: string): any {
    const f = this.fields.find(x => String(x.id).toLowerCase() === String(fieldId).toLowerCase());
    if (!f) return null;
    return this.form.get(f.controlName)?.value ?? null;
  }

  private setValueByFieldId(fieldId: string, v: any): void {
    const f = this.fields.find(x => String(x.id).toLowerCase() === String(fieldId).toLowerCase());
    if (!f) return;
    const ctrl = this.form.get(f.controlName);
    if (!ctrl) return;
    ctrl.setValue(v, { emitEvent: false });
  }

  // --------------------------
  // Datasource options
  // --------------------------
  private prefetchDropdownOptions(fields: AnyField[]): void {
    // 1) static options
    for (const f of fields) {
      const hasDs = !!String(f.datasource ?? '').trim();
      if (f.type === 'select' && !hasDs) {
        const opts = this.mapStaticOptions(f);
        if (opts.length) {
          this.dropdownOptions[f.controlName] = opts;
          this.reconcileControlValue(f.controlName);
        }
      }
    }

    // 2) datasource selects
    const selects = fields.filter(f => f.type === 'select' && !!String(f.datasource ?? '').trim());

    const byDs = new Map<string, AnyField[]>();
    for (const f of selects) {
      const ds = String(f.datasource ?? '').trim();
      const list = byDs.get(ds) ?? [];
      list.push(f);
      byDs.set(ds, list);
    }

    for (const [ds, dsFields] of byDs.entries()) {
      this.dsLookup.getOptionsWithFallback(
        ds,
        (r: any) => {
          const value = r?.value ?? r?.id ?? r?.code;
          const label =
            r?.documentType ??
            r?.name ??
            r?.description ??
            String(value ?? '');
          return { value, label } as UiSmartOption;
        },
        ['AG']
      )
        .pipe(takeUntil(this.destroy$))
        .subscribe((opts: UiSmartOption[] | null) => {
          const arr = opts ?? [];
          for (const f of dsFields) {
            this.dropdownOptions[f.controlName] = arr;
            this.reconcileControlValue(f.controlName);
          }
        });
    }
  }


  private mapStaticOptions(f: AnyField): UiSmartOption[] {
    const opts = (f.options ?? f.selectedOptions ?? []) as any[];
    if (!Array.isArray(opts) || !opts.length) return [];

    return opts.map((o: any) => ({
      label: String(o?.label ?? o?.text ?? o?.name ?? o?.value ?? ''),
      value: o?.value ?? o?.id ?? o?.key ?? o?.label ?? o?.text
    })) as UiSmartOption[];
  }

  getDropdownOptions(controlName: string): UiSmartOption[] {
    return this.dropdownOptions?.[controlName] ?? [];
  }

  private reconcileControlValue(controlName: string): void {
    const ctrl = this.form.get(controlName);
    if (!ctrl) return;

    const v = ctrl.value;
    if (v === null || v === undefined || v === '') return;

    const opts = this.dropdownOptions?.[controlName] ?? [];
    if (!opts.length) return;

    // accept number/string mismatches
    const hit = opts.find(o => String((o as any).value) === String(v));
    if (hit && (oValue(hit) !== v)) {
      ctrl.setValue(oValue(hit), { emitEvent: false });
    }

    function oValue(o: any) { return o?.value; }
  }

  // --------------------------
  // Left panel search/sort/select
  // --------------------------
  applySearch(): void {
    // getter handles filtering
  }

  applySort(key: 'created_desc' | 'created_asc' | 'type_asc' | 'type_desc' | 'files_first'): void {
    this.sortBy = key;
    this.showSort = false;
  }

  get filteredDocuments(): AuthDocumentDto[] {
    const src = Array.isArray(this.documents) ? [...this.documents] : [];

    const q = (this.searchTerm ?? '').trim().toLowerCase();
    const searched = q
      ? src.filter((d) => {
        const type = (this.getDocTypeLabel(d) ?? '').toLowerCase();
        const desc = String((d as any)?.documentDescription ?? '').toLowerCase();
        const created = String((d as any)?.createdOn ?? '').toLowerCase();
        const files = this.getFiles(d).join(' ').toLowerCase();
        return type.includes(q) || desc.includes(q) || created.includes(q) || files.includes(q);
      })
      : src;

    const asDate = (d: AuthDocumentDto) => {
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

  selectDoc(d: AuthDocumentDto): void {
    this.selectedDocId = String(this.getDocumentId(d) ?? '');
    this.showEditor = false; // viewing mode
  }
  clearSelection(): void {
    if (this.singlePane) {
      this.emitViewAll();
      return;
    }
    this.selectedDocId = null;
    this.showEditor = false;
    this.editing = undefined;
  }

  getSelectedDoc(): AuthDocumentDto | null {
    if (!this.selectedDocId) return null;
    return this.documents.find(d => String(this.getDocumentId(d)) === String(this.selectedDocId)) ?? null;
  }

  // --------------------------
  // Editor actions
  // --------------------------

// --------------------------
// Embedded mode: parent mode-switch requests
// --------------------------
emitViewAll(): void {
  this.requestViewAll.emit();
}

emitAddOnly(): void {
  this.requestAddOnly.emit();
}

openAdd(): void {
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
    this.errorMsg = '';
    this.selectedFileNames = [];
    this.form.reset();

    // defaults
    this.setValueByFieldId('authorizationDocumentType', null);
    this.setValueByFieldId('authorizationDocumentDesc', '');
  }

openEdit(d: AuthDocumentDto): void {
  // In embedded list-only mode, switch to editor-only first.
  if (this.singlePane && !this.isAddOnly) {
    this.pendingEditDoc = d;
    this.emitAddOnly();
    return;
  }
  this.openEditInternal(d);
}

private openEditInternal(d: AuthDocumentDto): void {

    this.editing = d;
    this.showEditor = true;
    this.errorMsg = '';

    // keep selection in sync
    this.selectedDocId = String(this.getDocumentId(d) ?? '');

    this.selectedFileNames = this.getFiles(d);
    this.form.reset();

    const docTypeRaw =
      (d as any)?.documentType ??
      (d as any)?.authorizationDocumentType ??
      (d as any)?.docType ??
      (d as any)?.documentTypeId ??
      null;

    this.setValueByFieldId('authorizationDocumentType', docTypeRaw != null ? String(docTypeRaw) : null);
    this.setValueByFieldId('authorizationDocumentDesc', (d as any)?.documentDescription ?? '');
  }


  closeEditor(): void {
    this.showEditor = false;
    this.editing = undefined;
    this.errorMsg = '';
    this.selectedFileNames = [];
    this.form.reset();
  }

  onFilesSelected(evt: Event): void {
    const input = evt.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.selectedFileNames = files.map(f => f.name);
  }

  removeFile(i: number): void {
    this.selectedFileNames.splice(i, 1);
  }

  // --------------------------
  // Save / Delete
  // --------------------------
  onSave(): void {
    if (!this.authDetailId) return;

    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const userId = Number(sessionStorage.getItem('loggedInUserid') || 0);

    const documentType = Number(this.getValueByFieldId('authorizationDocumentType') ?? 0) || null;
    const documentDescription = String(this.getValueByFieldId('authorizationDocumentDesc') ?? '');

    const payload: CreateAuthDocumentRequest | UpdateAuthDocumentRequest = {
      documentType,
      documentDescription,
      fileNames: this.selectedFileNames
    };

    const docId = this.getDocumentId(this.editing);

    this.saving = true;
    const req$ = docId
      ? this.api.updateDocument(this.authDetailId, docId, payload as any, userId)
      : this.api.createDocument(this.authDetailId, payload as any, userId).pipe(mapTo(void 0));

    req$
      .pipe(
        finalize(() => (this.saving = false)),
        catchError((e) => {
          this.errorMsg = e?.error?.message ?? 'Unable to save document.';
          this.toastSvc.error('Unable to save document.');
          return of(void 0);
        })
      )
      .subscribe(() => {
        this.clearSelection();
        this.reloadDocsOnly();
        this.toastSvc.success('Document saved successfully.');
      });
  }

  onDelete(d: AuthDocumentDto): void {
    if (!this.authDetailId) return;
    const docId = this.getDocumentId(d);
    if (!docId) return;

    this.saving = true;
    const userId = Number(sessionStorage.getItem('loggedInUserid') || 0);
    this.api.deleteDocument(this.authDetailId, docId, userId)
      .pipe(
        finalize(() => (this.saving = false)),
        catchError((e) => {
          this.errorMsg = e?.error?.message ?? 'Unable to delete document.';
          return of(void 0);
        })
      )
      .subscribe(() => {
        // if deleted selected doc, clear selection
        if (this.selectedDocId && String(docId) === String(this.selectedDocId)) {
          this.selectedDocId = null;
        }
        this.reloadDocsOnly();
        this.toastSvc.info('Document deleted.');
      });
  }

  // --------------------------
  // Read-only Selected display helpers
  // --------------------------
  getDisplayFieldsForSelected(): AnyField[] {
    // exclude non-display fields
    const hiddenIds = new Set(['authorizationselectfiles']);
    return (this.fields ?? []).filter(f => {
      const t = String(f.type ?? '').toLowerCase();
      const id = String(f.id ?? '').toLowerCase();
      if (t === 'label') return false;
      if (hiddenIds.has(id)) return false;
      return true;
    });
  }

  getSelectedFieldDisplayValue(doc: AuthDocumentDto, f: AnyField): string {
    const raw = this.getSelectedFieldRawValue(doc, f);
    if (raw === null || raw === undefined || raw === '') return '—';

    const t = String(f.type ?? '').toLowerCase();
    if (t === 'select') {
      return this.getLabelFromControlOptions(f.controlName, raw);
    }
    return String(raw);
  }

  private getSelectedFieldRawValue(doc: AuthDocumentDto, f: AnyField): any {
    const id = String(f.id ?? '').toLowerCase();

    switch (id) {
      case 'authorizationdocumenttype':
        return (doc as any)?.documentType ?? (doc as any)?.authorizationDocumentType ?? (doc as any)?.documentTypeId ?? null;

      case 'authorizationdocumentdesc':
        return (doc as any)?.documentDescription ?? '';

      default:
        // fallback: if dto has matching key
        const direct = (doc as any)?.[f.id as any];
        return direct !== undefined ? direct : null;
    }
  }

  // --------------------------
  // Existing helpers
  // --------------------------
  getDocumentId(d?: AuthDocumentDto): any {
    return (d as any)?.documentId;
  }


  getFiles(d: AuthDocumentDto): string[] {
    const arr = (d as any)?.fileNames ?? (d as any)?.files;
    return Array.isArray(arr) ? arr.map((x: any) => String(x)) : [];
  }

  getDocTypeLabel(d: AuthDocumentDto): string {
    const raw = (d as any)?.documentType ?? (d as any)?.authorizationDocumentType ?? '';
    return this.getLabelFromControlOptions(this.docTypeControlName, raw);
  }

  private getLabelFromControlOptions(controlName: string | null, rawValue: any): string {
    if (!controlName) return String(rawValue ?? '');
    const opts = this.dropdownOptions?.[controlName] ?? [];
    const hit = opts.find(o => String((o as any).value) === String(rawValue));
    return hit ? String((hit as any).label ?? (hit as any).text ?? (hit as any).value ?? '') : String(rawValue ?? '');
  }

  // Summary helper (right pane default)
  getDocSummary(): { total: number; withFiles: number } {
    const docs = this.documents ?? [];
    return {
      total: docs.length,
      withFiles: docs.reduce((acc, d) => acc + (this.getFiles(d).length ? 1 : 0), 0)
    };
  }

  trackByDoc = (_: number, d: AuthDocumentDto) => String(this.getDocumentId(d) ?? _);
  trackByField = (_: number, f: AnyField) => String(f.controlName || f.id || _);

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
}
