import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { forkJoin, Observable, of, Subject, throwError } from 'rxjs';
import { catchError, finalize, map, switchMap, takeUntil, tap } from 'rxjs/operators';

import { CaseUnsavedChangesAwareService } from 'src/app/member/AG/guards/services/caseunsavedchangesaware.service';
import {
  CasedetailService,
  CaseNoteDto,
  CaseNotesTemplateResponse
} from 'src/app/service/casedetail.service';
import { DatasourceLookupService } from 'src/app/service/crud.service';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';

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
export class CasenotesComponent implements OnInit, OnChanges, OnDestroy, CaseUnsavedChangesAwareService {
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

  // ✅ template-driven
  form: FormGroup = this.fb.group({});

  // template-driven editor fields
  noteEditorFields: AnyField[] = [];

  // dropdown options cache by controlName for ui-smart-dropdown
  dropdownOptions: Record<string, UiSmartOption[]> = {};

  // cached controlNames for card label resolution
  private noteTypeControlName: string | null = null;
  private noteLevelControlName: string | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private api: CasedetailService,
    private dsLookup: DatasourceLookupService
  ) { }

  ngOnInit(): void {
    this.reload();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['caseHeaderId'] || changes['caseTemplateId'] || changes['levelId'] || changes['caseNumber']) {
      this.reload();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
    this.reconcileAllSelectControls();
    this.form.markAsPristine();
  }

  onEdit(n: CaseNoteDto): void {
    this.editing = n;
    this.showEditor = true;
    this.errorMsg = '';

    this.form.reset();
    this.patchFormFromNote(n);
    this.reconcileAllSelectControls();
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
      noteLevel: Number(this.readValueByCandidates(['noteLevel']) ?? (this.levelId ?? 1)),
      noteType: Number(this.readValueByCandidates(['caseNoteType', 'noteType']) ?? 1),
      caseAlertNote: !!this.readValueByCandidates(['caseAlertNote', 'isAlertNote'])
    };

    this.saving = true;
    this.errorMsg = '';

    let req$: Observable<void>;

    if (this.getNoteId(this.editing)) {
      req$ = this.api.updateNote(ctx.caseHeaderId, ctx.levelId, this.getNoteId(this.editing)!, payload);
      (this as any).showSavedMessage?.('Notes updated successfully');
    } else {
      req$ = this.api.createNote(ctx.caseHeaderId, ctx.levelId, payload).pipe(
        switchMap(() => of(void 0))
      );
      (this as any).showSavedMessage?.('Notes saved successfully');
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
  // Notes cards helpers
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

  getNoteTypeLabel(n: CaseNoteDto): string {
    const v = this.getNoteType(n);
    return this.getLabelFromControlOptions(this.noteTypeControlName, v);
  }

  getNoteLevelLabel(n: CaseNoteDto): string {
    const v = this.getNoteLevel(n);
    return this.getLabelFromControlOptions(this.noteLevelControlName, v);
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
  // Template-driven rendering
  // --------------------------
  isRequired(ctrl: AbstractControl, f: AnyField): boolean {
    const req = !!(f.required ?? f.isRequired);
    return req || (ctrl.validator ? !!ctrl.errors?.['required'] : false);
  }

  getDropdownOptions(controlName: string): UiSmartOption[] {
    return this.dropdownOptions?.[controlName] ?? [];
  }

  // --------------------------
  // Loading
  // --------------------------
  reload(): void {
    this.loading = true;
    this.errorMsg = '';
    this.resolved = undefined;
    this.notes = [];
    this.template = undefined;
    this.dropdownOptions = {};
    this.noteEditorFields = [];
    this.noteTypeControlName = null;
    this.noteLevelControlName = null;
    this.showEditor = false;
    this.editing = undefined;

    this.resolveContext$()
      .pipe(
        switchMap((ctx) => {
          this.resolved = ctx;
          return forkJoin({
            notes: this.api.getNotes(ctx.caseHeaderId, ctx.levelId).pipe(
              catchError((err) => {
                console.error('getNotes failed', err);
                return of({ notes: [] } as any);
              })
            ),
            template: this.api.getNotesTemplate(ctx.caseTemplateId).pipe(
              catchError((err) => {
                console.error('getNotesTemplate failed', err);
                return of(undefined);
              })
            )
          });
        }),
        tap((res) => {
          this.notes = res.notes?.notes ?? [];
          this.template = res.template;
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
    // If template isn't available, fallback so UI still works
    const fields = this.extractFieldsDeep(section);

    // don't render grid fields in the editor
    const editorFields = fields.filter((f) => !this.isGridField(f));

    this.noteEditorFields = editorFields.map((x) => this.enrichField(section, x));

    // capture controlName for Type/Level for card mapping
    this.noteTypeControlName = this.findControlNameByFieldIds(['caseNoteType', 'noteType']);
    this.noteLevelControlName = this.findControlNameByFieldIds(['noteLevel']);

    // build form group
    const group: Record<string, FormControl> = {};
    for (const f of this.noteEditorFields) {
      const v = this.defaultValueForType(f.type);
      const validators = this.fieldIsRequired(f) ? [Validators.required] : [];
      group[f.controlName] = new FormControl(v, validators);
    }
    this.form = this.fb.group(group);

    // dropdowns (static + datasource)
    this.prefetchDropdownOptions(this.noteEditorFields);

    // keep editor values consistent if open
    if (this.showEditor) {
      if (this.editing) this.patchFormFromNote(this.editing);
      else this.patchDefaultsForAdd();
      this.reconcileAllSelectControls();
    }
  }

  private extractFieldsDeep(node: any): AnyField[] {
    if (!node) return [];
    const out: AnyField[] = [];
    if (Array.isArray(node.fields)) out.push(...node.fields);
    if (Array.isArray(node.subsections)) for (const s of node.subsections) out.push(...this.extractFieldsDeep(s));
    if (Array.isArray(node.sections)) for (const s of node.sections) out.push(...this.extractFieldsDeep(s));
    return out;
  }

  private enrichField(section: any, f: any): AnyField {
    const id = String(f?.id ?? f?.fieldId ?? '').trim() || this.safeKey(String(f?.displayName ?? f?.label ?? 'field'));
    const displayName = String(f?.displayName ?? f?.label ?? id);
    const type = String(f?.type ?? 'text');

    const secKey = this.toSectionKey(String(section?.sectionName ?? 'Case Notes'));
    const controlName = `${secKey}_${id}`; // ✅ always defined

    return { ...f, id, displayName, type, controlName };
  }

  private findControlNameByFieldIds(fieldIds: string[]): string | null {
    const set = new Set(fieldIds.map((x) => x.toLowerCase()));
    const f = this.noteEditorFields.find((x) => set.has(String(x.id ?? '').toLowerCase()));
    return f?.controlName ?? null;
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
    const byId = (cand: string) =>
      this.noteEditorFields.find((f) => String(f.id ?? '').toLowerCase() === cand.toLowerCase())?.controlName;

    for (const cand of ids) {
      const cn = byId(cand);
      if (cn && this.form.get(cn)) return this.form.get(cn)!.value;
    }

    // fallback: if asking for note text and there is a textarea, use it
    if (ids.some((x) => x.toLowerCase().includes('note'))) {
      const textarea = this.noteEditorFields.find((f) => String(f.type ?? '').toLowerCase() === 'textarea');
      if (textarea?.controlName && this.form.get(textarea.controlName)) return this.form.get(textarea.controlName)!.value;
    }

    return null;
  }

  private patchDefaultsForAdd(): void {
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
    const noteLevel = (n as any)?.noteLevel ?? (this.levelId ?? 1);
    const noteType = (n as any)?.noteType ?? (n as any)?.caseNoteType ?? 1;
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
    ctrl.setValue(value, { emitEvent: false });
  }

  private resolveContext$(): Observable<NotesContext> {
    if (this.caseHeaderId && this.caseTemplateId) {
      return of({
        caseHeaderId: this.caseHeaderId,
        caseTemplateId: this.caseTemplateId,
        levelId: this.levelId ?? 1
      });
    }

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

  // --------------------------
  // Dropdowns (same approach as Case Documents)
  // --------------------------
  private prefetchDropdownOptions(fields: AnyField[]): void {
    this.dropdownOptions = this.dropdownOptions ?? {};

    // 1) static dropdowns (no datasource) -> options[] / level[]
    for (const f of fields) {
      const hasDs = !!String(f.datasource ?? '').trim();
      if (String(f.type ?? '').toLowerCase() === 'select' && !hasDs) {
        const raw = (f.options ?? f.level ?? []) as any[];
        const opts = this.mapStaticOptions(raw);
        if (opts.length) this.dropdownOptions[f.controlName] = opts;
      }
    }

    // 2) datasource dropdowns -> getOptionsWithFallback()
    const selects = fields.filter((f) => String(f.type ?? '').toLowerCase() === 'select' && !!String(f.datasource ?? '').trim());

    const byDs = new Map<string, AnyField[]>();
    for (const f of selects) {
      const ds = String(f.datasource ?? '').trim();
      if (!ds) continue;
      const list = byDs.get(ds) ?? [];
      list.push(f);
      byDs.set(ds, list);
    }

    for (const [ds, dsFields] of byDs.entries()) {
      this.dsLookup
        .getOptionsWithFallback(
          ds,
          (r: any) => {
            // support already-mapped rows: {value,label/text}
            const value = r?.value ?? r?.id ?? r?.code ?? r?.key;
            const label = this.extractLabel(r, value);
            return this.toUiOption(value, label);
          },
          ['AG']
        )
        .pipe(takeUntil(this.destroy$))
        .subscribe((opts: any) => {
          const arr = (opts ?? []) as UiSmartOption[];
          for (const f of dsFields) {
            this.dropdownOptions[f.controlName] = arr.map(o => this.toUiOption((o as any).value, (o as any).label ?? (o as any).text ?? String((o as any).value ?? '')));
          }
          // ✅ important: after options arrive, coerce values so edit shows the correct selected label
          this.reconcileAllSelectControls();
        });
    }

    // also reconcile static selects
    this.reconcileAllSelectControls();
  }

  private mapStaticOptions(raw: any[]): UiSmartOption[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((x) => {
        if (x == null) return null;
        if (typeof x === 'string' || typeof x === 'number') return this.toUiOption(x, String(x));

        const value = x?.value ?? x?.id ?? x?.code ?? x?.key;
        const label = x?.label ?? x?.text ?? x?.name ?? x?.description ?? String(value ?? '');
        return this.toUiOption(value, label);
      })
      .filter(Boolean) as UiSmartOption[];
  }

  private toUiOption(value: any, label: string): UiSmartOption {
    // many custom dropdowns use {value,label}; some use {value,text}
    // keep BOTH so it renders either way
    return { value, label, text: label } as any;
  }

  private extractLabel(row: any, value: any): string {
    if (!row) return String(value ?? '');
    const direct =
      row?.label ??
      row?.text ??
      row?.name ??
      row?.displayName ??
      row?.description ??
      row?.title ??
      row?.typeName ??
      row?.levelName;
    if (typeof direct === 'string' && direct.trim().length) return direct;

    // pick first useful string field
    const skip = new Set([
      'id', 'value', 'code', 'key',
      'activeFlag', 'createdBy', 'createdOn', 'updatedBy', 'updatedOn',
      'deletedBy', 'deletedOn'
    ]);
    for (const k of Object.keys(row)) {
      if (skip.has(k)) continue;
      const v = row[k];
      if (typeof v === 'string' && v.trim().length > 0) return v.trim();
    }
    return String(value ?? '');
  }

  // Coerce form values to match option value types so edit shows correct selection
  private reconcileAllSelectControls(): void {
    for (const f of this.noteEditorFields) {
      if (String(f.type ?? '').toLowerCase() !== 'select') continue;
      this.reconcileSelectControl(f.controlName);
    }
  }

  private reconcileSelectControl(controlName: string): void {
    const ctrl = this.form.get(controlName);
    if (!ctrl) return;
    const v = ctrl.value;
    if (v == null || v === '') return;

    const opts = this.dropdownOptions?.[controlName] ?? [];
    if (!opts.length) return;

    // strict match
    if (opts.some(o => (o as any).value === v)) return;

    // loose string match
    const match = opts.find(o => String((o as any).value) === String(v));
    if (match) ctrl.setValue((match as any).value, { emitEvent: false });
  }

  private getLabelFromControlOptions(controlName: string | null, rawValue: any): string {
    if (!controlName) return String(rawValue ?? '');
    const opts = this.dropdownOptions?.[controlName] ?? [];
    if (!opts.length) return String(rawValue ?? '');
    const match = opts.find(o => String((o as any).value) === String(rawValue));
    return match ? String((match as any).label ?? (match as any).text ?? (match as any).value ?? '') : String(rawValue ?? '');
  }
}
