import { Component, OnInit, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';

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

  @Input() documentFields: any[] = []; // Dynamic Form Fields
  @Input() documentData: any[] = []; // Table Data
  @Output() DocumentSaved = new EventEmitter<any[]>();

  documents: any[] = [];
  currentDocument: any | null = null;
  allowedFileTypes = ["jpeg", "png", "jpg", "bmp", "gif", "docx", "doc", "txt", "xlsx", "xls", "pdf"];


  ngOnInit(): void {
    if (!this.documentFields || this.documentFields.length === 0) {
      console.warn("⚠️ Warning: No document fields provided.");
    }
    this.documents = this.documentData || [];
    this.removeEmptyRecords();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.documentData) {
      this.documents = this.documentData || [];
      this.removeEmptyRecords();
    }
  }

  /**
   * Handles file upload validation and storage
   */
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

  /**
   * Saves or updates document entries
   */
  saveDocument() {
    let newDoc: any = {};

    // Capture field values dynamically
    this.documentFields.forEach(field => {
      newDoc[field.id] = field.value;
    });

    if (!newDoc.authorizationDocumentType || newDoc.authorizationDocumentType.trim() === "") {
      console.warn("⚠️ Warning: authorizationDocumentType is missing or empty!");
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
    this.DocumentSaved.emit(this.documents);
    this.currentDocument = null;
    this.resetForm();
  }

  editDocument(document: any) {
    this.currentDocument = { ...document };
    this.documentFields.forEach(field => {
      field.value = document[field.id] || "";
    });
  }

  deleteDocument(documentId: string) {
    let document = this.documents.find(doc => doc.id === documentId);
    if (document) {
      document.deletedBy = "Admin";
      document.deletedOn = new Date().toISOString();
    }

    this.documents = this.documents.filter(doc => !doc.deletedOn);
    this.removeEmptyRecords();
    this.DocumentSaved.emit(this.documents);
  }

  private removeEmptyRecords() {
    this.documents = this.documents.filter(doc => {
      return Object.keys(doc).some(key => {
        const typedKey = key as keyof typeof doc;
        return doc[typedKey] !== null && doc[typedKey] !== "" && doc[typedKey] !== undefined;
      });
    });
  }

  resetForm() {
    this.documentFields.forEach(field => {
      field.value = field.type === "checkbox" ? false : "";
    });
  }

  viewDocument(fileName: string) {
    alert(`Opening document: ${fileName}`);
  }
}
