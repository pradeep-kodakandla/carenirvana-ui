import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';

import { Observable, of, merge, Subject } from 'rxjs';
import { map, startWith, debounceTime, distinctUntilChanged, switchMap, tap, shareReplay, catchError } from 'rxjs/operators';

import { CrudService } from 'src/app/service/crud.service';
import { AuthService } from 'src/app/service/auth.service';
import { MemberenrollmentService } from 'src/app/service/memberenrollment.service';

import { AuthconfirmleavedialogComponent } from 'src/app/member/UM/components/authconfirmleavedialog/authconfirmleavedialog.component';
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
  filteredCpt$!: Observable<CodeOption[]>;
  filteredService$!: Observable<CodeOption[]>;

  private codesetsLoaded$?: Observable<void>;
  private icdAutoRefresh$ = new Subject<void>();
  private serviceAutoRefresh$ = new Subject<void>();

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

    this.wireAutocomplete();
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
    this.icdAutoRefresh$.next();
  }

  removeIcdRow(i: number): void {
    if (this.icds.length === 1) return;
    this.icds.removeAt(i);
    this.icdAutoRefresh$.next();
  }

  addServiceRow(): void {
    this.services.push(this.createServiceRow());
    this.serviceAutoRefresh$.next();
  }

  removeServiceRow(i: number): void {
    if (this.services.length === 1) return;
    this.services.removeAt(i);
    this.serviceAutoRefresh$.next();
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

  // --- Autocomplete ---
  private wireAutocomplete(): void {
    // Wire Angular Material mat-autocomplete to the FormArray controls (mirrors AuthDetails' "searchFn + minChars + debounce")
    // We keep a single filtered stream per field-type, and rebuild the merged valueChanges streams whenever rows are added/removed.
    const minChars = 1;
    const debounceMs = 200;
    const limit = 25;

    this.filteredCpt$ = this.icdAutoRefresh$.pipe(
      startWith(void 0),
      switchMap(() => {
        const ctrls = this.icds.controls
          .map(g => (g as FormGroup).get('icd10') as FormControl)
          .filter(Boolean);

        if (!ctrls.length) return of([] as CodeOption[]);

        return merge(
          ...ctrls.map(c => c.valueChanges.pipe(startWith(c.value)))
        ).pipe(
          map(v => (typeof v === 'string') ? v : (v?.code ?? '')),
          map(v => String(v ?? '').trim()),
          debounceTime(debounceMs),
          distinctUntilChanged(),
          switchMap(q => q.length >= minChars ? this.searchLocalIcd(q, limit) : of([] as CodeOption[]))
        );
      })
    ).pipe(shareReplay(1));

    this.filteredService$ = this.serviceAutoRefresh$.pipe(
      startWith(void 0),
      switchMap(() => {
        const ctrls = this.services.controls
          .map(g => (g as FormGroup).get('serviceCode') as FormControl)
          .filter(Boolean);

        if (!ctrls.length) return of([] as CodeOption[]);

        return merge(
          ...ctrls.map(c => c.valueChanges.pipe(startWith(c.value)))
        ).pipe(
          map(v => (typeof v === 'string') ? v : (v?.code ?? '')),
          map(v => String(v ?? '').trim()),
          debounceTime(debounceMs),
          distinctUntilChanged(),
          switchMap(q => q.length >= minChars ? this.searchLocalServiceCodes(q, limit) : of([] as CodeOption[]))
        );
      })
    ).pipe(shareReplay(1));
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
    console.log('[AuthSmartCheck] codesets loaded', { icd: this.allIcdCodes.length, service: this.allServiceCodes.length });

    return this.codesetsLoaded$ ?? of(void 0);

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

  private searchLocalIcd(q: string, limit: number): Observable<CodeOption[]> {
    return this.ensureCodesetsLoaded().pipe(map(() => this.filterCodes(this.allIcdCodes, q, limit)));
  }

  private searchLocalServiceCodes(q: string, limit: number): Observable<CodeOption[]> {
    return this.ensureCodesetsLoaded().pipe(map(() => this.filterCodes(this.allServiceCodes, q, limit)));
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

  // --- Navigation / Decision ---
  onNextContinue(): void {
    // validate required UI pieces
    if (!this.selectedEnrollment) {
      this.dialog.open(AuthconfirmleavedialogComponent, {
        width: '520px',
        data: {
          title: 'Coverage Context Required',
          message: 'Please select a coverage/LOB card before continuing.',
          okText: 'OK',
          cancelText: '',
          showCancel: false,
        },
      });
      return;
    }

    if (this.smartAuthCheckForm.invalid) {
      this.smartAuthCheckForm.markAllAsTouched();
      return;
    }

    const serviceCode = this.getFirstServiceCode();
    const lob = this.selectedEnrollment?.Coverage_Type || 'TX Medicaid';

    const body: any = {
      'Service Code': serviceCode || '',
      'Service Type': 'CPT Code',
      'LOB': lob,
    };

    const triggerKey = 'SMART_AUTH_CHECK.BUTTON_CLICK';
    const facts = {
      serviceCode: '11922',
      procedure: {
        fromDate: '1/1/2021',
        toDate: '12/31/2999'
      }
    };

    this.rulesengineService.executeTrigger(triggerKey, facts).subscribe({
      next: (res: ExecuteTriggerResponse) => {
        console.log('Rules response:', res);

        const authRequired = (res?.outputs?.result1 ?? '').toString().toUpperCase() === 'YES';

        if (authRequired) {
          const ref = this.dialog.open(AuthconfirmleavedialogComponent, {
            width: '520px',
            data: {
              title: 'Authorization Required',
              message: 'Authorization is required based on the selected inputs. Continue to create Authorization?',
              okText: 'Continue',
              cancelText: 'Cancel',
              showCancel: true,
            },
          });

          ref.afterClosed().subscribe((ok: boolean) => {
            if (ok) this.gotoDetails();
          });
        } else {
          this.gotoDetails();
        }
      },
      error: (e) => {
        console.error('Rules trigger failed', e);
        // fail-open (same behavior you already had)
        this.gotoDetails();
      }
    });

    //this.http.post(this.decisionTableUrl, body, { responseType: 'text' }).subscribe({
    //  next: (raw: string) => {
    //    let data: any = raw;
    //    try { data = JSON.parse(raw); } catch { }

    //    // If auth is required → show confirm then route
    //    if (data === 'Y') {
    //      const ref = this.dialog.open(AuthconfirmleavedialogComponent, {
    //        width: '520px',
    //        data: {
    //          title: 'Authorization Required',
    //          message: 'Authorization is required based on the selected LOB and Service Code. Continue to create Authorization?',
    //          okText: 'Continue',
    //          cancelText: 'Cancel',
    //          showCancel: true,
    //        },
    //      });

    //      ref.afterClosed().subscribe((ok: boolean) => {
    //        if (ok) this.gotoDetails();
    //      });
    //    } else {
    //      this.gotoDetails();
    //    }
    //  },
    //  error: (e) => {
    //    console.error('Decision table failed', e);
    //    // fail-open → still allow user to proceed
    //    this.gotoDetails();
    //  },
    //});
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
