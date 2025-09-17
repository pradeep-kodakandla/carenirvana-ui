import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class MemberenrollmentService {

  private apiUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/enrollment';
 // private apiUrl = 'https://localhost:51346/api/enrollment';


  constructor(private http: HttpClient) { }

  // Fetch Member Enrollment from API
  getMemberEnrollment(memberDetailsId: any): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${memberDetailsId}`);
  }
}
