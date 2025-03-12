import { Component, EventEmitter, Output } from '@angular/core';
import { NgForm } from '@angular/forms';
import { MemberService } from 'src/app/service/shared-member.service';
import { AuthService } from 'src/app/service/auth.service';
import { AuthNumberService } from 'src/app/service/auth-number-gen.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CrudService } from 'src/app/service/crud.service';
import { MatDialog } from '@angular/material/dialog';
import { ProviderSearchComponent } from 'src/app/Provider/provider-search/provider-search.component';
import { UmauthnotesComponent } from 'src/app/member/UM/umauthnotes/umauthnotes.component';
import { UmauthdocumentsComponent } from 'src/app/member/UM/umauthdocuments/umauthdocuments.component';


@Component({
  selector: 'app-authorization',
  templateUrl: './authorization.component.html',
  styleUrls: ['./authorization.component.css']
})
export class AuthorizationComponent {
  stepperSelectedIndex = 0;
  authNumber: string = '';

  constructor(
    private memberService: MemberService,
    private authService: AuthService,
    private authNumberService: AuthNumberService,
    private dialog: MatDialog,
    private crudService: CrudService,
    private snackBar: MatSnackBar
  ) { }

  highlightedSection: string | null = null;
  highlightedItem: string | null = null;
  enrollmentSelect: boolean = false;
  selectedAuthType: string = 'sel';
  authTypeSelect: boolean = false;
  isExpanded = true;
  isStatusExpanded = true;
  authTemplates: any[] = [];
  selectedTemplateId: number = 0;
  newTemplateName: string = '';
  showTemplateNameError: boolean = false;
  decisionData: any = {};

  // Method to set selected div (if needed elsewhere)
  selectDiv(index: number): void {
    this.selectedDiv = index;
    this.enrollmentSelect = true;
    this.sectionOrder = this.config
      ? Object.keys(this.config).filter(section => !section.toLowerCase().includes('decision')).sort((a, b) => (this.config[a].order || 0) - (this.config[b].order || 0))
      : ['Auth Details'];
  }

  selectedDiv: number | null = null;
  additionalInfo = [
    { label: "Auth No.", value: "5N7CBIHL3" },
    { label: "Auth Type", value: "Standard" },
    { label: "Due Date", value: "2024-03-15" },
    { label: "Days Left", value: "3" },
    { label: "Request Priority", value: "High" },
    { label: "Auth Owner", value: "John Doe" },
    { label: "Auth Status", value: "Pending" },
    { label: "Overall Status", value: "Approved" }
  ];


  @Output() cancel = new EventEmitter<void>();

  onCancelClick(): void {
    this.cancel.emit();
    this.memberService.setIsCollapse(false);
  }

  formData: any = {};
  config: any; // JSON configuration loaded dynamically

  ngOnInit(): void {
    this.loadAuthTemplates();
  }

