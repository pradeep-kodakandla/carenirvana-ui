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
export interface ClaimLinePharmacy {
  drugname: string;
  drugform: string;
  drugstrength: string;
  quantity: number;
  quantityuom: string;
  dispensedquantity: number;
  daysupply: number;
  refillnumber: number;
  nationaldrugcode: string;
  ismultisource: boolean;
  isbrandmedication: boolean;
  medicationnotes: string;
  memberclaimlinepharmacyid: number;
  memberclaimlineid: number;
  prescribingproviderid: number;
  activeflag: boolean;
  createdby: number;
  createdon: string;
  updatedby: number | null;
  updatedon: string | null;
  deletedby: number | null;
  deletedon: string | null;
}

export interface ClaimLineToothDetail {
  toothnumber: string;
  toothsurfacecode: string;
  toothchartcodeid: number;
  memberclaimlineid: number;
  memberclaimlinetoothdetailid: number;
  activeflag: boolean;
  issensitive: boolean;
  createdby: number;
  createdon: string;
  updatedby: number | null;
  updatedon: string | null;
  deletedby: number | null;
  deletedon: string | null;
}

export interface ClaimLineData {
  memberclaimlineid: number;
  memberclaimheaderid: number;
  claimline: number;
  dos_from: string;
  dos_to: string;
  postdate: string;
  paiddate: string | null;
  units: number;
  originallineamount: number;
  originaldamountagreed: number;
  allowedamount: number;
  netamount: number;
  copayamount: number;
  deductibleamount: number;
  coinsuranceamount: number;
  noncoveredflag: boolean;
  qualifiercode: string;
  servicecodeid: number;
  revenuecodeid: number;
  placeofserviceid: number;
  cptmodifierid: number | null;
  procedurelinestatusid: number;
  notes: string;
  activeflag: boolean;
  issensitive: boolean;
  createdby: number;
  createdon: string;
  updatedby: number | null;
  updatedon: string | null;
  deletedby: number | null;
  deletedon: string | null;
}

export interface ClaimLineEntry {
  line: ClaimLineData;
  pharmacy: ClaimLinePharmacy[];
  toothDetails: ClaimLineToothDetail[];
}

export interface ClaimDiagnosis {
  memberclaimdiagnosisid: number;
  memberclaimheaderid: number;
  icdcodeid: number;
  isprimary: boolean;
  diagnosissequence: number;
  activeflag: boolean;
  createdby: number;
  createdon: string;
  updatedby: number | null;
  updatedon: string | null;
  deletedby: number | null;
  deletedon: string | null;
}

export interface ClaimHeader {
  memberclaimheaderid: number;
  claimnumber: string;
  claimstatusid: number;
  claimtypeid: number;
  memberdetailsid: number;
  providerid: number;
  placeofserviceid: number;
  enrollmenthierarchyid: number;
  visittypeid: number;
  dos_from: string;
  dos_to: string;
  receiveddate: string;
  paiddate: string | null;
  checkdate: string | null;
  checknumber: string | null;
  los: number;
  billtype: string;
  programtype: string;
  authnumber: string;
  patcontrrolnumber: string;
  medicalrecordnumber: string;
  reasonforvisit: string;
  companycode: string;
  holdcodeid: number | null;
  notes: string;
  activeflag: boolean;
  issensitive: boolean;
  createdby: number;
  createdon: string;
  updatedby: number | null;
  updatedon: string | null;
  deletedby: number | null;
  deletedon: string | null;
}

export interface ClaimJsonResponse {
  header: ClaimHeader;
  lines: ClaimLineEntry[];
  diagnoses: ClaimDiagnosis[];
  payments: any[];
  documents: any[];
}

/* ──────────────────────────────────────────────
   Display Model Interfaces
   ────────────────────────────────────────────── */
export interface ClaimTimelineStep {
  label: string;
  date: string;
  completed: boolean;
}

export interface ClaimDenialInfo {
  reason: string;
  code: string;
  remarkCodes?: string[];
}

export interface ClaimFinancialSummary {
  billed: number;
  allowed: number;
  paid: number;
  memberResp: number;
  deductible: number;
  coinsurance: number;
  copay: number;
}

