import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges
} from '@angular/core';
import { AuthService } from 'src/app/service/auth.service';

/* ──────────────────────────────────────────────
   Raw API Response Interfaces
   ────────────────────────────────────────────── */
export interface IcdCodeObject {
  id: number;
  code: string;
  type: string;
  codeDesc: string;
  codeShortDesc: string;
}

export interface ProcedureCodeObject {
  id: number;
  code: string;
  type: string;
  codeDesc: string;
  codeShortDesc: string;
}

export interface DecisionDetailData {
  procedureNo: number;
  serviceCode: string;
  procedureCode: ProcedureCodeObject | string;
  procedureDescription: string;
  serviceDescription: string;
  treatmentType: string;
  treatmentTypeLabel: string;
  decisionStatus: string;
  decisionStatusLabel: string;
  decisionStatusCode: string;
  decisionStatusCodeLabel: string;
  reviewType: string;
  reviewTypeLabel: string;
  requestPriority: string;
  requestPriorityLabel: string;
  requestReceivedVia: string;
  requestReceivedViaLabel: string;
  fromDate: string;
  toDate: string;
  dueDate: string | null;
  requested: number | string;
  approved: number;
  denied: number;
  used: string;
  modifier: string;
  unitType: string;
  createdDateTime: string;
  updatedDateTime: string;
  decisionDateTime: string;
  decisionRequestDatetime: string;
  alternateServiceId: string;
  newSelect_copy_25gqf4w2s?: string;
  newSelect_copy_25gqf4w2sLabel?: string;
  newSelect_copy_3uon6b5w0?: string | null;
  newSelect_copy_3uon6b5w0Label?: string | null;
  newSelect_copy_bszkkn8o1?: string | null;
  newSelect_copy_bszkkn8o1Label?: string | null;
}

export interface DecisionDetailEntry {
  data: DecisionDetailData;
  itemId: string;
  createdBy: number;
  createdOn: string;
  deletedBy: number | null;
  deletedOn: string | null;
  updatedBy: number | null;
  updatedOn: string | null;
}

export interface DecisionNoteData {
  procedureNo: number;
  procedureCode: ProcedureCodeObject | string;
  procedureDescription: string;
  authorizationNotes: string;
  authorizationNoteType: string | null;
  authorizationAlertNote: boolean;
  noteEncounteredDatetime: string | null;
}

export interface DecisionNoteEntry {
  data: DecisionNoteData;
  itemId: string;
  createdBy: number;
  createdOn: string;
  deletedBy: number | null;
  deletedOn: string | null;
  updatedBy: number | null;
  updatedOn: string | null;
}

export interface AuthJsonResponse {
  authStatus: string;
  authTypeId: number;
  authClassId: number;
  authStatusReason: string;
  requestPriority: string;
  requestDatetime: string;
  actualAdmissionDatetime: string | null;
  expectedDischargeDatetime: string | null;
  admissionType: string;
  admissionLevel: string | null;
  admitReason: string | null;
  treatmentType: string;
  placeOfService: string;
  losRequested: number | null;
  notificationType: string;
  notificationDate: string | null;
  notificationAttempt: string | null;
  memberProviderType: string;
  whoMadeTheRequest: string;
  requestSent: string;
  extension: boolean;
  episode: string | null;
  episodeDescription: string | null;
  claimType: string | null;
  outOfAreaIndicator: string | null;
  alternateAuthId: string | null;
  authActualOwner: number;
  authWorkList: string | null;
  outboundGenerated: string | null;

  // ICD Codes
  icd1_codeType: string;
  icd1_icdCode: IcdCodeObject | null;
  icd1_icdDescription: string;
  icd2_codeType: string;
  icd2_icdCode: IcdCodeObject | null;
  icd2_icdDescription: string;

  // Procedure 1
  procedure1_procedureCode: ProcedureCodeObject | string;
  procedure1_procedureDescription: string;
  procedure1_fromDate: string;
  procedure1_toDate: string;
  procedure1_unitType: string;
  procedure1_reviewType: string;
  procedure1_modifier: string | null;
  procedure1_serviceReq: number;
  procedure1_serviceAppr: number | null;
  procedure1_serviceDenied: number | null;
  procedure1_used: number | null;

