// src/app/member/member-notes/member-notes.component.ts
import { Component, Input, OnInit, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { MembersummaryService, MemberNoteDto } from 'src/app/service/membersummary.service';
import { finalize } from 'rxjs/operators';

type FieldType = 'select' | 'datetime-local' | 'checkbox' | 'text' | 'textarea';

function pick<T = any>(o: any, camel: string, pascal: string, fallback: T | null = null): T | null {
  return (o?.[camel] ?? o?.[pascal] ?? fallback) as T | null;
}

interface FieldOption { value: any; label: string; }
interface NoteField {
  id: string;
  type: FieldType;
  displayName: string;
  value?: any;
  displayLabel?: string;          // for select + autocomplete UI
  required?: boolean;
  requiredMsg?: string;
  hidden?: boolean;

  // dropdown helpers
  options?: FieldOption[];
  filteredOptions?: FieldOption[];
  highlightedIndex?: number;
  showDropdown?: boolean;
}
interface NotesSummary {
  total: number;
  alerts: number;
  lastEnteredIso?: string | null;
  lastEnteredDisplay?: string;
  byType: Array<{ id: number; label: string; count: number }>;
}

@Component({
  selector: 'app-member-notes',
  templateUrl: './member-notes.component.html',
  styleUrls: ['./member-notes.component.css']
})
export class MemberNotesComponent implements OnInit {

  @Input() memberId?: number;           // works for legacy
  @Input() memberDetailsId?: number;    // works for new schema
  @Input() canAdd = true;
  @Input() canEdit = true;

  loading = false;
  total = 0;
  page = 1;
  pageSize = 25;
  summary: NotesSummary | null = null;

  dataSource = new MatTableDataSource<any>([]);
  searchTerm = '';
  showSort = false;

  // right-side form
  isFormVisible = false;
  showValidationErrors = false;
  editingId: number | null = null;

  // alert toggle controls showing End Datetime field
  showEndDatetimeField = false;
  endDatetimeValue = '';

  // calendar hidden pickers
  @ViewChildren('calendarPickers') calendarPickers!: QueryList<ElementRef<HTMLInputElement>>;
  @ViewChildren('hiddenEndDatetimePicker') hiddenEndPicker!: QueryList<ElementRef<HTMLInputElement>>;

  // quick summary (right side)
 // summary = { total: 0, alert: 0, lastCreated: '-' };

  noteTypes: Array<{ id: number; label: string }> = [];

  notesFields: NoteField[] = [
    {
      id: 'noteTypeId',
      type: 'select',
      displayName: 'Note Type',
      required: true,
      options: [], filteredOptions: [], highlightedIndex: 0, showDropdown: false, displayLabel: ''
    },
    {
      id: 'createdOn',
      type: 'datetime-local',
      displayName: 'Start Datetime',
      required: true,
      value: ''
    },
    {
      id: 'isAlert',
      type: 'checkbox',
      displayName: 'Alert Note'
    },
    {
      id: 'title',
      type: 'text',
      displayName: 'Title',
      required: false,
      value: ''
    },
    {
      id: 'notes',
      type: 'textarea',
      displayName: 'Notes',
      required: true,
      value: ''
    }
  ];

  constructor(private svc: MembersummaryService) { }

  ngOnInit(): void {
    if (!this.memberDetailsId) {
      this.memberDetailsId = Number(sessionStorage.getItem("selectedMemberDetailsId"));
    }
   // this.loadNoteTypes();
    this.reload();
  }

  // ------------ Data & mapping ------------

  get memberPointer(): number {
    // prefer new pointer if provided
    return (this.memberDetailsId ?? this.memberId) ?? 0;
  }



  reload(): void {
    if (!this.memberPointer) return;
    this.loading = true;

    this.svc.getNotes(this.memberPointer, this.page, this.pageSize, false)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (res: any) => {
          // handle either casing from server
          const rawItems = res?.items ?? res?.Items ?? [];
          this.total = res?.total ?? res?.Total ?? 0;

          const items = rawItems.map((r: any) => {
            // prefer the new membernote id; fall back to legacy memberHealthNotesId / generic id
            const primaryId =
              pick<number>(r, 'memberNoteId', 'MemberNoteId') ??
              pick<number>(r, 'memberHealthNotesId', 'MemberHealthNotesId') ??
              pick<number>(r, 'id', 'Id');

            const entered =
              pick<string>(r, 'enteredTimestamp', 'EnteredTimestamp') ??
              pick<string>(r, 'createdOn', 'CreatedOn');

            return {
              // canonical/camelCase fields the template uses
              id: primaryId ?? undefined,
              memberHealthNotesId: pick<number>(r, 'memberHealthNotesId', 'MemberHealthNotesId') ?? undefined,
              memberDetailsId:
                pick<number>(r, 'memberDetailsId', 'MemberDetailsId') ??
                pick<number>(r, 'memberId', 'MemberId') ?? undefined,
              memberId: pick<number>(r, 'memberId', 'MemberId') ?? undefined,
              noteTypeId: pick<number>(r, 'noteTypeId', 'NoteTypeId') ?? undefined,
              title: pick<string>(r, 'title', 'Title') ?? null,
              notes: pick<string>(r, 'notes', 'Notes') ?? '',
              enteredTimestamp: entered ?? null,
              isAlert: !!(pick<boolean>(r, 'isAlert', 'IsAlert') ?? false),
              isExternal: !!(pick<boolean>(r, 'isExternal', 'IsExternal') ?? false),
              displayInMemberPortal: !!(pick<boolean>(r, 'displayInMemberPortal', 'DisplayInMemberPortal') ?? false),
              activeFlag: (pick<boolean>(r, 'activeFlag', 'ActiveFlag') ?? true) as boolean,
              importance: pick<number>(r, 'importance', 'Importance') ?? null,
              tagsJson: pick<string>(r, 'tagsJson', 'TagsJson') ?? null,
              createdOn: pick<string>(r, 'createdOn', 'CreatedOn') ?? null,
              createdBy: pick<number>(r, 'createdBy', 'CreatedBy') ?? null,
              updatedOn: pick<string>(r, 'updatedOn', 'UpdatedOn') ?? null,
              updatedBy: pick<number>(r, 'updatedBy', 'UpdatedBy') ?? null,
              deletedOn: pick<string>(r, 'deletedOn', 'DeletedOn') ?? null,
              deletedBy: pick<number>(r, 'deletedBy', 'DeletedBy') ?? null,
              alertEndDateTime: pick<string>(r, 'alertEndDateTime', 'AlertEndDateTime') ?? null,
              memberProgramId: pick<number>(r, 'memberProgramId', 'MemberProgramId') ?? null,
              memberActivityId: pick<number>(r, 'memberActivityId', 'MemberActivityId') ?? null,

              // display helpers used by the left pane
              _noteTypeLabel: pick<string>(r, 'noteTypeLabel', 'NoteTypeLabel') ?? 'Note',
              _createdOnDisplay: entered ? new Date(entered).toLocaleString() : ''
            };
          });

          this.dataSource.data = items;
          this.computeSummary(items);
          // if you keep a selected item, re-sync it here if needed
          //if (this.selectedNote) {
          //  const found = items.find(x => x.id === this.selectedNote.id);
          //  if (!found) this.selectedNote = undefined;
          //}
        },
        error: _ => {
          this.total = 0;
          this.dataSource.data = [];
        }
      });
  }

  trackByNote = (_: number, n: any) => n?.id ?? n?.memberHealthNotesId ?? n?.memberNoteId ?? n?.Id ?? n?.MemberHealthNotesId;
  trackByType = (_: number, t: { id?: number; label?: string }) => t?.id ?? t?.label ?? _;


  private computeSummary(items: any[]): void {
    const total = items?.length ?? 0;
    let alerts = 0;

    // group by noteTypeId
    const byTypeMap = new Map<number, { id: number; label: string; count: number }>();

    // find latest enteredTimestamp / createdOn for display
    let latestIso: string | null = null;

    for (const n of items ?? []) {
      if (n?.isAlert) alerts++;

      const typeId: number = Number(n?.noteTypeId ?? 0) || 0;
      const label = (n?._noteTypeLabel ?? n?.noteTypeLabel ?? `Type ${typeId}`) as string;

      const bucket = byTypeMap.get(typeId) ?? { id: typeId, label, count: 0 };
      bucket.count++;
      // keep the more human label if available later
      bucket.label = label || bucket.label;
      byTypeMap.set(typeId, bucket);

      const entered = (n?.enteredTimestamp ?? n?.createdOn) as string | undefined;
      if (entered) {
        if (!latestIso || new Date(entered) > new Date(latestIso)) {
          latestIso = entered;
        }
      }
    }

    this.summary = {
      total,
      alerts,
      lastEnteredIso: latestIso ?? null,
      lastEnteredDisplay: latestIso ? new Date(latestIso).toLocaleString() : '',
      byType: Array.from(byTypeMap.values()).sort((a, b) => b.count - a.count)
    };
  }


  // ------------ Search & Sort ------------

  applyFilter(_: Event) {
    const term = (this.searchTerm ?? '').toLowerCase();
    this.dataSource.filterPredicate = (row: any) => {
      return (
        (row.notes ?? '').toLowerCase().includes(term) ||
        (row._noteTypeLabel ?? '').toLowerCase().includes(term) ||
        (row.title ?? '').toLowerCase().includes(term)
      );
    };
    this.dataSource.filter = Math.random().toString(); // trigger
  }

  applySort(key: string) {
    const data = [...this.dataSource.data];
    switch (key) {
      case 'authorizationNoteTypeLabel_asc':
        data.sort((a, b) => (a._noteTypeLabel ?? '').localeCompare(b._noteTypeLabel ?? ''));
        break;
      case 'authorizationNoteTypeLabel_desc':
        data.sort((a, b) => (b._noteTypeLabel ?? '').localeCompare(a._noteTypeLabel ?? ''));
        break;
      case 'createdOn_desc':
        data.sort((a, b) => (new Date(b.createdOn).getTime()) - (new Date(a.createdOn).getTime()));
        break;
      case 'createdOn_asc':
        data.sort((a, b) => (new Date(a.createdOn).getTime()) - (new Date(b.createdOn).getTime()));
        break;
    }
    this.dataSource.data = data;
  }

  // ------------ Form open/edit/cancel ------------

  openForm(mode: 'add' | 'edit', note?: any) {
    this.isFormVisible = true;
    this.showValidationErrors = false;

    if (mode === 'add') {
      this.editingId = null;
      this.setFieldValue('noteTypeId', null);
      this.setFieldLabel('noteTypeId', '');
      this.setFieldValue('createdOn', this.formatDateTimeLocal(new Date()));
      this.setFieldValue('isAlert', false);
      this.showEndDatetimeField = false;
      this.endDatetimeValue = '';
      this.setFieldValue('title', '');
      this.setFieldValue('notes', '');
    } else if (mode === 'edit' && note) {
      this.editingId = note.id;
      this.setFieldValue('noteTypeId', note.noteTypeId ?? null);
      this.setFieldLabel('noteTypeId', note._noteTypeLabel ?? '');
      this.setFieldValue('createdOn', this.formatDateTimeLocal(note.createdOn ? new Date(note.createdOn) : new Date()));
      this.setFieldValue('isAlert', !!note.isAlert);
      this.showEndDatetimeField = !!note.isAlert; // business rule if needed
      this.endDatetimeValue = ''; // optional end
      this.setFieldValue('title', note.title ?? '');
      this.setFieldValue('notes', note.notes ?? '');
    }
  }

  editNote(note: MemberNoteDto) {
    this.isFormVisible = true;
    this.editingId = note.memberNoteId ?? note.memberHealthNotesId ?? note.id ?? null;

    this.setFieldValue('noteTypeId', note.noteTypeId ?? null);
    const startIso = note.enteredTimestamp ?? note.createdOn ?? null;
    this.setFieldValue('createdOn', startIso ? this.formatDateTimeLocal(new Date(startIso)) : '');
    this.setFieldValue('title', note.title ?? '');
    this.setFieldValue('notes', note.notes ?? '');

    // toggle alert + end datetime
    this.showEndDatetimeField = !!note.isAlert || !!note.alertEndDateTime;
    this.endDatetimeValue = note.alertEndDateTime
      ? this.formatDateTimeLocal(new Date(note.alertEndDateTime))
      : '';
  }


  cancelForm() {
    this.isFormVisible = false;
    this.editingId = null;
  }

  deleteNote(note: any) {
    if (!note?.id) return;
    if (!confirm('Delete this note?')) return;
    this.svc.deleteNote(note.id).subscribe({
      next: () => this.reload(),
      error: () => alert('Failed to delete note.')
    });
  }

  // ------------ Save ------------

  saveNote() {
    this.showValidationErrors = true;

    // requireds from your form model
    const noteTypeId = this.notesFields.find(f => f.id === 'noteTypeId')?.value ?? null;
    const startText = this.notesFields.find(f => f.id === 'createdOn')?.value as string; // "Start Datetime" input
    const notesText = this.notesFields.find(f => f.id === 'notes')?.value as string ?? '';
    const titleText = this.notesFields.find(f => f.id === 'title')?.value as string ?? '';

    if (!noteTypeId || !notesText?.toString().trim()) return;

    // normalize "D / D+1 / D-1" forms already handled in your blur handlers
    const enteredTimestamp = startText ? new Date(startText).toISOString() : new Date().toISOString();
    const alertEndDateTime = (this.showEndDatetimeField && this.endDatetimeValue)
      ? new Date(this.endDatetimeValue).toISOString()
      : null;

    const payload: Partial<MemberNoteDto> = {
      memberDetailsId: this.memberPointer,
      noteTypeId: Number(noteTypeId),
      title: titleText,
      notes: String(notesText),
      isAlert: !!this.showEndDatetimeField,
      enteredTimestamp,
      alertEndDateTime,
      createdOn: enteredTimestamp
    };

    const obs = this.editingId
      ? this.svc.updateNote(this.editingId, { ...payload, updatedOn: new Date().toISOString() })
      : this.svc.addNote(payload);

    obs.pipe(finalize(() => { })).subscribe({
      next: _ => {
        this.isFormVisible = false;
        this.editingId = null;
        this.reload();
      },
      error: _ => { /* optionally toast */ }
    });
  }

  // ------------ Helpers for fields ------------

  private setFieldValue(id: string, value: any) {
    const f = this.notesFields.find(x => x.id === id);
    if (f) f.value = value;
  }
  private setFieldLabel(id: string, label: string) {
    const f = this.notesFields.find(x => x.id === id);
    if (f) f.displayLabel = label;
  }
  private getFieldValue(id: string) {
    return this.notesFields.find(x => x.id === id)?.value;
  }

  // ------------ Date UI (D, D+1, D-1, native pickers) ------------

  handleDateTimeBlur(field: NoteField) {
    const txt = (field.value ?? '').toString().trim();
    if (!txt) return;

    const now = new Date();
    if (/^D([+-]\d+)?$/i.test(txt)) {
      const m = /^D([+-]\d+)?$/i.exec(txt)!;
      const delta = m[1] ? parseInt(m[1], 10) : 0;
      const d = new Date(now);
      d.setDate(now.getDate() + delta);
      d.setHours(now.getHours(), now.getMinutes(), 0, 0);
      field.value = this.formatDateTimeLocal(d);
      return;
    }

    // otherwise, try to parse via Date()
    const d = new Date(txt);
    if (!isNaN(d.getTime())) {
      field.value = this.formatDateTimeLocal(d);
    }
  }

  triggerCalendar(idx: number) {
    const el = this.calendarPickers?.get(idx)?.nativeElement;
    el?.showPicker?.();
  }

  handleCalendarChange(ev: Event, field: NoteField) {
    const val = (ev.target as HTMLInputElement).value;
    if (val) field.value = val;
  }

  handleEndDatetimeBlur() {
    const txt = (this.endDatetimeValue ?? '').toString().trim();
    if (!txt) return;
    const now = new Date();
    if (/^D([+-]\d+)?$/i.test(txt)) {
      const m = /^D([+-]\d+)?$/i.exec(txt)!;
      const delta = m[1] ? parseInt(m[1], 10) : 0;
      const d = new Date(now);
      d.setDate(now.getDate() + delta);
      d.setHours(now.getHours(), now.getMinutes(), 0, 0);
      this.endDatetimeValue = this.formatDateTimeLocal(d);
      return;
    }
    const d = new Date(txt);
    if (!isNaN(d.getTime())) {
      this.endDatetimeValue = this.formatDateTimeLocal(d);
    }
  }

  triggerNativePicker() {
    const el = this.hiddenEndPicker?.first?.nativeElement;
    el?.showPicker?.();
  }

  handleNativePickerForEndDatetime(ev: Event) {
    const val = (ev.target as HTMLInputElement).value;
    if (val) this.endDatetimeValue = val;
  }

  private formatDateTimeLocal(d: Date) {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }

  // ------------ Select (Note Type) autocomplete ------------

  loadNoteTypes() {
    this.svc.getNoteTypes().subscribe(list => {
      this.noteTypes = list;
      const f = this.notesFields.find(x => x.id === 'noteTypeId')!;
      f.options = list.map((x: { id: number; label: string }) => ({ value: x.id, label: x.label }));
      f.filteredOptions = [...(f.options ?? [])];
    });
  }

  onFieldFocus(field: NoteField) {
    if (field.type !== 'select') return;
    field.showDropdown = true;
    field.filteredOptions = [...(field.options ?? [])];
    field.highlightedIndex = 0;
  }

  filterOptions(field: NoteField) {
    if (field.type !== 'select') return;
    const term = (field.displayLabel ?? '').toLowerCase();
    field.filteredOptions = (field.options ?? []).filter(o =>
      o.label.toLowerCase().includes(term)
    );
    field.highlightedIndex = 0;
  }

  handleDropdownKeydown(ev: KeyboardEvent, field: NoteField) {
    if (field.type !== 'select' || !field.showDropdown) return;
    const max = (field.filteredOptions ?? []).length - 1;
    switch (ev.key) {
      case 'ArrowDown':
        field.highlightedIndex = Math.min(max, (field.highlightedIndex ?? 0) + 1);
        ev.preventDefault();
        break;
      case 'ArrowUp':
        field.highlightedIndex = Math.max(0, (field.highlightedIndex ?? 0) - 1);
        ev.preventDefault();
        break;
      case 'Enter':
        const pick = field.filteredOptions?.[field.highlightedIndex ?? 0];
        if (pick) this.selectDropdownOption(field, pick);
        ev.preventDefault();
        break;
      case 'Escape':
        field.showDropdown = false;
        break;
    }
  }

  selectDropdownOption(field: NoteField, option: FieldOption) {
    field.value = option.value;
    field.displayLabel = option.label;
    field.showDropdown = false;
  }

  onSelectBlur(field: NoteField) {
    // If blur without picking and the label matches exactly, map it.
    const exact = (field.options ?? []).find(o => o.label === field.displayLabel);
    if (exact) {
      field.value = exact.value;
    } else if (!field.value) {
      field.displayLabel = '';
    }
    field.showDropdown = false;
  }
}
