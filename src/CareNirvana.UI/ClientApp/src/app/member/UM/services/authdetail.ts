export interface AuthDetailRow {
  authDetailId: number;
  authNumber: string;
  authTypeId: number;
  memberDetailsId: number;
  authDueDate?: string | null;
  nextReviewDate?: string | null;
  treatementType?: string | null;
  dataJson?: string | null;

  createdOn?: string;
  createdBy?: number | null;
  updatedOn?: string | null;
  updatedBy?: number | null;
  deletedOn?: string | null;
  deletedBy?: number | null;

  authClassId?: number | null;
  authAssignedTo?: number | null;
  authStatus?: number | null;
  authTypeText?: string | null;
  authStatusText?: string | null;
}

export interface CreateAuthRequest {
  authNumber: string;
  authTypeId: number;
  memberDetailsId: number;
  authDueDate?: string | null;
  nextReviewDate?: string | null;
  treatementType?: string | null;
  authClassId?: number | null;
  authAssignedTo?: number | null;
  authStatus?: number | null;

  jsonData: string; // default "{}"
}

export interface UpdateAuthRequest {
  authTypeId?: number | null;
  authDueDate?: string | null;
  nextReviewDate?: string | null;
  treatementType?: string | null;
  authClassId?: number | null;
  authAssignedTo?: number | null;
  authStatus?: number | null;

  jsonData?: string | null;
}

// ---------- Notes ----------
export interface AuthNoteDto {
  noteId: string; // guid
  noteText: string;

  noteType?: number | null;
  noteLevel?: number | null;
  authAlertNote?: boolean | null;

  encounteredOn?: string | null;
  alertEndDate?: string | null;

  createdBy: number;
  createdOn: string;
  updatedBy?: number | null;
  updatedOn?: string | null;
  deletedBy?: number | null;
  deletedOn?: string | null;
}

export interface CreateAuthNoteRequest {
  noteText?: string | null;
  noteType?: number | null;
  noteLevel?: number | null;
  authAlertNote?: boolean | null;
  encounteredOn?: string | null;  // ISO string
  alertEndDate?: string | null;   // ISO string
}

export interface UpdateAuthNoteRequest {
  noteText?: string | null;
  noteType?: number | null;
  noteLevel?: number | null;
  authAlertNote?: boolean | null;
  encounteredOn?: string | null;  // ISO string
  alertEndDate?: string | null;   // ISO string
}


// ---------- Documents ----------

export interface AuthDocumentDto {
  documentId: string;

  documentType?: number | null;
  documentDescription?: string | null;
  fileNames: string[];

  createdBy: number;
  createdOn: string;
  updatedBy?: number | null;
  updatedOn?: string | null;
  deletedBy?: number | null;
  deletedOn?: string | null;
}

export interface CreateAuthDocumentRequest {
  documentType?: number | null;
  documentDescription?: string | null;
  fileNames?: string[] | null;
}

export interface UpdateAuthDocumentRequest {
  documentType?: number | null;
  documentDescription?: string | null;
  fileNames?: string[] | null;
}


export interface TemplateSectionResponse {
  authTemplateId: number;
  sectionName: string;
  section: any; // section json
}

export interface TemplateSectionsResponse {
  authTemplateId: number;
  groupName: string;
  sections: any; // typically an array of sections
}

