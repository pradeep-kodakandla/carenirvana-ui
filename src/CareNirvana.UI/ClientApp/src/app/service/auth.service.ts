import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/auth'; // Update with your API URL
  private apiUrlCodeSets = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/codesets'; // Update with your API URL
  //private apiUrl = 'https://localhost:51346/api/auth'; // Update with your API URL
  //private apiUrlCodeSets = 'https://localhost:51346/api/codesets';

  constructor(private http: HttpClient) { }

  // Fetch auth templates from API
  getAuthTemplates(authclassid: any): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/fetch/${authclassid}`);
  }

  getTemplate(id: any): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/template/${id}`);
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
  getAllActivities(): Observable<any> {
    return this.http.get<any>(this.apiUrl);
  }

  // GET: Fetch a single AuthActivity by ID
  getActivityById(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`);
  }

  // POST: Create a new AuthActivity
  createActivity(activity: any): Observable<any> {
    return this.http.post<any>(this.apiUrl, activity, {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // PUT: Update an existing AuthActivity
  updateActivity(id: number, activity: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}`, activity, {
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


}
