import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';

import { Observable, of } from 'rxjs';
import { map, tap, shareReplay, catchError } from 'rxjs/operators';

import { CrudService } from 'src/app/service/crud.service';
import { AuthService } from 'src/app/service/auth.service';
import { MemberenrollmentService } from 'src/app/service/memberenrollment.service';

import { SmartCheckResultDialogComponent, SmartCheckDialogAction, SmartCheckDialogData } from './smartcheck-result-dialog.component';
import { RulesengineService, ExecuteTriggerResponse } from 'src/app/service/rulesengine.service'; // adjust path if needed


interface MemberEnrollment {
  Account_PCP?: string;
  Account_Plan?: string;
  Account_Plan_ID?: string;
  Account_Status?: string;
  Coverage_Type?: string;
  Coverage_End_Date?: string;
  Coverage_Effective_Date?: string;
  Coverage_Network?: string;
  Coverage_Payer?: string;
  Coverage_Program?: string;
  Coverage_Status?: string;
}

type CodeOption = { code: string; desc: string; codeDesc?: string };

@Component({
  selector: 'app-authsmartcheck',
  templateUrl: './authsmartcheck.component.html',
  styleUrls: ['./authsmartcheck.component.css'],
})
export class AuthsmartcheckComponent implements OnInit {
  smartAuthCheckForm!: FormGroup;
  authClassOptions: Array<{ value: number; label: string }> = [];
  authTypeOptions: Array<{ value: number; label: string }> = [];

  selectedAuthClassId = 0;
  selectedAuthTypeId = 0;

  // Enrollment cards
  memberEnrollments: MemberEnrollment[] = [];
  selectedDiv = 0;
  selectedEnrollment: MemberEnrollment | null = null;

  // Dropdowns (uismartdropdown)
  authClass: any[] = [];
  authTemplates: any[] = [];

  // Autocomplete data
  allIcdCodes: CodeOption[] = [];
  allServiceCodes: CodeOption[] = [];


  // ui-smart-lookup configs (mirrors AuthDetails' 'search' fields)
  icdLookupField = {
    controlName: 'icd10',
    lookup: {
      placeholder: 'Type ICD-10 (code or description)',
      minChars: 1,
      debounceMs: 200,
      limit: 25,
      entity: 'icd'
    }
  };

  serviceLookupField = {
    controlName: 'serviceCode',
    lookup: {
      placeholder: 'Type Service Code (code or description)',
      minChars: 1,
      debounceMs: 200,
      limit: 25,
      entity: 'medicalcodes'
    }
  };



  // cache stable function references (prevents ui-smart-lookup from reinitializing on every change detection)
  private lookupSearchFnCache = new Map<string, (q: string, limit: number) => Observable<any[]>>();
  private lookupDisplayWithCache = new Map<string, (item: any) => string>();
  private lookupTrackByCache = new Map<string, (item: any) => any>();

  private codesetsLoaded$!: Observable<void>;
  // Date text boxes (D / D+1 / D-1)
  scheduledDateText = '';
  dueDateText = '';

  @ViewChild('scheduledPicker') scheduledPicker!: ElementRef<HTMLInputElement>;
  @ViewChild('duePicker') duePicker!: ElementRef<HTMLInputElement>;

  // Resolve memberDetailsId from route (adjust param name to your routing)
  memberDetailsId = 0;

  // Decision table endpoint (move to environment later)
  private readonly decisionTableUrl =
    'https://carenirvanabre-b2ananexbwedbfes.eastus2.azurecontainerapps.io/api/DecisionTable/rundecision?decisionTableName=PayorCatalogueSpec';

  constructor(
    private fb: FormBuilder,
    private crudService: CrudService,
    private authService: AuthService,
    private memberEnrollmentService: MemberenrollmentService,
    private http: HttpClient,
    private dialog: MatDialog,
    private router: Router,
    private route: ActivatedRoute,
    private rulesengineService: RulesengineService
  ) { }

  ngOnInit(): void {


    const idFromRoute =
      Number(this.route.snapshot.paramMap.get('memberdetailsid')) ||
      Number(this.route.snapshot.paramMap.get('memberDetailsId')) ||
      Number(this.route.snapshot.queryParamMap.get('memberdetailsid')) ||
      Number(this.route.snapshot.queryParamMap.get('memberDetailsId')) ||
      0;

    this.memberDetailsId = idFromRoute;
    if (this.memberDetailsId <= 0) {
      this.memberDetailsId = Number(sessionStorage.getItem('selectedMemberDetailsId'));
    }
    this.buildForm();
    this.loadMemberEnrollment();
    this.loadAuthClass();

    // When Auth Case changes → load Auth Types
    this.smartAuthCheckForm.get('authClassId')?.valueChanges.subscribe((authClassId: number) => {
      this.smartAuthCheckForm.get('authTypeId')?.setValue(0);
      this.authTemplates = [{ Id: 0, TemplateName: 'Select Auth Type' }];
      if (authClassId && authClassId > 0) {
        this.loadAuthTemplates(authClassId);
      }
    });
  }

  private buildForm(): void {
    this.smartAuthCheckForm = this.fb.group({
      authClassId: [0, Validators.required],
      authTypeId: [0, Validators.required],

      scheduledDateTime: ['', Validators.required],
      dueDateTime: ['', Validators.required],

      icds: this.fb.array([this.createIcdRow()]),
      services: this.fb.array([this.createServiceRow()]),
    });
  }

  // --- Form arrays ---
  get icds(): FormArray {
    return this.smartAuthCheckForm.get('icds') as FormArray;
  }

