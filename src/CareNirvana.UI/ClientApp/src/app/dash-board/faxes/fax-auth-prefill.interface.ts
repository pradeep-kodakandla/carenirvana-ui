// ─────────────────────────────────────────────────────────────────────────────
// FILE: src/app/shared/interfaces/fax-auth-prefill.interface.ts
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Carries OCR-extracted data from a Fax document into the AuthDetails component
 * so the user can review, adjust, and save an authorization without leaving
 * the Faxes screen.
 *
 * Field names mirror the PriorAuth schema produced by priorauth.extractor.ts
 * and are mapped to UM template field IDs inside AuthdetailsComponent.
 */
export interface FaxAuthPrefill {

  /** Discriminator – always 'fax' when this object is in use. */
  mode: 'fax';

  // ── Member context ──────────────────────────────────────────────────────
  memberId: number | string;
  memberDetailsId: number;
  faxId: number;

  // ── Auth Class / Type to auto-select ────────────────────────────────────
  /** Display name of Auth Class (e.g. "Inpatient") – resolved to id at runtime */
  authClassName?: string;
  /** Display name of Auth Type  (e.g. "Observation Stay") – resolved to id at runtime */
  authTypeName?: string;
  /** If you already know the numeric ids you can pass them directly */
  authClassId?: number;
  authTypeId?: number;

  // ── Diagnosis ───────────────────────────────────────────────────────────
  diagnosisCodes?: string[];           // ["A00.1"]

  // ── Services / Procedures ───────────────────────────────────────────────
  services?: FaxAuthPrefillService[];

  // ── Providers ───────────────────────────────────────────────────────────
  requestingProvider?: FaxAuthPrefillProvider;
  servicingProvider?: FaxAuthPrefillProvider;

  // ── Auth Details (dates) ────────────────────────────────────────────────
  requestDatetime?: string;            // ISO or M/D/YYYY
  expectedAdmissionDatetime?: string;
  actualAdmissionDatetime?: string;

  // ── Notes / raw pass-through ────────────────────────────────────────────
  notes?: string;
  /** Full PriorAuth object for reference / any extra fields */
  priorAuth?: any;
}

export interface FaxAuthPrefillService {
  code?: string;                       // CPT / HCPCS e.g. "A9600"
  description?: string;                // "STRONTIUM SR-89 CHLORID ..."
  startDate?: string;                  // ISO or M/D/YYYY – maps to fromDate
  endDate?: string;                    // ISO or M/D/YYYY – maps to toDate
  quantity?: number;                   // maps to serviceReq
}

export interface FaxAuthPrefillProvider {
  name?: string;                       // full name or "Last, First"
  firstName?: string;
  lastName?: string;
  npi?: string;
  phone?: string;
  fax?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}
