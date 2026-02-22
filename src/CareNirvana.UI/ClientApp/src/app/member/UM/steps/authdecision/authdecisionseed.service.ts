import { Injectable } from '@angular/core';
import { firstValueFrom, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { AuthDetailApiService, DecisionSectionName } from 'src/app/service/authdetailapi.service';
import { DatasourceLookupService } from 'src/app/service/crud.service';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';

export interface EnsureDecisionSeedArgs {
  authDetailId: number;
  authTemplateId: number;
  /** merged jsonData object from AuthDetails (NOT stringified) */
  authData: any;
  userId: number;
  /** When 'Yes', auto-sets Decision Status=Approved, Decision Status Code=Medical Necessity Met, Appr=Req, Denied=0 */
  authApprove?: string;
}

/**
 * Seeds Decision Details items (1 per procedure/service) right AFTER AuthDetails save.
 *
 * Goal:
 * - AuthDecision becomes a pure viewer/editor of existing decision items.
 * - Seeding is idempotent (won't overwrite existing decision rows).
 */
@Injectable({ providedIn: 'root' })
export class AuthDecisionSeedService {
  private readonly DECISION_DETAILS: DecisionSectionName = 'Decision Details';

  constructor(
    private api: AuthDetailApiService,
    private dsLookup: DatasourceLookupService
  ) { }

  async ensureSeeded(args: EnsureDecisionSeedArgs): Promise<void> {
    const authDetailId = Number(args?.authDetailId ?? 0);
    const authTemplateId = Number(args?.authTemplateId ?? 0);
    const authData = args?.authData ?? {};
    const userId = Number(args?.userId ?? 0);
    const authApprove = String(args?.authApprove ?? '').trim();

    if (!authDetailId || !authTemplateId || !userId) return;

    const procedureNos = this.extractProcedureNosFromAuthData(authData);
    if (!procedureNos.length) return;

    // Load existing Decision Details items to keep this idempotent
    const existing = await firstValueFrom(
      this.api.getItems(authDetailId, this.DECISION_DETAILS).pipe(catchError(() => of([] as any[])))
    );

    const existingProcNos = new Set<number>();
    for (const it of (existing ?? [])) {
      const p = this.extractProcedureNoFromItem(it);
      if (Number.isFinite(p) && p > 0) existingProcNos.add(p);
    }

    // Determine if auto-approve is active
    const isAutoApproved = this.isYesValue(authApprove);

    // Resolve decision status: Approved (if auto-approve) or Pended (default)
    let resolvedStatusValue: any = null;
    let resolvedStatusCodeValue: any = null;

    if (isAutoApproved) {
      const { approvedValue, medNecessityMetValue } = await this.resolveApprovedDecisionValues(authTemplateId);
      resolvedStatusValue = approvedValue;
      resolvedStatusCodeValue = medNecessityMetValue;
      console.log('[DecisionSeed] Auto-Approve: Status=Approved, StatusCode=Medical Necessity Met');
    } else {
      resolvedStatusValue = await this.resolvePendedDecisionStatusValue(authTemplateId);
    }

    const nowIso = new Date().toISOString();
    const createCalls: Promise<any>[] = [];

    for (const procNo of procedureNos) {
      if (existingProcNos.has(procNo)) continue;

      const payload = this.buildDecisionDetailsSeedPayload(authData, procNo, resolvedStatusValue, nowIso, isAutoApproved, resolvedStatusCodeValue);

      // Create only Decision Details row; other decision sections can be created on first save in AuthDecision
      createCalls.push(
        firstValueFrom(
          this.api.createItem(authDetailId, this.DECISION_DETAILS, { data: payload } as any, userId)
            .pipe(catchError(() => of(null)))
        )
      );
    }

    if (createCalls.length) {
      await Promise.all(createCalls);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private extractProcedureNosFromAuthData(authData: any): number[] {
    const keys = Object.keys(authData ?? {});
    const set = new Set<number>();

    for (const k of keys) {
      const m = /^procedure(\d+)_/i.exec(k);
      if (m) set.add(Number(m[1]));
    }

    return Array.from(set)
      .filter(n => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
  }

  private extractProcedureNoFromItem(item: any): number {
    const rawData: any =
      item?.data ??
      item?.jsonData ??
      item?.payload ??
      item?.itemData ??
      null;

    let parsed: any = null;
    try {
      parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
    } catch {
      parsed = rawData;
    }

    const p = Number(
      item?.procedureNo ??
      item?.procedureIndex ??
      item?.serviceIndex ??
      item?.serviceNo ??
      parsed?.procedureNo ??
      parsed?.procedureIndex ??
      parsed?.serviceIndex ??
      parsed?.serviceNo
    );

    return p;
  }

  private extractServiceCodeString(v: any): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string' || typeof v === 'number') return String(v).trim();
    if (typeof v !== 'object') return String(v).trim();
    const obj: any = v;
    const cand =
      obj?.code ??
      obj?.procedureCode?.code ??
      obj?.serviceCode?.code ??
      obj?.value ??
      obj?.id ??
      '';
    return String(cand ?? '').trim();
  }

  private buildDecisionDetailsSeedPayload(authData: any, procedureNo: number, statusValue: any, nowIso: string, isAutoApproved: boolean = false, statusCodeValue: any = null): any {
    const get = (suffix: string) => authData?.[`procedure${procedureNo}_${suffix}`];

    // Resolve requested units for auto-approve (Approved = Requested, Denied = 0)
    const requestedUnits =
      get('serviceReq') ??
      get('recommendedUnits') ??
      get('requested') ??
      get('hours') ??
      get('days') ??
      get('weeks');

    // Keep alignment with legacy getServicePrefillValue mapping in AuthDecision
    const payload: any = {
      procedureNo,
      decisionNumber: String(procedureNo),

      decisionStatus: (statusValue !== undefined ? statusValue : null),
      decisionStatusCode: isAutoApproved ? statusCodeValue : null,

      createdDateTime: get('createdDateTime') ?? nowIso,
      updatedDateTime: nowIso,
      decisionDateTime: isAutoApproved ? nowIso : null,

      serviceCode: this.extractServiceCodeString(get('procedureCode') ?? get('serviceCode')),
      serviceDescription: get('procedureDescription') ?? get('serviceDescription'),

      fromDate: get('fromDate') ?? get('effectiveDate'),
      toDate: get('toDate'),

      requested: requestedUnits,

      approved: isAutoApproved ? (requestedUnits ?? 0) : (get('serviceAppr') ?? get('approvedPsp')),
      denied: isAutoApproved ? 0 : get('serviceDenied'),
      used: get('used'),

      reviewType: get('reviewType'),
      modifier: get('modifier'),
      unitType: get('unitType'),
      alternateServiceId: get('alternateServiceId'),

      // auth-level fields (best-effort)
      treatmentType: authData?.treatementType ?? authData?.treatmentType ?? get('treatmentType'),
      requestType: authData?.requestSent ?? authData?.requestType ?? authData?.requestReceivedVia ?? get('requestSent'),
      requestReceivedVia: authData?.requestReceivedVia ?? authData?.requestSent ?? get('requestSent'),
      requestPriority: authData?.requestPriority ?? get('requestPriority'),

      // Auto-approve metadata
      decisionUpdatedBy: isAutoApproved ? 'RulesEngine' : null,
      decisionUpdatedDatetime: nowIso
    };

    // Convert empty strings to null for cleaner backend payloads
    for (const k of Object.keys(payload)) {
      if (payload[k] === '') payload[k] = null;
    }

    return payload;
  }

  private async resolvePendedDecisionStatusValue(authTemplateId: number): Promise<any | null> {
    const tmpl = await firstValueFrom(
      this.api.getDecisionTemplate(authTemplateId).pipe(catchError(() => of(null)))
    );

    const rawSections: any[] = (tmpl as any)?.sections ?? (tmpl as any)?.Sections ?? [];
    const sections = Array.isArray(rawSections) ? rawSections : [];

    let ds: string | null = null;
    for (const sec of sections) {
      const fields: any[] = (sec as any)?.fields ?? (sec as any)?.Fields ?? [];
      const hit = (fields ?? []).find((f: any) => String(f?.id ?? f?.fieldId ?? '').trim().toLowerCase() === 'decisionstatus');
      if (hit) {
        ds = String(hit?.datasource ?? hit?.Datasource ?? '').trim() || null;
        break;
      }
    }
    if (!ds) return null;

    const opts = await firstValueFrom(
      this.dsLookup.getOptionsWithFallback(
        ds,
        (r: any) => {
          const value = r?.value ?? r?.code ?? r?.id;
          const label = r?.label ?? r?.text ?? r?.name ?? r?.description ?? String(value ?? '');
          return { value, label, text: label, raw: r } as UiSmartOption;
        },
        ['UM', 'Admin', 'Provider']
      ).pipe(catchError(() => of([] as UiSmartOption[])))
    );

    const pended = (opts ?? []).find(o => String((o as any)?.label ?? '').trim().toLowerCase().startsWith('pend'));
    return pended ? (pended as any).value : null;
  }

  /**
   * Resolves the dropdown option values for "Approved" status and "Medical Necessity Met" status code
   * from the decision template datasources.
   */
  private async resolveApprovedDecisionValues(authTemplateId: number): Promise<{ approvedValue: any; medNecessityMetValue: any }> {
    const tmpl = await firstValueFrom(
      this.api.getDecisionTemplate(authTemplateId).pipe(catchError(() => of(null)))
    );

    const rawSections: any[] = (tmpl as any)?.sections ?? (tmpl as any)?.Sections ?? [];
    const sections = Array.isArray(rawSections) ? rawSections : [];

    let statusDs: string | null = null;
    let statusCodeDs: string | null = null;

    for (const sec of sections) {
      const fields: any[] = (sec as any)?.fields ?? (sec as any)?.Fields ?? [];
      for (const f of (fields ?? [])) {
        const fid = String(f?.id ?? f?.fieldId ?? '').trim().toLowerCase();
        if (fid === 'decisionstatus' && !statusDs) {
          statusDs = String(f?.datasource ?? f?.Datasource ?? '').trim() || null;
        }
        if (fid === 'decisionstatuscode' && !statusCodeDs) {
          statusCodeDs = String(f?.datasource ?? f?.Datasource ?? '').trim() || null;
        }
      }
    }

    let approvedValue: any = null;
    let medNecessityMetValue: any = null;

    // Resolve "Approved" from Decision Status datasource
    if (statusDs) {
      const opts = await firstValueFrom(
        this.dsLookup.getOptionsWithFallback(
          statusDs,
          (r: any) => {
            const value = r?.value ?? r?.code ?? r?.id;
            const label = r?.label ?? r?.text ?? r?.name ?? r?.description ?? String(value ?? '');
            return { value, label, text: label, raw: r } as UiSmartOption;
          },
          ['UM', 'Admin', 'Provider']
        ).pipe(catchError(() => of([] as UiSmartOption[])))
      );

      const approved = (opts ?? []).find(o => String((o as any)?.label ?? '').trim().toLowerCase().startsWith('approv'));
      if (approved) approvedValue = (approved as any).value;
    }

    // Resolve "Medical Necessity Met" from Decision Status Code datasource
    if (statusCodeDs) {
      const codeOpts = await firstValueFrom(
        this.dsLookup.getOptionsWithFallback(
          statusCodeDs,
          (r: any) => {
            const value = r?.value ?? r?.code ?? r?.id;
            const label = r?.label ?? r?.text ?? r?.name ?? r?.description ?? String(value ?? '');
            return { value, label, text: label, raw: r } as UiSmartOption;
          },
          ['UM', 'Admin', 'Provider']
        ).pipe(catchError(() => of([] as UiSmartOption[])))
      );

      const medNec = (codeOpts ?? []).find(o => {
        const lbl = String((o as any)?.label ?? '').trim().toLowerCase();
        return lbl.includes('medical necessity met') || lbl.includes('medical necessity');
      });
      if (medNec) medNecessityMetValue = (medNec as any).value;
    }

    return { approvedValue, medNecessityMetValue };
  }

  private isYesValue(v: any): boolean {
    const s = String(v ?? '').trim().toLowerCase();
    return s === 'y' || s === 'yes' || s === 'true' || s === '1';
  }
}
