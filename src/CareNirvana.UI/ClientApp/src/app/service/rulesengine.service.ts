import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type RuleType = 'REALTIME' | 'BATCH';
export interface RuleGroupModel {
  id: number;
  name: string;
  description: string;
  activeFlag: boolean;

  // Optional (backend may return these; harmless if you ignore in UI)
  createdOn?: string;
  createdBy?: number;
  updatedOn?: string;
  updatedBy?: number;
  deletedOn?: string;
  deletedBy?: number;
}

export interface RuleModel {
  id: number;
  ruleGroupId: number;
  name: string;
  ruleType: RuleType;
  description: string;

  // In DB/Backend this is stored as jsonb -> text, so API uses string? for ruleJson.
  // In UI you can still keep it as any, but we convert to string when saving.
  ruleJson?: any;

  activeFlag: boolean;

  // Optional audit fields
  createdOn?: string;
  createdBy?: number;
  updatedOn?: string;
  updatedBy?: number;
  deletedOn?: string;
  deletedBy?: number;
}
export interface DecisionTableListItem {
  id: string;
  name: string;
  status: string;
  version: number;
  updatedOn: string;

  // optional if you later expose it from API
  activeFlag?: boolean;
}

export interface RuleDataFieldRow {
  ruleDataFieldId: number;
  moduleId: number;
  moduleName: string;
  ruleDataFieldJson: string; // json string
  activeFlag: boolean;

  createdOn?: string;
  createdBy?: number;
  updatedOn?: string;
  updatedBy?: number;
  deletedOn?: string;
  deletedBy?: number;
}
export interface DropdownOption<T> { value: T; label: string; }

@Injectable({ providedIn: 'root' })
export class RulesengineService {
  private baseUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/rulesengine';
  //private baseUrl = 'https://localhost:7201/api/rulesengine';

  constructor(private http: HttpClient) { }

  getRuleTypeOptions(): DropdownOption<RuleType>[] {
    return [
      { value: 'REALTIME', label: 'Real-time' },
      { value: 'BATCH', label: 'Batch' }
    ];
  }

  // ----------------------------
  // Rule Groups (rulesengine.cfgrulegroup)
  // Upsert payload is: { name, description, activeFlag }
  // ----------------------------
  getRuleGroups(): Observable<RuleGroupModel[]> {
    return this.http.get<RuleGroupModel[]>(`${this.baseUrl}/rulegroups`);
  }

  createRuleGroup(req: Omit<RuleGroupModel, 'id'>): Observable<number> {
    const payload = {
      name: req.name ?? '',
      description: req.description ?? '',
      activeFlag: req.activeFlag ?? true
    };
    return this.http.post<number>(`${this.baseUrl}/rulegroups`, payload);
  }

  updateRuleGroup(id: number, req: Omit<RuleGroupModel, 'id'>): Observable<void> {
    const payload = {
      name: req.name ?? '',
      description: req.description ?? '',
      activeFlag: req.activeFlag ?? true
    };
    return this.http.put<void>(`${this.baseUrl}/rulegroups/${id}`, payload);
  }

  deleteRuleGroup(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/rulegroups/${id}`);
  }

  // ----------------------------
  // Rules (rulesengine.cfgrule)
  // Upsert payload is: { ruleGroupId, name, ruleType, description, ruleJson (string|null), activeFlag }
  // ----------------------------
  getRules(ruleGroupId?: number): Observable<RuleModel[]> {
    const q = ruleGroupId ? `?ruleGroupId=${ruleGroupId}` : '';
    return this.http.get<RuleModel[]>(`${this.baseUrl}/rules${q}`);
  }

  private toRulePayload(req: Omit<RuleModel, 'id'>) {
    return {
      ruleGroupId: req.ruleGroupId,
      name: req.name ?? '',
      ruleType: req.ruleType,
      description: req.description ?? '',
      activeFlag: req.activeFlag ?? true,
      // backend expects string?; convert object -> JSON string
      ruleJson:
        req.ruleJson == null
          ? null
          : (typeof req.ruleJson === 'string' ? req.ruleJson : JSON.stringify(req.ruleJson))
    };
  }

  createRule(req: Omit<RuleModel, 'id'>): Observable<number> {
    return this.http.post<number>(`${this.baseUrl}/rules`, this.toRulePayload(req));
  }

  updateRule(id: number, req: Omit<RuleModel, 'id'>): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/rules/${id}`, this.toRulePayload(req));
  }

  deleteRule(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/rules/${id}`);
  }

  // ----------------------------
  // Decision Tables (rulesengine.cfgruledecisiontable)
  // Controller accepts JsonElement, so payload can remain "any"
  // ----------------------------
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

  getRuleForDecisionTable(dtId: string) {
    return this.http.get<any>(`${this.baseUrl}/decisiontables/${encodeURIComponent(dtId)}/rule`);
  }

  updateRuleForDecisionTable(dtId: string, ruleId: number, ruleJson: any) {
    return this.http.put<void>(`${this.baseUrl}/decisiontables/${encodeURIComponent(dtId)}/rule/${ruleId}`, ruleJson);
  }

  deleteTable(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/decisiontables/${encodeURIComponent(id)}`);
  }

  newId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  getRuleDataFields(moduleId?: number) {
    const q = moduleId != null ? `?moduleId=${moduleId}` : '';
    return this.http.get<RuleDataFieldRow[]>(`${this.baseUrl}/datafields${q}`);
  }

  getRuleDataFieldJson(id: number) {
    return this.http.get<any>(`${this.baseUrl}/datafields/${id}`);
  }

}
