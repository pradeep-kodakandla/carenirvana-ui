import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

// member-activity.models.ts

export interface CreateMemberActivityRequest {
  activityTypeId?: number;
  priorityId?: number;
  memberDetailsId?: number;
  followUpDateTime?: string; // ISO string
  dueDate?: string;          // ISO string
  referTo?: number;
  isWorkBasket?: boolean;
  queueId?: number;
  comment?: string;
  statusId?: number;
  performedDateTime?: string;
  performedBy?: number;
  activeFlag?: boolean;

  workGroupWorkBasketId?: number; // for pool activities
  createdBy: number;
}

export interface UpdateMemberActivityRequest {
  memberActivityId: number;
  activityTypeId?: number;
  priorityId?: number;
  memberDetailsId?: number;
  followUpDateTime?: string;
  dueDate?: string;
  queueId?: number;
  comment?: string;
  statusId?: number;
  performedDateTime?: string;
  performedBy?: number;
  activeFlag?: boolean;

  updatedBy: number;
}

export interface AcceptWorkGroupActivityRequest {
  memberActivityWorkGroupId: number;
  userId: number;
  comment?: string;
}

export interface RejectWorkGroupActivityRequest {
  memberActivityWorkGroupId: number;
  userId: number;
  comment?: string;
}

export interface DeleteMemberActivityRequest {
  memberActivityId: number;
  deletedBy: number;
}

export interface MemberActivityRequestItem {
  memberActivityId: number;
  memberActivityWorkGroupId: number;
  workGroupWorkBasketId: number;
  memberDetailsId?: number;
  activityTypeId?: number;
  priorityId?: number;
  followUpDateTime?: string;
  dueDate?: string;
  comment?: string;
  statusId?: number;

  rejectedCount: number;
  rejectedUserIds: number[];
}

export interface MemberActivityCurrentItem {
  memberActivityId: number;
  memberDetailsId?: number;
  activityTypeId?: number;
  priorityId?: number;
  followUpDateTime?: string;
  dueDate?: string;
  comment?: string;
  statusId?: number;
  referTo?: number;
  performedDateTime?: string;
  performedBy?: number;
}

export interface ActivityFilter {
  fromFollowUpDate?: string; // ISO (yyyy-MM-dd or full datetime)
  toFollowUpDate?: string;
  memberDetailsId?: number;
}

export interface MemberActivityAssignedUserItem {
  userId: number;
  userFullName?: string | null;
  status?: 'Accepted' | 'Rejected' | 'Request' | string | null;
}

export interface MemberActivityDetailItem {
  memberActivityId: number;
  memberDetailsId: number;
  activityTypeId?: number | null;
  priorityId?: number | null;
  followUpDateTime?: string | null; // ISO string from API
  dueDate?: string | null;
  comment?: string | null;
  statusId?: number | null;
  referTo?: number | null;
  isWorkBasket: boolean;
  memberActivityWorkGroupId?: number | null;
  workGroupWorkBasketId?: number | null;

  assignedUsers: MemberActivityAssignedUserItem[];
}


@Injectable({
  providedIn: 'root'
})

export class MemberactivityService {

  private baseUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/memberactivity';
  //private baseUrl = 'https://localhost:7201/api/memberactivity';


  constructor(private http: HttpClient) { }

  // ---------- CREATE ----------

  createActivity(request: CreateMemberActivityRequest): Observable<{ memberActivityId: number }> {
    return this.http.post<{ memberActivityId: number }>(
      `${this.baseUrl}/create`,
      request
    );
  }

  // ---------- UPDATE ----------

  updateActivity(request: UpdateMemberActivityRequest): Observable<{ affectedRows: number }> {
    return this.http.put<{ affectedRows: number }>(
      `${this.baseUrl}/update`,
      request
    );
  }

  // ---------- ACCEPT / REJECT ----------

  acceptWorkGroupActivity(
    request: AcceptWorkGroupActivityRequest
  ): Observable<{ affectedRows: number }> {
    return this.http.post<{ affectedRows: number }>(
      `${this.baseUrl}/accept`,
      request
    );
  }

  rejectWorkGroupActivity(
    request: RejectWorkGroupActivityRequest
  ): Observable<{ affectedRows: number }> {
    return this.http.post<{ affectedRows: number }>(
      `${this.baseUrl}/reject`,
      request
    );
  }

  // ---------- DELETE (SOFT) ----------

  deleteActivity(
    request: DeleteMemberActivityRequest
  ): Observable<{ affectedRows: number }> {
    return this.http.post<{ affectedRows: number }>(
      `${this.baseUrl}/delete`,
      request
    );
  }

  // ---------- GET REQUEST ACTIVITIES (POOL) ----------

  /**
   * Request activities = pending items in workgroup pool.
   * - workGroupWorkBasketIds: multiple basket ids (required)
   * - filters: optional follow-up date range + memberDetailsId
   */
  getRequestActivities(
    workGroupWorkBasketIds: number[],
    filters?: ActivityFilter
  ): Observable<MemberActivityRequestItem[]> {
    let params = new HttpParams();

    // multiple basket ids -> repeated query param:
    // ?workGroupWorkBasketIds=10&workGroupWorkBasketIds=20...
    (workGroupWorkBasketIds || []).forEach(id => {
      params = params.append('workGroupWorkBasketIds', id.toString());
    });

    if (filters?.fromFollowUpDate) {
      params = params.set('fromFollowUpDate', filters.fromFollowUpDate);
    }

    if (filters?.toFollowUpDate) {
      params = params.set('toFollowUpDate', filters.toFollowUpDate);
    }

    if (filters?.memberDetailsId) {
      params = params.set('memberDetailsId', filters.memberDetailsId.toString());
    }

    return this.http.get<MemberActivityRequestItem[]>(
      `${this.baseUrl}/requests`,
      { params }
    );
  }

  // ---------- GET CURRENT ACTIVITIES (OWNED BY USERS) ----------

  /**
   * Current activities = activities where referto in (userIds).
   * - userIds: multiple user ids (required)
   * - filters: optional follow-up date range + memberDetailsId
   */
  getCurrentActivities(
    userIds: number[],
    filters?: ActivityFilter
  ): Observable<MemberActivityCurrentItem[]> {
    let params = new HttpParams();

    // multiple user ids -> repeated query param:
    // ?userIds=101&userIds=102...
    (userIds || []).forEach(id => {
      params = params.append('userIds', id.toString());
    });

    if (filters?.fromFollowUpDate) {
      params = params.set('fromFollowUpDate', filters.fromFollowUpDate);
    }

    if (filters?.toFollowUpDate) {
      params = params.set('toFollowUpDate', filters.toFollowUpDate);
    }

    if (filters?.memberDetailsId) {
      params = params.set('memberDetailsId', filters.memberDetailsId.toString());
    }

    return this.http.get<MemberActivityCurrentItem[]>(
      `${this.baseUrl}/current`,
      { params }
    );
  }
  getMemberActivityDetail(memberActivityId: number): Observable<MemberActivityDetailItem> {
    const url = `${this.baseUrl}/${memberActivityId}`;
    return this.http.get<MemberActivityDetailItem>(url);
  }
}

