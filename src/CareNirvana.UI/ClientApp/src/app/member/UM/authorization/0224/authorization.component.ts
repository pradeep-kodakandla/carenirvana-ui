import { Component, Type, EventEmitter, Output } from '@angular/core';
import { MemberService } from 'src/app/service/shared-member.service';
import { AuthService } from 'src/app/service/auth.service';
import { AuthNumberService } from 'src/app/service/auth-number-gen.service';

type DecisionKeys = '33501' | '23310';

interface Tab {
  id: string;
  name: string;
}

interface Decision {
  icd10Code: string;
  description: string;
}

@Component({
  selector: 'app-authorization',
  templateUrl: './authorization.component.html',
  styleUrls: ['./authorization.component.css'] // Fixed incorrect property name
})
export class AuthorizationComponent {

  stepperSelectedIndex = 0;
  authNumber: string = '';
  constructor(private memberService: MemberService, private authService: AuthService, private authNumberService: AuthNumberService) { }

  highlightedSection: string | null = null;
  highlightedItem: string | null = null;
  enrollmentSelect: boolean = false;
  selectedAuthType: string = 'sel';
  authTypeSelect: boolean = false;
  isExpanded = true;
  isStatusExpanded = true;
  authTemplates: any[] = []; // Array to hold fetched templates
  selectedTemplateId: number = 0; // Default to 0 for "Select Auth Type"
  newTemplateName: string = '';
  showTemplateNameError: boolean = false;


  selectedDiv: number | null = null;

  selectDiv(index: number) {
    this.selectedDiv = index;
    this.enrollmentSelect = true;
  }





  additionalInfo = [
    { dateIndicator: '', providerName: '', memberName: '', authNo: '' }
  ];



  tabs: Tab[] = [
    { id: '33501', name: '33501 (CPT) 01/01/2024 - 12/31/2024 - Pending' },
    { id: '23310', name: '23310 (ICD) 01/01/2024 - 12/31/2024 - Completed' }
  ];

  selectedTabId: string = this.tabs[0].id;

  selectTab(tabId: string): void {
    this.selectedTabId = tabId;
  }

  @Output() cancel = new EventEmitter<void>();

  onCancelClick() {
    this.cancel.emit();
    this.memberService.setIsCollapse(false);
  }








  formData: any = {}; // Stores form data dynamically
  config: any; // JSON Configuration

  ngOnInit(): void {
    this.loadAuthTemplates();
  }

  loadAuthTemplates(): void {
    this.authService.getAuthTemplates().subscribe({
      next: (data: any[]) => {
        this.authTemplates = [
          { Id: 0, TemplateName: 'Select Auth Type' }, // Default option (minimal properties)
          ...data
        ];
      },
      error: (err) => {
        console.error('Error fetching auth templates:', err);
        this.authTemplates = [{ Id: 0, TemplateName: 'Select Auth Type' }]; // Fallback
      }
    });
  }

  //onAuthTypeChange(): void {
  //  this.authTypeSelect = this.selectedAuthType !== 'sel';
  //}

  onAuthTypeChange(): void {
    console.log('Selected Template ID:', this.selectedTemplateId);
    if (this.selectedTemplateId !== null && this.selectedTemplateId !== 0) { // Skip if "Select Auth Type" or null
      this.authTypeSelect = this.selectedAuthType !== 'sel';
      this.authService.getTemplate(this.selectedTemplateId).subscribe({
        next: (data: any) => {
          if (!data || !data[0].JsonContent) {
            console.error('API returned invalid data:', data);
            return;
          }

          try {
            // Parse `JsonContent` (stringified JSON) from the specific template
            const parsedJson = JSON.parse(data[0].JsonContent);
            // Transform array to object if needed
            if (Array.isArray(parsedJson)) {
              this.config = { "defaultSection": parsedJson[0] }; // Example transformation
            } else {
              this.config = parsedJson; // Direct assignment if already an object
            }
            console.log('Parsed config:', this.config); // Debugging log
          } catch (error) {
            console.error('Error parsing JSON content:', error);
            this.config = {}; // Reset config on parsing error
          }
          this.formData = {};

          for (let section in this.config) {
            if (section === 'additionalDetails' && this.config[section]) {
              this.formData[section] = { expanded: true };

              for (let subSection in this.config.additionalDetails) {
                this.formData[section][subSection] = {
                  expanded: true,
                  entries: [this.createEmptyEntry(this.config.additionalDetails[subSection])]
                };
              }
            } else if (this.config[section]) {
              this.formData[section] = {
                expanded: true,
                entries: [this.createEmptyEntry(this.config[section])],
                primaryIndex: null
              };
            }
          }
        },
        error: (err) => {
          console.error('Error fetching template:', err);
          this.config = {}; // Reset config on API error
        }
      });
    } else {
      this.config = {}
        ; // Clear config if default option is selected
      console.log('No valid template selected');
    }
  }

