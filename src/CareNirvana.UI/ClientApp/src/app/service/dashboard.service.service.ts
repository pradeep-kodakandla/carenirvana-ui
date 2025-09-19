import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DashboardServiceService {

  private apiUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/dashboard';
  //private apiUrl = 'https://localhost:51346/api/dashboard';
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
}
