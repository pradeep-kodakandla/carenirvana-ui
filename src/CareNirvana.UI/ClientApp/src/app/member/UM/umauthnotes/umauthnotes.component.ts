import { Component, OnInit, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef, ViewChild, ViewChildren, ElementRef, QueryList } from '@angular/core';
import { NgForm } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { CrudService } from 'src/app/service/crud.service';


interface AuthorizationNote {
  id: string;
  authorizationNoteType?: string;
  noteEncounteredDatetime?: string;
  authorizationNotes?: string;
  authorizationAlertNote?: boolean;
  authorizationNoteEndDate?: string;
  createdOn: string;
  createdBy: string;
  updatedOn?: string;
  updatedBy?: string;
  deletedOn?: string;
  deletedBy?: string;
  authorizationNoteTypeLabel?: string;
}

@Component({
  selector: 'app-umauthnotes',
  templateUrl: './umauthnotes.component.html',
  styleUrl: './umauthnotes.component.css'
})
export class UmauthnotesComponent implements OnInit {


  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild('hiddenEndDatetimePicker') hiddenEndDatetimePicker!: ElementRef<HTMLInputElement>;

  @Input() notesFields: any[] = [];

  @Input() notesData: AuthorizationNote[] = [];
  @Output() NotesSaved = new EventEmitter<AuthorizationNote[]>();

  constructor(private crudService: CrudService) { }

  notes: AuthorizationNote[] = [];
  currentNote: AuthorizationNote | null = null;
  showEndDatetimeField: boolean = false;
  endDatetimeValue: string = '';
  showValidationErrors = false;
  dataSource = new MatTableDataSource<AuthorizationNote>();
  displayedColumns: string[] = ['authorizationNoteTypeLabel', 'authorizationNotes', 'createdOn', 'createdBy', 'actions'];
  isFormVisible: boolean = false;
  noteTypeMap = new Map<string, string>();
  selectedNoteId: string | null = null;

  ngOnInit(): void {
    this.crudService.getData('um', 'notetype').subscribe((response) => {
      this.noteTypeMap = new Map<string, string>(
        response.map((opt: any) => [opt.id, opt.noteType])
      );

      this.notes = (this.notesData || []).map(note => ({
        ...note,
        authorizationNoteTypeLabel: this.noteTypeMap.get(note.authorizationNoteType || '') || 'Unknown'
      }));

      this.removeEmptyRecords(); // ✅ << ADD THIS

      this.dataSource.data = [...this.notes]; // ✅ After cleaning
      this.dataSource.paginator = this.paginator;
      this.dataSource.sort = this.sort;
    });

    this.notesFields.forEach(field => {
      if (field.type === 'select') {
        if (!field.value) {
          field.value = "";
          field.displayLabel = "Select";
        } else {
          const selected = field.options?.find((opt: any) => opt.value === field.value);
          field.displayLabel = selected?.label || "Select";
        }
      }
    });
  }



  ngOnChanges(changes: SimpleChanges): void {
    if (changes.notesData) {

      this.notes = (this.notesData || []).map(note => ({
        ...note,
        authorizationNoteTypeLabel: this.noteTypeMap.get(note.authorizationNoteType || '') || 'Unknown'
      }));

      //this.notes = this.notesData || [];
      this.removeEmptyRecords();
    }
    this.notesFields.forEach(field => {
      if (field.type === 'select' && (field.value === undefined || field.value === null)) {
        field.value = ""; // Default to "Select"
      }
    });
    this.dataSource.data = [...this.notes];

  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();

    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
  }

  onAlertNoteChange(event: any) {
    if (!event || !event.target) {
      console.error("Invalid event object in onAlertNoteChange:", event);
      return;
    }

    const isChecked = event.target.checked;
    this.showEndDatetimeField = isChecked;


  }

  saveNote(form: NgForm): void {
    this.showValidationErrors = true;

    if (form.invalid) {
      console.warn('Validation failed');
      return;
    }

    let newNote: any = {};
    this.notesFields.forEach(field => {
      newNote[field.id] = field.value;
    });
    newNote.authorizationAlertNote = this.showEndDatetimeField;
    newNote.authorizationNoteEndDate = this.endDatetimeValue || '';

    if (this.currentNote) {
      // Editing existing note
      newNote.id = this.currentNote.id;
      newNote.createdOn = this.currentNote.createdOn;
      newNote.createdBy = this.currentNote.createdBy;
      newNote.updatedOn = this.formatToEST(new Date());
      newNote.updatedBy = "Admin";

      this.notes = this.notes.map(note => note.id === this.currentNote!.id ? newNote : note);
    } else {
      // Adding a new note
      newNote.id = new Date().getTime().toString();
      newNote.createdOn = this.formatToEST(new Date());
      newNote.createdBy = "Admin";

      this.notes.push(newNote);
    }

    // 🛠 Map the authorizationNoteTypeLabel BEFORE emitting
    this.notes = this.notes.map(note => ({
      ...note,
      authorizationNoteTypeLabel: this.noteTypeMap.get(note.authorizationNoteType || '') || 'Unknown'
    }));

    this.removeEmptyRecords(); // ✅ Remove bad records

    this.dataSource.data = [...this.notes];

    this.NotesSaved.emit([...this.notes]); // ✅ Emit clean notes after mapping

    this.currentNote = null;
    this.resetForm();
  }


