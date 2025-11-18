import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { RolepermissionService } from 'src/app/service/rolepermission.service';

// --- Feature / Feature Group ---

export interface FeatureGroup {
  featureGroupId: number;
  featureGroupName: string;
}

export interface Feature {
  featureId: number;
  featureName: string;
  featureGroupId: number;
}

// --- Custom Field Schema (simplified from your master) ---

export type CustomFieldType =
  | 'text'
  | 'textarea'
  | 'dropdown'
  | 'radio'
  | 'checkbox'
  | 'listbox'
  | 'date'
  | 'datetime'
  | 'number'
  | 'email'
  | 'phone'
  | 'url'
  | 'file'
  | 'dynamictable';

export interface CustomFieldOption {
  optionId?: string;
  optionValue: string;
  optionLabel: string;
  displayOrder: number;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface CustomFieldDefinition {
  fieldDefinitionId: string;
  fieldName: string;
  fieldLabel: string;
  fieldType: CustomFieldType;
  displayOrder: number;
  isRequired: boolean;
  isActive: boolean;
  isSearchable: boolean;
  entityType: string;       // Member / Provider / etc.
  section: string;          // e.g., Credentials
  options?: CustomFieldOption[];
  helpText?: string;
  placeHolder?: string;
}

@Component({
  selector: 'app-user-defined-custom-fields',
  templateUrl: './userdefinedcustomfields.component.html',
  styleUrls: ['./userdefinedcustomfields.component.css']
})
export class UserDefinedCustomFieldsComponent implements OnInit {

  // top summary
  totalFields = 0;
  activeFields = 0;
  fieldTypesUsed = 0;

  // filters
  featureGroups: FeatureGroup[] = [];
  features: Feature[] = [];

  selectedFeatureGroupId: number | null = null;
  selectedFeatureId: number | null = null;

  fieldTypes: CustomFieldType[] = [
    'text', 'textarea', 'dropdown', 'radio', 'checkbox', 'listbox',
    'date', 'datetime', 'number', 'email', 'phone', 'url', 'file', 'dynamictable'
  ];

  entityTypes: string[] = ['Member', 'Provider', 'Care Plan', 'Authorization']; // adjust as needed
  sections: string[] = []; // will come from backend later

  // grid data
  customFields: CustomFieldDefinition[] = [];
  filteredFields: CustomFieldDefinition[] = [];

  searchText = '';
  filterType: CustomFieldType | 'All' = 'All';
  filterStatus: 'All' | 'Active' | 'Inactive' = 'All';

  // editor
  editorOpen = false;
  isEditMode = false;
  fieldForm!: FormGroup;

  // this can come from route / module context
  moduleId!: number;
  selectedFeatureGroups: string[] = []; // you already have this in role screen

  constructor(
    private roleService: RolepermissionService,
    private fb: FormBuilder
  ) { }

  async ngOnInit(): Promise<void> {
    this.buildFieldForm();
    await this.loadFeatureGroups();
    // TODO: optionally auto-select first group & feature
  }

  private buildFieldForm(): void {
    this.fieldForm = this.fb.group({
      fieldDefinitionId: [''],
      fieldName: [''],
      fieldLabel: [''],
      fieldType: [''],
      entityType: [''],
      section: [''],
      displayOrder: [1],
      isRequired: [false],
      isActive: [true],
      isSearchable: [false],
      helpText: [''],
      placeHolder: [''],
      // options will be handled separately in UI for dropdown/radio/checkbox/listbox
    });
  }

  // ---------------------------------
  // Feature groups / features
  // ---------------------------------

  //private async loadFeatureGroups(): Promise<void> {

  //  this.roleService.getFeatureGroups(1).subscribe({
  //    next: (data: any[]) => {
  //      this.featureGroups = (data || [])
  //        .map(item => ({
  //          // pick whatever id field you actually have
  //          featureGroupId: Number(item.featureGroupId ?? 0),
  //          featureGroupName: item.featureGroupName || ''
  //        }))
  //        .filter(o => !isNaN(o.featureGroupName));
  //      console.log('Fetched activity types:', data);
  //    },
  //    error: err => {
  //      console.error('Error fetching activity types', err);
  //      this.featureGroups = [];
  //    }
  //  });

  //  // assumes moduleId + selectedFeatureGroups are already set from parent
  //  /* const featureGroups = await this.roleService.getFeatureGroups(1).toPromise();*/
  //  console.log('Loaded feature groups:', this.featureGroups);
  //  //const validGroups = (featureGroups ?? []).filter((fg: FeatureGroup) =>
  //  //  this.selectedFeatureGroups.includes(fg.featureGroupName)
  //  //);

