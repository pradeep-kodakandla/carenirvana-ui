import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { map } from 'rxjs/operators';
export interface RecentlyAccessed {
  recentlyAccessedId?: number;
  userId: number;
  featureId?: number | null;
  featureGroupId?: number | null;
  accessedDateTime?: string | null;
  action?: string | null;
  memberDetailsId: number;
  authDetailId?: number | null;
  complaintDetailId?: number | null;
}

export interface RecentlyAccessedView {
  recentlyAccessedId: number;
  userId: number;
  featureId?: number | null;
  featureName?: string | null;
  featureGroupId?: number | null;
  featureGroupName?: string | null;
  accessedDateTime: string;
  action?: string | null;
  memberDetailsId: number;
  authDetailId?: number | null;
  complaintDetailId?: number | null;
  memberId?: string | null;
  authNumber?: string | null;
  memberName?: string | null;
}

export interface Last24hCounts {
  memberAccessCount: number;
  authorizationAccessCount: number;
  complaintAccessCount: number;
}

@Injectable({
  providedIn: 'root'
})
export class AuthenticateService {
  private apiUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/user';
 // private apiUrl = 'https://localhost:7201/api/user';

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

  getRecentlyAccessed(userId: number, fromUtc?: string, toUtc?: string, limit: number = 100, offset: number = 0): Observable<RecentlyAccessedView[]> {
    let params = new HttpParams()
      .set('limit', limit)
      .set('offset', offset);

    if (fromUtc) params = params.set('fromUtc', fromUtc);
    if (toUtc) params = params.set('toUtc', toUtc);

    return this.http.get<RecentlyAccessedView[]>(`${this.apiUrl}/${userId}/recentlyaccessed`, { params });
  }

  addRecentlyAccessed(userId: number, item: RecentlyAccessed): Observable<number> {
    return this.http.post<number>(`${this.apiUrl}/${userId}/recentlyaccessed`, item);
  }

  getRecentlyAccessedCounts(userId: number) {
    return this.http.get<any>(`${this.apiUrl}/${userId}/recentlyaccessed/counts`).pipe(
      map((r: any): Last24hCounts => ({
        memberAccessCount: r?.memberAccessCount ?? r?.MemberAccessCount ?? 0,
        authorizationAccessCount: r?.authorizationAccessCount ?? r?.AuthorizationAccessCount ?? 0,
        complaintAccessCount: r?.complaintAccessCount ?? r?.ComplaintAccessCount ?? 0,
      }))
    );
  }

}