  editNote(note: any) {
    this.openForm('edit');
    this.isFormVisible = true;
    this.selectedNoteId = note.id;
    this.currentNote = { ...note };

    this.notesFields.forEach(field => {
      const value = note[field.id] || '';
      field.value = value;

      if (field.type === 'select') {
        const selected = field.options?.find((opt: any) => opt.value === value);
        field.displayLabel = selected?.label || 'Select';
      }
    });

    // ✅ Handle alert note checkbox and end datetime outside loop
    this.showEndDatetimeField = !!note.authorizationAlertNote;
    this.endDatetimeValue = note.authorizationNoteEndDate || '';

    // Refresh mapped labels for display
    this.notes = this.notes.map(note => ({
      ...note,
      authorizationNoteTypeLabel: this.noteTypeMap.get(note.authorizationNoteType || '') || 'Unknown'
    }));

    this.dataSource.data = [...this.notes];
  }



  deleteNote(noteId: string) {

    const confirmDelete = confirm("Are you sure you want to delete this notes?");
    if (!confirmDelete) {
      return; // User canceled
    }

    this.notes = this.notes.map(note => ({
      ...note,
      authorizationNoteTypeLabel: this.noteTypeMap.get(note.authorizationNoteType || '') || 'Unknown'
    }));

    this.dataSource.data = this.notes;

    let note = this.notes.find(n => n.id === noteId);
    if (note) {
      note.deletedBy = "Admin";
      note.deletedOn = this.formatToEST(new Date());
    }

    this.notes = this.notes.filter(n => !n.deletedOn);

    this.removeEmptyRecords(); // Remove empty records after delete
    this.dataSource.data = [...this.notes];
    this.NotesSaved.emit(this.notes);
  }

  /**
   * Removes empty records from the notes array.
   */
  private removeEmptyRecords() {
    this.notes = this.notes.filter(note => {
      const hasValidFields = Object.keys(note).some(key => {
        const typedKey = key as keyof typeof note;
        return note[typedKey] !== null && note[typedKey] !== "" && note[typedKey] !== undefined;
      });

      const hasValidDate = this.isValidDate(note.createdOn);
      const hasValidType = (note.authorizationNoteTypeLabel && note.authorizationNoteTypeLabel !== 'Unknown');

      return hasValidFields && hasValidDate && hasValidType;
    });
  }

  resetForm() {
    this.notesFields.forEach(field => {
      if (field.type === 'checkbox') {
        field.value = false;
      } else if (field.type === 'select') {
        field.value = "";
        field.displayLabel = "Select"; // ✅ Reset label for dropdown
      } else {
        field.value = "";
      }
    });

    this.showEndDatetimeField = false;
    this.endDatetimeValue = ''; // ✅ Clear the end datetime field
    this.showValidationErrors = false;
    this.isFormVisible = false;
    this.selectedNoteId = null;
  }



  getFieldValue(id: string): string | boolean | undefined {
    const field = this.notesFields.find(f => f.id === id);
    if (!field) return undefined;

    if (field.type === "checkbox") {
      return field.value === true;
    }
    return typeof field.value === "string" ? field.value : "";
  }

  setFieldValue(id: string, value: any) {
    let field = this.notesFields.find((f) => f.id === id);
    if (field) field.value = value;
  }

  openForm(mode: 'add' | 'edit') {

    this.showValidationErrors = false;
    if (mode === 'add') {
      this.resetForm();
      this.currentNote = null;
      this.isFormVisible = true;
    }
  }

  cancelForm() {
    this.resetForm();
    this.currentNote = null;
    this.isFormVisible = false;
    this.selectedNoteId = null;
  }





  filterOptions(field: any): void {
    if (!field.options) return;
    const searchValue = field.displayLabel?.toLowerCase() || '';
    field.filteredOptions = field.options.filter((opt: any) => opt.label.toLowerCase().includes(searchValue));
  }

  selectDropdownOption(field: any, option: any): void {
    field.value = option.value;
    field.displayLabel = option.label;
    field.showDropdown = false;
  }

  onSelectBlur(field: any): void {
    setTimeout(() => { field.showDropdown = false; }, 200);
  }

  //********** Method to display the datetime ************//

  @ViewChildren('calendarPickers') calendarPickers!: QueryList<ElementRef<HTMLInputElement>>;



  triggerCalendar(index: number): void {
    const picker = this.calendarPickers.toArray()[index]?.nativeElement;
    if (picker) {
      if (typeof picker.showPicker === 'function') {
        picker.showPicker();
      } else {
        picker.click();
      }
    }
  }