  get services(): FormArray {
    return this.smartAuthCheckForm.get('services') as FormArray;
  }

  private createIcdRow(): FormGroup {
    return this.fb.group({
      icd10: [''],
      icd10Desc: [''],
    });
  }

  private createServiceRow(): FormGroup {
    return this.fb.group({
      serviceCode: [''],
      serviceDesc: [''],
    });
  }
  addIcdRow(): void {
    this.icds.push(this.createIcdRow());
  }
  removeIcdRow(i: number): void {
    if (this.icds.length === 1) return;
    this.icds.removeAt(i);
  }
  addServiceRow(): void {
    this.services.push(this.createServiceRow());
  }
  removeServiceRow(i: number): void {
    if (this.services.length === 1) return;
    this.services.removeAt(i);
  }

  // --- Enrollment ---
  loadMemberEnrollment(): void {
    console.log('Loading member enrollments for memberDetailsId:', this.memberDetailsId);
    if (!this.memberDetailsId) return;

    this.memberEnrollmentService.getMemberEnrollment(this.memberDetailsId).subscribe({
      next: (data: MemberEnrollment[]) => {
        this.memberEnrollments = data || [];
        console.log('Loaded member enrollments:', this.memberEnrollments);
        if (this.memberEnrollments.length > 0) {
          this.selectEnrollment(0);
        }
      },
      error: (err: any) => console.error('Error fetching member enrollments:', err),
    });
  }

  selectEnrollment(index: number): void {
    this.selectedDiv = index + 1;
    this.selectedEnrollment = this.memberEnrollments[index] ?? null;

    // Keep member context consistent across steps (Auth Details reads selectedMemberDetailsId)
    const mdId = Number(this.memberDetailsId || 0);
    if (mdId > 0) {
      try { sessionStorage.setItem('selectedMemberDetailsId', String(mdId)); } catch { /* ignore */ }
    }
  }

  getEnrollmentDisplayPairs(enr: any): { label: string; value: string }[] {
    const pairs: { label: string; value: string }[] = [];

    const maybeAdd = (label: string, value: any) => {
      const v = value === undefined || value === null ? '' : String(value).trim();
      if (v) pairs.push({ label, value: v });
    };

    const safeParse = <T>(v: any): T | null => {
      try {
        if (v == null) return null;
        return typeof v === 'string' ? (JSON.parse(v) as T) : (v as T);
      } catch {
        return null;
      }
    };

    // ---- NEW API SHAPE (your pasted response) ----
    const levelMap = safeParse<Record<string, string>>(enr.levelMap) ?? {};
    const levels = safeParse<any[]>(enr.levels) ?? [];

    const getLevel = (code: string) =>
      levels.find(x => (x.levelcode ?? x.levelCode) === code)?.level_value_name ??
      levels.find(x => (x.levelcode ?? x.levelCode) === code)?.levelValueName ??
      levelMap[code] ??
      '';

    // If your new response exists, prefer it
    if (enr.hierarchyPath || enr.levels || enr.levelMap) {
      maybeAdd('LOB', getLevel('LOB'));
      maybeAdd('Account', getLevel('ACCOUNT'));
      maybeAdd('Product', getLevel('PRODUCT'));
      maybeAdd('Benefit Plan', getLevel('BENEFITPLAN'));

      maybeAdd('Start', enr.startDate);
      maybeAdd('End', enr.endDate);
      maybeAdd('Active', enr.status === true ? 'Yes' : 'No');
      /*maybeAdd('Path', enr.hierarchyPath);*/

      return pairs;
    }

    // ---- OLD API SHAPE (what your TS currently expects) ----
    maybeAdd('Coverage Type', enr.Coverage_Type);
    maybeAdd('Plan', enr.Account_Plan);
    maybeAdd('Plan ID', enr.Account_Plan_ID);
    maybeAdd('Program', enr.Coverage_Program);
    maybeAdd('Payer', enr.Coverage_Payer);
    maybeAdd('Network', enr.Coverage_Network);
    maybeAdd('Status', enr.Coverage_Status);
    maybeAdd('Effective', enr.Coverage_Effective_Date);
    maybeAdd('End', enr.Coverage_End_Date);
    maybeAdd('PCP', enr.Account_PCP);

    return pairs;
  }


  // --- Dropdown data ---
  loadAuthClass(): void {
    this.crudService.getData('um', 'authclass').subscribe({
      next: (data: any[]) => {
        this.authClass = data || [];
        console.log('Loaded auth classes:', this.authClass);
        this.buildAuthClassOptions();
      },
      error: (err: any) => console.error('Error loading auth class:', err),
    });
  }

  private loadAuthTemplates(authClassId: number): void {
    this.authService.getTemplates('UM', authClassId).subscribe({
      next: (data: any[]) => {
        this.authTemplates = [{ Id: 0, TemplateName: 'Select Auth Type' }, ...(data || [])];
        console.log('Loaded auth templates:', this.authTemplates);
        this.buildAuthTypeOptions();
      },
      error: (err: any) => console.error('Error loading auth templates:', err),
    });
  }

  private buildAuthClassOptions(): void {
    this.authClassOptions = (this.authClass ?? []).map((x: any) => ({
      value: Number(x.id),
      label: x.authClass
    }));
  }

  // call this after you load templates for a class id
  private buildAuthTypeOptions(): void {
    this.authTypeOptions = (this.authTemplates ?? []).map((x: any) => ({
      value: Number(x.Id ?? x.id),
      label: x.TemplateName ?? x.templateName
    }));
  }

