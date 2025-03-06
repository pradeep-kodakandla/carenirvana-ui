import { Component, EventEmitter, Output } from '@angular/core';
import { NgForm } from '@angular/forms';
import { MemberService } from 'src/app/service/shared-member.service';
import { AuthService } from 'src/app/service/auth.service';
import { AuthNumberService } from 'src/app/service/auth-number-gen.service';
import { CrudService } from 'src/app/service/crud.service';
import { MatDialog } from '@angular/material/dialog';
import { ProviderSearchComponent } from 'src/app/Provider/provider-search/provider-search.component';

interface Tab {
  id: string;
  name: string;
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
  enrollmentSelect: boolean = false;
  selectedAuthType: string = 'sel';
  authTypeSelect: boolean = false;
  isExpanded = true;
  isStatusExpanded = true;
  authTemplates: any[] = [];
  selectedTemplateId: number = 0;
  newTemplateName: string = '';
  showTemplateNameError: boolean = false;

  selectedDiv: number | null = null;
  additionalInfo = [
    { dateIndicator: '', providerName: '', memberName: '', authNo: '' }
  ];
  tabs: Tab[] = [
    { id: '33501', name: '33501 (CPT) 01/01/2024 - 12/31/2024 - Pending' },
    { id: '23310', name: '23310 (ICD) 01/01/2024 - 12/31/2024 - Completed' }
  ];
  selectedTabId: string = this.tabs[0].id;

  // Added missing selectTab method
  selectTab(tabId: string): void {
    this.selectedTabId = tabId;
  }

  @Output() cancel = new EventEmitter<void>();

  onCancelClick(): void {
    this.cancel.emit();
    this.memberService.setIsCollapse(false);
  }

  formData: any = {};
  config: any; // Will be set to the array of sections from the JSON
  sectionOrder: string[] = []; // Array of section names in sorted order

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

