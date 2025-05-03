import { Component, EventEmitter, Output, Input, QueryList, ElementRef, ViewChildren } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NgForm } from '@angular/forms';
import { MemberService } from 'src/app/service/shared-member.service';
import { AuthService } from 'src/app/service/auth.service';
import { AuthNumberService } from 'src/app/service/auth-number-gen.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CrudService } from 'src/app/service/crud.service';
import { MatDialog } from '@angular/material/dialog';
import { ProviderSearchComponent } from 'src/app/Provider/provider-search/provider-search.component';
import { HeaderService } from 'src/app/service/header.service';
import { ValidationErrorDialogComponent } from 'src/app/member/validation-error-dialog/validation-error-dialog.component';
import { AuthenticateService } from 'src/app/service/authentication.service';

@Component({
  selector: 'app-authorization',
  templateUrl: './authorization.component.html',
  styleUrls: ['./authorization.component.css']
})
export class AuthorizationComponent {
  stepperSelectedIndex = 0;
  @Input() authNumber: string = '';
  @Input() memberId!: number;


  constructor(
    private memberService: MemberService,
    private authService: AuthService,
    private authNumberService: AuthNumberService,
    private dialog: MatDialog,
    private crudService: CrudService,
    private snackBar: MatSnackBar,
    private route: ActivatedRoute,
    private headerService: HeaderService,
    private authenticateService: AuthenticateService
  ) { }

  highlightedSection: string | null = null;
  highlightedItem: string | null = null;
  enrollmentSelect: boolean = false;
  selectedAuthType: string = 'sel';
  authTypeSelect: boolean = false;
  isExpanded = true;
  isStatusExpanded = true;
  authTemplates: any[] = [];
  authClass: any[] = [];
  selectedTemplateId: number = 0;
  selectedAuthClassId: number = 0;
  newTemplateName: string = '';
  showTemplateNameError: boolean = false;
  saveType: string = '';
  saveTypeFrom: string = '';
  displayLabels: { [key: string]: string } = {};

  newAuthNumber: string | null = null;
  showAuthorizationComponent = false;

  DecisionFields: any = {};
  decisionData: any = {};

  authorizationNotesFields: any = []; // Fields JSON
  authorizationNotesData: any = []; // Data JSON

  authorizationDocumentFields: any = []; // Fields JSON
  authorizationDocumentData: any = []; // Data JSON


  isEditMode: boolean = false;
  isSaveSuccessful: boolean = false;

  providerFieldsVisible: boolean = false;

  filteredOptions: { [key: string]: any[] } = {};
  showDropdown: { [key: string]: boolean } = {};
  focusedField: string = '';
  hoveredIndexMap: { [key: string]: number } = {};

  allCodesets: any[] = [];
  filteredIcdCodes: any[] = [];
  filteredServiceCodes: any[] = [];

  validationRules: any[] = [];

  sectionValidationMessages: { [sectionName: string]: string[] } = {};

  allUsers: any[] = [];

  usersLoaded: boolean = false;

  loggedInUsername: string = '';

  //********** Method to highlight the selected section and autocomplete ************//

  filterOptions(field: any, inputValue: string, section: string, index: number) {
    const key = `${section}_${index}_${field.id}`;

    if (field.id === 'icd10Code' || field.id === 'serviceCode') {
      const type = field.id === 'icd10Code' ? 'ICD' : 'CPT';
      const filtered = this.allCodesets
        .filter(code => code.type === type && code.code.toLowerCase().includes((inputValue || '').toLowerCase()))
        .map(code => ({
          value: code.code,
          label: `${code.code} - ${code.codeDesc || ''}`
        }));

      this.filteredOptions[key] = filtered;
      this.showDropdown[key] = true;
    } else if (field.options) {
      this.filteredOptions[key] = field.options.filter((opt: any) =>
        opt.label.toLowerCase().includes((inputValue || '').toLowerCase())
      );
      this.showDropdown[key] = true;
    }
  }


  selectOption(selectedLabel: string, entry: any, fieldId: string, section: string, index: number) {
    const key = `${section}_${index}_${fieldId}`;
    const selected = this.filteredOptions[key]?.find(opt => opt.label === selectedLabel);
    if (selected) {
      entry[fieldId] = selected.value; // Save the ID
      this.displayLabels[`${fieldId}_${index}_${section}`] = selected.label; // Store label for display
      if (fieldId === 'authWorkList' && section === 'Status Details') {
        this.updateAuthWorkBasketUserState(section, entry);
      }
    }
    this.showDropdown[key] = false;
  }


  onFocus(field: any, section: string, index: number): void {
    const key = `${section}_${index}_${field.id}`;
    this.focusedField = key;
    if (field.id === 'icd10Code' || field.id === 'serviceCode') {
      this.filterOptions(field, '', section, index); // ✅ Show full list on focus
    } else {
      this.filteredOptions[key] = field.options || [];
      this.showDropdown[key] = true;
    }
  }

  onBlur(field: any, section: string, index: number) {
    const key = `${section}_${index}_${field.id}`;
    setTimeout(() => {
      this.showDropdown[key] = false;
      this.focusedField = '';
    }, 200); // delay to allow click
  }

  handleKeydown(event: KeyboardEvent, field: any, section: string, index: number, entry: any) {
    const key = `${section}_${index}_${field.id}`;
    const options = this.filteredOptions[key] || [];

    if (field.type !== 'select') return;

    if (!options.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.hoveredIndexMap[key] = (this.hoveredIndexMap[key] ?? -1) + 1;
      if (this.hoveredIndexMap[key] >= options.length) this.hoveredIndexMap[key] = 0;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.hoveredIndexMap[key] = (this.hoveredIndexMap[key] ?? options.length) - 1;
      if (this.hoveredIndexMap[key] < 0) this.hoveredIndexMap[key] = options.length - 1;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation(); // ✅ This is the fix!

      const hovered = options[this.hoveredIndexMap[key]];
      if (hovered) {
        this.selectOption(hovered.label, entry, field.id, section, index);
      }
      return;
    }

    if (event.key === 'Escape') {
      this.showDropdown[key] = false;
    }
  }
  //********** Method to highlight the selected section and autocomplete ************//


  //********** Method to display the datetime ************//

  @ViewChildren('pickerRef') datetimePickers!: QueryList<ElementRef<HTMLInputElement>>;


