import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CrudService } from 'src/app/service/crud.service';

// Define interfaces for better type safety
interface Tab {
  id: string;
  name: string;
}

interface Field {
  id: string;
  type: string;
  label: string;
  order: number;
  displayName: string;
  required?: boolean;
  defaultValue?: string;
  selectedOptions?: string[];
  datasource?: string;
}

interface Section {
  sectionId: string;
  sectionName: string;
  fields: Array<{
    id: string;
    displayName: string;
    value: any;
    type: string;
    required: boolean;
    options?: Array<{ value: string; label: string }>;
    datasource?: string;
  }>;
  expanded?: boolean;
}

@Component({
  selector: 'app-decisiondetails',
  templateUrl: './decisiondetails.component.html',
  styleUrls: ['./decisiondetails.component.css']
})
export class DecisiondetailsComponent implements OnChanges {
  @Input() decisionData: any;
  @Input() decisionFields: any;
  @Output() decisionSaved = new EventEmitter<any>();

  formFields: { key: string; value: any }[] = [];
  sections: Section[] = [];
  hasValidationErrors: boolean = false;
  formData: { [key: string]: { value: any; error: string } } = {};
  tabs: Tab[] = [];
  selectedTabId: string = '';

  constructor(private crudService: CrudService) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['decisionData'] && this.decisionData) {
      setTimeout(() => {
        this.ensureDecisionDetailsEntries();
        this.generateTabs();

        // ✅ Auto-select first tab and load all sections
        //if (this.tabs.length > 0) {
        //  this.selectedTabId = this.tabs[0].id;
        //  this.loadSectionsForTab(this.selectedTabId);
        //}

        if (this.tabs.length > 0 && !this.selectedTabId) {
          this.selectedTabId = this.tabs[0].id;
          this.loadSectionsForTab(this.selectedTabId);
        } else if (this.selectedTabId) {
          this.loadSectionsForTab(this.selectedTabId);
        }
      }, 0);
    }
    if (changes['decisionData']) {
      this.updateFormFields(this.decisionData || {});
    }
  }

  ensureDecisionDetailsEntries(): void {
    if (!this.decisionData?.serviceDetails || !Array.isArray(this.decisionData.serviceDetails.entries)) {

      this.decisionData = {
        ...this.decisionData,
        decisionDetails: { ...this.decisionData.decisionDetails, entries: [] },
        decisionNotes: { ...this.decisionData.decisionNotes, entries: [] },
        decisionMemberInfo: { ...this.decisionData.decisionMemberInfo, entries: [] }
      };
      return;
    }

    const serviceEntries = this.decisionData.serviceDetails.entries;

    if (!this.decisionData.decisionDetails.entries) {
      this.decisionData.decisionDetails.entries = serviceEntries.map((service: any, index: number) => ({
        decisionNumber: (index + 1).toString(),
        serviceCode: service.serviceCode || 'N/A',
        fromDate: service.fromDate || '',
        toDate: service.toDate || ''
      }));
    }

    if (!this.decisionData.decisionNotes.entries) {
      this.decisionData.decisionNotes.entries = serviceEntries.map(() => ({}));
    }

    if (!this.decisionData.decisionMemberInfo.entries) {
      this.decisionData.decisionMemberInfo.entries = serviceEntries.map(() => ({}));
    }
  }

  generateTabs(): void {
    const serviceDetails = this.decisionData?.serviceDetails?.entries || [];
    this.tabs = serviceDetails.map((service: any, index: number) => ({
      id: (index + 1).toString(),
      name: `Decision ${index + 1} : (${service.serviceCode || 'N/A'}) ${this.formatDate(service.fromDate)} - ${this.formatDate(service.toDate)}`
    }));
    if (this.tabs.length > 0 && !this.selectedTabId) {
      this.selectedTabId = this.tabs[0].id;
    }
  }

  formatDate(dateString: string | null): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? 'Invalid Date' : date.toISOString().split('T')[0];
  }

  loadSectionsForTab(tabId: string): void {
    if (!this.decisionData) {
      console.warn("No decision data available.");
      this.sections = [];
      return;
    }

    const tabIndex = this.tabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) {
      console.warn(`Tab ${tabId} not found.`);
      this.sections = [];
      return;
    }

    this.sections = [];

    // Decision Details Section
    if (this.decisionData.decisionDetails?.fields && this.decisionData.decisionDetails.entries[tabIndex]) {
      const entry = this.decisionData.decisionDetails.entries[tabIndex];
      this.sections.push({
        sectionId: tabId,
        sectionName: "Decision Details",
        fields: this.decisionData.decisionDetails.fields.map((field: any) => ({
          id: field.id,
          displayName: field.displayName,
          type: field.type,
          value: entry[field.id] || '',
          required: field.required || false,
          options: field.type === 'select' ? field.options || [] : undefined
        }))
      });
    }

    // Decision Notes Section
    if (this.decisionData.decisionNotes?.fields && this.decisionData.decisionNotes.entries[tabIndex]) {
      const entry = this.decisionData.decisionNotes.entries[tabIndex];
      this.sections.push({
        sectionId: tabId,
        sectionName: "Decision Notes",
        fields: this.decisionData.decisionNotes.fields.map((field: any) => ({
          id: field.id,
          displayName: field.displayName,
          type: field.type,
          value: entry[field.id] || '',
          required: field.required || false,
          options: field.type === 'select' ? field.options || [] : undefined
        }))
      });
    }

    // Member Provider Decision Info Section
    if (this.decisionData.decisionMemberInfo?.fields && this.decisionData.decisionMemberInfo.entries[tabIndex]) {
      const entry = this.decisionData.decisionMemberInfo.entries[tabIndex];
      this.sections.push({
        sectionId: tabId,
        sectionName: "Member Provider Decision Info",
        fields: this.decisionData.decisionMemberInfo.fields.map((field: any) => ({
          id: field.id,
          displayName: field.displayName,
          type: field.type,
          value: entry[field.id] || '',
          required: field.required || false,
          options: field.type === 'select' ? field.options || [] : undefined
        }))
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

  selectTab(tabId: string): void {
    this.selectedTabId = tabId;
    this.loadSectionsForTab(tabId);
  }

  saveDecisionData(): void {
    // Check if a tab is selected
    if (!this.selectedTabId) {
      console.warn("No tab selected. Cannot save decision data.");
      return;
    }

    // Find the index of the selected tab
    const tabIndex = this.tabs.findIndex(tab => tab.id === this.selectedTabId);
    if (tabIndex === -1) {
      console.warn(`Selected tab with ID ${this.selectedTabId} not found.`);
      return;
    }

    // Define the mapping of section names to decisionData keys
    const sectionKeyMap: { [key: string]: string } = {
      "Decision Details": "decisionDetails",
      "Decision Notes": "decisionNotes",
      "Member Provider Decision Info": "decisionMemberInfo"
    };

    // Update the entries for each section based on the selected tab's index
    this.sections.forEach(section => {
      const sectionKey = sectionKeyMap[section.sectionName];
      if (sectionKey && this.decisionData[sectionKey]?.entries[tabIndex]) {
        const entry = this.decisionData[sectionKey].entries[tabIndex];
        section.fields.forEach(field => {
          entry[field.id] = field.value;
        });
      } else {
        console.warn(`Section ${section.sectionName} or entry at index ${tabIndex} not found in decisionData.`);
      }
    });

    // Emit the updated decisionData to the parent component
    this.decisionSaved.emit(this.decisionData);

    // Reload the sections to reflect the saved changes in the UI
    // this.loadSectionsForTab(this.selectedTabId);
  }

  toggleSection(section: Section): void {
    section.expanded = !section.expanded;
  }
}
