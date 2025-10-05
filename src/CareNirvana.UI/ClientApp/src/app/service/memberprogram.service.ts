import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
// Adjust this import if your environment path differs
import { environment } from 'src/environments/environment';

export interface MemberProgram {
  memberProgramId: number;
  memberDetailsId: number;
  programId: number;
  memberEnrollmentId?: number | null;
  programStatusId: number;
  programStatusReasonId?: number | null;
  programReferralSourceId?: number | null;
  assignedTo?: number | null;
  startDate: string | Date;         // date-only
  endDate?: string | Date | null;   // date-only
  activeFlag?: boolean | null;

  createdOn?: string | Date;
  createdBy: number;
  updatedOn?: string | Date | null;
  updatedBy?: number | null;
  deletedOn?: string | Date | null;
  deletedBy?: number | null;
}

export type MemberProgramCreate = Omit<MemberProgram, 'memberProgramId' | 'updatedOn' | 'updatedBy' | 'deletedOn' | 'deletedBy'>;

export interface MemberProgramPaged {
  items: MemberProgram[];
  total: number;
}

@Injectable({
  providedIn: 'root'
})
export class MemberprogramService {

  private baseUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/memberprogram';
  //private baseUrl = 'https://localhost:51346/api/memberprogram';

  constructor(private http: HttpClient) { }

  /** Create a record. Server sets CreatedOn (UTC) in controller. */
  create(payload: MemberProgramCreate): Observable<{ memberProgramId: number }> {
    const body = this.serializeDatesForUpsert(payload);
    return this.http.post<{ memberProgramId: number }>(`${this.baseUrl}/create`, body);
  }

  /** Update a record. Server sets UpdatedOn (UTC) in controller. */
  update(payload: MemberProgram): Observable<{ updatedCount: number }> {
    const body = this.serializeDatesForUpsert(payload);
    return this.http.put<{ updatedCount: number }>(`${this.baseUrl}/update`, body);
  }

  /** Soft-delete a record. */
  delete(memberProgramId: number, deletedBy: number): Observable<{ deletedCount: number }> {
    const params = new HttpParams().set('deletedBy', String(deletedBy));
    return this.http.delete<{ deletedCount: number }>(`${this.baseUrl}/delete/${memberProgramId}`, { params });
  }

  list(memberDetailsId: number, page = 1, pageSize = 25, includeDeleted = false): Observable<MemberProgramPaged> {
    let params = new HttpParams()
      .set('page', String(page))
      .set('pageSize', String(pageSize))
      .set('includeDeleted', String(includeDeleted));

    return this.http
      .get<any>(`${this.baseUrl}/list/${memberDetailsId}`, { params })
      .pipe(
        map(res => {
          const items = (res.items ?? []).map((x: any) => this.convertItem(x));
          const total = res.total ?? 0;
          return { items, total };
        })
      );
  }

  getById(memberProgramId: number): Observable<MemberProgram> {
    return this.http.get<any>(`${this.baseUrl}/${memberProgramId}`)
      .pipe(map(x => this.convertItem(x)));
  }


  /** Active (non-deleted) list for a member (non-paged). */
  listActive(memberDetailsId: number): Observable<MemberProgram[]> {
    return this.http
      .get<MemberProgram[]>(`${this.baseUrl}/active/${memberDetailsId}`)
      .pipe(map(arr => (arr ?? []).map(x => this.hydrateDates(x))));
  }

  // ───────────────────────────────── helpers ─────────────────────────────────

  /** Convert any Date values to `YYYY-MM-DD` strings for date-only DB fields. */
  private serializeDatesForUpsert<T extends Partial<MemberProgram>>(obj: T): T {
    const clone: any = { ...obj };
    if (clone.startDate) clone.startDate = this.toDateOnly(clone.startDate);
    if (clone.endDate != null) clone.endDate = this.toDateOnly(clone.endDate);
    // createdOn/updatedOn are set server-side; leave them alone if present
    return clone;
  }

  /** Turn date-only strings from API into Date for UI convenience (optional). */
  private hydrateDates<T extends Partial<MemberProgram>>(obj: T): T {
    const clone: any = { ...obj };
    // If you prefer to keep them as strings, remove these lines.
    if (clone.startDate && typeof clone.startDate === 'string') clone.startDate = new Date(clone.startDate);
    if (clone.endDate && typeof clone.endDate === 'string') clone.endDate = new Date(clone.endDate);
    if (clone.createdOn && typeof clone.createdOn === 'string') clone.createdOn = new Date(clone.createdOn);
    if (clone.updatedOn && typeof clone.updatedOn === 'string') clone.updatedOn = new Date(clone.updatedOn);
    if (clone.deletedOn && typeof clone.deletedOn === 'string') clone.deletedOn = new Date(clone.deletedOn);
    return clone;
  }

  /** Accepts Date or string; returns `YYYY-MM-DD` or null. */
  private toDateOnly(value: Date | string | null | undefined): string | null {
    if (value == null) return null;
    const d = typeof value === 'string' ? new Date(value) : value;
    if (isNaN(d.getTime())) return null;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // ── Normalization helpers: accept PascalCase or camelCase from API ──
  private pick<T = any>(o: any, camel: string, pascal: string, fallback: T | null = null): T | null {
    return (o && (o[camel] !== undefined ? o[camel] : o[pascal] !== undefined ? o[pascal] : fallback)) as any;
  }

  private convertItem(o: any): MemberProgram {
    const mp: MemberProgram = {
      memberProgramId: this.pick<number>(o, 'memberProgramId', 'MemberProgramId')!,
      memberDetailsId: this.pick<number>(o, 'memberDetailsId', 'MemberDetailsId')!,
      programId: this.pick<number>(o, 'programId', 'ProgramId')!,
      memberEnrollmentId: this.pick<number | null>(o, 'memberEnrollmentId', 'MemberEnrollmentId', null),
      programStatusId: this.pick<number>(o, 'programStatusId', 'ProgramStatusId')!,
      programStatusReasonId: this.pick<number | null>(o, 'programStatusReasonId', 'ProgramStatusReasonId', null),
      programReferralSourceId: this.pick<number | null>(o, 'programReferralSourceId', 'ProgramReferralSourceId', null),
      assignedTo: this.pick<number | null>(o, 'assignedTo', 'AssignedTo', null),
      startDate: this.pick<string>(o, 'startDate', 'StartDate')!,
      endDate: this.pick<string | null>(o, 'endDate', 'EndDate', null),
      activeFlag: this.pick<boolean | null>(o, 'activeFlag', 'ActiveFlag', null),

      createdOn: this.pick<string>(o, 'createdOn', 'CreatedOn')!,
      createdBy: this.pick<number>(o, 'createdBy', 'CreatedBy')!,
      updatedOn: this.pick<string | null>(o, 'updatedOn', 'UpdatedOn', null),
      updatedBy: this.pick<number | null>(o, 'updatedBy', 'UpdatedBy', null),
      deletedOn: this.pick<string | null>(o, 'deletedOn', 'DeletedOn', null),
      deletedBy: this.pick<number | null>(o, 'deletedBy', 'DeletedBy', null)
    };
    return this.hydrateDates(mp);
  }

}

