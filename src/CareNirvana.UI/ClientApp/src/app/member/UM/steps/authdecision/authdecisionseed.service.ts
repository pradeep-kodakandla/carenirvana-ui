import { Injectable } from '@angular/core';
import { firstValueFrom, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { AuthDetailApiService, DecisionSectionName } from 'src/app/service/authdetailapi.service';
import { DatasourceLookupService } from 'src/app/service/crud.service';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';

// ─────────────────────────────────────────────────────────────────────────────
// Source-type constants
// Procedure numbers are partitioned by source so reverse sync can route correctly:
//   1   – 999  : Service/Procedure entries  (procedure{n}_*)
//   1000 – 1999 : Medication entries         (medication{n}_*)
//   2000 – 2999 : Transportation code entries (tc_r{ride}_c{code}_*)
// ─────────────────────────────────────────────────────────────────────────────
export type DecisionSourceType = 'service' | 'medication' | 'transportation';

export const PROC_OFFSET_MED   = 1000;
export const PROC_OFFSET_TRANS = 2000;

export interface EnsureDecisionSeedArgs {
  authDetailId: number;
  authTemplateId: number;
  /** merged jsonData object from AuthDetails (NOT stringified) */
  authData: any;
  userId: number;
  /** When 'Yes', auto-sets Decision Status=Approved, Appr=Req, Denied=0 */
  authApprove?: string;
}

/** Describes a transport code entry extracted from authData */
interface TransportCodeEntry {
  rideId: number;
  codeId: number;
  /** 1-based sequential index used for procedureNo computation */
  seqIndex: number;
}

/** Result of a Decision → Source reverse sync */
export interface DecisionReverseSyncArgs {
  authDetailId: number;
  authData: any;
  userId: number;
  /** procedureNo of the decision item that was just saved */
  procedureNo: number;
  approvedValue: any;
  deniedValue: any;
  requestedValue: any;
  /** The full saved decision payload */
  decisionPayload?: any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AuthDecisionSyncService
 *
 * Handles ALL bi-directional data flow between Source Sections
 * (Service, Medication, Transportation) and Decision Details.
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │                  Source → Decision                       │
 * │  Service Details    ──────────────────►  Decision Item  │
 * │  Medication Details ──────────────────►  Decision Item  │
 * │  Transportation     ──────────────────►  Decision Item  │
 * └─────────────────────────────────────────────────────────┘
 * ┌─────────────────────────────────────────────────────────┐
 * │                  Decision → Source                       │
 * │  Decision Item  ──────────────────►  Service approved   │
 * │  Decision Item  ──────────────────►  Medication qty     │
 * │  Decision Item  ──────────────────►  Transport approved │
 * └─────────────────────────────────────────────────────────┘
 */
@Injectable({ providedIn: 'root' })
export class AuthDecisionSeedService {
  private readonly DECISION_DETAILS: DecisionSectionName = 'Decision Details';

  constructor(
    private api: AuthDetailApiService,
    private dsLookup: DatasourceLookupService
  ) { }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PUBLIC ENTRY POINTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Seeds Decision Detail items (idempotent) for ALL source types:
   *   - Service/Procedure entries  (procedure{n}_*)
   *   - Medication entries         (medication{n}_*)
   *   - Transportation code entries (tc_r{ride}_c{code}_*)
   *
   * Called right AFTER AuthDetails save.
   */
  async ensureSeeded(args: EnsureDecisionSeedArgs): Promise<void> {
    const authDetailId  = Number(args?.authDetailId ?? 0);
    const authTemplateId = Number(args?.authTemplateId ?? 0);
    const authData      = args?.authData ?? {};
    const userId        = Number(args?.userId ?? 0);
    const authApprove   = String(args?.authApprove ?? '').trim();

    if (!authDetailId || !authTemplateId || !userId) return;

    // ── Resolve dropdown values once for all seeds ──
    const isAutoApproved = this.isYesValue(authApprove);
    let resolvedStatusValue: any     = null;
    let resolvedStatusCodeValue: any = null;

    if (isAutoApproved) {
      const { approvedValue, autoApprovedValue } =
        await this.resolveApprovedDecisionValues(authTemplateId);
      resolvedStatusValue     = approvedValue;
      resolvedStatusCodeValue = autoApprovedValue;
    } else {
      resolvedStatusValue = await this.resolvePendedDecisionStatusValue(authTemplateId);
    }

    // ── Load existing items once ──
    const existing: any[] = await firstValueFrom(
      this.api.getItems(authDetailId, this.DECISION_DETAILS)
            .pipe(catchError(() => of([] as any[])))
    ) ?? [];

    const existingProcNos = new Set<number>(
      existing.map(it => this.extractProcedureNoFromItem(it))
               .filter(n => Number.isFinite(n) && n > 0)
    );

    const nowIso     = new Date().toISOString();
    const createCalls: Promise<any>[] = [];

    // ── 1. Service/Procedure entries ──────────────────────────────────────
    const serviceNos = this.extractProcedureNosFromAuthData(authData);
    for (const procNo of serviceNos) {
      if (existingProcNos.has(procNo)) continue;
      const payload = this.buildServiceDecisionPayload(
        authData, procNo, resolvedStatusValue, nowIso,
        isAutoApproved, resolvedStatusCodeValue
      );
      createCalls.push(this.createDecisionItem(authDetailId, payload, userId));
    }

    // ── 2. Medication entries ──────────────────────────────────────────────
    const medicationNos = this.extractMedicationNosFromAuthData(authData);
    for (const medNo of medicationNos) {
      const virtualProcNo = PROC_OFFSET_MED + medNo;
      if (existingProcNos.has(virtualProcNo)) continue;
      const payload = this.buildMedicationDecisionPayload(
        authData, medNo, virtualProcNo, resolvedStatusValue, nowIso,
        isAutoApproved, resolvedStatusCodeValue
      );
      createCalls.push(this.createDecisionItem(authDetailId, payload, userId));
    }

    // ── 3. Transportation code entries ────────────────────────────────────
    const transportEntries = this.extractTransportCodeEntriesFromAuthData(authData);
    for (const entry of transportEntries) {
      const virtualProcNo = PROC_OFFSET_TRANS + entry.seqIndex;
      if (existingProcNos.has(virtualProcNo)) continue;
      const payload = this.buildTransportationDecisionPayload(
        authData, entry, virtualProcNo, resolvedStatusValue, nowIso,
        isAutoApproved, resolvedStatusCodeValue
      );
      createCalls.push(this.createDecisionItem(authDetailId, payload, userId));
    }

    if (createCalls.length) {
      await Promise.all(createCalls);
      console.log(`[DecisionSeed] Created ${createCalls.length} decision item(s).`);
    }
  }

  /**
   * Syncs source-level field changes into existing Decision Detail items.
   * Covers Service, Medication, and Transportation in one call.
   * Called after EVERY AuthDetails save.
   */
  async syncAllSourceChangesToDecision(args: {
    authDetailId: number;
    authData: any;
    userId: number;
  }): Promise<void> {
    await Promise.all([
      this.syncServiceChangesToDecision(args),
      this.syncMedicationChangesToDecision(args),
      this.syncTransportationChangesToDecision(args),
    ]);
  }

  /**
   * Reverse sync: Decision → Source sections.
   * Called after AuthDecision saves an approved/denied value.
   *
   * Returns the updated authData so the caller can persist it.
   */
  syncDecisionToSource(args: DecisionReverseSyncArgs): any {
    const { authData, procedureNo, approvedValue, deniedValue, requestedValue, decisionPayload } = args;
    const updated = { ...(authData ?? {}) };
    const nowIso  = new Date().toISOString();

    if (procedureNo >= PROC_OFFSET_TRANS) {
      // ── Transportation code ──────────────────────────────────────────────
      const seqIndex = procedureNo - PROC_OFFSET_TRANS;
      // There's no single "approved" field in the transport form, but we persist
      // the decision outcome as transport-specific authData keys for display.
      updated[`transport${seqIndex}_decisionApproved`] = approvedValue;
      updated[`transport${seqIndex}_decisionDenied`]   = deniedValue;
      updated[`transport${seqIndex}_decisionUpdated`]  = nowIso;
      console.log(`[DecisionSync] Reverse → Transportation seqIndex=${seqIndex}: approved=${approvedValue}`);

    } else if (procedureNo >= PROC_OFFSET_MED) {
      // ── Medication ───────────────────────────────────────────────────────
      const medNo = procedureNo - PROC_OFFSET_MED;
      const prefix = `medication${medNo}_`;
      // Map approved → approvedQuantity; denied → deniedQuantity
      updated[`${prefix}approvedQuantity`] = approvedValue;
      updated[`${prefix}deniedQuantity`]   = deniedValue;
      updated[`${prefix}decisionUpdated`]  = nowIso;

      // Also write standard serviceAppr-style keys so any generic lookups work
      updated[`${prefix}serviceAppr`]   = approvedValue;
      updated[`${prefix}serviceDenied`] = deniedValue;
      console.log(`[DecisionSync] Reverse → Medication ${medNo}: approved=${approvedValue}`);

    } else {
      // ── Service/Procedure ────────────────────────────────────────────────
      const prefix = `procedure${procedureNo}_`;
      updated[`${prefix}serviceAppr`]         = approvedValue;
      updated[`${prefix}serviceDenied`]        = deniedValue;
      updated[`${prefix}decisionUpdated`]      = nowIso;

      // Keep requested in sync if decision changes the requested amount
      if (requestedValue !== undefined && requestedValue !== null) {
        updated[`${prefix}serviceReq`] = requestedValue;
      }

      // Copy decision-specific fields back for display
      if (decisionPayload?.reviewType != null) {
        updated[`${prefix}reviewType`] = decisionPayload.reviewType;
      }
      console.log(`[DecisionSync] Reverse → Service ${procedureNo}: approved=${approvedValue}`);
    }

    return updated;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SERVICE / PROCEDURE SYNC  (Source → Decision)
  // ═══════════════════════════════════════════════════════════════════════════

  async syncServiceChangesToDecision(args: {
    authDetailId: number;
    authData: any;
    userId: number;
  }): Promise<void> {
    const { authDetailId, authData, userId } = this.normalizeArgs(args);
    if (!authDetailId || !userId) return;

    const existing = await this.loadExistingItems(authDetailId);
    const updateCalls: Promise<any>[] = [];

    for (const item of existing) {
      const data   = this.parseItemData(item);
      const procNo = this.getProcNoFromData(item, data);

      // Only handle service-range items
      if (!procNo || procNo >= PROC_OFFSET_MED) continue;

      const itemId = this.getItemId(item);
      if (!itemId) continue;

      const prefix = `procedure${procNo}_`;
      const fieldMap: Array<{ authSuffix: string; decisionKey: string }> = [
        { authSuffix: 'procedureCode',        decisionKey: 'serviceCode' },
        { authSuffix: 'procedureDescription', decisionKey: 'serviceDescription' },
        { authSuffix: 'fromDate',             decisionKey: 'fromDate' },
        { authSuffix: 'toDate',               decisionKey: 'toDate' },
        { authSuffix: 'serviceReq',           decisionKey: 'requested' },
        { authSuffix: 'serviceAppr',          decisionKey: 'approved' },
        { authSuffix: 'serviceDenied',        decisionKey: 'denied' },
        { authSuffix: 'modifier',             decisionKey: 'modifier' },
        { authSuffix: 'unitType',             decisionKey: 'unitType' },
        { authSuffix: 'reviewType',           decisionKey: 'reviewType' },
      ];

      const { updatedPayload, changed } = this.buildUpdatedPayload(data, authData, prefix, fieldMap);
      if (changed) {
        updateCalls.push(this.updateDecisionItem(authDetailId, itemId, updatedPayload, userId));
      }
    }

    if (updateCalls.length) {
      await Promise.all(updateCalls);
      console.log(`[DecisionSync] Service → Decision: updated ${updateCalls.length} item(s).`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  MEDICATION SYNC  (Source → Decision)
  // ═══════════════════════════════════════════════════════════════════════════

  async syncMedicationChangesToDecision(args: {
    authDetailId: number;
    authData: any;
    userId: number;
  }): Promise<void> {
    const { authDetailId, authData, userId } = this.normalizeArgs(args);
    if (!authDetailId || !userId) return;

    const existing = await this.loadExistingItems(authDetailId);
    const updateCalls: Promise<any>[] = [];

    for (const item of existing) {
      const data       = this.parseItemData(item);
      const sourceType = data?.sourceType as DecisionSourceType;

      // Only handle medication-range items
      if (sourceType !== 'medication') continue;

      const virtualProcNo = this.getProcNoFromData(item, data);
      if (!virtualProcNo || virtualProcNo < PROC_OFFSET_MED || virtualProcNo >= PROC_OFFSET_TRANS) continue;

      const medNo  = virtualProcNo - PROC_OFFSET_MED;
      const itemId = this.getItemId(item);
      if (!itemId) continue;

      const prefix = `medication${medNo}_`;
      const fieldMap: Array<{ authSuffix: string; decisionKey: string }> = [
        { authSuffix: 'medicationCode',        decisionKey: 'serviceCode' },
        { authSuffix: 'medicationDescription', decisionKey: 'serviceDescription' },
        { authSuffix: 'fromDate',              decisionKey: 'fromDate' },
        { authSuffix: 'toDate',                decisionKey: 'toDate' },
        { authSuffix: 'quantity',              decisionKey: 'requested' },
        { authSuffix: 'hcpcCode',              decisionKey: 'alternateServiceId' },
        { authSuffix: 'frequency',             decisionKey: 'reviewType' },
        // After reverse-sync writes these back:
        { authSuffix: 'approvedQuantity',      decisionKey: 'approved' },
        { authSuffix: 'deniedQuantity',        decisionKey: 'denied' },
      ];

      const { updatedPayload, changed } = this.buildUpdatedPayload(data, authData, prefix, fieldMap);
      if (changed) {
        updateCalls.push(this.updateDecisionItem(authDetailId, itemId, updatedPayload, userId));
      }
    }

    if (updateCalls.length) {
      await Promise.all(updateCalls);
      console.log(`[DecisionSync] Medication → Decision: updated ${updateCalls.length} item(s).`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  TRANSPORTATION SYNC  (Source → Decision)
  // ═══════════════════════════════════════════════════════════════════════════

  async syncTransportationChangesToDecision(args: {
    authDetailId: number;
    authData: any;
    userId: number;
  }): Promise<void> {
    const { authDetailId, authData, userId } = this.normalizeArgs(args);
    if (!authDetailId || !userId) return;

    const existing = await this.loadExistingItems(authDetailId);
    const updateCalls: Promise<any>[] = [];

    for (const item of existing) {
      const data       = this.parseItemData(item);
      const sourceType = data?.sourceType as DecisionSourceType;

      if (sourceType !== 'transportation') continue;

      const virtualProcNo = this.getProcNoFromData(item, data);
      if (!virtualProcNo || virtualProcNo < PROC_OFFSET_TRANS) continue;

      const seqIndex = virtualProcNo - PROC_OFFSET_TRANS;
      const itemId   = this.getItemId(item);
      if (!itemId) continue;

      // Transport key-fields stored in authData from injectTransportMetaToPayload
      const rideId  = data?.sourceRideId;
      const codeId  = data?.sourceCodeId;

      if (!rideId || !codeId) continue;

      const prefix = `tc_r${rideId}_c${codeId}_`;
      const fieldMap: Array<{ authSuffix: string; decisionKey: string }> = [
        { authSuffix: 'transportationCode',        decisionKey: 'serviceCode' },
        { authSuffix: 'transportationDescription', decisionKey: 'serviceDescription' },
        { authSuffix: 'modifier',                  decisionKey: 'modifier' },
      ];

      // Transport dates live at the section level (not per-code)
      const updatedPayload: any = { ...data };
      let changed = false;

      for (const { authSuffix, decisionKey } of fieldMap) {
        const authVal = authData?.[prefix + authSuffix];
        if (authVal === undefined || authVal === null) continue;
        const authStr = String(this.extractCodeString(authVal)).trim();
        const curStr  = String(this.extractCodeString(data?.[decisionKey])).trim();
        if (authStr && authStr !== curStr) {
          updatedPayload[decisionKey] = authVal;
          changed = true;
        }
      }

      // Also sync the section-level begin/end dates
      const beginDateVal = authData?.['beginDate'];
      const endDateVal   = authData?.['endDate'];
      if (beginDateVal && String(beginDateVal) !== String(data?.fromDate ?? '')) {
        updatedPayload.fromDate = beginDateVal;
        changed = true;
      }
      if (endDateVal && String(endDateVal) !== String(data?.toDate ?? '')) {
        updatedPayload.toDate = endDateVal;
        changed = true;
      }

      // Sync approved/denied from reverse-sync keys
      const approvedKey = `transport${seqIndex}_decisionApproved`;
      const deniedKey   = `transport${seqIndex}_decisionDenied`;
      if (authData?.[approvedKey] !== undefined && authData?.[approvedKey] !== data?.approved) {
        updatedPayload.approved = authData[approvedKey];
        changed = true;
      }
      if (authData?.[deniedKey] !== undefined && authData?.[deniedKey] !== data?.denied) {
        updatedPayload.denied = authData[deniedKey];
        changed = true;
      }

      if (changed) {
        updatedPayload.updatedDateTime = new Date().toISOString();
        updateCalls.push(this.updateDecisionItem(authDetailId, itemId, updatedPayload, userId));
      }
    }

    if (updateCalls.length) {
      await Promise.all(updateCalls);
      console.log(`[DecisionSync] Transportation → Decision: updated ${updateCalls.length} item(s).`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PAYLOAD BUILDERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Builds the seed payload for a Service/Procedure → Decision item.
   * (Existing logic preserved from original seed service.)
   */
  private buildServiceDecisionPayload(
    authData: any,
    procNo: number,
    statusValue: any,
    nowIso: string,
    isAutoApproved: boolean,
    statusCodeValue: any
  ): any {
    const get = (suffix: string) => authData?.[`procedure${procNo}_${suffix}`];

    const requestedUnits =
      get('serviceReq') ?? get('recommendedUnits') ?? get('requested') ??
      get('hours') ?? get('days') ?? get('weeks');

    return this.cleanPayload({
      procedureNo:    procNo,
      decisionNumber: String(procNo),
      sourceType:     'service' as DecisionSourceType,

      decisionStatus:     statusValue !== undefined ? statusValue : null,
      decisionStatusCode: isAutoApproved ? statusCodeValue : null,

      createdDateTime:  get('createdDateTime') ?? nowIso,
      updatedDateTime:  nowIso,
      decisionDateTime: isAutoApproved ? nowIso : null,

      serviceCode:        this.extractCodeString(get('procedureCode') ?? get('serviceCode')),
      serviceDescription: get('procedureDescription') ?? get('serviceDescription'),

      fromDate: get('fromDate') ?? get('effectiveDate'),
      toDate:   get('toDate'),

      requested: requestedUnits,
      approved:  isAutoApproved ? (requestedUnits ?? 0) : (get('serviceAppr') ?? get('approvedPsp')),
      denied:    isAutoApproved ? 0 : get('serviceDenied'),
      used:      get('used'),

      reviewType:        get('reviewType'),
      modifier:          get('modifier'),
      unitType:          get('unitType'),
      alternateServiceId: get('alternateServiceId'),

      treatmentType:     authData?.treatementType ?? authData?.treatmentType ?? get('treatmentType'),
      requestType:       authData?.requestSent ?? authData?.requestType ?? authData?.requestReceivedVia,
      requestReceivedVia: authData?.requestReceivedVia ?? authData?.requestSent,
      requestPriority:   authData?.requestPriority ?? get('requestPriority'),

      decisionUpdatedBy:      isAutoApproved ? 'RulesEngine' : null,
      decisionUpdatedDatetime: nowIso,
    });
  }

  /**
   * Builds the seed payload for a Medication → Decision item.
   *
   * Field mapping (UM_master.json medication subsection → Decision Details):
   *   medicationCode        → serviceCode
   *   medicationDescription → serviceDescription
   *   fromDate              → fromDate
   *   toDate                → toDate
   *   quantity              → requested
   *   hcpcCode              → alternateServiceId
   *   frequency             → reviewType  (closest semantic match)
   */
  private buildMedicationDecisionPayload(
    authData: any,
    medNo: number,
    virtualProcNo: number,
    statusValue: any,
    nowIso: string,
    isAutoApproved: boolean,
    statusCodeValue: any
  ): any {
    const get = (suffix: string) => authData?.[`medication${medNo}_${suffix}`];

    const requestedQty = get('quantity');

    return this.cleanPayload({
      procedureNo:    virtualProcNo,
      decisionNumber: String(virtualProcNo),
      sourceType:     'medication' as DecisionSourceType,
      sourceMedNo:    medNo,        // for reverse sync routing

      decisionStatus:     statusValue !== undefined ? statusValue : null,
      decisionStatusCode: isAutoApproved ? statusCodeValue : null,

      createdDateTime:  nowIso,
      updatedDateTime:  nowIso,
      decisionDateTime: isAutoApproved ? nowIso : null,

      // Primary identification
      serviceCode:        this.extractCodeString(get('medicationCode') ?? get('hcpcCode')),
      serviceDescription: get('medicationDescription'),

      // Dates
      fromDate: get('fromDate'),
      toDate:   get('toDate'),

      // Units
      requested: requestedQty,
      approved:  isAutoApproved ? (requestedQty ?? 0) : null,
      denied:    isAutoApproved ? 0 : null,

      // Medication-specific fields stored for reference
      alternateServiceId: get('hcpcCode'),   // HCPC as alternate code
      reviewType:         get('frequency'),   // frequency maps to reviewType

      // Auth-level context
      treatmentType:     authData?.treatementType ?? authData?.treatmentType,
      requestType:       authData?.requestSent ?? authData?.requestType,
      requestReceivedVia: authData?.requestReceivedVia ?? authData?.requestSent,
      requestPriority:   authData?.requestPriority,

      decisionUpdatedBy:       isAutoApproved ? 'RulesEngine' : null,
      decisionUpdatedDatetime: nowIso,
    });
  }

  /**
   * Builds the seed payload for a Transportation Code → Decision item.
   *
   * Field mapping (UM_master.json Transportation Code Details → Decision Details):
   *   transportationCode        → serviceCode
   *   transportationDescription → serviceDescription
   *   modifier                  → modifier
   *   beginDate (section-level) → fromDate
   *   endDate   (section-level) → toDate
   *   requestedMilesUnits       → requested
   */
  private buildTransportationDecisionPayload(
    authData: any,
    entry: TransportCodeEntry,
    virtualProcNo: number,
    statusValue: any,
    nowIso: string,
    isAutoApproved: boolean,
    statusCodeValue: any
  ): any {
    const { rideId, codeId, seqIndex } = entry;
    const codePrefix = `tc_r${rideId}_c${codeId}_`;
    const get = (suffix: string) => authData?.[codePrefix + suffix];

    // Section-level fields (begin/end date, requested miles)
    const fromDate  = authData?.['beginDate'];
    const toDate    = authData?.['endDate'];
    const requested = authData?.['requestedMilesUnits'];

    return this.cleanPayload({
      procedureNo:    virtualProcNo,
      decisionNumber: String(virtualProcNo),
      sourceType:     'transportation' as DecisionSourceType,
      sourceRideId:   rideId,     // for reverse sync routing
      sourceCodeId:   codeId,     // for reverse sync routing
      sourceSeqIndex: seqIndex,

      decisionStatus:     statusValue !== undefined ? statusValue : null,
      decisionStatusCode: isAutoApproved ? statusCodeValue : null,

      createdDateTime:  nowIso,
      updatedDateTime:  nowIso,
      decisionDateTime: isAutoApproved ? nowIso : null,

      serviceCode:        this.extractCodeString(get('transportationCode')),
      serviceDescription: get('transportationDescription'),
      modifier:           get('modifier'),

      fromDate,
      toDate,

      requested,
      approved:  isAutoApproved ? (requested ?? 0) : null,
      denied:    isAutoApproved ? 0 : null,

      // Auth-level context
      treatmentType:     authData?.treatementType ?? authData?.treatmentType,
      requestType:       authData?.requestSent ?? authData?.requestType,
      requestReceivedVia: authData?.requestReceivedVia ?? authData?.requestSent,
      requestPriority:   authData?.requestPriority,

      decisionUpdatedBy:       isAutoApproved ? 'RulesEngine' : null,
      decisionUpdatedDatetime: nowIso,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  EXTRACTION HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extracts 1-based procedure numbers from `procedure{n}_*` authData keys.
   */
  private extractProcedureNosFromAuthData(authData: any): number[] {
    const set = new Set<number>();
    for (const k of Object.keys(authData ?? {})) {
      const m = /^procedure(\d+)_/i.exec(k);
      if (m) set.add(Number(m[1]));
    }
    return Array.from(set).filter(n => Number.isFinite(n) && n > 0 && n < PROC_OFFSET_MED).sort((a, b) => a - b);
  }

  /**
   * Extracts 1-based medication numbers from `medication{n}_*` authData keys.
   */
  private extractMedicationNosFromAuthData(authData: any): number[] {
    const set = new Set<number>();
    for (const k of Object.keys(authData ?? {})) {
      const m = /^medication(\d+)_/i.exec(k);
      if (m) set.add(Number(m[1]));
    }
    return Array.from(set).filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  }

  /**
   * Extracts transport code entries from `tc_r{rideId}_c{codeId}_*` authData keys.
   * Returns them in a stable order with a sequential 1-based index for procedureNo mapping.
   */
  private extractTransportCodeEntriesFromAuthData(authData: any): TransportCodeEntry[] {
    const seen = new Map<string, TransportCodeEntry>();
    let seqIndex = 1;

    const keys = Object.keys(authData ?? {}).sort(); // stable sort
    for (const k of keys) {
      const m = /^tc_r(\d+)_c(\d+)_/i.exec(k);
      if (!m) continue;
      const rideId = Number(m[1]);
      const codeId = Number(m[2]);
      const mapKey = `${rideId}_${codeId}`;
      if (!seen.has(mapKey)) {
        seen.set(mapKey, { rideId, codeId, seqIndex: seqIndex++ });
      }
    }

    // Also pull from _transportMeta if present (more reliable source)
    const meta = authData?._transportMeta;
    if (meta && typeof meta === 'object') {
      const codesByRide: Record<string, any[]> = meta.codesByRide ?? {};
      for (const rideIdStr of Object.keys(codesByRide).sort()) {
        const rideId = Number(rideIdStr);
        const codes: any[] = codesByRide[rideIdStr] ?? [];
        for (const code of codes) {
          const codeId = Number(code.id ?? code.codeId ?? 0);
          if (!codeId) continue;
          const mapKey = `${rideId}_${codeId}`;
          if (!seen.has(mapKey)) {
            seen.set(mapKey, { rideId, codeId, seqIndex: seqIndex++ });
          }
        }
      }
    }

    return Array.from(seen.values());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  DECISION TEMPLATE HELPERS  (unchanged from original)
  // ═══════════════════════════════════════════════════════════════════════════

  private async resolvePendedDecisionStatusValue(authTemplateId: number): Promise<any | null> {
    const tmpl = await firstValueFrom(
      this.api.getDecisionTemplate(authTemplateId).pipe(catchError(() => of(null)))
    );
    const sections = this.extractTemplateSections(tmpl);
    const ds = this.findFieldDatasource(sections, 'decisionstatus');
    if (!ds) return null;

    const opts = await this.loadDatasourceOptions(ds);
    const pended = opts.find(o => String((o as any)?.label ?? '').trim().toLowerCase().startsWith('pend'));
    return pended ? (pended as any).value : null;
  }

  // Fallback IDs used when runtime datasource resolution fails.
  // Decision Status:      1 = "Approved"
  // Decision Status Code: 4 = "Auto Approved"
  private readonly FALLBACK_DECISION_STATUS_APPROVED      = 1;
  private readonly FALLBACK_DECISION_STATUS_CODE_AUTO_APP = 4;

  private async resolveApprovedDecisionValues(
    authTemplateId: number
  ): Promise<{ approvedValue: any; autoApprovedValue: any }> {
    // Start with known fallback IDs — ensures values are always written even if
    // the template API or datasource lookup fails at runtime.
    let approvedValue: any     = this.FALLBACK_DECISION_STATUS_APPROVED;
    let autoApprovedValue: any = this.FALLBACK_DECISION_STATUS_CODE_AUTO_APP;

    try {
      const tmpl = await firstValueFrom(
        this.api.getDecisionTemplate(authTemplateId).pipe(catchError(() => of(null)))
      );
      const sections = this.extractTemplateSections(tmpl);

      const statusDs     = this.findFieldDatasource(sections, 'decisionstatus');
      const statusCodeDs = this.findFieldDatasource(sections, 'decisionstatuscode');

      if (statusDs) {
        const opts = await this.loadDatasourceOptions(statusDs);
        // Match "Approved" (Decision Status)
        const approved = opts.find(o => {
          const lbl = String((o as any)?.label ?? '').trim().toLowerCase();
          return lbl.startsWith('approv') || lbl === 'approved';
        });
        if (approved) approvedValue = (approved as any).value;
      }

      if (statusCodeDs) {
        const codeOpts = await this.loadDatasourceOptions(statusCodeDs);
        // Match "Auto Approved" (Decision Status Code)
        const autoApproved = codeOpts.find(o => {
          const lbl = String((o as any)?.label ?? '').trim().toLowerCase();
          return lbl.includes('auto approv');
        });
        if (autoApproved) autoApprovedValue = (autoApproved as any).value;
      }
    } catch (e) {
      console.warn('[DecisionSeed] resolveApprovedDecisionValues: datasource lookup failed, using fallback IDs', e);
    }

    console.log(`[DecisionSeed] resolveApprovedDecisionValues → decisionStatus=${approvedValue}, decisionStatusCode=${autoApprovedValue}`);
    return { approvedValue, autoApprovedValue };
  }

  private extractTemplateSections(tmpl: any): any[] {
    const raw = (tmpl as any)?.sections
      ?? (tmpl as any)?.Sections
      ?? (tmpl as any)?.sectionGroups
      ?? (tmpl as any)?.SectionGroups
      ?? [];
    const all: any[] = Array.isArray(raw) ? raw : [];
    const DECISION_SECTIONS = new Set([
      'decision details',
      'member provider decision info',
      'decision notes'
    ]);
    const filtered = all.filter(s => {
      const name = String(s?.sectionName ?? s?.SectionName ?? s?.name ?? '').trim().toLowerCase();
      return DECISION_SECTIONS.has(name);
    });
    return filtered.length ? filtered : all;
  }

  private findFieldDatasource(sections: any[], fieldIdLower: string): string | null {
    for (const sec of sections) {
      // Mirror authdecision component getSectionFields() — check all four property names
      const fields: any[] = (
        sec?.fields ??
        sec?.Fields ??
        sec?.sectionFields ??
        sec?.SectionFields ??
        []
      );
      const hit = fields.find(f => String(f?.id ?? f?.fieldId ?? '').trim().toLowerCase() === fieldIdLower);
      if (hit) {
        const ds = String(hit?.datasource ?? hit?.Datasource ?? '').trim();
        return ds || null;
      }
    }
    return null;
  }

  private async loadDatasourceOptions(ds: string): Promise<UiSmartOption[]> {
    return firstValueFrom(
      this.dsLookup.getOptionsWithFallback(
        ds,
        (r: any) => {
          const value = r?.value ?? r?.code ?? r?.id;
          const label = r?.label ?? r?.text ?? r?.name ?? r?.description ?? String(value ?? '');
          return { value, label, text: label, raw: r } as UiSmartOption;
        },
        ['UM', 'Admin', 'Provider']
      ).pipe(
        map((opts: UiSmartOption[] | null) => opts ?? [] as UiSmartOption[]),
        catchError(() => of([] as UiSmartOption[]))
      )
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SHARED INFRASTRUCTURE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private normalizeArgs(args: any) {
    return {
      authDetailId: Number(args?.authDetailId ?? 0),
      authData:     args?.authData ?? {},
      userId:       Number(args?.userId ?? 0),
    };
  }

  private async loadExistingItems(authDetailId: number): Promise<any[]> {
    const result = await firstValueFrom(
      this.api.getItems(authDetailId, this.DECISION_DETAILS)
            .pipe(catchError(() => of([] as any[])))
    );
    return Array.isArray(result) ? result : [];
  }

  private parseItemData(item: any): any {
    const rawData = item?.data ?? item?.jsonData ?? item?.payload ?? item?.itemData ?? null;
    try {
      return typeof rawData === 'string' ? JSON.parse(rawData) : (rawData ?? {});
    } catch {
      return rawData ?? {};
    }
  }

  private getProcNoFromData(item: any, data: any): number {
    return Number(
      item?.procedureNo ?? item?.procedureIndex ?? item?.serviceIndex ?? item?.serviceNo ??
      data?.procedureNo ?? data?.procedureIndex ?? data?.serviceIndex ?? data?.serviceNo ?? 0
    );
  }

  private getItemId(item: any): string {
    return String(item?.itemId ?? item?.id ?? item?.decisionItemId ?? '');
  }

  /**
   * Extracts a procedure number from an existing decision item.
   * Returns NaN for unresolvable items.
   */
  private extractProcedureNoFromItem(item: any): number {
    return this.getProcNoFromData(item, this.parseItemData(item));
  }

  /**
   * Compares authData values against existing decision item values and builds
   * an updated payload with only the changed fields.
   */
  private buildUpdatedPayload(
    existingData: any,
    authData: any,
    prefix: string,
    fieldMap: Array<{ authSuffix: string; decisionKey: string }>
  ): { updatedPayload: any; changed: boolean } {
    let changed = false;
    const updatedPayload = { ...existingData };

    for (const { authSuffix, decisionKey } of fieldMap) {
      const authVal = authData?.[prefix + authSuffix];
      if (authVal === undefined || authVal === null) continue;

      const authStr = String(this.extractCodeString(authVal) || authVal || '').trim();
      const curStr  = String(this.extractCodeString(existingData?.[decisionKey]) || existingData?.[decisionKey] || '').trim();

      if (authStr && authStr !== curStr) {
        updatedPayload[decisionKey] = authVal;
        changed = true;
      }
    }

    if (changed) {
      updatedPayload.updatedDateTime = new Date().toISOString();
    }

    return { updatedPayload, changed };
  }

  private async createDecisionItem(
    authDetailId: number,
    payload: any,
    userId: number
  ): Promise<any> {
    return firstValueFrom(
      this.api.createItem(authDetailId, this.DECISION_DETAILS, { data: payload } as any, userId)
            .pipe(catchError(() => of(null)))
    );
  }

  private async updateDecisionItem(
    authDetailId: number,
    itemId: string,
    payload: any,
    userId: number
  ): Promise<any> {
    return firstValueFrom(
      this.api.updateItem(authDetailId, this.DECISION_DETAILS, itemId, { data: payload } as any, userId)
            .pipe(catchError(() => of(null)))
    );
  }

  /** Extract a plain string code from object or primitive values. */
  private extractCodeString(v: any): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string' || typeof v === 'number') return String(v).trim();
    if (typeof v !== 'object') return String(v).trim();
    const cand = v?.code ?? v?.procedureCode?.code ?? v?.serviceCode?.code ?? v?.value ?? v?.id ?? '';
    return String(cand ?? '').trim();
  }

  /** Remove empty-string values from a payload (cleaner backend payloads). */
  private cleanPayload(payload: any): any {
    const out: any = {};
    for (const k of Object.keys(payload)) {
      out[k] = payload[k] === '' ? null : payload[k];
    }
    return out;
  }

  private isYesValue(v: any): boolean {
    const s = String(v ?? '').trim().toLowerCase();
    return s === 'y' || s === 'yes' || s === 'true' || s === '1';
  }
}
