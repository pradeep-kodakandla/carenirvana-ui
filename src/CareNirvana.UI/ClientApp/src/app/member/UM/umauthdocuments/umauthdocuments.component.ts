import {
  Component, OnInit, Input, Output, EventEmitter, OnChanges, SimpleChanges,
  ViewChild
} from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { CrudService } from 'src/app/service/crud.service';
import { NgForm } from '@angular/forms';

interface AuthorizationDocument {
  id: string;
  authorizationDocumentType?: string;
  authorizationDocumentDesc?: string;
  authorizationSelectFiles?: string[];
  createdOn: string;
  createdBy: string;
  updatedOn?: string;
  updatedBy?: string;
  deletedOn?: string;
  deletedBy?: string;
  authorizationDocumentTypeLabel?: string;
}

@Component({
  selector: 'app-umauthdocuments',
  templateUrl: './umauthdocuments.component.html',
  styleUrl: './umauthdocuments.component.css'
})
export class UmauthdocumentsComponent implements OnInit, OnChanges {

  @Input() documentFields: any[] = [];
  @Input() documentData: AuthorizationDocument[] = [];
  @Output() DocumentSaved = new EventEmitter<AuthorizationDocument[]>();

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  documentTypeMap = new Map<string, string>();
  documents: AuthorizationDocument[] = [];
  dataSource = new MatTableDataSource<AuthorizationDocument>();
  displayedColumns: string[] = [
    'authorizationDocumentTypeLabel',
    'authorizationDocumentDesc',
    'authorizationSelectFiles',
    'createdOn',
    'createdBy',
    'actions'
  ];


  isFormVisible: boolean = false;
  currentDocument: AuthorizationDocument | null = null;
  selectedDocumentId: string | null = null;
  searchTerm = '';
  showSort = false;
  sortBy = '';
  showValidationErrors = false;

  allowedFileTypes = ["jpeg", "png", "jpg", "bmp", "gif", "docx", "doc", "txt", "xlsx", "xls", "pdf"];

  constructor(private crudService: CrudService) { }

