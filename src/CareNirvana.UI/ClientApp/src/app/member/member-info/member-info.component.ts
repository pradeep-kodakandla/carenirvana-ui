import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { DashboardServiceService } from 'src/app/service/dashboard.service.service';

@Component({
  selector: 'app-member-info',
  templateUrl: './member-info.component.html',
  styleUrl: './member-info.component.css'
})
export class MemberInfoComponent implements OnInit {
  editMode = false;
  editModeMI = false;
  detailsForm: FormGroup;

  loading = false;
  memberDetails: any;

  /**
   * We keep the real (editable) values here.
   * When view mode is ON, the form is patched with display values (N/A for empty).
   */
  private formEditValues: Record<string, any> = {};

  // --- Member Identifiers (right column)
  identifiers = {
    memberId: 'N/A',
    subscriberId: 'N/A',
    medicaidId: 'N/A',
    mrn: 'N/A',
    medicareId: 'N/A',
    familyId: 'N/A'
  };

  // --- Tables (bottom)
  phoneNumbers: any[] = [];
  addresses: any[] = [];
  emails: any[] = [];
  languages: any[] = [];

  phoneColumns = ['type', 'number'];
  addressColumns = ['type', 'number'];
  emailColumns = ['type', 'email'];
  languageColumns = ['type', 'language'];

  constructor(
    private fb: FormBuilder,
    private dashboard: DashboardServiceService
  ) {
    // Keep ALL existing fields (controls) – values will be patched from API.
    this.detailsForm = this.fb.group({
      prefix: [''],
      firstName: [''],
      middleInitial: [''],
      lastName: [''],
      dateOfBirth: [''],
      maritalStatus: [''],
      preferredName: [''],
      gender: [''],
      genderIdentity: [''],
      sexualOrientation: [''],
      veteranStatus: [''],
      preferredcontactformat: [''],
      veteranstatus: [''],
      race: [''],
      primaryLanguage: [''],

      preferredRace: [''],
      prefferedWrittenLanguages: [''],
      ethincity: [''],
      prefferedSpokeLanguages: [''],
      communicationImpairment: [''],
      preferredEthincity: [''],
      residenceStatus: [''],
      evacuationZone: [''],
      incomeStatus: [''],
      serviceInterruption: [''],
      dateOfDeath: [''],
      causeOfDeath: [''],
      actualPlaceOfDeath: [''],
      alternatePhone: [''],
      fax: [''],
      preferredTimeOfCall: [''],
      primaryEmail: [''],
      preferredEmail: [''],
      alternateEmail: [''],
    });
  }

  ngOnInit(): void {
    const selectedMemberDetailsId = Number(sessionStorage.getItem('selectedMemberDetailsId'));
    if (Number.isFinite(selectedMemberDetailsId) && selectedMemberDetailsId > 0) {
      this.loadMemberDetails(selectedMemberDetailsId);
    } else {
      // No id – still show N/A in view mode
      this.formEditValues = { ...this.detailsForm.getRawValue() };
      this.patchFormForMode();
    }
  }

  private loadMemberDetails(memberDetailsId: number): void {
    this.loading = true;
    this.dashboard.getMemberDetails(memberDetailsId).subscribe({
      next: (res) => {
        this.loading = false;
        this.memberDetails = res;
        this.applyMemberDetails(res);
      },
      error: (err) => {
        this.loading = false;
        console.error('Error fetching member details', err);
        // fallback: still show N/A
        this.formEditValues = { ...this.detailsForm.getRawValue() };
        this.patchFormForMode();
      }
    });
  }

