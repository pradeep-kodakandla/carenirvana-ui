import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ViewChildren, QueryList, ElementRef, OnInit } from '@angular/core';
import { CrudService } from 'src/app/service/crud.service';
import { MatDialog } from '@angular/material/dialog';
import { DecisionbulkdialogComponent } from 'src/app/member/UM/decisionbulkdialog/decisionbulkdialog.component';


// Define interfaces for better type safety
interface Tab {
  id: string;
  name: string;
  decisionStatusLabel?: string;
  selected?: boolean;
  bgClass: string;
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

export interface MdReviewLine {
  serviceCode: string;
  description: string;
  fromDate: string;
  toDate: string;
  requested: number | string;
  approved: number | string;
  denied: number | string;
  selected: boolean;
  recommendation: string;
}

@Component({
  selector: 'app-decisiondetails',
  templateUrl: './decisiondetails.component.html',
  styleUrls: ['./decisiondetails.component.css']
})
export class DecisiondetailsComponent implements OnChanges, OnInit {
  @Input() decisionData: any;
  @Input() decisionFields: any;
  @Output() decisionSaved = new EventEmitter<any>();
  @Input() canAdd = false;
  @Input() canEdit = false;
  @Input() canView = true;
  @Input() authorizationNotesFields: any[] = [];
  @Input() authorizationNotesData: any;
  @Input() runEnsure = 0;
  @Output() goToMdReview = new EventEmitter<MdReviewLine[]>();

  formFields: { key: string; value: any }[] = [];
  sections: Section[] = [];
  hasValidationErrors: boolean = false;
  formData: { [key: string]: { value: any; error: string } } = {};
  tabs: Tab[] = [];
  selectedTabId: string = '';

  constructor(private crudService: CrudService, private dialog: MatDialog) { }



  ngOnInit(): void {
    // If the parent already has decisionData when this step instantiates,
    // do the same work you do after a click.
    if (this.decisionData && (!this.tabs || this.tabs.length === 0)) {
      this.ensureDecisionDetailsEntries();
      this.generateTabs();

      if (this.tabs.length > 0) {
        this.selectedTabId = this.selectedTabId || this.tabs[0].id;
        this.loadSectionsForTab(this.selectedTabId);
      }
    }
  }

  ngOnChanges(changes: SimpleChanges): void {

    if (changes['runEnsure']) {
      // ensure view exists, then run

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

        if (changes['decisionData']) {
          this.updateFormFields(this.decisionData || {});
        }
      }, 0);
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

      // Initialize dropdown options so they show immediately
      this.sections.forEach(section => {
        section.fields.forEach(field => {
          if (field.type === 'select' && field.options) {
            field.filteredOptions = [...field.options];
          }
        });
      });

      // Select the first tab by default if not already set
      if (!this.selectedTabId && this.tabs?.length) {
        this.selectedTabId = this.tabs[0].id;
      }

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
    const decisionEntries = this.decisionData?.decisionDetails?.entries || [];

