import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

import {
  AuthDetailRow,
  CreateAuthRequest,
  UpdateAuthRequest,
  AuthNoteDto,
  CreateAuthNoteRequest,
  UpdateAuthNoteRequest,
  AuthDocumentDto,
  CreateAuthDocumentRequest,
  UpdateAuthDocumentRequest
} from 'src/app/member/UM/services/authdetail';

@Injectable({ providedIn: 'root' })
export class AuthDetailApiService {
  private baseUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/auth';
  //private baseUrl = 'https://localhost:7201/api/auth';


  constructor(private http: HttpClient) { }

  // --------------------------
  // Auth Detail APIs
  // --------------------------

  getByNumber(authNumber: string, includeDeleted = false): Observable<AuthDetailRow> {
    const params = new HttpParams().set('includeDeleted', includeDeleted);
    return this.http.get<AuthDetailRow>(`${this.baseUrl}/number/${encodeURIComponent(authNumber)}`, { params });
  }

  getById(authDetailId: number, includeDeleted = false): Observable<AuthDetailRow> {
    const params = new HttpParams().set('includeDeleted', includeDeleted);
    return this.http.get<AuthDetailRow>(`${this.baseUrl}/${authDetailId}`, { params });
  }

  getByMember(memberDetailsId: number, includeDeleted = false): Observable<AuthDetailRow[]> {
    const params = new HttpParams().set('includeDeleted', includeDeleted);
    return this.http.get<AuthDetailRow[]>(`${this.baseUrl}/member/${memberDetailsId}`, { params });
  }

  create(req: CreateAuthRequest, userId: number): Observable<number> {
    const params = new HttpParams().set('userId', userId);
    return this.http.post<number>(`${this.baseUrl}`, req, { params });
  }

  update(authDetailId: number, req: UpdateAuthRequest, userId: number): Observable<void> {
    const params = new HttpParams().set('userId', userId);
    return this.http.put<void>(`${this.baseUrl}/${authDetailId}`, req, { params });
  }

  softDelete(authDetailId: number, userId: number): Observable<void> {
    const params = new HttpParams().set('userId', userId);
    return this.http.delete<void>(`${this.baseUrl}/${authDetailId}`, { params });
  }

  // --------------------------
  // Notes APIs
  // --------------------------

  getNotes(authDetailId: number): Observable<AuthNoteDto[]> {
    return this.http.get<AuthNoteDto[]>(`${this.baseUrl}/${authDetailId}/notes`);
  }

  createNote(authDetailId: number, req: CreateAuthNoteRequest, userId: number): Observable<string> {
    const params = new HttpParams().set('userId', userId);
    return this.http.post<string>(`${this.baseUrl}/${authDetailId}/notes`, req, { params });
  }

  updateNote(authDetailId: number, noteId: string, req: UpdateAuthNoteRequest, userId: number): Observable<void> {
    const params = new HttpParams().set('userId', userId);
    return this.http.put<void>(`${this.baseUrl}/${authDetailId}/notes/${noteId}`, req, { params });
  }

  deleteNote(authDetailId: number, noteId: string, userId: number): Observable<void> {
    const params = new HttpParams().set('userId', userId);
    return this.http.delete<void>(`${this.baseUrl}/${authDetailId}/notes/${noteId}`, { params });
  }

  // --------------------------
  // Documents APIs
  // --------------------------

  getDocuments(authDetailId: number): Observable<AuthDocumentDto[]> {
    return this.http.get<AuthDocumentDto[]>(`${this.baseUrl}/${authDetailId}/documents`);
  }

  createDocument(authDetailId: number, req: CreateAuthDocumentRequest, userId: number): Observable<string> {
    const params = new HttpParams().set('userId', userId);
    return this.http.post<string>(`${this.baseUrl}/${authDetailId}/documents`, req, { params });
  }

  updateDocument(authDetailId: number, documentId: string, req: UpdateAuthDocumentRequest, userId: number): Observable<void> {
    const params = new HttpParams().set('userId', userId);
    return this.http.put<void>(`${this.baseUrl}/${authDetailId}/documents/${documentId}`, req, { params });
  }

  deleteDocument(authDetailId: number, documentId: string, userId: number): Observable<void> {
    const params = new HttpParams().set('userId', userId);
    return this.http.delete<void>(`${this.baseUrl}/${authDetailId}/documents/${documentId}`, { params });
  }
}