  //loadAuthTemplates(): void {
  //  this.authService.getAuthTemplates().subscribe(
  //    data => {
  //      if (!data || !data[0].JsonContent) {
  //        console.error('API returned invalid data:', data);
  //        return;
  //      }

  //      try {
  //        // ✅ Parse `JsonContent` (which is a stringified JSON)
  //        this.config = JSON.parse(data[0].JsonContent);
  //        console.log('Parsed config:', this.config); // Debugging log
  //      } catch (error) {
  //        console.error('Error parsing JSON content:', error);
  //        return;
  //      }

  //      // ✅ Initialize `formData` after parsing config

  //    },
  //    error => {
  //      console.error('Error fetching auth templates:', error);
  //    }
  //  );
  //}




  // ✅ Function to create an entry with all fields initialized to null
  createEmptyEntry(fields: any[]) {
    let entry: any = {};
    fields.forEach(field => {
      entry[field.id] = null;
    });
    return entry;
  }

  // ✅ Toggle section visibility
  toggleSection(section: string) {
    this.formData[section].expanded = !this.formData[section].expanded;
  }

  // ✅ Add Entry for Any Section (Handles Nested Additional Details)
  addEntry(section: string, index: number) {
    if (section === 'additionalDetails') {
      console.error('Error: Section should include a subsection, like additionalDetails.additionalInfo');
      return;
    }

    // Handle additionalDetails subsections
    if (section.startsWith('additionalDetails.')) {
      const subSection = section.split('.')[1];

      // Ensure the subsection exists
      if (!this.formData.additionalDetails) {
        this.formData.additionalDetails = {};
      }
      if (!this.formData.additionalDetails[subSection]) {
        this.formData.additionalDetails[subSection] = {
          expanded: true,
          entries: []
        };
      }

      // Add new entry
      this.formData.additionalDetails[subSection].entries.splice(index + 1, 0, this.createEmptyEntry(this.config.additionalDetails[subSection]));
    } else {
      // Regular sections (authDetails, providerDetails, etc.)
      if (!this.formData[section]) {
        this.formData[section] = { expanded: true, entries: [] };
      }
      this.formData[section].entries.splice(index + 1, 0, this.createEmptyEntry(this.config[section]));
    }
  }

  // ✅ Remove Entry for Any Section (Handles Nested Additional Details)
  removeEntry(section: string, index: number) {
    if (section === 'additionalDetails') {
      console.error('Error: Section should include a subsection, like additionalDetails.additionalInfo');
      return;
    }

    // Handle additionalDetails subsections
    if (section.startsWith('additionalDetails.')) {
      const subSection = section.split('.')[1];

      if (this.formData.additionalDetails?.[subSection]?.entries.length > 1) {
        this.formData.additionalDetails[subSection].entries.splice(index, 1);
      }
    } else {
      // Regular sections
      if (this.formData[section]?.entries.length > 1) {
        this.formData[section].entries.splice(index, 1);
      }
    }
  }

  // ✅ Set Primary Radio Button Selection
  setPrimary(section: string, index: number) {
    this.formData[section].primaryIndex = index;
  }

  // ✅ Save Form Data (Mock Save Example)
  saveData() {

    this.authNumber = this.authNumberService.generateAuthNumber(9, true, true, false, false);
    console.log("Auth Number:", this.authNumber);
    // Wrap data inside an array to match jsonb[] type
    const jsonData = {
      Data: [this.formData], // Ensures PostgreSQL gets a JSON array
      CreatedOn: new Date().toISOString(),
      authNumber: this.authNumber
    };

    console.log("jsondata: ", jsonData);
    this.authService.saveAuthDetail(jsonData).subscribe(
      response => {
        console.log('Data saved successfully:', response);
      },
      error => {
        console.error('Error saving data:', error);
      }
    );
  }
}