  handleDateTimeBlur(field: any): void {
    const input = (field.value || '').trim().toUpperCase();
    let baseDate = new Date();

    if (input === 'D') {
      field.value = this.formatDateTime(baseDate);
    } else if (/^D\+(\d+)$/.test(input)) {
      const daysToAdd = parseInt(input.match(/^D\+(\d+)$/)![1], 10);
      baseDate.setDate(baseDate.getDate() + daysToAdd);
      field.value = this.formatDateTime(baseDate);
    } else if (/^D-(\d+)$/.test(input)) {
      const daysToSubtract = parseInt(input.match(/^D-(\d+)$/)![1], 10);
      baseDate.setDate(baseDate.getDate() - daysToSubtract);
      field.value = this.formatDateTime(baseDate);
    }
  }

  handleCalendarChange(event: Event, field: any): void {
    const value = (event.target as HTMLInputElement).value;
    if (value) {
      field.value = this.formatDateTime(new Date(value));
    }
  }

  formatDateTime(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(date).replace(',', '');
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
    if (picker) {
      if ('showPicker' in picker && typeof picker.showPicker === 'function') {
        picker.showPicker();
      } else {
        picker.click();
      }
    }
  }




  triggerPicker(elementId: string): void {
    console.log('Triggering picker for ID:', elementId);
    const hiddenInput = document.getElementById(elementId) as HTMLInputElement;
    console.log('Hidden input element:', hiddenInput);
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



  handleEndDatetimeBlur(): void {
    const input = (this.endDatetimeValue || '').trim();
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
        hour12: true
      }).format(finalDate).replace(',', '');

      this.endDatetimeValue = formatted;
    }
  }

  handleNativePickerForEndDatetime(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input?.value;
    if (!value) return;

    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) return;

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

    this.endDatetimeValue = formattedDateTime;
  }

  triggerNativePicker(): void {
    if (this.hiddenEndDatetimePicker?.nativeElement) {
      this.hiddenEndDatetimePicker.nativeElement.showPicker();
    }
  }



  //********** Method to display the datetime ************//


  onFieldFocus(field: any): void {
    field.showDropdown = true;
    field.highlightedIndex = -1;
    // Small trick to refresh filtered options in case user didn't type anything yet
    if (!field.filteredOptions && field.options) {
      field.filteredOptions = [...field.options];
    }
  }

  isFocused = false;

  onFocus() {
    this.isFocused = true;
  }

  onBlur() {
    this.isFocused = false;
  }

  searchTerm: string = '';
  showSort: boolean = false;
  sortBy: string = '';

  applySort(option: string) {
    this.sortBy = option;
    const [field, direction] = option.split('_');
    const dir = direction === 'desc' ? -1 : 1;
    this.dataSource.data = [...this.dataSource.data.sort((a, b) => {
      const aVal = (a as any)[field] || '';
      const bVal = (b as any)[field] || '';
      return aVal.toString().localeCompare(bVal.toString()) * dir;
    })];
  }

  getAlertNoteCount(): number {
    return this.notes.filter(note => note.authorizationAlertNote === true).length;
  }

  getLastCreatedDate(): string {
    const validNotes = this.notes.filter(note => this.isValidDate(note.createdOn));
    if (!validNotes.length) return 'N/A';

    const latest = [...validNotes].sort((a, b) =>
      new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime()
    )[0];

    return this.formatToEST(new Date(latest.createdOn));
  }

  isValidDate(input: any): boolean {
    const date = new Date(input);
    return input && !isNaN(date.getTime());
  }


  isAlertNoteActive(note: AuthorizationNote): boolean {
    if (!note.authorizationAlertNote) {
      return false;
    }

    if (!note.authorizationNoteEndDate) {
      return true; // If no end datetime, assume still active
    }

    const now = new Date();
    const noteEndDate = new Date(note.authorizationNoteEndDate);

    if (isNaN(noteEndDate.getTime())) {
      return true; // Invalid date format - assume active
    }

    return noteEndDate.getTime() > now.getTime();
  }

  handleDropdownKeydown(event: KeyboardEvent, field: any): void {
    if (!field.filteredOptions?.length) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        field.highlightedIndex = (field.highlightedIndex + 1) % field.filteredOptions.length;
        this.scrollHighlightedIntoView(field);
        break;
      case 'ArrowUp':
        event.preventDefault();
        field.highlightedIndex = (field.highlightedIndex - 1 + field.filteredOptions.length) % field.filteredOptions.length;
        this.scrollHighlightedIntoView(field);
        break;
      case 'Enter':
        if (field.highlightedIndex >= 0 && field.highlightedIndex < field.filteredOptions.length) {
          this.selectDropdownOption(field, field.filteredOptions[field.highlightedIndex]);
        }
        break;
      case 'Escape':
        field.showDropdown = false;
        break;
    }
  }

  scrollHighlightedIntoView(field: any): void {
    setTimeout(() => {
      const dropdown = document.querySelector(`.autocomplete-dropdown[data-field-id="${field.id}"]`);
      if (!dropdown) return;

      const options = dropdown.querySelectorAll('.autocomplete-option');
      if (field.highlightedIndex >= 0 && field.highlightedIndex < options.length) {
        const selected = options[field.highlightedIndex] as HTMLElement;
        selected.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 10);
  }
}
