import {
  Component, OnInit, Input, Output, EventEmitter, OnChanges, SimpleChanges,
  ViewChild
} from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { CrudService } from 'src/app/service/crud.service';
import { MembersummaryService } from 'src/app/service/membersummary.service';
import { ViewChildren, QueryList, ElementRef } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

type DropdownOption = { id: number | null; label: string };

type FieldType = 'select' | 'file' | 'textarea' | 'label' | 'text';

interface MemberDocument {
  memberDocumentId?: number;
  memberId: number;
  documentTypeId?: number | null;
  documentName: string;
  documentBytes?: string; // base64 (no data: prefix) for POST/PUT
  createdOn?: string | null;
  createdBy?: number | null;
  updatedBy?: number | null;
  updatedOn?: string | null;
  deletedBy?: number | null;
  deletedOn?: string | null;

  // UI-only helpers
  _documentTypeLabel?: string;
  _createdOnDisplay?: string;
}
interface DocumentField {
  id: string;
  displayName: string;
  type: FieldType;
  required?: boolean;
  requiredMsg?: string;
  hidden?: boolean;

  // values / UI
  value?: any;
  displayLabel?: string;

  // for select
  options?: DropdownOption[];
  filteredOptions?: DropdownOption[];
  showDropdown?: boolean;
  highlightedIndex?: number;

  // for label
  info?: string;
}


@Component({
  selector: 'app-member-documents',
  templateUrl: './member-documents.component.html',
  styleUrl: './member-documents.component.css',
})
export class MemberDocumentsComponent implements OnInit, OnChanges {
  @Input() memberId!: number;

  // left side
  searchTerm = '';
  showSort = false;

  // right side
  isFormVisible = false;
  canAdd = true;
  canEdit = true;
  showValidationErrors = false;
  loading = false;

  // table / paging
  dataSource = new MatTableDataSource<MemberDocument>([]);
  total = 0;
  page = 1;
  pageSize = 25;

  // selection
  selected?: MemberDocument;
  selectedDocId?: number;

  // summary (right side AI Summary)
  summary = { total: 0, lastUploaded: '—' };

  // dropdown: document type (replace with your backed master if available)
  documentTypeOptions: DropdownOption[] = [];

  // dynamic form model (driven by your HTML)
  documentFields: DocumentField[] = [];

  // files selected in the form
  private selectedFiles: File[] = [];

  // refs (kept if you later add native pickers)
  @ViewChildren('hiddenPickers') hiddenPickers!: QueryList<ElementRef<HTMLInputElement>>;

  constructor(private api: MembersummaryService, private crudService: CrudService) {
    // filter predicate for search
    this.dataSource.filterPredicate = (d: MemberDocument, filter: string) => {
      const hay = `${d.documentName || ''} ${d._documentTypeLabel || ''} ${d._createdOnDisplay || ''}`.toLowerCase();
      return hay.includes(filter);
    };
  }

