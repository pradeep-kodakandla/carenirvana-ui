import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CrudService } from 'src/app/service/crud.service';

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
  selector: 'app-decisiondetails',
  templateUrl: './decisiondetails.component.html',
  styleUrls: ['./decisiondetails.component.css']
})
export class DecisiondetailsComponent implements OnChanges {

  @Input() decisionData: any; // Receive data from AuthorizationComponent
  @Output() decisionSaved = new EventEmitter<any>(); // Emit saved data

  formFields: { key: string; value: any }[] = [];
  sections: any[] = []; // Store structured sections
  hasValidationErrors: boolean = false; // Track validation status
  // Declare formData to store field values & validation errors
  formData: { [key: string]: { value: any; error: string } } = {};
  tabs: Tab[] = []; // Declare an empty array initially
  selectedTabId: string = ''; // No default selection at the start

  constructor(
    private crudService: CrudService,
  ) { }


  ngOnChanges(changes: SimpleChanges): void {

    if (this.decisionData) {
      this.loadSections();
      this.generateTabs();
    }
    if (changes['decisionData']) {
      this.updateFormFields(this.decisionData || {});
    }
  }

  generateTabs(): void {
    // Extract service details correctly
    const serviceDetails = this.decisionData?.serviceDetails?.entries || [];

    // Generate tabs dynamically
    this.tabs = serviceDetails.map((service: any, index: number) => ({
      id: (index + 1).toString(), // Auto-increment ID
      name: `Decision ${index + 1} :  (${service.serviceCode || 'N/A'}) ${this.formatDate(service.fromDate)} - ${this.formatDate(service.toDate)}`
    }));

    // Set default selected tab
    if (this.tabs.length > 0) {
      this.selectedTabId = this.tabs[0].id;
    }

    console.log("Generated Tabs:", this.tabs); // Debugging log
  }

  formatDate(dateString: string | null): string {
    if (!dateString) return 'N/A'; // Handle null/undefined dates
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? 'Invalid Date' : date.toISOString().split('T')[0]; // Extract YYYY-MM-DD
  }

  loadSections(): void {
    if (!this.decisionData || Object.keys(this.decisionData).length === 0) {
      console.warn("No decisionData available, skipping section loading.");
      this.sections = [];
      return;
    }

    this.sections = Object.keys(this.decisionData)
      .filter(sectionKey => this.decisionData[sectionKey] && this.decisionData[sectionKey].fields)
      .map(sectionKey => {
        const section = this.decisionData[sectionKey];
        return {
          sectionName: section.sectionName,
          order: section.order || 0,
          expanded: true,
          fields: Array.isArray(section.fields) ? section.fields.map((field: any) => ({
            ...field,
            value: field.value || '',
            errors: ''
          })) : []
        };
      });

    this.sections.sort((a, b) => a.order - b.order);

    // ✅ Initialize formData only if sections exist
    if (this.sections.length > 0) {
      this.sections.forEach(section => {
        section.fields.forEach((field: { id: string | number; value: any; }) => {
          this.formData[field.id] = { value: field.value || '', error: '' };
        });
      });
    }
  }




  updateFormFields(data: any): void {
    this.formFields = Object.keys(data).length > 0
      ? Object.keys(data).map(key => ({ key, value: data[key] }))
      : this.getEmptyFormFields();
  }

  getEmptyFormFields(): { key: string; value: any }[] {
    return [
      { key: 'serviceDetails', value: '' },
      { key: 'decisionDetails', value: '' },
      { key: 'decisionNotes', value: '' },
      { key: 'decisionMemberInfo', value: '' }
    ];
  }

  //tabs: Tab[] = [
  //  { id: '33501', name: '33501 (CPT) 01/01/2024 - 12/31/2024 - Pending' },
  //  { id: '23310', name: '23310 (ICD) 01/01/2024 - 12/31/2024 - Completed' }
  //];
  

  selectTab(tabId: string): void {
    this.selectedTabId = tabId;

    // Fetch the JSON dynamically based on tab selection
    this.loadDecisionData(tabId);
    console.log("DecisionDate:", this.decisionData);
  }

  loadDecisionData(tabId: string): void {
    // Simulate API call to fetch JSON based on tabId
   
  }

  // Save and emit data back to AuthorizationComponent
  saveDecisionData(): void {
    this.hasValidationErrors = false; // Reset validation errors

    // Validate fields before saving
    this.sections.forEach((section: { fields: any[] }) => {
      section.fields.forEach((field: { id: string; required?: boolean; value: any; displayName?: string; requiredMsg?: string }) => {
        if (field.required && !field.value) {
          this.formData[field.id] = {
            value: field.value,
            error: field.requiredMsg || `${field.displayName} is required.`
          };
          this.hasValidationErrors = true;
        } else {
          this.formData[field.id] = { value: field.value, error: '' }; // Clear previous errors if field is valid
        }
      });
    });

    // If validation errors exist, stop the save process
    if (this.hasValidationErrors) {
      console.log("Validation errors found. Fix them before saving.");
      return;
    }

    // Prepare and emit valid data
    const updatedData = this.sections.reduce((acc: Record<string, any>, section) => {
      acc[section.sectionName] = section.fields.reduce((fieldsAcc: Record<string, any>, field: { id: string; value: any }) => {
        fieldsAcc[field.id] = field.value;
        return fieldsAcc;
      }, {});
      return acc;
    }, {});

    this.decisionSaved.emit(updatedData);
    console.log('Decision data saved:', updatedData);
  }



  toggleSection(section: { expanded: boolean }): void {
    console.log("section", section);
    console.log("section expanded", section.expanded);
    section.expanded = !section.expanded;
  }


}
