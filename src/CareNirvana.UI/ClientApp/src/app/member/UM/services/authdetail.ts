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
  noteLevel?: number | null;
  noteType?: number | null;
  authAlertNote?: boolean | null;

  createdBy: number;
  createdOn: string;
  updatedBy?: number | null;
  updatedOn?: string | null;
  deletedBy?: number | null;
  deletedOn?: string | null;
}

export interface CreateAuthNoteRequest {
  noteText?: string | null;
  noteLevel?: number | null;
  noteType?: number | null;
  authAlertNote?: boolean | null;
}

export interface UpdateAuthNoteRequest {
  noteText?: string | null;
  noteLevel?: number | null;
  noteType?: number | null;
  authAlertNote?: boolean | null;
}

// ---------- Documents ----------
export interface AuthDocumentDto {
  documentId: string; // guid
  documentType?: number | null;
  documentLevel?: number | null;
  documentDescription: string;
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
  documentLevel?: number | null;
  documentDescription?: string | null;
  fileNames?: string[] | null;
}

export interface UpdateAuthDocumentRequest {
  documentType?: number | null;
  documentLevel?: number | null;
  documentDescription?: string | null;
  fileNames?: string[] | null;
}