  private applyMemberDetails(res: any): void {
    if (!res) {
      this.formEditValues = { ...this.detailsForm.getRawValue() };
      this.patchFormForMode();
      return;
    }

    // --- Nested arrays (backend may send camelCase, lowercase, or stringified JSON)
    const phoneRaw = this.sortByPreference(this.toArray(res?.memberPhoneNumbers ?? res?.memberphonenumbers));
    const addressRaw = this.sortByPreference(this.toArray(res?.memberAddresses ?? res?.memberaddresses));
    const emailRaw = this.sortByPreference(this.toArray(res?.memberEmails ?? res?.memberemails));
    const languageRaw = this.sortByPreference(this.toArray(res?.memberLanguages ?? res?.memberlanguages));

    const identifierRaw = this.toArray(res?.memberIdentifiers ?? res?.memberidentifiers);
    const impairmentRaw = this.toArray(res?.memberCommunicationImpairments ?? res?.membercommunicationimpairments);
    const evacRaw = this.toArray(res?.memberEvacuationZones ?? res?.memberevacuationzones);
    const svcRaw = this.toArray(res?.memberServiceInterruptions ?? res?.memberserviceinterruptions);

    // --- Bottom sections data
    this.phoneNumbers = phoneRaw.map(p => {
      const numRaw = this.clean(p?.phonenumber ?? p?.phoneNumber);
      const formatted = this.formatPhone(numRaw);
      return {
        type: this.clean(p?.phonetype ?? p?.phoneType ?? p?.phoneTypeName ?? p?.phoneTypeDisplayName) || this.typeLabel('phone', p?.phonetypeid ?? p?.phoneTypeId),
        number: formatted || 'N/A',
        extension: this.clean(p?.extension),
        isPrimary: this.isPrimary(p),
        isPreferred: this.isPreferred(p)
      };
    });

    this.addresses = addressRaw.map(a => {
      const lines = this.getAddressLines(a);
      return {
        type: this.clean(a?.addresstype ?? a?.addressType ?? a?.addressTypeName) || this.typeLabel('address', a?.addresstypeid ?? a?.addressTypeId),
        number: lines.length ? lines.join(', ') : 'N/A',
        lines,
        isPrimary: this.isPrimary(a),
        isPreferred: this.isPreferred(a)
      };
    });

    this.emails = emailRaw.map(e => {
      const email = this.clean(e?.emailaddress ?? e?.emailAddress);
      return {
        type: this.clean(e?.emailtype ?? e?.emailType ?? e?.emailTypeName) || this.typeLabel('email', e?.emailtypeid ?? e?.emailTypeId),
        email: email || 'N/A',
        isPrimary: this.isPrimary(e),
        isPreferred: this.isPreferred(e)
      };
    });

    this.languages = languageRaw.map(l => {
      // We only have IDs coming back in your JSON; if you have a lookup table later, map to a friendly name.
      const lang = this.clean(l?.languagename ?? l?.languageName ?? l?.languageid ?? l?.languageId);
      return {
        type: this.clean(l?.languagetype ?? l?.languageType ?? l?.languageTypeName) || this.typeLabel('language', l?.languagetypeid ?? l?.languageTypeId),
        language: lang || 'N/A',
        isPrimary: this.isPrimary(l),
        isPreferred: this.isPreferred(l)
      };
    });

    // --- Member Identifiers (right column)
    this.identifiers.memberId = this.clean(res?.memberid ?? res?.memberId) || 'N/A';
    const idVal = (id: number): string => this.clean(this.findIdentifierValue(identifierRaw, id)) || 'N/A';
    this.identifiers.subscriberId = idVal(2);
    this.identifiers.medicaidId = idVal(3);
    this.identifiers.mrn = idVal(4);
    this.identifiers.medicareId = idVal(5);
    this.identifiers.familyId = idVal(6);

    // --- Multi-value text fields
    const communicationImpairment = impairmentRaw
      .map(x => this.clean(x?.communicationimpairmentid ?? x?.communicationImpairmentId))
      .filter(Boolean)
      .join(', ');

    const evacuationZone = evacRaw
      .map(x => this.clean(x?.evacuationzoneid ?? x?.evacuationZoneId))
      .filter(Boolean)
      .join(', ');

    const serviceInterruption = svcRaw
      .map(x => this.clean(x?.facilityname ?? x?.facilityName) || this.clean(x?.serviceinterruptionid ?? x?.serviceInterruptionId))
      .filter(Boolean)
      .join(', ');

    // Primary/alternate phone & email (for existing form controls)
    const bestPhone = this.pickBestRecord(phoneRaw, (p: any) => p?.phonenumber ?? p?.phoneNumber);
    const altPhone = phoneRaw.find(p => !this.isPrimary(p)) ?? null;
    const bestEmail = this.pickBestRecord(emailRaw, (e: any) => e?.emailaddress ?? e?.emailAddress);
    const altEmail = emailRaw.find(e => !this.isPrimary(e)) ?? null;
    const primaryLang = this.pickBestRecord(languageRaw, (l: any) => l?.languageid ?? l?.languageId);

    // Preferred Name
    const preferredFirstName = this.clean(res?.preferredfirstname ?? res?.preferredFirstName);
    const preferredLastName = this.clean(res?.preferredlastname ?? res?.preferredLastName);
    const preferredFull = [preferredFirstName, preferredLastName].filter(Boolean).join(' ');

    // Spoken/Written language text (best-effort from languagetypeid)
    const getLangText = (l: any) => this.clean(l?.languagename ?? l?.languageName ?? l?.languageid ?? l?.languageId);
    const allLangText = languageRaw.map(getLangText).filter(Boolean);
    const spokenLangText = languageRaw
      .filter(l => (l?.languagetypeid ?? l?.languageTypeId) === 1)
      .map(getLangText)
      .filter(Boolean);
    const writtenLangText = languageRaw
      .filter(l => (l?.languagetypeid ?? l?.languageTypeId) === 2)
      .map(getLangText)
      .filter(Boolean);

    const preferredSpokenText = (spokenLangText.length ? spokenLangText : allLangText).join(', ');
    const preferredWrittenText = (writtenLangText.length ? writtenLangText : allLangText).join(', ');

    const editPatch: Record<string, any> = {
      prefix: this.clean(res?.prefix ?? res?.Prefix),
      firstName: this.clean(res?.firstname ?? res?.firstName ?? res?.FirstName),
      middleInitial: (this.clean(res?.middlename ?? res?.middleName ?? res?.MiddleName) || '').substring(0, 1),
      lastName: this.clean(res?.lastname ?? res?.lastName ?? res?.LastName),
      dateOfBirth: this.toDateInput(res?.birthdate ?? res?.birthDate),
      maritalStatus: this.clean(res?.maritalstatusid ?? res?.maritalStatusId),
      preferredName: preferredFull,
      gender: this.clean(res?.gender ?? res?.genderName) || this.clean(res?.genderid ?? res?.genderId),
      genderIdentity: this.clean(res?.genderidentityid ?? res?.genderIdentityId),
      sexualOrientation: this.clean(res?.sexualorientationid ?? res?.sexualOrientationId),
      veteranStatus: this.clean(res?.veteranstatusid ?? res?.veteranStatusId),
      preferredcontactformat: this.clean(res?.preferredcontactformatid ?? res?.preferredContactFormatId),
      veteranstatus: this.clean(res?.veteranstatusid ?? res?.veteranStatusId),
      race: this.clean(res?.race ?? res?.raceName) || this.clean(res?.raceid ?? res?.raceId),
      primaryLanguage: this.clean(primaryLang?.languageid ?? primaryLang?.languageId),

      preferredRace: this.clean(res?.preferredraceid ?? res?.preferredRaceId),
      prefferedWrittenLanguages: preferredWrittenText,
      ethincity: this.clean(res?.ethnicityid ?? res?.ethnicityId),
      prefferedSpokeLanguages: preferredSpokenText,
      communicationImpairment: communicationImpairment,
      preferredEthincity: this.clean(res?.preferredethnicityid ?? res?.preferredEthnicityId),
      residenceStatus: this.clean(res?.residencestatusid ?? res?.residenceStatusId),
      evacuationZone: evacuationZone,
      incomeStatus: this.clean(res?.incomestatusid ?? res?.incomeStatusId),
      serviceInterruption: serviceInterruption,
      dateOfDeath: this.toDateInput(res?.deathdate ?? res?.deathDate),
      causeOfDeath: this.clean(res?.causeofdeathid ?? res?.causeOfDeathId),
      actualPlaceOfDeath: this.clean(res?.actualplaceofdeathid ?? res?.actualPlaceOfDeathId),
      alternatePhone: this.formatPhone(this.clean(altPhone?.phonenumber ?? altPhone?.phoneNumber)),
      fax: this.clean(res?.fax),
      preferredTimeOfCall: this.clean(res?.preferredtimeofcallid ?? res?.preferredTimeOfCallId),
      primaryEmail: this.clean(bestEmail?.emailaddress ?? bestEmail?.emailAddress),
      preferredEmail: this.clean(bestEmail?.emailaddress ?? bestEmail?.emailAddress),
      alternateEmail: this.clean(altEmail?.emailaddress ?? altEmail?.emailAddress),
    };

    // Store edit values, then patch UI depending on mode
    this.formEditValues = { ...this.detailsForm.getRawValue(), ...editPatch };
    this.patchFormForMode();
  }

