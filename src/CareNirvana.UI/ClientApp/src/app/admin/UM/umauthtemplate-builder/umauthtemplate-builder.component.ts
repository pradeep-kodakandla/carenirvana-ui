import { Component, ViewChild, OnInit, EventEmitter, Output } from '@angular/core';
import { CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { TemplateService } from 'src/app/service/template.service';
import { KeyValue } from '@angular/common';
import { AuthService } from 'src/app/service/auth.service';
import { MatDialog } from '@angular/material/dialog';
import { SettingsDialogComponent } from 'src/app/admin/UM/settings-dialog/settings-dialog.component';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatSnackBar } from '@angular/material/snack-bar';

// Define an interface for a field.
// Note: displayName is now optional so that objects without it won't cause compile errors.
interface TemplateField {
  label: string;
  displayName?: string;
  type: string;
  id: string;
  options?: string[];
  required?: boolean;
  requiredMsg?: string;
  buttonText?: string;
  datasource?: string;
  selectedOptions?: string[];
  defaultValue?: string;
  order?: number;
  // For layout containers:
  layout?: string;
  fields?: TemplateField[];        // sub-fields if this is a row container
  authStatus?: string[];
  isActive?: boolean;
}

// Define an interface for a section.
interface TemplateSectionModel {
  sectionName: string;
  order: number;
  fields: TemplateField[];
  subsections?: { [key: string]: TemplateSectionModel };
}

@Component({
  selector: 'app-umauthtemplate-builder',
  templateUrl: './umauthtemplate-builder.component.html',
  styleUrls: ['./umauthtemplate-builder.component.css'],
})
export class UmauthtemplateBuilderComponent implements OnInit {
  // Our master template now holds a sections array.
  masterTemplate: { sections?: TemplateSectionModel[] } = {};
  availableFields: TemplateField[] = [];
  selectedField: TemplateField | null = null;
  selectedSection: string = '';
  allDropLists: string[] = ['available'];
  defaultFieldIds: string[] = [];
  authTemplates: any[] = [];
  selectedTemplateId: number = 0;
  newTemplateName: string = '';
  showTemplateNameError: boolean = false;
  displayedColumns: string[] = ['Id', 'TemplateName', 'CreatedBy', 'CreatedOn', 'actions'];
  isFormVisible: boolean = false;
  formMode: 'add' | 'edit' | 'view' = 'add';
  selectedEntry: any = {};
  visibleColumns: string[] = [];
  editingRowId: string | null = null;
  dataSource = new MatTableDataSource<any>();
  selectedSectionObject: TemplateSectionModel | null = null;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @Output() menuCollapse: EventEmitter<void> = new EventEmitter<void>();

  isFocused = false;
  isVisible = false;

  // Track expanded state of sections using sectionName as key.
  activeSections: { [key: string]: boolean } = {};

  // Preserve JSON insertion order (if needed)
  originalOrderComparator(a: KeyValue<string, any>, b: KeyValue<string, any>): number {
    return 0;
  }

  // Alias mapping for section keys (if needed)
  aliasMapping: { [key: string]: string } = {
    'authDetails': 'Auth Details',
    'providerDetails': 'Provider Details',
    'diagnosisDetails': 'Diagnosis Details',
    'serviceDetails': 'Service Details',
    'additionalDetails': 'Additional Details'
  };

  constructor(
    private templateService: TemplateService,
    private authService: AuthService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
  ) { }

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
      this.dataSource.data = response.map((item: any) => ({ ...item }));
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

  selectSection(section: TemplateSectionModel) {
    this.selectedSectionObject = section; // Directly reference the selected section
  }



  onFocus() {
    this.isFocused = true;
  }

  onBlur() {
    this.isFocused = false;
  }

  openForm(mode: 'add' | 'edit' | 'view', element: any = null) {
    this.formMode = mode;
    this.isVisible = true;

    // Emit event to collapse menu
    this.menuCollapse.emit();

    // Clear previous selection in the right column
    this.selectedField = null;
    this.selectedSectionObject = null;
    this.selectedSection = '';

    if (mode === 'edit' && element) {
      this.newTemplateName = element.TemplateName;
      this.selectedTemplateId = element.Id;
      this.onAuthTypeChange();
      this.selectedEntry = { ...element };
    } else if (mode === 'add') {
      this.newTemplateName = '';
      this.selectedTemplateId = 0;
      // Clear the masterTemplate when adding a new template.
      this.masterTemplate = {};
      this.selectedEntry = {};
    } else if (mode === 'view') {
      this.selectedEntry = { ...element };
    }
  }

