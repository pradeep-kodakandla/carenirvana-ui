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
   Lookup Maps
   ────────────────────────────────────────────── */
const LANGUAGE_MAP: Record<number, string> = {
  1: 'English', 2: 'Spanish', 3: 'French', 4: 'German',
  5: 'Chinese (Mandarin)', 6: 'Chinese (Cantonese)', 7: 'Korean',
  8: 'Vietnamese', 9: 'Tagalog', 10: 'Arabic', 11: 'Hindi',
  12: 'Portuguese', 13: 'Russian', 14: 'Japanese', 15: 'Italian'
};

const IDENTIFIER_TYPE_MAP: Record<number, string> = {
  1: 'NPI', 2: 'TIN/EIN', 3: 'DEA Registration', 4: 'State License',
  5: 'Medicaid ID', 6: 'Medicare PTAN', 7: 'CAQH ID', 8: 'UPIN'
};

const PROVIDER_TYPE_MAP: Record<number, string> = {
  1: 'Individual', 2: 'Organization', 3: 'Group'
};

const STATE_MAP: Record<number, string> = {
  1: 'AL', 2: 'AK', 3: 'AZ', 4: 'AR', 5: 'CA',
  6: 'CO', 7: 'CT', 8: 'DE', 9: 'FL', 10: 'GA',
  11: 'HI', 12: 'ID', 13: 'IL', 14: 'IN', 15: 'IA',
  16: 'KS', 17: 'KY', 18: 'LA', 19: 'ME', 20: 'MD',
  21: 'MA', 22: 'MI', 23: 'MN', 24: 'MS', 25: 'MO',
  26: 'MT', 27: 'NE', 28: 'NV', 29: 'NH', 30: 'NJ',
  31: 'NM', 32: 'NY', 33: 'NC', 34: 'ND', 35: 'OH',
  36: 'OK', 37: 'OR', 38: 'PA', 39: 'RI', 40: 'SC',
  41: 'SD', 42: 'TN', 43: 'TX', 44: 'UT', 45: 'VT',
  46: 'VA', 47: 'WA', 48: 'WV', 49: 'WI', 50: 'WY',
  51: 'DC', 52: 'PR', 53: 'VI', 54: 'GU', 55: 'AS'
};

@Component({
  selector: 'app-provider-details',
  templateUrl: './provider-details.component.html',
  styleUrls: ['./provider-details.component.css']
})
export class ProviderDetailsComponent implements OnInit, OnChanges {

  @Input() providerId: string = '';
  @Input() npi: string = '';
  @Input() providerData: any | null = null;
  @Input() embedded = false;

  @Output() closed = new EventEmitter<void>();
  @Output() edit = new EventEmitter<string>();
  @Output() print = new EventEmitter<string>();

  constructor(public authService: AuthService) {}

  /* ── Data properties bound directly by the template ── */
  prov: any = null;               // provider core object
  telecomList: any[] = [];
  licenseList: any[] = [];
  networkList: any[] = [];
  identifierList: any[] = [];
  educationList: any[] = [];
  languageList: any[] = [];
  attestationList: any[] = [];
  boardCertList: any[] = [];
  insuranceList: any[] = [];
  characteristicList: any[] = [];
  addressList: any[] = [];
  rolesList: any[] = [];

  sections: Record<string, boolean> = {
    contact: true,
    addresses: false,
    credentials: true,
    boardCerts: true,
    networks: true,
    education: false,
    insurance: false,
    attestations: false,
    characteristics: false,
    additional: true
  };

  loading = false;
  errorMessage = '';

