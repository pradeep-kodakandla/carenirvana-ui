import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { forkJoin, Observable, of, throwError } from 'rxjs';
import { catchError, finalize, map, switchMap, tap } from 'rxjs/operators';

import { CaseUnsavedChangesAwareService } from 'src/app/member/AG/guards/services/caseunsavedchangesaware.service';
import {
  CasedetailService,
  CaseNoteDto,
  CaseNotesTemplateResponse
} from 'src/app/service/casedetail.service';

type NotesContext = { caseHeaderId: number; caseTemplateId: number; levelId: number };

type AnyField = {
  id: string;
  controlName: string;        // ✅ required
  displayName: string;
  type: string;

  required?: boolean;
  isRequired?: boolean;
  requiredMsg?: string;

  options?: any[];
  level?: any[];
  datasource?: string;
  lookup?: any;
};

@Component({
  selector: 'app-casenotes',
  templateUrl: './casenotes.component.html',
  styleUrls: ['./casenotes.component.css']
})
export class CasenotesComponent implements OnInit, OnChanges, CaseUnsavedChangesAwareService {
  @Input() caseHeaderId?: number = 27;
  @Input() caseTemplateId?: number = 2;
  @Input() levelId: number = 1;

  // optional: if caller only has caseNumber
  @Input() caseNumber?: string;

  notes: CaseNoteDto[] = [];
  template?: CaseNotesTemplateResponse;

  loading = false;
  saving = false;
  errorMsg = '';

  showEditor = false;
  editing?: CaseNoteDto;

  resolved?: NotesContext;

  // ✅ now dynamic
  form: FormGroup = this.fb.group({});

  // template-driven editor fields
  noteEditorFields: AnyField[] = [];


  // dropdown options cache by controlName for ui-smart-dropdown
  private selectOptions: Record<string, Array<{ label: string; value: any }>> = {};

  constructor(private fb: FormBuilder, private api: CasedetailService) { }