  loadAuthTemplates(): void {
    this.authService.getAuthTemplates().subscribe({
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

  sectionOrder: string[] = []; // Capture the order of keys from the JSON

  onAuthTypeChange(): void {
    console.log('Selected Template ID:', this.selectedTemplateId);
    if (this.selectedTemplateId !== null && this.selectedTemplateId !== 0) {
      // Mark auth type as selected so we show status details, etc.
      this.authTypeSelect = this.selectedAuthType !== 'sel';
      this.authService.getTemplate(this.selectedTemplateId).subscribe({
        next: (data: any) => {
          if (!data || !data[0].JsonContent) {
            console.error('API returned invalid data:', data);
            return;
          }
          try {
            // Parse the JSON configuration
            const parsedJson = JSON.parse(data[0].JsonContent);
            // Transform the new JSON structure into an object keyed by the original section name
            const configObj: any = {};
            if (parsedJson.sections && Array.isArray(parsedJson.sections)) {
              parsedJson.sections
                .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
                .forEach((section: any) => {
                  // Use the sectionName as the key (e.g., "Auth Details", "Additional Details", etc.)
                  const key = section.sectionName;
                  configObj[key] = section;
                });
            }
            this.config = configObj;
            this.sectionOrder = Object.keys(this.config).filter(section => !section.toLowerCase().includes('decision')).sort(
              (a, b) => (this.config[a].order || 0) - (this.config[b].order || 0)
            );

            console.log('Parsed config:', this.config);
          } catch (error) {
            console.error('Error parsing JSON content:', error);
            this.config = {};
          }
          // Build the formData from the configuration using the preserved section names
          this.formData = {};
          for (let section of this.sectionOrder) {
            if (section === 'Additional Details' && this.config[section]) {
              this.formData[section] = { expanded: true };
              // Iterate over each sub-section inside Additional Details (assumed to be under .subsections)
              for (let subSection in this.config['Additional Details'].subsections) {
                // Ensure fields is an array; if not, convert it.
                let fieldsArray = this.config['Additional Details'].subsections[subSection].fields;
                if (!Array.isArray(fieldsArray)) {
                  fieldsArray = Object.values(fieldsArray);
                  this.config['Additional Details'].subsections[subSection].fields = fieldsArray;
                }
                this.formData[section][subSection] = {
                  expanded: true,
                  entries: [this.createEmptyEntry(fieldsArray)]
                };
              }
            } else if (this.config[section]) {
              this.formData[section] = {
                expanded: true,
                entries: [this.createEmptyEntry(this.config[section].fields)],
                primaryIndex: null
              };
            }
          }
          // Loop over the configuration to process select fields with a datasource
          const datasourceMap = new Map<string, any[]>();
          this.sectionOrder.forEach((section: string) => {
            if (this.config[section]) {
              if (section === 'Additional Details') {
                Object.keys(this.config['Additional Details'].subsections).forEach(subSection => {
                  this.config['Additional Details'].subsections[subSection].fields.forEach((field: any) => {
                    if (field.type === 'select' && field.datasource) {
                      datasourceMap.set(field.datasource, []);
                    }
                  });
                });
              } else {
                this.config[section].fields.forEach((field: any) => {
                  if (field.type === 'select' && field.datasource) {
                    datasourceMap.set(field.datasource, []);
                  }
                });
              }
            }
          });

          datasourceMap.forEach((_, datasource) => {
            this.crudService.getData('um', datasource).subscribe(
              (serviceData: any[]) => {
                datasourceMap.set(datasource, serviceData);
                this.sectionOrder.forEach((section: string) => {
                  if (this.config[section]) {
                    if (section === 'Additional Details') {
                      Object.keys(this.config['Additional Details'].subsections).forEach(subSection => {
                        this.config['Additional Details'].subsections[subSection].fields.forEach((field: any) => {
                          if (field.type === 'select' && field.datasource === datasource) {
                            const expectedKey = field.datasource.toLowerCase();
                            console.log("datasource:", expectedKey);
                            const options = [
                              { value: '', label: 'Select' },
                              ...serviceData.map((item: any) => {
                                const actualKey = Object.keys(item).find(key => key.toLowerCase() === expectedKey);
                                console.log("datasource:", actualKey);
                                return {
                                  value: item.id,
                                  label: actualKey ? item[actualKey] : 'Unknown'
                                };
                              })
                            ];
                            field.options = options;
                            if (field.defaultValue) {
                              this.formData[section]['subSection'].entries.forEach((entry: any) => {
                                entry[field.id] = field.defaultValue;
                              });
                            }
                            if (!field.defaultValue) {
                              this.formData[section].entries.forEach((entry: any) => {
                                entry[field.id] = ''; // Set default to empty so "Select" is chosen
                              });
                            }
                          }
                        });
                      });
                    } else {
                      this.config[section].fields.forEach((field: any) => {
                        if (field.type === 'select' && field.datasource === datasource) {
                          const expectedKey = field.datasource.toLowerCase();
                          console.log("datasource:", expectedKey);
                          field.options = [
                            { value: '', label: 'Select' }, // Add 'Select' as the first option
                            ...serviceData.map((item: any) => {

                              const actualKey = Object.keys(item).find(key => key.toLowerCase() === expectedKey);
                              console.log("Actual matching key:", actualKey);
                              return {
                                value: item.id,
                                label: actualKey ? item[actualKey] : 'Unknown'
                              };
                            })
                          ];
                          if (field.defaultValue) {
                            this.formData[section].entries.forEach((entry: any) => {
                              entry[field.id] = field.defaultValue;
                            });
                          }
                          if (!field.defaultValue) {
                            this.formData[section].entries.forEach((entry: any) => {
                              entry[field.id] = ''; // Set default to empty so "Select" is chosen
                            });
                          }
                        }
                      });
                    }
                  }
                });
              },
              error => {
                console.error('Error fetching data for datasource:', datasource, error);
              }
            );
          });
          // Enable dynamic sections to load
          this.enrollmentSelect = true;
          //this.prepareDecisionData();
        },
        error: (err) => {
          console.error('Error fetching template:', err);
          this.config = {};
        }
      });
    } else {
      this.config = {};
      console.log('No valid template selected');
    }
  }


  createEmptyEntry(fields: any[]): any {
    let entry: any = {};
    fields.forEach(field => {
      entry[field.id] = null;
    });
    return entry;
  }

  toggleSection(section: string): void {
    if (!section) {
      console.error("toggleSection received an undefined section.");
      return;
    }
    this.formData[section].expanded = !this.formData[section].expanded;
  }

  addEntry(section: string, index: number): void {
    if (section === 'Additional Details') {
      console.error('Error: Section should include a subsection, like Additional Details.subSectionName');
      return;
    }
    if (section.startsWith('Additional Details.')) {
      const subSection = section.split('.')[1];
      if (!this.formData['Additional Details']) {
        this.formData['Additional Details'] = {};
      }
      if (!this.formData['Additional Details'][subSection]) {
        this.formData['Additional Details'][subSection] = {
          expanded: true,
          entries: []
        };
      }
      this.formData['Additional Details'][subSection].entries.splice(index + 1, 0, this.createEmptyEntry(this.config['Additional Details'].subsections[subSection].fields));
    } else {
      if (!this.formData[section]) {
        this.formData[section] = { expanded: true, entries: [] };
      }
      this.formData[section].entries.splice(index + 1, 0, this.createEmptyEntry(this.config[section].fields));
    }
  }

  removeEntry(section: string, index: number): void {
    if (section === 'Additional Details') {
      console.error('Error: Section should include a subsection, like Additional Details.subSectionName');
      return;
    }
    if (section.startsWith('Additional Details.')) {
      const subSection = section.split('.')[1];
      if (this.formData['Additional Details']?.[subSection]?.entries.length > 1) {
        this.formData['Additional Details'][subSection].entries.splice(index, 1);
      }
    } else {
      if (this.formData[section]?.entries.length > 1) {
        this.formData[section].entries.splice(index, 1);
      }
    }
  }

  setPrimary(section: string, index: number): void {
    this.formData[section].primaryIndex = index;
  }

  saveData(form: NgForm): void {
    if (form.invalid) {
      // Mark all fields as touched to trigger validation messages
      Object.keys(form.controls).forEach(field => {
        form.controls[field].markAsTouched({ onlySelf: true });
      });

      // Delay execution to allow Angular to render validation messages
      setTimeout(() => {
        // Get all visible validation messages
        const errorElements = Array.from(document.querySelectorAll('.text-danger'))
          .filter(el => el.clientHeight > 0); // Ensure only visible elements are considered

        if (errorElements.length > 0) {
          errorElements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 200); // Slight delay to allow validation messages to be displayed

      return;
    }
    this.authNumber = this.authNumberService.generateAuthNumber(9, true, true, false, false);
    console.log("Auth Number:", this.authNumber);
    const jsonData = {
      Data: [this.formData],
      CreatedOn: new Date().toISOString(),
      authNumber: this.authNumber
    };
    console.log("jsondata: ", jsonData);
    this.authService.saveAuthDetail(jsonData).subscribe(
      response => {
        console.log('Data saved successfully:', response);
        this.snackBar.open('Auth saved successfully!', 'Close', {
          horizontalPosition: 'center',
          verticalPosition: 'top',
          duration: 5000,
          panelClass: ['success-snackbar']
        });

        // Initialize decisionData with entries arrays
        this.decisionData = {
          serviceDetails: { ...this.formData['Service Details'] || {} },
          decisionDetails: {
            ...this.config['Decision Details'] || {},
            entries: this.formData['Service Details']?.entries.map((service: any, index: number) => ({
              decisionNumber: (index + 1).toString(),
              serviceCode: service.serviceCode || 'N/A',
              fromDate: service.fromDate || '',
              toDate: service.toDate || ''
            })) || []
          },
          decisionNotes: {
            ...this.config['Decision Notes'] || {},
            entries: this.formData['Service Details']?.entries.map(() => ({})) || []
          },
          decisionMemberInfo: {
            ...this.config['Member Provider Decision Info'] || {},
            entries: this.formData['Service Details']?.entries.map(() => ({})) || []
          }
        };
        console.log("Updated decisionData:", this.decisionData);

        // Move to "Decision Details" stepper
        this.stepperSelectedIndex = 1; // Navigate to Decision Details step
      },
      error => {
        console.error('Error saving data:', error);
      }
    );

    //localStorage.setItem('savedAuthData', JSON.stringify(jsonData));
    console.log("Data saved locally:", jsonData);
  }

  loadData(): void {
    const savedData = localStorage.getItem('savedAuthData');

    if (savedData) {
      const parsedData = JSON.parse(savedData);
      this.formData = parsedData.Data;
      this.authNumber = parsedData.authNumber;
      console.log("Data loaded successfully:", parsedData);
    } else {
      console.warn("No saved data found.");
    }
  }


  getFieldsByType(fields: any[], type: string): any[] {
    return fields.filter(field => field.type === type);
  }

  getNonButtonFields(fields: any[]): any[] {
    return fields.filter(field => field.type !== 'button');
  }

  selectedProviders: any[] = [];
  selectedProviderRowIndex: number = 0;

  openButtonDialog(field: any, section: string, rowIndex: number): void {
    const dialogRef = this.dialog.open(ProviderSearchComponent, {
      width: '1100px',
      maxWidth: '1100px'
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result && result.length) {
        this.selectedProviders = result;
        // Merge the first provider's data into the current row.
        this.formData[section].entries[rowIndex] = {
          ...this.formData[section].entries[rowIndex],
          ...result[0]
        };

        // For additional providers, add new rows and merge data.
        for (let idx = 1; idx < result.length; idx++) {
          this.addEntry(section, this.formData[section].entries.length - 1);
          const newRowIndex = this.formData[section].entries.length - 1;
          this.formData[section].entries[newRowIndex] = {
            ...this.formData[section].entries[newRowIndex],
            ...result[idx]
          };
        }
      } else {
        this.selectedProviders = [{}];
      }
    });
  }

  getAdditionalDetailsKeys(): string[] {
    return this.formData['Additional Details']
      ? Object.keys(this.formData['Additional Details']).filter(key => key !== 'expanded')
      : [];
  }

  get sectionKeys(): string[] {
    return this.config ? Object.keys(this.config) : ['Auth Details'];
  }

  // Helper methods for the template to check section names
  isProviderSection(section: string): boolean {
    return section === 'Provider Details';
  }
  isDiagnosisSection(section: string): boolean {
    return section === 'Diagnosis Details';
  }
  isServiceSection(section: string): boolean {
    return section === 'Service Details';
  }
  isSpecialSection(section: string): boolean {
    return this.isDiagnosisSection(section) || this.isProviderSection(section) || this.isServiceSection(section);
  }

  getNonRowLayoutFields(section: string): any[] {
    return this.config[section].fields.filter((field: any) => !field.layout || field.layout !== 'row');
  }

  getRowLayoutFields(section: string): any[] {
    return this.config[section].fields.filter((field: any) => field.layout === 'row');
  }

  // Receive saved decision data from DecisionDetailsComponent
  handleDecisionDataSaved(updatedDecisionData: any): void {
    // Update only the entries for Decision Details
    if (this.formData['Decision Details']) {
      this.formData['Decision Details'].entries = updatedDecisionData.decisionDetails.entries;
    } else {
      this.formData['Decision Details'] = { entries: updatedDecisionData.decisionDetails.entries };
    }

    // Update only the entries for Decision Notes
    if (this.formData['Decision Notes']) {
      this.formData['Decision Notes'].entries = updatedDecisionData.decisionNotes.entries;
    } else {
      this.formData['Decision Notes'] = { entries: updatedDecisionData.decisionNotes.entries };
    }

    // Update only the entries for Member Provider Decision Info
    if (this.formData['Member Provider Decision Info']) {
      this.formData['Member Provider Decision Info'].entries = updatedDecisionData.decisionMemberInfo.entries;
    } else {
      this.formData['Member Provider Decision Info'] = { entries: updatedDecisionData.decisionMemberInfo.entries };
    }

    console.log('Updated decision data received:', updatedDecisionData);
    console.log('Updated formData:', this.formData);
    this.saveData(this.formData);
  }

}
