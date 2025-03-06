import { Component, ViewChild, OnInit } from '@angular/core';
import { CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { TemplateService } from 'src/app/service/template.service';
import { KeyValue } from '@angular/common';
import { AuthService } from 'src/app/service/auth.service';
import { DialogContentComponent } from 'src/app/admin/UM/dialog-content/dialog-content.component';
import { MatDialog } from '@angular/material/dialog';
import { SettingsDialogComponent } from 'src/app/admin/UM/settings-dialog/settings-dialog.component';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatSnackBar } from '@angular/material/snack-bar';

interface TemplateField {
  label: string;
  type: string;
  id: string;
  options?: string[];
  required?: boolean;      // Indicates if the field is required
  requiredMsg?: string;    // Stores custom required message
  buttonText?: string;     // New property for button type fields
  datasource?: string;
  selectedOptions?: string[];   // new: the list of selected option IDs
  defaultValue?: string;        // new: the default option id
  order?: number; // <-- Add this line
}

type TemplateSection = TemplateField[] | Record<string, TemplateField[]>;

@Component({
  selector: 'app-umauthtemplate-builder',
  templateUrl: './umauthtemplate-builder.component.html',
  styleUrls: ['./umauthtemplate-builder.component.css'],
})
export class UmauthtemplateBuilderComponent implements OnInit {
  masterTemplate: Record<string, TemplateSection> = {};
  availableFields: TemplateField[] = [];
  selectedField: TemplateField | null = null;
  selectedSection: string = '';
  allDropLists: string[] = ['available'];
  defaultFieldIds: string[] = [];
  authTemplates: any[] = []; // Array to hold fetched templates
  selectedTemplateId: number = 0; // Default to 0 for "Select Auth Type"
  newTemplateName: string = '';
  showTemplateNameError: boolean = false;
  displayedColumns: string[] = ['Id', 'TemplateName', 'CreatedBy', 'CreatedOn', 'actions'];
  isFormVisible: boolean = false;
  formMode: 'add' | 'edit' | 'view' = 'add';
  selectedEntry: any = {};
  visibleColumns: string[] = [];
  editingRowId: string | null = null;
  dataSource = new MatTableDataSource<any>();

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  isFocused = false;
  isVisible = false;

  onFocus() {
    this.isFocused = true;
  }

  onBlur() {
    this.isFocused = false;
  }

  // Track expanded state of outer sections
  activeSections: { [key: string]: boolean } = {};
  // Track expanded state of nested subsections
  activeSubSections: { [key: string]: boolean } = {};

  constructor(private templateService: TemplateService, private authService: AuthService, private dialog: MatDialog, private snackBar: MatSnackBar) { }

  // Preserve JSON insertion order
  originalOrderComparator(a: KeyValue<string, any>, b: KeyValue<string, any>): number {
    return 0;
  }

  // Alias mapping for section keys
  aliasMapping: { [key: string]: string } = {
    'authDetails': 'Auth Details',
    'providerDetails': 'Provider Details',
    'diagnosisDetails': 'Diagnosis Details',
    'serviceDetails': 'Service Details',
    'additionalDetails': 'Additional Details'
  };