  // Warm-up load for both ICD + Service codesets (same getAllCodesets('ICD') contract used in AuthDetails)
  loadCodesForField(): void {
    this.ensureCodesetsLoaded().subscribe();
  }

  private ensureCodesetsLoaded(): Observable<void> {
    if (this.codesetsLoaded$) return this.codesetsLoaded$;

    const svc: any = this.authService as any;
    if (typeof svc.getAllCodesets !== 'function') {
      this.codesetsLoaded$ = of(void 0).pipe(shareReplay(1));
      return this.codesetsLoaded$;
    }

    this.codesetsLoaded$ = svc.getAllCodesets('ICD').pipe(
      tap((resp: any) => {
        const icdSrc =
          resp?.icd10Codes ||
          resp?.icd ||
          resp?.icd10 ||
          (Array.isArray(resp) ? resp : []);

        const svcSrc =
          resp?.serviceCodes ||
          resp?.cpt ||
          resp?.medicalCodes ||
          resp?.service ||
          [];

        this.allIcdCodes = (icdSrc || [])
          .map((x: any) => {
            const code = x?.code ?? x?.Code ?? x?.icdcode ?? x?.icdCode ?? '';
            const desc = x?.codeDesc ?? x?.codedescription ?? x?.Description ?? x?.description ?? x?.desc ?? '';
            const sCode = String(code ?? '').trim();
            const sDesc = String(desc ?? '').trim();
            return { code: sCode, desc: sDesc, codeDesc: sDesc } as CodeOption;
          })
          .filter((x: CodeOption) => !!x.code);

        this.allServiceCodes = (svcSrc || [])
          .map((x: any) => {
            const code = x?.code ?? x?.Code ?? x?.cptcode ?? x?.cptCode ?? x?.serviceCode ?? '';
            const desc = x?.codeDesc ?? x?.codedescription ?? x?.Description ?? x?.description ?? x?.desc ?? '';
            const sCode = String(code ?? '').trim();
            const sDesc = String(desc ?? '').trim();
            return { code: sCode, desc: sDesc, codeDesc: sDesc } as CodeOption;
          })
          .filter((x: CodeOption) => !!x.code);

        // Helpful when debugging "no options" issues
        // console.log('[AuthSmartCheck] codesets loaded', { icd: this.allIcdCodes.length, service: this.allServiceCodes.length });
      }),
      map(() => void 0),
      catchError((err: any) => {
        console.error('[AuthSmartCheck] getAllCodesets failed', err);
        this.allIcdCodes = [];
        this.allServiceCodes = [];
        return of(void 0);
      }),
      shareReplay(1)
    );

    return this.codesetsLoaded$;
  }

  private filterCodes(options: CodeOption[], q: string, limit: number): CodeOption[] {
    const term = String(q ?? '').trim().toLowerCase();
    const lim = Number.isFinite(Number(limit)) ? Number(limit) : 25;

    if (!term) return (options || []).slice(0, lim);

    return (options || [])
      .filter(o => {
        const code = String(o?.code ?? '').toLowerCase();
        const desc = String(o?.codeDesc ?? o?.desc ?? '').toLowerCase();
        return code.includes(term) || desc.includes(term);
      })
      .slice(0, lim);
  }


  private searchIcdCodes(q: string, limit: number): Observable<CodeOption[]> {
    const svc: any = this.authService as any;

    // Prefer server-side ICD search when available (matches AuthDetails)
    if (typeof svc.searchIcd === 'function') {
      return svc.searchIcd(q, limit).pipe(
        map((resp: any) => {
          const items =
            (Array.isArray(resp) ? resp : null) ??
            resp?.items ??
            resp?.results ??
            resp?.data ??
            resp?.icd10Codes ??
            resp?.icdCodes ??
            resp?.icd ??
            [];

          return (items || [])
            .map((x: any) => this.mapAnyToCodeOption(x))
            .filter((x: CodeOption) => !!x.code)
            .slice(0, limit);
        }),
        catchError((err: any) => {
          console.error('[AuthSmartCheck] searchIcd failed', err);
          return this.searchLocalIcd(q, limit);
        })
      );
    }

    // Fallback to locally-loaded codeset list
    return this.searchLocalIcd(q, limit);
  }

  private searchLocalIcd(q: string, limit: number): Observable<CodeOption[]> {
    return this.ensureCodesetsLoaded().pipe(map(() => this.filterCodes(this.allIcdCodes, q, limit)));
  }

  private mapAnyToCodeOption(x: any): CodeOption {
    if (!x) return { code: '', desc: '' };
    if (typeof x === 'string') return { code: x, desc: '' };

    const code =
      x?.code ??
      x?.Code ??
      x?.cptcode ??
      x?.cptCode ??
      x?.servicecode ??
      x?.serviceCode ??
      x?.procedureCode ??
      x?.medicalCode ??
      '';

    const desc =
      x?.codeDesc ??
      x?.codedescription ??
      x?.Description ??
      x?.description ??
      x?.desc ??
      '';

    const sCode = String(code ?? '').trim();
    const sDesc = String(desc ?? '').trim();
    return { code: sCode, desc: sDesc, codeDesc: sDesc };
  }

