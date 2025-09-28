import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, tap, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthenticateService {
  private apiUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/user';
  //private apiUrl = 'https://localhost:51346/api/user';

  constructor(private http: HttpClient) { }

  login(username: string, password: string): Observable<any> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http.post(`${this.apiUrl}/authenticate`, { UserName: username, Password: password }, { headers, responseType: 'json' })
      .pipe(
        //tap(response => console.log('API Response:', response)), // Debug the response
        catchError(error => {
          console.error('Error from API:', error);
          return throwError(() => new Error('Login failed'));
        })
      );
  }


  getAllUsers(): Observable<any[]> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });

    return this.http.get<any[]>(`${this.apiUrl}/alluser`, { headers, responseType: 'json' as const })
      .pipe(
        // tap(response => console.log('All Users Response:', response)), // Optional debug
        catchError(error => {
          console.error('Error fetching all users:', error);
          return throwError(() => new Error('Failed to fetch users'));
        })
      );
  }

}