  // Procedure 2
  procedure2_procedureCode: ProcedureCodeObject | string;
  procedure2_procedureDescription: string;
  procedure2_fromDate: string;
  procedure2_toDate: string;
  procedure2_unitType: string;
  procedure2_reviewType: string;
  procedure2_modifier: string | null;
  procedure2_serviceReq: number;
  procedure2_serviceAppr: number | null;
  procedure2_serviceDenied: number | null;
  procedure2_used: number | null;

  // Providers
  provider1_providerName: string;
  provider1_providerRole: string;
  provider1_providerNPI: string;
  provider1_providerTaxId: string;
  provider1_providerFirstName: string;
  provider1_providerLastName: string;
  provider1_providerSpecialty: string | null;
  provider1_providerPhone: string | null;
  provider1_providerFax: string | null;
  provider1_providerAddressLine1: string;
  provider1_providerAddressLine2: string;
  provider1_providerCity: string;
  provider1_providerState: string;
  provider1_providerZipCode: string;
  provider1_providerSearch: string | object;
  providerButton1: string | null;

  provider2_providerName: string;
  provider2_providerRole: string;
  provider2_providerNPI: string;
  provider2_providerTaxId: string;
  provider2_providerFirstName: string;
  provider2_providerLastName: string;
  provider2_providerSpecialty: string | null;
  provider2_providerPhone: string | null;
  provider2_providerFax: string | null;
  provider2_providerAddressLine1: string;
  provider2_providerAddressLine2: string;
  provider2_providerCity: string;
  provider2_providerState: string;
  provider2_providerZipCode: string;
  provider2_providerSearch: string | object;
  providerButton2: string | null;

  provider3_providerName: string;
  provider3_providerRole: string;
  provider3_providerNPI: string;
  provider3_providerTaxId: string;
  provider3_providerFirstName: string;
  provider3_providerLastName: string;
  provider3_providerSpecialty: string | null;
  provider3_providerPhone: string | null;
  provider3_providerFax: string | null;
  provider3_providerAddressLine1: string;
  provider3_providerAddressLine2: string;
  provider3_providerCity: string;
  provider3_providerState: string;
  provider3_providerZipCode: string;
  provider3_providerSearch: string | object;
  providerButton3: string | null;

  // Decision Details & Notes
  decisionDetails: DecisionDetailEntry[];
  decisionNotes: DecisionNoteEntry[];
  memberProviderDecisionInfo: any[];

  [key: string]: any;
}

/* ──────────────────────────────────────────────
   Display Model Interfaces
   ────────────────────────────────────────────── */
export interface AuthTimelineStep {
  label: string;
  date: string;
  completed: boolean;
}

export interface AuthDenialInfo {
  reason: string;
  denialCode: string;
  denialCodeLabel: string;
  denialCategory: string | null;
  denialCategoryLabel: string | null;
}

export interface AuthProviderDisplay {
  name: string;
  role: string;
  npi: string;
  taxId: string;
  specialty: string | null;
  phone: string | null;
  fax: string | null;
  address: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface AuthProcedureDisplay {
  procedureNo: number;
  code: string;
  description: string;
  fromDate: string;
  toDate: string;
  modifier: string | null;
  unitType: string;
  reviewType: string;
  requested: number;
  approved: number | null;
  denied: number | null;
  used: number | null;
}

export interface AuthDecisionDisplay {
  procedureNo: number;
  procedureCode: string;
  procedureDescription: string;
  decisionStatus: string;
  decisionStatusCode: string;
  decisionStatusCodeLabel: string;
  reviewType: string;
  requestPriority: string;
  receivedVia: string;
  treatmentType: string;
  fromDate: string;
  toDate: string;
  requested: number;
  approved: number;
  denied: number;
  used: string;
  modifier: string;
  decisionDateTime: string;
  admissionType: string | null;
  denialCategory: string | null;
  denialCategoryLabel: string | null;
}

export interface AuthorizationDetail {
  authNumber: string;
  status: string;
  statusReason: string;
  authType: string;
  authClass: string;
  urgency: string;
  requestDatetime: string;
  actualAdmissionDatetime: string | null;
  expectedDischargeDatetime: string | null;
  admissionType: string;
  admitReason: string | null;
  treatmentType: string;
  placeOfService: string;
  losRequested: number | null;
  notificationType: string;
  whoMadeTheRequest: string;
  requestSent: string;
  extension: boolean;
  episode: string | null;
  episodeDescription: string | null;

  // ICD Codes
  icdCodes: { code: string; description: string; type: string }[];

  // Providers
  providers: AuthProviderDisplay[];

