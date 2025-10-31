import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

// Models
export interface WorkGroup {
  workGroupId: number;
  workGroupCode: string;
  workGroupName: string;
  description?: string | null;
  isFax?: boolean;
  isProviderPortal?: boolean;
  activeFlag: boolean;

  createdBy?: string;
  createdOn?: string; // ISO
  updatedBy?: string | null;
  updatedOn?: string | null;
  deletedBy?: string | null;
  deletedOn?: string | null;
}

export interface WorkGroupCreateDto {
  workGroupCode: string;
  workGroupName: string;
  description?: string | null;
  isFax?: boolean;
  isProviderPortal?: boolean;
  createdBy: string;
}

export interface WorkGroupUpdateDto {
  workGroupId: number;
  workGroupCode: string;
  workGroupName: string;
  description?: string | null;
  isFax?: boolean;
  isProviderPortal?: boolean;
  activeFlag: boolean;
  updatedBy: string;
}

// src/app/models/workbasket.model.ts
export interface WorkBasket {
  workBasketId: number;
  workBasketCode: string;
  workBasketName: string;
  description?: string | null;
  activeFlag: boolean;

  createdBy?: string;
  createdOn?: string; // ISO
  updatedBy?: string | null;
  updatedOn?: string | null;
  deletedBy?: string | null;
  deletedOn?: string | null;
}

export interface WorkBasketCreateDto {
  workBasketCode: string;
  workBasketName: string;
  description?: string | null;
  createdBy: string;
  workGroupIds: number[]; // links to cfgworkgroupworkbasket
}

export interface WorkBasketUpdateDto {
  workBasketId: number;
  workBasketCode: string;
  workBasketName: string;
  description?: string | null;
  activeFlag: boolean;
  updatedBy: string;
  workGroupIds: number[];
}

/** API view when calling GET /{id} that includes linked workgroup IDs */
export interface WorkBasketView {
  workBasketId: number;
  workBasketCode: string;
  workBasketName: string;
  description?: string | null;
  activeFlag: boolean;
  workGroupIds: number[];
}



@Injectable({
  providedIn: 'root'
})
export class WorkbasketService {

  private baseWBUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/WorkBasket';
  //private baseWBUrl = 'https://localhost:7201/api/WorkBasket';

  private baseWGUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/WorkGroup';
  //private baseWGUrl = 'https://localhost:7201/api/WorkGroup';
  constructor(private http: HttpClient) { }

  // ===== Work Baskets =====
  /** GET /api/um/workbaskets?includeInactive=bool */
  getAll(includeInactive = false): Observable<WorkBasket[]> {
    const params = new HttpParams().set('includeInactive', includeInactive);
    return this.http.get<WorkBasket[]>(this.baseWBUrl, { params });
  }

  /** GET /api/um/workbaskets/{id} -> WorkBasketView (with workGroupIds) */
  getById(id: number): Observable<WorkBasketView> {
    return this.http.get<WorkBasketView>(`${this.baseWBUrl}/${id}`);
  }

  /** POST /api/um/workbaskets  (returns { id }) */
  create(dto: WorkBasketCreateDto): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(this.baseWBUrl, dto);
  }

  /** PUT /api/um/workbaskets/{id}  (No Content) */
  update(dto: WorkBasketUpdateDto): Observable<void> {
    return this.http.put<void>(`${this.baseWBUrl}/${dto.workBasketId}`, dto);
  }

  /** DELETE /api/um/workbaskets/{id}?deletedBy=abc  (soft delete) */
  softDelete(id: number, deletedBy: string): Observable<void> {
    const params = new HttpParams().set('deletedBy', deletedBy);
    return this.http.delete<void>(`${this.baseWBUrl}/${id}`, { params });
  }

  /** DELETE /api/um/workbaskets/{id}/hard  (hard delete) */
  hardDelete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseWBUrl}/${id}/hard`);
  }

  getByUserId(userId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseWBUrl}/user/${userId}`);
  }


  /** GET /api/um/workgroups?includeInactive=bool */
  getwgAll(includeInactive = false): Observable<WorkGroup[]> {
    const params = new HttpParams().set('includeInactive', includeInactive);
    return this.http.get<WorkGroup[]>(this.baseWGUrl, { params });
  }

  /** GET /api/um/workgroups/{id} */
  getwgById(id: number): Observable<WorkGroup> {
    return this.http.get<WorkGroup>(`${this.baseWGUrl}/${id}`);
  }

  /** POST /api/um/workgroups  (returns { id }) */
  createwg(dto: WorkGroupCreateDto): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(this.baseWGUrl, dto);
  }

  /** PUT /api/um/workgroups/{id}  (No Content) */
  updatewg(dto: WorkGroupUpdateDto): Observable<void> {
    return this.http.put<void>(`${this.baseWGUrl}/${dto.workGroupId}`, dto);
  }

  /** DELETE /api/um/workgroups/{id}?deletedBy=abc  (soft delete) */
  softDeletewg(id: number, deletedBy: string): Observable<void> {
    const params = new HttpParams().set('deletedBy', deletedBy);
    return this.http.delete<void>(`${this.baseWGUrl}/${id}`, { params });
  }

  /** DELETE /api/um/workgroups/{id}/hard  (hard delete) */
  hardDeletewg(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseWGUrl}/${id}/hard`);
  }


}
