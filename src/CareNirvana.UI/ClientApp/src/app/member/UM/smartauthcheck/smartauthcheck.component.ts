import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { AuthService } from 'src/app/service/auth.service';
import { CrudService } from 'src/app/service/crud.service';
import { HttpClient } from '@angular/common/http';
import { MemberenrollmentService } from 'src/app/service/memberenrollment.service';
import { FormControl } from '@angular/forms';
import { Observable, of } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { MatSelect } from '@angular/material/select';
import { Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { ConfirmationDialogComponent } from '../../UM/confirmation-dialog/confirmation-dialog.component';

interface LevelItem {
  levelcode: string;
  levelname: string;
  levelsequence: number;
  level_value_id: number;
  level_value_code: string;
  level_value_name: string;
}

type CodeRow = { code: string; label: string; desc: string };

interface MemberEnrollment {
  memberEnrollmentId: number;
  memberDetailsId: number;
  startDate: string; // ISO
  endDate: string;   // ISO
  status: boolean;
  hierarchyPath: string;
  levelMap: string;  // JSON string
  levels: string;    // JSON string
}
interface LobCard {
  id: number;
  lob: string;
  account: string;
  start: string;
  end: string;
}

@Component({
  selector: 'app-smartauthcheck',
  templateUrl: './smartauthcheck.component.html',
  styleUrl: './smartauthcheck.component.css'
})

export class SmartauthcheckComponent implements OnInit {

  constructor(
    private crudService: CrudService,
    private authService: AuthService,
    private fb: FormBuilder,
    private http: HttpClient,
    private memberEnrollment: MemberenrollmentService,
    private dialog: MatDialog,
  ) { }

  smartAuthCheckForm!: FormGroup;

  selectedDiv: number | null = null;
  enrollmentSelect: boolean = false;
  selectedTemplateId: number = 0;
  selectedAuthClassId: number = 0;
  authTemplates: any[] = [];
  authClass: any[] = [];
  scheduledDateText: string = '';
  dueDateText: string = '';
  memberEnrollments: MemberEnrollment[] = [];

  lobOptions: LobCard[] = [
    { id: 1, lob: 'Medicare', account: 'Microsoft', start: '01/01/2024', end: '12/31/2024' },
    { id: 2, lob: 'Medicaid', account: 'Contoso', start: '01/01/2024', end: '12/31/2024' },
    { id: 3, lob: 'Commercial', account: 'Fabrikam', start: '01/01/2024', end: '12/31/2024' }
  ];

  ngOnInit(): void {
    this.loadAuthClass();
    this.smartAuthCheckForm = this.fb.group({
      scheduledDateTime: ['', Validators.required],
      dueDateTime: ['', Validators.required],
      icds: this.fb.array([this.newIcdGroup()]),
      services: this.fb.array([this.newServiceGroup()])
    });
    this.loadCodesForField();
    this.loadMemberEnrollment();
  }

  get icds(): FormArray { return this.smartAuthCheckForm.get('icds') as FormArray; }
  newIcdGroup(): FormGroup { return this.fb.group({ icd10: [''], icd10Desc: [''] }); }
  addIcdRow(): void { this.icds.push(this.newIcdGroup()); }
  removeIcdRow(i: number): void {
    const fa = this.icds;
    if (!fa || fa.length === 0) return;

    // Clear the row first (so values are guaranteed wiped even if you keep one row)
    const row = fa.at(i) as FormGroup;
    row.reset({}, { emitEvent: false });   // clears all controls in the row
    row.markAsPristine();
    row.markAsUntouched();
    row.updateValueAndValidity({ emitEvent: false });
    if (this.icds.length > 1) this.icds.removeAt(i);
  }

  get services(): FormArray { return this.smartAuthCheckForm.get('services') as FormArray; }
  newServiceGroup(): FormGroup { return this.fb.group({ serviceCode: [''], serviceDesc: [''] }); }
  addServiceRow(): void { this.services.push(this.newServiceGroup()); }
  removeServiceRow(i: number): void {
    const fa = this.services;
    if (!fa || fa.length === 0) return;

    // Clear the row first (so values are guaranteed wiped even if you keep one row)
    const row = fa.at(i) as FormGroup;
    row.reset({}, { emitEvent: false });   // clears all controls in the row
    row.markAsPristine();
    row.markAsUntouched();
    row.updateValueAndValidity({ emitEvent: false });

    if (this.services.length > 1) this.services.removeAt(i);
  }

  selectDiv(index: number): void {
    this.selectedDiv = index;
    this.enrollmentSelect = true;
  }

  loadAuthClass(): void {
    this.crudService.getData('um', 'authclass').subscribe({

      next: (response: any[]) => {
        this.authClass = [
          { id: 0, authClass: 'Select Auth Case' },  // optional default option
          ...response
        ];
      },
      error: (err) => {
        console.error('Error fetching auth class:', err);
        this.authClass = [{ id: 0, authClass: 'Select Auth Class' }];
      }
    });
  }

  onAuthClassChange(): void {
    // Reset template ID to default
    this.selectedTemplateId = 0;

    // Clear existing template list and reload based on selected class
    this.loadAuthTemplates();
  }

  loadAuthTemplates(): void {
    this.authService.getAuthTemplates("UM", this.selectedAuthClassId).subscribe({
      next: (data: any[]) => {
        this.authTemplates = [
          { Id: 0, TemplateName: 'Select Auth Type' },
          ...data
        ];
      },
      error: (err) => {
        console.error('Error fetching auth templates:', err);
        this.authTemplates = [{ Id: 0, TemplateName: 'Select Auth Type' }];
      }
    });
  }

  /******Date time field******/
  @ViewChild('scheduledPicker') scheduledPicker!: ElementRef<HTMLInputElement>;
  @ViewChild('duePicker') duePicker!: ElementRef<HTMLInputElement>;

  handleDateTimeBlur(inputModel: string, controlName: string): void {
    let input = (this as any)[inputModel]?.trim().toUpperCase();
    let base = new Date();
    let finalDate: Date | null = null;

    if (input === 'D') {
      finalDate = base;
    } else if (/^D\+(\d+)$/.test(input)) {
      const daysToAdd = +input.match(/^D\+(\d+)$/)![1];
      base.setDate(base.getDate() + daysToAdd);
      finalDate = base;
    } else if (/^D-(\d+)$/.test(input)) {
      const daysToSubtract = +input.match(/^D-(\d+)$/)![1];
      base.setDate(base.getDate() - daysToSubtract);
      finalDate = base;
    } else {
      const parsed = new Date(input);
      if (!isNaN(parsed.getTime())) finalDate = parsed;
    }

    if (finalDate) {
      const control = this.smartAuthCheckForm.get(controlName);

      // ✅ Store a STRING in the form control, not a Date
      // Use ISO for backend stability (or your own compact format).
      const iso = finalDate.toISOString();
      control?.setValue(iso);
      control?.markAsTouched();

      // ✅ Keep the visible text as a nice, compact STRING
      const pretty = this.formatForDisplay(finalDate);
      console.log('Formatted date for display:', pretty);
      if (controlName === 'scheduledDateTime') {
        this.scheduledDateText = pretty;
      } else if (controlName === 'dueDateTime') {
        this.dueDateText = pretty;
      }
    }
  }



  //formatForDisplay(date: Date): string {
  //  return new Intl.DateTimeFormat('en-US', {
  //    timeZone: 'America/New_York',
  //    year: 'numeric',
  //    month: '2-digit',
  //    day: '2-digit',
  //    hour: '2-digit',
  //    minute: '2-digit',
  //    second: '2-digit',
  //    hour12: false
  //  }).format(date).replace(',', '');
  //}
  private pad(n: number) { return String(n).padStart(2, '0'); }

  private formatForDisplay(d: Date): string {
    // Local time → MM/DD/YYYY HH:MM:SS
    const mm = this.pad(d.getMonth() + 1);
    const dd = this.pad(d.getDate());
    const yyyy = d.getFullYear();
    const HH = this.pad(d.getHours());
    const MM = this.pad(d.getMinutes());
    const SS = this.pad(d.getSeconds());
    return `${mm}/${dd}/${yyyy} ${HH}:${MM}:${SS}`;
  }


  handleCalendarChange(event: Event, controlName: string): void {
    const value = (event.target as HTMLInputElement).value;
    if (value) {
      const date = new Date(value);
      const control = this.smartAuthCheckForm.get(controlName);
      control?.setValue(date);
      control?.markAsTouched();

      if (controlName === 'scheduledDateTime') {
        this.scheduledDateText = this.formatForDisplay(date);
      } else if (controlName === 'dueDateTime') {
        this.dueDateText = this.formatForDisplay(date);
      }
    } else {
      // If calendar input cleared, reset control too
      const control = this.smartAuthCheckForm.get(controlName);
      control?.setValue('');
      control?.markAsTouched();

      if (controlName === 'scheduledDateTime') {
        this.scheduledDateText = '';
      } else if (controlName === 'dueDateTime') {
        this.dueDateText = '';
      }
    }
  }


  triggerCalendar(pickerType: 'scheduled' | 'due'): void {
    const picker = pickerType === 'scheduled' ? this.scheduledPicker?.nativeElement : this.duePicker?.nativeElement;
    picker?.showPicker?.();
  }

  onScheduledTextChange(event: Event) {
    const input = (event.target as HTMLInputElement).value;
    this.scheduledDateText = input;
  }

  onDueTextChange(event: Event) {
    const input = (event.target as HTMLInputElement).value;
    console.log('Due date input changed to:', input);
    this.dueDateText = input;
  }

  formatDateEST(date?: string): string {
    if (!date) return '';  // <-- this fixes undefined input
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) return ''; // invalid date check

    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(parsedDate).replace(',', '');
  }

  onDateKeydown(evt: KeyboardEvent, which: 'scheduled' | 'due') {
    // Alt+ArrowDown or F9 opens the picker
    if ((evt.altKey && evt.key === 'ArrowDown') || evt.key === 'F9') {
      evt.preventDefault();
      this.triggerCalendar(which);
    }
  }

  /******Date time field******/

  onNextContinue(): void {

    const url = 'https://carenirvanabre-b2ananexbwedbfes.eastus2-01.azurewebsites.net/api/DecisionTable/rundecision?decisionTableName=PayorCatalogueSpec';

    const body = {
      'Service Code': "11920",//this.smartAuthCheckForm.get('serviceCode')?.value,
      'Service Type': 'CPT Code',
      'LOB': 'TX Medicaid'
    };

    this.http.post(url, body, { responseType: 'text' }).subscribe({
      next: (text: string) => {
        console.log('Raw response:', text);

        // Optional: try to parse if it sometimes sends JSON
        let data: any = text;
        try { data = JSON.parse(text); } catch { /* keep as plain text */ }



        if (data === 'Y') {
          // Show confirmation message when authorization is required
          const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
            width: '480px',
            data: {
              title: 'Authorization Required',
              message:
                'Smart Auth Check indicates that this request **requires an Authorization**.<br><br>' +
                'Please press <b>Continue</b> to proceed with creating the Authorization in the <b>Request Details</b> step,<br>' +
                'or click <b>Cancel</b> to remain on the Smart Auth Check page.'
            },
            panelClass: 'confirm-dialog',
          });

          dialogRef.afterClosed().subscribe(result => {
            if (result === 'continue') {
              // Move to Request Details stepper in Authorization component
              //this.router.navigate(['/authorization'], {
              //  queryParams: { step: 'request-details' },
              //});
            } else {
              // Stay on the same page
              console.log('User chose to stay on Smart Auth Check');
            }
          });
        } else {
          // Continue your normal flow if no authorization required
         // this.proceedToNextStep();
        }
      },
      error: (err) => {
        console.error('Error during Smart Auth Check:', err);
      }
    });
  }
  

  onCompleteAuth(): void {
    if (this.smartAuthCheckForm.invalid) {
      this.smartAuthCheckForm.markAllAsTouched();
      return;
    }
    // complete flow
  }

  onCancel(): void { /* navigate back or clear */ }
  onSaveDraft(): void { /* persist partial */ }


  loadMemberEnrollment(): void {
    console.log('Loading member enrollment for MemberDetailsId:', sessionStorage.getItem('selectedMemberDetailsId'));
    this.memberEnrollment.getMemberEnrollment(sessionStorage.getItem('selectedMemberDetailsId')).subscribe(
      (data) => {
        console.log('Member Enrollment Data:', data);
        if (data) {
          this.setMemberEnrollments(data);
        }
      },
      (error) => {
        console.error('Error fetching member enrollment data:', error);
      }
    );
  }

  private setMemberEnrollments(data: MemberEnrollment[]) {
    this.memberEnrollments = (data ?? []).map(d => ({
      ...d,
      // leave strings as-is; we'll parse on demand for safety
    }));

    // Default selection if any rows exist
    if (this.memberEnrollments.length > 0) {
      this.selectedDiv = 1;
      this.enrollmentSelect = true; // you already condition on this in the rest of the page
    }
  }

  /** Keep the selection behavior identical to your old selectDiv(n) */
  selectEnrollment(i: number) {
    this.selectedDiv = i + 1;
    this.enrollmentSelect = true;
  }

  /** Safely parse JSON fields and return ordered levels + dates for display */
  getEnrollmentDisplayPairs(enr: MemberEnrollment): Array<{ label: string; value: string }> {
    let levelMap: Record<string, string> = {};
    let levels: LevelItem[] = [];

    try {
      levelMap = JSON.parse(enr.levelMap || '{}');
    } catch { levelMap = {}; }

    try {
      levels = JSON.parse(enr.levels || '[]') as LevelItem[];
    } catch { levels = []; }

    // Sort by levelsequence if present; otherwise fall back to as-is
    const orderedLevels = [...levels].sort((a, b) => {
      const sa = (a?.levelsequence ?? 0);
      const sb = (b?.levelsequence ?? 0);
      return sa - sb;
    });

    // Build label/value pairs from ordered levels
    const pairs: Array<{ label: string; value: string }> = [];

    for (const lvl of orderedLevels) {
      const code = (lvl.levelcode || '').trim();
      // Prefer the friendly levelname for the label (e.g., "Product") but keep your compact style if you want:
      const label = code || lvl.levelname || 'Level';

      // Prefer the friendly level_value_name; fall back to LevelMap value, then code
      const value =
        (lvl.level_value_name?.trim?.() || '') ||
        (levelMap[code] ?? '') ||
        (lvl.level_value_code ?? '') ||
        '';

      if (label && value) {
        pairs.push({ label, value });
      }
    }

    // Dates (always last two lines, matching your layout)
    const start = enr.startDate ? this.formatDateMMDDYYYY(enr.startDate) : '';
    const end = enr.endDate ? this.formatDateMMDDYYYY(enr.endDate) : '';

    if (start) pairs.push({ label: 'Start Date', value: start });
    if (end) pairs.push({ label: 'End Date', value: end });

    return pairs;
  }

  private formatDateMMDDYYYY(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  getLevelPairs(m: MemberEnrollment): Array<{ key: string; val: string }> {
    if (!m?.levelMap) return [];
    return Object.entries(m.levelMap)
      .filter(([_, v]) => v != null && String(v).trim() !== '')
      .map(([key, val]) => ({ key, val: String(val) }));
  }

  /**********Codesets ***********/
  searchText: string = '';
  allCodes: CodeRow[] = [];
  allCPTCodes: CodeRow[] = [];
  filteredCodes: CodeRow[] = [];
  // NEW: reactive controls for the two inputs
  cptCtrl = new FormControl<string | CodeRow>('');
  serviceCtrl = new FormControl<string | CodeRow>('');

  // Streams feeding the autocomplete panels
  filteredCpt$!: Observable<CodeRow[]>;
  filteredService$!: Observable<CodeRow[]>;

  /*  selectedField: { id: string; name: string } = { id: 'icd10Code', name: 'ICD-10 Code' };*/

  loadCodesForField(): void {
    const type = 'ICD';
    this.authService.getAllCodesets(type).subscribe((data: any[]) => {
      this.allCodes = data
        .filter(d => d.type === type)
        .map(d => ({
          code: d.code,
          desc: d.codeDesc || '',
          label: `${d.code} - ${d.codeDesc || ''}`
        }));
      this.filteredCodes = [...this.allCodes];
      this.initCptFilter();        // ensure stream connected
    });

    const typeCPT = 'CPT';
    this.authService.getAllCodesets(typeCPT).subscribe((data: any[]) => {
      this.allCPTCodes = data
        .filter(d => d.type === typeCPT) // <- FIX: use typeCPT (was using type)
        .map(d => ({
          code: d.code,
          desc: d.codeDesc || '',
          label: `${d.code} - ${d.codeDesc || ''}`
        }));
      this.initServiceFilter();    // ensure stream connected
    });
  }

  private initCptFilter(): void {
    this.filteredCpt$ = (this.cptCtrl.valueChanges || of(this.cptCtrl.value)).pipe(
      startWith(this.cptCtrl.value ?? ''),
      map(val => this.filterAny(val, this.allCodes))
    );
  }

  private initServiceFilter(): void {
    this.filteredService$ = (this.serviceCtrl.valueChanges || of(this.serviceCtrl.value)).pipe(
      startWith(this.serviceCtrl.value ?? ''),
      map(val => this.filterAny(val, this.allCPTCodes))
    );
  }

  // display helper for matAutocomplete
  displayCode = (v: string | CodeRow | null): string =>
    v && typeof v === 'object' ? v.code : (v ?? '');

  // generic filter (by code or desc)
  private filterAny(val: string | CodeRow | null, source: CodeRow[]): CodeRow[] {
    if (!source?.length) return [];
    const term = (typeof val === 'string' ? val : val?.code ?? '').trim().toLowerCase();

    if (!term) return source.slice(0, 50);
    return source
      .filter(x =>
        x.code.toLowerCase().includes(term) ||
        x.desc.toLowerCase().includes(term)
      )
      .slice(0, 50);
  }

  // For CPT (filters from this.allCodes)

  onCptSelected(i: number, picked: { code: string; desc: string }): void {
    const row = this.icds.at(i) as FormGroup;
    row.patchValue(
      {
        icd10: picked.code,
        icd10Desc: picked.desc
      },
      { emitEvent: false }
    );
  }

  deferClose(sel: MatSelect) {
    setTimeout(() => sel.close(), 120);
  }

  // For SERVICE (filters from this.allCPTCodes)
  private buildServiceRow(): FormGroup {
    return this.fb.group({
      serviceCode: [''],
      serviceDescription: ['']   // <<< this MUST exist if your template uses formControlName="serviceDescription"
      // if you prefer 'serviceDesc', then also change the template to formControlName="serviceDesc"
    });
  }

  // When you need at least one row:
  initFirstServiceRow(): void {
    if (this.services.length === 0) {
      this.services.push(this.buildServiceRow());
    }
  }

  // Called when a service option is chosen
  onServiceSelected(i: number, picked: { code: string; desc: string }): void {
    const row = this.services.at(i) as FormGroup;
    row.patchValue(
      { serviceCode: picked.code, serviceDesc: picked.desc },
      { emitEvent: false }
    );
  }





  // displays (what user sees in the input)
  authCaseDisplay = '';
  authTypeDisplay = '';

  // dropdown state
  showDropdowns = { authCase: false, authType: false };
  highlightedIndex = { authCase: -1, authType: -1 };

  // filtered lists
  filteredAuthCases: Array<{ id: number; authClass: string }> = [];
  filteredAuthTypes: Array<{ Id: number; TemplateName: string }> = [];

  // call once after you load authClass/authTemplates OR in ngOnInit
  initDropdownDisplays() {
    const ac = this.authClass?.find(a => a.id === this.selectedAuthClassId);
    this.authCaseDisplay = ac ? ac.authClass : '';

    const t = this.authTemplates?.find(x => x.Id === this.selectedTemplateId);
    this.authTypeDisplay = t ? t.TemplateName : '';
  }

  // open/close (blur uses small timeout so mousedown can fire)
  openDropdown(which: 'authCase' | 'authType') {
    this.showDropdowns[which] = true;
    this.recomputeFilter(which, '');
    this.highlightedIndex[which] = this[which === 'authCase' ? 'filteredAuthCases' : 'filteredAuthTypes'].length ? 0 : -1;
  }

  closeDropdown(which: 'authCase' | 'authType') {
    setTimeout(() => this.showDropdowns[which] = false, 120);
  }

  // typeahead input
  onTypeaheadInput(evt: Event, which: 'authCase' | 'authType') {
    const val = (evt.target as HTMLInputElement).value || '';
    if (which === 'authCase') this.authCaseDisplay = val;
    else this.authTypeDisplay = val;
    this.recomputeFilter(which, val);
    this.highlightedIndex[which] = this[which === 'authCase' ? 'filteredAuthCases' : 'filteredAuthTypes'].length ? 0 : -1;
  }

  // keyboard nav
  handleDropdownKeydown(e: KeyboardEvent, which: 'authCase' | 'authType') {
    const list = which === 'authCase' ? this.filteredAuthCases : this.filteredAuthTypes;
    let idx = this.highlightedIndex[which];

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (list.length) this.highlightedIndex[which] = (idx + 1) % list.length;
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.length) this.highlightedIndex[which] = (idx - 1 + list.length) % list.length;
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (idx >= 0 && list[idx]) this.selectDropdownOption(which, list[idx]);
      return;
    }
    if (e.key === 'Escape' || e.key === 'Tab') {
      this.showDropdowns[which] = false;
      return;
    }
  }

  // selection (mouse or keyboard)
  selectDropdownOption(which: 'authCase' | 'authType', option: any) {
    if (which === 'authCase') {
      this.selectedAuthClassId = option.id;
      this.authCaseDisplay = option.authClass;
      this.showDropdowns.authCase = false;

      // refresh templates for selected class (your existing logic)
      this.onAuthClassChange();

      // reset Type display/selection if needed
      this.selectedTemplateId = 0;
      this.authTypeDisplay = '';
      this.filteredAuthTypes = this.authTemplates || [];
    } else {
      this.selectedTemplateId = option.Id;
      this.authTypeDisplay = option.TemplateName;
      this.showDropdowns.authType = false;
    }
  }

  // filter helpers
  private recomputeFilter(which: 'authCase' | 'authType', term: string) {
    const q = (term || '').toLowerCase().trim();

    if (which === 'authCase') {
      const src = this.authClass || [];
      this.filteredAuthCases = !q ? src.slice(0, 50)
        : src.filter(a => (a.authClass || '').toLowerCase().includes(q)).slice(0, 50);
    } else {
      const src = this.authTemplates || [];
      this.filteredAuthTypes = !q ? src.slice(0, 50)
        : src.filter(t => (t.TemplateName || '').toLowerCase().includes(q)).slice(0, 50);
    }
  }
}