    this.tabs = serviceEntries.map((service: any, index: number) => {
      const decisionEntry = decisionEntries[index];
      const decisionStatusValue = decisionEntry?.decisionStatus || '';
      const decisionStatusLabel = this.getDecisionStatusLabel(decisionStatusValue);

      // Assign background color class
      let bgClass = 'tab-orange'; // default
      if (decisionStatusLabel === 'Approved') {
        bgClass = 'tab-green';
      } else if (
        decisionStatusLabel === 'Denied' ||
        decisionStatusLabel === 'Void'
      ) {
        bgClass = 'tab-red';
      }

      return {
        id: (index + 1).toString(),
        name: `Decision ${index + 1} : (${service.serviceCode || 'N/A'}) ${this.formatDate(service.fromDate)} - ${this.formatDate(service.toDate)}`,
        decisionStatusLabel,
        bgClass
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
        isEnabled: field.isEnabled ?? true,
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
    if (!this.selectedTabId) {
      console.warn("No tab selected. Cannot save decision data.");
      return;
    }

    const tabIndex = this.tabs.findIndex(tab => tab.id === this.selectedTabId);
    if (tabIndex === -1) {
      console.warn(`Selected tab with ID ${this.selectedTabId} not found.`);
      return;
    }

    let hasValidationError = false;
    let decisionValue: any = "";
    let selectedTabs = [this.tabs[tabIndex]];

    // If bulk decision is enabled, validate and prepare selected tabs
    if (this.enableBulkDecision) {
      selectedTabs = this.tabs.filter(t => t.selected);
      const currentSection = this.sections.find(s => s.sectionId === this.selectedTabId);
      const decisionField = currentSection?.fields.find(f => f.id === 'decisionStatus');

      if (!decisionField || !decisionField.value) {
        alert('Please set Decision Status in the current tab before applying bulk decision.');
        return;
      }

      decisionValue = decisionField.value;
      const decisionDisplay = decisionField.displayLabel;

      if (selectedTabs.length === 0) {
        alert('Please select at least one tab to apply bulk decision.');
        return;
      }

      //selectedTabs.forEach(tab => {
      //  const section = this.sections.find(s => s.sectionName === tab.name);
      //  const fieldToUpdate = section?.fields.find(f => f.id === 'decisionStatus');
      //  if (fieldToUpdate) {
      //    fieldToUpdate.value = decisionValue;
      //    fieldToUpdate.displayLabel = decisionDisplay;
      //  }
      //});

      alert(`Bulk decision '${decisionField.displayLabel}' applied to ${selectedTabs.length} tab(s).`);
    }

    // Define section mapping
    const sectionKeyMap: { [key: string]: string } = {
      "Decision Details": "decisionDetails",
      "Decision Notes": "decisionNotes",
      "Member Provider Decision Info": "decisionMemberInfo"
    };



    selectedTabs.forEach(tab => {
      const index = this.tabs.findIndex(t => t.id === tab.id);

      this.sections.forEach(section => {
        const sectionKey = sectionKeyMap[section.sectionName];
        if (!sectionKey || !this.decisionData[sectionKey]?.entries[index]) {
          console.warn(`Section ${section.sectionName} or entry at index ${index} not found in decisionData.`);
          return;
        }

        const entry = this.decisionData[sectionKey].entries[index];
        const currentStatus = section.fields.find(f => f.id === 'decisionStatus')?.value;
        const previousStatus = this.decisionData.decisionDetails.entries[index].decisionStatus;

        section.fields.forEach(field => {
          entry[field.id] = field.value;
        });

        const now = this.formatToEST(new Date());

        if (!this.enableBulkDecision && section.sectionName === 'Decision Details') {
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
        }

        // Update timestamps
        if (previousStatus !== currentStatus) {
          this.decisionData.decisionDetails.entries[index].decisionDateTime = now;
        }
        this.decisionData.decisionDetails.entries[index].updatedDateTime = now;

        // For bulk, set approved/denied based on decision
        if (this.enableBulkDecision && section.sectionName === 'Decision Details') {

          this.decisionData.decisionDetails.entries[index].decisionStatus = decisionValue;
          if (decisionValue === '1') {
            this.decisionData.decisionDetails.entries[index].approved = entry.requested || '';
            this.decisionData.decisionDetails.entries[index].denied = 0;
          } else if (decisionValue === '3') {
            this.decisionData.decisionDetails.entries[index].denied = entry.requested || '';
            this.decisionData.decisionDetails.entries[index].approved = 0;
          }
        }
      });
    });

    if (this.enableBulkDecision) {
      this.enableBulkDecision = false;
      this.tabs.forEach(t => t.selected = false);
    }

    if (hasValidationError) return;

    this.decisionSaved.emit(this.decisionData);
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

  openBulkActionPopup() {
    const dialogRef = this.dialog.open(DecisionbulkdialogComponent, {
      width: '800px',
      data: { decisions: this.decisionData }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result?.action === 'approve') {
        this.bulkUpdateDecisions('Approved', result.decisionData);
      } else if (result?.action === 'deny') {
        this.bulkUpdateDecisions('Denied', result.decisionData);
      }
    });
  }

  bulkUpdateDecisions(status: string, decisionData: any[]) {
    const updated = decisionData.map(d => {
      return {
        ...d,
        decisionStatus: status,
        approved: status === 'Approved' ? d.requested : '',
        denied: status === 'Denied' ? d.requested : ''
      };
    });

    // assign back the updated array
    this.decisionData.entries = [...updated];

    this.saveDecisionData();
  }


  get decisions(): any[] {
    const decisionSection = this.sections.find(s => s.sectionName === 'Decision Lines');
    return decisionSection?.fields || [];
  }


  handleAuthNotesSaved(updatedNotes: any) {
    this.authorizationNotesData = updatedNotes;
  }

  enableBulkDecision: boolean = false;

  addGuideline(type: string): void {
    console.log('Selected guideline:', type);
    // Implement action based on type
  }

  //********** Method MD Review ************//


  // Accepts either a section object with { fields: Field[] } or an Array<Field>
  private getField(sectionOrFields: any, id: string) {
    const fields = Array.isArray(sectionOrFields)
      ? sectionOrFields
      : Array.isArray(sectionOrFields?.fields)
        ? sectionOrFields.fields
        : null;

    if (!fields) return undefined;
    return fields.find((f: any) => f?.id === id);
  }

  private pick(sectionOrFields: any, id: string): any {
    const f = this.getField(sectionOrFields, id);
    if (!f) return '';

    // For selects, prefer the human-friendly label when available
    if (f.type === 'select') {
      if (f.displayLabel && f.displayLabel.trim() !== '') return f.displayLabel;
      // fall back to the selected option's label if possible
      const opt = (f.filteredOptions || f.options || []).find((o: any) => o?.value === f.value);
      if (opt?.label) return opt.label;
    }

    // Default: raw value
    return f.value ?? '';
  }

  // Build the rows to show in MD Review
  public getMdReviewLines(): MdReviewLine[] {
    const list = this.decisionData?.decisionDetails?.entries || [];
    console.log('MD Review sections:', list);

    if (!Array.isArray(list) || list.length === 0) return [];

    // ---------- local helpers (keep function self-contained) ----------
    const hasField = (sec: any, id: string) => {
      // prefer direct property if present; otherwise use your existing getField
      if (sec && Object.prototype.hasOwnProperty.call(sec, id)) {
        const v = sec[id];
        return v !== undefined && v !== null && String(v).trim() !== '';
      }
      return !!this.getField(sec, id);
    };

    const pickDirectFirst = (sec: any, id: string): any => {
      if (sec && Object.prototype.hasOwnProperty.call(sec, id)) return sec[id];
      return this.pick(sec, id);
    };

    const toInt = (v: any): number => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string') {
        const s = v.trim();
        if (s === '') return 0;
        const n = Number(s);
        return isNaN(n) ? 0 : n;
      }
      return 0;
    };

    const mapDecisionStatus = (status: any, approved: any, denied: any):
      'Approved' | 'Denied' | 'Pending' => {
      const s = String(status ?? '').trim();
      if (s === '1') return 'Approved';
      if (s === '3') return 'Denied';
      // fallback inference
      const a = toInt(approved);
      const d = toInt(denied);
      if (a > 0 && d === 0) return 'Approved';
      if (d > 0 && a === 0) return 'Denied';
      return 'Pending';
    };
    // ------------------------------------------------------------------

    const rows: MdReviewLine[] = [];
    for (const sec of list) {
      // keep your skip heuristic intact
      const sectionName = (sec?.sectionName ?? '').toString().toLowerCase();
      if (sectionName.includes('decision notes')) continue;

      // treat as a service line if it has code or description
      if (!hasField(sec, 'serviceCode') && !hasField(sec, 'serviceDescription')) continue;

      const serviceCode = pickDirectFirst(sec, 'serviceCode');
      const description = pickDirectFirst(sec, 'serviceDescription');
      const fromDate = pickDirectFirst(sec, 'fromDate'); // keep as string; template formats it
      const toDate = pickDirectFirst(sec, 'toDate');
      const requested = pickDirectFirst(sec, 'requested');
      const approved = pickDirectFirst(sec, 'approved');
      const denied = pickDirectFirst(sec, 'denied');
      const decisionStatus = pickDirectFirst(sec, 'decisionStatus');

      rows.push({
        serviceCode,
        description,
        fromDate,
        toDate,
        requested,
        approved,
        denied,
        selected: false, // keep existing default selection behavior
        recommendation: mapDecisionStatus(decisionStatus, approved, denied)
      });
    }

    // Keep your final filter intact
    return rows.filter(r =>
      r.serviceCode || r.description || r.requested || r.approved || r.denied
    );
  }



  gotoMDReview(): void {
    const rows = this.getMdReviewLines();
    this.goToMdReview.emit(rows);
  }

  //********** Method MD Review ************//

  toggleBulkDecision(): void {
    this.enableBulkDecision = !this.enableBulkDecision;
    if (!this.enableBulkDecision) {
      (this.tabs || []).forEach(t => (t.selected = false));
    }
  }

}