  // Helper method to retrieve the configuration object for a given section name.
  getSectionConfig(sectionName: string): any {
    return this.config.find((s: any) => s.sectionName === sectionName);
  }

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
            const parsedJson = JSON.parse(data[0].JsonContent);
            if (parsedJson.sections) {
              // Sort sections by their "order" property and store as an array.
              this.config = parsedJson.sections.sort((a: any, b: any) => a.order - b.order);
              this.sectionOrder = this.config.map((section: any) => section.sectionName);
            } else {
              this.config = parsedJson;
              this.sectionOrder = Object.keys(this.config);
            }
            console.log('Parsed config:', this.config);
          } catch (error) {
            console.error('Error parsing JSON content:', error);
            this.config = {};
          }
          // Build the formData from the configuration using the preserved order.
          this.formData = {};
          for (let sectionName of this.sectionOrder) {
            let sectionConfig = this.getSectionConfig(sectionName);
            if (sectionConfig) {
              if (sectionConfig.subsections) {
                this.formData[sectionName] = { expanded: true };
                // Convert subsections object into an array sorted by order.
                const subsectionsArray = Object.values(sectionConfig.subsections).sort((a: any, b: any) => a.order - b.order);
                for (let subConfig of subsectionsArray as any[]) {
                  this.formData[sectionName][subConfig.sectionName] = {
                    expanded: true,
                    entries: [this.createEmptyEntry(subConfig.fields.sort((a: any, b: any) => a.order - b.order))]
                  };
                }
              } else if (sectionConfig.fields) {
                let sortedFields = sectionConfig.fields.sort((a: any, b: any) => a.order - b.order);
                this.formData[sectionName] = {
                  expanded: true,
                  entries: [this.createEmptyEntry(sortedFields)],
                  primaryIndex: null
                };
              }
            }
          }
          // Process datasources for select fields.
          const datasourceMap = new Map<string, any[]>();
          for (let sectionName of this.sectionOrder) {
            let sectionConfig = this.getSectionConfig(sectionName);
            if (sectionConfig) {
              if (sectionConfig.subsections) {
                Object.keys(sectionConfig.subsections).forEach(subSectionName => {
                  let subConfig = sectionConfig.subsections[subSectionName];
                  subConfig.fields.forEach((field: any) => {
                    if (field.type === 'select' && field.datasource) {
                      datasourceMap.set(field.datasource, []);
                    }
                  });
                });
              } else if (sectionConfig.fields) {
                sectionConfig.fields.forEach((field: any) => {
                  if (field.type === 'select' && field.datasource) {
                    datasourceMap.set(field.datasource, []);
                  }
                });
              }
            }
          }
          // Fetch and update datasource options.
          datasourceMap.forEach((_, datasource) => {
            this.crudService.getData('um', datasource).subscribe(
              (serviceData: any[]) => {
                datasourceMap.set(datasource, serviceData);
                for (let sectionName of this.sectionOrder) {
                  let sectionConfig = this.getSectionConfig(sectionName);
                  if (sectionConfig) {
                    if (sectionConfig.subsections) {
                      Object.keys(sectionConfig.subsections).forEach(subSectionName => {
                        let subConfig = sectionConfig.subsections[subSectionName];
                        subConfig.fields.forEach((field: any) => {
                          if (field.type === 'select' && field.datasource === datasource) {
                            const expectedKey = field.datasource.toLowerCase();
                            const options = serviceData.map((item: any) => {
                              const actualKey = Object.keys(item).find(key => key.toLowerCase() === expectedKey);
                              return {
                                value: item.id,
                                label: actualKey ? item[actualKey] : 'Unknown'
                              };
                            });
                            field.options = options;
                            if (field.defaultValue) {
                              this.formData[sectionName][subSectionName].entries.forEach((entry: any) => {
                                entry[field.id] = field.defaultValue;
                              });
                            }
                          }
                        });
                      });
                    } else if (sectionConfig.fields) {
                      sectionConfig.fields.forEach((field: any) => {
                        if (field.type === 'select' && field.datasource === datasource) {
                          const expectedKey = field.datasource.toLowerCase();
                          field.options = serviceData.map((item: any) => {
                            const actualKey = Object.keys(item).find(key => key.toLowerCase() === expectedKey);
                            return {
                              value: item.id,
                              label: actualKey ? item[actualKey] : 'Unknown'
                            };
                          });
                          if (field.defaultValue) {
                            this.formData[sectionName].entries.forEach((entry: any) => {
                              entry[field.id] = field.defaultValue;
                            });
                          }
                        }
                      });
                    }
                  }
                }
              },
              error => {
                console.error('Error fetching data for datasource:', datasource, error);
              }
            );
          });
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
    if (section.indexOf('.') !== -1) {
      const parts = section.split('.');
      const mainSection = parts[0];
      const subSection = parts[1];
      if (!this.formData[mainSection]) {
        console.error('Main section not found in formData');
        return;
      }
      if (!this.formData[mainSection][subSection]) {
        let mainConfig = this.getSectionConfig(mainSection);
        if (mainConfig && mainConfig.subsections && mainConfig.subsections[subSection]) {
          let sortedFields = mainConfig.subsections[subSection].fields.sort((a: any, b: any) => a.order - b.order);
          this.formData[mainSection][subSection] = { expanded: true, entries: [] };
        } else {
          console.error("Subsection config not found");
          return;
        }
      }
      let mainConfig = this.getSectionConfig(mainSection);
      let subConfig = mainConfig.subsections[subSection];
      let sortedFields = subConfig.fields.sort((a: any, b: any) => a.order - b.order);
      this.formData[mainSection][subSection].entries.splice(index + 1, 0, this.createEmptyEntry(sortedFields));
    } else {
      let sectionConfig = this.getSectionConfig(section);
      if (!this.formData[section]) {
        this.formData[section] = { expanded: true, entries: [] };
      }
      let sortedFields = sectionConfig.fields.sort((a: any, b: any) => a.order - b.order);
      this.formData[section].entries.splice(index + 1, 0, this.createEmptyEntry(sortedFields));
    }
  }

  removeEntry(section: string, index: number): void {
    if (section.indexOf('.') !== -1) {
      const parts = section.split('.');
      const mainSection = parts[0];
      const subSection = parts[1];
      if (this.formData[mainSection]?.[subSection]?.entries.length > 1) {
        this.formData[mainSection][subSection].entries.splice(index, 1);
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
        this.selectedProviders = [{}];
      }
    });
  }

  getAdditionalDetailsKeys(): string[] {
    return this.formData["Additional Details"]
      ? Object.keys(this.formData["Additional Details"]).filter(key => key !== 'expanded')
      : [];
  }

  // Method to set selected div (if needed elsewhere)
  selectDiv(index: number): void {
    this.selectedDiv = index;
    this.enrollmentSelect = true;
    this.sectionOrder = this.config ? Object.keys(this.config) : ['Auth Details'];
  }

}