  //  //this.featureGroups = validGroups;
  //}
  private loadFeatureGroups(): void {
    this.roleService.getFeatureGroups(1).subscribe({
      next: (resp: any) => {
        console.log('Raw feature groups response:', resp);

        const data: any[] = Array.isArray(resp)
          ? resp
          : (resp?.data || resp?.result || []);

        if (!Array.isArray(data) || data.length === 0) {
          this.featureGroups = [];
          return;
        }

        // See what fields actually exist on one item
        console.log('First item keys:', Object.keys(data[0]), data[0]);

        this.featureGroups = data
          .map(item => ({
            // try multiple possible property names in case of different casing
            featureGroupId: Number(
              item.featureGroupId ??
              item.feature_group_id ??
              item.id ??
              0
            ),
            featureGroupName:
              item.featureGroupName ??
              item.feature_group_name ??
              item.name ??
              ''
          }))
          // remove rows without id or name
          .filter(g => !!g.featureGroupId && !!g.featureGroupName);

        console.log('Mapped featureGroups:', this.featureGroups);
      },
      error: err => {
        console.error('Error fetching feature groups', err);
        this.featureGroups = [];
      }
    });
  }


  async onFeatureGroupChange(featureGroupId: number): Promise<void> {
    this.selectedFeatureGroupId = featureGroupId;
    this.selectedFeatureId = null;
    this.customFields = [];
    this.filteredFields = [];

    if (!featureGroupId) {
      this.features = [];
      return;
    }

    const features = await this.roleService.getFeatures(featureGroupId).toPromise();
    //this.features = features ?? [];
  }

  onFeatureChange(featureId: number): void {
    this.selectedFeatureId = featureId;
    // TODO: call your custom-field service here to load definitions
    // this.customFieldService.getFields(featureId).subscribe(fields => { ... });

    // placeholder demo list
    this.customFields = [];
    this.applyGridFilters();
    this.updateSummaryCards();
  }

  // ---------------------------------
  // Grid filtering / summary
  // ---------------------------------

  onSearchChange(text: string): void {
    this.searchText = text;
    this.applyGridFilters();
  }

  onFilterTypeChange(type: CustomFieldType | 'All'): void {
    this.filterType = type;
    this.applyGridFilters();
  }

  onFilterStatusChange(status: 'All' | 'Active' | 'Inactive'): void {
    this.filterStatus = status;
    this.applyGridFilters();
  }

  private applyGridFilters(): void {
    let fields = [...this.customFields];

    if (this.searchText) {
      const search = this.searchText.toLowerCase();
      fields = fields.filter(f =>
        f.fieldName.toLowerCase().includes(search) ||
        f.fieldLabel.toLowerCase().includes(search)
      );
    }

    if (this.filterType !== 'All') {
      fields = fields.filter(f => f.fieldType === this.filterType);
    }

    if (this.filterStatus === 'Active') {
      fields = fields.filter(f => f.isActive);
    } else if (this.filterStatus === 'Inactive') {
      fields = fields.filter(f => !f.isActive);
    }

    this.filteredFields = fields;
  }

  private updateSummaryCards(): void {
    this.totalFields = this.customFields.length;
    this.activeFields = this.customFields.filter(f => f.isActive).length;
    this.fieldTypesUsed = new Set(this.customFields.map(f => f.fieldType)).size;
  }

  // ---------------------------------
  // Editor open / close
  // ---------------------------------

  openCreateField(): void {
    this.isEditMode = false;
    this.fieldForm.reset({
      fieldDefinitionId: '',
      isActive: true,
      isRequired: false,
      isSearchable: false,
      displayOrder: this.customFields.length + 1
    });
    this.editorOpen = true;
  }

  openEditField(field: CustomFieldDefinition): void {
    this.isEditMode = true;
    this.fieldForm.patchValue(field);
    this.editorOpen = true;
  }

  closeEditor(): void {
    this.editorOpen = false;
  }

  // save handler – integrate your API later
  saveField(): void {
    if (!this.fieldForm.valid) {
      this.fieldForm.markAllAsTouched();
      return;
    }

    const value = this.fieldForm.value as CustomFieldDefinition;

    if (this.isEditMode) {
      const index = this.customFields.findIndex(f => f.fieldDefinitionId === value.fieldDefinitionId);
      if (index !== -1) {
        this.customFields[index] = { ...this.customFields[index], ...value };
      }
    } else {
      // in real app: UUID comes from backend
      value.fieldDefinitionId = crypto.randomUUID();
      this.customFields.push(value);
    }

    this.updateSummaryCards();
    this.applyGridFilters();
    this.editorOpen = false;

    // TODO: call backend to persist
  }

  toggleActive(field: CustomFieldDefinition): void {
    field.isActive = !field.isActive;
    this.updateSummaryCards();
    this.applyGridFilters();
    // TODO: backend update
  }

  toggleRequired(field: CustomFieldDefinition): void {
    field.isRequired = !field.isRequired;
    // TODO: backend update
  }

}