  private searchServiceCodes(q: string, limit: number): Observable<CodeOption[]> {
    const svc: any = this.authService as any;

    // Prefer AuthDetails' server-side search for procedure/medical codes when available
    if (typeof svc.searchMedicalCodes === 'function') {
      return svc.searchMedicalCodes(q, limit).pipe(
        map((resp: any) => {
          const items =
            (Array.isArray(resp) ? resp : null) ??
            resp?.items ??
            resp?.results ??
            resp?.data ??
            resp?.medicalCodes ??
            resp?.serviceCodes ??
            resp?.cptCodes ??
            resp?.cpt ??
            [];

          return (items || [])
            .map((x: any) => this.mapAnyToCodeOption(x))
            .filter((x: CodeOption) => !!x.code)
            .slice(0, limit);
        }),
        catchError((err: any) => {
          console.error('[AuthSmartCheck] searchMedicalCodes failed', err);
          return of([] as CodeOption[]);
        })
      );
    }

    // Fallback to locally-loaded codeset list (if your API returns service codes in getAllCodesets)
    return this.ensureCodesetsLoaded().pipe(map(() => this.filterCodes(this.allServiceCodes, q, limit)));
  }


  // ---- ui-smart-lookup helpers (same binding shape as AuthDetails) ----
  private getLookupCfg(f: any): any {
    return f?.lookup ?? f?.lookupCfg ?? {};
  }

  getLookupPlaceholder(f: any): string {
    const cfg = this.getLookupCfg(f);
    return (cfg?.placeholder || 'Search...')?.toString();
  }

  getLookupMinChars(f: any): number {
    const cfg = this.getLookupCfg(f);
    const n = Number(cfg?.minChars ?? 1);
    return Number.isFinite(n) ? n : 1;
  }

  getLookupDebounceMs(f: any): number {
    const cfg = this.getLookupCfg(f);
    const n = Number(cfg?.debounceMs ?? 200);
    return Number.isFinite(n) ? n : 200;
  }

  getLookupLimit(f: any): number {
    const cfg = this.getLookupCfg(f);
    const n = Number(cfg?.limit ?? 25);
    return Number.isFinite(n) ? n : 25;
  }

  getLookupSearchFn(f: any): (q: string, limit: number) => Observable<any[]> {
    const cfg = this.getLookupCfg(f);
    const entity = String(cfg?.entity ?? '');
    const key = `${entity}`;

    const existing = this.lookupSearchFnCache.get(key);
    if (existing) return existing;

    const fn = (q: string, limit: number): Observable<any[]> => {
      if (!q) return of([] as any[]);

      switch (entity) {
        case 'icd':
          return this.searchIcdCodes(q, limit);
        case 'medicalcodes':
          return this.searchServiceCodes(q, limit);
        default:
          return of([] as any[]);
      }
    };

    this.lookupSearchFnCache.set(key, fn);
    return fn;
  }


  getLookupDisplayWith(_f: any): (item: any) => string {
    const key = 'default';
    const existing = this.lookupDisplayWithCache.get(key);
    if (existing) return existing;

    const fn = (item: any): string => {
      if (!item) return '';
      if (typeof item === 'string') return item;
      const code = String(item?.code ?? '').trim();
      const desc = String(item?.desc ?? item?.codeDesc ?? '').trim();
      return desc ? `${code} - ${desc}` : code;
    };

    this.lookupDisplayWithCache.set(key, fn);
    return fn;
  }

  getLookupTrackBy(_f: any): (item: any) => any {
    const key = 'default';
    const existing = this.lookupTrackByCache.get(key);
    if (existing) return existing;

    const fn = (item: any): any => {
      if (!item) return item;
      if (typeof item !== 'object') return item;
      return item.code ?? item.id ?? item.value ?? item;
    };

    this.lookupTrackByCache.set(key, fn);
    return fn;
  }

  displayCode = (opt: any): string => {
    if (!opt) return '';
    if (typeof opt === 'string') return opt;
    return opt.code ?? '';
  };

  onCptSelected(i: number, opt: CodeOption): void {
    const g = this.icds.at(i) as FormGroup;
    g.patchValue({ icd10: opt.code, icd10Desc: opt.desc }, { emitEvent: false });
  }

  onServiceSelected(i: number, opt: CodeOption): void {
    const g = this.services.at(i) as FormGroup;
    g.patchValue({ serviceCode: opt.code, serviceDesc: opt.desc }, { emitEvent: false });
  }


  // ui-smart-lookup event handlers (keep description controls in sync)
  onIcdLookupSelected(i: number, item: any): void {
    const opt = this.mapAnyToCodeOption(item);
    const g = this.icds.at(i) as FormGroup;
    g.patchValue({ icd10: opt.code, icd10Desc: opt.desc }, { emitEvent: false });
    g.get('icd10')?.markAsDirty();
  }

  onIcdLookupTextChange(i: number, text: string): void {
    const v = (text ?? '').toString();
    const g = this.icds.at(i) as FormGroup;

    if (!v) {
      g.patchValue({ icd10Desc: '' }, { emitEvent: false });
      return;
    }

    // If user starts typing after selection, clear the description so it can't mismatch
    const currentCode = g.get('icd10')?.value;
    const currentCodeStr = typeof currentCode === 'string' ? currentCode : (currentCode?.code ?? '');
    if (currentCodeStr && currentCodeStr !== v) {
      g.patchValue({ icd10Desc: '' }, { emitEvent: false });
    }
  }

  onIcdLookupCleared(i: number): void {
    const g = this.icds.at(i) as FormGroup;
    g.patchValue({ icd10: null, icd10Desc: '' }, { emitEvent: false });
    g.get('icd10')?.markAsDirty();
  }

