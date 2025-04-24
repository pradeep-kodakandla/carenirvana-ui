import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { CrudService } from 'src/app/service/crud.service';

// Define interfaces for better type safety
interface Tab {
  id: string;
  name: string;
  decisionStatusLabel?: string;
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
  isEnabled?: boolean;
  value?: any;
  options?: { value: string; label: string }[];
  filteredOptions?: { value: string; label: string }[];
  displayLabel?: string;
  showDropdown?: boolean;
}
interface Section {
  sectionId: string;
  sectionName: string;
  fields: Field[];
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

    console.log("Decision Data Changes:", this.decisionData);

    if (changes['decisionData'] && this.decisionData) {
      setTimeout(() => {
        this.ensureDecisionDetailsEntries();


        this.generateTabs();


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

  ngAfterViewInit() {
    if (this.selectedTabId) {
      this.loadSectionsForTab(this.selectedTabId);
    }
  }


  selectDropdownOption(field: any, option: any): void {
    field.value = option.value;
    field.displayLabel = option.label;
    field.showDropdown = false;
  }

  filterOptions(field: any): void {
    const search = (field.displayLabel || '').toLowerCase();
    if (Array.isArray(field.options)) {
      field.filteredOptions = field.options.filter((opt: any) =>
        opt.label.toLowerCase().includes(search) ||
        opt.value.toLowerCase().includes(search)
      );
    }
  }

  onSelectBlur(field: any): void {
    setTimeout(() => {
      field.showDropdown = false;
    }, 200);
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

    if (!this.decisionData.decisionNotes.entries || this.decisionData.decisionNotes.entries.length !== serviceEntries.length) {
      this.decisionData.decisionNotes.entries = serviceEntries.map(() => ({}));
    }

    if (!this.decisionData.decisionMemberInfo.entries || this.decisionData.decisionMemberInfo.entries.length !== serviceEntries.length) {
      this.decisionData.decisionMemberInfo.entries = serviceEntries.map(() => ({}));
    }

  }

  generateTabs(): void {
    const serviceEntries = this.decisionData?.serviceDetails?.entries || [];

    this.tabs = serviceEntries.map((service: any, index: number) => {
      // Try to find the loaded display label from the section
      const section = this.sections.find(s => s.sectionName === 'Decision Details');
      const statusField = section?.fields?.find(f => f.id === 'decisionStatus');
      const decisionStatusLabel = statusField?.displayLabel || '';

      return {
        id: (index + 1).toString(),
        name: `Decision ${index + 1} : (${service.serviceCode || 'N/A'}) ${this.formatDate(service.fromDate)} - ${this.formatDate(service.toDate)}`,
        decisionStatusLabel
      };
    });

    if (this.tabs.length > 0 && !this.selectedTabId) {
      this.selectedTabId = this.tabs[0].id;
    }
  }


  getDecisionStatusLabel(value: string): string {
    const field = this.decisionData?.decisionDetails?.fields?.find((f: any) => f.id === 'decisionStatus');
    const match = field?.options?.find((opt: any) => opt.value === value);
    return match?.label || '';
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

    const enrichField = (field: any, entry: any) => {
      const options = field.type === 'select' ? (field.options || []) : undefined;

      // Check if value exists
      let value = (entry[field.id] !== undefined && entry[field.id] !== '')
        ? entry[field.id]
        : (field.defaultValue ?? '');


      // Case 1: If value is empty and defaultValue is "D", set to current EST
      if (field.defaultValue === 'D' && field.type === 'datetime-local') {
        value = this.formatToEST(new Date());
        entry[field.id] = value; // set back into entry to persist
      }

      // Case 2: If value is still empty and defaultValue is something else (e.g., hardcoded date)
      if ((value === undefined || value === '') && field.defaultValue && value !== 'D') {
        value = field.defaultValue;
        entry[field.id] = value;
      }

      const matchedOption = options?.find((opt: any) => opt.value === value);
      const filteredOptions = options || [];

      return {
        id: field.id,
        displayName: field.displayName,
        type: field.type,
        value,
        required: field.required || false,
        isEnabled: true,
        options,
        filteredOptions,
        displayLabel: matchedOption?.label || '',
        showDropdown: false
      };

    };




    if (this.decisionData.decisionDetails?.fields && this.decisionData.decisionDetails.entries[tabIndex]) {
      const entry = this.decisionData.decisionDetails.entries[tabIndex];
      this.sections.push({
        sectionId: tabId,
        sectionName: "Decision Details",
        fields: this.decisionData.decisionDetails.fields.map((f: any) => enrichField(f, entry))
      });
    }

    if (this.decisionData.decisionNotes?.fields && this.decisionData.decisionNotes.entries[tabIndex]) {
      const entry = this.decisionData.decisionNotes.entries[tabIndex];
      this.sections.push({
        sectionId: tabId,
        sectionName: "Decision Notes",
        fields: this.decisionData.decisionNotes.fields.map((f: any) => enrichField(f, entry))
      });
    }

    if (this.decisionData.decisionMemberInfo?.fields && this.decisionData.decisionMemberInfo.entries[tabIndex]) {
      const entry = this.decisionData.decisionMemberInfo.entries[tabIndex];
      this.sections.push({
        sectionId: tabId,
        sectionName: "Member Provider Decision Info",
        fields: this.decisionData.decisionMemberInfo.fields.map((f: any) => enrichField(f, entry))
      });
    }
  }

  getOptionsFromDecisionFields(fieldId: string): Array<{ value: string, label: string }> {
    const allFields = [
      ...(this.decisionData.decisionDetails?.fields || []),
      ...(this.decisionData.decisionNotes?.fields || []),
      ...(this.decisionData.decisionMemberInfo?.fields || [])
    ];
    const field = allFields.find(f => f.id === fieldId);
    return field?.options || [];
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

    let hasValidationError = false;
    // Update the entries for each section based on the selected tab's index
    this.sections.forEach(section => {
      const sectionKey = sectionKeyMap[section.sectionName];
      if (sectionKey && this.decisionData[sectionKey]?.entries[tabIndex]) {
        const entry = this.decisionData[sectionKey].entries[tabIndex];
        const previousStatus = this.decisionData.decisionDetails.entries[tabIndex].decisionStatus;
        const currentStatus = section.fields.find(f => f.id === 'decisionStatus')?.value;

        section.fields.forEach(field => {
          entry[field.id] = field.value;
        });
        const now = this.formatToEST(new Date());


        // Business Rules Check
        if (section.sectionName === 'Decision Details') {
          const requested = entry.requested || '';
          const approved = entry.approved || '0';
          const denied = entry.denied || '0';

          if (currentStatus === '1' && requested !== approved) {
            alert('If status is Approved, Approved should equal Requested.');
            hasValidationError = true;
          }

          if (currentStatus === '1' && denied !== '0' && denied !== '') {
            alert('If status is Approved, Denied should be 0.');
            hasValidationError = true;
          }

          if (currentStatus === '3' && requested !== denied) {
            alert('If status is Denied, Denied should equal Requested.');
            hasValidationError = true;
          }

          if (currentStatus === '3' && approved !== '0' && approved !== '') {
            alert('If status is Denied, Approved should be 0.');
            hasValidationError = true;
          }

          // Update decisionDateTime if decisionStatus changed
          if (previousStatus !== currentStatus) {
            this.decisionData.decisionDetails.entries[tabIndex].decisionDateTime = now;
          }

          // Always update updatedDateTime
          this.decisionData.decisionDetails.entries[tabIndex].updatedDateTime = now;
        }
      } else {
        console.warn(`Section ${section.sectionName} or entry at index ${tabIndex} not found in decisionData.`);
      }
    });
    if (hasValidationError) return
    // Emit the updated decisionData to the parent component
    this.decisionSaved.emit(this.decisionData);

    // Reload the sections to reflect the saved changes in the UI
    // this.loadSectionsForTab(this.selectedTabId);

  }

  toggleSection(section: Section): void {
    section.expanded = !section.expanded;
  }
  //********** Method to display the datetime ************//

  @ViewChildren('pickerRef') datetimePickers!: QueryList<ElementRef<HTMLInputElement>>;


  handleDateTimeBlur(field: any, fieldId: string, entry: any): void {
    const input = (field.value || '').trim();
    let finalDate: Date | null = null;

    if (/^d\+\d+$/i.test(input)) {
      const daysToAdd = parseInt(input.split('+')[1], 10);
      finalDate = new Date();
      finalDate.setDate(finalDate.getDate() + daysToAdd);
    } else if (/^d-\d+$/i.test(input)) {
      const daysSubtract = parseInt(input.split('-')[1], 10);
      finalDate = new Date();
      finalDate.setDate(finalDate.getDate() - daysSubtract);
    } else if (/^d$/i.test(input)) {
      finalDate = new Date();
    } else {
      const parsed = new Date(input);
      if (!isNaN(parsed.getTime())) {
        finalDate = parsed;
      } else {
        return; // Invalid input
      }
    }

    if (finalDate) {
      const formatted = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(finalDate).replace(',', '');

      field.value = formatted;
      entry[fieldId] = formatted;
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
        hour12: false
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
        hour12: false
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

  //********** Method to display the datetime ************//

  filterDropdown(field: any): void {
    const searchValue = (field.value || '').toLowerCase();
    if (Array.isArray(field.options)) {
      field.filteredOptions = field.options.filter((opt: any) =>
        opt.label.toLowerCase().includes(searchValue) ||
        opt.value.toLowerCase().includes(searchValue)
      );
    }
  }


}
