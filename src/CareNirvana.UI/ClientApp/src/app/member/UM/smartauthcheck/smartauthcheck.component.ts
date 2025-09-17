import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { AuthService } from 'src/app/service/auth.service';
import { CrudService } from 'src/app/service/crud.service';
import { HttpClient } from '@angular/common/http';
import { MemberenrollmentService } from 'src/app/service/memberenrollment.service';

interface LevelItem {
  levelcode: string;
  levelname: string;
  levelsequence: number;
  level_value_id: number;
  level_value_code: string;
  level_value_name: string;
}

interface MemberEnrollment {
  MemberEnrollmentId: number;
  MemberDetailsId: number;
  StartDate: string; // ISO
  EndDate: string;   // ISO
  Status: boolean;
  HierarchyPath: string;
  LevelMap: string;  // JSON string
  Levels: string;    // JSON string
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
    private memberEnrollment: MemberenrollmentService
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
    this.loadMemberEnrollment();
  }

  get icds(): FormArray { return this.smartAuthCheckForm.get('icds') as FormArray; }
  newIcdGroup(): FormGroup { return this.fb.group({ icd10: [''], icd10Desc: [''] }); }
  addIcdRow(): void { this.icds.push(this.newIcdGroup()); }
  removeIcdRow(i: number): void { if (this.icds.length > 1) this.icds.removeAt(i); }

  get services(): FormArray { return this.smartAuthCheckForm.get('services') as FormArray; }
  newServiceGroup(): FormGroup { return this.fb.group({ serviceCode: [''], serviceDesc: [''] }); }
  addServiceRow(): void { this.services.push(this.newServiceGroup()); }
  removeServiceRow(i: number): void { if (this.services.length > 1) this.services.removeAt(i); }

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
    this.authService.getAuthTemplates(this.selectedAuthClassId).subscribe({
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
      if (!isNaN(parsed.getTime())) {
        finalDate = parsed;
      }
    }

    if (finalDate) {
      const control = this.smartAuthCheckForm.get(controlName);
      control?.setValue(finalDate);
      control?.markAsTouched();

      // update correct display field
      if (controlName === 'scheduledDateTime') {
        this.scheduledDateText = this.formatForDisplay(finalDate);
      } else if (controlName === 'dueDateTime') {
        this.dueDateText = this.formatForDisplay(finalDate);
      }
    }
  }

  formatForDisplay(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date).replace(',', '');
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

        // Example: handle simple “Y/N” contract
        if (typeof data === 'string' && data.trim() === 'Y') {
          // success path
        } else {
          // handle other values or parsed JSON object
        }
      },
      error: (err) => {
        console.error('Decision Table call failed:', err);
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
    this.memberEnrollment.getMemberEnrollment(2).subscribe(
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

    // If you need to stash the chosen enrollment for later sections, do it here:
    // const chosen = this.memberEnrollments[i];
    // this.selectedEnrollment = chosen;
    // (Optionally) propagate LOB/Product/etc. downstream if needed.
  }

  /** Safely parse JSON fields and return ordered levels + dates for display */
  getEnrollmentDisplayPairs(enr: MemberEnrollment): Array<{ label: string; value: string }> {
    let levelMap: Record<string, string> = {};
    let levels: LevelItem[] = [];

    try {
      levelMap = JSON.parse(enr.LevelMap || '{}');
    } catch { levelMap = {}; }

    try {
      levels = JSON.parse(enr.Levels || '[]') as LevelItem[];
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
    const start = enr.StartDate ? this.formatDateMMDDYYYY(enr.StartDate) : '';
    const end = enr.EndDate ? this.formatDateMMDDYYYY(enr.EndDate) : '';

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

}
