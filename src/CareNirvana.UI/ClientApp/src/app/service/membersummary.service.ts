import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
export interface MemberNoteDto {
  memberHealthNotesId?: number;   // legacy PK (still supported)
  memberNoteId?: number;          // new PK (if exposed)
  id?: number;

  memberId?: number;
  memberDetailsId?: number;

  noteTypeId?: number | null;
  title?: string | null;
  notes: string;
  isAlert: boolean;

  // NEW — align with membernote table
  enteredTimestamp?: string | null;     // maps to membernote.enteredtimestamp
  alertEndDateTime?: string | null;     // maps to membernote.alertenddatetime
  isExternal?: boolean;                 // bit(1) server -> boolean
  displayInMemberPortal?: boolean;      // bit(1) server -> boolean
  activeFlag?: boolean | null;

  importance?: number | null;
  tagsJson?: string | null;

  createdOn: string;
  createdBy?: number | null;
  updatedOn?: string | null;
  updatedBy?: number | null;
  deletedOn?: string | null;
  deletedBy?: number | null;

  noteTypeLabel?: string;

  // display-only
  _noteTypeLabel?: string;
  _createdOnDisplay?: string;
}

export interface PagedNotes {
  total: number;
  items: MemberNoteDto[];
}

export interface MemberDocument {
  memberDocumentId?: number;
  memberId: number;
  documentTypeId?: number | null;
  documentName: string;
  /** Base64 (no data: prefix). Server binds to C# byte[] */
  documentBytes: string;
  createdOn?: string;
  createdBy?: number | null;
  updatedBy?: number | null;
  updatedOn?: string | null;
  deletedBy?: number | null;
  deletedOn?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class MembersummaryService {

  //private apiNotesUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/MemberHealthNotes';
  private apiNotesUrl = 'https://localhost:51346/api/MemberHealthNotes';
  //private apiDocUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/MemberDocument';
  private apiDocUrl = 'https://localhost:51346/api/MemberDocument';
  constructor(private http: HttpClient) { }

  // Normalize server shapes into a UI-friendly dto
  getNotes(
    memberPointer: number,
    page = 1,
    pageSize = 25,
    includeDeleted = false
  ): Observable<any> {
    const params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize)
      .set('includeDeleted', includeDeleted);
    return this.http.get<any>(`${this.apiNotesUrl}/member/${memberPointer}`, { params });
  }

  /** POST /api/MemberHealthNotes */
  addNote(payload: Partial<MemberNoteDto>): Observable<any> {
    const body = {
      memberId: payload.memberId ?? payload.memberDetailsId,
      memberDetailsId: payload.memberDetailsId ?? payload.memberId,
      noteTypeId: payload.noteTypeId ?? null,
      title: payload.title ?? null,
      notes: payload.notes ?? '',
      isAlert: !!payload.isAlert,
      // NEW mappings to membernote:
      enteredTimestamp: payload.enteredTimestamp ?? payload.createdOn ?? new Date().toISOString(),
      alertEndDateTime: payload.alertEndDateTime ?? null,
      // optional flags if you decide to expose them:
      isExternal: payload.isExternal ?? false,
      displayInMemberPortal: payload.displayInMemberPortal ?? false,
      activeFlag: payload.activeFlag ?? true,

      importance: payload.importance ?? null,
      tagsJson: payload.tagsJson ?? null,
      createdBy: payload.createdBy ?? null,
      createdOn: payload.createdOn ?? new Date().toISOString()
    };
    return this.http.post<any>(`${this.apiNotesUrl}`, body);
  }

  /** PUT /api/MemberHealthNotes/{id} */
  updateNote(id: number, payload: Partial<MemberNoteDto>): Observable<any> {
    const body = {
      memberHealthNotesId: id,
      noteTypeId: payload.noteTypeId ?? null,
      title: payload.title ?? null,
      notes: payload.notes ?? '',
      isAlert: !!payload.isAlert,
      // NEW mappings to membernote:
      enteredTimestamp: payload.enteredTimestamp ?? payload.createdOn ?? new Date().toISOString(),
      alertEndDateTime: payload.alertEndDateTime ?? null,
      // optional flags if you decide to expose them:
      isExternal: payload.isExternal ?? false,
      displayInMemberPortal: payload.displayInMemberPortal ?? false,
      activeFlag: payload.activeFlag ?? true,

      importance: payload.importance ?? null,
      tagsJson: payload.tagsJson ?? null,
      updatedBy: payload.updatedBy ?? null,
      updatedOn: payload.updatedOn ?? new Date().toISOString()
    };
    return this.http.put<any>(`${this.apiNotesUrl}/${id}`, body);
  }

  /** DELETE /api/MemberHealthNotes/{id}?deletedBy= */
  deleteNote(id: number, deletedBy = 0): Observable<any> {
    const params = new HttpParams().set('deletedBy', deletedBy);
    return this.http.delete<any>(`${this.apiNotesUrl}/${id}`, { params });
  }

  /** (Optional) GET lookups */
  getNoteTypes(): Observable<any> {
    return this.http.get<any>('/api/lookups/note-types');
  }

  //}

  // ======================
  // Member Document APIs
  // ======================

  /** GET api/MemberDocument/member/{memberId}?page=&pageSize=&includeDeleted= */
  listDocuments(memberId: number, page = 1, pageSize = 25, includeDeleted = false)
    : Observable<{ items: MemberDocument[]; total: number; page: number; pageSize: number; totalPages: number }> {

    let params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize)
      .set('includeDeleted', includeDeleted);

    return this.http.get<{ items: MemberDocument[]; total: number; page: number; pageSize: number; totalPages: number }>(
      `${this.apiDocUrl}/member/${memberId}`, { params }
    );
  }

  /** GET api/MemberDocument/{id} */
  getDocumentById(id: number): Observable<MemberDocument> {
    return this.http.get<MemberDocument>(`${this.apiDocUrl}/${id}`);
  }

  /** POST api/MemberDocument */
  createDocument(doc: MemberDocument): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(this.apiDocUrl, doc);
  }

  /** PUT api/MemberDocument/{id} */
  updateDocument(id: number, doc: MemberDocument): Observable<void> {
    // Controller returns 204 NoContent on success
    return this.http.put<void>(`${this.apiDocUrl}/${id}`, { ...doc, memberDocumentId: id });
  }

  /** DELETE api/MemberDocument/{id}?deletedBy= */
  deleteDocument(id: number, deletedBy: number): Observable<void> {
    const params = new HttpParams().set('deletedBy', deletedBy);
    return this.http.delete<void>(`${this.apiDocUrl}/${id}`, { params });
  }

  // ----------------------
  // Helpers for file->base64
  // ----------------------
  /** Convert a File to base64 string (no data: prefix) for DocumentBytes */
  async fileToBase64(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  /** Convenience: build MemberDocument from a File and POST it */
  async createDocumentFromFile(
    memberId: number,
    file: File,
    opts?: { documentTypeId?: number | null; createdBy?: number | null; documentNameOverride?: string }
  ): Promise<{ id: number }> {
    const base64 = await this.fileToBase64(file);
    const payload: MemberDocument = {
      memberId,
      documentTypeId: opts?.documentTypeId ?? null,
      documentName: opts?.documentNameOverride ?? file.name,
      documentBytes: base64,
      createdBy: opts?.createdBy ?? null,
      createdOn: new Date().toISOString()
    };
    return await firstValueFrom(this.createDocument(payload));
  }
}