export interface ClaimLineDisplay {
  lineNumber: number;
  dosFrom: string;
  dosTo: string;
  units: number;
  billedAmount: number;
  allowedAmount: number;
  netAmount: number;
  copay: number;
  deductible: number;
  coinsurance: number;
  serviceCodeId: number;
  revenueCodeId: number;
  statusId: number;
  notes: string;
  noncovered: boolean;
  pharmacy: ClaimLinePharmacy[];
  toothDetails: ClaimLineToothDetail[];
}

export interface ClaimDetail {
  claimNumber: string;
  status: string;
  claimType: string;
  programType: string;
  billType: string;
  memberId: number;
  providerId: number;
  dateOfService: string;
  dateOfServiceTo: string;
  receivedDate: string;
  paidDate: string | null;
  los: number;
  authNumber: string;
  patientControlNumber: string;
  medicalRecordNumber: string;
  reasonForVisit: string;
  companyCode: string;
  notes: string;
  diagnoses: ClaimDiagnosis[];
  financial: ClaimFinancialSummary;
  timeline: ClaimTimelineStep[];
  lines: ClaimLineDisplay[];
  payments: any[];
  documents: any[];
}

/* ──────────────────────────────────────────────
   Status & Type Lookup Maps
   ────────────────────────────────────────────── */
const CLAIM_STATUS_MAP: Record<number, string> = {
  1: 'Pending',
  2: 'Submitted',
  3: 'Received',
  4: 'In Review',
  5: 'Approved',
  6: 'Paid',
  7: 'Denied',
  8: 'Adjusted',
  9: 'Void',
  10: 'On Hold'
};

const CLAIM_TYPE_MAP: Record<number, string> = {
  1: 'Professional',
  2: 'Institutional',
  3: 'Pharmacy',
  4: 'Dental',
  5: 'Vision'
};

const LINE_STATUS_MAP: Record<number, string> = {
  1: 'Pending',
  2: 'Approved',
  3: 'Denied',
  4: 'Adjusted',
  5: 'Void'
};

@Component({
  selector: 'app-claim-details',
  templateUrl: './claim-details.component.html',
  styleUrls: ['./claim-details.component.css']
})
export class ClaimDetailsComponent implements OnInit, OnChanges {

  /** Pass the claim number — triggers the API call */
  @Input() claimNumber: string = '';

  /** If you already have the full object, pass it directly */
  @Input() claimData: ClaimDetail | null = null;

  /** Whether to show in compact/embedded mode (no header actions) */
  @Input() embedded = false;

  /** Emits when user clicks the close button */
  @Output() closed = new EventEmitter<void>();

  /** Emits when user clicks the edit button */
  @Output() edit = new EventEmitter<string>();

  /** Emits when user clicks the print button */
  @Output() print = new EventEmitter<string>();

  /** Emits when user clicks the download button */
  @Output() download = new EventEmitter<string>();

  constructor(public authService: AuthService) {}

  /** Resolved detail to display */
  detail: ClaimDetail | null = null;

  /** Collapsible sections */
  sections: Record<string, boolean> = {
    claimInfo: true,
    diagnoses: true,
    financial: true,
    lines: true,
    timeline: true,
    pharmacy: false,
    dental: false
  };

  loading = false;

