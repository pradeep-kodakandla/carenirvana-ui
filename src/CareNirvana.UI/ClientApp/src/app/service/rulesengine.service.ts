import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DecisionTableDefinition } from 'src/app/admin/rulesengine/models/decisiontable.model';


export type ScheduleType = 'DailyOnce' | 'DailyHourly' | 'Weekly' | 'Monthly';
export type RuleType = 'REALTIME' | 'BATCH';

export interface RuleGroupModel {
  id: number;
  name: string;
  scheduleType: ScheduleType;
  description: string;
  purpose: string;
}

export interface RuleModel {
  id: number;
  ruleGroupId: number;
  name: string;
  ruleType: RuleType;
  description: string;
  ruleJson?: any;
}

export interface DecisionTableListItem {
  id: string;
  name: string;
  status: string;
  version: number;
  updatedOn: string;
}



export interface DropdownOption<T> { value: T; label: string; }

@Injectable({ providedIn: 'root' })
export class RulesengineService {

  private baseUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/rulesengine'; // Change this to your deployed backend URL
  //private baseUrl = 'https://localhost:7201/api/rulesengine';
  constructor(private http: HttpClient) { }

  getScheduleOptions(): DropdownOption<ScheduleType>[] {
    return [
      { value: 'DailyOnce', label: 'Daily (Once)' },
      { value: 'DailyHourly', label: 'Daily (Hourly)' },
      { value: 'Weekly', label: 'Weekly' },
      { value: 'Monthly', label: 'Monthly' }
    ];
  }

  getRuleTypeOptions(): DropdownOption<RuleType>[] {
    return [
      { value: 'REALTIME', label: 'Real-time' },
      { value: 'BATCH', label: 'Batch' }
    ];
  }

  getRuleGroups(): Observable<RuleGroupModel[]> {
    return this.http.get<RuleGroupModel[]>(`${this.baseUrl}/rulegroups`);
  }

  createRuleGroup(req: Omit<RuleGroupModel, 'id'>): Observable<number> {
    return this.http.post<number>(`${this.baseUrl}/rulegroups`, req);
  }

  updateRuleGroup(id: number, req: Omit<RuleGroupModel, 'id'>): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/rulegroups/${id}`, req);
  }

  deleteRuleGroup(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/rulegroups/${id}`);
  }

  getRules(ruleGroupId?: number): Observable<RuleModel[]> {
    const q = ruleGroupId ? `?ruleGroupId=${ruleGroupId}` : '';
    return this.http.get<RuleModel[]>(`${this.baseUrl}/rules${q}`);
  }

  createRule(req: Omit<RuleModel, 'id'>): Observable<number> {
    return this.http.post<number>(`${this.baseUrl}/rules`, req);
  }

  updateRule(id: number, req: Omit<RuleModel, 'id'>): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/rules/${id}`, req);
  }

  deleteRule(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/rules/${id}`);
  }


  listTables(): Observable<DecisionTableListItem[]> {
    return this.http.get<DecisionTableListItem[]>(`${this.baseUrl}/decisiontables`);
  }

  getTableJson(id: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/decisiontables/${encodeURIComponent(id)}`);
  }

  createTable(payload: any): Observable<string> {
    return this.http.post<string>(`${this.baseUrl}/decisiontables`, payload);
  }

  updateTable(id: string, payload: any): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/decisiontables/${encodeURIComponent(id)}`, payload);
  }

  deleteTable(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/decisiontables/${encodeURIComponent(id)}`);
  }

  newId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
