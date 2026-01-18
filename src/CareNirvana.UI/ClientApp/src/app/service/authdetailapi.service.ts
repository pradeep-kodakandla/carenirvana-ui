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
  UpdateAuthDocumentRequest,
  TemplateSectionResponse,
  TemplateSectionsResponse,
  DecisionSectionItemDto,
  CreateDecisionSectionItemRequest,
  UpdateDecisionSectionItemRequest
} from 'src/app/member/UM/services/authdetail';

export type DecisionSectionName =
  | 'Decision Details'
  | 'Member Provider Decision Info'
  | 'Decision Notes';

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

  // Documents
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



  // --------------------------
  // Template APIs
  // --------------------------

  getDecisionTemplate(authTemplateId: number): Observable<TemplateSectionsResponse> {
    return this.http.get<TemplateSectionsResponse>(`${this.baseUrl}/template/${authTemplateId}/decision`);
  }

  getAuthNotesTemplate(authTemplateId: number): Observable<TemplateSectionResponse> {
    return this.http.get<TemplateSectionResponse>(`${this.baseUrl}/template/${authTemplateId}/notes`);
  }

  getAuthDocumentsTemplate(authTemplateId: number): Observable<TemplateSectionResponse> {
    return this.http.get<TemplateSectionResponse>(`${this.baseUrl}/template/${authTemplateId}/documents`);
  }


  // --------------------------
  // Decision APIs
  // --------------------------

  getItems(authDetailId: number, sectionName: DecisionSectionName): Observable<DecisionSectionItemDto[]> {
    const url = `${this.baseUrl}/${authDetailId}/decision/${encodeURIComponent(sectionName)}/items`;
    return this.http.get<DecisionSectionItemDto[]>(url);
  }

  /** POST /api/auth/{authDetailId}/decision/{sectionName}/items?userId=123 */
  createItem(
    authDetailId: number,
    sectionName: DecisionSectionName,
    req: CreateDecisionSectionItemRequest,
    userId: number
  ): Observable<string> {
    const url = `${this.baseUrl}/${authDetailId}/decision/${encodeURIComponent(sectionName)}/items`;
    const params = new HttpParams().set('userId', String(userId));
    return this.http.post<string>(url, req, { params }); // returns Guid as string
  }

  /** PUT /api/auth/{authDetailId}/decision/{sectionName}/items/{itemId}?userId=123 */
  updateItem(
    authDetailId: number,
    sectionName: DecisionSectionName,
    itemId: string,
    req: UpdateDecisionSectionItemRequest,
    userId: number
  ): Observable<void> {
    const url = `${this.baseUrl}/${authDetailId}/decision/${encodeURIComponent(sectionName)}/items/${itemId}`;
    const params = new HttpParams().set('userId', String(userId));
    return this.http.put<void>(url, req, { params });
  }

  /** DELETE /api/auth/{authDetailId}/decision/{sectionName}/items/{itemId}?userId=123 */
  deleteItem(
    authDetailId: number,
    sectionName: DecisionSectionName,
    itemId: string,
    userId: number
  ): Observable<void> {
    const url = `${this.baseUrl}/${authDetailId}/decision/${encodeURIComponent(sectionName)}/items/${itemId}`;
    const params = new HttpParams().set('userId', String(userId));
    return this.http.delete<void>(url, { params });
  }
}
