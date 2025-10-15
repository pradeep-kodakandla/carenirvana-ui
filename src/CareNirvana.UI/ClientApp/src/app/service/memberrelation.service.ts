import { Injectable, Inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map, retry } from 'rxjs/operators';

export interface MemberCaregiverDto {
  caregiver: MemberCaregiver;
  addresses: MemberCaregiverAddress[];
  phones: MemberCaregiverPhone[];
  languages: MemberCaregiverLanguage[];
  portal: MemberCaregiverMemberPortal[];
}

export interface MemberCaregiver {
  memberCaregiverId?: number;
  memberDetailsId?: number;
  caregiverFirstName?: string;
  caregiverLastName?: string;
  caregiverMiddleName?: string;
  caregiverBrithDate?: string;
  genderId?: number;
  ethnicityId?: number;
  raceId?: number;
  residenceStatusId?: number;
  maritalStatusId?: number;
  relationshipTypeId?: number;
  primaryEmail?: string;
  alternateEmail?: string;
  isHealthcareProxy?: boolean;
  isPrimary?: boolean;
  isFormalCaregiver?: boolean;
  activeFlag?: boolean;
  createdOn?: string;
  createdBy?: number;
  updatedOn?: string;
  updatedBy?: number;
  deletedOn?: string;
  deletedBy?: number;
}

export interface MemberCaregiverAddress {
  memberCaregiverAddressId?: number;
  memberCaregiverId?: number;
  addressTypeId?: number;
  addressLine1?: string;
  addressLine2?: string;
  addressLine3?: string;
  city?: string;
  countyId?: number;
  stateId?: number;
  country?: string;
  zipCode?: string;
  boroughId?: number;
  islandId?: number;
  regionId?: number;
  isPrimary?: boolean;
}

export interface MemberCaregiverPhone {
  memberCaregiverPhoneId?: number;
  memberCaregiverId?: number;
  phoneTypeId?: number;
  isPrimary?: boolean;
}

export interface MemberCaregiverLanguage {
  memberCaregiverLanguageId?: number;
  memberCaregiverId?: number;
  languageId?: number;
  isPrimary?: boolean;
}

export interface MemberCaregiverMemberPortal {
  memberCaregiverMemberPortalId?: number;
  memberCaregiverId?: number;
  isMemberPortalAccess?: boolean;
  isRegistrationRequired?: boolean;
}

export interface MemberCareStaffView {
  memberCareStaffId: number;
  memberDetailsId: number;
  userId: number;
  userName?: string;
  roleName?: string;
  isPrimary?: boolean;
  activeFlag?: boolean;
  startDate?: string | Date | null;
}

export interface MemberCareStaffCreateRequest {
  memberDetailsId: number;
  userId: number;
  roleId?: number;
  isPrimary?: boolean;
  createdBy?: number;
}

export interface MemberCareStaffUpdateRequest {
  userId?: number;
  roleId?: number;
  isPrimary?: boolean;
  updatedBy?: number;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

@Injectable({
  providedIn: 'root'
})
export class MemberrelationService {


  private caregiverBase = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/MemberCareGiver';
  // private caregiverBase = 'https://localhost:7201/api/MemberCareGiver';
  private careteamBase = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/MemberCareTeam';
  //private careteamBase = 'https://localhost:7201/api/MemberCareTeam';

  constructor(private http: HttpClient) { }

  // ------------------------
  // CAREGIVER endpoints
  // ------------------------

  /** GET all caregivers (and related tables) by memberDetailsId */
  getCaregiversByMember(memberDetailsId: number): Observable<MemberCaregiverDto[]> {
    return this.http.get<any[]>(`${this.caregiverBase}/by-member/${memberDetailsId}`).pipe(
      retry(1),
      map(list => (Array.isArray(list) ? list : []).map(x => this.toCamel(x))),
      catchError(this.handle)
    );
  }