  handleDateTimeBlur(entry: any, fieldId: string, field: any): void {
    const input = (entry[fieldId] || '').trim().toUpperCase();
    let baseDate = new Date();
    let finalDate: Date | null = null;

    if (input === 'D') {
      finalDate = baseDate;
    } else if (/^D\+(\d+)$/.test(input)) {
      const daysToAdd = parseInt(input.match(/^D\+(\d+)$/)![1], 10);
      baseDate.setDate(baseDate.getDate() + daysToAdd);
      finalDate = baseDate;
    } else if (/^D-(\d+)$/.test(input)) {
      const daysToSubtract = parseInt(input.match(/^D-(\d+)$/)![1], 10);
      baseDate.setDate(baseDate.getDate() - daysToSubtract);
      finalDate = baseDate;
    } else {
      const parsed = new Date(input);
      if (!isNaN(parsed.getTime())) {
        finalDate = parsed;
      } else {
        return; // Invalid input, don't update
      }
    }

    if (finalDate) {
      entry[fieldId] = field.dateOnly
        ? this.formatDateOnly(finalDate)
        : this.formatToEST(finalDate);
    }
  }


  formatForInput(value: string): string {
    if (!value) return '';
    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 16); // 'YYYY-MM-DDTHH:mm'
  }


  handleNativePicker(event: Event, entry: any, fieldId: string, field: any): void {
    const input = event.target as HTMLInputElement;
    const value = input?.value;
    if (!value) return;

    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) return;

    if (field.dateOnly) {
      // ✅ Format to just MM/DD/YYYY in EST
      const formattedDate = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
      }).format(parsed);

      entry[fieldId] = formattedDate;
    } else {
      // Format to MM/DD/YYYY HH:mm:ss in EST
      const formattedDateTime = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }).format(parsed).replace(',', '');

      entry[fieldId] = formattedDateTime;
    }
  }

  openNativePicker(picker: HTMLInputElement): void {
    if ('showPicker' in picker && typeof picker.showPicker === 'function') {
      picker.showPicker();
    } else {
      picker.click();
    }
  }

  openNativePickerByIndex(index: number): void {
    const picker = this.datetimePickers.toArray()[index]?.nativeElement;
    if (picker) {
      if ('showPicker' in picker && typeof (picker as any).showPicker === 'function') {
        (picker as any).showPicker();
      } else {
        picker.click();
      }
    }
  }

  triggerPicker(elementId: string): void {
    const hiddenInput = document.getElementById('native_' + elementId) as HTMLInputElement;
    if (hiddenInput) {
      if ('showPicker' in hiddenInput && typeof hiddenInput.showPicker === 'function') {
        hiddenInput.showPicker();
      } else {
        hiddenInput.click();
      }
    } else {
      console.warn('Picker not found for ID:', elementId);
    }
  }



  //********** Method to display the datetime ************//



  // Method to set selected div (if needed elsewhere)
  selectDiv(index: number): void {
    this.selectedDiv = index;
    this.enrollmentSelect = true;
    this.sectionOrder = this.config
      ? Object.keys(this.config).filter(section => !section.toLowerCase().includes('decision')).sort((a, b) => (this.config[a].order || 0) - (this.config[b].order || 0))
      : ['Auth Details'];

    this.sectionOrderAll = this.config
      ? Object.keys(this.config).sort((a, b) => (this.config[a].order || 0) - (this.config[b].order || 0))
      : ['Auth Details'];
  }

  selectedDiv: number | null = null;
  additionalInfo = [
    { label: "Auth No", value: "N/A" },
    { label: "Auth Type", value: "N/A" },
    { label: "Due Date", value: "N/A" },
    { label: "Days Left", value: "N/A" },
    { label: "Request Priority", value: "N/A" },
    { label: "Auth Owner", value: "N/A" },
    { label: "Auth Status", value: "N/A" },
    { label: "Overall Status", value: "N/A" }
  ];

  @Output() cancel = new EventEmitter<void>();

  onCancelClick(): void {
    this.cancel.emit();
    this.memberService.setIsCollapse(false);
    this.showAuthorizationComponent = true;
  }

  formData: any = {};
  config: any; // JSON configuration loaded dynamically

  ngOnInit(): void {

    this.route.paramMap.subscribe(params => {
      this.newAuthNumber = params.get('authNo'); // Extract authNumber
      this.memberId = Number(params.get('memberId'));
    });

    if (!this.newAuthNumber || this.newAuthNumber === 'DRAFT') {
      this.selectDiv(1);
    }

    if (this.newAuthNumber && this.newAuthNumber != 'DRAFT') {
      this.isEditMode = true;
      this.getAuthDataByAuthNumber(this.newAuthNumber);
    }

    this.loggedInUsername = sessionStorage.getItem('loggedInUsername') || '';

    console.log('Logged in username:', this.loggedInUsername);
    this.loadAuthClass();

    this.loadCodesetsByType();

    this.loadAllUsers();

  }

  loadAllUsers(): void {
    this.authenticateService.getAllUsers().subscribe({
      next: (users: any[]) => {
        this.allUsers = users || [];
        this.usersLoaded = true;

        // 🔥 If config is already loaded, patch now
        if (this.config && this.config['Status Details']) {
          this.patchStatusDetailsUsers();
        }
      },
      error: (err) => {
        console.error('Failed to load users:', err);
        this.usersLoaded = false;
      }
    });
  }





  loadCodesetsByType(): void {
    const typesToLoad = ['ICD', 'CPT'];

    typesToLoad.forEach(type => {
      this.authService.getAllCodesets(type).subscribe({
        next: (data: any[]) => {
          const mapped = data.map(code => ({
            code: code.code,
            codeDesc: code.codeDesc,
            type: type,
            label: `${code.code} - ${code.codeDesc || ''}`,
            value: code.code
          }));

          this.allCodesets = [...this.allCodesets, ...mapped];
        },
        error: (err) => {
          console.error(`Failed to load codesets for type ${type}`, err);
        }
      });
    });
  }


  getAuthDataByAuthNumber(authNumber: string): void {
    this.authService.getAuthDataByAuthNumber(authNumber).subscribe(
      (data) => {
        this.formData = data; // Assuming this is the structure required
        if (data) {
          this.selectDiv(1);

          let savedData = data[0]?.responseData;
          const authTemplateId = data[0]?.AuthTypeId || 0;
          const authClassId = data[0]?.AuthClassId || 0;

          if (authClassId) {
            this.selectedAuthClassId = authClassId;

            // First load templates for this class, then continue
            this.authService.getAuthTemplates(authClassId).subscribe({
              next: (templates: any[]) => {
                this.authTemplates = [
                  { Id: 0, TemplateName: 'Select Auth Type' },
                  ...templates
                ];
              }
            });
          }


          if (authTemplateId) {

            this.selectedTemplateId = authTemplateId;
            this.onAuthTypeChange();
            // Trigger onAuthTypeChange() and ensure it completes before loading data
            setTimeout(() => {

              if (savedData) {
                try {
                  if (typeof savedData === 'string') {
                    savedData = JSON.parse(savedData); // Parse only if it's a string
                  }

                  if (Array.isArray(savedData)) {
                    savedData = savedData[0]; // Extract first object if wrapped in an array
                  }

                  this.formData = savedData; // Assign the correctly parsed object
                  this.authNumber = data[0]?.AuthNumber;
                  this.saveType = 'Update';

                  if (savedData && savedData['Authorization Notes']) {
                    this.authorizationNotesData = savedData['Authorization Notes'].entries || [];
                  }

                  if (savedData && savedData['Authorization Documents']) {
                    this.authorizationDocumentData = savedData['Authorization Documents'].entries || [];
                  }

                  //this.restoreDisplayLabels();

                  this.loadDecisionData();

                  const authTypeName = this.authTemplates.find(t => t.Id === data[0]?.AuthTypeId)?.TemplateName || 'N/A';

                  // Update additionalInfo dynamically
                  this.additionalInfo = [
                    { label: "Auth No", value: data[0]?.AuthNumber || "N/A" },
                    { label: "Auth Type", value: authTypeName || "N/A" },
                    { label: "Due Date", value: this.formatDateOnly(new Date(data[0]?.AuthDueDate)) || "N/A" },
                    { label: "Days Left", value: this.calculateDaysLeft(data[0]?.AuthDueDate) || "N/A" },
                    { label: "Request Priority", value: savedData?.RequestPriority || "N/A" },
                    { label: "Auth Owner", value: savedData?.AuthOwner || "N/A" },
                    { label: "Auth Status", value: savedData?.AuthStatus || "N/A" },
                    { label: "Overall Status", value: savedData?.OverallStatus || "N/A" }
                  ];

                  const providerSection = this.formData?.['Provider Details'];
                  if (providerSection?.entries?.some((entry: any) => entry?.providerName?.trim())) {
                    this.providerFieldsVisible = true;
                  } else {
                    this.providerFieldsVisible = false;
                  }

                  this.restoreDisplayLabels();

                } catch (error) {
                  console.error('Error parsing Data:', error);
                }
              } else {
                console.warn('No Data found in response.');
              }
            }, 500);
          } else {
            console.warn("No authTemplateId found, skipping onAuthTypeChange.");
          }

        } else {
          console.warn("No authorization data returned for:", authNumber);
        }
      },
      (error) => {
        console.error('Error fetching authorization data:', error);
      }
    );
  }

  private calculateDaysLeft(dueDate: string): number {
    if (!dueDate) return 0;
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Convert ms to days
  }

  //private formatDate(dateString: string): string {
  //  if (!dateString) return "N/A";
  //  const date = new Date(dateString);
  //  return date.toISOString().split('T')[0]; // Extracts only YYYY-MM-DD
  //}

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

  sectionOrder: string[] = []; // Capture the order of keys from the JSON
  sectionOrderAll: string[] = []; // Capture the order of keys from the JSON

  onAuthTypeChange(): void {

    if (this.selectedTemplateId !== null && this.selectedTemplateId !== 0) {
      this.authTypeSelect = this.selectedAuthType !== 'sel';

      this.authService.getTemplate(this.selectedTemplateId).subscribe({
        next: (data: any) => {
          if (!data || !data[0]?.JsonContent) {
            console.error('API returned invalid data:', data);
            return;
          }
          try {

            const parsedJson = JSON.parse(data[0].JsonContent);
            const configObj: any = {};

            if (parsedJson.sections && Array.isArray(parsedJson.sections)) {
              parsedJson.sections
                .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
                .forEach((section: any) => {
                  if (section.sectionName) {
                    configObj[section.sectionName] = section;
                  }
                });
            }

            this.config = configObj;

            this.sectionOrder = Object.keys(this.config)
              .filter(section => !section.toLowerCase().includes('decision'))
              .sort((a, b) => (this.config[a]?.order || 0) - (this.config[b]?.order || 0));

            this.sectionOrderAll = Object.keys(this.config)
              .sort((a, b) => (this.config[a]?.order || 0) - (this.config[b]?.order || 0));

            if (this.usersLoaded && this.config['Status Details']) {
              this.patchStatusDetailsUsers();
            }
          } catch (error) {
            console.error('Error parsing JSON content:', error);
            this.config = {};
          }


          // Initialize formData
          this.formData = {};
          for (let section of this.sectionOrder) {
            if (section === 'Additional Details' && this.config[section]) {
              this.formData[section] = { expanded: true };

              if (this.config[section].subsections) {
                for (let subSection in this.config[section].subsections) {
                  let fieldsArray = this.config[section].subsections[subSection]?.fields || [];
                  if (!Array.isArray(fieldsArray)) {
                    fieldsArray = Object.values(fieldsArray);
                    this.config[section].subsections[subSection].fields = fieldsArray;
                  }
                  this.formData[section][subSection] = {
                    expanded: true,
                    entries: [this.createEmptyEntry(fieldsArray)]
                  };
                }
              }
            } else if (this.config[section]) {
              this.formData[section] = {
                expanded: true,
                entries: [this.createEmptyEntry(this.config[section]?.fields || [])],
                primaryIndex: null
              };

              // Loop over fields in Diagnosis Details
              const diagFields = this.config['Diagnosis Details']?.fields || [];
              const icdField = diagFields.find((f: any) => f.id === 'icd10Code' && Array.isArray(f.selectedOptions));

              if (icdField) {
                this.populateSelectedOptions('Diagnosis Details', 'icd10Code', icdField.selectedOptions);
              }

              // Loop over fields in Service Details
              const servFields = this.config['Service Details']?.fields || [];
              const serviceField = servFields.find((f: any) => f.id === 'serviceCode' && Array.isArray(f.selectedOptions));

              if (serviceField) {
                this.populateSelectedOptions('Service Details', 'serviceCode', serviceField.selectedOptions);
              }
            }
          }

          // 🔥 After creating formData entries, set authActualOwner field
          if (this.formData['Status Details']?.entries?.length) {
            this.formData['Status Details'].entries.forEach((entry: any) => {
              if (!entry['authAssignedTo']) {
                entry['authActualOwner'] = this.loggedInUsername;
              } else {
                entry['authActualOwner'] = '';
              }
            });
          }

          if (this.formData['Status Details']?.entries?.length) {
            this.formData['Status Details'].entries.forEach((entry: any) => {

              let assignedUserName = entry['authActualOwner'];

              if (assignedUserName) {
                // 🔥 Find UserId matching authAssignedTo
                const matchedUser = this.allUsers.find(user => user.UserName === assignedUserName);
                if (matchedUser) {
                  entry['authActualOwner'] = matchedUser.UserId; // ✅ Set correct UserId
                } else {
                  entry['authActualOwner'] = '';
                }
              } else {
                // 🔥 No authAssignedTo → default to logged-in user
                const matchedLoggedInUser = this.allUsers.find(user => user.UserName === this.loggedInUsername);
                if (matchedLoggedInUser) {
                  entry['authActualOwner'] = matchedLoggedInUser.UserId; // ✅ Set correct UserId
                } else {
                  entry['authActualOwner'] = '';
                }
              }

            });
          }
          this.restoreDisplayLabels();

          // Process select fields with a datasource
          const datasourceMap = new Map<string, any[]>();

          this.sectionOrderAll.forEach((section: string) => {
            if (this.config[section]) {
              if (section === 'Additional Details' && this.config[section].subsections) {
                Object.keys(this.config[section].subsections).forEach(subSection => {
                  this.config[section].subsections[subSection]?.fields?.forEach((field: any) => {
                    if (field.type === 'select' && field.datasource) {
                      datasourceMap.set(field.datasource, []);
                    }
                  });
                });
              } else {
                this.config[section]?.fields?.forEach((field: any) => {
                  if (field.layout === 'row' && Array.isArray(field.fields)) {
                    field.fields.forEach((subField: any) => {
                      if (subField.type === 'select' && subField.datasource) {
                        datasourceMap.set(subField.datasource, []);
                      }
                    });
                  } else if (field.type === 'select' && field.datasource) {
                    datasourceMap.set(field.datasource, []);
                  }
                });
              }
            }
          });

          let remaining = datasourceMap.size;

          datasourceMap.forEach((_, datasource) => {
            this.crudService.getData('um', datasource).subscribe(
              (serviceData: any[]) => {
                datasourceMap.set(datasource, serviceData);
                this.sectionOrderAll.forEach((section: string) => {
                  if (this.config[section]) {
                    if (section === 'Additional Details' && this.config[section].subsections) {
                      Object.keys(this.config[section].subsections).forEach(subSection => {
                        this.config[section].subsections[subSection]?.fields?.forEach((field: any) => {

                          if (field.type === 'select' && field.datasource === datasource) {
                            const expectedKey = field.datasource.toLowerCase();
                            const options = [
                              { value: '', label: 'Select' },
                              ...serviceData.map((item: any) => {
                                const actualKey = Object.keys(item).find(key => key.toLowerCase() === expectedKey);
                                return {
                                  value: item.id,
                                  label: actualKey ? item[actualKey] : 'Unknown'
                                };
                              })
                            ];
                            field.options = options;
                            field.defaultValue = field.defaultValue ?? options[0]?.value ?? '';
                            if (this.formData[section]?.[subSection]?.entries?.length) {
                              this.formData[section][subSection].entries.forEach((entry: any) => {
                                const currentValue = entry[field.id];
                                const isUnset = currentValue === undefined || currentValue === null || currentValue === '';
                                if (isUnset) {
                                  entry[field.id] = field.defaultValue;
                                }
                              });
                            } else if (this.formData[section][subSection]?.entries) {
                              this.formData[section][subSection].entries.forEach((entry: any) => {
                                entry[field.id] = '';
                              });
                            }
                          }
                        });
                      });
                    } else {
                      this.config[section]?.fields?.forEach((field: any) => {

                        if (field.layout === 'row' && Array.isArray(field.fields)) {
                          field.fields.forEach((subField: any) => {
                            if (subField.type === 'select' && subField.datasource === datasource) {
                              const expectedKey = subField.datasource.toLowerCase();
                              const options = [
                                { value: '', label: 'Select' },
                                ...serviceData.map((item: any) => {
                                  const actualKey = Object.keys(item).find(key => key.toLowerCase() === expectedKey);
                                  return {
                                    value: item.id,
                                    label: actualKey ? item[actualKey] : 'Unknown'
                                  };
                                })
                              ];
                              subField.options = options;

                              // Apply default values to formData
                              this.formData[section]?.entries?.forEach((entry: any) => {
                                const currentValue = entry[subField.id];
                                const isUnset = currentValue === undefined || currentValue === null || currentValue === '';
                                if (isUnset) {
                                  entry[subField.id] = subField.defaultValue ?? options[0]?.value ?? '';
                                }
                              });
                            }
                          });
                        }


                        if (field.type === 'select' && field.datasource === datasource) {
                          const expectedKey = field.datasource.toLowerCase();
                          field.options = [
                            { value: '', label: 'Select' },
                            ...serviceData.map((item: any) => {
                              const actualKey = Object.keys(item).find(key => key.toLowerCase() === expectedKey);
                              return {
                                value: item.id,
                                label: actualKey ? item[actualKey] : 'Unknown'
                              };
                            })
                          ];

                          if (field.defaultValue && this.formData[section]?.entries) {
                            this.formData[section].entries.forEach((entry: any) => {
                              entry[field.id] = field.defaultValue;
                            });
                          } else if (this.formData[section]?.entries) {
                            this.formData[section].entries.forEach((entry: any) => {
                              entry[field.id] = '';
                            });
                          }


                        }
                      });
                    }
                  }
                });




                remaining--;
                if (remaining === 0) {
                  this.restoreDisplayLabels(); // ✅ Call after all options are populated
                }
              },
              error => {
                console.error('Error fetching data for datasource:', datasource, error);
                remaining--;
                if (remaining === 0) {
                  this.restoreDisplayLabels(); // Still call even on error
                }
              }
            );
          });

          if (this.formData['Diagnosis Details']?.selectedOptions) {
            this.populateSelectedOptions('Diagnosis Details', 'icd10Code', this.formData['Diagnosis Details'].selectedOptions);
          }

          if (this.formData['Service Details']?.selectedOptions) {
            this.populateSelectedOptions('Service Details', 'serviceCode', this.formData['Service Details'].selectedOptions);
          }

          this.getValidationRules();

          this.DecisionFields = {
            decisionDetails: { ...this.config['Decision Details'].fields || [] },
            decisionNotes: { ...this.config['Decision Notes'].fields || [] },
            decisionMemberInfo: { ...this.config['Member Provider Decision Info'].fields || [] }

          };

          if (this.config['Authorization Notes']) {
            this.authorizationNotesFields = this.config['Authorization Notes'].fields || [];
          }

          if (this.config['Authorization Documents']) {
            this.authorizationDocumentFields = this.config['Authorization Documents'].fields || [];

          }

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

  patchStatusDetailsUsers(): void {

    if (this.config && this.config['Status Details'] && this.allUsers.length > 0) {
      const statusFields = this.config['Status Details'].fields;


      statusFields.forEach((field: any) => {
        if (field.id === 'authActualOwner' || field.id === 'authWorkList' || field.id === 'authWorkBasketUser') {
          field.options = [
            { value: '', label: 'Select' },
            ...this.allUsers.map(user => ({
              value: user.UserId,
              label: user.UserName
            }))
          ];
        }
      });
    } else {
      console.warn('Cannot patch users: Either config not ready or allUsers is empty');
    }
  }


  getValidationRules(): void {
    this.authService.getTemplateValidation(this.selectedTemplateId).subscribe({
      next: (response: any) => {
        try {
          this.validationRules = response?.ValidationJson
            ? JSON.parse(response.ValidationJson)
            : [];
        } catch (e) {
          console.error('Failed to parse ValidationJson:', e);
          this.validationRules = [];
        }
      },
      error: (err) => {
        console.error('Error fetching validation rules:', err);
        this.validationRules = [];
      }
    });
  }


  createEmptyEntry(fields: any[], isNew: boolean = false): any {
    let entry: any = { __isNew: isNew };
    fields.forEach(field => {
      if (field.layout === 'row' && Array.isArray(field.fields)) {
        field.fields.forEach((subField: any) => {
          entry[subField.id] = this.resolveDefaultValue(subField);
        });
      } else {
        entry[field.id] = this.resolveDefaultValue(field);
      }
    });
    return entry;
  }


  toggleSection(section: string): void {
    if (!section) {
      console.error("toggleSection received an undefined section.");
      return;
    }

    // Ensure formData[section] exists before accessing its properties
    if (!this.formData[section]) {
      console.warn(`Section "${section}" is undefined, initializing...`);
      this.formData[section] = { expanded: false, entries: [] }; // ✅ Initialize it
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
      this.formData['Additional Details'][subSection].entries.splice(index + 1, 0, this.createEmptyEntry(this.config['Additional Details'].subsections[subSection].fields, true));
    } else {
      if (!this.formData[section]) {
        this.formData[section] = { expanded: true, entries: [] };
      }
      this.formData[section].entries.splice(index + 1, 0, this.createEmptyEntry(this.config[section].fields, true));
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

  saveData(form: NgForm, validateAuthorization: boolean = true): void {
    if (form.invalid && validateAuthorization) {
      Object.keys(form.controls).forEach(field => {
        form.controls[field].markAsTouched({ onlySelf: true });
      });

      setTimeout(() => {
        const errorElements = Array.from(document.querySelectorAll('.text-danger'))
          .filter(el => el.clientHeight > 0);

        if (errorElements.length > 0) {
          errorElements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 200);

      return;
    }

    // Always validate first
    this.sectionValidationMessages = {}; // clear
    const flatValues: any = {};
    Object.values(this.formData).forEach((section: any) => {
      if (section?.entries) {
        section.entries.forEach((entry: any) => {
          Object.entries(entry).forEach(([key, value]) => {
            if (!flatValues[key]) flatValues[key] = value;
          });
        });
      }
    });

    const failedErrors: any[] = [];
    const failedWarnings: any[] = [];

    this.validationRules
      .filter(r => r.enabled)
      .forEach(rule => {
        const result = this.evaluateExpression(rule, flatValues);
        if (!result) {
          const message = rule.isError ? `❌ ${rule.errorMessage}` : `⚠️ ${rule.errorMessage}`;

          this.sectionOrderAll.forEach(section => {
            const fields = (this.config[section]?.fields || []);
            const fieldIds = fields.map((f: any) => f.id);
            const intersects = rule.dependsOn.some((dep: string) => fieldIds.includes(dep));

            if (intersects) {
              if (!this.sectionValidationMessages[section]) {
                this.sectionValidationMessages[section] = [];
              }
              this.sectionValidationMessages[section].push(message);
            }
          });

          if (rule.isError) failedErrors.push(rule);
          else failedWarnings.push(rule);
        }
      });

    // Then check overlaps
    this.checkOverlappingServiceDates();

    if (validateAuthorization && (this.serviceOverlapMessages.length > 0 || failedErrors.length > 0)) {
      // If overlaps or validation errors exist, open dialog (not proceed)
      const allMessages = [
        ...failedErrors.map(r => ({ msg: `❌ Error: ${r.errorMessage}`, type: 'error' })),
        ...failedWarnings.map(r => ({ msg: `⚠️ Warning: ${r.errorMessage}`, type: 'warning' })),
        ...(this.serviceOverlapMessages || []).map(m => ({ msg: `❌ Service Overlap: ${m}`, type: 'error' }))
      ];

      const hasOnlyWarnings = failedWarnings.length > 0 && failedErrors.length === 0 && this.serviceOverlapMessages.length === 0;

      const dialogRef = this.dialog.open(ValidationErrorDialogComponent, {
        width: '600px',
        data: {
          title: 'Validation Results',
          messages: allMessages,
          allowContinue: hasOnlyWarnings
        }
      });

      dialogRef.afterClosed().subscribe(result => {
        if (result === 'continue' && hasOnlyWarnings) {
          this.proceedToSave();
        }

        const errorSections = Object.keys(this.sectionValidationMessages).filter(section =>
          this.sectionValidationMessages[section]?.length
        );

        if (errorSections.length > 0) {
          const firstErrorSectionId = `section-${errorSections[0]}`;
          const firstErrorSection = document.getElementById(firstErrorSectionId);

          if (firstErrorSection) {
            setTimeout(() => {
              firstErrorSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 200);
          }
        }
      });


      return;
    }

    // If no errors
    this.proceedToSave();
  }


  proceedToSave(): void {
    if (this.saveType === '') {
      this.saveType = 'Add';
    }

    let jsonData: any = {}; // Use let to reassign

    if (this.saveType === 'Add') {
      this.authNumber = this.authNumberService.generateAuthNumber(9, true, true, false, false);
      //console.log("Auth Number:", this.authNumber);
      jsonData = {
        Data: [this.formData],
        AuthNumber: this.authNumber,
        AuthTypeId: this.selectedTemplateId,
        AuthClassId: this.selectedAuthClassId,
        MemberId: this.memberId,
        AuthDueDate: new Date().toISOString(),
        NextReviewDate: new Date().toISOString(),
        TreatmentType: 'Standard',
        SaveType: this.saveType,
        CreatedOn: new Date().toISOString(),
        CreatedBy: 1,
        responseData: JSON.stringify(this.formData) // Ensure it's a valid JSON string
      };

      this.additionalInfo = [
        { label: "Auth No", value: this.authNumber || "N/A" },
        { label: "Auth Type", value: this.selectedTemplateId.toString() || "N/A" },
        { label: "Due Date", value: this.formatDateOnly(new Date()) || "N/A" },
        { label: "Days Left", value: this.calculateDaysLeft(new Date().toISOString()).toString() || "N/A" },
        { label: "Request Priority", value: '' || "N/A" },
        { label: "Auth Owner", value: this.memberId.toString() || "N/A" },
        { label: "Auth Status", value: '' || "N/A" },
        { label: "Overall Status", value: '' || "N/A" }
      ];

      const currentRoute = `/member-auth/DRAFT/${this.memberId}`;
      const newRoute = `/member-auth/${this.authNumber}/${this.memberId}`;
      const newLabel = `Auth No ${this.authNumber}`;

      this.headerService.updateTab(currentRoute, {
        label: newLabel,
        route: newRoute,
        memberId: String(this.memberId)
      });

      this.headerService.selectTab(newRoute);

      this.isSaveSuccessful = true;
    }

    if (this.saveType === 'Update') {

      jsonData = {
        Data: [this.formData],
        AuthNumber: this.authNumber,
        AuthTypeId: this.selectedTemplateId,
        MemberId: this.memberId,
        AuthDueDate: new Date().toISOString(),
        NextReviewDate: new Date().toISOString(),
        TreatmentType: 'Standard',
        SaveType: this.saveType,
        UpdatedOn: new Date().toISOString(),
        UpdatedBy: 1,
        responseData: JSON.stringify(this.formData) // Ensure it's a valid JSON string
      };
    }

    this.authService.saveAuthDetail(jsonData).subscribe(
      response => {
        this.snackBar.open((this.saveTypeFrom && this.saveTypeFrom.trim() !== '' ? this.saveTypeFrom : 'Authorization') + ' saved successfully!', 'Close', {
          horizontalPosition: 'center',
          verticalPosition: 'top',
          duration: 5000,
          panelClass: ['success-snackbar']
        });

        this.loadDecisionData();

        if (this.saveType === 'Update' && this.saveTypeFrom === 'Authorization') {
          // Move to "Decision Details" stepper
          this.stepperSelectedIndex = 1; // Navigate to Decision Details step
        }

        if (this.saveType === 'Add')
          this.saveType = 'Update';
        this.saveTypeFrom = 'Authorization';
      },
      error => {
        console.error('Error saving data:', error);
        console.error('Error Details:', error.error);
        this.snackBar.open('Error saving Authorization!', 'Close', {
          horizontalPosition: 'center',
          verticalPosition: 'top',
          duration: 5000,
          panelClass: ['success-snackbar']
        });
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
        this.providerFieldsVisible = true;
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
    return this.isDiagnosisSection(section) || this.isServiceSection(section); //this.isProviderSection(section) ||
  }

  getNonRowLayoutFields(section: string): any[] {
    return this.config[section].fields.filter((field: any) => !field.layout || field.layout !== 'row');
  }

  getRowLayoutFields(section: string): any[] {
    return this.config[section].fields.filter((field: any) => field.layout === 'row');
  }

  shouldDisplaySection(section: string): boolean {
    const isSpecialSection = ['Additional Details', 'Authorization Notes', 'Authorization Documents', 'Status Details'].includes(section);
    if (this.isEditMode) return true;
    if (!this.isEditMode && isSpecialSection) {
      return this.isSaveSuccessful;
    }
    return true;
  }



  /*************Decision Data***************/

  loadDecisionData(): void {
    // Initialize decisionData with entries arrays
    const requestDetails = this.formData['Auth Details']?.entries?.[0] || {};
    this.decisionData = {
      serviceDetails: { ...this.formData['Service Details'] || {} },
      requestDetails: { ...requestDetails },
      decisionDetails: {
        ...this.config['Decision Details'] || {},
        entries: this.formData['Service Details']?.entries.map((service: any, index: number) => {
          // Find existing entry in decisionDetails to retain previous values
          const existingEntry = this.formData['Decision Details']?.entries?.find(
            (entry: any) => entry.serviceCode === service.serviceCode
          ) || {};

          return {
            ...existingEntry,  // ✅ Spread existing first

            serviceCode: this.getValidValue(existingEntry.serviceCode, service.serviceCode) || 'N/A',
            fromDate: this.getValidValue(existingEntry.fromDate, service.fromDate) || '',
            toDate: this.getValidValue(existingEntry.toDate, service.toDate) || '',
            serviceDescription: this.getValidValue(existingEntry.serviceDescription, service.serviceDesc) || '',
            reviewType: this.getValidValue(existingEntry.reviewType, service.reviewType) || '',
            unitType: this.getValidValue(existingEntry.unitType, service.unitType) || '',
            denied: this.getValidValue(existingEntry.denied, service.serviceDenied) || '',
            modifier: this.getValidValue(existingEntry.modifier, service.modifier) || '',

            decisionStatus: this.getValidValue(existingEntry.decisionStatus, service.decisionStatus) || '',
            decisionStatusCode: this.getValidValue(existingEntry.decisionStatusCode, service.decisionStatusCode) || '',
            requested: this.getValidValue(existingEntry.requested, service.serviceReq) || '',
            approved: this.getValidValue(existingEntry.approved, service.serviceAppr) || '',
            used: this.getValidValue(existingEntry.used, service.used) || '',
            decisionDateTime: this.getValidValue(existingEntry.decisionDateTime, service.decisionDateTime) || '',
            createdDateTime: this.getValidValue(existingEntry.createdDateTime, service.createdDateTime) || '',
            updatedDateTime: this.getValidValue(existingEntry.updatedDateTime, service.updatedDateTime) || '',
            dueDate: this.getValidValue(existingEntry.dueDate, service.dueDate) || '',

            // From requestDetails
            decisionRequestDatetime: this.getValidValue(existingEntry.decisionRequestDatetime, requestDetails.requestDatetime) || '',
            requestReceivedVia: this.getValidValue(existingEntry.requestReceivedVia, requestDetails.requestReceivedVia) || '',
            requestPriority: this.getValidValue(existingEntry.requestPriority, requestDetails.requestPriority) || '',
            treatmentType: this.getValidValue(existingEntry.treatmentType, requestDetails.treatmentType) || '',
            newSelect_copy_25gqf4w2s_21: this.getValidValue(existingEntry.newSelect_copy_25gqf4w2s_21, requestDetails.newSelect_copy_t1hmnc0kp) || '',

            alternateServiceId: this.getValidValue(existingEntry.alternateServiceId, service.alternateServiceId) || '',
            denialType: this.getValidValue(existingEntry.denialType, service.denialType) || '',
            denialReason: this.getValidValue(existingEntry.denialReason, service.denialReason) || ''
          };
        }) || this.config['Decision Details']?.entries || [] // If no new data, keep old entries
      },

      decisionNotes: {
        ...this.config['Decision Notes'] || {},
        entries: this.formData['Decision Notes']?.entries.map((note: any) => ({
          authorizationNotes: note.authorizationNotes || '',
          authorizationNoteType: note.authorizationNoteType || '',
          authorizationAlertNote: note.authorizationAlertNote || '',
          noteEncounteredDatetime: note.noteEncounteredDatetime || ''
        })) || []
      },

      decisionMemberInfo: {
        ...this.config['Member Provider Decision Info'] || {},
        entries: this.formData['Member Provider Decision Info']?.entries.map((info: any) => ({
          notificationDateDecision: info.notificationDateDecision || '',
          notificationTypeDecision: info.notificationTypeDecision || '',
          memberProviderTypeDecision: info.memberProviderTypeDecision || '',
          notificationAttemptDecision: info.notificationAttemptDecision || ''
        })) || []
      }
    };

  }

  private getValidValue(primary: any, fallback: any): any {
    if (primary === undefined || primary === null || (typeof primary === 'string' && primary.trim() === '')) {
      return fallback;
    }
    return primary;
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

    this.saveType = 'Update';
    this.saveTypeFrom = 'Decision';
    this.saveData(this.formData, false);
  }

  /*************Decision Data***************/

  /*************Notes Data***************/
  handleAuthNotesSaved(updatedNotes: any) {
    // Update formData for saving
    if (!this.formData['Authorization Notes']) {
      this.formData['Authorization Notes'] = { entries: [] };
    }
    this.formData['Authorization Notes'].entries = updatedNotes;

    // 🔥 Update the shared Input-bound data so both instances refresh
    this.authorizationNotesData = [...updatedNotes];

    this.saveType = 'Update';
    this.saveTypeFrom = 'Notes';
    this.saveData(this.formData, false);
    console.log('Authorization Notes saved:', this.formData['Authorization Notes'].entries);
    setTimeout(() => {
      this.authorizationNotesData = [...this.formData['Authorization Notes'].entries];
    }, 300); // small delay so Save API call completes
  }

  /*************Notes Data***************/

  /*************Documents Data***************/
  handleAuthDocumentSaved(updatedDocument: any) {
    if (!this.formData['Authorization Documents']) {
      this.formData['Authorization Documents'] = { entries: [] };
    }
    this.formData['Authorization Documents'].entries = updatedDocument;

    this.authorizationDocumentData = [...updatedDocument];
    this.saveType = 'Update';
    this.saveTypeFrom = 'Document';
    this.saveData(this.formData, false);
  }
  /*************Documents Data***************/

  /*************Populate Multiple ICD and Service Codes***************/
  populateSelectedOptions(section: string, fieldId: string, selectedOptions: string[]): void {
    if (!this.formData[section]) {
      this.formData[section] = { expanded: true, entries: [] };
    } else {
      this.formData[section].entries = [];
    }

    if (!selectedOptions || selectedOptions.length === 0) {
      this.formData[section].entries.push(this.createEmptyEntry(this.config[section].fields));
    } else {
      selectedOptions.forEach(code => {
        const entry = this.createEmptyEntry(this.config[section].fields);
        entry[fieldId] = code;

        this.formData[section].entries.push(entry);

        // 🔽 Map to description field
        let descriptionFieldId = fieldId === 'icd10Code' ? 'icd10Description' :
          fieldId === 'serviceCode' ? 'serviceDesc' : '';
        const type = fieldId === 'icd10Code' ? 'ICD' : 'CPT';
        if (descriptionFieldId && code) {
          this.authService.getCodesetById(code, type).subscribe((data: any) => {
            const matchedEntry = this.formData[section].entries.find((e: any) => e[fieldId] === code);
            if (matchedEntry) {
              matchedEntry[descriptionFieldId] = data?.codeDesc || 'Description not found';
            }
          });
        }
      });
    }
  }
  /*************Populate Multiple ICD and Service Codes***************/

  /*************Date Time Default value and Only Date setup ***************/
  resolveDefaultValue(field: any): any {
    if (field.type === 'datetime-local' && typeof field.defaultValue === 'string') {
      const defaultVal = field.defaultValue.trim().toUpperCase();
      let baseDate = new Date();

      if (defaultVal === 'D') {
        return field.dateOnly ? this.formatDateOnly(baseDate) : this.formatToEST(baseDate);
      }

      const plusMatch = /^D\+(\d+)$/.exec(defaultVal);
      if (plusMatch) {
        const daysToAdd = parseInt(plusMatch[1], 10);
        baseDate.setDate(baseDate.getDate() + daysToAdd);
        return field.dateOnly ? this.formatDateOnly(baseDate) : this.formatToEST(baseDate);
      }

      const minusMatch = /^D-(\d+)$/.exec(defaultVal);
      if (minusMatch) {
        const daysToSubtract = parseInt(minusMatch[1], 10);
        baseDate.setDate(baseDate.getDate() - daysToSubtract);
        return field.dateOnly ? this.formatDateOnly(baseDate) : this.formatToEST(baseDate);
      }
    }

    return field.defaultValue ?? '';
  }

  formatToEST(date: Date, dateOnly: boolean = false): string {
    const options: Intl.DateTimeFormatOptions = dateOnly
      ? {
        timeZone: 'America/New_York',
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
      }
      : {
        timeZone: 'America/New_York',
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      };

    return new Intl.DateTimeFormat('en-US', options).format(date).replace(',', '');
  }

  formatDateOnly(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  }

  /*************Date Time Default value and Only Date setup ***************/

  getOptionLabel(field: any, value: any): string {
    if (!field || !field.options || !Array.isArray(field.options)) return '';
    const match = field.options.find((opt: any) => opt.value === value);
    return match?.label || '';
  }

  onInputChange(event: Event, field: any, section: string, index: number): void {
    const inputValue = (event.target as HTMLInputElement).value;
    this.filterOptions(field, inputValue, section, index);
  }


  evaluateExpression(rule: any, values: any): boolean {
    const { expression, dependsOn } = rule;

    try {
      // Include createdDateTime and now dynamically
      let localDependsOn = [...dependsOn];
      if (expression.includes('now') && !localDependsOn.includes('now')) {
        localDependsOn.push('now');
      }
      if (expression.includes('createdDateTime') && !localDependsOn.includes('createdDateTime')) {
        localDependsOn.push('createdDateTime');
      }

      const context: { [key: string]: any } = {};

      localDependsOn.forEach((key: string) => {
        let val: any;

        // Treat 'now' and 'createdDateTime' as the current datetime
        if (key === 'now' || key === 'createdDateTime') {
          val = new Date();
        } else {
          val = values[key];
          if (typeof val === 'string') {
            const dateMatch = /\d{2}\/\d{2}\/\d{4}/.test(val) || /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}/.test(val);
            if (dateMatch) {
              val = new Date(val);
            } else if (!isNaN(Number(val))) {
              val = Number(val);
            }
          }
        }

        context[key] = val;
      });

      console.log(`\n🔍 Evaluating Expression: ${expression}`);
      localDependsOn.forEach((key: string) => {
        console.log(`   ${key} =`, context[key]);
      });

      const func = new Function(...localDependsOn, `return ${expression};`);
      const result = func(...localDependsOn.map((k: string) => context[k]));

      console.log(`Result: ${result}\n`);
      return result;
    } catch (e) {
      console.error('Error evaluating expression:', e, rule);
      return true; // fail-safe
    }
  }

  restoreDisplayLabels(): void {
    if (!this.formData || !this.config) {
      return;
    }

    for (let section of this.sectionOrderAll) {
      const entries = this.formData[section]?.entries;
      const fields = this.config[section]?.fields;

      if (!entries || !fields) continue;

      entries.forEach((entry: any, i: number) => {
        fields.forEach((field: any) => {
          if (field.type === 'select' && field.options?.length) {
            const key = `${field.id}_${i}_${section}`;
            const selectedOption = field.options.find((opt: any) => opt.value == entry[field.id]);
            if (selectedOption) {
              this.displayLabels[key] = selectedOption.label;
            } else {
              this.displayLabels[key] = '';
            }
          }
        });
      });
    }
  }


  copyEntry(section: string, index: number): void {
    if (!this.formData[section]) return;

    const originalEntry = this.formData[section].entries[index];
    const copiedEntry = { ...originalEntry, __isNew: true };

    this.formData[section].entries.push(copiedEntry);
  }

  updateAuthWorkBasketUserState(section: string, entry: any): void {
    const workListValue = entry['authWorkList'];

    const statusFields = this.config?.['Status Details']?.fields || [];

    const workBasketUserField = statusFields.find((f: any) => f.id === 'authWorkBasketUser');

    if (workBasketUserField) {
      // If a value is selected for authWorkList, enable authWorkBasketUser
      workBasketUserField.isEnabled = !!workListValue;

      // Optional: If you want to reset value if workList is cleared
      if (!workListValue) {
        entry['authWorkBasketUser'] = '';
      }
    }
  }

  /****** Service Code Overlap *******/
  overlappingServiceCodes: { fromCode: string; toCode: string }[] = [];
  overlappingServiceIndexes: Set<number> = new Set();
  serviceOverlapMessages: string[] = [];

  private checkOverlappingServiceDates(): void {
    this.serviceOverlapMessages = [];

    const serviceDetails = this.formData['Service Details']?.entries || [];

    type ServicePeriod = {
      index: number;
      serviceCode: string;
      fromDate: Date;
      toDate: Date;
    };

    const periods: ServicePeriod[] = serviceDetails
      .map((entry: any, index: number) => ({
        index,
        serviceCode: entry.serviceCode,
        fromDate: entry.fromDate ? new Date(entry.fromDate) : null,
        toDate: entry.toDate ? new Date(entry.toDate) : null
      }))
      .filter((e: ServicePeriod) => e.fromDate !== null && e.toDate !== null)
      .sort((a: ServicePeriod, b: ServicePeriod) => a.fromDate.getTime() - b.fromDate.getTime());

    for (let i = 0; i < periods.length - 1; i++) {
      const current = periods[i];
      const next = periods[i + 1];

      if (current.toDate.getTime() >= next.fromDate.getTime()) {
        this.serviceOverlapMessages.push(
          `Overlap between ${current.serviceCode} and ${next.serviceCode}`
        );
      }
    }

    // 🔥 Auto Scroll if overlap found
    if (this.serviceOverlapMessages.length > 0) {
      setTimeout(() => {
        const element = document.getElementById('service-details-section');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 200);
    }
  }

  onServiceDetailChange(): void {
    if (this.serviceOverlapMessages.length > 0) {
      this.checkOverlappingServiceDates();
    }
  }

  /****** Service Code Overlap *******/

}