  // Procedures
  procedures: AuthProcedureDisplay[];

  // Decision Details
  decisions: AuthDecisionDisplay[];

  // Decision Notes
  decisionNotes: { procedureNo: number; procedureCode: string; procedureDescription: string; notes: string; isAlert: boolean; createdOn: string }[];

  // Timeline
  timeline: AuthTimelineStep[];

  // Denial (if any decision is denied)
  denial: AuthDenialInfo | null;
}

/* ──────────────────────────────────────────────
   Lookup Maps
   ────────────────────────────────────────────── */
const AUTH_STATUS_MAP: Record<string, string> = {
  '1': 'Open',
  '2': 'Approved',
  '3': 'Denied',
  '4': 'Partially Approved',
  '5': 'Pending',
  '6': 'Cancelled',
  '7': 'Closed',
  '8': 'Voided'
};

const AUTH_STATUS_REASON_MAP: Record<string, string> = {
  '1': 'Initial Review',
  '2': 'Medical Necessity',
  '3': 'Insufficient Documentation',
  '4': 'Out of Network',
  '5': 'Benefit Exclusion'
};

const AUTH_TYPE_MAP: Record<number, string> = {
  1: 'Inpatient',
  2: 'Outpatient',
  3: 'Observation',
  4: 'Residential',
  5: 'Partial Hospitalization',
  6: 'Home Health',
  7: 'DME',
  8: 'Other'
};

const AUTH_CLASS_MAP: Record<number, string> = {
  1: 'Prior Authorization',
  2: 'Concurrent Review',
  3: 'Retrospective Review',
  4: 'Pre-Certification'
};

const PRIORITY_MAP: Record<string, string> = {
  '1': 'Standard',
  '2': 'Urgent',
  '3': 'Expedited'
};

const ADMISSION_TYPE_MAP: Record<string, string> = {
  '1': 'Emergency',
  '2': 'Urgent',
  '3': 'Elective',
  '4': 'Newborn',
  '5': 'Trauma'
};

const TREATMENT_TYPE_MAP: Record<string, string> = {
  '1': 'Acute Psychiatric Inpatient',
  '2': 'Substance Abuse Inpatient',
  '3': 'Medical/Surgical',
  '4': 'Rehabilitation'
};

const PLACE_OF_SERVICE_MAP: Record<string, string> = {
  '1': 'Office',
  '2': 'Home',
  '3': 'Inpatient Hospital',
  '4': 'Outpatient Hospital',
  '5': 'Emergency Room',
  '6': 'Ambulatory Surgical Center',
  '7': 'Skilled Nursing Facility',
  '8': 'Other'
};

const NOTIFICATION_TYPE_MAP: Record<string, string> = {
  '1': 'Phone',
  '2': 'Fax',
  '3': 'Mail',
  '4': 'Email',
  '5': 'Portal',
  '6': 'Electronic'
};

const WHO_MADE_REQUEST_MAP: Record<string, string> = {
  '1': 'Member',
  '2': 'Provider',
  '3': 'Facility',
  '4': 'Plan'
};

const REQUEST_SENT_MAP: Record<string, string> = {
  '1': 'Phone',
  '2': 'Fax',
  '3': 'Mail',
  '4': 'Portal',
  '5': 'Electronic'
};

const PROVIDER_ROLE_MAP: Record<string, string> = {
  '1': 'Requesting Provider',
  '2': 'Servicing Provider',
  '3': 'Referring Provider',
  '4': 'Attending Provider'
};

const REVIEW_TYPE_MAP: Record<string, string> = {
  '1': 'Initial',
  '2': 'Extension',
  '3': 'Reconsideration'
};

const UNIT_TYPE_MAP: Record<string, string> = {
  '1': 'Days',
  '2': 'Visits',
  '3': 'Units',
  '4': 'Hours'
};

const MEMBER_PROVIDER_TYPE_MAP: Record<string, string> = {
  '1': 'In-Network',
  '2': 'Out-of-Network'
};

@Component({
  selector: 'app-authorization-details',
  templateUrl: './authorization-details.component.html',
  styleUrls: ['./authorization-details.component.css']
})
export class AuthorizationDetailsComponent implements OnInit, OnChanges {

  /** Pass the auth number — triggers the API call */
  @Input() authNumber: string = '';

  /** If you already have the full object, pass it directly */
  @Input() authData: AuthorizationDetail | null = null;

  /** Whether to show in compact/embedded mode (no header actions) */
  @Input() embedded = false;

