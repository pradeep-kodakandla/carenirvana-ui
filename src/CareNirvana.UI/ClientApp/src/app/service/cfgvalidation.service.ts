import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CfgValidationDto {
  validationId?: number | null;
  validationJson: string;     // jsonb stored as string
  validationName: string;
  moduleId: number;

  activeFlag?: boolean;

  createdOn?: string | null;
  createdBy?: number | null;

  updatedOn?: string | null;
  updatedBy?: number | null;

  deletedOn?: string | null;
  deletedBy?: number | null;
}

@Injectable({
  providedIn: 'root'
})
export class CfgvalidationService {

  private baseUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/cfgvalidation';
  //private baseUrl = 'https://localhost:7201/api/cfgvalidation';

  constructor(private http: HttpClient) { }

  // same header pattern as your attached service (x-userid from sessionStorage)
  private userHeader(): HttpHeaders {
    const userId = sessionStorage.getItem('loggedInUserid') ?? '0';
    return new HttpHeaders({ 'x-userid': userId });
  }

  // GET /api/cfgvalidation/modules/{moduleId}/validations
  getAll(moduleId: number): Observable<CfgValidationDto[]> {
    return this.http.get<CfgValidationDto[]>(
      `${this.baseUrl}/modules/${moduleId}/validations`
    );
  }

  // GET /api/cfgvalidation/validations/{validationId}
  getById(validationId: number): Observable<CfgValidationDto> {
    return this.http.get<CfgValidationDto>(
      `${this.baseUrl}/validations/${validationId}`
    );
  }

  // POST /api/cfgvalidation/validations  => returns { validationId }
  insert(req: CfgValidationDto): Observable<{ validationId: number }> {
    return this.http.post<{ validationId: number }>(
      `${this.baseUrl}/validations`,
      req,
      { headers: this.userHeader() }
    );
  }

  // PUT /api/cfgvalidation/validations/{validationId}
  update(validationId: number, req: CfgValidationDto): Observable<void> {
    return this.http.put<void>(
      `${this.baseUrl}/validations/${validationId}`,
      req,
      { headers: this.userHeader() }
    );
  }

  // DELETE /api/cfgvalidation/validations/{validationId}  (soft delete)
  delete(validationId: number): Observable<void> {
    return this.http.delete<void>(
      `${this.baseUrl}/validations/${validationId}`,
      { headers: this.userHeader() }
    );
  }

  getPrimaryTemplateJson(moduleId: number): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/modules/${moduleId}/primary-template`);
  }
}
