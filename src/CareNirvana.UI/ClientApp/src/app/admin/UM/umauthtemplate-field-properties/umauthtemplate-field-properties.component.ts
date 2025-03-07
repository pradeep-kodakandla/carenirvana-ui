import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CrudService } from 'src/app/service/crud.service';

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
  layout?: string;                 // e.g. 'row'
  fields?: TemplateField[];        // sub-fields if this is a row container
}
interface DropdownOption {
  id: string;
  value?: string; // Default field to hold dynamic data
}

interface TemplateSectionModel {
  sectionName: string;
  order: number;
  fields: TemplateField[];
  subsections?: { [key: string]: TemplateSectionModel };
}

@Component({
  selector: 'app-umauthtemplate-field-properties',
  templateUrl: './umauthtemplate-field-properties.component.html',
  styleUrls: ['./umauthtemplate-field-properties.component.css']
})
export class UmauthtemplateFieldPropertiesComponent implements OnChanges {

  @Input() selectedField: TemplateField | null = null;
  @Input() selectedSection: TemplateSectionModel | null = null;
  @Output() fieldUpdated = new EventEmitter<TemplateField>();
  @Output() sectionUpdated = new EventEmitter<TemplateSectionModel>();

  dropdownOptions: DropdownOption[] = [];
  private previousDatasource: string | null = null; // Prevents continuous API calls

  constructor(private crudService: CrudService) { }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['selectedField']?.currentValue) {
      console.log("Field changed:", this.selectedField);

      // Only call API if the datasource has changed
      const currentDatasource = this.selectedField?.datasource ?? ''; // Ensure a valid string
      if (currentDatasource !== '' && currentDatasource !== this.previousDatasource) {

        this.previousDatasource = currentDatasource; // Store current value safely
        this.onDatasourceChange();
      }
    }
  }

  emitUpdate() {
    if (this.selectedField) {
      this.fieldUpdated.emit({ ...this.selectedField });
    }
  }

  onDatasourceChange() {
    if (!this.selectedField?.datasource) {
      return;
    }

    console.log('Fetching data for datasource:', this.selectedField.datasource);

    const expectedKey = this.selectedField.datasource.toLowerCase(); // Convert datasource key to lowercase

    this.crudService.getData('um', this.selectedField.datasource).subscribe(
      (data: any[]) => {
        this.dropdownOptions = data.map(item => {
          // Find the actual key in the API response (ignoring case)
          const actualKey = Object.keys(item).find(key => key.toLowerCase() === expectedKey);

          // If found, use the actual key; otherwise, default to "Unknown"
          const value = actualKey ? item[actualKey] : 'Unknown';

          return { id: item.id, value };
        });

        console.log("Dropdown options loaded:", this.dropdownOptions);

        if (this.dropdownOptions.length > 0 && !this.selectedField!.defaultValue) {
          this.selectedField!.defaultValue = this.dropdownOptions[0].id;
        }
        this.emitUpdate();
      },
      (error) => {
        console.error("Error fetching datasource:", error);
      }
    );
  }

  emitSectionUpdate() {
    if (this.selectedSection) {
      this.sectionUpdated.emit(this.selectedSection);
    }
  }




  /**
   * Converts a string to camel case (e.g., "treatmenttype" -> "treatmentType")
   */
  /**
   * Converts a string to camelCase (e.g., "treatmenttype" -> "treatmentType", "category_name" -> "categoryName")
   */
  toCamelCase(str: string): string {
    if (!str) return ''; // Handle empty string case

    // If the string is already in camelCase, return it
    if (/^[a-z]+([A-Z][a-z]*)*$/.test(str)) {
      return str;
    }

    return str
      .toLowerCase() // Ensure all lowercase first
      .replace(/(?:^|[\s-_])(\w)/g, (match, letter, index) =>
        index === 0 ? letter.toLowerCase() : letter.toUpperCase() // First letter remains lowercase
      );
  }



  isAllSelected(): boolean {
    return !!this.selectedField?.selectedOptions &&
      this.selectedField.selectedOptions.length === this.dropdownOptions.length;
  }

  isIndeterminate(): boolean {
    return !!this.selectedField?.selectedOptions &&
      this.selectedField.selectedOptions.length > 0 &&
      this.selectedField.selectedOptions.length < this.dropdownOptions.length;
  }

  onOptionsChange(selected: string[]) {
    if (this.selectedField) {
      this.selectedField.selectedOptions = selected.filter(val => val !== 'SELECT_ALL');
      this.emitUpdate();
    }
  }

  toggleSelectAll() {
    if (!this.selectedField) return;

    if (this.isAllSelected()) {
      this.selectedField.selectedOptions = [];
    } else {
      this.selectedField.selectedOptions = this.dropdownOptions.map(opt => opt.id);
    }
    this.emitUpdate();
  }

  setDefault(optionId: string) {
    if (this.selectedField) {
      this.selectedField.defaultValue = optionId;
      this.emitUpdate();
    }
  }

  addOption() {
    if (this.selectedField) {
      if (!this.selectedField.options) {
        this.selectedField.options = [];
      }
      this.selectedField.options.push('');
      this.emitUpdate();
    }
  }

  removeOption(index: number) {
    if (this.selectedField?.options) {
      this.selectedField.options.splice(index, 1);
      this.emitUpdate();
    }
  }

  onCheckboxChange(optionId: string, event: any) {
    if (!this.selectedField) return;

    if (!this.selectedField.selectedOptions) {
      this.selectedField.selectedOptions = [];
    }

    if (event.target.checked) {
      if (!this.selectedField.selectedOptions.includes(optionId)) {
        this.selectedField.selectedOptions.push(optionId);
      }
    } else {
      this.selectedField.selectedOptions = this.selectedField.selectedOptions.filter(id => id !== optionId);
    }

    this.emitUpdate();
  }

  checkAndTriggerDatasourceChange() {
    const currentDatasource = this.selectedField?.datasource ?? ''; // Ensure a valid string

    if (currentDatasource !== '' && currentDatasource !== this.previousDatasource) {
      this.previousDatasource = currentDatasource;
      this.onDatasourceChange();
    }
  }
}