  toggleEditMode(): void {
    if (this.editMode) {
      // Leaving edit mode (save)
      const payload = this.stripNA(this.detailsForm.getRawValue());
      console.log(payload);
      this.formEditValues = { ...this.formEditValues, ...payload };
    }
    this.editMode = !this.editMode;
    this.patchFormForMode();
  }

  toggleEditModeMemberIdentifier(): void {
    if (this.editModeMI) {
      console.log(this.identifiers);
    }
    this.editModeMI = !this.editModeMI;
  }

  onEdit(section: string) {
    console.log(`Edit button clicked for ${section}`);
  }

  // -------------------------
  // N/A Display behavior
  // -------------------------
  private patchFormForMode(): void {
    const patch: any = {};
    const keys = Object.keys(this.detailsForm.controls);

    for (const k of keys) {
      const raw = this.formEditValues?.[k];
      const cleaned = this.clean(raw);
      patch[k] = this.editMode ? cleaned : (cleaned ? cleaned : 'N/A');
    }

    this.detailsForm.patchValue(patch, { emitEvent: false });
  }

  private stripNA(values: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    Object.keys(values || {}).forEach(k => {
      const v = values[k];
      out[k] = (typeof v === 'string' && v.trim().toUpperCase() === 'N/A') ? '' : v;
    });
    return out;
  }

