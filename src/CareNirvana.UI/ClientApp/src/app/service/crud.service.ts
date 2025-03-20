//import { Injectable } from '@angular/core';
//import { HttpClient } from '@angular/common/http';
//import { Observable } from 'rxjs';

//@Injectable({
//  providedIn: 'root'
//})
//export class CrudService {
//  private cmUrl = 'http://localhost:3000';
//  private umUrl = 'http://localhost:3001';
//  private agUrl = 'http://localhost:3002';
//  private adminUrl = 'http://localhost:3003';

//  constructor(private http: HttpClient) { }

//  getData(module: string, section: string): Observable<any[]> {
//    switch (module) {
//      case "cm":
//        return this.http.get<any[]>(`${this.cmUrl}/${section}`);
//        break;
//      case "um":
//        return this.http.get<any[]>(`${this.umUrl}/${section}`);
//        break;
//      case "ag":
//        return this.http.get<any[]>(`${this.agUrl}/${section}`);
//        break;
//      case "admin":
//        return this.http.get<any[]>(`${this.adminUrl}/${section}`);
//        break;
//      default:
//        return this.http.get<any[]>(``); break;
//    }
//  }

//  addData(module: string, section: string, entry: any): Observable<any> {
//    entry.createdBy = 'current_user'; // Replace with the actual user
//    entry.createdOn = new Date().toISOString();
//    switch (module) {
//      case "cm":
//        return this.http.post<any>(`${this.cmUrl}/${section}`, entry);
//        break;
//      case "um":
//        return this.http.post<any>(`${this.umUrl}/${section}`, entry);
//        break;
//      case "ag":
//        return this.http.post<any>(`${this.agUrl}/${section}`, entry);
//        break;
//      case "admin":
//        return this.http.post<any>(`${this.adminUrl}/${section}`, entry);
//        break;
//      default:
//        return this.http.get<any[]>(``); break;
//    }

//  }

//  updateData(module: string, section: string, id: number, entry: any): Observable<any> {
//    entry.updatedBy = 'current_user'; // Replace with the actual user
//    entry.updatedOn = new Date().toISOString();
//    switch (module) {
//      case "cm":
//        return this.http.put<any>(`${this.cmUrl}/${section}/${id}`, entry);
//        break;
//      case "um":
//        return this.http.put<any>(`${this.umUrl}/${section}/${id}`, entry);
//        break;
//      case "ag":
//        return this.http.put<any>(`${this.agUrl}/${section}/${id}`, entry);
//        break;
//      case "admin":
//        return this.http.put<any>(`${this.adminUrl}/${section}/${id}`, entry);
//        break;
//      default:
//        return this.http.get<any[]>(``); break;
//    }

//  }

//  deleteData(module: string, section: string, id: number, deletedBy: string): Observable<any> {
//    const deletedOn = new Date().toISOString();
//    switch (module) {
//      case "cm":
//        return this.http.patch<any>(`${this.cmUrl}/${section}/${id}`, { deletedBy, deletedOn });
//        break;
//      case "um":
//        return this.http.patch<any>(`${this.umUrl}/${section}/${id}`, { deletedBy, deletedOn });
//        break;
//      case "ag":
//        return this.http.patch<any>(`${this.agUrl}/${section}/${id}`, { deletedBy, deletedOn });
//        break;
//      case "admin":
//        return this.http.patch<any>(`${this.adminUrl}/${section}/${id}`, { deletedBy, deletedOn });
//        break;
//      default:
//        return this.http.get<any[]>(``); break;
//    }

//  }
//}


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


