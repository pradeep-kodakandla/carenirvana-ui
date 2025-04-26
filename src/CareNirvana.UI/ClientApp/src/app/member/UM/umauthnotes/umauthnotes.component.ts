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
}

@Component({
  selector: 'app-umauthnotes',
  templateUrl: './umauthnotes.component.html',
  styleUrl: './umauthnotes.component.css'
})
export class UmauthnotesComponent implements OnInit {


  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

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

  ngOnInit(): void {

    this.crudService.getData('um', 'notetype').subscribe((response) => {
      this.noteTypeMap = new Map<string, string>(
        response.map((opt: any) => [opt.id, opt.noteType])
      );
    });


    //this.notes = this.notesData || [];
    this.notesFields.forEach(field => {
      if (field.type === 'select') {
        if (!field.value) {
          field.value = "";
          field.displayLabel = "Select"; // <-- Add this
        } else {
          const selected = field.options?.find((opt: any) => opt.value === field.value);
          field.displayLabel = selected?.label || "Select";
        }
      }
    });



    this.notes = (this.notesData || []).map(note => ({
      ...note,
      authorizationNoteTypeLabel: this.noteTypeMap.get(note.authorizationNoteType || '') || 'Unknown'
    }));

    this.dataSource.data = this.notes;
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
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

    if (!isChecked) {
      this.endDatetimeValue = '';
    }
  }

  saveNote(form: NgForm): void {
    this.showValidationErrors = true;
    let newNote: any = {};
    this.dataSource.data = this.notes;

    if (form.invalid) {
      // Form is invalid – stop submission
      console.warn('Validation failed');
      return;
    }
    // Capture form field values dynamically
    this.notesFields.forEach(field => {
      newNote[field.id] = field.value;
    });

    // Ensure `authorizationNoteType` is correctly captured
    if (!newNote.authorizationNoteType || newNote.authorizationNoteType === "") {
      console.warn("⚠️ Warning: authorizationNoteType is missing or empty!");
    }

    if (this.currentNote) {
      // Editing an existing note
      newNote.id = this.currentNote.id;
      newNote.createdOn = this.currentNote.createdOn;
      newNote.createdBy = this.currentNote.createdBy;
      newNote.updatedOn = new Date().toISOString();
      newNote.updatedBy = "Admin";

      this.notes = this.notes.map(note => note.id === this.currentNote!.id ? newNote : note);
    } else {
      // Adding a new note
      newNote.id = new Date().getTime().toString();
      newNote.createdOn = new Date().toISOString();
      newNote.createdBy = "Admin";

      this.notes.push(newNote);
    }

    this.removeEmptyRecords(); // Remove empty records before emitting
    this.NotesSaved.emit(this.notes);
    this.currentNote = null;

    this.notes = this.notes.map(note => ({
      ...note,
      authorizationNoteTypeLabel: this.noteTypeMap.get(note.authorizationNoteType || '') || 'Unknown'
    }));

    this.dataSource.data = [...this.notes];

    this.resetForm();
  }

  editNote(note: any) {
    this.openForm('edit');
    this.isFormVisible = true;
    this.currentNote = { ...note };
    this.notesFields.forEach(field => {
      field.value = note[field.id] || "";
    });

    this.notes = this.notes.map(note => ({
      ...note,
      authorizationNoteTypeLabel: this.noteTypeMap.get(note.authorizationNoteType || '') || 'Unknown'
    }));

    this.dataSource.data = [...this.notes];

  }

  deleteNote(noteId: string) {

    this.notes = this.notes.map(note => ({
      ...note,
      authorizationNoteTypeLabel: this.noteTypeMap.get(note.authorizationNoteType || '') || 'Unknown'
    }));

    this.dataSource.data = this.notes;

    let note = this.notes.find(n => n.id === noteId);
    if (note) {
      note.deletedBy = "Admin";
      note.deletedOn = new Date().toISOString();
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
      return Object.keys(note).some(key => {
        const typedKey = key as keyof typeof note; // Explicitly cast key
        return note[typedKey] !== null && note[typedKey] !== "" && note[typedKey] !== undefined;
      });
    });
  }


  resetForm() {
    this.notesFields.forEach(field => {
      field.value = field.type === "checkbox" ? false : "";
    });
    this.showEndDatetimeField = false;
    this.showValidationErrors = false;
    this.isFormVisible = false;
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






}
