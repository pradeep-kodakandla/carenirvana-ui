import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';

export interface MemberHealthNote {
  memberHealthNotesId?: number;
  memberId: number;
  noteTypeId?: number | null;
  notes: string;
  isAlert: boolean;
  createdOn?: string;
  createdBy?: number | null;
  updatedBy?: number | null;
  updatedOn?: string | null;
  deletedBy?: number | null;
  deletedOn?: string | null;
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

  private apiNotesUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/MemberHealthNotes';
  //private apiNotesUrl = 'https://localhost:51346/api/MemberHealthNotes';
  private apiDocUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/MemberDocument';
  //private apiDocUrl = 'https://localhost:51346/api/MemberDocument';
  constructor(private http: HttpClient) { }

  listHealthNotes(memberId: number, page = 1, pageSize = 25, includeDeleted = false)
    : Observable<{ items: MemberHealthNote[]; total: number; page: number; pageSize: number; totalPages: number }> {

    let params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize)
      .set('includeDeleted', includeDeleted);

    return this.http.get<{ items: MemberHealthNote[]; total: number; page: number; pageSize: number; totalPages: number }>(
      `${this.apiNotesUrl}/member/${memberId}`, { params }
    );
  }

  /** GET api/MemberHealthNotes/{id} */
  getHealthNoteById(id: number): Observable<MemberHealthNote> {
    return this.http.get<MemberHealthNote>(`${this.apiNotesUrl}/${id}`);
  }

  /** POST api/MemberHealthNotes */
  createHealthNote(note: MemberHealthNote): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(this.apiNotesUrl, note);
  }

  /** PUT api/MemberHealthNotes/{id} */
  updateHealthNote(id: number, note: MemberHealthNote): Observable<void> {
    // Controller returns 204 NoContent on success
    return this.http.put<void>(`${this.apiNotesUrl}/${id}`, { ...note, memberHealthNotesId: id });
  }

  /** DELETE api/MemberHealthNotes/{id}?deletedBy= */
  deleteHealthNote(id: number, deletedBy: number): Observable<void> {
    const params = new HttpParams().set('deletedBy', deletedBy);
    return this.http.delete<void>(`${this.apiNotesUrl}/${id}`, { params });
  }

  /** GET api/MemberHealthNotes/member/{memberId}/alerts */
  getHealthNoteAlerts(memberId: number): Observable<MemberHealthNote[]> {
    return this.http.get<MemberHealthNote[]>(`${this.apiNotesUrl}/member/${memberId}/alerts`);
  }

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