  ngOnInit(): void {
    this.crudService.getData('um', 'documenttype').subscribe((response) => {
      this.documentTypeMap = new Map<string, string>(
        response.map((opt: any) => [opt.id, opt.documentType])
      );

      this.mapLabels();
      this.removeEmptyRecords();
      this.dataSource.data = [...this.documents];
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    });

    this.initDropdowns();

  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.documentData) {
      this.mapLabels();
      this.removeEmptyRecords();
      this.dataSource.data = [...this.documents];
    }
  }

  mapLabels() {
    this.documents = (this.documentData || []).map(doc => ({
      ...doc,
      authorizationDocumentTypeLabel: doc.authorizationDocumentTypeLabel ||
        (this.documentTypeMap.get(doc.authorizationDocumentType || '') || 'Unknown')
    }));
  }


  initDropdowns() {
    this.documentFields.forEach(field => {
      if (field.type === 'select') {
        if (!field.value) {
          field.value = "";
          field.displayLabel = "Select";
        } else {
          const selected = field.options?.find((opt: any) => opt.value === field.value);
          field.displayLabel = selected?.label || "Select";
        }
      }
    });
  }

  openForm(mode: 'add' | 'edit') {
    this.isFormVisible = true;
    if (mode === 'add') {
      this.resetForm();
      this.currentDocument = null;
    }
  }

  cancelForm() {
    this.resetForm();
    this.currentDocument = null;
    this.isFormVisible = false;
    this.selectedDocumentId = null;
  }

  saveDocument(form: NgForm) {
    this.showValidationErrors = true;

    if (form.invalid) {
      console.warn("Form invalid. Fix validation errors.");
      return;
    }

    let newDoc: any = {};
    this.documentFields.forEach(field => {
      newDoc[field.id] = field.value;
    });

    newDoc.authorizationSelectFiles = Array.isArray(newDoc.authorizationSelectFiles)
      ? newDoc.authorizationSelectFiles
      : [newDoc.authorizationSelectFiles];

    if (this.currentDocument) {
      // Edit existing
      newDoc.id = this.currentDocument.id;
      newDoc.createdOn = this.currentDocument.createdOn;
      newDoc.createdBy = this.currentDocument.createdBy;
      newDoc.updatedOn = this.formatToEST(new Date());
      newDoc.updatedBy = "Admin";

      this.documents = this.documents.map(doc =>
        doc.id === this.currentDocument!.id ? newDoc : doc
      );
    } else {
      // Add new
      newDoc.id = new Date().getTime().toString();
      newDoc.createdOn = this.formatToEST(new Date());
      newDoc.createdBy = "Admin";

      this.documents.push(newDoc);
    }

    // ✅ Correct label mapping
    this.documents = this.documents.map(doc => ({
      ...doc,
      authorizationDocumentTypeLabel:
        this.documentTypeMap.get(doc.authorizationDocumentType || '') || 'Unknown'
    }));

    this.removeEmptyRecords();
    this.dataSource.data = [...this.documents];
    this.DocumentSaved.emit(this.documents);
    this.cancelForm();
  }


  editDocument(doc: AuthorizationDocument) {
    this.openForm('edit');
    this.selectedDocumentId = doc.id;

    // Make sure files are always array
    const normalizedDoc: AuthorizationDocument = {
      ...doc,
      authorizationSelectFiles: Array.isArray(doc.authorizationSelectFiles)
        ? doc.authorizationSelectFiles
        : [doc.authorizationSelectFiles || '']
    };

    this.currentDocument = normalizedDoc;

    this.documentFields.forEach(field => {
      const value = normalizedDoc[field.id as keyof AuthorizationDocument] || '';
      field.value = value;

      if (field.type === 'select') {
        const selected = field.options?.find((opt: any) => opt.value === value);
        field.displayLabel = selected?.label || 'Select';
      } else if (field.type === 'file') {
        // skip
      } else {
        field.displayLabel = '';
      }
    });

    this.documents = this.documents.map(doc => ({
      ...doc,
      authorizationDocumentTypeLabel:
        this.documentTypeMap.get(doc.authorizationDocumentType || '') || 'Unknown'
    }));

    this.dataSource.data = [...this.documents];
  }



  deleteDocument(documentId: string) {

    const confirmDelete = confirm("Are you sure you want to delete this document?");
    if (!confirmDelete) {
      return; // User canceled
    }

    const document = this.documents.find(doc => doc.id === documentId);
    if (document) {
      document.deletedOn = new Date().toISOString();
      document.deletedBy = "Admin";
    }

    // Remove deleted items
    this.documents = this.documents.filter(doc => !doc.deletedOn);

    // Update labels
    this.documents = this.documents.map(doc => ({
      ...doc,
      authorizationDocumentTypeLabel:
        this.documentTypeMap.get(doc.authorizationDocumentType || '') || 'Unknown'
    }));

    this.removeEmptyRecords();
    this.dataSource.data = [...this.documents];
    this.DocumentSaved.emit(this.documents);
  }


  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    if (this.dataSource.paginator) this.dataSource.paginator.firstPage();
  }

  applySort(option: string) {
    this.sortBy = option;
    const [field, direction] = option.split('_');
    const dir = direction === 'desc' ? -1 : 1;
    this.dataSource.data = [...this.dataSource.data.sort((a, b) => {
      const aVal = (a as any)[field] || '';
      const bVal = (b as any)[field] || '';
      return aVal.toString().localeCompare(bVal.toString()) * dir;
    })];
  }

  getLastCreatedDate(): string {
    const validDocs = this.documents.filter(doc => this.isValidDate(doc.createdOn));
    if (!validDocs.length) return 'N/A';

    const latest = [...validDocs].sort((a, b) =>
      new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime()
    )[0];

    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(new Date(latest.createdOn)).replace(',', '');
  }

  isValidDate(input: any): boolean {
    const date = new Date(input);
    return input && !isNaN(date.getTime());
  }


  viewDocument(fileName: string) {
    alert(`Opening document: ${fileName}`);
  }

  handleFileUpload(event: Event) {
    const inputElement = event.target as HTMLInputElement;
    if (!inputElement.files) return;

    const files = Array.from(inputElement.files);
    let validFiles: string[] = [];

    if (files.length > 5) {
      alert("You can upload a maximum of 5 files.");
      return;
    }

    for (let file of files) {
      let fileType = file.name.split('.').pop()?.toLowerCase();
      if (fileType && this.allowedFileTypes.includes(fileType)) {
        validFiles.push(file.name);
      } else {
        alert(`File type ${fileType} is not allowed.`);
      }
    }

    let field = this.documentFields.find(f => f.id === "authorizationSelectFiles");
    if (field) {
      field.value = validFiles;
    }
  }

  resetForm() {
    this.documentFields.forEach(field => {
      if (field.type === 'checkbox') {
        field.value = false;
      } else if (field.type === 'select') {
        field.value = "";
        field.displayLabel = "Select";
      } else {
        field.value = "";
      }
    });
    this.showValidationErrors = false;
  }

  filterOptions(field: any): void {
    if (!field.options) return;
    const searchValue = field.displayLabel?.toLowerCase() || '';
    field.filteredOptions = field.options.filter((opt: any) =>
      opt.label.toLowerCase().includes(searchValue)
    );
  }

  selectDropdownOption(field: any, option: any): void {
    field.value = option.value;
    field.displayLabel = option.label;
    field.showDropdown = false;
  }

  onSelectBlur(field: any): void {
    setTimeout(() => { field.showDropdown = false; }, 200);
  }

  onFieldFocus(field: any): void {
    field.showDropdown = true;
    if (!field.filteredOptions && field.options) {
      field.filteredOptions = [...field.options];
    }
  }

  isFocused = false;
  onFocus() { this.isFocused = true; }
  onBlur() { this.isFocused = false; }

  private removeEmptyRecords() {
    this.documents = this.documents.filter(doc => {
      const hasValidFields = Object.keys(doc).some(key => {
        const value = doc[key as keyof AuthorizationDocument];
        return value !== null && value !== "" && value !== undefined;
      });

      const hasValidDate = this.isValidDate(doc.createdOn);
      const hasValidType = (doc.authorizationDocumentTypeLabel && doc.authorizationDocumentTypeLabel !== 'Unknown');

      return hasValidFields && hasValidDate && hasValidType;
    });
  }

  onContentClick(event: MouseEvent, doc: AuthorizationDocument) {
    const target = event.target as HTMLElement;
    if (target.closest('.icon-btn')) return; // ignore clicks on edit/delete icons
    this.editDocument(doc);
  }

  formatToEST(date: Date, dateOnly: boolean = false): string {
    const options: Intl.DateTimeFormatOptions = dateOnly
      ? {
        timeZone: 'America/New_York',
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
      }
      : {
        timeZone: 'America/New_York',
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      };

    return new Intl.DateTimeFormat('en-US', options).format(date).replace(',', '');
  }
}