  ngOnInit(): void {
    this.loadDetail();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['providerId'] || changes['npi'] || changes['providerData']) {
      this.loadDetail();
    }
  }

  /* ──────────────────────────────────────────────
     Load — either from @Input or API
     ────────────────────────────────────────────── */
  private loadDetail(): void {
    //if (this.providerData) {
    //  this.applyData(this.providerData);
    //  return;
    //}

    const id = this.providerId;
    if (!id) return;
    this.loading = true;
    this.prov = null;
    this.errorMessage = '';

    this.authService.getProviderProfileJson(id).subscribe({
      next: (data: any) => {
        console.log('Provider API raw response type:', typeof data);
        this.applyData(data);
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Provider API error:', err);
        this.errorMessage = 'Failed to load provider details.';
        this.loading = false;
      }
    });
  }

  /* ──────────────────────────────────────────────
     Apply data — THE KEY FIX:
     If API returns a string, JSON.parse it first.
     ────────────────────────────────────────────── */
  private applyData(input: any): void {
    try {
      // ★ FIX: API may return JSON string instead of parsed object
      let data = input;
      if (typeof data === 'string') {
        console.log('Provider response is a string — parsing JSON');
        data = JSON.parse(data);
      }

      console.log('Provider parsed data keys:', Object.keys(data || {}));
      console.log('Provider object:', data?.provider);

      // Extract provider core — try data.provider first, then data itself
      this.prov = data?.provider ?? null;

      // If prov is still null, maybe the whole response IS the provider object
      if (!this.prov || !this.prov.providerid) {
        // Check if data itself has providerid (flat response)
        if (data?.providerid || data?.npi) {
          this.prov = data;
        }
      }

      console.log('Resolved prov:', this.prov?.firstname, this.prov?.lastname, 'NPI:', this.prov?.npi);

      // Extract arrays — safe filter for active records
      const safe = (arr: any): any[] =>
        Array.isArray(arr) ? arr.filter((x: any) => x?.activeflag !== false) : [];

      this.telecomList       = safe(data?.telecom);
      this.licenseList       = safe(data?.licenses);
      this.networkList       = safe(data?.networks);
      this.identifierList    = safe(data?.identifiers);
      this.educationList     = safe(data?.education);
      this.languageList      = safe(data?.languages);
      this.attestationList   = safe(data?.attestations);
      this.boardCertList     = safe(data?.boardCertifications);
      this.insuranceList     = safe(data?.liabilityInsurance);
      this.characteristicList = safe(data?.characteristics);
      this.addressList       = safe(data?.addresses);
      this.rolesList         = safe(data?.roles);

      this.errorMessage = '';

      console.log('Provider data applied successfully:',
        'telecom:', this.telecomList.length,
        'licenses:', this.licenseList.length,
        'networks:', this.networkList.length,
        'identifiers:', this.identifierList.length,
        'education:', this.educationList.length,
        'boardCerts:', this.boardCertList.length
      );
    } catch (e) {
      console.error('Error processing provider data:', e);
      this.errorMessage = 'Error processing provider data.';
    }
  }

  /* ──────────────────────────────────────────────
     Computed Getters — used by template
     ────────────────────────────────────────────── */

  get fullName(): string {
    if (!this.prov) return '';
    const parts = [
      this.prov.prefix,
      this.prov.firstname,
      this.prov.middlename,
      this.prov.lastname,
      this.prov.suffix
    ];
    return parts.filter(Boolean).join(' ') || 'Unknown Provider';
  }

  get fullAddress(): string {
    if (!this.prov) return '';
    return [
      this.prov.addressline1,
      this.prov.addressline2,
      this.prov.city,
      this.getStateName(this.prov.stateid),
      this.prov.zipcode
    ].filter((p: any) => p && String(p).trim()).join(', ');
  }

  get networkStatusText(): string {
    if (!this.networkList.length) return 'Unknown';
    return this.networkList.some((n: any) => n.participationtype === 'participating')
      ? 'In-Network' : 'Out-of-Network';
  }

  get networkClass(): string {
    return this.networkStatusText === 'In-Network' ? 'prov-net--in' : 'prov-net--oon';
  }

  get providerTypeLabel(): string {
    return PROVIDER_TYPE_MAP[this.prov?.providertypeid] || '';
  }

  get languageNames(): string[] {
    return this.languageList.map((l: any) =>
      LANGUAGE_MAP[l.languageid] || `Language ${l.languageid}`
    );
  }

  /** Build combined credentials from licenses + identifiers */
  get credentials(): any[] {
    const creds: any[] = [];
    this.licenseList.forEach((l: any) => {
      creds.push({
        type: l.licensetype || 'License',
        value: l.licensenumber || '',
        state: this.getStateName(l.stateid),
        expirationDate: l.expirationdate,
        issueDate: l.issuedate,
        issuingAuthority: l.issuingauthority,
        status: l.status || 'unknown'
      });
    });
    this.identifierList.forEach((i: any) => {
      creds.push({
        type: IDENTIFIER_TYPE_MAP[i.identifiertypeid] || `ID Type ${i.identifiertypeid}`,
        value: i.identifiervalue || '',
        state: this.getStateName(i.stateid),
        expirationDate: i.expirationdate,
        issueDate: i.effectivedate,
        issuingAuthority: i.issuingauthority,
        status: (i.expirationdate && new Date(i.expirationdate) < new Date()) ? 'expired' : 'active'
      });
    });
    return creds;
  }

  /* ──────────────────────────────────────────────
     Utility Methods
     ────────────────────────────────────────────── */

  toggleSection(key: string): void {
    this.sections[key] = !this.sections[key];
  }

  onClose(): void { this.closed.emit(); }
  onEdit(): void { this.edit.emit(this.prov?.npi || this.npi); }
  onPrint(): void { this.print.emit(this.prov?.npi || this.npi); }

  getStateName(stateId: number | null | undefined): string {
    if (!stateId) return '';
    return STATE_MAP[stateId] || '';
  }

  getIdentifierTypeName(typeId: number): string {
    return IDENTIFIER_TYPE_MAP[typeId] || `Type ${typeId}`;
  }

  formatPhone(value: string): string {
    if (!value) return '—';
    const digits = value.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return value;
  }

  formatDateShort(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }

  formatCurrency(value: number): string {
    if (value == null) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD',
      minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(value);
  }

  credentialStatusClass(status?: string): string {
    if (!status) return '';
    const s = status.toLowerCase();
    if (s === 'active' || s === 'approved') return 'prov-cred--active';
    if (s === 'expired') return 'prov-cred--expired';
    return 'prov-cred--pending';
  }
}
