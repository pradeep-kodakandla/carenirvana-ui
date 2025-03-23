import { Component, OnInit, Input, Output, EventEmitter, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';

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

  documents: AuthorizationDocument[] = [];
  dataSource = new MatTableDataSource<AuthorizationDocument>();
  displayedColumns: string[] = ['authorizationDocumentType', 'authorizationDocumentDesc', 'authorizationSelectFiles', 'createdOn', 'createdBy', 'actions'];

  isFormVisible: boolean = false;
  currentDocument: AuthorizationDocument | null = null;
  allowedFileTypes = ["jpeg", "png", "jpg", "bmp", "gif", "docx", "doc", "txt", "xlsx", "xls", "pdf"];

  ngOnInit(): void {
    this.documents = this.documentData || [];
    this.removeEmptyRecords();
    this.dataSource.data = [...this.documents];
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.documentData) {
      this.documents = this.documentData || [];
      this.removeEmptyRecords();
      this.dataSource.data = [...this.documents];
    }
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
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

  saveDocument() {
    let newDoc: any = {};
    this.documentFields.forEach(field => {
      newDoc[field.id] = field.value;
    });

    if (!newDoc.authorizationDocumentType || newDoc.authorizationDocumentType.trim() === "") {
      console.warn("⚠️ Missing document type.");
    }

    if (this.currentDocument) {
      newDoc.id = this.currentDocument.id;
      newDoc.createdOn = this.currentDocument.createdOn;
      newDoc.createdBy = this.currentDocument.createdBy;
      newDoc.updatedOn = new Date().toISOString();
      newDoc.updatedBy = "Admin";

      this.documents = this.documents.map(doc => doc.id === this.currentDocument!.id ? newDoc : doc);
    } else {
      newDoc.id = new Date().getTime().toString();
      newDoc.createdOn = new Date().toISOString();
      newDoc.createdBy = "Admin";

      this.documents.push(newDoc);
    }

    this.removeEmptyRecords();
    this.dataSource.data = [...this.documents];
    this.DocumentSaved.emit(this.documents);

    this.currentDocument = null;
    this.resetForm();
    this.isFormVisible = false;
  }

  editDocument(doc: AuthorizationDocument) {
    this.openForm('edit');
    this.currentDocument = { ...doc };
    this.documentFields.forEach(field => {
      field.value = doc[field.id as keyof AuthorizationDocument] || "";
    });
  }

  deleteDocument(documentId: string) {
    const document = this.documents.find(doc => doc.id === documentId);
    if (document) {
      document.deletedOn = new Date().toISOString();
      document.deletedBy = "Admin";
    }

    this.documents = this.documents.filter(doc => !doc.deletedOn);
    this.removeEmptyRecords();
    this.dataSource.data = [...this.documents];
    this.DocumentSaved.emit(this.documents);
  }

  viewDocument(fileName: string) {
    alert(`Opening document: ${fileName}`);
  }

  resetForm() {
    this.documentFields.forEach(field => {
      field.value = field.type === "checkbox" ? false : "";
    });
  }

  private removeEmptyRecords() {
    this.documents = this.documents.filter(doc => {
      return Object.keys(doc).some(key => {
        const value = doc[key as keyof AuthorizationDocument];
        return value !== null && value !== "" && value !== undefined;
      });
    });
  }
}