  /** Emits when user clicks the close button */
  @Output() closed = new EventEmitter<void>();

  /** Emits when user clicks the edit button */
  @Output() edit = new EventEmitter<string>();

  /** Emits when user clicks the print button */
  @Output() print = new EventEmitter<string>();

  constructor(public authService: AuthService) {}

  /** Resolved detail to display */
  detail: AuthorizationDetail | null = null;

  /** Collapsible sections */
  sections: Record<string, boolean> = {
    authInfo: true,
    providers: true,
    timeline: true,
    procedures: true,
    decisions: true,
    codes: true,
    notes: false,
    denial: true
  };

  loading = false;
  errorMessage = '';

  ngOnInit(): void {
    this.loadDetail();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['authNumber'] || changes['authData']) {
      this.loadDetail();
    }
  }

  private loadDetail(): void {
    if (this.authData) {
      this.detail = this.authData;
      return;
    }

    if (!this.authNumber) {
      return;
    }

    this.loading = true;
    this.detail = null;
    this.errorMessage = '';

    this.authService.getAuthDetailsJson(this.authNumber).subscribe({
      next: (response: any) => {
        try {
          // ★ FIX: API may return JSON string instead of parsed object
          let data = response;
          if (typeof data === 'string') {
            console.log('Auth response is a string — parsing JSON');
            data = JSON.parse(data);
          }

          console.log('Auth parsed data keys:', Object.keys(data || {}));
          console.log('Auth authStatus:', data?.authStatus, 'authTypeId:', data?.authTypeId, 'authClassId:', data?.authClassId);

          this.detail = this.mapApiResponseToDetail(data);
          console.log('Mapped authorization detail:', this.detail);
          this.loading = false;
        } catch (e) {
          console.error('Error mapping auth details:', e);
          this.errorMessage = 'Error processing authorization data.';
          this.loading = false;
        }
      },
      error: (err) => {
        console.error('Failed to load authorization details:', err);
        this.errorMessage = 'Failed to load authorization details.';
        this.loading = false;
      }
    });
  }

  /* ──────────────────────────────────────────────
     Map raw API response → AuthorizationDetail
     ────────────────────────────────────────────── */
  private mapApiResponseToDetail(data: any): AuthorizationDetail {

    // ICD Codes
    const icdCodes: { code: string; description: string; type: string }[] = [];
    if (data.icd1_icdCode) {
      icdCodes.push({
        code: data.icd1_icdCode.code,
        description: data.icd1_icdCode.codeDesc,
        type: data.icd1_codeType === '1' ? 'Primary' : 'Secondary'
      });
    }
    if (data.icd2_icdCode) {
      icdCodes.push({
        code: data.icd2_icdCode.code,
        description: data.icd2_icdCode.codeDesc,
        type: data.icd2_codeType === '1' ? 'Primary' : 'Secondary'
      });
    }

    // Providers
    const providers = this.extractProviders(data);

    // Procedures
    const procedures = this.extractProcedures(data);

    // Decisions
    const decisions = this.extractDecisions(data.decisionDetails || []);

    // Decision Notes
    const decisionNotes = this.extractDecisionNotes(data.decisionNotes || []);

    // Timeline
    const timeline = this.buildTimeline(data, decisions);

    // Denial info (from denied decisions)
    const denial = this.extractDenialInfo(decisions);

    // Determine overall display status
    const status = AUTH_STATUS_MAP[String(data.authStatus)] || `Status ${data.authStatus}`;

    return {
      authNumber: this.authNumber,
      status: status,
      statusReason: AUTH_STATUS_REASON_MAP[String(data.authStatusReason)] || data.authStatusReason || '',
      authType: AUTH_TYPE_MAP[Number(data.authTypeId)] || `Type ${data.authTypeId}`,
      authClass: AUTH_CLASS_MAP[Number(data.authClassId)] || `Class ${data.authClassId}`,
      urgency: PRIORITY_MAP[String(data.requestPriority)] || data.requestPriority || '',
      requestDatetime: data.requestDatetime,
      actualAdmissionDatetime: data.actualAdmissionDatetime,
      expectedDischargeDatetime: data.expectedDischargeDatetime,
      admissionType: ADMISSION_TYPE_MAP[String(data.admissionType)] || data.admissionType || '',
      admitReason: data.admitReason,
      treatmentType: TREATMENT_TYPE_MAP[String(data.treatmentType)] || data.treatmentType || '',
      placeOfService: PLACE_OF_SERVICE_MAP[String(data.placeOfService)] || data.placeOfService || '',
      losRequested: data.losRequested,
      notificationType: NOTIFICATION_TYPE_MAP[String(data.notificationType)] || data.notificationType || '',
      whoMadeTheRequest: WHO_MADE_REQUEST_MAP[String(data.whoMadeTheRequest)] || data.whoMadeTheRequest || '',
      requestSent: REQUEST_SENT_MAP[String(data.requestSent)] || data.requestSent || '',
      extension: data.extension,
      episode: data.episode,
      episodeDescription: data.episodeDescription,
      icdCodes: icdCodes,
      providers: providers,
      procedures: procedures,
      decisions: decisions,
      decisionNotes: decisionNotes,
      timeline: timeline,
      denial: denial
    };
  }

