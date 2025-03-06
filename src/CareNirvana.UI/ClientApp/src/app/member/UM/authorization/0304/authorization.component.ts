import { Component, EventEmitter, Output } from '@angular/core';
import { NgForm } from '@angular/forms';
import { MemberService } from 'src/app/service/shared-member.service';
import { AuthService } from 'src/app/service/auth.service';
import { AuthNumberService } from 'src/app/service/auth-number-gen.service';

import { CrudService } from 'src/app/service/crud.service';
import { MatDialog } from '@angular/material/dialog';
import { ProviderSearchComponent } from 'src/app/Provider/provider-search/provider-search.component';

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
  ) { }

  highlightedSection: string | null = null;
  highlightedItem: string | null = null;
  // Remove dependence on clicking a rounded-box:
  enrollmentSelect: boolean = false;
  selectedAuthType: string = 'sel';
  authTypeSelect: boolean = false;
  isExpanded = true;
  isStatusExpanded = true;
  authTemplates: any[] = [];
  selectedTemplateId: number = 0;
  newTemplateName: string = '';
  showTemplateNameError: boolean = false;

  // Method to set selected div (if needed elsewhere)
  selectDiv(index: number): void {
    this.selectedDiv = index;
    this.enrollmentSelect = true;
    this.sectionOrder = this.config ? Object.keys(this.config) : ['authDetails'];
  }

  selectedDiv: number | null = null;
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
            this.config = parsedJson;
            // Capture the order of the keys as they appear in the JSON
            this.sectionOrder = Object.keys(this.config);
            console.log('Parsed config:', this.config);
          } catch (error) {
            console.error('Error parsing JSON content:', error);
            this.config = {};
          }
          // Build the formData from the configuration using the preserved order
          this.formData = {};
          for (let section of this.sectionOrder) {
            if (section === 'additionalDetails' && this.config[section]) {
              this.formData[section] = { expanded: true };
              // Iterate over each sub-section inside additionalDetails
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
          // Loop over the configuration to process select fields with a datasource
          // Create a map to store unique datasources
          const datasourceMap = new Map<string, any[]>();

          // Iterate through all sections and gather fields with a datasource
          this.sectionOrder.forEach((section: string) => {
            if (this.config[section]) {
              if (section === 'additionalDetails') {
                // Handle nested sections in 'additionalDetails'
                Object.keys(this.config.additionalDetails).forEach(subSection => {
                  this.config.additionalDetails[subSection].forEach((field: any) => {
                    if (field.type === 'select' && field.datasource) {
                      datasourceMap.set(field.datasource, []);
                    }
                  });
                });
              } else {
                // Handle top-level sections
                this.config[section].forEach((field: any) => {
                  if (field.type === 'select' && field.datasource) {
                    datasourceMap.set(field.datasource, []);
                  }
                });
              }
            }
          });

          // **Avoid Duplicate API Calls** - Fetch Data for Each Unique `datasource`
          datasourceMap.forEach((_, datasource) => {
            this.crudService.getData('um', datasource).subscribe(
              (serviceData: any[]) => {
                // Store fetched options in the map
                datasourceMap.set(datasource, serviceData);

                // Process sections again to apply fetched options
                this.sectionOrder.forEach((section: string) => {
                  if (this.config[section]) {
                    if (section === 'additionalDetails') {
                      Object.keys(this.config.additionalDetails).forEach(subSection => {
                        this.config.additionalDetails[subSection].forEach((field: any) => {
                          if (field.type === 'select' && field.datasource === datasource) {
                            const expectedKey = field.datasource.toLowerCase();
                            console.log("datasource:", expectedKey);
                            const options = serviceData.map((item: any) => {
                              const actualKey = Object.keys(item).find(key => key.toLowerCase() === expectedKey);
                              console.log("datasource:", actualKey);
                              return {
                                value: item.id, // Adjust if needed
                                label: actualKey ? item[actualKey] : 'Unknown' // Adjust if needed
                              };
                            });
                            field.options = options;

                            // Set the default value if specified
                            if (field.defaultValue) {
                              this.formData[section][subSection].entries.forEach((entry: any) => {
                                entry[field.id] = field.defaultValue;
                              });
                            }
                          }
                        });
                      });
                    } else {
                      // Handle top-level sections
                      // Handle top-level sections
                      this.config[section].forEach((field: any) => {
                        if (field.type === 'select' && field.datasource === datasource) {
                          const expectedKey = field.datasource.toLowerCase();
                          console.log("datasource:", expectedKey);

                          field.options = serviceData.map((item: any) => {
                            // Find the matching key in serviceData (ignoring case)
                            const actualKey = Object.keys(item).find(key => key.toLowerCase() === expectedKey);
                            console.log("Actual matching key:", actualKey);

                            return {
                              value: item.id, // Adjust if needed
                              label: actualKey ? item[actualKey] : 'Unknown' // Adjust if needed
                            };
                          });

                          // Set the default value if specified
                          if (field.defaultValue) {
                            this.formData[section].entries.forEach((entry: any) => {
                              entry[field.id] = field.defaultValue;
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

          // Now enable the dynamic sections to load
          this.enrollmentSelect = true;
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
    this.formData[section].expanded = !this.formData[section].expanded;
  }

  addEntry(section: string, index: number): void {
    if (section === 'additionalDetails') {
      console.error('Error: Section should include a subsection, like additionalDetails.additionalInfo');
      return;
    }
    if (section.startsWith('additionalDetails.')) {
      const subSection = section.split('.')[1];
      if (!this.formData.additionalDetails) {
        this.formData.additionalDetails = {};
      }
      if (!this.formData.additionalDetails[subSection]) {
        this.formData.additionalDetails[subSection] = {
          expanded: true,
          entries: []
        };
      }
      this.formData.additionalDetails[subSection].entries.splice(index + 1, 0, this.createEmptyEntry(this.config.additionalDetails[subSection]));
    } else {
      if (!this.formData[section]) {
        this.formData[section] = { expanded: true, entries: [] };
      }
      this.formData[section].entries.splice(index + 1, 0, this.createEmptyEntry(this.config[section]));
    }
  }

  removeEntry(section: string, index: number): void {
    if (section === 'additionalDetails') {
      console.error('Error: Section should include a subsection, like additionalDetails.additionalInfo');
      return;
    }
    if (section.startsWith('additionalDetails.')) {
      const subSection = section.split('.')[1];
      if (this.formData.additionalDetails?.[subSection]?.entries.length > 1) {
        this.formData.additionalDetails[subSection].entries.splice(index, 1);
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
      Object.keys(form.controls).forEach(field => {
        form.controls[field].markAsTouched({ onlySelf: true });
      });
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
      },
      error => {
        console.error('Error saving data:', error);
      }
    );
  }

  getFieldsByType(fields: any[], type: string): any[] {
    return fields.filter(field => field.type === type);
  }

  getNonButtonFields(fields: any[]): any[] {
    return fields.filter(field => field.type !== 'button');
  }

  selectedProviders: any[] = [];
  selectedProviderRowIndex: number = 0;


  //openButtonDialog(field: any, section: string): void {
  //  const dialogRef = this.dialog.open(ProviderSearchComponent, {
  //    width: '900px',
  //    // You can pass data if needed: data: { someValue: 123 }
  //  });

  //  // After dialog is closed, you can capture the selected providers
  //  dialogRef.afterClosed().subscribe((result) => {
  //    if (result && result.length) {
  //      // If one or more providers are selected, update the field sets accordingly.
  //      this.selectedProviders = result;
  //    } else {
  //      // If no provider was selected, keep one blank field set.
  //      this.selectedProviders = [{}];
  //    }
  //    console.log('Provider Data:', this.selectedProviders);
  //  });
  //}
  //openButtonDialog(field: any, section: string, rowIndex: number): void {
  //  const dialogRef = this.dialog.open(ProviderSearchComponent, {
  //    width: '900px',
  //  });

  //  dialogRef.afterClosed().subscribe((result) => {
  //    if (result && result.length) {
  //      this.selectedProviders = result;
  //      result.forEach((provider: any, idx: number) => {
  //        if (idx === 0) {
  //          // For the first provider, update the current row.
  //          this.formData[section].entries[rowIndex].providerRole = provider.role;
  //          this.formData[section].entries[rowIndex].providerName = provider.name;
  //          this.formData[section].entries[rowIndex].providerId = provider.id;
  //          this.formData[section].entries[rowIndex].providerPhone = provider.phone;
  //          this.formData[section].entries[rowIndex].providerLocation = provider.location;
  //          this.formData[section].entries[rowIndex].providerSpecialty = provider.specialty;
  //        } else {
  //          // For additional providers, add a new row and update that new row.
  //          this.addEntry(section, this.formData[section].entries.length - 1);
  //          const newRowIndex = this.formData[section].entries.length - 1;
  //          this.formData[section].entries[newRowIndex].providerRole = provider.role;
  //          this.formData[section].entries[newRowIndex].providerName = provider.name;
  //          this.formData[section].entries[newRowIndex].providerId = provider.id;
  //          this.formData[section].entries[newRowIndex].providerPhone = provider.phone;
  //          this.formData[section].entries[newRowIndex].providerLocation = provider.location;
  //          this.formData[section].entries[newRowIndex].providerSpecialty = provider.specialty;
  //        }
  //      });
  //    } else {
  //      // If no providers were selected, you might choose to clear the data or leave as-is.
  //      this.selectedProviders = [{}];
  //    }
  //  });
  //}

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

        // For additional providers, add a new row for each and merge the data.
        for (let idx = 1; idx < result.length; idx++) {
          this.addEntry(section, this.formData[section].entries.length - 1);
          const newRowIndex = this.formData[section].entries.length - 1;
          this.formData[section].entries[newRowIndex] = {
            ...this.formData[section].entries[newRowIndex],
            ...result[idx]
          };
        }
      } else {
        // If no provider is selected, you can decide whether to clear or leave the row unchanged.
        this.selectedProviders = [{}];
      }
    });
  }

  getAdditionalDetailsKeys(): string[] {
    return this.formData.additionalDetails
      ? Object.keys(this.formData.additionalDetails).filter(key => key !== 'expanded')
      : [];
  }
  get sectionKeys(): string[] {
    return this.config ? Object.keys(this.config) : ['authDetails'];
  }
}