  ngOnInit(): void {
    console.log('CasenotesComponent initialized with');
    this.reload();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['caseHeaderId'] || changes['caseTemplateId'] || changes['levelId'] || changes['caseNumber']) {
      this.reload();
    }
  }

  // --- Unsaved changes guard ---
  caseHasUnsavedChanges(): boolean {
    return this.showEditor && this.form.dirty;
  }
  hasUnsavedChanges(): boolean {
    return this.caseHasUnsavedChanges();
  }
  save(): void {
    if (this.showEditor) this.onSave();
  }

  // --------------------------
  // UI actions
  // --------------------------
  onAddClick(): void {
    this.editing = undefined;
    this.showEditor = true;
    this.errorMsg = '';

    this.form.reset();
    this.patchDefaultsForAdd();
    this.form.markAsPristine();
  }

  onEdit(n: CaseNoteDto): void {
    this.editing = n;
    this.showEditor = true;
    this.errorMsg = '';

    this.form.reset();
    this.patchFormFromNote(n);
    this.form.markAsPristine();
  }

  closeEditor(): void {
    this.showEditor = false;
    this.editing = undefined;
    this.form.markAsPristine();
  }

  onSave(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (!this.resolved) {
      this.errorMsg = 'Missing case context (caseHeaderId/caseTemplateId).';
      return;
    }

    const ctx = this.resolved;

    // ✅ map template-driven controls -> API payload (keep API stable)
    const payload = {
      noteText: String(this.readValueByCandidates(['caseNotes', 'noteText']) ?? ''),
      noteLevel: 1,//Number(this.readValueByCandidates(['noteLevel']) ?? 1),
      noteType: Number(this.readValueByCandidates(['caseNoteType', 'noteType']) ?? 1),
      caseAlertNote: !!this.readValueByCandidates(['caseAlertNote', 'isAlertNote'])
    };

    this.saving = true;
    this.errorMsg = '';

    let req$: Observable<void>;

    if (this.getNoteId(this.editing)) {
      req$ = this.api.updateNote(ctx.caseHeaderId, ctx.levelId, this.getNoteId(this.editing)!, payload);
    } else {
      // create returns {noteId} -> convert to void
      req$ = this.api.createNote(ctx.caseHeaderId, ctx.levelId, payload).pipe(
        switchMap(() => of(void 0))
      );
    }

    req$
      .pipe(
        finalize(() => (this.saving = false)),
        catchError((err) => {
          this.errorMsg = err?.error?.message ?? 'Unable to save note.';
          return of(void 0);
        })
      )
      .subscribe({
        next: () => {
          this.closeEditor();
          this.reloadNotesOnly();
        }
      });
  }

  onDelete(n: CaseNoteDto): void {
    if (!this.resolved) return;

    const noteId = this.getNoteId(n);
    if (!noteId) return;

    if (!confirm('Delete this note?')) return;

    this.saving = true;
    this.errorMsg = '';

    this.api
      .deleteNote(this.resolved.caseHeaderId, this.resolved.levelId, noteId)
      .pipe(
        map(() => void 0),
        finalize(() => (this.saving = false)),
        catchError((err) => {
          this.errorMsg = err?.error?.message ?? 'Unable to delete note.';
          return of(void 0);
        })
      )
      .subscribe({
        next: () => this.reloadNotesOnly()
      });
  }

  // --------------------------
  // Notes cards helpers (no "as any" in HTML)
  // --------------------------
  getNoteId(n?: CaseNoteDto): string | null {
    if (!n) return null;
    return (n as any)?.noteId ?? null;
  }

  getNoteText(n: CaseNoteDto): string {
    return String((n as any)?.noteText ?? '');
  }

  getNoteType(n: CaseNoteDto): any {
    return (n as any)?.noteType ?? (n as any)?.caseNoteType ?? '';
  }

  getNoteLevel(n: CaseNoteDto): any {
    return (n as any)?.noteLevel ?? '';
  }

  isAlert(n: CaseNoteDto): boolean {
    return !!((n as any)?.caseAlertNote ?? (n as any)?.isAlertNote ?? false);
  }

  getCreatedOn(n: CaseNoteDto): string | undefined {
    return (n as any)?.createdOn;
  }

  trackByNoteId = (_: number, n: CaseNoteDto) => String(this.getNoteId(n) ?? _);
  trackByField = (_: number, f: AnyField) => String(f.controlName || f.id || _);

  formatDt(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  }

  // --------------------------
  // Template-driven rendering (same control types as CaseDetails)
  // --------------------------
  isRequired(ctrl: AbstractControl, f: AnyField): boolean {
    // match multiple template conventions
    const req = !!(f.required ?? f.isRequired);
    // if validators already applied, this still works
    return req || (ctrl.validator ? !!ctrl.errors?.['required'] : false);
  }

  getDropdownOptions(controlName: string): Array<{ label: string; value: any }> {
    return this.selectOptions[controlName] ?? [];
  }

  // search helpers (keep safe defaults unless your notes template actually uses "search")
  getLookupPlaceholder(_f: AnyField): string { return 'Search...'; }
  getLookupMinChars(f: AnyField): number { return Number(f.lookup?.minChars ?? 2); }
  getLookupDebounceMs(f: AnyField): number { return Number(f.lookup?.debounceMs ?? 250); }
  getLookupLimit(f: AnyField): number { return Number(f.lookup?.limit ?? 25); }

  // NOTE: wire this if/when notes template uses lookup
  getLookupSearchFn(_f: AnyField): ((term: string) => Observable<any[]>) {
    return (_term: string) => of([]);
  }
  getLookupDisplayWith(_f: AnyField): ((x: any) => string) {
    return (x: any) => (x == null ? '' : String(x?.label ?? x?.name ?? x));
  }
  getLookupTrackBy(_f: AnyField): ((x: any) => any) {
    return (x: any) => x?.id ?? x?.code ?? x;
  }

  onLookupSelected(_f: AnyField, _ev: any): void { }
  onLookupTextChange(_f: AnyField, _ev: any): void { }
  onLookupCleared(_f: AnyField): void { }

  // --------------------------
  // Loading notes: this.api.getNotes(ctx.caseHeaderId, ctx.levelId).pipe(
  // --------------------------
  reload(): void {
    this.loading = true;
    this.errorMsg = '';
    this.resolved = undefined;
    this.notes = [];
    this.template = undefined;
    this.showEditor = false;
    this.editing = undefined;
    console.log('Loaded notes ');
    this.resolveContext$()
      .pipe(
        switchMap((ctx) => {
          this.resolved = ctx;
          return forkJoin({
            notes: this.api.getNotes(ctx.caseHeaderId, ctx.levelId).pipe(
              catchError(err => {
                console.error('getNotes failed', err);
                return of({ notes: [] } as any); // keep shape: {notes: CaseNoteDto[]}
              })
            ),
            template: this.api.getNotesTemplate(2).pipe(
              catchError(err => {
                console.error('getNotesTemplate failed', err);
                return of(undefined);
              })
            )
          });
        }),
        tap((res) => {
          this.notes = res.notes?.notes ?? [];
          this.template = res.template;
          console.log('Loaded notes template:', this.template);
          // ✅ build dynamic fields + form from template
          this.applyNotesTemplate(this.template?.section ?? (this.template as any)?.Section);
        }),
        finalize(() => (this.loading = false)),
        catchError((err) => {
          console.error('Error loading notes or template', err);
          this.errorMsg = err?.error?.message ?? 'Unable to load notes.';
          return of(null);
        })
      )
      .subscribe();
  }

  private reloadNotesOnly(): void {
    if (!this.resolved) return;

    this.loading = true;
    this.api
      .getNotes(this.resolved.caseHeaderId, this.resolved.levelId)
      .pipe(
        finalize(() => (this.loading = false)),
        catchError((err) => {
          this.errorMsg = err?.error?.message ?? 'Unable to reload notes.';
          return of({ notes: [] } as any);
        })
      )
      .subscribe({
        next: (res: any) => (this.notes = res?.notes ?? [])
      });
  }

  private applyNotesTemplate(section: any): void {
    // If template isn't available, fallback to minimum shape so UI still works
    const fields = this.extractFieldsDeep(section);

    // don’t render the grid itself inside editor (we show cards separately)
    const editorFields = fields.filter((f) => !this.isGridField(f));

    this.noteEditorFields = editorFields.map((x) => this.enrichField(section, x));

    // build dropdown options cache
    this.selectOptions = {};
    for (const f of this.noteEditorFields) {
      if ((f.type ?? '').toLowerCase() === 'select') {
        const raw = (f.options ?? f.level ?? []) as any[];
        this.selectOptions[f.controlName!] = raw.map((x) => {
          // support ["Yes","No"] or [{id,name}] etc.
          if (x && typeof x === 'object') {
            const value = (x.id ?? x.value ?? x.code ?? x);
            const label = String(x.name ?? x.label ?? x.codeDesc ?? x.code ?? value);
            return { label, value };
          }
          return { label: String(x), value: x };
        });
      }
    }

    // rebuild form group
    const group: Record<string, FormControl> = {};
    for (const f of this.noteEditorFields) {
      const v = this.defaultValueForType(f.type);
      const validators = this.fieldIsRequired(f) ? [Validators.required] : [];
      group[f.controlName!] = new FormControl(v, validators);
    }
    this.form = this.fb.group(group);

    // if editor is open, keep values consistent
    if (this.showEditor) {
      if (this.editing) this.patchFormFromNote(this.editing);
      else this.patchDefaultsForAdd();
    }
  }

  private extractFieldsDeep(node: any): AnyField[] {
    if (!node) return [];

    const out: AnyField[] = [];

    if (Array.isArray(node.fields)) out.push(...node.fields);
    if (Array.isArray(node.subsections)) {
      for (const s of node.subsections) out.push(...this.extractFieldsDeep(s));
    }
    if (Array.isArray(node.sections)) {
      for (const s of node.sections) out.push(...this.extractFieldsDeep(s));
    }

    return out;
  }

  private enrichField(section: any, f: any): AnyField {
    const id = String(f?.id ?? f?.fieldId ?? '').trim() || this.safeKey(String(f?.displayName ?? f?.label ?? 'field'));
    const displayName = String(f?.displayName ?? f?.label ?? id);
    const type = String(f?.type ?? 'text');

    const secKey = this.toSectionKey(String(section?.sectionName ?? 'Case Notes'));

    const controlName = `${secKey}_${id}`; // ✅ always defined

    return {
      ...f,
      id,
      displayName,
      type,
      controlName
    };
  }


  private isGridField(f: any): boolean {
    const id = String(f?.id ?? f?.fieldId ?? '').toLowerCase();
    const t = String(f?.type ?? '').toLowerCase();
    return t === 'grid' || t === 'table' || id.endsWith('grid') || id.includes('grid');
  }


  private fieldIsRequired(f: AnyField): boolean {
    return !!(f.required ?? f.isRequired);
  }

  private defaultValueForType(type?: string): any {
    const t = String(type ?? '').toLowerCase();
    if (t === 'checkbox') return false;
    if (t === 'select') return null;
    if (t === 'datetime-local' || t === 'datatime-local') return null;
    if (t === 'textarea') return '';
    if (t === 'search') return null;
    return '';
  }

  private toSectionKey(name: string): string {
    const cleaned = name.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
    if (!cleaned) return 'Section';
    return cleaned
      .split(' ')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('_');
  }

  private safeKey(label: string): string {
    const cleaned = label.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
    if (!cleaned) return 'field';
    const [first, ...rest] = cleaned.split(' ');
    return first.toLowerCase() + rest.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  }

  private readValueByCandidates(ids: string[]): any {
    // find a control matching any candidate field id
    const byId = (cand: string) =>
      this.noteEditorFields.find((f) => String(f.id ?? '').toLowerCase() === cand.toLowerCase())?.controlName;

    for (const cand of ids) {
      const cn = byId(cand);
      if (cn && this.form.get(cn)) return this.form.get(cn)!.value;
    }

    // fallback: if asking for note text and there is a textarea field, use it
    if (ids.some((x) => x.toLowerCase().includes('note'))) {
      const textarea = this.noteEditorFields.find((f) => String(f.type ?? '').toLowerCase() === 'textarea');
      if (textarea?.controlName && this.form.get(textarea.controlName)) return this.form.get(textarea.controlName)!.value;
    }

    return null;
  }

  private patchDefaultsForAdd(): void {
    // set common defaults if these fields exist in template
    this.setValueById('noteLevel', this.levelId ?? 1);
    this.setValueById('noteType', 1);
    this.setValueById('caseNoteType', 1);
    this.setValueById('caseAlertNote', false);
    this.setValueById('isAlertNote', false);
    this.setValueById('caseNotes', '');
    this.setValueById('noteText', '');
  }

  private patchFormFromNote(n: CaseNoteDto): void {
    const noteText = (n as any)?.noteText ?? '';
    const noteLevel = Number((n as any)?.noteLevel ?? (this.levelId ?? 1));
    const noteType = Number((n as any)?.noteType ?? (n as any)?.caseNoteType ?? 1);
    const alertFlag = !!((n as any)?.caseAlertNote ?? (n as any)?.isAlertNote ?? false);

    this.setValueById('caseNotes', noteText);
    this.setValueById('noteText', noteText);
    this.setValueById('noteLevel', noteLevel);
    this.setValueById('noteType', noteType);
    this.setValueById('caseNoteType', noteType);
    this.setValueById('caseAlertNote', alertFlag);
    this.setValueById('isAlertNote', alertFlag);
  }

  private setValueById(fieldId: string, value: any): void {
    const f = this.noteEditorFields.find((x) => String(x.id ?? '').toLowerCase() === fieldId.toLowerCase());
    if (!f?.controlName) return;
    const ctrl = this.form.get(f.controlName);
    if (!ctrl) return;
    ctrl.setValue(value);
  }

  private resolveContext$(): Observable<NotesContext> {
    // ✅ best: pass IDs
    if (this.caseHeaderId && this.caseTemplateId) {
      return of({
        caseHeaderId: this.caseHeaderId,
        caseTemplateId: this.caseTemplateId,
        levelId: this.levelId ?? 1
      });
    }

    // optional: resolve via caseNumber
    if (this.caseNumber?.trim()) {
      return this.api.getCaseByNumber(this.caseNumber.trim()).pipe(
        map((agg: any) => {
          const headerId = Number(agg?.header?.caseHeaderId ?? 0);
          const templateId = Number(agg?.header?.caseType ?? 0); // adjust if your mapping differs
          if (!headerId || !templateId) throw new Error('Unable to resolve caseHeaderId/caseTemplateId from caseNumber.');
          return { caseHeaderId: headerId, caseTemplateId: templateId, levelId: this.levelId ?? 1 };
        })
      );
    }

    return throwError(() => new Error('Pass caseHeaderId + caseTemplateId (recommended) OR caseNumber.'));
  }
}
