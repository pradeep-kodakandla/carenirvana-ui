import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CrudService {
  private baseUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/configadmin'; // Change this to your deployed backend URL
  //private baseUrl = 'https://localhost:51346/api/configadmin';
  constructor(private http: HttpClient) { }

  getData(module: string, section: string): Observable<any[]> {
    const httpOptions = {
      headers: new HttpHeaders({
        'Content-Type': 'application/json'
      })
    };

    return this.http.get<any>(`${this.baseUrl}/${module}/${section}`, httpOptions).pipe(
      map(response => {
       // console.log('API Response:', response);
        const items = Array.isArray(response) ? response : response.data || [];
        return items.filter((item: any) => item?.deletedOn == null);
      })
    );
  }

  addData(module: string, section: string, entry: any): Observable<any> {
    entry.createdBy = 'current_user'; // Replace with actual user
    entry.createdOn = new Date().toISOString();
    return this.http.post<any>(`${this.baseUrl}/${module}/${section}`, entry);
  }


  updateData(module: string, section: string, id: number, entry: any): Observable<any> {
    entry.updatedBy = 'current_user'; // Replace with actual user
    entry.updatedOn = new Date().toISOString();

    return this.http.put<any>(`${this.baseUrl}/${module}/${section}/${id}`, entry);
  }

  deleteData(module: string, section: string, id: number, deletedBy: string): Observable<any> {
    const deletedOn = new Date().toISOString();
    return this.http.patch<any>(`${this.baseUrl}/${module}/${section}/${id}`, { deletedBy, deletedOn });
  }
}