  ngOnInit() {
    this.loadAuthTemplates();
    this.loadData();
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

  loadData() {
    this.authService.getAuthTemplates().subscribe((response) => {
      this.dataSource.data = response.map((item: any) => ({
        ...item,
      }));
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
      console.log("data", response);
    });
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  openForm(mode: 'add' | 'edit' | 'view', element: any = null) {
    this.formMode = mode;
    this.isVisible = true;
    if (mode === 'edit' && element) {
      this.newTemplateName = element.TemplateName;
      this.selectedTemplateId = element.Id;
      this.onAuthTypeChange();
      this.selectedEntry = { ...element };
    } else if (mode === 'add') {
      this.newTemplateName = '';
      this.selectedTemplateId = 0;
      this.masterTemplate = {};
      this.selectedEntry = {};
    } else if (mode === 'view') {
      this.selectedEntry = { ...element };
    }
  }

  //openForm(mode: 'add' | 'edit' | 'view', element: any = null) {
  //  this.formMode = mode;
  //  this.isVisible = true;
  //  if (mode === 'edit' && element) {
  //    this.newTemplateName = element.TemplateName;
  //    this.selectedTemplateId = element.Id;
  //    this.onAuthTypeChange();
  //    this.selectedEntry = { ...element };
  //  } else if (mode === 'add') {
  //    this.newTemplateName = '';
  //    this.selectedTemplateId = 0;
  //    // Initialize masterTemplate with your sample JSON, adding 3 button fields in providerDetails
  //    this.masterTemplate = {
  //      authDetails: [
  //        { label: "Request Dt", type: "datetime-local", id: "requestDatetime" },
  //        { label: "Expected Admission Datetime", type: "datetime-local", id: "expectedAdmissionDatetime" },
  //        { label: "Actual Admission Datetime", type: "datetime-local", id: "actualAdmissionDatetime" },
  //        { label: "Expected Dischare Datetime", type: "datetime-local", id: "expectedDischargeDatetime" },
  //        { label: "Number of Days", type: "number", id: "numberOfDays" },
  //        { label: "Admission Type", type: "select", id: "admissionType", options: ["Urgent", "Other"] },
  //        { label: "Transportation", type: "number", id: "customTransportation" },
  //        { label: "Transportation", type: "number", id: "customTransportation1" }
  //      ],
  //      providerDetails: [
  //        { label: "Provider Role", type: "text", id: "providerRole" },
  //        { label: "Provider Name", type: "text", id: "providerName" },
  //        { label: "Location", type: "text", id: "providerLocation" },
  //        { label: "Specialty", type: "text", id: "providerSpecialty" },
  //        { label: "Provider Id", type: "text", id: "providerId" },
  //        { label: "Phone", type: "text", id: "providerPhone" },
  //        // Added 3 buttons in providerDetails
  //        { label: "Button 1", type: "button", id: "providerButton1", buttonText: "Button 1" },
  //        { label: "Button 2", type: "button", id: "providerButton2", buttonText: "Button 2" },
  //        { label: "Button 3", type: "button", id: "providerButton3", buttonText: "Button 3" }
  //      ],
  //      diagnosisDetails: [
  //        { label: "ICD 10 Code", type: "text", id: "icd10Code" },
  //        { label: "ICD 10 Description", type: "text", id: "icd10Description" }
  //      ],
  //      serviceDetails: [
  //        { label: "Service Desc.", type: "text", id: "serviceDesc" },
  //        { label: "Service Code", type: "text", id: "serviceCode" },
  //        { label: "Modifier", type: "text", id: "modifier" },
  //        { label: "From Date", type: "datetime", id: "fromDate" },
  //        { label: "To Date", type: "datetime", id: "toDate" },
  //        { label: "Req.", type: "text", id: "serviceReq" },
  //        { label: "Appr.", type: "text", id: "serviceAppr" },
  //        { label: "Negotiated Rate", type: "text", id: "negotiatedRate" },
  //        { label: "Unit Type", type: "text", id: "unitType" },
  //        { label: "Request Provider", type: "text", id: "requestProvider" },
  //        { label: "Provider", type: "text", id: "serviceProvider" },
  //        { label: "Request Datetime", type: "datetime", id: "requestDatetime" }
  //      ],
  //      additionalDetails: {
  //        additionalInfo: [
  //          { label: "Date Indicator", type: "datetime-local", id: "dateIndicator" },
  //          { label: "Provider Name", type: "text", id: "providerName" },
  //          { label: "Member Name", type: "text", id: "memberName" }
  //        ],
  //        memberProviderInfo: [
  //          { label: "Member Verbal Notification Date", type: "datetime-local", id: "memberNotificationDate" },
  //          { label: "Provider Verbal Notification Date", type: "datetime-local", id: "providerNotificationDate" }
  //        ],
  //        icdInfo: [
  //          { label: "ICD 10 Code", type: "text", id: "icd10Code" },
  //          { label: "ICD 10 Description", type: "text", id: "icd10Description" }
  //        ],
  //        notes: [
  //          { label: "Additional Info Request Date", type: "datetime-local", id: "AddlInfoRequestDate" },
  //          { label: "Additional Info Received Date", type: "datetime-local", id: "AddlInfoReceivedDate" },
  //          { label: "Notes", type: "textarea", id: "text" }
  //        ]
  //      }
  //    };
  //    this.selectedEntry = {};
  //  } else if (mode === 'view') {
  //    this.selectedEntry = { ...element };
  //  }
  //}

  cancel() {
    this.isVisible = false;
  }

  confirmDelete(element: any = null) {
    // Implement deletion logic for templates if needed.
  }

  getAlias(sectionKey: string): string {
    return this.aliasMapping[sectionKey] || sectionKey;
  }

  drop(event: CdkDragDrop<TemplateField[]>, sectionPath: string) {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      console.log(`Moved item within ${sectionPath} from index ${event.previousIndex} to ${event.currentIndex}`);
    } else {
      const draggedField = event.previousContainer.data[event.previousIndex];
      const isDefaultField = this.defaultFieldIds.includes(draggedField.id);
      if (event.previousContainer.id === 'available') {
        let fieldToSelect: TemplateField;
        if (isDefaultField) {
          const fieldToCopy = { ...draggedField };
          fieldToCopy.id = `${fieldToCopy.id}_${Date.now()}`;
          event.container.data.splice(event.currentIndex, 0, fieldToCopy);
          fieldToSelect = fieldToCopy;
          console.log(`Duplicated default field from availableFields to ${sectionPath} at index ${event.currentIndex}`);
        } else {
          transferArrayItem(
            event.previousContainer.data,
            event.container.data,
            event.previousIndex,
            event.currentIndex
          );
          fieldToSelect = event.container.data[event.currentIndex];
          console.log(`Moved non-default field from availableFields to ${sectionPath} at index ${event.currentIndex}`);
        }
        this.selectedField = fieldToSelect;
      } else if (event.container.id === 'available') {
        transferArrayItem(
          event.previousContainer.data,
          event.container.data,
          event.previousIndex,
          event.currentIndex
        );
        this.selectedField = event.container.data[event.currentIndex];
        console.log(`Moved field from ${sectionPath} to availableFields at index ${event.currentIndex}`);
      } else {
        transferArrayItem(
          event.previousContainer.data,
          event.container.data,
          event.previousIndex,
          event.currentIndex
        );
        this.selectedField = event.container.data[event.currentIndex];
        console.log(`Moved field from ${event.previousContainer.id} to ${sectionPath} at index ${event.currentIndex}`);
      }
    }
  }

  selectField(field: TemplateField, section: string) {
    this.selectedField = null; // Force component destruction
    this.selectedSection = '';

    setTimeout(() => {
      this.selectedField = { ...field }; // Re-instantiate with new field
      this.selectedSection = section;
    }, 10); // Short delay ensures Angular detects change
  }


  updateField(updatedField: TemplateField) {
    if (this.selectedSection === 'available') {
      const index = this.availableFields.findIndex((f: TemplateField) => f.id === updatedField.id);
      this.availableFields[index] = updatedField;
    } else {
      const sectionParts = this.selectedSection.split('.');
      if (sectionParts.length === 1) {
        const section = this.masterTemplate[this.selectedSection];
        if (Array.isArray(section)) {
          const index = section.findIndex((f: TemplateField) => f.id === updatedField.id);
          section[index] = updatedField;
        }
      } else {
        const [mainSection, subSection] = sectionParts;
        const nestedSection = (this.masterTemplate[mainSection] as Record<string, TemplateField[]>)[subSection];
        const index = nestedSection.findIndex((f: TemplateField) => f.id === updatedField.id);
        nestedSection[index] = updatedField;
      }
    }
    this.selectedField = updatedField;
  }

  deleteField(field: TemplateField, section: string, event: Event): void {
    // Prevent the click from also selecting the field
    event.stopPropagation();
    const sectionParts = section.split('.');
    if (sectionParts.length === 1) {
      const arr = this.masterTemplate[section] as TemplateField[];
      if (Array.isArray(arr)) {
        const index = arr.findIndex(f => f.id === field.id);
        if (index > -1) {
          arr.splice(index, 1);
        }
      }
    } else {
      const [mainSection, subSection] = sectionParts;
      const nestedSection = (this.masterTemplate[mainSection] as Record<string, TemplateField[]>)[subSection];
      const index = nestedSection.findIndex(f => f.id === field.id);
      if (index > -1) {
        nestedSection.splice(index, 1);
      }
    }
  }

  saveTemplate(): void {
    if (!this.newTemplateName || this.newTemplateName.trim() === '') {
      this.showTemplateNameError = true;
      console.error('Template Name is required');
      return;
    }
    this.showTemplateNameError = false;
    console.log('Saving template:', {
      name: this.newTemplateName,
      masterTemplate: this.masterTemplate
    });

    let jsonData: any;

    if (this.formMode === 'add') {
      jsonData = {
        TemplateName: this.newTemplateName,
        JsonContent: JSON.stringify(this.masterTemplate),
        CreatedOn: new Date().toISOString(),
        CreatedBy: 1,
        Id: 0
      };
    } else if (this.formMode === 'edit') {
      jsonData = {
        TemplateName: this.newTemplateName,
        JsonContent: JSON.stringify(this.masterTemplate),
        CreatedOn: new Date().toISOString(),
        CreatedBy: 1,
        Id: this.selectedEntry.Id  // Pass the id for editing
      };
    }

    console.log("jsondata: ", jsonData);
    this.authService.saveAuthTemplate(jsonData).subscribe({
      next: (response) => {
        this.isVisible = true;
        this.loadData();
        this.snackBar.open('Auth Template saved successfully!', 'Close', {
          horizontalPosition: 'center',
          verticalPosition: 'top',
          duration: 500,
          panelClass: ['success-snackbar']
        });
      },
      error: (error) => {
        console.error('Error saving data:', error);
      }
    });
  }

  //saveTemplate(): void {
  //  if (!this.newTemplateName || this.newTemplateName.trim() === '') {
  //    this.showTemplateNameError = true;
  //    console.error('Template Name is required');
  //    return;
  //  }
  //  this.showTemplateNameError = false;

  //  // Dynamically update field order based on their current position
  //  Object.keys(this.masterTemplate).forEach(sectionKey => {
  //    const sectionContent = this.masterTemplate[sectionKey];
  //    if (Array.isArray(sectionContent)) {
  //      // For simple sections (array of fields)
  //      sectionContent.forEach((field, index) => {
  //        field.order = index;
  //      });
  //    } else {
  //      // For nested sections (e.g., additionalDetails)
  //      // Use type assertion to allow adding extra properties
  //      (sectionContent as any)['sectionOrder'] = undefined; // placeholder; will update below
  //      Object.keys(sectionContent).forEach(subKey => {
  //        if (subKey !== 'sectionOrder') {
  //          sectionContent[subKey].forEach((field, index) => {
  //            field.order = index;
  //          });
  //        }
  //      });
  //    }
  //  });

  //  // Dynamically determine section orders based on current key order
  //  const dynamicSectionOrders: { [key: string]: number } = {};
  //  const sectionKeys = Object.keys(this.masterTemplate);
  //  sectionKeys.forEach((key, index) => {
  //    dynamicSectionOrders[key] = index;
  //    // For nested sections, update the sectionOrder property using a type assertion
  //    if (!Array.isArray(this.masterTemplate[key])) {
  //      (this.masterTemplate[key] as any)['sectionOrder'] = index;
  //    }
  //  });

  //  // Build final JSON output with the dynamic section orders
  //  const jsonOutput = {
  //    sectionOrders: dynamicSectionOrders,
  //    ...this.masterTemplate
  //  };

  //  const jsonData: any = {
  //    TemplateName: this.newTemplateName,
  //    JsonContent: JSON.stringify(jsonOutput),
  //    CreatedOn: new Date().toISOString(),
  //    CreatedBy: 1,
  //    Id: this.formMode === 'add' ? 0 : this.selectedEntry.Id
  //  };

  //  console.log("jsonData to save: ", jsonData);

  //  this.authService.saveAuthTemplate(jsonData).subscribe({
  //    next: (response) => {
  //      this.isVisible = true;
  //      this.loadData();
  //      this.snackBar.open('Auth Template saved successfully!', 'Close', {
  //        horizontalPosition: 'center',
  //        verticalPosition: 'top',
  //        duration: 500,
  //        panelClass: ['success-snackbar']
  //      });
  //    },
  //    error: (error) => {
  //      console.error('Error saving data:', error);
  //    }
  //  });
  //}






  onTemplateNameInput(): void {
    if (this.newTemplateName && this.newTemplateName.trim() !== '') {
      this.showTemplateNameError = false;
    }
  }

  isArray(value: TemplateSection): value is TemplateField[] {
    return Array.isArray(value);
  }

  getSubsections(section: TemplateSection): Record<string, TemplateField[]> {
    return this.isArray(section) ? {} : section as Record<string, TemplateField[]>;
  }

  getInputType(fieldType: string): string {
    switch (fieldType) {
      case 'datetime-local':
        return 'datetime-local';
      case 'number':
        return 'number';
      case 'select':
        return 'text';
      case 'textarea':
        return 'text';
      default:
        return 'text';
    }
  }

  toggleSection(sectionKey: string): void {
    this.activeSections[sectionKey] = !this.activeSections[sectionKey];
  }

  toggleSubSection(subSectionKey: string): void {
    this.activeSubSections[subSectionKey] = !this.activeSubSections[subSectionKey];
  }

  onAuthTypeChange(): void {
    console.log('Selected Template ID:', this.selectedTemplateId);
    if (this.selectedTemplateId !== null && this.selectedTemplateId !== 0) {
      this.authService.getTemplate(this.selectedTemplateId).subscribe({
        next: (data: any) => {
          if (!data || !data[0].JsonContent) {
            console.error('API returned invalid data:', data);
            return;
          }
          try {
            this.masterTemplate = JSON.parse(data[0].JsonContent);
            console.log('Parsed config:', this.masterTemplate);
            Object.keys(this.masterTemplate).forEach(sectionKey => {
              this.activeSections[sectionKey] = true;
              if (!this.isArray(this.masterTemplate[sectionKey])) {
                const subsections = this.getSubsections(this.masterTemplate[sectionKey]);
                Object.keys(subsections).forEach(subKey => {
                  this.activeSubSections[`${sectionKey}.${subKey}`] = true;
                });
              }
            });
            this.availableFields = [
              { label: 'New Text', type: 'text', id: 'newText' },
              { label: 'New Number', type: 'number', id: 'newNumber' },
              { label: 'New Date', type: 'datetime-local', id: 'newDate' },
              { label: 'New Select', type: 'select', id: 'newSelect', options: [] }
            ];
            this.defaultFieldIds = this.availableFields.map(field => field.id);
            Object.keys(this.masterTemplate).forEach(sectionKey => {
              const section = this.masterTemplate[sectionKey];
              if (this.isArray(section)) {
                this.allDropLists.push(sectionKey);
              } else {
                Object.keys(section).forEach(subKey => {
                  this.allDropLists.push(`${sectionKey}.${subKey}`);
                });
              }
            });
          } catch (error) {
            console.error('Error parsing JSON content:', error);
            this.masterTemplate = {};
          }
        },
        error: (err) => {
          console.error('Error fetching template:', err);
          this.masterTemplate = {};
        }
      });
    } else {
      this.masterTemplate = {};
      console.log('No valid template selected');
    }
  }

  openSettingsDialog() {
    const dialogRef = this.dialog.open(SettingsDialogComponent, {
      width: '400px',
      data: { visibleColumns: this.visibleColumns }
    });
    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.visibleColumns = result;
        this.updateDisplayedColumns();
      }
    });
  }

  updateDisplayedColumns() {
    const optionalColumns = ['updatedBy', 'updatedOn', 'deletedBy', 'deletedOn'];
    this.displayedColumns = ['Id', 'TemplateName', 'CreatedBy', 'CreatedOn', 'actions'];
    this.displayedColumns.push(...this.visibleColumns.filter((col) => optionalColumns.includes(col)));
  }

  // Add these methods within your component class (e.g., after existing methods)
  getFieldsByType(fields: TemplateField[], type: string): TemplateField[] {
    return fields.filter(field => field.type === type);
  }

  getNonButtonFields(fields: TemplateField[]): TemplateField[] {
    return fields.filter(field => field.type !== 'button');
  }

  deleteAccordionSection(sectionKey: string, event: Event): void {
    event.stopPropagation(); // Prevent toggling the section
    if (confirm('Are you sure you want to delete this section?')) {
      delete this.masterTemplate[sectionKey];
      // Optionally update the accordion's active state:
      delete this.activeSections[sectionKey];
      console.log(`Section ${sectionKey} deleted.`);
    }
  }

}
