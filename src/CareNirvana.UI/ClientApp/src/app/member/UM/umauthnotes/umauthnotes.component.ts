import { Component, OnInit } from '@angular/core';

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
  formFields = [
    {
      id: "authorizationNoteType",
      type: "select",
      label: "Note Type",
      displayName: "Note Type",
      value: "",
      selectedOptions: [
        "General",
        "Urgent",
        "Follow-up",
        "Clinical",
        "Administrative",
        "Billing",
        "Insurance",
        "Other"
      ]
    },
    {
      id: "noteEncounteredDatetime",
      type: "datetime-local",
      label: "Note Encountered Datetime",
      displayName: "Note Encountered Datetime",
      value: "",
      required: true  // ✅ Added required field
    },
    {
      id: "authorizationNotes",
      type: "textarea",
      label: "Note Text",
      displayName: "Note Text",
      value: "",
      required: true  // ✅ Added required field
    },
    {
      id: "authorizationAlertNote",
      type: "checkbox",
      label: "Alert Note",
      displayName: "Alert Note",
      value: false
    },
    {
      id: "authorizationNoteEndDate",
      type: "datetime-local",
      label: "End Date",
      displayName: "End Date",
      value: "",
      hidden: true
    }
  ];

  notes: AuthorizationNote[] = [];
  currentNote: AuthorizationNote | null = null;

  ngOnInit(): void {
    this.loadNotes();
  }

  onAlertNoteChange(event: any) {
    let endDateField = this.formFields.find(field => field.id === "authorizationNoteEndDate");
    if (endDateField) {
      endDateField.hidden = !event.target.checked;
    }
  }

  saveNote() {
    let newNote: AuthorizationNote = {
      id: this.currentNote ? this.currentNote.id : new Date().getTime().toString(),
      authorizationNoteType: this.getFieldValue("authorizationNoteType") as string,
      noteEncounteredDatetime: this.getFieldValue("noteEncounteredDatetime") as string,
      authorizationNotes: this.getFieldValue("authorizationNotes") as string,
      authorizationAlertNote: this.getFieldValue("authorizationAlertNote") as boolean,
      authorizationNoteEndDate: this.getFieldValue("authorizationNoteEndDate") as string,
      createdOn: this.currentNote ? this.currentNote.createdOn : new Date().toISOString(),
      createdBy: this.currentNote ? this.currentNote.createdBy : "Admin",
      updatedOn: new Date().toISOString(),
      updatedBy: "Admin"
    };

    if (this.currentNote) {
      this.notes = this.notes.map(note => note.id === this.currentNote!.id ? newNote : note);
    } else {
      this.notes.push(newNote);
    }

    this.saveToLocalStorage();
    this.currentNote = null;
    this.resetForm();
  }

  editNote(note: AuthorizationNote) {
    this.currentNote = note;
    this.setFieldValue("authorizationNoteType", note.authorizationNoteType);
    this.setFieldValue("noteEncounteredDatetime", note.noteEncounteredDatetime);
    this.setFieldValue("authorizationNotes", note.authorizationNotes);
    this.setFieldValue("authorizationAlertNote", note.authorizationAlertNote);
    this.setFieldValue("authorizationNoteEndDate", note.authorizationNoteEndDate);
  }

  deleteNote(noteId: string) {
    let note = this.notes.find(n => n.id === noteId);
    if (note) {
      note.deletedBy = "Admin";
      note.deletedOn = new Date().toISOString();
      this.notes = this.notes.filter(n => !n.deletedOn);
    }
    this.saveToLocalStorage();
  }

  loadNotes() {
    const storedNotes = localStorage.getItem('authorizationNotes');
    if (storedNotes) {
      this.notes = JSON.parse(storedNotes).filter((note: AuthorizationNote) => !note.deletedOn);
    }
  }

  saveToLocalStorage() {
    localStorage.setItem('authorizationNotes', JSON.stringify(this.notes));
  }

  getFieldValue(id: string): string | boolean | undefined {
    const field = this.formFields.find(f => f.id === id);
    if (!field) return undefined;

    if (field.type === "checkbox") {
      return field.value === true;
    }

    return typeof field.value === "string" ? field.value : "";
  }

  setFieldValue(id: string, value: any) {
    let field = this.formFields.find(f => f.id === id);
    if (field) field.value = value;
  }

  resetForm() {
    this.formFields.forEach(field => field.value = field.type === "checkbox" ? false : "");
  }
}

