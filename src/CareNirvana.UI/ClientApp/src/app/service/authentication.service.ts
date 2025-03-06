import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, tap, throwError } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/user/authenticate';
  //private apiUrl = 'https://localhost:51346/api/user/authenticate';

  constructor(private http: HttpClient) { }

  login(username: string, password: string): Observable<any> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http.post(this.apiUrl, { UserName: username, Password: password }, { headers, responseType: 'json' })
      .pipe(
        tap(response => console.log('API Response:', response)), // Debug the response
        catchError(error => {
          console.error('Error from API:', error);
          return throwError(() => new Error('Login failed'));
        })
      );
  }
}
