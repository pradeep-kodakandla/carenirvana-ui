import { Component, OnInit } from '@angular/core';

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
export class UmauthdocumentsComponent implements OnInit {
  formFields = [
    {
      id: "authorizationDocumentType",
      type: "select",
      label: "Document Type",
      displayName: "Document Type",
      value: "",
      selectedOptions: [
        "Medical Report",
        "Insurance Claim",
        "Lab Test",
        "Prescription",
        "Billing",
        "Other"
      ]
    },
    {
      id: "authorizationDocumentDesc",
      type: "textarea",
      label: "Document Description",
      displayName: "Document Description",
      value: ""
    },
    {
      id: "authorizationSelectFiles",
      type: "file",
      label: "Select File(s)",
      displayName: "Select File(s)",
      value: []
    }
  ];

  documents: AuthorizationDocument[] = [];
  currentDocument: AuthorizationDocument | null = null;
  allowedFileTypes = ["jpeg", "png", "jpg", "bmp", "gif", "docx", "doc", "txt", "xlsx", "xls", "pdf"];

  ngOnInit(): void {
    this.loadDocuments();
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

    this.setFieldValue("authorizationSelectFiles", validFiles);
  }

  saveDocument() {
    let newDoc: AuthorizationDocument = {
      id: this.currentDocument ? this.currentDocument.id : new Date().getTime().toString(),
      authorizationDocumentType: this.getFieldValue("authorizationDocumentType") as string,
      authorizationDocumentDesc: this.getFieldValue("authorizationDocumentDesc") as string,
      authorizationSelectFiles: this.getFieldValue("authorizationSelectFiles") as string[],
      createdOn: this.currentDocument ? this.currentDocument.createdOn : new Date().toISOString(),
      createdBy: this.currentDocument ? this.currentDocument.createdBy : "Admin",
      updatedOn: new Date().toISOString(),
      updatedBy: "Admin"
    };

    if (this.currentDocument) {
      this.documents = this.documents.map(doc => doc.id === this.currentDocument!.id ? newDoc : doc);
    } else {
      this.documents.push(newDoc);
    }

    this.saveToLocalStorage();
    this.currentDocument = null;
    this.resetForm();
  }

  editDocument(doc: AuthorizationDocument) {
    this.currentDocument = doc;
    this.setFieldValue("authorizationDocumentType", doc.authorizationDocumentType);
    this.setFieldValue("authorizationDocumentDesc", doc.authorizationDocumentDesc);
    this.setFieldValue("authorizationSelectFiles", doc.authorizationSelectFiles);
  }

  deleteDocument(docId: string) {
    let doc = this.documents.find(d => d.id === docId);
    if (doc) {
      doc.deletedBy = "Admin";
      doc.deletedOn = new Date().toISOString();
      this.documents = this.documents.filter(d => !d.deletedOn);
    }
    this.saveToLocalStorage();
  }

  loadDocuments() {
    const storedDocs = localStorage.getItem('authorizationDocuments');
    if (storedDocs) {
      this.documents = JSON.parse(storedDocs).filter((doc: AuthorizationDocument) => !doc.deletedOn);
    }
  }

  saveToLocalStorage() {
    localStorage.setItem('authorizationDocuments', JSON.stringify(this.documents));
  }

  getFieldValue(id: string): string | string[] | undefined {
    const field = this.formFields.find(f => f.id === id);
    if (!field) return undefined;

    return field.value;
  }

  setFieldValue(id: string, value: any) {
    let field = this.formFields.find(f => f.id === id);
    if (field) field.value = value;
  }

  resetForm() {
    this.formFields.forEach(field => field.value = field.type === "file" ? [] : "");
  }

  viewDocument(fileName: string) {
    alert(`Opening document: ${fileName}`); // Placeholder for actual file viewing logic
  }
}