  ngOnInit(): void {
    this.loadDetail();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['claimNumber'] || changes['claimData']) {
      this.loadDetail();
    }
  }

  private loadDetail(): void {
    if (this.claimData) {
      this.detail = this.claimData;
      return;
    }

    if (!this.claimNumber) {
      return;
    }

    this.loading = true;
    this.detail = null;

    this.authService.getClaimJson(this.claimNumber).subscribe({
      next: (response: any) => {
        try {
          // ★ FIX: API may return JSON string instead of parsed object
          let data = response;
          if (typeof data === 'string') {
            console.log('Claim response is a string — parsing JSON');
            data = JSON.parse(data);
          }
          this.detail = this.mapApiResponseToDetail(data);
          this.loading = false;
        } catch (e) {
          console.error('Error mapping claim details:', e);
          this.loading = false;
        }
      },
      error: (err) => {
        console.error('Failed to load claim details:', err);
        this.loading = false;
      }
    });
  }

  /* ──────────────────────────────────────────────
     Map raw API response → ClaimDetail display model
     Handles multiple response shapes:
       - { header: {...}, lines: [...], ... }
       - { claimnumber: '...', lines: [...], ... }  (flat)
     ────────────────────────────────────────────── */
  private mapApiResponseToDetail(data: any): ClaimDetail {
    console.log('Raw Claim API response:', data);

    // Auto-detect response structure:
    // If data.header exists, use it; otherwise treat data itself as the header
    const header: ClaimHeader = data.header ?? data;
    const lines: ClaimLineEntry[] = data.lines || [];
    const diagnoses: ClaimDiagnosis[] = data.diagnoses || [];

    // Aggregate financials from all active lines
    const financial = this.aggregateFinancials(lines);

    // Map line items for display
    const lineDisplays: ClaimLineDisplay[] = lines.map(entry => {
      const line = entry?.line ?? entry;
      return {
        lineNumber: line.claimline ?? 0,
        dosFrom: line.dos_from ?? '',
        dosTo: line.dos_to ?? '',
        units: line.units ?? 0,
        billedAmount: line.originallineamount ?? 0,
        allowedAmount: line.allowedamount ?? 0,
        netAmount: line.netamount ?? 0,
        copay: line.copayamount ?? 0,
        deductible: line.deductibleamount ?? 0,
        coinsurance: line.coinsuranceamount ?? 0,
        serviceCodeId: line.servicecodeid ?? 0,
        revenueCodeId: line.revenuecodeid ?? 0,
        statusId: line.procedurelinestatusid ?? 0,
        notes: line.notes ?? '',
        noncovered: line.noncoveredflag ?? false,
        pharmacy: entry?.pharmacy || [],
        toothDetails: entry?.toothDetails || []
      };
    });

    // Build timeline from available dates
    const timeline = this.buildTimeline(header);

    return {
      claimNumber: header?.claimnumber ?? this.claimNumber ?? '',
      status: CLAIM_STATUS_MAP[header?.claimstatusid] || `Status ${header?.claimstatusid ?? 'Unknown'}`,
      claimType: CLAIM_TYPE_MAP[header?.claimtypeid] || `Type ${header?.claimtypeid ?? 'Unknown'}`,
      programType: header?.programtype ?? '',
      billType: header?.billtype ?? '',
      memberId: header?.memberdetailsid ?? 0,
      providerId: header?.providerid ?? 0,
      dateOfService: header?.dos_from ?? '',
      dateOfServiceTo: header?.dos_to ?? '',
      receivedDate: header?.receiveddate ?? '',
      paidDate: header?.paiddate ?? null,
      los: header?.los ?? 0,
      authNumber: header?.authnumber ?? '',
      patientControlNumber: header?.patcontrrolnumber ?? '',
      medicalRecordNumber: header?.medicalrecordnumber ?? '',
      reasonForVisit: header?.reasonforvisit ?? '',
      companyCode: header?.companycode ?? '',
      notes: header?.notes ?? '',
      diagnoses: diagnoses,
      financial: financial,
      timeline: timeline,
      lines: lineDisplays,
      payments: data.payments || [],
      documents: data.documents || []
    };
  }

  private aggregateFinancials(lines: any[]): ClaimFinancialSummary {
    const activeLines = lines.filter(l => {
      const line = l?.line ?? l;
      return line?.activeflag !== false;
    });
    return {
      billed: activeLines.reduce((sum, l) => {
        const line = l?.line ?? l;
        return sum + (line?.originallineamount || 0);
      }, 0),
      allowed: activeLines.reduce((sum, l) => {
        const line = l?.line ?? l;
        return sum + (line?.allowedamount || 0);
      }, 0),
      paid: activeLines.reduce((sum, l) => {
        const line = l?.line ?? l;
        return sum + (line?.netamount || 0);
      }, 0),
      memberResp: activeLines.reduce((sum, l) => {
        const line = l?.line ?? l;
        return sum + (line?.copayamount || 0) + (line?.deductibleamount || 0) + (line?.coinsuranceamount || 0);
      }, 0),
      deductible: activeLines.reduce((sum, l) => {
        const line = l?.line ?? l;
        return sum + (line?.deductibleamount || 0);
      }, 0),
      coinsurance: activeLines.reduce((sum, l) => {
        const line = l?.line ?? l;
        return sum + (line?.coinsuranceamount || 0);
      }, 0),
      copay: activeLines.reduce((sum, l) => {
        const line = l?.line ?? l;
        return sum + (line?.copayamount || 0);
      }, 0)
    };
  }

  private buildTimeline(header: ClaimHeader | null | undefined): ClaimTimelineStep[] {
    const steps: ClaimTimelineStep[] = [];

    if (!header) {
      return steps;
    }

    // Submitted — use createdon
    if (header.createdon) {
      steps.push({
        label: 'Submitted',
        date: this.formatDateShort(header.createdon),
        completed: true
      });
    }

    // Received
    if (header.receiveddate) {
      steps.push({
        label: 'Received',
        date: this.formatDateShort(header.receiveddate),
        completed: true
      });
    }

    // Processed — inferred as completed if status >= 5 (Approved/Paid/Denied/Adjusted)
    const statusId = header.claimstatusid ?? 0;
    const processed = statusId >= 5;
    steps.push({
      label: 'Processed',
      date: processed ? this.formatDateShort(header.updatedon || header.createdon) : '—',
      completed: processed
    });

    // Paid
    if (header.paiddate) {
      steps.push({
        label: 'Paid',
        date: this.formatDateShort(header.paiddate),
        completed: true
      });
    } else if (statusId === 6) {
      steps.push({
        label: 'Paid',
        date: '—',
        completed: true
      });
    } else {
      steps.push({
        label: 'Paid',
        date: '—',
        completed: false
      });
    }

    return steps;
  }

  toggleSection(key: string): void {
    this.sections[key] = !this.sections[key];
  }

  onClose(): void {
    this.closed.emit();
  }

  onEdit(): void {
    this.edit.emit(this.detail?.claimNumber ?? this.claimNumber);
  }

  onPrint(): void {
    this.print.emit(this.detail?.claimNumber ?? this.claimNumber);
  }

  onDownload(): void {
    this.download.emit(this.detail?.claimNumber ?? this.claimNumber);
  }

  /** Status CSS class */
  get statusClass(): string {
    const s = (this.detail?.status ?? '').toLowerCase().replace(/\s+/g, '-');
    return `claim-status--${s}`;
  }

  /** Timeline progress */
  get timelineProgress(): number {
    if (!this.detail?.timeline?.length) return 0;
    const completed = this.detail.timeline.filter(t => t.completed).length;
    return Math.round((completed / this.detail.timeline.length) * 100);
  }

  /** Check if any line has pharmacy data */
  get hasPharmacyData(): boolean {
    return (this.detail?.lines || []).some(l => l.pharmacy.length > 0);
  }

  /** Check if any line has dental/tooth data */
  get hasDentalData(): boolean {
    return (this.detail?.lines || []).some(l => l.toothDetails.length > 0);
  }

  /** Get all pharmacy entries across lines */
  get allPharmacyEntries(): { lineNumber: number; pharmacy: ClaimLinePharmacy }[] {
    const entries: { lineNumber: number; pharmacy: ClaimLinePharmacy }[] = [];
    (this.detail?.lines || []).forEach(line => {
      line.pharmacy.forEach(p => {
        entries.push({ lineNumber: line.lineNumber, pharmacy: p });
      });
    });
    return entries;
  }

  /** Get all tooth detail entries across lines */
  get allToothEntries(): { lineNumber: number; tooth: ClaimLineToothDetail }[] {
    const entries: { lineNumber: number; tooth: ClaimLineToothDetail }[] = [];
    (this.detail?.lines || []).forEach(line => {
      line.toothDetails.forEach(t => {
        entries.push({ lineNumber: line.lineNumber, tooth: t });
      });
    });
    return entries;
  }

  /** Format currency */
  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
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

  /** Get line status label */
  getLineStatus(statusId: number): string {
    return LINE_STATUS_MAP[statusId] || `Status ${statusId}`;
  }

  /** Get line status CSS class */
  getLineStatusClass(statusId: number): string {
    const status = (LINE_STATUS_MAP[statusId] || '').toLowerCase();
    return `claim-status--${status}`;
  }
}