  onServiceLookupSelected(i: number, item: any): void {
    const opt = this.mapAnyToCodeOption(item);
    const g = this.services.at(i) as FormGroup;
    g.patchValue({ serviceCode: opt.code, serviceDesc: opt.desc }, { emitEvent: false });
    g.get('serviceCode')?.markAsDirty();
  }

  onServiceLookupTextChange(i: number, text: string): void {
    const v = (text ?? '').toString();
    const g = this.services.at(i) as FormGroup;

    if (!v) {
      g.patchValue({ serviceDesc: '' }, { emitEvent: false });
      return;
    }

    const currentCode = g.get('serviceCode')?.value;
    const currentCodeStr = typeof currentCode === 'string' ? currentCode : (currentCode?.code ?? '');
    if (currentCodeStr && currentCodeStr !== v) {
      g.patchValue({ serviceDesc: '' }, { emitEvent: false });
    }
  }

  onServiceLookupCleared(i: number): void {
    const g = this.services.at(i) as FormGroup;
    g.patchValue({ serviceCode: null, serviceDesc: '' }, { emitEvent: false });
    g.get('serviceCode')?.markAsDirty();
  }

  // --- Date parsing (D / D+1 / D-1) ---
  onScheduledTextChange(ev: Event): void {
    const v = (ev.target as HTMLInputElement).value;
    this.scheduledDateText = v;
  }

  onDueTextChange(ev: Event): void {
    const v = (ev.target as HTMLInputElement).value;
    this.dueDateText = v;
  }

  handleDateTimeBlur(textProp: 'scheduledDateText' | 'dueDateText', controlName: 'scheduledDateTime' | 'dueDateTime'): void {
    const text = (this as any)[textProp] as string;
    const parsed = this.parseRelativeDateText(text);
    if (parsed) {
      this.smartAuthCheckForm.get(controlName)?.setValue(parsed.toISOString());
      this.smartAuthCheckForm.get(controlName)?.markAsTouched();
    } else if (text?.trim()) {
      // keep entered text but mark invalid by touching
      this.smartAuthCheckForm.get(controlName)?.markAsTouched();
    }
  }

  private parseRelativeDateText(input: string): Date | null {
    if (!input) return null;
    const t = input.trim().toUpperCase();

    // Accept ISO-ish input too
    const asDate = new Date(input);
    if (!Number.isNaN(asDate.getTime()) && /[-/T:]/.test(input)) return asDate;

    // D, D+1, D-1
    if (t === 'D') return new Date();
    const m = t.match(/^D\s*([+-])\s*(\d+)$/);
    if (!m) return null;

    const sign = m[1];
    const days = Number(m[2]);
    if (Number.isNaN(days)) return null;

    const d = new Date();
    d.setDate(d.getDate() + (sign === '+' ? days : -days));
    return d;
  }

  triggerCalendar(which: 'scheduled' | 'due'): void {
    if (which === 'scheduled') this.scheduledPicker?.nativeElement?.click();
    if (which === 'due') this.duePicker?.nativeElement?.click();
  }

  handleCalendarChange(ev: Event, controlName: 'scheduledDateTime' | 'dueDateTime'): void {
    const v = (ev.target as HTMLInputElement).value;
    if (!v) return;

    const d = new Date(v);
    this.smartAuthCheckForm.get(controlName)?.setValue(d.toISOString());
    this.smartAuthCheckForm.get(controlName)?.markAsTouched();

    if (controlName === 'scheduledDateTime') this.scheduledDateText = v;
    if (controlName === 'dueDateTime') this.dueDateText = v;
  }


  private openSmartCheckDialog(data: SmartCheckDialogData, width: string = '600px') {
    return this.dialog.open(SmartCheckResultDialogComponent, {
      width,
      panelClass: 'smartcheck-dialog-panel',
      data,
      disableClose: true,
    });
  }

  // --- Navigation / Decision ---
  // --- Navigation / Decision ---