  private extractProviders(data: any): AuthProviderDisplay[] {
    const providers: AuthProviderDisplay[] = [];

    for (let i = 1; i <= 3; i++) {
      const name = data[`provider${i}_providerName`];
      if (name && name.trim()) {
        providers.push({
          name: name.trim(),
          role: PROVIDER_ROLE_MAP[String(data[`provider${i}_providerRole`])] || data[`provider${i}_providerRole`] || '',
          npi: data[`provider${i}_providerNPI`] || '',
          taxId: data[`provider${i}_providerTaxId`] || '',
          specialty: data[`provider${i}_providerSpecialty`] || null,
          phone: data[`provider${i}_providerPhone`] || null,
          fax: data[`provider${i}_providerFax`] || null,
          address: [data[`provider${i}_providerAddressLine1`], data[`provider${i}_providerAddressLine2`]].filter(Boolean).join(', '),
          city: data[`provider${i}_providerCity`] || '',
          state: data[`provider${i}_providerState`] || '',
          zipCode: data[`provider${i}_providerZipCode`] || ''
        });
      }
    }

    return providers;
  }

  private extractProcedures(data: any): AuthProcedureDisplay[] {
    const procedures: AuthProcedureDisplay[] = [];

    for (let i = 1; i <= 2; i++) {
      const codeField = data[`procedure${i}_procedureCode`];
      if (!codeField) continue;

      const code = typeof codeField === 'object' ? codeField.code : codeField;
      const description = data[`procedure${i}_procedureDescription`] || '';

      procedures.push({
        procedureNo: i,
        code: code,
        description: description,
        fromDate: data[`procedure${i}_fromDate`] || '',
        toDate: data[`procedure${i}_toDate`] || '',
        modifier: data[`procedure${i}_modifier`] || null,
        unitType: UNIT_TYPE_MAP[String(data[`procedure${i}_unitType`])] || data[`procedure${i}_unitType`] || '',
        reviewType: REVIEW_TYPE_MAP[String(data[`procedure${i}_reviewType`])] || data[`procedure${i}_reviewType`] || '',
        requested: data[`procedure${i}_serviceReq`] || 0,
        approved: data[`procedure${i}_serviceAppr`],
        denied: data[`procedure${i}_serviceDenied`],
        used: data[`procedure${i}_used`]
      });
    }

    return procedures;
  }

  private extractDecisions(entries: DecisionDetailEntry[]): AuthDecisionDisplay[] {
    return entries.map(entry => {
      const d = entry.data;
      const code = typeof d.procedureCode === 'object' ? d.procedureCode.code : (d.procedureCode || d.serviceCode);

      return {
        procedureNo: d.procedureNo,
        procedureCode: code,
        procedureDescription: d.procedureDescription || d.serviceDescription || '',
        decisionStatus: d.decisionStatusLabel || '',
        decisionStatusCode: d.decisionStatusCode || '',
        decisionStatusCodeLabel: d.decisionStatusCodeLabel || '',
        reviewType: d.reviewTypeLabel || '',
        requestPriority: d.requestPriorityLabel || '',
        receivedVia: d.requestReceivedViaLabel || '',
        treatmentType: d.treatmentTypeLabel || '',
        fromDate: d.fromDate || '',
        toDate: d.toDate || '',
        requested: typeof d.requested === 'string' ? parseInt(d.requested, 10) || 0 : d.requested,
        approved: d.approved || 0,
        denied: d.denied || 0,
        used: d.used || '',
        modifier: d.modifier || '',
        decisionDateTime: d.decisionDateTime || '',
        admissionType: d.newSelect_copy_25gqf4w2sLabel || null,
        denialCategory: d.newSelect_copy_bszkkn8o1Label || null,
        denialCategoryLabel: d.newSelect_copy_3uon6b5w0Label || null
      };
    });
  }

