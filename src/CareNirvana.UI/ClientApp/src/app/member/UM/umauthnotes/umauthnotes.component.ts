import { Component, OnInit, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';

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

  @Input() notesFields: {
    id: string;
    type: string;
    label: string;
    value?: any;
    options?: any[];
    hidden?: boolean;
    selectedOptions?: string[]
  }[] = [];

  @Input() notesData: AuthorizationNote[] = [];
  @Output() NotesSaved = new EventEmitter<AuthorizationNote[]>();

  constructor(private cdRef: ChangeDetectorRef) { }

  notes: AuthorizationNote[] = [];
  currentNote: AuthorizationNote | null = null;
  showEndDatetimeField: boolean = false;
  endDatetimeValue: string = '';

  ngOnInit(): void {
    this.notes = this.notesData || [];
    this.removeEmptyRecords(); // Remove empty records on initialization
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.notesData) {
      this.notes = this.notesData || [];
      this.removeEmptyRecords();
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

  saveNote() {
    let newNote: any = {};

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
    this.resetForm();
  }

  editNote(note: any) {
    this.currentNote = { ...note };
    this.notesFields.forEach(field => {
      field.value = note[field.id] || "";
    });
  }

  deleteNote(noteId: string) {
    let note = this.notes.find(n => n.id === noteId);
    if (note) {
      note.deletedBy = "Admin";
      note.deletedOn = new Date().toISOString();
    }

    this.notes = this.notes.filter(n => !n.deletedOn);
    this.removeEmptyRecords(); // Remove empty records after delete
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
  }

  loadNotes() {
    const storedNotes = localStorage.getItem('authorizationNotes');
    if (storedNotes) {
      this.notes = JSON.parse(storedNotes).filter((note: AuthorizationNote) => !note.deletedOn);
    }
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

  //resetForm() {
  //  this.notesFields.forEach((field) => {
  //    field.value = field.type === "checkbox" ? false : "";
  //  });
  //}
}