  // -------------------------
  // Helpers
  // -------------------------
  private toArray(value: any): any[] {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  private isTruthy(item: any, keys: string[]): boolean {
    return keys.some(k => item?.[k] === true);
  }

  isPrimary(item: any): boolean {
    return this.isTruthy(item, ['isprimary', 'isPrimary']);
  }

  isPreferred(item: any): boolean {
    return this.isTruthy(item, ['ispreferred', 'isPreferred']);
  }

  private sortByPreference<T = any>(items: T[]): T[] {
    return [...(items ?? [])].sort((a: any, b: any) => {
      const a1 = this.isPrimary(a) ? 1 : 0;
      const b1 = this.isPrimary(b) ? 1 : 0;
      if (a1 !== b1) return b1 - a1;

      const ap = this.isPreferred(a) ? 1 : 0;
      const bp = this.isPreferred(b) ? 1 : 0;
      return bp - ap;
    });
  }

  private clean(value: any): string {
    if (value === null || value === undefined) return '';
    const s = String(value).trim();
    if (!s) return '';
    if (s.toUpperCase() === 'NULL') return '';
    return s;
  }

  private toDateInput(value: any): string {
    const s = this.clean(value);
    if (!s) return '';
    const isoMatch = s.match(/^\d{4}-\d{2}-\d{2}/);
    if (isoMatch) return isoMatch[0];
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  formatPhone(phone?: string): string {
    const digits = (phone ?? '').replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return phone ?? '';
  }

  getAddressLines(address: any): string[] {
    if (!address) return [];

    const l1 = this.clean(address.addressline1 ?? address.addressLine1);
    const l2 = this.clean(address.addressline2 ?? address.addressLine2);
    const l3 = this.clean(address.addressline3 ?? address.addressLine3);
    const city = this.clean(address.city);
    const zip = this.clean(address.zipcode ?? address.zipCode);
    const country = this.clean(address.country);

    const lines: string[] = [];
    if (l1) lines.push(l1);
    if (l2) lines.push(l2);
    if (l3) lines.push(l3);

    const lastLine = [city, zip].filter(Boolean).join(' ');
    if (lastLine) lines.push(lastLine);
    if (country) lines.push(country);

    return lines;
  }

  /**
   * Pick the record to show when you need a single value:
   * - Prefer Primary
   * - Fall back to Preferred
   * - Fall back to first with value
   */
  private pickBestRecord<T = any>(items: T[], valueSelector?: (item: T) => any): T | null {
    const list = this.toArray(items);
    if (!list.length) return null;

    const hasValue = (item: T): boolean => {
      if (!valueSelector) return true;
      const raw = valueSelector(item);
      if (raw === null || raw === undefined) return false;
      if (typeof raw === 'string') return this.clean(raw).length > 0;
      return true;
    };

    const primaryWithValue = list.find(x => this.isPrimary(x) && hasValue(x));
    if (primaryWithValue) return primaryWithValue;

    const preferredWithValue = list.find(x => this.isPreferred(x) && hasValue(x));
    if (preferredWithValue) return preferredWithValue;

    const firstWithValue = list.find(hasValue);
    if (firstWithValue) return firstWithValue;

    const primary = list.find(x => this.isPrimary(x));
    if (primary) return primary;

    return list[0];
  }

  private findIdentifierValue(items: any[], identifierId: number): any {
    const row = (items ?? []).find(x => (x?.identifierid ?? x?.identifierId) === identifierId);
    return row?.identifiervalue ?? row?.identifierValue;
  }

  private typeLabel(kind: 'phone' | 'address' | 'email' | 'language', id: any): string {
    const s = this.clean(id);
    if (!s) return 'N/A';
    // Avoid guessing mappings. Show a consistent label.
    switch (kind) {
      case 'phone': return `Type ${s}`;
      case 'address': return `Type ${s}`;
      case 'email': return `Type ${s}`;
      case 'language': return `Type ${s}`;
      default: return `Type ${s}`;
    }
  }
}