  private extractDecisionNotes(entries: DecisionNoteEntry[]): { procedureNo: number; procedureCode: string; procedureDescription: string; notes: string; isAlert: boolean; createdOn: string }[] {
    return entries.map(entry => {
      const d = entry.data;
      const code = typeof d.procedureCode === 'object' ? d.procedureCode.code : (d.procedureCode || '');
      return {
        procedureNo: d.procedureNo,
        procedureCode: code,
        procedureDescription: d.procedureDescription || '',
        notes: d.authorizationNotes || '',
        isAlert: d.authorizationAlertNote || false,
        createdOn: entry.createdOn || ''
      };
    });
  }

  private buildTimeline(data: any, decisions: AuthDecisionDisplay[]): AuthTimelineStep[] {
    const steps: AuthTimelineStep[] = [];

    // Requested
    if (data.requestDatetime) {
      steps.push({
        label: 'Requested',
        date: this.formatDateShort(data.requestDatetime),
        completed: true
      });
    }

    // Admitted
    if (data.actualAdmissionDatetime) {
      steps.push({
        label: 'Admitted',
        date: this.formatDateShort(data.actualAdmissionDatetime),
        completed: true
      });
    }

    // Reviewed — inferred from decision details
    const hasDecision = decisions.length > 0 && decisions.some(d => d.decisionStatus);
    steps.push({
      label: 'Reviewed',
      date: hasDecision ? this.formatDateShort(decisions[0]?.decisionDateTime) : '—',
      completed: hasDecision
    });

    // Decision
    const statusId = String(data.authStatus);
    const isDecided = ['2', '3', '4', '6', '7', '8'].includes(statusId);
    const latestDecisionDate = decisions.length > 0
      ? decisions.reduce((latest, d) => {
          const dt = d.decisionDateTime || '';
          return dt > latest ? dt : latest;
        }, '')
      : '';

    steps.push({
      label: 'Decision',
      date: isDecided && latestDecisionDate ? this.formatDateShort(latestDecisionDate) : '—',
      completed: isDecided
    });

    return steps;
  }

  private extractDenialInfo(decisions: AuthDecisionDisplay[]): AuthDenialInfo | null {
    const deniedDecision = decisions.find(d => d.decisionStatus === 'Denied');
    if (!deniedDecision) return null;

    return {
      reason: deniedDecision.decisionStatusCodeLabel || deniedDecision.decisionStatusCode || 'Denied',
      denialCode: deniedDecision.decisionStatusCode || '',
      denialCodeLabel: deniedDecision.decisionStatusCodeLabel || '',
      denialCategory: deniedDecision.denialCategory || null,
      denialCategoryLabel: deniedDecision.denialCategoryLabel || null
    };
  }

  toggleSection(key: string): void {
    this.sections[key] = !this.sections[key];
  }

  onClose(): void {
    this.closed.emit();
  }

  onEdit(): void {
    this.edit.emit(this.detail?.authNumber ?? this.authNumber);
  }

  onPrint(): void {
    this.print.emit(this.detail?.authNumber ?? this.authNumber);
  }

  /** Status CSS class */
  get statusClass(): string {
    const s = (this.detail?.status ?? '').toLowerCase().replace(/\s+/g, '-');
    return `auth-status--${s}`;
  }

  /** Timeline progress percentage */
  get timelineProgress(): number {
    if (!this.detail?.timeline?.length) return 0;
    const completed = this.detail.timeline.filter(t => t.completed).length;
    return Math.round((completed / this.detail.timeline.length) * 100);
  }

  /** Check if there are notes with content */
  get hasDecisionNotes(): boolean {
    return (this.detail?.decisionNotes || []).some(n => n.notes && n.notes.trim().length > 0);
  }

  /** Format date to short display */
  formatDateShort(dateStr: string | null): string {
    if (!dateStr) return '—';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }

  /** Format datetime to display */
  formatDateTime(dateStr: string | null): string {
    if (!dateStr) return '—';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  }

  /** Get decision status CSS class */
  getDecisionStatusClass(status: string): string {
    const s = (status || '').toLowerCase().replace(/\s+/g, '-');
    return `auth-decision-status--${s}`;
  }
}