  // --- Navigation / Decision ---
  onNextContinue(): void {

    // validate required UI pieces
    if (!this.selectedEnrollment) {
      this.openSmartCheckDialog(
        {
          title: 'Coverage context required',
          tone: 'info',
          message: 'Please select a coverage/LOB card before continuing.',
          primaryText: 'OK',
          showSecondary: false,
        },
        '520px'
      );
      return;
    }

    if (this.smartAuthCheckForm.invalid) {
      this.smartAuthCheckForm.markAllAsTouched();
      return;
    }

    // --- 1) SMART_AUTH_CHECK ---
    const triggerKeySmart = 'SMART_AUTH_CHECK.BUTTON_CLICK';

    const serviceCode = this.getFirstServiceCode() || 'A9600';

    // Prefer form values when available; keep current defaults so existing rules keep matching.
    const fromDate = this.toMdyOrFallback(this.smartAuthCheckForm.get('scheduledDateTime')?.value, '1/1/2026');
    const toDate = this.toMdyOrFallback(this.smartAuthCheckForm.get('dueDateTime')?.value, '1/1/2027');
    console.log('Running SMART_AUTH_CHECK with:', { serviceCode, fromDate, toDate });
    const smartFacts: any = {
      serviceCode,
      procedure: {
        fromDate,
        toDate
      }
    };

    this.rulesengineService.executeTrigger(triggerKeySmart, smartFacts).subscribe({
      next: (res: ExecuteTriggerResponse) => {
        console.log('SMART_AUTH_CHECK response:', res);

        const outputs: Record<string, any> = (res as any)?.outputs ?? {};

        // Store outputs for the next step if the user chooses to continue
        try {
          sessionStorage.setItem('SMART_AUTH_CHECK_OUTPUTS', JSON.stringify(outputs));
          sessionStorage.setItem('SMART_AUTH_CHECK_MATCHED', JSON.stringify(!!(res as any)?.matched));
          sessionStorage.setItem('SMART_AUTH_CHECK_STATUS', String((res as any)?.status ?? ''));
        } catch { /* ignore */ }

        const authRequiredRaw =
          this.getOutput(outputs, 'dt.result.AuthRequired') ||
          this.getOutput(outputs, 'result1'); // backward-compat fallback
        const authApproveRaw =
          this.getOutput(outputs, 'dt.result.AuthApprove') ||
          this.getOutput(outputs, 'result2');
        const generateLetterRaw =
          this.getOutput(outputs, 'dt.result.GenerateLetter') ||
          this.getOutput(outputs, 'result3');

        const matched = !!(res as any)?.matched && String((res as any)?.status ?? '').toUpperCase() !== 'NO_MATCH';
        const isAuthRequired = this.isYes(authRequiredRaw);

        // NO_MATCH (or unmatched): allow user to continue manually or stay
        if (!matched) {
          const details = [
            { label: 'Service Code', value: serviceCode || '—' },
            { label: 'From Date', value: fromDate || '—' },
            { label: 'To Date', value: toDate || '—' },
            { label: 'Auth Required', value: (this.getOutput(outputs, 'dt.result.AuthRequired') || this.getOutput(outputs, 'result1') || '—') },
            { label: 'Auth Approve', value: (this.getOutput(outputs, 'dt.result.AuthApprove') || this.getOutput(outputs, 'result2') || '—') },
            { label: 'Generate Letter', value: (this.getOutput(outputs, 'dt.result.GenerateLetter') || this.getOutput(outputs, 'result3') || '—') },
          ];

          const ref = this.openSmartCheckDialog(
            {
              title: 'Smart Auth Check: No Match',
              tone: 'info',
              message: `No matching Smart Auth Check rule was found for the selected inputs.

You can stay on this step, or continue to Authorization Details and proceed manually.`,
              details,
              primaryText: 'Continue to Authorization Details',
              secondaryText: 'Stay on Smart Check',
            },
            '560px'
          );

          ref.afterClosed().subscribe((action: SmartCheckDialogAction) => {
            if (action === 'primary') this.runDueDateThenProceed();
          });

          return;
        }

        // Matched: show message based on AuthRequired
        if (isAuthRequired) {
          const details = [
            { label: 'Service Code', value: serviceCode || '—' },
            { label: 'From Date', value: fromDate || '—' },
            { label: 'To Date', value: toDate || '—' },
            { label: 'Auth Required', value: (this.getOutput(outputs, 'dt.result.AuthRequired') || this.getOutput(outputs, 'result1') || '—') },
            { label: 'Auth Approve', value: (this.getOutput(outputs, 'dt.result.AuthApprove') || this.getOutput(outputs, 'result2') || '—') },
            { label: 'Generate Letter', value: (this.getOutput(outputs, 'dt.result.GenerateLetter') || this.getOutput(outputs, 'result3') || '—') },
          ];

          const ref = this.openSmartCheckDialog(
            {
              title: 'Authorization Required',
              tone: 'warning',
              message: `Authorization is required for the selected service code(s) and date range.

Would you like to continue to Authorization Details now?`,
              details,
              primaryText: 'Continue to Authorization Details',
              secondaryText: 'Stay on Smart Check',
            },
            '560px'
          );

          ref.afterClosed().subscribe((action: SmartCheckDialogAction) => {
            if (action === 'primary') this.runDueDateThenProceed();
          });
        } else {
          const details = [
            { label: 'Service Code', value: serviceCode || '—' },
            { label: 'From Date', value: fromDate || '—' },
            { label: 'To Date', value: toDate || '—' },
            { label: 'Auth Required', value: (this.getOutput(outputs, 'dt.result.AuthRequired') || this.getOutput(outputs, 'result1') || '—') },
            { label: 'Auth Approve', value: (this.getOutput(outputs, 'dt.result.AuthApprove') || this.getOutput(outputs, 'result2') || '—') },
            { label: 'Generate Letter', value: (this.getOutput(outputs, 'dt.result.GenerateLetter') || this.getOutput(outputs, 'result3') || '—') },
          ];

          const ref = this.openSmartCheckDialog(
            {
              title: 'Authorization Not Required',
              tone: 'info',
              message: `Authorization is not required for the selected service code(s) and date range.

Would you like to stay on this step, or add authorization details anyway?`,
              details,
              primaryText: 'Add Authorization Details',
              secondaryText: 'Stay on Smart Check',
            },
            '600px'
          );

          ref.afterClosed().subscribe((action: SmartCheckDialogAction) => {
            if (action === 'primary') this.runDueDateThenProceed();
          });
        }
      },
      error: (e) => {
        console.error('SMART_AUTH_CHECK trigger failed', e);

        const details = [
          { label: 'Service Code', value: serviceCode || '—' },
          { label: 'From Date', value: fromDate || '—' },
          { label: 'To Date', value: toDate || '—' },
        ];

        const ref = this.openSmartCheckDialog(
          {
            title: 'Smart Auth Check Unavailable',
            tone: 'error',
            message: `Smart Auth Check could not be completed at this time.

Would you like to continue to Authorization Details?`,
            details,
            primaryText: 'Continue to Authorization Details',
            secondaryText: 'Stay on Smart Check',
          },
          '560px'
        );

        ref.afterClosed().subscribe((action: SmartCheckDialogAction) => {
          if (action === 'primary') this.runDueDateThenProceed();
        });
      }
    });

  }

