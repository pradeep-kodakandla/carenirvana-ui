import { MembersummaryService, MemberHealthNote } from 'src/app/service/membersummary.service';
import { Component, Input, OnChanges, OnInit, SimpleChanges, ViewChildren, QueryList, ElementRef } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';
import { HttpErrorResponse } from '@angular/common/http';
import { CrudService } from 'src/app/service/crud.service';

// Minimal local type to match your service contract
interface HealthNote {
  memberHealthNotesId?: number;
  memberId: number;
  noteTypeId?: number | null;
  notes: string;
  isAlert: boolean;
  createdOn?: string;   // ISO
  createdBy?: number | null;
  updatedBy?: number | null;
  updatedOn?: string | null;
  deletedBy?: number | null;
  deletedOn?: string | null;

  // client-only helpers
  _noteTypeLabel?: string;
  _createdOnDisplay?: string;
}

type DropdownOption = { id: number | null; label: string };

interface NoteField {
  id: string;
  displayName: string;
  type: 'select' | 'datetime-local' | 'checkbox' | 'text' | 'textarea';
  required?: boolean;
  requiredMsg?: string;
  hidden?: boolean;

  // values
  value?: any;
  displayLabel?: string;

  // dropdown (for 'select')
  options?: DropdownOption[];
  filteredOptions?: DropdownOption[];
  showDropdown?: boolean;
  highlightedIndex?: number;
}

@Component({
  selector: 'app-member-notes',
  templateUrl: './member-notes.component.html',
  styleUrl: './member-notes.component.css',
})
export class MemberNotesComponent implements OnInit, OnChanges {
  @Input() memberId!: number;
  loggedInUserId?: number;
  // UI state
  searchTerm = '';
  showSort = false;
  isFormVisible = false;
  canAdd = true;
  canEdit = true;
  showValidationErrors = false;
  loading = false;

  // timeline + paging
  dataSource = new MatTableDataSource<HealthNote>([]);
  total = 0;
  page = 1;
  pageSize = 25;

  // selection
  selectedNoteId?: number;
  selected?: HealthNote;

  // alert & “end date” UX (UI-only)
  showEndDatetimeField = false;
  endDatetimeValue = '';
  noteTypeMap = new Map<string, string>();
  // dropdown for Note Type (replace with your real options if you have an API)
  noteTypeOptions: DropdownOption[] = [];

  // dynamic form fields backing your design
  notesFields: NoteField[] = [];

  @ViewChildren('calendarPickers') calendarPickers!: QueryList<ElementRef<HTMLInputElement>>;
  @ViewChildren('hiddenEndDatetimePicker') hiddenEndDatetimePicker!: QueryList<ElementRef<HTMLInputElement>>;

  constructor(private api: MembersummaryService, private crudService: CrudService) { }

