/// <reference path="../../../../service/authdetailapi.service.ts" />
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { forkJoin, Observable, of, Subject, throwError } from 'rxjs';
import { catchError, finalize, map, switchMap, tap, takeUntil } from 'rxjs/operators';

import { DatasourceLookupService } from 'src/app/service/crud.service';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';

import { AuthDetailApiService } from 'src/app/service/authdetailapi.service';

import { AuthNoteDto, TemplateSectionResponse, CreateAuthNoteRequest, UpdateAuthNoteRequest } from 'src/app/member/UM/services/authdetail';

type NotesContext = { authDetailId: number; authTemplateId: number };

type AnyField = {
  id: string;
  controlName: string;
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
  selector: 'app-authnotes',
  templateUrl: './authnotes.component.html',
  styleUrls: ['./authnotes.component.css']
})
export class AuthnotesComponent implements OnInit, OnChanges, OnDestroy {
  @Input() authDetailId?: number;
  @Input() authTemplateId?: number;

  // optional: if caller only has authNumber
  @Input() authNumber?: string;

  notes: AuthNoteDto[] = [];
  template?: TemplateSectionResponse;

  loading = false;
  saving = false;
  errorMsg = '';

  showEditor = false;
  editing?: AuthNoteDto;

  resolved?: NotesContext;

  form: FormGroup = this.fb.group({});
  noteEditorFields: AnyField[] = [];

  dropdownOptions: Record<string, UiSmartOption[]> = {};

