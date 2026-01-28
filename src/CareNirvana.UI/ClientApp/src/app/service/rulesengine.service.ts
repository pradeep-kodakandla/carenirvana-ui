import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
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



export interface RuleDataFunctionListItem {
  id: number;
  name: string;
  description: string;
  deploymentStatus: string;
  version: number;
  updatedOn: string;
  activeFlag: boolean;
}

export interface RuleDataFunctionModel {
  ruleDataFunctionId: number;
  ruleDataFunctionName: string;
  description: string;
  deploymentStatus: string;
  version: number;
  ruleDataFunctionJson: any; // backend stores jsonb; API returns JSON or string depending on your DTO
  activeFlag: boolean;

  createdOn?: string;
  createdBy?: number;
  updatedOn?: string;
  updatedBy?: number;
  deletedOn?: string;
  deletedBy?: number;
}

export interface UpsertRuleDataFunctionRequest {
  name: string;
  description: string;
  deploymentStatus: string;
  version: number;
  ruleDataFunctionJson: any;
  activeFlag: boolean;
}


export interface DashboardKpi { value: number; sub: string; }
export interface RulesDashboardStats {
  activeRules: DashboardKpi;
  ruleGroups: DashboardKpi;
  dataFunctions: DashboardKpi;
  recordsProcessed: DashboardKpi;
}

export interface ExecuteTriggerRequest {
  triggerKey: string;   // ex: "SMART_AUTH_CHECK.BUTTON_CLICK"
  facts: any;           // your request payload / facts bag
}

export interface ExecuteTriggerResponse {
  triggerKey: string;

  // optional metadata (nice to have)
  matchedRuleId?: number;
  matchedRuleName?: string;
  matchedRowId?: string;        // ex: "row_1"
  stopReason?: string;          // ex: "FIRST_MATCH"

  outputs: Record<string, any>; // ex: { result1: "Yes", result2: "No", result3: "No" }

  receivedOn?: string;
  responseTimeMs?: number;
}

export interface RuleActionDto {
  id: number;
  name: string;
  description?: string | null;
  actionJson?: string | null;
  activeFlag: boolean;
  createdOn: string;
  createdBy?: number | null;
  updatedOn?: string | null;
  updatedBy?: number | null;
  deletedOn?: string | null;
  deletedBy?: number | null;
}


export interface RuleExecutionLogRow {
  ruleExecutionLogId: number;
  correlationId: string;
  triggerKey: string;
  moduleId: number | null;
  moduleName: string | null;
  status: string;
  matchedRuleName: string | null;
  receivedOn: string; // ISO
  responseTimeMs: number | null;
  errorMessage: string | null;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DropdownOption<T> { value: T; label: string; }

@Injectable({ providedIn: 'root' })
export class RulesengineService {
  private baseUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/rulesengine';
  //private baseUrl = 'https://localhost:7201/api/rulesengine';

  constructor(private http: HttpClient) { }

  getRuleTypeOptions(): DropdownOption<RuleType>[] {
    return [
      { value: 'REALTIME', label: 'Realtime' },
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


  // ----------------------------
  // Rule Data Functions (rulesengine.cfgruledatafunction)
  // Upsert payload: { name, description, deploymentStatus, version, ruleDataFunctionJson, activeFlag }
  // ----------------------------
  listRuleDataFunctions() {
    return this.http.get<RuleDataFunctionListItem[]>(`${this.baseUrl}/datafunctions`);
  }

  getRuleDataFunction(id: number) {
    return this.http.get<RuleDataFunctionModel>(`${this.baseUrl}/datafunctions/${id}`);
  }

  // If your API returns Content(json,"application/json") this will deserialize as object
  getRuleDataFunctionJson(id: number) {
    return this.http.get<any>(`${this.baseUrl}/datafunctions/${id}/json`);
  }

  private toRuleDataFunctionPayload(req: UpsertRuleDataFunctionRequest) {
    return {
      name: req.name ?? '',
      description: req.description ?? '',
      deploymentStatus: req.deploymentStatus ?? 'DRAFT',
      version: req.version ?? 1,
      activeFlag: req.activeFlag ?? true,
      // send JSON as object (backend can bind JsonElement)
      ruleDataFunctionJson: req.ruleDataFunctionJson ?? {}
    };
  }

  createRuleDataFunction(req: UpsertRuleDataFunctionRequest) {
    return this.http.post<number>(`${this.baseUrl}/datafunctions`, this.toRuleDataFunctionPayload(req));
  }

  updateRuleDataFunction(id: number, req: UpsertRuleDataFunctionRequest) {
    return this.http.put<void>(`${this.baseUrl}/datafunctions/${id}`, this.toRuleDataFunctionPayload(req));
  }

  deleteRuleDataFunction(id: number) {
    return this.http.delete<void>(`${this.baseUrl}/datafunctions/${id}`);
  }

  getDashboard(): Observable<RulesDashboardStats> {
    return this.http.get<RulesDashboardStats>(`${this.baseUrl}/dashboard`);
  }

  executeTrigger(triggerKey: string, facts: any): Observable<ExecuteTriggerResponse> {
    // ✅ matches [HttpPost("executetrigger")]
    const url = `${this.baseUrl}/executetrigger`;

    // ✅ matches your controller request object (ExecuteTriggerRequest)
    const body: ExecuteTriggerRequest = {
      triggerKey,
      facts,
      // optional fields if your backend model has them:
      // moduleId: 1,
      // requestedUserId: 123,
      // clientApp: 'CareNirvana'
    };

    return this.http.post<ExecuteTriggerResponse>(url, body);
  }


  /** GET api/rulesengine/ruleactions?activeOnly=true|false */
  getRuleActions(activeOnly?: boolean): Observable<RuleActionDto[]> {
    let params = new HttpParams();
    if (activeOnly !== undefined) {
      params = params.set('activeOnly', String(activeOnly));
    }
    return this.http.get<RuleActionDto[]>(`${this.baseUrl}/ruleactions`, { params });
  }

  /** GET api/rulesengine/ruleactions/{id} */
  getRuleActionById(id: number): Observable<RuleActionDto> {
    return this.http.get<RuleActionDto>(`${this.baseUrl}/ruleactions/${id}`);
  }

  getRuleExecutionLogs(page: number, pageSize: number) {
    return this.http.get<PagedResult<RuleExecutionLogRow>>(`${this.baseUrl}/executionlogs`, { params: { page, pageSize } as any }
    );
  }
}
