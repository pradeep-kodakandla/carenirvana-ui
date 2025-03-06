import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/auth'; // Update with your API URL
  //private apiUrl = 'https://localhost:51346/api/auth'; // Update with your API URL

  constructor(private http: HttpClient) { }

  // Fetch auth templates from API
  getAuthTemplates(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/fetch`);
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

  
}
