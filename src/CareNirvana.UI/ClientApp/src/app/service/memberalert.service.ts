import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { camelize } from 'src/app/service/caseutils.service';
import { map } from 'rxjs/operators';

export interface MemberAlert {
  memberAlertId: number;
  memberDetailsId?: number | null;
  memberFirstName?: string | null;
  memberLastName?: string | null;
  alertId?: number | null;
  cfgAlertName?: string | null;
  alterSourceId?: number | null;
  alertSourceName?: string | null;
  alertSourceCode?: string | null;
  alertTypeId?: number | null;
  alertTypeName?: string | null;
  alertTypeCode?: string | null;
  alertStatusId?: number | null;
  alertStatusName?: string | null;
  alertStatusCode?: string | null;
  alertDate?: string | null;
  endDate?: string | null;
  dismissedDate?: string | null;
  acknowledgedDate?: string | null;
  activeFlag?: boolean | null;
  createdOn?: string | null;
  createdBy?: number | null;
  updatedOn?: string | null;
  updatedBy?: number | null;
  deletedOn?: string | null;
  deletedBy?: number | null;
}

export interface PagedResult<T> {
  total: number;
  items: T[];
}

export interface UpdateAlertStatusRequest {
  alertStatusId?: number | null;
  dismissedDate?: string | null;
  acknowledgedDate?: string | null;
  updatedBy?: number | null;
}

export interface UpdateAlertStatusResponse {
  message: string;
  memberAlertId: number;
}

@Injectable({
  providedIn: 'root'
})
export class MemberalertService {

  private apiUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/MemberAlert';
  //private apiUrl = 'https://localhost:51346/api/MemberAlert';


  constructor(private http: HttpClient) { }

  getAlerts(
    memberDetailsIds?: number[] | null,
    alertId?: number | null,
    activeOnly: boolean = true,
    page: number = 1,
    pageSize: number = 25
  ): Observable<PagedResult<MemberAlert>> {
    let params = new HttpParams()
      .set('activeOnly', activeOnly)
      .set('page', page)
      .set('pageSize', pageSize);

    if (alertId != null) params = params.set('alertId', alertId);
    if (memberDetailsIds?.length) {
      memberDetailsIds.forEach(id => params = params.append('memberDetailsId', id));
    }

    // Server currently returns PascalCase: { "Total": N, "Items": [...] }
    return this.http.get<any>(this.apiUrl, { params }).pipe(
      map(res => {
        const c = camelize(res) as { total: number; items: any[] };
        // items are also camelized, so this matches your MemberAlert interface
        return { total: c.total, items: c.items as MemberAlert[] };
      })
    );
  }

  /**
   * ✅ Update alert status, dismissedDate, or acknowledgedDate
   */
  updateAlertStatus(memberAlertId: number, payload: UpdateAlertStatusRequest): Observable<UpdateAlertStatusResponse> {
    return this.http.put<UpdateAlertStatusResponse>(
      `${this.apiUrl}/${memberAlertId}/status`,
      payload
    );
  }
}