  cancel() {
    this.isVisible = false;
  }

  confirmDelete(element: any = null) {
    // Implement deletion logic if needed.
  }

  // Map field types to input types.
  // Note: For select fields you might need a dropdown component; here we simply return text.
  getInputType(fieldType: string): string {
    switch (fieldType) {
      case 'datetime-local':
        return 'datetime-local';
      case 'number':
        return 'number';
      case 'select':
        return 'text';
      case 'textarea':
        return 'textarea';
      case 'checkbox':
        return 'checkbox';
      default:
        return 'text';
    }
  }

  onAuthTypeChange(): void {
    console.log('Selected Template ID:', this.selectedTemplateId);
    if (this.selectedTemplateId && this.selectedTemplateId !== 0) {
      this.authService.getTemplate(this.selectedTemplateId).subscribe({
        next: (data: any) => {
          if (!data || !data[0].JsonContent) {
            console.error('API returned invalid data:', data);
            return;
          }
          try {
            // Parse the new JSON format with a sections array.
            this.masterTemplate = JSON.parse(data[0].JsonContent);
            console.log('Parsed config:', this.masterTemplate);
            if (this.masterTemplate.sections && Array.isArray(this.masterTemplate.sections)) {
              // Sort sections by order (using 0 as default if order is missing).
              this.masterTemplate.sections.sort((a, b) => (a.order || 0) - (b.order || 0));
              this.masterTemplate.sections.forEach((section) => {
                // Expand each section by default.
                this.activeSections[section.sectionName] = true;
                if (section.fields && Array.isArray(section.fields)) {
                  // Sort fields by order within each section.
                  section.fields.sort((a, b) => (a.order || 0) - (b.order || 0));
                }
                // Add the section's identifier to the drop lists.
                //this.allDropLists.push(section.sectionName);
                if (typeof section.subsections === 'object' && !Array.isArray(section.subsections)) {
                  this.allDropLists.push(...Object.keys(section.subsections).map(sub => section.sectionName + '.' + sub));
                }
                else
                  this.allDropLists.push(section.sectionName);

              });
            }
            // Initialize available fields.
            this.availableFields = [
              { label: 'Text Field', displayName: 'Text Field', type: 'text', id: 'newText' },
              { label: 'Number Field', displayName: 'Number Field', type: 'number', id: 'newNumber' },
              { label: 'Date Field', displayName: 'Date Field', type: 'datetime-local', id: 'newDate' },
              { label: 'Drop Down', displayName: 'Drop Down', type: 'select', id: 'newSelect', options: [] }
            ];
            this.defaultFieldIds = this.availableFields.map(field => field.id);
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

  drop(event: CdkDragDrop<TemplateField[]>, sectionName: string) {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      console.log(`Moved item within ${sectionName} from index ${event.previousIndex} to ${event.currentIndex}`);
    } else {
      const draggedField = event.previousContainer.data[event.previousIndex];
      const isDefaultField = this.defaultFieldIds.includes(draggedField.id);
      let fieldToSelect: TemplateField;

      if (event.previousContainer.id === 'available') {
        if (isDefaultField) {
          const fieldToCopy = { ...draggedField };
          fieldToCopy.id = `${fieldToCopy.id}_copy_${Math.random().toString(36).substr(2, 9)}`;
          fieldToCopy.displayName = fieldToCopy.label; // Ensure display name

          // Check if field is already added to prevent duplicates
          if (!event.container.data.some(f => f.id === fieldToCopy.id)) {
            event.container.data.splice(event.currentIndex, 0, fieldToCopy);
            this.addFieldToSection(fieldToCopy, sectionName);
            console.log(`Duplicated default field from availableFields to ${sectionName} at index ${event.currentIndex}`);
          }
          fieldToSelect = fieldToCopy;
        } else {
          transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
          fieldToSelect = event.container.data[event.currentIndex];

          // Ensure field is only added once to the correct section
          this.addFieldToSection(fieldToSelect, sectionName);
          console.log(`Moved non-default field from availableFields to ${sectionName} at index ${event.currentIndex}`);
        }
        this.selectedField = fieldToSelect;
      } else if (event.container.id === 'available' && !this.defaultFieldIds.includes(draggedField.id)) {
        transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
        this.selectedField = event.container.data[event.currentIndex];
        console.log(`Moved field from ${sectionName} to availableFields at index ${event.currentIndex}`);
      } else {
        transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
        this.selectedField = event.container.data[event.currentIndex];

        // Ensure field is added to `masterTemplate.sections` only once
        this.addFieldToSection(this.selectedField, sectionName);
        console.log(`Moved field from ${event.previousContainer.id} to ${sectionName} at index ${event.currentIndex}`);
      }
    }

    // Ensure UI updates properly
    this.forceAngularChangeDetection();
  }


  addFieldToSection(field: TemplateField, sectionName: string) {
    const section = this.masterTemplate.sections?.find(sec => sec.sectionName === sectionName);
    if (section) {
      // Prevent duplicates: Check if the field already exists in the section
      const existingField = section.fields.find(f => f.id === field.id);
      if (!existingField) {
        section.fields.push(field);
        console.log(`Field ${field.displayName} added to section ${sectionName}`);
      } else {
        console.warn(`Field ${field.displayName} already exists in section ${sectionName}`);
      }
    } else {
      console.warn(`Section ${sectionName} not found!`);
    }
  }

  selectField(field: TemplateField, section: string) {
    // Ensure selection only applies to middle column, not available fields
    if (section !== 'available') {
      // Remove highlight from previously selected field
      if (this.selectedField && this.selectedField.id !== field.id) {
        this.selectedField.isActive = false;
      }

      // Temporarily reset selection for smooth UI updates
      this.selectedField = null;
      this.selectedSection = '';

      setTimeout(() => {
        // Ensure displayName exists; if not, default to label
        if (!field.displayName) {
          field.displayName = field.label;
        }

        // Keep the new selection and highlight it
        this.selectedField = field;
        this.selectedSection = section;
        field.isActive = true;

        // Ensure UI updates correctly
        this.forceAngularChangeDetection();
      }, 10);
    }
  }

  updateField(updatedField: TemplateField | TemplateSectionModel) {
    if ('sectionName' in updatedField && this.selectedSectionObject) {
      // Update section name
      const sectionIndex = this.masterTemplate.sections?.findIndex(sec => sec.sectionName === this.selectedSectionObject!.sectionName);
      if (sectionIndex !== undefined && sectionIndex > -1) {
        this.masterTemplate.sections![sectionIndex].sectionName = updatedField.sectionName;
      }
      this.selectedSectionObject = { ...updatedField };
    } else if ('id' in updatedField) {
      // Handle subsections
      if (this.selectedSection.includes('.')) {
        const [mainSection, subSection] = this.selectedSection.split('.');
        const section = this.masterTemplate.sections?.find(sec => sec.sectionName === mainSection);
        if (section?.subsections && section.subsections[subSection]) {
          const fieldIndex = section.subsections[subSection].fields.findIndex(f => f.id === updatedField.id);
          if (fieldIndex > -1) {
            section.subsections[subSection].fields[fieldIndex] = updatedField;
          }
        }
      } else {
        // Normal section field update
        const section = this.masterTemplate.sections?.find(sec => sec.sectionName === this.selectedSection);
        if (section && section.fields) {
          const index = section.fields.findIndex(f => f.id === updatedField.id);
          if (index > -1) {
            section.fields[index] = updatedField;
          }
        }
      }
      this.selectedField = updatedField;
    }
  }



  deleteField(field: TemplateField, sectionName: string, event: Event): void {
    event.stopPropagation();
    if (sectionName === 'available') {
      const index = this.availableFields.findIndex(f => f.id === field.id);
      if (index > -1) {
        this.availableFields.splice(index, 1);
      }
    } else if (this.masterTemplate.sections && Array.isArray(this.masterTemplate.sections)) {
      const section = this.masterTemplate.sections.find(sec => sec.sectionName === sectionName);
      if (section && section.fields) {
        const index = section.fields.findIndex(f => f.id === field.id);
        if (index > -1) {
          section.fields.splice(index, 1);
        }
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

    if (this.masterTemplate.sections) {
      this.masterTemplate.sections.forEach(section => {
        if (section.fields) {
          section.fields.forEach((field, index) => field.order = index);
        }

        if (section.subsections) {
          Object.values(section.subsections).forEach(subSection => {
            if (subSection.fields) {
              subSection.fields.forEach((field, index) => field.order = index);
            }
          });
        }
      });
    }

    const jsonData = {
      TemplateName: this.newTemplateName,
      JsonContent: JSON.stringify(this.masterTemplate), // Ensuring subsections are included
      CreatedOn: new Date().toISOString(),
      CreatedBy: 1,
      Id: this.formMode === 'edit' ? this.selectedEntry.Id : 0
    };

    this.authService.saveAuthTemplate(jsonData).subscribe({
      next: () => {
        this.isVisible = false;
        this.loadData();
        this.snackBar.open('Auth Template saved successfully!', 'Close', {
          duration: 5000,
          panelClass: ['success-snackbar']
        });
      },
      error: err => console.error('Error saving data:', err)
    });
  }


  onTemplateNameInput(): void {
    if (this.newTemplateName && this.newTemplateName.trim() !== '') {
      this.showTemplateNameError = false;
    }
  }

  isArray(value: any): value is TemplateField[] {
    return Array.isArray(value);
  }

  toggleSection(sectionName: string): void {
    this.activeSections[sectionName] = !this.activeSections[sectionName];
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

  getFieldsByType(fields: TemplateField[], type: string): TemplateField[] {
    return fields.filter(field => field.type === type);
  }

  getNonButtonFields(fields: TemplateField[]): TemplateField[] {
    return fields.filter(field => field.type !== 'button');
  }

  deleteAccordionSection(sectionName: string, event: Event): void {
    event.stopPropagation();
    if (confirm('Are you sure you want to delete this section?')) {
      if (this.masterTemplate.sections && Array.isArray(this.masterTemplate.sections)) {
        const index = this.masterTemplate.sections.findIndex(sec => sec.sectionName === sectionName);
        if (index > -1) {
          this.masterTemplate.sections.splice(index, 1);
        }
      }
      delete this.activeSections[sectionName];
      console.log(`Section ${sectionName} deleted.`);
    }
  }
  activeSubSections: { [key: string]: boolean } = {};

  objectKeys(obj: any): string[] {
    return obj ? Object.keys(obj) : [];
  }

  toggleSubSection(subSectionKey: string): void {
    this.activeSubSections[subSectionKey] = !this.activeSubSections[subSectionKey];
  }

  deleteSubSection(mainSection: string, subKey: string, event: Event): void {
    event.stopPropagation();
    const additionalDetails = this.masterTemplate.sections?.find(sec => sec.sectionName === 'Additional Details');
    if (additionalDetails && additionalDetails.subsections) {
      delete additionalDetails.subsections[subKey];
    }
  }
  getSortedSubsections(subsections: { [key: string]: TemplateSectionModel }): TemplateSectionModel[] {
    return Object.values(subsections).sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  updateSection(updatedSection: TemplateSectionModel) {
    if (this.masterTemplate.sections) {
      const index = this.masterTemplate.sections.findIndex(sec => sec.sectionName === this.selectedSectionObject?.sectionName);
      if (index !== -1) {
        this.masterTemplate.sections[index].sectionName = updatedSection.sectionName;
      }
    }
  }


  moveFieldToAvailable(field: TemplateField, sectionName: string, event: Event): void {
    event.stopPropagation();

    // Check if the sectionName refers to a subsection
    if (sectionName.includes('.')) {
      const [mainSectionName, subSectionName] = sectionName.split('.');

      // Find the main section
      const mainSection = this.masterTemplate.sections?.find(sec => sec.sectionName === mainSectionName);

      if (mainSection && mainSection.subsections) {
        // Find the subsection
        const subSection = mainSection.subsections[subSectionName];

        if (subSection && subSection.fields) {
          // Find and remove the field from the subsection
          const index = subSection.fields.findIndex(f => f.id === field.id);
          if (index > -1) {
            subSection.fields.splice(index, 1);
          }
        }
      }
    } else {
      // Handling for normal sections (not subsections)
      const section = this.masterTemplate.sections?.find(sec => sec.sectionName === sectionName);
      if (section && section.fields) {
        const index = section.fields.findIndex(f => f.id === field.id);
        if (index > -1) {
          section.fields.splice(index, 1);
        }
      }
    }

    // Move the field to available fields
    this.availableFields.push(field);

    // 🔥 Force UI to update
    this.forceAngularChangeDetection();
  }

  forceAngularChangeDetection(): void {
    setTimeout(() => {
      this.masterTemplate = { ...this.masterTemplate }; // Trigger change detection
    }, 0);
  }

  onDragStarted(field: TemplateField, section: string) {
    if (section !== 'available') {
      field.isActive = true;
      this.forceAngularChangeDetection();
    }
  }

  onDragEnded(field: TemplateField, section: string) {
    if (section !== 'available') {
      field.isActive = false;
      this.forceAngularChangeDetection();
    }
  }


}