  private noteTypeControlName: string | null = null;
  private noteLevelControlName: string | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private api: AuthDetailApiService,
    private dsLookup: DatasourceLookupService
  ) { }

  ngOnInit(): void {
    this.reload();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['authDetailId'] || changes['authTemplateId'] || changes['authNumber']) {
      this.reload();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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

  onEdit(n: AuthNoteDto): void {
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
      this.errorMsg = 'Missing auth context (authDetailId/authTemplateId).';
      return;
    }

    const userId = Number(sessionStorage.getItem('loggedInUserid') || 0);
    const ctx = this.resolved;

    // Map template-driven controls -> API payload
    const noteText = String(
      this.readValueByCandidates([
        'authorizationNotes',      // UM textarea id
        'authNotes',
        'noteText',
        'notes'
      ]) ?? ''
    );

    const noteType = Number(
      this.readValueByCandidates([
        'authorizationNoteType',   // UM dropdown id
        'authNoteType',
        'noteType'
      ]) ?? 0
    ) || null;

    const noteLevel = Number(
      this.readValueByCandidates([
        'noteLevel',
        'authorizationNoteLevel'   // if you ever add it
      ]) ?? 0
    ) || null;

    const authAlertNote = !!this.readValueByCandidates([
      'authorizationAlertNote',    // UM checkbox id
      'authAlertNote',
      'isAlertNote'
    ]);

    const encounteredOn = this.toIsoOrNull(
      this.readValueByCandidates([
        'noteEncounteredDatetime'   // UM datetime id
      ])
    );

    const alertEndDate = authAlertNote
      ? this.toIsoOrNull(this.readValueByCandidates(['newDate_copy_q5d60fyd5'])) // UM alert end date
      : null;

    const payload: CreateAuthNoteRequest | UpdateAuthNoteRequest = {
      noteText,
      noteType,
      noteLevel,
      authAlertNote,
      encounteredOn,
      alertEndDate
    } as any;

    this.saving = true;
    this.errorMsg = '';

    let req$: Observable<any>;

    const noteId = this.getNoteId(this.editing);
    if (noteId) {
      req$ = this.api.updateNote(ctx.authDetailId, noteId, payload as any, userId);
    } else {
      req$ = this.api.createNote(ctx.authDetailId, payload as any, userId);
    }

    req$
      .pipe(
        finalize(() => (this.saving = false)),
        catchError((err) => {
          this.errorMsg = err?.error?.message ?? 'Unable to save note.';
          return of(null);
        })
      )
      .subscribe({
        next: () => {
          this.closeEditor();
          this.reloadNotesOnly();
        }
      });
  }

  onDelete(n: AuthNoteDto): void {
    if (!this.resolved) return;

    const noteId = this.getNoteId(n);
    if (!noteId) return;

    if (!confirm('Delete this note?')) return;

    const userId = Number(sessionStorage.getItem('loggedInUserid') || 0);

    this.saving = true;
    this.errorMsg = '';

    this.api
      .deleteNote(this.resolved.authDetailId, noteId, userId)
      .pipe(
        finalize(() => (this.saving = false)),
        catchError((err) => {
          this.errorMsg = err?.error?.message ?? 'Unable to delete note.';
          return of(null);
        })
      )
      .subscribe({
        next: () => this.reloadNotesOnly()
      });
  }

  // --------------------------
  // Notes cards helpers
  // --------------------------
  getNoteId(n?: AuthNoteDto): string | null {
    if (!n) return null;
    return (n as any)?.noteId ?? (n as any)?.authNoteId ?? (n as any)?.id ?? null;
  }

  getNoteText(n: AuthNoteDto): string {
    return String((n as any)?.noteText ?? (n as any)?.notes ?? '');
  }

  getNoteType(n: AuthNoteDto): any {
    return (n as any)?.noteType
      ?? (n as any)?.authorizationNoteType
      ?? (n as any)?.authNoteType
      ?? '';
  }

  getNoteTypeLabel(n: AuthNoteDto): string {
    const v = this.getNoteType(n);
    console.log('noteTypeControlName', this.noteTypeControlName);
    console.log('opts', this.dropdownOptions?.[this.noteTypeControlName!]);
    console.log('firstNoteType', this.getNoteType(this.notes?.[0]));
    return this.getLabelFromControlOptions(this.noteTypeControlName, v);
  }


  isAlert(n: AuthNoteDto): boolean {
    return !!((n as any)?.isAlertNote ?? (n as any)?.authAlertNote ?? false);
  }

  getCreatedOn(n: AuthNoteDto): string | undefined {
    return (n as any)?.createdOn ?? (n as any)?.createdDate ?? (n as any)?.createdAt;
  }

  trackByNoteId = (_: number, n: AuthNoteDto) => String(this.getNoteId(n) ?? _);
  trackByField = (_: number, f: AnyField) => String(f.controlName || f.id || _);

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
            notes: this.api.getNotes(ctx.authDetailId).pipe(
              catchError((err) => {
                console.error('getNotes failed', err);
                return of([] as any);
              })
            ),
            template: this.api.getAuthNotesTemplate(ctx.authTemplateId).pipe(
              catchError((err) => {
                console.error('getAuthNotesTemplate failed', err);
                return of(undefined);
              })
            )
          });
        }),
        tap((res: any) => {
          this.notes = (res?.notes ?? []) as AuthNoteDto[];
          this.template = res?.template;
          const section = (this.template as any)?.section ?? (this.template as any)?.Section;
          this.applyNotesTemplate(section);
        }),
        finalize(() => (this.loading = false)),
        catchError((err) => {
          console.error('Error loading auth notes/template', err);
          this.errorMsg = err?.error?.message ?? 'Unable to load authorization notes.';
          return of(null);
        })
      )
      .subscribe();
  }

  private reloadNotesOnly(): void {
    if (!this.resolved) return;

    this.loading = true;
    this.api
      .getNotes(this.resolved.authDetailId)
      .pipe(
        finalize(() => (this.loading = false)),
        catchError((err) => {
          this.errorMsg = err?.error?.message ?? 'Unable to reload notes.';
          return of([] as any);
        })
      )
      .subscribe({
        next: (res: any) => (this.notes = (res ?? []) as AuthNoteDto[])
      });
  }

  private applyNotesTemplate(section: any): void {
    // fallback if template is empty
    const fields = this.extractFieldsDeep(section);
    const editorFields = fields.filter((f) => !this.isGridField(f));

    this.noteEditorFields = editorFields.map((x) => this.enrichField(section, x));

    this.noteTypeControlName = this.findControlNameByFieldIds([
      'authorizationNoteType',   
      'authNoteType',
      'noteType'
    ]);

    const group: Record<string, FormControl> = {};
    for (const f of this.noteEditorFields) {
      const v = this.defaultValueForType(f.type);
      const validators = this.fieldIsRequired(f) ? [Validators.required] : [];
      group[f.controlName] = new FormControl(v, validators);
    }
    this.form = this.fb.group(group);

    this.prefetchDropdownOptions(this.noteEditorFields);

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

    // subsections can be [] OR {} (UM uses {})
    const subs = node.subsections;
    if (Array.isArray(subs)) {
      for (const s of subs) out.push(...this.extractFieldsDeep(s));
    } else if (subs && typeof subs === 'object') {
      for (const s of Object.values(subs)) out.push(...this.extractFieldsDeep(s));
    }

    // sections can also be [] OR {}
    const secs = node.sections;
    if (Array.isArray(secs)) {
      for (const s of secs) out.push(...this.extractFieldsDeep(s));
    } else if (secs && typeof secs === 'object') {
      for (const s of Object.values(secs)) out.push(...this.extractFieldsDeep(s));
    }

    return out;
  }


  private enrichField(section: any, f: any): AnyField {
    const id = String(f?.id ?? f?.fieldId ?? '').trim() || this.safeKey(String(f?.displayName ?? f?.label ?? 'field'));
    const displayName = String(f?.displayName ?? f?.label ?? id);
    const type = String(f?.type ?? 'text');

    const secKey = this.toSectionKey(String(section?.sectionName ?? 'Authorization Notes'));
    const controlName = `${secKey}_${id}`;

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
    // Existing defaults (keep)
    this.setValueById('noteLevel', 1);
    this.setValueById('noteType', 1);
    this.setValueById('authNoteType', 1);

    this.setValueById('authAlertNote', false);
    this.setValueById('isAlertNote', false);

    this.setValueById('authNotes', '');
    this.setValueById('authorizationNotes', '');
    this.setValueById('noteText', '');

    // ✅ UM template ids (add)
    this.setValueById('authorizationNoteType', 1);        // dropdown
    this.setValueById('noteEncounteredDatetime', null);   // datetime
    this.setValueById('authorizationAlertNote', false);   // checkbox
    this.setValueById('newDate_copy_q5d60fyd5', null);    // alert end date (only used if alert)
  }

  private patchFormFromNote(n: AuthNoteDto): void {
    const noteText = (n as any)?.noteText ?? (n as any)?.notes ?? '';
    const noteLevel = (n as any)?.noteLevel ?? 1;
    const noteType = (n as any)?.noteType ?? (n as any)?.authNoteType ?? 1;

    // backend should store authAlertNote; keep backward-compat with isAlertNote
    const alertFlag = !!((n as any)?.authAlertNote ?? (n as any)?.isAlertNote ?? false);

    // new fields
    const encounteredOn = (n as any)?.encounteredOn ?? null;
    const alertEndDate = (n as any)?.alertEndDate ?? null;

    // Existing patching (keep)
    this.setValueById('authNotes', noteText);
    this.setValueById('authorizationNotes', noteText);
    this.setValueById('noteText', noteText);

    this.setValueById('noteLevel', noteLevel);
    this.setValueById('noteType', noteType);
    this.setValueById('authNoteType', noteType);

    this.setValueById('authAlertNote', alertFlag);
    this.setValueById('isAlertNote', alertFlag);

    // ✅ UM template ids (add)
    this.setValueById('authorizationNotes', noteText);
    this.setValueById('authorizationNoteType', noteType);

    this.setValueById('noteEncounteredDatetime', encounteredOn);
    this.setValueById('authorizationAlertNote', alertFlag);

    // only set alert end date when alert is true
    this.setValueById('newDate_copy_q5d60fyd5', alertFlag ? alertEndDate : null);
  }


  private setValueById(fieldId: string, value: any): void {
    const f = this.noteEditorFields.find((x) => String(x.id ?? '').toLowerCase() === fieldId.toLowerCase());
    if (!f?.controlName) return;
    const ctrl = this.form.get(f.controlName);
    if (!ctrl) return;
    ctrl.setValue(value, { emitEvent: false });
  }

  private resolveContext$(): Observable<NotesContext> {
    // preferred: both IDs passed in
    if (this.authDetailId && this.authTemplateId) {
      return of({ authDetailId: this.authDetailId, authTemplateId: this.authTemplateId });
    }

    // fallback: resolve from authNumber
    if (this.authNumber?.trim()) {
      return this.api.getByNumber(this.authNumber.trim()).pipe(
        map((row: any) => {
          const detailId = Number(row?.authDetailId ?? row?.id ?? 0);
          const templateId = Number(row?.authTemplateId ?? row?.authTemplateId ?? row?.authClassId ?? 0);
          if (!detailId || !templateId) throw new Error('Unable to resolve authDetailId/authTemplateId from authNumber.');
          return { authDetailId: detailId, authTemplateId: templateId };
        })
      );
    }

    return throwError(() => new Error('Pass authDetailId + authTemplateId OR authNumber.'));
  }

  // --------------------------
  // Dropdowns (same approach as Case Notes)
  // --------------------------
  private prefetchDropdownOptions(fields: AnyField[]): void {
    this.dropdownOptions = this.dropdownOptions ?? {};

    // 1) static selects
    for (const f of fields) {
      const hasDs = !!String(f.datasource ?? '').trim();
      if (String(f.type ?? '').toLowerCase() === 'select' && !hasDs) {
        const raw = (f.options ?? f.level ?? []) as any[];
        const opts = this.mapStaticOptions(raw);
        if (opts.length) this.dropdownOptions[f.controlName] = opts;
      }
    }

    // 2) datasource selects
    const selects = fields.filter(
      (f) => String(f.type ?? '').toLowerCase() === 'select' && !!String(f.datasource ?? '').trim()
    );

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
            this.dropdownOptions[f.controlName] = arr.map((o) =>
              this.toUiOption(
                (o as any).value,
                (o as any).label ?? (o as any).text ?? String((o as any).value ?? '')
              )
            );
          }
          this.reconcileAllSelectControls();
        });
    }

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

    if (opts.some((o) => (o as any).value === v)) return;

    const match = opts.find((o) => String((o as any).value) === String(v));
    if (match) ctrl.setValue((match as any).value, { emitEvent: false });
  }

  private getLabelFromControlOptions(controlName: string | null, rawValue: any): string {
    if (!controlName) return String(rawValue ?? '');
    const opts = this.dropdownOptions?.[controlName] ?? [];
    if (!opts.length) return String(rawValue ?? '');
    const match = opts.find((o) => String((o as any).value) === String(rawValue));
    return match
      ? String((match as any).label ?? (match as any).text ?? (match as any).value ?? '')
      : String(rawValue ?? '');
  }



  // In authnotes.component.ts

  setContext(ctx: any): void {
    const nextDetailId = Number(ctx?.authDetailId ?? 0) || null;
    const nextTemplateId = Number(ctx?.authTemplateId ?? 0) || null;

    const changed =
      nextDetailId !== this.authDetailId ||
      nextTemplateId !== this.authTemplateId;

    this.authDetailId = Number( nextDetailId);
    this.authTemplateId = Number(nextTemplateId);

    // Only fetch once both are available
    if (changed && this.authDetailId && this.authTemplateId) {
      this.reloadWithIds(this.authDetailId, this.authTemplateId);
    }
    console.log('AuthNotesComponent setContext', ctx, changed);
  }

  private reloadWithIds(authDetailId: number, authTemplateId: number): void {
    this.loading = true;
    this.errorMsg = '';

    forkJoin({
      notes: this.api.getNotes(authDetailId),
      template: this.api.getAuthNotesTemplate(authTemplateId)
    })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (res: any) => {
          this.notes = res?.notes ?? [];
          this.template = res?.template;

          const section = (this.template as any)?.section ?? (this.template as any)?.Section;
          this.applyNotesTemplate(section); // your existing template->form builder
          this.resolved = { authDetailId, authTemplateId };
        },
        error: (err) => {
          this.errorMsg = err?.error?.message ?? 'Unable to load authorization notes.';
        }
      });
  }

  private toIsoOrNull(v: any): string | null {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }


}