  ngOnInit(): void {

    this.crudService.getData('um', 'documenttype').subscribe({
      next: (response: any[]) => {
        // normalize into DropdownOption[]
        this.documentTypeOptions = (response ?? []).map(opt => {
          const idNum = Number(opt?.id);
          return {
            id: Number.isFinite(idNum) ? idNum : null,
            // adjust the label fallback chain if your API uses a different prop
            label: opt?.documentType ?? opt?.name ?? opt?.text ?? opt?.label ?? 'Unknown'
          };
        });

        // push options into the Note Type field + refresh its filtered list
        const f = this.getField('documentTypeId');
        if (f) {
          f.options = this.documentTypeOptions;
          f.filteredOptions = [...this.documentTypeOptions]; // or: this.filterOptions(f);
          // refresh display label if there was a preselected value
          const sel = this.documentTypeOptions.find(o => o.id === f.value);
          if (sel) f.displayLabel = sel.label;
        }

        // if notes are already loaded, refresh their computed labels
        this.dataSource.data.forEach(n => {
          n._documentTypeLabel =
            this.documentTypeOptions.find(o => o.id === (n.documentTypeId ?? null))?.label ?? '—';
        });
      },
      error: _ => { this.documentTypeOptions = []; }
    });

    this.configureFormFields();
    if (this.memberId) this.reload();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['memberId'] && !changes['memberId'].firstChange) {
      this.page = 1;
      this.reload();
    }
  }

  // ---------------------------
  // Form model (right panel)
  // ---------------------------
  private configureFormFields(): void {
    this.documentFields = [
      {
        id: 'documentTypeId',
        displayName: 'Document Type',
        type: 'select',
        required: true,
        options: this.documentTypeOptions,
        filteredOptions: [...this.documentTypeOptions],
        showDropdown: false,
        highlightedIndex: 0,
        displayLabel: ''
      },
      {
        id: 'documentName',
        displayName: 'Document Name',
        type: 'text',
        required: true,
        value: ''
      },
      {
        id: 'uploadFiles',
        displayName: 'Attach Files',
        type: 'file'
      },
      {
        id: 'info',
        displayName: 'Tip',
        type: 'label',
        info: 'You can attach multiple files. File name will be used as default document name.'
      }
    ];
  }

  // ---------------------------
  // Load list
  // ---------------------------
  reload(): void {
    this.loading = true;
    this.api.listDocuments(this.memberId, this.page, this.pageSize, false).subscribe({
      next: (res: any) => {
        // coalesce both casing styles (Items vs items)
        const raw = (res.items ?? res.Items ?? []) as any[];
        const docs: MemberDocument[] = raw.map(it => ({
          memberDocumentId: it.memberDocumentId ?? it.MemberDocumentId ?? it.memberdocumentid,
          memberId: it.memberId ?? it.MemberId ?? it.memberid,
          documentTypeId: it.documentTypeId ?? it.DocumentTypeId ?? it.documenttypeid ?? null,
          documentName: it.documentName ?? it.DocumentName ?? it.documentname ?? '',
          createdOn: it.createdOn ?? it.CreatedOn ?? it.createdon ?? null,
          createdBy: it.createdBy ?? it.CreatedBy ?? it.createdby ?? null,
          updatedBy: it.updatedBy ?? it.UpdatedBy ?? it.updatedby ?? null,
          updatedOn: it.updatedOn ?? it.UpdatedOn ?? it.updatedon ?? null,
          deletedBy: it.deletedBy ?? it.DeletedBy ?? it.deletedby ?? null,
          deletedOn: it.deletedOn ?? it.DeletedOn ?? it.deletedon ?? null
        }));

        // decorate
        docs.forEach(d => {
          d._documentTypeLabel = this.documentTypeOptions.find(o => o.id === (d.documentTypeId ?? null))?.label ?? '—';
          d._createdOnDisplay = d.createdOn ? new Date(d.createdOn).toLocaleString() : '';
        });

        this.dataSource.data = docs;
        this.total = res.total ?? res.Total ?? docs.length;
        this.applyFilter(); // updates summary, too
        this.loading = false;
      },
      error: _ => {
        this.dataSource.data = [];
        this.total = 0;
        this.applyFilter();
        this.loading = false;
      }
    });
  }

  // ---------------------------
  // Search / Sort
  // ---------------------------
  applyFilter(_: any = null): void {
    this.dataSource.filter = (this.searchTerm || '').trim().toLowerCase();
    this.computeSummary(this.dataSource.filteredData);
  }

  applySort(key: 'authorizationDocumentTypeLabel_asc' | 'authorizationDocumentTypeLabel_desc' | 'createdOn_desc' | 'createdOn_asc'): void {
    // keep keys as-is to match your HTML (can rename later)
    const data = [...this.dataSource.filteredData];
    switch (key) {
      case 'authorizationDocumentTypeLabel_asc':
        data.sort((a, b) => (a._documentTypeLabel ?? '').localeCompare(b._documentTypeLabel ?? ''));
        break;
      case 'authorizationDocumentTypeLabel_desc':
        data.sort((a, b) => (b._documentTypeLabel ?? '').localeCompare(a._documentTypeLabel ?? ''));
        break;
      case 'createdOn_desc':
        data.sort((a, b) => new Date(b.createdOn ?? 0).getTime() - new Date(a.createdOn ?? 0).getTime());
        break;
      case 'createdOn_asc':
        data.sort((a, b) => new Date(a.createdOn ?? 0).getTime() - new Date(b.createdOn ?? 0).getTime());
        break;
    }
    this.dataSource.data = data;
    this.applyFilter();
  }

  // ---------------------------
  // Open / Edit / Delete
  // ---------------------------
  openForm(mode: 'add' | 'edit', doc?: MemberDocument): void {
    this.isFormVisible = true;
    this.showValidationErrors = false;
    this.selectedFiles = [];
    const f = this.getDocTypeField();
    if (f) {
      f.showDropdown = false;
    }
    if (mode === 'add') {
      this.selected = undefined;
      this.selectedDocId = undefined;
      this.setField('documentTypeId', null, '');
      this.setField('documentName', '');
    } else if (mode === 'edit' && doc) {
      this.selected = doc;
      this.selectedDocId = doc.memberDocumentId;
      const label = this.documentTypeOptions.find(o => o.id === (doc.documentTypeId ?? null))?.label ?? '';
      this.setField('documentTypeId', doc.documentTypeId ?? null, label);
      this.setField('documentName', doc.documentName ?? '');
    }
    this.closeAllDropdowns();
  }

  cancelForm(): void {
    this.isFormVisible = false;
    this.selected = undefined;
    this.selectedDocId = undefined;
    this.selectedFiles = [];
  }

  onContentClick(_: MouseEvent, doc: MemberDocument): void {
    // Optional: highlight selection
    this.selectedDocId = doc.memberDocumentId;
    this.selected = doc;
  }
  trackByDoc = (_: number, d: any) => d?.memberDocumentId ?? d?.id ?? _;

  editDocument(doc: MemberDocument): void {
    if (!this.canEdit) return;
    this.openForm('edit', doc);
  }

  deleteDocument(doc: MemberDocument): void {
    if (!this.canEdit || !doc.memberDocumentId) return;
    const deletedBy = this.getUserIdOrNull() ?? 0;
    if (!confirm('Delete this document?')) return;

    this.api.deleteDocument(doc.memberDocumentId, deletedBy).subscribe({
      next: () => this.reload(),
      error: (err: HttpErrorResponse) => console.error('Delete failed', err)
    });
  }

  // ---------------------------
  // File handling
  // ---------------------------
  handleFileUpload(evt: Event): void {
    const input = evt.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.selectedFiles = files;

    // If Document Name empty and single file picked, default it
    const nameField = this.getField('documentName');
    if (files.length === 1 && nameField && (!nameField.value || !String(nameField.value).trim())) {
      nameField.value = files[0].name;
    }
  }

  private normalizeOptionsToValueLabel(opts: any[]) {
    return (opts ?? []).map(o =>
      ('value' in o) ? o : { value: Number(o.id), label: String(o.label) }
    );
  }

  // ---------------------------
  // Save (Create / Update)
  // ---------------------------
  async saveDocument(form: any): Promise<void> {

    console.log('Form submit', form);
    const nowIso = new Date().toISOString();

    // validate requireds
    const typeField = this.getField('documentTypeId');
    const nameField = this.getField('documentName');
    if (typeField) {
      typeField.options = this.normalizeOptionsToValueLabel(typeField.options || []);
      typeField.filteredOptions = typeField.options.slice();
      typeField.highlightedIndex = 0;
    }
    this.showValidationErrors = true;

    const valid =
      !!typeField && (typeField.value !== undefined) &&
      !!nameField && !!(nameField.value && String(nameField.value).trim().length > 0);

    console.log('Validation Values', valid, typeField?.value, nameField?.value);
    console.log('Validation', valid, typeField, nameField);

    if (!valid) return;

    const documentTypeId: number | null = typeField.value ?? null;
    const documentName: string = String(nameField.value).trim();
    const userId = this.getUserIdOrNull();

    try {
      if (!this.selectedDocId) {
        // CREATE: allow multiple files
        if (this.selectedFiles.length === 0) {
          alert('Please attach at least one file.'); return;
        }

        const tasks = this.selectedFiles.map(async (f) => {
          const base64 = await this.api.fileToBase64(f);
          const payload: MemberDocument = {
            memberId: this.memberId,
            documentTypeId,
            documentName: documentName || f.name,
            documentBytes: base64,
            createdBy: userId ?? null,
            createdOn: nowIso,        // <-- include timestamp here
          };
          console.log('Creating document', payload);
          return firstValueFrom(this.api.createDocument(payload as any)); // 
        });

        await Promise.all(tasks);

      } else {
        // UPDATE:
        // Always send bytes (backend update expects it).
        let base64: string | undefined;
        if (this.selectedFiles.length > 0) {
          base64 = await this.api.fileToBase64(this.selectedFiles[0]);
        } else {
          const current = await firstValueFrom(this.api.getDocumentById(this.selectedDocId));
          base64 = current.documentBytes; // already base64 from API
        }

        const payload: MemberDocument = {
          memberDocumentId: this.selectedDocId,
          memberId: this.memberId,
          documentTypeId,
          documentName,
          documentBytes: base64,
          updatedBy: userId ?? null,
          updatedOn: nowIso,
        };

        await firstValueFrom(this.api.updateDocument(this.selectedDocId, payload as any));
      }

      this.isFormVisible = false;
      this.reload();

    } catch (err) {
      console.error('Save failed', err);
    }
  }

  // ---------------------------
  // Summary
  // ---------------------------
  private computeSummary(list: MemberDocument[]): void {
    const total = list.length;

    let lastTs = -Infinity;
    for (const d of list) {
      if (d.createdOn) {
        const t = new Date(d.createdOn).getTime();
        if (!Number.isNaN(t) && t > lastTs) lastTs = t;
      }
    }

    this.summary = {
      total,
      lastUploaded: lastTs > 0 ? new Date(lastTs).toLocaleString() : '—'
    };
  }

  // ---------------------------
  // Select helpers (dropdown)
  // ---------------------------
  filterOptions(field: DocumentField): void {
    const q = (field.displayLabel ?? '').toLowerCase();
    const base = field.options ?? [];
    field.filteredOptions = q ? base.filter(o => o.label.toLowerCase().includes(q)) : [...base];
    field.highlightedIndex = 0;
    field.showDropdown = (field.filteredOptions?.length ?? 0) > 0;
  }

  onFieldFocus(field: DocumentField): void {
    field.showDropdown = (field.filteredOptions?.length ?? 0) > 0;
  }

  onSelectBlur(field: DocumentField): void {
    setTimeout(() => (field.showDropdown = false), 150);
  }

  handleDropdownKeydown(evt: KeyboardEvent, field: any) {
    if (!field.filteredOptions?.length) return;
    const max = field.filteredOptions.length - 1;

    if (evt.key === 'ArrowDown') {
      field.highlightedIndex = Math.min(max, (field.highlightedIndex ?? 0) + 1);
      evt.preventDefault();
    } else if (evt.key === 'ArrowUp') {
      field.highlightedIndex = Math.max(0, (field.highlightedIndex ?? 0) - 1);
      evt.preventDefault();
    } else if (evt.key === 'Enter') {
      const opt = field.filteredOptions[field.highlightedIndex ?? 0];
      if (opt) this.selectDropdownOption(field, opt);
      evt.preventDefault();
    }
  }

  private closeAllDropdowns() {
    (this.documentFields ?? []).forEach((f: any) => f.showDropdown = false);
  }

  // ---------------------------
  // Utils
  // ---------------------------
  private getUserIdOrNull(): number | null {
    const v = sessionStorage.getItem('loggedInUserid');
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private getField(id: string): DocumentField | undefined {
    return this.documentFields.find(f => f.id === id);
  }

  private setField(id: string, value?: any, displayLabel?: string): void {
    const f = this.getField(id);
    if (!f) return;
    f.value = value;
    if (displayLabel !== undefined) f.displayLabel = displayLabel;
    if (f.type === 'select') this.filterOptions(f);
  }

  // Find the Document Type field (supports common ids)
  private getDocTypeField() {
    const candidates = ['documentTypeId', 'authorizationDocumentTypeId', 'docTypeId'];
    //return this.documentFields?.find((f: any) => candidates.includes(f.id));
    return this.documentFields?.find((f: any) => f.id === 'documentTypeId');
  }

  // Open dropdown on click (not focus)
  onFieldClick(field: any) {
    field.filteredOptions = (field.options || []).slice();
    field.showDropdown = true;
    field.highlightedIndex = 0;
  }

  // When user picks an option
  selectDropdownOption(field: any, option: any) {
    const raw = (option?.value ?? option?.id);
    const val = Number.isFinite(Number(raw)) ? Number(raw) : null;

    field.displayLabel = option?.label ?? '';
    field.value = val;
    field.showDropdown = false;
  }

}
