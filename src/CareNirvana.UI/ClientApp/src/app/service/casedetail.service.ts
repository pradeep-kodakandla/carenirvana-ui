import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
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

@Injectable({
  providedIn: 'root'
})
export class CasedetailService {

  private baseUrl  = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/case';
  //private baseUrl = 'https://localhost:7201/api/case';
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

  //createCase(req: CreateCaseRequest, userId: number): Observable<CreateCaseResponse> {
  //  const params = new HttpParams().set('userId', userId);
  //  return this.http.post<CreateCaseResponse>(`${this.baseUrl}`, req, { params });
  //}
  createCase(req: CreateCaseRequest, userId: number): Observable<any> {
    return this.http.post(`${this.baseUrl}`, req, { params: { userId } });
  }

  addCaseLevel(req: AddCaseLevelRequest, userId: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/AddLevel`, req, { params: { userId } });
  }

  updateCaseDetail(req: UpdateCaseDetailRequest, userId: number): Observable<any> {
    return this.http.put(`${this.baseUrl}/UpdateDetail`, req, { params: { userId } });
  }

  //addCaseLevel(req: AddCaseLevelRequest, userId: number): Observable<AddLevelResponse> {
  //  const params = new HttpParams().set('userId', userId);
  //  return this.http.post<AddLevelResponse>(`${this.baseUrl}/AddLevel`, req, { params });
  //}

  //updateCaseDetail(req: UpdateCaseDetailRequest, userId: number): Observable<void> {
  //  const params = new HttpParams().set('userId', userId);
  //  return this.http.post<void>(`${this.baseUrl}/UpdateDetail`, req, { params });
  //}

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
}