  private buildDueDateFacts(anchorSource: 'NotificationDate' | 'AdditionalDate'): any {
    // These MUST exactly match your DT row values:
    // Member Program: "Comm" | "Medicaid"
    // Auth Class: "Inpatient"
    // Auth Type: "Standard" | "Expedited"
    // Anchor Source: "NotificationDate" | "AdditionalDate"
    return {
      memberDetails: { memberProgram: 'Comm' },
      authClass: 'Inpatient',
      authType: 'Expedited',
      anchorSource
    };
  }


  /**
   * Calls AUTH_DUE_DATE trigger (best-effort) and then navigates to Details.
   * - Tries anchorSource = NotificationDate first
   * - If no match, retries with anchorSource = AdditionalDate
   * Stores outputs (and computed due date if possible) in sessionStorage for the next step.
   */

  private persistSmartCheckPrefillForDetails(): void {
    try {
      const authClassId = Number(this.smartAuthCheckForm.get('authClassId')?.value || this.selectedAuthClassId || 0);
      const authTypeId = Number(this.smartAuthCheckForm.get('authTypeId')?.value || this.selectedAuthTypeId || 0);

      const icdCodes: string[] = (this.icds?.controls || [])
        .map((g: any) => {
          const v = (g as FormGroup)?.get('icd10')?.value;
          if (!v) return '';
          if (typeof v === 'string') return v.trim();
          return String(v.code ?? v.Code ?? v.icdcode ?? '').trim();
        })
        .filter((x: string) => !!x);

      const serviceCodes: string[] = (this.services?.controls || [])
        .map((g: any) => {
          const v = (g as FormGroup)?.get('serviceCode')?.value;
          if (!v) return '';
          if (typeof v === 'string') return v.trim();
          return String(v.code ?? v.Code ?? v.cptcode ?? v.cptCode ?? '').trim();
        })
        .filter((x: string) => !!x);

      const enrollmentId = 1;// Number(this.selectedEnrollment?.memberEnrollmentId || 0);

      // Ensure AuthDetails loads the same member context
      const memberDetailsId = Number(this.memberDetailsId || this.memberDetailsId || 0);
      if (memberDetailsId > 0) {
        sessionStorage.setItem('selectedMemberDetailsId', String(memberDetailsId));
      }

      const payload = {
        authClassId,
        authTypeId,
        enrollmentId,
        icdCodes,
        serviceCodes,
        // From/To dates from Smart Check (used to prefill Procedure section in Auth Details)
        fromDateIso: this.smartAuthCheckForm.get('scheduledDateTime')?.value ?? null,
        toDateIso: this.smartAuthCheckForm.get('dueDateTime')?.value ?? null,
        // Alias keys for clarity/forward-compat
        procedureFromDateIso: this.smartAuthCheckForm.get('scheduledDateTime')?.value ?? null,
        procedureToDateIso: this.smartAuthCheckForm.get('dueDateTime')?.value ?? null
      };

      sessionStorage.setItem('SMART_AUTH_CHECK_PREFILL', JSON.stringify(payload));
    } catch {
      // ignore (fail open)
    }
  }


  private runDueDateThenProceed(): void {
    // Persist Smart Check selections so Auth Details can prefill fields
    this.persistSmartCheckPrefillForDetails();

    const triggerKeyDue = 'AUTH_DUE_DATE'; // update if your trigger key differs

    const tryAnchor = (anchorSource: 'NotificationDate' | 'AdditionalDate') => {
      const dueFacts = this.buildDueDateFacts('NotificationDate');

      this.rulesengineService.executeTrigger(triggerKeyDue, dueFacts).subscribe({
        next: (res: ExecuteTriggerResponse) => {
          console.log(`AUTH_DUE_DATE response (${anchorSource}):`, res);

          const isMatched = !!(res as any)?.matched || (res as any)?.status === 'SUCCESS';
          if (!isMatched && anchorSource === 'NotificationDate') {
            // fallback try
            tryAnchor('AdditionalDate');
            return;
          }

          // Persist outputs for next screen (Details)
          try {
            sessionStorage.setItem('AUTH_DUE_DATE_OUTPUTS', JSON.stringify(res?.outputs ?? {}));
            sessionStorage.setItem('AUTH_DUE_DATE_MATCHED', JSON.stringify(isMatched));
            sessionStorage.setItem('AUTH_DUE_DATE_ANCHOR', anchorSource);
          } catch { /* ignore */ }

          // Optionally compute & prefill dueDateTime from scheduledDateTime + offsets
          this.applyComputedDueDateIfEmpty(res?.outputs ?? {}, anchorSource);
          console.log('Navigating to Details step after AUTH_DUE_DATE');
          this.gotoDetails();
        },
        error: (e) => {
          console.error(`AUTH_DUE_DATE trigger failed (${anchorSource})`, e);
          // fail-open
          this.gotoDetails();
        }
      });
    };

    tryAnchor('NotificationDate');
  }

