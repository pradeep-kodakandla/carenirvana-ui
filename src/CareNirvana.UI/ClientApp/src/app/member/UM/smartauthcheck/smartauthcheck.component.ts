import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from 'src/app/service/auth.service';
import { CrudService } from 'src/app/service/crud.service';
import { HttpClient } from '@angular/common/http';

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
    private http: HttpClient
  ) { }

  smartAuthCheckForm: FormGroup = this.fb.group({
    scheduledDateTime: ['', Validators.required],
    dueDateTime: ['', Validators.required],
    icd10: [''],
    icd10Desc: [''],
    serviceCode: [''],
    serviceDesc: [''],
  });


  selectedDiv: number | null = null;
  enrollmentSelect: boolean = false;
  selectedTemplateId: number = 0;
  selectedAuthClassId: number = 0;
  authTemplates: any[] = [];
  authClass: any[] = [];
  scheduledDateText: string = '';
  dueDateText: string = '';

  lobOptions: LobCard[] = [
    { id: 1, lob: 'Medicare', account: 'Microsoft', start: '01/01/2024', end: '12/31/2024' },
    { id: 2, lob: 'Medicaid', account: 'Contoso', start: '01/01/2024', end: '12/31/2024' },
    { id: 3, lob: 'Commercial', account: 'Fabrikam', start: '01/01/2024', end: '12/31/2024' }
  ];

  ngOnInit(): void {
    this.loadAuthClass();

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
    /*const headers = { 'Content-Type': 'application/json' };*/
    //const body = {
    //  "Service Code": "11920",//this.smartAuthCheckForm.get('serviceCode')?.value,
    //  "Service Type": "CPT Code",
    //  "LOB": "TX Medicaid"   // replace with selected LOB if dynamic
    //};

    //this.http.post('https://carenirvanabre-b2ananexbwedbfes.eastus2-01.azurewebsites.net/api/DecisionTable/rundecision?decisionTableName=PayorCatalogueSpec', body)
    //  .subscribe({
    //    next: (response) => {
    //      const res: any = JSON.parse(response.toString());
    //      console.log('Decision Table Response:', res);
    //      // TODO: handle navigation / UI updates
    //    },
    //    error: (error) => {
    //      console.error('Error calling Decision Table:', error);
    //    }
    //  });
    //if (this.smartAuthCheckForm.invalid) {
    //  this.smartAuthCheckForm.markAllAsTouched();
    //  return;
    //}
    // route to next step or show additional section

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
}
