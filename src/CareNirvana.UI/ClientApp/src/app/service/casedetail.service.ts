import { Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CaseHeaderDto {
  caseHeaderId: number;
  caseNumber: string;
  caseType: string;
  status: string;
  memberDetailId?: number | null;

  createdByUserName?: string | null;
  memberName?: string | null;
  memberId?: string | null;

  createdOn: string;
  createdBy: number;
  updatedOn?: string | null;
  updatedBy?: number | null;
  deletedOn?: string | null;
  deletedBy?: number | null;
}

export interface CaseDetailDto {
  caseDetailId: number;
  caseHeaderId: number;
  caseLevelId: number;
  caseLevelNumber: string;
  jsonData: any; // or unknown / object
  createdOn?: string;
  createdBy?: number;
  updatedOn?: string | null;
  updatedBy?: number | null;
  deletedOn?: string | null;
  deletedBy?: number | null;
}

export interface CaseAggregateDto {
  header: CaseHeaderDto;
  details: CaseDetailDto[];
}

export interface CreateCaseRequest {
  caseNumber: string;
  caseType: string;
  status: string;
  memberDetailId?: number | null;
  levelId: number;      // Level1 id comes from UI input
  jsonData: any;        // json payload for level 1
}

export interface AddCaseLevelRequest {
  caseNumber: string;   // controller uses this in CreatedAtAction route
  caseHeaderId: number;
  levelId: number;
  jsonData: any;
}

export interface UpdateCaseDetailRequest {
  caseDetailId: number;
  jsonData: any;
  // optionally: status, etc., if your API supports it
}

export interface CreateCaseResponse {
  caseHeaderId: number;
  caseDetailId: number;
  caseLevelNumber?: string;
}

export interface AddLevelResponse {
  caseDetailId: number;
  caseLevelNumber?: string;
}

export interface AgCaseGridRow {
  caseNumber: string;
  memberDetailId: number;
  caseType: string;
  caseTypeText: string;

  memberName: string;
  memberId: string;

  createdByUserName: string;
  createdBy: number;
  createdOn: string;       // ISO string from API

  caseLevelId: number;
  levelId: number;

  casePriority: string;
  casePriorityText: string;

  receivedDateTime: string | null; // ISO string or null
  caseStatusId: string;
  caseStatusText: string;

  lastDetailOn: string | null;     // ISO string or null
}


export interface CaseNotesTemplateResponse {
  caseTemplateId: number;
  sectionName: string;     // "Case Notes"
  section: any;            // template section JSON (keep as any unless you have a strong type)
}

export interface CaseNoteDto {
  noteId: string;
  noteText: string;

  noteLevel: number;     // int
  noteType: number;      // int
  isAlertNote?: boolean; // bool

  createdOn?: string;
  createdBy?: number;
  createdByName?: string;

  updatedOn?: string;
  updatedBy?: number;

  deletedOn?: string;
  deletedBy?: number;
}

export interface CaseNotesResponse {
  caseHeaderId: number;
  levelId: number;
  notes: CaseNoteDto[];
}

export interface CreateCaseNoteRequest {
  noteText: string;
  noteLevel: number;
  noteType: number;
  isAlertNote?: boolean;
}

export interface UpdateCaseNoteRequest {
  noteText?: string;
  noteLevel?: number;
  noteType?: number;
  isAlertNote?: boolean;
}


export interface CaseDocumentsTemplateResponse {
  caseTemplateId: number;
  sectionName: string;
  section: any; // json template section
}

export interface CaseDocumentFileDto {
  fileId: string;
  fileName: string;
  contentType: string;
  size: number;
}

export interface CaseDocumentDto {
  documentId: string;
  documentType: number;
  documentLevel: number;
  documentDescription: string;
  files?: string[];
  createdBy: number;
  createdOn: string;
  updatedBy?: number;
  updatedOn?: string;
  deletedBy?: number;
  deletedOn?: string;
}

export interface CaseDocumentsResponse {
  caseHeaderId: number;
  levelId: number;
  documents: CaseDocumentDto[];
}

@Injectable({
  providedIn: 'root'
})
export class CasedetailService {

  private baseUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/case';
  private baseNotesUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/casenotes';
  private baseDocsUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/casedocuments';

  //private baseUrl = 'https://localhost:7201/api/case';
  //private baseNotesUrl = 'https://localhost:7201/api/casenotes';
  //private baseDocsUrl = 'https://localhost:7201/api/casedocuments';
  constructor(private http: HttpClient) { }

  getCaseByNumber(caseNumber: string, includeDeleted = false): Observable<CaseAggregateDto> {
    const params = new HttpParams().set('includeDeleted', includeDeleted);
    return this.http.get<CaseAggregateDto>(`${this.baseUrl}/${encodeURIComponent(caseNumber)}`, { params });
  }

  getByHeaderId(caseHeaderId: number, includeDeleted = false): Observable<CaseAggregateDto> {
    return this.http.get<CaseAggregateDto>(`${this.baseUrl}/ByHeader/${caseHeaderId}`, {
      params: { includeDeleted }
    });
  }

  createCase(req: CreateCaseRequest, userId: number): Observable<any> {
    return this.http.post(`${this.baseUrl}`, req, { params: { userId } });
  }

  addCaseLevel(req: AddCaseLevelRequest, userId: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/AddLevel`, req, { params: { userId } });
  }

  updateCaseDetail(req: UpdateCaseDetailRequest, userId: number): Observable<any> {
    return this.http.put(`${this.baseUrl}/UpdateDetail`, req, { params: { userId } });
  }

  softDeleteCaseHeader(caseHeaderId: number, userId: number, cascadeDetails = true): Observable<void> {
    const params = new HttpParams()
      .set('userId', userId)
      .set('cascadeDetails', cascadeDetails);

    return this.http.post<void>(`${this.baseUrl}/DeleteHeader/${caseHeaderId}`, null, { params });
  }

  softDeleteCaseDetail(caseDetailId: number, userId: number): Observable<void> {
    const params = new HttpParams().set('userId', userId);
    return this.http.post<void>(`${this.baseUrl}/DeleteDetail/${caseDetailId}`, null, { params });
  }

  getCasesByMemberDetailId(memberDetailId: number,
    opts?: {
      includeDetails?: boolean;
      includeDeleted?: boolean;
      statuses?: string[]; // ['Open','Reopen']
    }
  ): Observable<CaseAggregateDto[]> {
    let params = new HttpParams()
      .set('includeDetails', String(opts?.includeDetails ?? false))
      .set('includeDeleted', String(opts?.includeDeleted ?? false));

    if (opts?.statuses?.length) {
      params = params.set('statuses', opts.statuses.join(',')); // controller expects comma-separated
    }

    return this.http.get<CaseAggregateDto[]>(
      `${this.baseUrl}/ByMember/${memberDetailId}`,
      { params }
    );
  }

  getAgCasesByMember(memberId: number): Observable<AgCaseGridRow[]> {
    return this.http.get<AgCaseGridRow[]>(`${this.baseUrl}/AgCasesByMember/${memberId}`);
  }


  // Case Notes Methods
  private userHeader(): HttpHeaders {
    const userId = sessionStorage.getItem('loggedInUserid') ?? '0';
    return new HttpHeaders({ 'x-userid': userId });
  }

  // Template: GET /api/CaseNotes/case-templates/{caseTemplateId}/sections/case-notes
  getNotesTemplate(caseTemplateId: number): Observable<CaseNotesTemplateResponse> {
    return this.http.get<CaseNotesTemplateResponse>(
      `${this.baseNotesUrl}/case-templates/${caseTemplateId}/sections/case-notes`
    );
  }

  // Notes list: GET /api/CaseNotes/cases/{caseHeaderId}/levels/{levelId}/notes
  getNotes(caseHeaderId: number, levelId: number): Observable<CaseNotesResponse> {
    console.log('Fetching notes for caseHeaderId:', caseHeaderId, 'levelId:', levelId);
    return this.http.get<CaseNotesResponse>(
      `${this.baseNotesUrl}/cases/${caseHeaderId}/levels/${levelId}/notes`
    );
  }

  // Insert: POST /api/CaseNotes/cases/{caseHeaderId}/levels/{levelId}/notes
  createNote(caseHeaderId: number, levelId: number, req: CreateCaseNoteRequest): Observable<{ noteId: string }> {
    return this.http.post<{ noteId: string }>(
      `${this.baseNotesUrl}/cases/${caseHeaderId}/levels/${levelId}/notes`,
      req,
      { headers: this.userHeader() }
    );
  }

  // Update: PUT /api/CaseNotes/cases/{caseHeaderId}/levels/{levelId}/notes/{noteId}
  updateNote(caseHeaderId: number, levelId: number, noteId: string, req: UpdateCaseNoteRequest): Observable<void> {
    return this.http.put<void>(
      `${this.baseNotesUrl}/cases/${caseHeaderId}/levels/${levelId}/notes/${noteId}`,
      req,
      { headers: this.userHeader() }
    );
  }

  // Delete: DELETE /api/CaseNotes/cases/{caseHeaderId}/levels/{levelId}/notes/{noteId}
  deleteNote(caseHeaderId: number, levelId: number, noteId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.baseNotesUrl}/cases/${caseHeaderId}/levels/${levelId}/notes/${noteId}`,
      { headers: this.userHeader() }
    );
  }

  // Case Documents Methods
  getTemplate(caseTemplateId: number) {
    return this.http.get<any>(`${this.baseDocsUrl}/case-templates/${caseTemplateId}/sections/case-documents`);
  }

  getDocuments(caseHeaderId: number, levelId: number) {
    return this.http.get<any>(`${this.baseDocsUrl}/cases/${caseHeaderId}/levels/${levelId}/documents`);
  }

  createDocument(caseHeaderId: number, levelId: number, payload: any) {
    return this.http.post<{ documentId: string }>(`${this.baseDocsUrl}/cases/${caseHeaderId}/levels/${levelId}/documents`, payload);
  }

  updateDocument(caseHeaderId: number, levelId: number, documentId: string, patch: any) {
    return this.http.put<void>(`${this.baseDocsUrl}/cases/${caseHeaderId}/levels/${levelId}/documents/${documentId}`, patch);
  }

  deleteDocument(caseHeaderId: number, levelId: number, documentId: string) {
    return this.http.delete<void>(`${this.baseDocsUrl}/cases/${caseHeaderId}/levels/${levelId}/documents/${documentId}`);
  }
}

