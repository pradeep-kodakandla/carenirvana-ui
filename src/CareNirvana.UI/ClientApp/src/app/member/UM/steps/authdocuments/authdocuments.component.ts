import { Component, OnDestroy } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError, finalize, mapTo, takeUntil, tap } from 'rxjs/operators';

import { DatasourceLookupService } from 'src/app/service/crud.service';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';
import { AuthDetailApiService } from 'src/app/service/authdetailapi.service';

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
export class AuthdocumentsComponent implements OnDestroy {
  authNumber: string = '0';
  authDetailId: number | null = null;
  authTemplateId: number | null = null;

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

  constructor(
    private fb: FormBuilder,
    private api: AuthDetailApiService,
    private dsLookup: DatasourceLookupService
  ) { }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // --------------------------
  // Context (called by WizardShell)
  // --------------------------
  // add these private fields
  private resolvingCtx = false;
  private lastLoadedKey: string | null = null;

  // inside setContext()
  setContext(ctx: any): void {
    const nextDetailId = Number(ctx?.authDetailId ?? 0) || null;
    const nextTemplateId = Number(ctx?.authTemplateId ?? 0) || null;

    const changed =
      nextDetailId !== this.authDetailId ||
      nextTemplateId !== this.authTemplateId;

    this.authNumber = String(ctx?.authNumber ?? this.authNumber ?? '0');
    this.authDetailId = nextDetailId;
    this.authTemplateId = nextTemplateId;

    // Load when both ids exist.
    // NOTE: Shell may set authDetailId/authTemplateId as plain fields BEFORE calling setContext.
    // In that case `changed` can be false even though this step has never loaded; guard with lastLoadedKey.
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
        this.authDetailId = this.authDetailId ?? detailId;
        this.authTemplateId = this.authTemplateId ?? templateId;

        if (this.authDetailId && this.authTemplateId) {
          this.reload(this.authDetailId, this.authTemplateId);
        } else {
          this.errorMsg = 'Missing authorization context (authDetailId/authTemplateId).';
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
    this.documents = [];
    this.fields = [];
    this.dropdownOptions = {};
    this.closeEditor();
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
        },
        error: (e) => {
          console.error(e);
          this.errorMsg = 'Unable to load authorization documents.';
        }
      });
  }

  private reloadDocsOnly(): void {
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
      .subscribe((d: any) => (this.documents = d ?? []));
  }

  // --------------------------
  // Template -> fields + form
  // --------------------------
  private applyTemplate(sectionOrTemplate: any): void {
    const all = this.flattenFields(sectionOrTemplate);

    // keep everything except grid row (label stays for info UI)
    this.fields = all
      .filter(f => !!f?.id && f.id !== 'authorizationDocumentsGrid')
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    // map docType controlName for label resolution
    this.docTypeControlName = this.getControlNameByFieldId('authorizationDocumentType');

    // build form ONLY for input fields
    const group: Record<string, FormControl> = {};
    for (const f of this.fields) {
      if (!this.isInputField(f)) continue;

      const v: any[] = [];
      if (this.isRequiredField(f)) v.push(Validators.required);

      group[f.controlName] = new FormControl(this.defaultValueForField(f), v);
    }
    this.form = this.fb.group(group);

    // dropdowns
    this.prefetchDropdownOptions(this.fields);
  }

  private isInputField(f: AnyField): boolean {
    if (!f) return false;
    const t = String(f.type ?? '').toLowerCase();
    if (t === 'label') return false;
    if (f.id === 'authorizationSelectFiles') return false; // handled via <input type=file>
    return true;
  }

  private isRequiredField(f: AnyField): boolean {
    return !!(f.required ?? f.isRequired);
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
        node?.sectionDisplayName ??
        currentSectionName ??
        'Authorization Documents';

      if (Array.isArray(node.fields)) {
        for (const raw of node.fields) {
          const id = String(raw?.id ?? raw?.fieldId ?? '').trim();
          if (!id) continue;

          out.push({
            ...raw,
            id,
            type: String(raw?.type ?? 'text').toLowerCase(),
            controlName: this.buildControlName(secName, id)
          } as AnyField);
        }
      }

      const subs = node?.subsections;
      if (Array.isArray(subs)) {
        for (const s of subs) walk(s, secName);
      } else if (subs && typeof subs === 'object') {
        for (const s of Object.values(subs)) walk(s, secName);
      }

      const secs = node?.sections;
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
      .replace(/[^\w]/g, '');
  }

  private buildControlName(sectionName: string, fieldId: string): string {
    return `${this.normalizeKey(sectionName)}_${fieldId}`;
  }

  private getControlNameByFieldId(fieldId: string): string | null {
    const f = this.fields.find(x => String(x.id) === fieldId);
    return f?.controlName ?? null;
  }

  private getValueByFieldId(fieldId: string): any {
    const cn = this.getControlNameByFieldId(fieldId);
    return cn ? this.form.get(cn)?.value : null;
  }

  private setValueByFieldId(fieldId: string, value: any): void {
    const cn = this.getControlNameByFieldId(fieldId);
    if (!cn) return;
    const ctrl = this.form.get(cn);
    if (!ctrl) return;
    ctrl.setValue(value, { emitEvent: false });
  }

  // --------------------------
  // Dropdown options (CaseDocuments-style => FIX ID->LABEL)
  // --------------------------
  private prefetchDropdownOptions(fields: AnyField[]): void {
    // 1) static options
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
          const arr = opts ?? [];
          for (const f of dsFields) {
            this.dropdownOptions[f.controlName] = arr;
            this.reconcileControlValue(f.controlName);
          }
        });
    }
  }

  private mapStaticOptions(raw: any[]): UiSmartOption[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map(x => {
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
    const skip = new Set(['id', 'value', 'code', 'activeFlag', 'createdBy', 'createdOn', 'updatedBy', 'updatedOn', 'deletedBy', 'deletedOn']);
    for (const k of Object.keys(row)) {
      if (skip.has(k)) continue;
      const v = row[k];
      if (typeof v === 'string' && v.trim().length) return v;
    }
    return null;
  }

  getDropdownOptions(controlName: string): UiSmartOption[] {
    return this.dropdownOptions?.[controlName] ?? [];
  }

  private reconcileControlValue(controlName: string): void {
    const ctrl = this.form.get(controlName);
    if (!ctrl) return;
    const v = ctrl.value;
    if (v == null || v === '') return;

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
  // Editor actions (AuthNotes-like UI)
  // --------------------------
  openAdd(): void {
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
    this.editing = d;
    this.showEditor = true;
    this.errorMsg = '';
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
          return of(void 0);
        })
      )
      .subscribe(() => {
        this.closeEditor();
        this.reloadDocsOnly();
      });
  }

  onDelete(d: AuthDocumentDto): void {
    if (!this.authDetailId) return;
    const docId = this.getDocumentId(d);
    if (!docId) return;

    if (!confirm('Delete this document?')) return;

    const userId = Number(sessionStorage.getItem('loggedInUserid') || 0);

    this.saving = true;
    this.api.deleteDocument(this.authDetailId, docId, userId)
      .pipe(
        finalize(() => (this.saving = false)),
        catchError((e) => {
          this.errorMsg = e?.error?.message ?? 'Unable to delete document.';
          return of(void 0);
        })
      )
      .subscribe(() => this.reloadDocsOnly());
  }

  // --------------------------
  // Card helpers (label resolution)
  // --------------------------
  getDocumentId(d?: AuthDocumentDto): string | null {
    return (d as any)?.documentId ?? (d as any)?.id ?? null;
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

  trackByDoc = (_: number, d: AuthDocumentDto) => String(this.getDocumentId(d) ?? _);
  trackByField = (_: number, f: AnyField) => String(f.controlName || f.id || _);
}
