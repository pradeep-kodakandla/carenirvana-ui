import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface UpdateActivityLinesRequest {
  lineIds: number[];
  status: string;
  mdDecision: string;
  mdNotes: string;
  reviewedByUserId: number;
}

export interface FaxFile {
  faxId?: number;

  fileName: string;        // maps to filename
  url?: string;            // maps to storedpath in repo via FaxFile.Url
  originalName?: string;
  contentType?: string;
  sizeBytes?: number;
  sha256Hex?: string;

  receivedAt?: string;     // ISO
  uploadedBy?: number | null;
  uploadedAt?: string | null;

  pageCount?: number;
  memberId?: number | null;
  workBasket?: string | null;
  priority?: 1 | 2 | 3;
  status?: string;         // 'New'|'Processing'|'Ready'|'Failed' ...
  processStatus?: string;  // 'Pending'|'Processing'|'Ready'|'Failed'

  metaJson?: string;       // <-- STRING that contains JSON

  ocrText?: string | null;
  ocrJsonPath?: string | null;

  createdBy?: number | null;
  createdOn?: string | null;
  updatedOn?: string | null;
  updatedBy?: number | null;
  fileBytes?: string;
}
export interface FaxFileListResponse {
  Items: FaxFile[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

@Injectable({
  providedIn: 'root'
})
export class DashboardServiceService {

  private apiUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/dashboard';
  //private apiUrl = 'https://localhost:7201/api/dashboard';
  constructor(private http: HttpClient) { }

  // Fetch Member Enrollment from API
  getMyCareStaff(userId: any): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/carestaff/${userId}`);
  }
  getdashboardCounts(userId: any): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${userId}`);
  }
  getmembersummary(userId: any): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/membersummaries/${userId}`);
  }
  getpatientsummary(memberdetailsid: any): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/membersummary/${memberdetailsid}`);
  }
  getauthdetails(userId: any): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/authdetails/${userId}`);
  }
  getpendingactivitydetails(userId: any): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/pendingauthactivities/${userId}`);
  }
  getpendingwqactivitydetails(userId: any): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/pendingwq/${userId}`);
  }
  getwqactivitylinedetails(activityid: any): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/wqactivitylines/${activityid}`);
  }
  updateActivityLines(req: UpdateActivityLinesRequest): Observable<{ updatedCount: number }> {
    return this.http.post<{ updatedCount: number }>(
      `${this.apiUrl}/updateactivitylines/`,
      req
    );
  }

  getFaxFiles(search = '', page = 1, pageSize = 10, status?: string) {
    let params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize);

    if (search) params = params.set('search', search);
    if (status) params = params.set('status', status);

    return this.http.get<FaxFileListResponse>(`${this.apiUrl}/faxfiles`, { params });
  }

  /** Get single fax file by id */
  getFaxFileById(faxId: number) {
    return this.http.get<FaxFile>(`${this.apiUrl}/faxfile/${faxId}`);
  }

  insertFaxFile(fax: FaxFile): Observable<{ newId: number }> {
    return this.http.post<{ newId: number }>(
      `${this.apiUrl}/insertfaxfile`,
      fax
    );
  }

  updateFaxFile(fax: FaxFile): Observable<{ updatedRows: number }> {
    return this.http.post<{ updatedRows: number }>(
      `${this.apiUrl}/updatefaxfile`,
      fax
    );
  }
}
