import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CodeSearchResult {
  id?: number | null;
  code?: string | null;
  codeDesc?: string | null;
  codeShortDesc?: string | null;
  type?: string | null;
}

export interface MemberSearchResult {
  memberdetailsid: number;
  memberid?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  birthdate?: string | null;
  city?: string | null;
  phone?: string | null;
  gender?: string | null;
}

export interface MedicationLookupRow {
  drugName?: string | null;
  ndc?: string | null;
}

export interface StaffLookupRow {
  userdetailid: number;
  username?: string | null;

  // NEW (matches updated API output)
  firstname?: string | null;
  lastname?: string | null;
  role?: string | null;
  email?: string | null;
  fullName?: string | null;
}

export interface ProviderLookupRow {
  providerId: number;

  // NEW (matches updated API output)
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;

  providerName?: string | null;        // full name / org name
  npi?: string | null;
  taxid?: string | null;

  addressline1?: string | null;
  addressline2?: string | null;
  city?: string | null;
  state?: string | null;               // stateid::text
  zipcode?: string | null;

  phone?: string | null;
  fax?: string | null;
  email?: string | null;
  organizationname?: string | null;
}

export interface ClaimLookupRow {
  memberclaimheaderid: number;         // if you return bigint and it can exceed JS safe int, change this to string
  claimnumber?: string | null;

  providerid?: number | null;
  providername?: string | null;

  dos_from?: string | null;            // API will typically return ISO string
  dos_to?: string | null;

  visittypeid?: number | null;
  reasonforvisit?: string | null;

  billed?: number | null;
  allowedamount?: number | null;
  copayamount?: number | null;
  paid?: number | null;
}


@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/auth';
  private apiUrlCodeSets = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/codesets';
  private apiUrlActivities = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/authactivity';
  //private apiUrl = 'https://localhost:7201/api/auth';
  //private apiUrlCodeSets = 'https://localhost:7201/api/codesets';
  //private apiUrlActivities = 'https://localhost:7201/api/authactivity';

  constructor(private http: HttpClient) { }

  // Fetch auth templates from API
  getTemplates(module: any, authclassid: any): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/fetch/${module}/${authclassid}`);
  }

  getTemplate(module: any, id: any): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/template/${module}/${id}`);
  }

  // Save auth detail to API
  saveAuthDetail(jsonData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/save`, jsonData, {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Save auth Template to API
  saveAuthTemplate(jsonData: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/savetemplate`, jsonData, {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Get all auth details for a given memberId
  getAllAuthDetailsByMemberId(memberId: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/member/${memberId}`);
  }

  // Get auth details by authNumber
  getAuthDataByAuthNumber(authNumber: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/auth/${authNumber}`);
  }

  // GET: Get all codesets
  getAllCodesets(type: any): Observable<any> {
    return this.http.get<any>(`${this.apiUrlCodeSets}/type/${type}`);
  }

  // GET: Get codeset by ID
  getCodesetById(id: any, type: any): Observable<any> {
    return this.http.get<any>(`${this.apiUrlCodeSets}/${id}/${type}`);
  }

  // POST: Create new codeset
  createCodeset(data: any): Observable<any> {
    return this.http.post<any>(this.apiUrlCodeSets, data, {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // PUT: Update existing codeset
  updateCodeset(id: number, data: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrlCodeSets}/${id}`, data, {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // GET: Fetch all AuthActivities
  getAllActivities(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrlActivities}/authdetail/${id}`);
  }

  // GET: Fetch a single AuthActivity by ID
  getActivityById(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrlActivities}/${id}`);
  }

  // POST: Create a new AuthActivity
  createActivity(activity: any): Observable<any> {
    return this.http.post<any>(this.apiUrlActivities, activity, {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // PUT: Update an existing AuthActivity
  updateActivity(id: number, activity: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrlActivities}/${id}`, activity, {
      headers: { 'Content-Type': 'application/json' }
    });
  }


  getTemplateValidation(templateId: number) {
    return this.http.get<any>(`${this.apiUrl}/validation/${templateId}`);
  }

  saveTemplateValidation(payload: any) {
    return this.http.post<any>(`${this.apiUrl}/validation/save`, payload);
  }

  updateTemplateValidation(payload: any) {
    return this.http.post<any>(`${this.apiUrl}/validation/update`, payload);
  }


  getMdReviewActivities(activityId?: number, authDetailId?: number) {
    let params: any = {};
    if (activityId) params.activityId = activityId;
    if (authDetailId) params.authDetailId = authDetailId;

    return this.http.get<any[]>(`${this.apiUrlActivities}/mdreview`, { params });
  }


  createMdReviewActivity(activity: any) {
    return this.http.post<any>(`${this.apiUrlActivities}/mdreview`, activity);
  }

  updateMdReviewLine(lineId: number, lineUpdate: any) {
    return this.http.put<any>(`${this.apiUrlActivities}/mdreview/line/${lineId}`, lineUpdate);
  }

  /****** auto complete search *********/
  searchIcd(q: string, limit = 25): Observable<CodeSearchResult[]> {
    const params = new HttpParams().set('q', q).set('limit', String(limit));
    return this.http.get<CodeSearchResult[]>(`${this.apiUrlCodeSets}/search/icd`, { params });
  }

  searchMedicalCodes(q: string, limit = 25): Observable<CodeSearchResult[]> {
    const params = new HttpParams().set('q', q).set('limit', String(limit));
    return this.http.get<CodeSearchResult[]>(`${this.apiUrlCodeSets}/search/medicalcodes`, { params });
  }

  searchMembers(q: string, limit = 25): Observable<MemberSearchResult[]> {
    const params = new HttpParams().set('q', q).set('limit', String(limit));
    return this.http.get<MemberSearchResult[]>(`${this.apiUrlCodeSets}/search/members`, { params });
  }

  searchMedications(q: string, limit = 25): Observable<MedicationLookupRow[]> {
    const params = new HttpParams().set('q', q).set('limit', String(limit));
    return this.http.get<MedicationLookupRow[]>(`${this.apiUrlCodeSets}/search/medications`, { params });
  }

  searchStaff(q: string, limit = 25): Observable<StaffLookupRow[]> {
    const params = new HttpParams().set('q', q).set('limit', String(limit));
    return this.http.get<StaffLookupRow[]>(`${this.apiUrlCodeSets}/search/staff`, { params });
  }

  searchProviders(q: string, limit = 25): Observable<ProviderLookupRow[]> {
    const params = new HttpParams().set('q', q).set('limit', String(limit));
    return this.http.get<ProviderLookupRow[]>(`${this.apiUrlCodeSets}/search/providers`, { params });
  }

  searchClaims(q: string, limit = 25): Observable<ClaimLookupRow[]> {
    const params = new HttpParams().set('q', q).set('limit', String(limit));
    return this.http.get<ClaimLookupRow[]>(`${this.apiUrlCodeSets}/search/claims`, { params });
  }


}