  /** GET one caregiver by id */
  getCaregiver(id: number): Observable<MemberCaregiver> {
    return this.http.get<any>(`${this.caregiverBase}/${id}`).pipe(
      retry(1),
      map(x => this.toCamel(x)),
      catchError(this.handle)
    );
  }

  /** POST create caregiver */
  createCaregiver(body: MemberCaregiver): Observable<number> {
    return this.http
      .post<number>(`${this.caregiverBase}`, body)
      .pipe(catchError(this.handle));
  }

  /** PUT update caregiver */
  updateCaregiver(id: number, body: MemberCaregiver): Observable<void> {
    return this.http
      .put<void>(`${this.caregiverBase}/${id}`, body)
      .pipe(catchError(this.handle));
  }

  /** DELETE soft delete caregiver */
  deleteCaregiver(id: number, deletedBy: number): Observable<void> {
    const params = new HttpParams().set('deletedBy', deletedBy);
    return this.http
      .delete<void>(`${this.caregiverBase}/${id}`, { params })
      .pipe(catchError(this.handle));
  }

  // ------------------------
  // CARE TEAM endpoints
  // ------------------------

  /** GET paged list (supports optional filters) */
  listCareTeam(
    opts: { userId?: number; memberDetailsId?: number; includeInactive?: boolean; page?: number; pageSize?: number; search?: string }
  ): Observable<PagedResult<MemberCareStaffView>> {
    let params = new HttpParams();
    if (opts.userId) params = params.set('userId', opts.userId);
    if (opts.memberDetailsId) params = params.set('memberDetailsId', opts.memberDetailsId);
    if (opts.includeInactive) params = params.set('includeInactive', opts.includeInactive);
    if (opts.page) params = params.set('page', opts.page);
    if (opts.pageSize) params = params.set('pageSize', opts.pageSize);
    if (opts.search) params = params.set('search', opts.search);

    return this.http.get<any>(`${this.careteamBase}`, { params }).pipe(
      map(res => {
        // Normalize property casing
        const items = (res.Items || res.items || []).map((x: any) => this.toCamel(x));
        const total = res.Total ?? res.totalCount ?? 0;
        return { items, totalCount: total } as PagedResult<MemberCareStaffView>;
      }),
      catchError(this.handle)
    );
  }

  /** GET one care team member */
  getCareTeamMember(id: number): Observable<MemberCareStaffView> {
    return this.http
      .get<MemberCareStaffView>(`${this.careteamBase}/${id}`)
      .pipe(retry(1), catchError(this.handle));
  }

  /** POST create new care team assignment */
  createCareTeam(req: MemberCareStaffCreateRequest): Observable<MemberCareStaffView> {
    return this.http
      .post<MemberCareStaffView>(`${this.careteamBase}`, req)
      .pipe(catchError(this.handle));
  }

  /** PUT update care team assignment */
  updateCareTeam(id: number, req: MemberCareStaffUpdateRequest): Observable<MemberCareStaffView> {
    return this.http
      .put<MemberCareStaffView>(`${this.careteamBase}/${id}`, req)
      .pipe(catchError(this.handle));
  }

  /** DELETE soft delete care team assignment */
  deleteCareTeam(id: number, deletedBy?: number): Observable<void> {
    const params = deletedBy ? new HttpParams().set('deletedBy', deletedBy) : undefined;
    return this.http
      .delete<void>(`${this.careteamBase}/${id}`, { params })
      .pipe(catchError(this.handle));
  }

  // ------------------------
  // shared handler
  // ------------------------
  private handle = (err: any) => {
    console.error('API Error:', err);
    return throwError(() => err);
  };



  /** Convert object keys recursively from PascalCase to camelCase */
  private toCamel(obj: any): any {
    if (Array.isArray(obj)) return obj.map(v => this.toCamel(v));
    if (obj !== null && typeof obj === 'object') {
      return Object.keys(obj).reduce((acc, key) => {
        const camel = key.charAt(0).toLowerCase() + key.slice(1);
        acc[camel] = this.toCamel(obj[key]);
        return acc;
      }, {} as any);
    }
    return obj;
  }


}