  ngOnInit(): void {

    this.loggedInUserId = Number(sessionStorage.getItem('loggedInUserid') ?? 0);
    this.configureFormFields();
    this.configureSearch();
    if (this.memberId) this.reload();

    this.crudService.getData('um', 'notetype').subscribe({
      next: (response: any[]) => {
        // normalize into DropdownOption[]
        this.noteTypeOptions = (response ?? []).map(opt => {
          const idNum = Number(opt?.id);
          return {
            id: Number.isFinite(idNum) ? idNum : null,
            // adjust the label fallback chain if your API uses a different prop
            label: opt?.noteType ?? opt?.name ?? opt?.text ?? opt?.label ?? 'Unknown'
          };
        });

        // push options into the Note Type field + refresh its filtered list
        const f = this.getField('noteTypeId');
        if (f) {
          f.options = this.noteTypeOptions;
          f.filteredOptions = [...this.noteTypeOptions]; // or: this.filterOptions(f);
          // refresh display label if there was a preselected value
          const sel = this.noteTypeOptions.find(o => o.id === f.value);
          if (sel) f.displayLabel = sel.label;
        }

        // if notes are already loaded, refresh their computed labels
        this.dataSource.data.forEach(n => {
          n._noteTypeLabel =
            this.noteTypeOptions.find(o => o.id === (n.noteTypeId ?? null))?.label ?? '—';
        });
      },
      error: _ => { this.noteTypeOptions = []; }
    });

  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['memberId'] && !changes['memberId'].firstChange) {
      this.page = 1;
      this.reload();
    }
  }

  // -------------------------------
  // Form model (matches your HTML)
  // -------------------------------
  private configureFormFields(): void {
    this.notesFields = [
      {
        id: 'noteTypeId',
        displayName: 'Note Type',
        type: 'select',
        required: true,
        options: this.noteTypeOptions,
        filteredOptions: [...this.noteTypeOptions],
        showDropdown: false,
        highlightedIndex: 0,
        displayLabel: ''
      },
      // If you later add datetime, keep these. For now we’ll hide them to match backend schema.
      { id: 'startDatetime', displayName: 'Start Datetime', type: 'datetime-local', hidden: true },
      // Checkbox row in your HTML toggles Alert. We keep that behavior and map it to isAlert on save.
      // Textarea for notes
      { id: 'notes', displayName: 'Notes', type: 'textarea', required: true, value: '' }
    ];
  }

  // -------------------------------
  // Load + mapping
  // -------------------------------
  reload(): void {
    this.loading = true;
    this.api
      .listHealthNotes(this.memberId, this.page, this.pageSize, false)
      .subscribe({
        next: (res: any) => {
          console.log('Raw response', res);

          // 1) read Items/items safely
          const rawItems: any[] = (res.items ?? res.Items ?? []) as any[];

          // 2) normalize each item to camelCase keys the UI expects
          const items: HealthNote[] = rawItems.map(it => ({
            memberHealthNotesId: it.memberHealthNotesId ?? it.MemberHealthNotesId ?? it.memberhealthnotesid,
            memberId: it.memberId ?? it.MemberId ?? it.memberid,
            noteTypeId: it.noteTypeId ?? it.NoteTypeId ?? it.notetypeid ?? null,
            notes: it.notes ?? it.Notes ?? '',
            isAlert: it.isAlert ?? it.IsAlert ?? false,

            createdOn: it.createdOn ?? it.CreatedOn ?? it.createdon ?? null,
            createdBy: it.createdBy ?? it.CreatedBy ?? it.createdby ?? null,
            updatedBy: it.updatedBy ?? it.UpdatedBy ?? it.updatedby ?? null,
            updatedOn: it.updatedOn ?? it.UpdatedOn ?? it.updatedon ?? null,
            deletedBy: it.deletedBy ?? it.DeletedBy ?? it.deletedby ?? null,
            deletedOn: it.deletedOn ?? it.DeletedOn ?? it.deletedon ?? null,
          }));

          // decorate for UI
          items.forEach(n => {
            n._noteTypeLabel = this.noteTypeOptions.find(o => o.id === (n.noteTypeId ?? null))?.label ?? '—';
            n._createdOnDisplay = n.createdOn ? new Date(n.createdOn).toLocaleString() : '';
          });

          console.log('Loaded notes', items);
          this.dataSource.data = items;

          // 3) total also needs coalescing
          this.total = res.total ?? res.Total ?? items.length;

          this.applyFilter();
          this.computeSummary(this.dataSource.filteredData);
          this.loading = false;
        },
        error: _ => {
          this.dataSource.data = [];
          this.total = 0;
          this.loading = false;
        }
      });
  }


  // --------------------------------
  // Search + Sort
  // --------------------------------
  private configureSearch(): void {
    this.dataSource.filterPredicate = (n: HealthNote, filter: string) => {
      const hay = `${n._noteTypeLabel ?? ''} ${n.notes ?? ''} ${n._createdOnDisplay ?? ''}`.toLowerCase();
      return hay.includes(filter);
    };
  }

  applyFilter(_: any = null): void {
    this.dataSource.filter = (this.searchTerm || '').trim().toLowerCase();
    this.computeSummary(this.dataSource.filteredData);
  }

  applySort(key: 'authorizationNoteTypeLabel_asc' | 'authorizationNoteTypeLabel_desc' | 'createdOn_desc' | 'createdOn_asc'): void {
    const data = [...this.dataSource.filteredData];
    switch (key) {
      case 'authorizationNoteTypeLabel_asc':
        data.sort((a, b) => (a._noteTypeLabel ?? '').localeCompare(b._noteTypeLabel ?? ''));
        break;
      case 'authorizationNoteTypeLabel_desc':
        data.sort((a, b) => (b._noteTypeLabel ?? '').localeCompare(a._noteTypeLabel ?? ''));
        break;
      case 'createdOn_desc':
        data.sort((a, b) => new Date(b.createdOn ?? 0).getTime() - new Date(a.createdOn ?? 0).getTime());
        break;
      case 'createdOn_asc':
        data.sort((a, b) => new Date(a.createdOn ?? 0).getTime() - new Date(b.createdOn ?? 0).getTime());
        break;
    }
    this.dataSource.data = data;
    this.applyFilter();
  }

  // --------------------------------
  // Open/Close/Edit
  // --------------------------------
  openForm(mode: 'add' | 'edit', note?: HealthNote): void {
    this.isFormVisible = true;
    this.showValidationErrors = false;

    if (mode === 'add') {
      this.selected = undefined;
      this.selectedNoteId = undefined;
      this.showEndDatetimeField = false;
      this.endDatetimeValue = '';
      this.setFieldValue('noteTypeId', null, '');
      this.setFieldValue('notes', '');
    } else if (mode === 'edit' && note) {
      this.selected = note;
      this.selectedNoteId = note.memberHealthNotesId;
      this.showEndDatetimeField = !!note.isAlert;
      this.endDatetimeValue = '';
      const label = this.noteTypeOptions.find(o => o.id === (note.noteTypeId ?? null))?.label ?? '';
      this.setFieldValue('noteTypeId', note.noteTypeId ?? null, label);
      this.setFieldValue('notes', note.notes ?? '');
    }
  }

  cancelForm(): void {
    this.isFormVisible = false;
    this.selected = undefined;
    this.selectedNoteId = undefined;
  }

  editNote(n: HealthNote): void {
    if (!this.canEdit) return;
    this.openForm('edit', n);
  }

  deleteNote(n: HealthNote): void {
    if (!this.canEdit || !n.memberHealthNotesId) return;
    const deletedBy = this.getUserIdOrNull();
    if (!confirm('Delete this note?')) return;
    this.api.deleteHealthNote(n.memberHealthNotesId, deletedBy ?? 0).subscribe({
      next: () => this.reload(),
      error: (err: HttpErrorResponse) => console.error('Delete failed', err)
    });
  }

  // --------------------------------
  // Save (Create/Update)
  // --------------------------------
  saveNote(): void {
    const noteType = this.getField('noteTypeId');
    const notes = this.getField('notes');

    // validation
    this.showValidationErrors = true;
    const typeOk = !!noteType && (noteType.value !== undefined);
    const notesOk = !!notes && !!(notes.value && String(notes.value).trim().length > 0);
    if (!typeOk || !notesOk) return;

    const payload: HealthNote = {
      memberId: this.memberId,
      noteTypeId: noteType.value ?? null,
      notes: String(notes.value ?? '').trim(),
      isAlert: !!this.showEndDatetimeField,
      createdBy: this.getUserIdOrNull()
    };

    if (this.selected && this.selected.memberHealthNotesId) {
      payload.memberHealthNotesId = this.selected.memberHealthNotesId;
      payload.updatedBy = this.getUserIdOrNull();
      this.api.updateHealthNote(this.selected.memberHealthNotesId, payload as any).subscribe({
        next: () => {
          this.isFormVisible = false;
          this.reload();
        },
        error: (err: HttpErrorResponse) => console.error('Update failed', err)
      });
    } else {
      this.api.createHealthNote(payload as any).subscribe({
        next: () => {
          this.isFormVisible = false;
          this.reload();
        },
        error: (err: HttpErrorResponse) => console.error('Create failed', err)
      });
    }
  }

  // --------------------------------
  // Dropdown (Note Type) helpers
  // --------------------------------
  filterOptions(field: NoteField): void {
    const q = (field.displayLabel ?? '').toLowerCase();
    const base = field.options ?? [];
    field.filteredOptions = q ? base.filter(o => o.label.toLowerCase().includes(q)) : [...base];
    field.highlightedIndex = 0;
    field.showDropdown = (field.filteredOptions?.length ?? 0) > 0;
  }

  onFieldFocus(field: NoteField): void {
    field.showDropdown = (field.filteredOptions?.length ?? 0) > 0;
  }

  onSelectBlur(field: NoteField): void {
    // close after small delay to allow click
    setTimeout(() => (field.showDropdown = false), 150);
  }

  handleDropdownKeydown(evt: KeyboardEvent, field: NoteField): void {
    const len = field.filteredOptions?.length ?? 0;
    if (!len) return;
    if (evt.key === 'ArrowDown') {
      evt.preventDefault();
      field.highlightedIndex = Math.min((field.highlightedIndex ?? 0) + 1, len - 1);
    } else if (evt.key === 'ArrowUp') {
      evt.preventDefault();
      field.highlightedIndex = Math.max((field.highlightedIndex ?? 0) - 1, 0);
    } else if (evt.key === 'Enter') {
      evt.preventDefault();
      const opt = field.filteredOptions![field.highlightedIndex ?? 0];
      this.selectDropdownOption(field, opt);
    }
  }

  selectDropdownOption(field: NoteField, option: DropdownOption): void {
    field.value = option.id;
    field.displayLabel = option.label;
    field.showDropdown = false;
  }

  // --------------------------------
  // Datetime helpers (UI-only)
  // --------------------------------
  triggerCalendar(index: number) {
    const input = this.calendarPickers?.get(index)?.nativeElement;
    input?.showPicker?.();
  }

  handleCalendarChange(evt: Event, field: NoteField) {
    const val = (evt.target as HTMLInputElement).value;
    field.value = val;
  }

  handleDateTimeBlur(field: NoteField) {
    if (!field) return;
    field.value = this.parseShorthandDate((field.value ?? '').toString());
  }

  triggerNativePicker() {
    const el = this.hiddenEndDatetimePicker?.first?.nativeElement;
    el?.showPicker?.();
  }

  handleNativePickerForEndDatetime(evt: Event) {
    const val = (evt.target as HTMLInputElement).value;
    this.endDatetimeValue = val;
  }

  handleEndDatetimeBlur() {
    this.endDatetimeValue = this.parseShorthandDate(this.endDatetimeValue || '');
  }

  private parseShorthandDate(input: string): string {
    const s = (input || '').trim().toUpperCase();
    if (!s) return '';
    const now = new Date();
    const base = new Date(now);
    if (s === 'D') return now.toISOString().slice(0, 16);
    const m = /^D([+-]\d+)$/.exec(s);
    if (m) {
      const delta = parseInt(m[1], 10);
      base.setDate(base.getDate() + delta);
      return base.toISOString().slice(0, 16);
    }
    // assume browser-accepted string
    const d = new Date(input);
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 16);
  }

  // --------------------------------
  // Utils
  // --------------------------------
  applyFilterTyping(evt: Event) {
    this.applyFilter();
  }

  private getUserIdOrNull(): number | null {
    const val = sessionStorage.getItem('loggedInUserid');
    const n = val != null ? Number(val) : NaN;
    return isNaN(n) ? null : n;
  }

  private getField(id: string): NoteField | undefined {
    return this.notesFields.find(f => f.id === id);
  }

  private setFieldValue(id: string, value?: any, displayLabel?: string) {
    const f = this.getField(id);
    if (!f) return;
    f.value = value;
    if (displayLabel !== undefined) f.displayLabel = displayLabel;
    if (f.type === 'select') this.filterOptions(f);
  }

  // Add to class
  summary = { total: 0, alert: 0, lastCreated: '—' };

  private computeSummary(list: HealthNote[]): void {
    const total = list.length;
    const alert = list.filter(n => n.isAlert && !n.deletedOn).length;

    // max createdOn across the list
    let lastTs = -Infinity;
    for (const n of list) {
      if (n.createdOn) {
        const t = new Date(n.createdOn).getTime();
        if (!Number.isNaN(t) && t > lastTs) lastTs = t;
      }
    }

    this.summary = {
      total,
      alert,
      lastCreated: lastTs > 0 ? new Date(lastTs).toLocaleString() : '—'
    };
  }

}


