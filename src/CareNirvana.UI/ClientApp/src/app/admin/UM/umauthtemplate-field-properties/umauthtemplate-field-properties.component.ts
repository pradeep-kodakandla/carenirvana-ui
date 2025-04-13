import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CrudService } from 'src/app/service/crud.service';
import { debounceTime, Subject } from 'rxjs';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { AuthService } from 'src/app/service/auth.service';


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
  authStatus?: string[];
  isEnabled?: boolean;
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
  styleUrls: ['./umauthtemplate-field-properties.component.css'],
})
export class UmauthtemplateFieldPropertiesComponent implements OnChanges {

  @Input() selectedField: TemplateField | null = null;
  @Input() selectedSection: TemplateSectionModel | null = null;
  @Output() fieldUpdated = new EventEmitter<TemplateField>();
  @Output() sectionUpdated = new EventEmitter<TemplateSectionModel>();

  searchText: string = '';
  allCodes: string[] = [];
  filteredCodes: string[] = [];



  readonly separatorKeysCodes = [ENTER, COMMA];



  dropdownOptions: DropdownOption[] = [];
  private previousDatasource: string | null = null; // Prevents continuous API calls
  authStatusOptions: string[] = ['Open', 'Close', 'Cancelled', 'Close and Adjusted', 'Reopen', 'Withdrawn'];
  private optionUpdateSubject = new Subject<void>();

  constructor(private crudService: CrudService, private authService: AuthService) {
    this.optionUpdateSubject.pipe(debounceTime(500)).subscribe(() => {
      this.emitUpdate();
    });
  }


  // Use this function instead of emitUpdate() directly in the options input field
  debouncedEmitUpdate() {
    this.optionUpdateSubject.next();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['selectedField']?.currentValue) {
      console.log("Field changed:", this.selectedField);
      if (!this.selectedField?.authStatus) {
        this.selectedField!.authStatus = []; // Ensure it's an array
      }

      // Default isEnabled to true if missing
      if (this.selectedField) {
        if (this.selectedField.isEnabled === undefined) {
          this.selectedField.isEnabled = true;
        }
      }

      // Only call API if the datasource has changed
      const currentDatasource = this.selectedField?.datasource ?? ''; // Ensure a valid string
      if (currentDatasource !== '' && currentDatasource !== this.previousDatasource) {

        this.previousDatasource = currentDatasource; // Store current value safely
        this.onDatasourceChange();
      }
    }

    if (changes['selectedField']?.currentValue) {
      if (this.selectedField?.id === 'icd10Code' || this.selectedField?.id === 'serviceCode') {
        this.loadCodesForField();
      }
    }
  }


  emitUpdate() {
    if (this.selectedField) {
      this.fieldUpdated.emit({ ...this.selectedField });
    }
  }

  toggleAuthStatus(status: string, event: any) {
    if (!this.selectedField) return;

    if (!this.selectedField.authStatus) {
      this.selectedField.authStatus = [];
    }

    if (event.target.checked) {
      this.selectedField.authStatus.push(status);
    } else {
      this.selectedField.authStatus = this.selectedField.authStatus.filter(s => s !== status);
    }

    this.emitUpdate();
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

        //  Remove Auto-Selection of Default Value
        if (this.selectedField!.defaultValue && !this.dropdownOptions.some(opt => opt.id === this.selectedField!.defaultValue)) {
          this.selectedField!.defaultValue = undefined; // ✅ Corrected
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

  clearDefaultSelection() {
    if (this.selectedField) {
      this.selectedField.defaultValue = undefined; // Reset the default selection
      this.emitUpdate();
    }
  }

  /**********ICD Code logic************** */
  loadCodesForField(): void {
    if (!this.selectedField) return;

    if (['icd10Code', 'serviceCode'].includes(this.selectedField.id)) {
      this.authService.getAllCodesets().subscribe((data: any[]) => {
        this.allCodes = data.map(d => d.code); // or d.code + ' - ' + d.codeDesc
        this.filteredCodes = [...this.allCodes];
      });
    }
  }

  filterCodes(): void {
    const q = this.searchText.toLowerCase();
    this.filteredCodes = this.allCodes.filter(c =>
      c.toLowerCase().includes(q) &&
      !this.selectedField?.selectedOptions?.includes(c)
    );
  }

  selectCode(code: string): void {
    if (!this.selectedField) return;

    if (!this.selectedField.selectedOptions) {
      this.selectedField.selectedOptions = [];
    }

    if (!this.selectedField.selectedOptions.includes(code)) {
      this.selectedField.selectedOptions.push(code);
      this.emitUpdate();
    }

    this.searchText = '';
    this.filteredCodes = [];
  }

  addCodeFromText(): void {
    if (!this.selectedField) return;

    const code = this.searchText.trim().toUpperCase();
    if (!this.selectedField.selectedOptions) {
      this.selectedField.selectedOptions = [];
    }

    if (code && !this.selectedField.selectedOptions.includes(code)) {
      this.selectedField.selectedOptions.push(code);
      this.emitUpdate();
    }

    this.searchText = '';
    this.filteredCodes = [];
  }

  removeCode(code: string): void {
    if (!this.selectedField?.selectedOptions) return;
    this.selectedField.selectedOptions = this.selectedField.selectedOptions.filter(c => c !== code);
    this.emitUpdate();
  }

}
