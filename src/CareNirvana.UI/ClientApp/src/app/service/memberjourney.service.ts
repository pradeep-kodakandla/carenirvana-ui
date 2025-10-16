import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

export enum EventCategory {
  Auth = 1,
  AuthActivity = 2,
  Enrollment = 3,
  CareStaff = 4,
  Caregiver = 5,
  Program = 6,
  Note = 7,
  Risk = 8,
  Alert = 9,
}


export interface MemberJourneyEvent {
  eventId: string;
  memberDetailsId: number;
  category: EventCategory;
  title: string;
  subtitle?: string | null;
  severity?: 'High' | 'Medium' | 'Low' | null;
  eventUtc: string; // ISO string from server
  icon?: string | null;
  sourceId?: string | null;
  sourceTable?: string | null;
  actionUrl?: string | null;
  extraJson?: string | null;
}


export interface MemberJourneySummary {
  total: number;
  authCount: number;
  authActivityCount: number;
  enrollmentCount: number;
  careStaffCount: number;
  caregiverCount: number;
  programCount: number;
  noteCount: number;
  riskCount: number;
  alertCount: number;
}


export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}


export interface MemberJourneyResponse {
  page: PagedResult<MemberJourneyEvent>;
  summary: MemberJourneySummary;
}


export interface MemberJourneyQuery {
  memberDetailsId: number;
  fromUtc?: string | null;
  toUtc?: string | null;
  page?: number;
  pageSize?: number;
  search?: string | null;
  categories?: EventCategory[] | null;
}


export const CATEGORY_META: Record<EventCategory, { label: string; color: string; rightBorder?: boolean; }>
  = {
  [EventCategory.Alert]: { label: 'Alerts', color: '#ef5350' }, // red
  [EventCategory.Auth]: { label: 'Auth', color: '#42a5f5' }, // blue
  [EventCategory.AuthActivity]: { label: 'Activity', color: '#5c6bc0' }, // indigo
  [EventCategory.Enrollment]: { label: 'Enrollment', color: '#26a69a' }, // teal
  [EventCategory.CareStaff]: { label: 'Care Staff', color: '#7e57c2' }, // purple
  [EventCategory.Caregiver]: { label: 'Caregiver', color: '#ab47bc' }, // purple-ish
  [EventCategory.Program]: { label: 'Program', color: '#29b6f6' }, // light blue
  [EventCategory.Note]: { label: 'Note', color: '#90a4ae' }, // blue-gray
  [EventCategory.Risk]: { label: 'Risk', color: '#66bb6a', rightBorder: true }, // green right border
};

function normalizeEvent(it: any): MemberJourneyEvent {
  return {
    eventId: it.eventId ?? it.EventId ?? null,
    memberDetailsId: it.memberDetailsId ?? it.MemberDetailsId ?? 0,
    category: it.category ?? it.Category ?? (1 as EventCategory),
    title: it.title ?? it.Title ?? '',
    subtitle: it.subtitle ?? it.Subtitle ?? null,
    severity: it.severity ?? it.Severity ?? null,
    eventUtc: it.eventUtc ?? it.EventUtc ?? null,
    icon: it.icon ?? it.Icon ?? null,
    sourceId: it.sourceId ?? it.SourceId ?? null,
    sourceTable: it.sourceTable ?? it.SourceTable ?? null,
    actionUrl: it.actionUrl ?? it.ActionUrl ?? null,
    extraJson: it.extraJson ?? it.ExtraJson ?? null,
  };
}

@Injectable({
  providedIn: 'root'
})
export class MemberjourneyService {

  private baseUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/MemberJourney';
  //private baseUrl = 'https://localhost:7201/api/MemberJourney';

  constructor(private http: HttpClient) { }


  getJourney(q: MemberJourneyQuery) {
    let params = new HttpParams();
    if (q.fromUtc) params = params.set('fromUtc', q.fromUtc);
    if (q.toUtc) params = params.set('toUtc', q.toUtc);
    if (q.page) params = params.set('page', String(q.page));
    if (q.pageSize) params = params.set('pageSize', String(q.pageSize));
    if (q.search) params = params.set('search', q.search);


    if (q.categories && q.categories.length) {
      q.categories.forEach(c => params = params.append('categories', String(c)));
    }


    const url = `${this.baseUrl}/${q.memberDetailsId}/journey`;
    return this.http.get<any>(url, { params }).pipe(
      map((raw: any): MemberJourneyResponse => {
        // support both {page:{Items...}} and raw array []
        const p = raw.page ?? {};
        const s = raw.summary ?? {};

        const rawItems: any[] = Array.isArray(raw) ? raw : (p.items ?? p.Items ?? []);
        const items = rawItems.map(normalizeEvent);

        const page: PagedResult<MemberJourneyEvent> = {
          items,
          page: p.page ?? p.Page ?? 1,
          pageSize: p.pageSize ?? p.PageSize ?? 25,
          total: p.total ?? p.Total ?? (Array.isArray(raw) ? items.length : 0)
        };

        const summary: MemberJourneySummary = {
          total: s.total ?? s.Total ?? page.total,
          authCount: s.authCount ?? s.AuthCount ?? 0,
          authActivityCount: s.authActivityCount ?? s.AuthActivityCount ?? 0,
          enrollmentCount: s.enrollmentCount ?? s.EnrollmentCount ?? 0,
          careStaffCount: s.careStaffCount ?? s.CareStaffCount ?? 0,
          caregiverCount: s.caregiverCount ?? s.CaregiverCount ?? 0,
          programCount: s.programCount ?? s.ProgramCount ?? 0,
          noteCount: s.noteCount ?? s.NoteCount ?? 0,
          riskCount: s.riskCount ?? s.RiskCount ?? 0,
          alertCount: s.alertCount ?? s.AlertCount ?? 0,
        };

        return { page, summary };
      })
    );
  }
}