  private applyComputedDueDateIfEmpty(outputs: Record<string, any>, anchorSource: string): void {
    const dueCtrl = this.smartAuthCheckForm.get('dueDateTime');
    const cur = String(dueCtrl?.value ?? '').trim();
    console.log(`Checking to auto-fill dueDateTime (anchorSource=${anchorSource}) - current value:`, cur);
    // Only auto-fill if empty
    // if (cur) return;

    const offsetValue = String(outputs['dt.result.OffsetValue'] ?? '').trim();
    const offsetUnit = String(outputs['dt.result.OffsetUnit'] ?? '').trim();
    const dayType = String(outputs['dt.result.DayType'] ?? '').trim();

    const schedIso = String(this.smartAuthCheckForm.get('scheduledDateTime')?.value ?? '').trim();
    const anchor = schedIso ? new Date(schedIso) : new Date();

    const computed = this.computeDueDate(anchor, offsetValue, offsetUnit, dayType);
    if (!computed) return;

    dueCtrl?.setValue(computed.toISOString());
    dueCtrl?.markAsTouched();

    // Update the textbox display (YYYY-MM-DD) for the native date input
    this.dueDateText = this.formatDateOnly(computed);
    console.log('Auto-filled dueDateTime with computed due date:', this.dueDateText);
    try {
      sessionStorage.setItem('AUTH_DUE_DATE_COMPUTED_ISO', computed.toISOString());
    } catch { /* ignore */ }
  }

  private computeDueDate(anchor: Date, offsetValue: string, offsetUnit: string, dayType: string): Date | null {
    const n = parseInt(String(offsetValue ?? '').trim(), 10);
    if (!Number.isFinite(n)) return null;

    const unit = String(offsetUnit ?? '').trim().toLowerCase();
    const dtype = String(dayType ?? '').trim().toLowerCase();

    // Months/Years handled via Date setters; Days/Weeks handled as day increments.
    if (unit.startsWith('month')) {
      const d = new Date(anchor);
      d.setMonth(d.getMonth() + n);
      return d;
    }

    if (unit.startsWith('year')) {
      const d = new Date(anchor);
      d.setFullYear(d.getFullYear() + n);
      return d;
    }

    const days = unit.startsWith('week') ? n * 7 : n;

    if (dtype.startsWith('week')) {
      return this.addWeekdays(anchor, days);
    }

    return this.addCalendarDays(anchor, days);
  }

  private addCalendarDays(anchor: Date, days: number): Date {
    const d = new Date(anchor);
    d.setDate(d.getDate() + days);
    return d;
  }

  private addWeekdays(anchor: Date, days: number): Date {
    const d = new Date(anchor);
    const step = days >= 0 ? 1 : -1;
    let remaining = Math.abs(days);

    while (remaining > 0) {
      d.setDate(d.getDate() + step);
      const day = d.getDay(); // 0 Sun, 6 Sat
      if (day !== 0 && day !== 6) remaining--;
    }

    return d;
  }

  private formatDateOnly(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }



  private getOutput(outputs: Record<string, any>, key: string): string {
    const v = (outputs ?? ({} as any))[key];
    if (v === null || v === undefined) return '';
    return String(v).trim();
  }

  private isYes(v: any): boolean {
    const s = String(v ?? '').trim().toLowerCase();
    return s === 'y' || s === 'yes' || s === 'true' || s === '1';
  }

  private toMdyOrFallback(value: any, fallback: string): string {
    if (value === null || value === undefined) return fallback;
    if (value instanceof Date && !isNaN(value.getTime())) {
      const m = value.getMonth() + 1;
      const d = value.getDate();
      const y = value.getFullYear();
      return `${m}/${d}/${y}`;
    }

    const s = String(value).trim();
    if (!s) return fallback;

    // Already in M/D/YYYY (or MM/DD/YYYY) format
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;

    // Convert YYYY-MM-DD (or YYYY-MM-DDTHH:mm...) -> M/D/YYYY
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      if (!isNaN(y) && !isNaN(mo) && !isNaN(d)) return `${mo}/${d}/${y}`;
    }

    // If user typed relative date tokens (D, D+1, etc) or any other format, pass through as-is.
    // Backend may still be able to interpret it; otherwise the rule may no-match.
    return s;
  }

  private gotoDetails(): void {
    // keep wizard routing
    this.router.navigate(['../details'], { relativeTo: this.route });
  }

  private getFirstServiceCode(): string {
    const first = this.services?.at(0) as FormGroup;
    const v = first?.get('serviceCode')?.value;
    if (!v) return '';
    if (typeof v === 'string') return v;
    return v.code ?? '';
  }

  // valueChange handlers
  onAuthClassChanged(authClassId: number): void {
    this.selectedAuthClassId = authClassId ?? 0;

    // patch reactive form
    this.smartAuthCheckForm.patchValue({
      authClassId: this.selectedAuthClassId,
      authTypeId: 0
    });

    this.selectedAuthTypeId = 0;
    this.authTypeOptions = [];

    if (this.selectedAuthClassId > 0) {
      this.loadAuthTemplates(this.selectedAuthClassId);
    }
  }

  onAuthTypeChanged(authTypeId: number): void {
    this.selectedAuthTypeId = authTypeId ?? 0;

    this.smartAuthCheckForm.patchValue({
      authTypeId: this.selectedAuthTypeId
    });
  }

  // Backward-compatible handlers (in case template wires (input)="onIcdInput/ onServiceInput")
  onIcdInput(i: number, ev: Event): void {
    const v = ((ev?.target as HTMLInputElement)?.value ?? '').toString();
    const g = this.icds.at(i) as FormGroup;
    if (!v) g.patchValue({ icd10Desc: '' }, { emitEvent: false });
  }

  onServiceInput(i: number, ev: Event): void {
    const v = ((ev?.target as HTMLInputElement)?.value ?? '').toString();
    const g = this.services.at(i) as FormGroup;
    if (!v) g.patchValue({ serviceDesc: '' }, { emitEvent: false });
  }
}
