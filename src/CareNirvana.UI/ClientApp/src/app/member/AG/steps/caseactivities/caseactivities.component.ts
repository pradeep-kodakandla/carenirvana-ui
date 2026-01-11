// src/app/member/AG/steps/caseactivities/caseactivities.component.ts
import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { forkJoin, Observable, of, Subject, throwError } from 'rxjs';
import { catchError, finalize, map, switchMap, takeUntil, tap } from 'rxjs/operators';

import { CaseUnsavedChangesAwareService } from 'src/app/member/AG/guards/services/caseunsavedchangesaware.service';
import { DatasourceLookupService } from 'src/app/service/crud.service';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';
import { WorkbasketService } from 'src/app/service/workbasket.service';
import { AuthenticateService } from 'src/app/service/authentication.service';

// ✅ your new API service
import {
  CasedetailService,
  CaseActivityRowDto,
  CaseActivityCreateDto,
  CaseActivityUpdateDto,
  WorkgroupActionDto,
  CaseActivityTemplateResponse
} from 'src/app/service/casedetail.service';

// Optional: if you already have a "get case by number" API somewhere, wire it here.
// If not, keep only caseHeaderId/memberDetailsId/caseTemplateId inputs.
type ActivityContext = {
  caseHeaderId: number;
  memberDetailsId: number;
  caseTemplateId: number;
  caseLevelId: number;
  userId: number;
};

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
  selector: 'app-caseactivities',
  templateUrl: './caseactivities.component.html',
  styleUrls: ['./caseactivities.component.css']
})
export class CaseactivitiesComponent implements OnInit, OnChanges, OnDestroy, CaseUnsavedChangesAwareService {

  // You can pass these from shell/store like Notes does
  @Input() memberDetailsId?: number = 1;
  @Input() caseLevelId?: number = 1;

  @Input() caseHeaderId?: number = 27;
  @Input() caseTemplateId?: number = 2;

  // If your wizard only knows levelId, we can fallback:
  @Input() levelId: number = 1;

  // optional if caller only has caseNumber (keep if you want)
  @Input() caseNumber?: string;

  loading = false;
  saving = false;
  errorMsg = '';

  resolved?: ActivityContext;

  template?: CaseActivityTemplateResponse;

  activities: CaseActivityRowDto[] = [];

  // pending requests for current user: activityId -> caseWorkgroupId
  private pendingWorkgroupByActivityId = new Map<number, number>();

  showEditor = false;
  editing?: CaseActivityRowDto;

  form: FormGroup = this.fb.group({});

  activityEditorFields: AnyField[] = [];
  dropdownOptions: Record<string, UiSmartOption[]> = {};

  // controlName hints for mapping stable payload fields
  private activityTypeControlName: string | null = null;
  private priorityControlName: string | null = null;
  private dueDateControlName: string | null = null;
  private followupControlName: string | null = null;
  private commentControlName: string | null = null;
  private referToControlName: string | null = null;

  private caseLevelControlName: string | null = null;

  // optional “group request” selectors in template
  private workgroupBasketControlName: string | null = null;

  private destroy$ = new Subject<void>();

  allUsers: any[] = [];

  usersLoaded: boolean = false;
  private allUserOptions: UiSmartOption[] = [];
  private workBasketOptions: UiSmartOption[] = [];
  private workGroupOptions: UiSmartOption[] = []

  private wbWgRows: any[] = [];

  // ControlNames discovered from template
  private assignToControlName: string | null = null;   // "Assign To" (referTo)
  private workBasketControlName: string | null = null; // "Work Basket"
  private workGroupControlName: string | null = null;  // "Work Group"

  constructor(
    private fb: FormBuilder,
    private api: CasedetailService,
    private dsLookup: DatasourceLookupService,
    private wbService: WorkbasketService,
    private userService: AuthenticateService
  ) { }

  // --------------------------
  // Unsaved changes guard
  // --------------------------
  caseHasUnsavedChanges(): boolean {
    return !!this.showEditor && (this.form?.dirty ?? false);
  }
  hasUnsavedChanges(): boolean {
    return this.caseHasUnsavedChanges();
  }
  save(): void {
    this.onSave();
  }

  // --------------------------
  // Lifecycle
  // --------------------------
  ngOnInit(): void {
    this.reload();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['caseHeaderId'] || changes['memberDetailsId'] || changes['caseTemplateId'] || changes['caseLevelId'] || changes['levelId']) {
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
    if (!this.resolved) {
      this.errorMsg = 'Missing case context (caseHeaderId/memberDetailsId/caseTemplateId).';
      return;
    }
    this.editing = undefined;
    this.showEditor = true;

    this.form.reset({}, { emitEvent: false });
    this.form.markAsPristine();

    // optional defaults:
    // - set dueDate = today?
    // - set statusId default?
  }

  closeEditor(): void {
    this.showEditor = false;
    this.editing = undefined;
    this.form.markAsPristine();
  }

  onEdit(a: CaseActivityRowDto): void {
    this.editing = a;
    this.showEditor = true;
    this.errorMsg = '';

    // ✅ match Notes behavior: reset before patching so dropdowns render correctly in edit mode
    this.form.reset({}, { emitEvent: false });

    // ✅ match Notes behavior: patch by exact template field ids first (prevents blank dropdowns on edit)
    this.setValueById('caseActivityType', a.activityTypeId);
    this.setValueById('caseActivityPriority', a.priorityId);
    this.setValueById('caseActivityDueDateTime', a.dueDate);
    this.setValueById('caseActivityScheduledDateTime', a.followUpDateTime);
    this.setValueById('caseActivityComments', a.comment);

    // optional: case activity level (if the template includes it)
    this.setValueById('activityLevel', (a as any)?.caseLevelId ?? null);

    // Assign To (referTo) - may be null for group requests
    const referTo = (a as any)?.referTo ?? (a as any)?.referto ?? null;
    this.setValueById('caseActivityAssignTo', referTo);

    // Work Group / Work Basket (only if your GET returns them; otherwise these stay empty on edit)
    const wgValue =
      (a as any)?.workGroupId ??
      (a as any)?.workgroupid ??
      this.mapWorkGroupIdFromWorkGroupWorkBasketId(
        (a as any)?.workGroupWorkBasketId ?? (a as any)?.workgroupworkbasketid ?? null
      ) ??
      null;
    this.setValueById('caseActivityWorkGroup', wgValue);

    const wbValueRaw = (a as any)?.workBasketId ?? (a as any)?.workbasketid ?? null;
    const wgwIdRaw = (a as any)?.workGroupWorkBasketId ?? (a as any)?.workgroupworkbasketid ?? null;
    const wbValue = wbValueRaw != null ? wbValueRaw : this.mapWorkBasketIdFromWorkGroupWorkBasketId(wgwIdRaw);
    this.setValueById('caseActivityWorkBasket', wbValue);

    // Fallback: also patch via discovered control names (older templates)
    this.patchByCandidates(this.activityTypeControlName, a.activityTypeId);
    this.patchByCandidates(this.priorityControlName, a.priorityId);
    this.patchByCandidates(this.dueDateControlName, a.dueDate);
    this.patchByCandidates(this.followupControlName, a.followUpDateTime);
    this.patchByCandidates(this.commentControlName, a.comment);
    this.patchByCandidates(this.assignToControlName, referTo);
    this.patchByCandidates(this.workGroupControlName, wgValue);
    this.patchByCandidates(this.workBasketControlName, wbValue);


    // ensure selects reconcile once options exist
    this.reconcileAllSelectControls();

    this.form.markAsPristine();
  }

  onDelete(a: CaseActivityRowDto): void {
    const id = a.caseActivityId;
    const deletedBy = this.getUserId();
    if (!id || !deletedBy) return;

    this.saving = true;
    this.api.delete(id, deletedBy)
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => this.reload(),
        error: (e) => (this.errorMsg = this.normalizeError(e))
      });
  }

  // Accept / Reject buttons shown only if this user has a pending request for that activity
  canActOn(a: CaseActivityRowDto): boolean {
    return a.requestStatus === 'REQUESTED' && this.pendingWorkgroupByActivityId.has(a.caseActivityId);
  }

  accept(a: CaseActivityRowDto): void {
    const ctx = this.resolved;
    if (!ctx) return;

    const caseWorkgroupId = this.pendingWorkgroupByActivityId.get(a.caseActivityId);
    if (!caseWorkgroupId) return;

    const dto: WorkgroupActionDto = {
      caseWorkgroupId,
      userId: ctx.userId,
      caseLevelId: ctx.caseLevelId,
      comment: null
    };

    this.saving = true;
    this.api.accept(a.caseActivityId, dto)
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => this.reload(),
        error: (e) => (this.errorMsg = this.normalizeError(e))
      });
  }

  reject(a: CaseActivityRowDto): void {
    const ctx = this.resolved;
    if (!ctx) return;

    const caseWorkgroupId = this.pendingWorkgroupByActivityId.get(a.caseActivityId);
    if (!caseWorkgroupId) return;

    const dto: WorkgroupActionDto = {
      caseWorkgroupId,
      userId: ctx.userId,
      caseLevelId: ctx.caseLevelId,
      comment: null
    };

    this.saving = true;
    this.api.reject(a.caseActivityId, dto)
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => this.reload(),
        error: (e) => (this.errorMsg = this.normalizeError(e))
      });
  }

  onSave(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (!this.resolved) {
      this.errorMsg = 'Missing case context (caseHeaderId/memberDetailsId/caseTemplateId).';
      return;
    }

    const ctx = this.resolved;

    // map template controls -> stable payload
    const activityTypeId = this.readNumber(this.activityTypeControlName);
    const priorityId = this.readNumber(this.priorityControlName);

    const dueDate = this.readDateIso(this.dueDateControlName);
    const followUpDateTime = this.readDateIso(this.followupControlName);

    const comment = this.readString(this.commentControlName);

    // Optional: group request comes from a template select like "Work Group Work Basket"
    const wgId = this.readNumber(this.workGroupControlName);         // e.g. "caseActivityWorkGroup"
    const wbId = this.readNumber(this.workBasketControlName);        // e.g. "caseActivityWorkBasket"
    const isGroupRequest = !!wgId;
    this.saving = true;

    if (this.editing?.caseActivityId) {
      const dto: CaseActivityUpdateDto = {
        caseActivityId: this.editing.caseActivityId,
        activityTypeId,
        priorityId,
        dueDate,
        followUpDateTime,
        comment,
        isGroupRequest,
        workGroupWorkBasketIds: isGroupRequest ? this.resolveWorkGroupWorkBasketIds(wgId, wbId) : null,
        updatedBy: ctx.userId
      };

      this.api.update(dto)
        .pipe(finalize(() => (this.saving = false)))
        .subscribe({
          next: () => {
            this.closeEditor();
            this.reload();
            (this as any).showSavedMessage?.('Activity updated successfully');
          },
          error: (e) => (this.errorMsg = this.normalizeError(e))
        });

      return;
    }

    const createDto: CaseActivityCreateDto = {
      caseHeaderId: ctx.caseHeaderId,
      memberDetailsId: ctx.memberDetailsId,
      caseLevelId: ctx.caseLevelId,
      activityTypeId,
      priorityId,
      dueDate,
      followUpDateTime,
      comment,
      statusId: null,
      isGroupRequest,
      workGroupWorkBasketIds: isGroupRequest ? this.resolveWorkGroupWorkBasketIds(wgId, wbId) : null,
      createdBy: ctx.userId
    };
    console.log('Creating activity with DTO:', createDto);
    this.api.insert(createDto)
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.closeEditor();
          this.reload();
          (this as any).showSavedMessage?.('Activity saved successfully');
        },
        error: (e) => (this.errorMsg = this.normalizeError(e))
      });
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

  trackByField = (_: number, f: AnyField) => String(f.controlName || f.id || _);
  trackByActivity = (_: number, a: CaseActivityRowDto) => String(a.caseActivityId ?? _);

  // Labels in list (use options if available)
  getActivityTypeLabel(a: CaseActivityRowDto): string {
    const v = a.activityTypeId;
    return this.getLabelFromControlOptions(this.activityTypeControlName, v);
  }
  getPriorityLabel(a: CaseActivityRowDto): string {
    const v = a.priorityId;
    return this.getLabelFromControlOptions(this.priorityControlName, v);
  }

  // --------------------------
  // Loading
  // --------------------------
  reload(): void {
    this.loading = true;
    this.errorMsg = '';
    this.resolved = undefined;
    this.activities = [];
    this.template = undefined;
    this.dropdownOptions = {};
    this.activityEditorFields = [];
    this.pendingWorkgroupByActivityId.clear();
    this.showEditor = false;
    this.editing = undefined;

    this.resolveContext$()
      .pipe(
        switchMap((ctx) => {
          this.resolved = ctx;

          const activities$ = this.api.getByCase(ctx.caseHeaderId, ctx.memberDetailsId, ctx.caseLevelId, 'all');
          const template$ = this.api.getCaseActivityTemplate(ctx.caseTemplateId);

          // pending requests for this user (needs caseWorkgroupId to act)
          const pending$ = this.api.getPendingForUser(ctx.userId, ctx.caseHeaderId, ctx.memberDetailsId, ctx.caseLevelId);

          return forkJoin({ activities: activities$, template: template$, pending: pending$ });
        }),
        tap(({ template, pending }) => {
          this.template = template;

          // build fields from template section
          const fields = this.extractFields(template?.section);
          const enriched = fields.map((f) => this.enrichField(template?.section, f));

          // identify “known” fields for mapping payload (prefer exact template ids)
          this.activityTypeControlName = this.findControlNameByFieldIds(enriched, [
            'caseActivityType',
            'activityTypeId',
            'activityType',
            'type',
            'activitytype'
          ]);

          this.priorityControlName = this.findControlNameByFieldIds(enriched, [
            'caseActivityPriority',
            'priorityId',
            'priority',
            'priorityid'
          ]);

          this.dueDateControlName = this.findControlNameByFieldIds(enriched, [
            'caseActivityDueDateTime',
            'dueDate',
            'duedate',
            'due'
          ]);

          this.followupControlName = this.findControlNameByFieldIds(enriched, [
            'caseActivityScheduledDateTime',
            'scheduleddatetime',
            'followUpDateTime',
            'followupdatetime',
            'followup',
            'follow up'
          ]);

          this.commentControlName = this.findControlNameByFieldIds(enriched, [
            'caseActivityComments',
            'comment',
            'comments',
            'notes',
            'description'
          ]);

          this.assignToControlName = this.findControlNameByFieldIds(enriched, [
            'caseActivityAssignTo',
            'referTo',
            'referto',
            'assignTo',
            'assignto',
            'assignedTo',
            'assigned to',
            'assign to'
          ]);

          this.workBasketControlName = this.findControlNameByFieldIds(enriched, [
            'caseActivityWorkBasket',
            'workBasketId',
            'workbasketid',
            'workbasket',
            'work basket'
          ]);

          this.workGroupControlName = this.findControlNameByFieldIds(enriched, [
            'caseActivityWorkGroup',
            'workGroupId',
            'workgroupid',
            'workgroup',
            'work group'
          ]);

          this.caseLevelControlName = this.findControlNameByFieldIds(enriched, [
            'activityLevel',
            'caseLevelId',
            'caselevelid',
            'level'
          ]);

          // optional group selector
          this.workgroupBasketControlName = this.findControlNameByFieldIds(enriched, [
            'workgroupworkbasketid',
            'workGroupWorkBasketId',
            'workGroupWorkBasketIds',
            'workgroup basket',
            'work basket',
            'assign'
          ]);

          this.buildForm(enriched);
          this.activityEditorFields = enriched;

          this.cacheImportantControlNames(this.activityEditorFields);
          this.prefetchDropdownOptions(this.activityEditorFields);

          // load users into "Assign To"
          this.loadAllUsers();

          // load WB/WG into their dropdowns
          this.loadWorkBasket();

          // When WB changes, filter WG dropdown
          this.wireWorkBasketToWorkGroup();

          // pending map (must include caseWorkgroupId on DTO; if your API doesn't return it yet,
          // add it to the pending DTO response on backend)
          for (const p of (pending ?? []) as any[]) {
            const actId = Number(p.caseActivityId ?? 0);
            const wgId = Number(p.caseWorkgroupId ?? p.caseworkgroupid ?? 0);
            if (actId && wgId) this.pendingWorkgroupByActivityId.set(actId, wgId);
          }
        }),
        map(({ activities }) => activities ?? []),
        tap((activities) => (this.activities = activities)),
        catchError((e) => {
          this.errorMsg = this.normalizeError(e);
          return of([]);
        }),
        finalize(() => (this.loading = false)),
        takeUntil(this.destroy$)
      )
      .subscribe();
  }

  private resolveContext$(): Observable<ActivityContext> {
    const caseHeaderId = Number(this.caseHeaderId ?? 0);
    const memberDetailsId = Number(this.memberDetailsId ?? 0);
    const caseTemplateId = Number(this.caseTemplateId ?? 0);

    // caseLevelId preference: explicit input -> fallback to levelId
    const caseLevelId = Number(this.caseLevelId ?? this.levelId ?? 0);

    const userId = this.getUserId();

    if (caseHeaderId && memberDetailsId && caseTemplateId && caseLevelId && userId) {
      return of({ caseHeaderId, memberDetailsId, caseTemplateId, caseLevelId, userId });
    }

    // If you want to support caseNumber-based resolution, wire a service call here.
    // For now, keep it strict like you requested (GET requires caseHeaderId/memberDetailsId/caseLevelId).
    return throwError(() => new Error('Pass caseHeaderId + memberDetailsId + caseTemplateId + caseLevelId (or levelId).'));
  }

  // --------------------------
  // Form build + field parsing
  // --------------------------
  private buildForm(fields: AnyField[]): void {
    const group: Record<string, FormControl> = {};

    for (const f of fields) {
      const validators = [];
      if (f.required || f.isRequired) validators.push(Validators.required);

      group[f.controlName] = new FormControl(null, validators);
    }

    this.form = this.fb.group(group);
    this.form.markAsPristine();
  }

  private extractFields(section: any): any[] {
    if (!section) return [];
    const s: any = section;

    // common patterns
    if (Array.isArray(s.fields)) return s.fields;
    if (Array.isArray(s.subsections)) {
      const out: any[] = [];
      for (const sub of s.subsections) {
        const arr = sub?.fields;
        if (Array.isArray(arr)) out.push(...arr);
      }
      return out;
    }

    // deep fallback: find first "fields" array
    const found: any[] = [];
    const visit = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node.fields)) found.push(...node.fields);
      for (const k of Object.keys(node)) visit(node[k]);
    };
    visit(s);
    return found;
  }

  private enrichField(section: any, f: any): AnyField {
    const id =
      String(f?.id ?? f?.fieldId ?? '').trim() ||
      this.safeKey(String(f?.displayName ?? f?.label ?? 'field'));

    const displayName = String(f?.displayName ?? f?.label ?? id);
    const type = String(f?.type ?? 'text');

    const secKey = this.toSectionKey(String(section?.sectionName ?? 'Case Activity'));
    const controlName = `${secKey}_${id}`;

    return { ...f, id, displayName, type, controlName };
  }

  private findControlNameByFieldIds(fields: AnyField[], fieldIds: string[]): string | null {
    const needles = fieldIds.map((x) => x.toLowerCase());

    // check id first
    for (const f of fields) {
      const id = String(f.id ?? '').toLowerCase();
      const dn = String(f.displayName ?? '').toLowerCase();

      if (needles.some((n) => id === n || id.includes(n) || dn.includes(n))) {
        return f.controlName;
      }
    }
    return null;
  }

  private safeKey(s: string): string {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'field';
  }

  private toSectionKey(sectionName: string): string {
    return this.safeKey(sectionName || 'section');
  }

  // --------------------------
  // Dropdown loading (static + datasource)
  // --------------------------
  private prefetchDropdownOptions(fields: AnyField[]): void {
    this.dropdownOptions = this.dropdownOptions ?? {};

    // 1) static dropdowns (no datasource) -> options[] / level[]
    for (const f of fields) {
      const hasDs = !!String((f as any).datasource ?? '').trim();
      if (String(f.type ?? '').toLowerCase() === 'select' && !hasDs) {
        const raw = ((f as any).options ?? (f as any).level ?? []) as any[];
        const opts = this.mapStaticOptions(raw);
        if (opts.length) this.dropdownOptions[f.controlName] = opts;
      }
    }

    // 2) datasource dropdowns -> getOptionsWithFallback()
    const selects = fields.filter(
      f => String(f.type ?? '').toLowerCase() === 'select' && !!String((f as any).datasource ?? '').trim()
    );

    const byDs = new Map<string, AnyField[]>();
    for (const f of selects) {
      const ds = String((f as any).datasource ?? '').trim();
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
          ['AG'] // keep same module scope you used in Notes
        )
        .pipe(takeUntil(this.destroy$))
        .subscribe((opts: any) => {
          const arr = (opts ?? []) as UiSmartOption[];
          for (const f of dsFields) {
            this.dropdownOptions[f.controlName] = arr.map(o =>
              this.toUiOption(
                (o as any).value,
                (o as any).label ?? (o as any).text ?? String((o as any).value ?? '')
              )
            );
          }

          // important: coerce select values once options arrive
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

  private toUiOption(value: any, label: string): UiSmartOption {
    return { value, label } as any;
  }

  private reconcileAllSelectControls(): void {
    for (const f of this.activityEditorFields ?? []) {
      if (String(f.type ?? '').toLowerCase() !== 'select') continue;
      this.reconcileSelectControlValue(f.controlName);
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

  private reconcileSelectControlValue(controlName: string): void {
    const ctrl = this.form.get(controlName);
    if (!ctrl) return;

    const v = ctrl.value;
    if (v == null || v === '') return;

    const opts = this.dropdownOptions?.[controlName] ?? [];
    if (!opts.length) return;

    // ✅ If it already matches by strict equality, do nothing
    if (opts.some((o: any) => (o as any).value === v)) return;

    // ✅ If it matches by string/number equivalence, coerce the control value
    const match = opts.find((o: any) => String((o as any).value) === String(v));
    if (match) {
      ctrl.setValue((match as any).value, { emitEvent: false });
    }
  }

  private cacheImportantControlNames(fields: AnyField[]): void {
    this.activityTypeControlName = this.findControl(fields, ['activitytype', 'activity type', 'type']);
    this.priorityControlName = this.findControl(fields, ['priority']);
    this.referToControlName = this.findControl(fields, ['referto', 'refer to', 'assigned', 'assigned to', 'owner']);
  }

  private findControl(fields: AnyField[], hints: string[]): string | null {
    const h = hints.map(x => x.toLowerCase());
    const hit = fields.find(f => {
      const a = `${f.id ?? ''} ${f.controlName ?? ''} ${f.displayName ?? ''}`.toLowerCase();
      return h.some(k => a.includes(k));
    });
    return hit?.controlName ?? null;
  }

  private getLabelFromControlOptions(controlName: string | null, rawValue: any): string {
    if (!controlName) return String(rawValue ?? '');
    const opts = this.dropdownOptions?.[controlName] ?? [];
    if (!opts.length) return String(rawValue ?? '');
    const match = opts.find((o: any) => String(o.value) === String(rawValue));
    return match ? String((match as any).label ?? (match as any).text ?? (match as any).value ?? '') : String(rawValue ?? '');
  }

  // --------------------------
  // Value helpers
  // --------------------------

  private coerceToOptionValue(controlName: string, rawValue: any): any {
    if (rawValue == null || rawValue === '') return null;

    const opts = this.dropdownOptions?.[controlName] ?? [];
    if (!opts.length) return rawValue;

    const match = opts.find((o: any) => String((o as any).value) === String(rawValue));
    return match ? (match as any).value : rawValue;
  }

  private setValueById(fieldId: string, value: any): void {
    const f = (this.activityEditorFields ?? []).find(
      (x) => String((x as any).id ?? '').toLowerCase() === String(fieldId ?? '').toLowerCase()
    );
    if (!f?.controlName) return;

    const ctrl = this.form.get(f.controlName);
    if (!ctrl) return;

    const isSelect = String((f as any).type ?? '').toLowerCase() === 'select';
    const vToSet = isSelect ? this.coerceToOptionValue(f.controlName, value) : (value ?? null);

    ctrl.setValue(vToSet, { emitEvent: false });
  }

  private patchByCandidates(controlName: string | null, value: any): void {
    if (!controlName) return;

    const ctrl = this.form.get(controlName);
    if (!ctrl) return;

    // If this control is a select, coerce the value to the exact option.value (string vs number)
    const f = (this.activityEditorFields ?? []).find((x) => x.controlName === controlName);
    const isSelect = String((f as any)?.type ?? '').toLowerCase() === 'select';
    const vToSet = isSelect ? this.coerceToOptionValue(controlName, value) : (value ?? null);

    ctrl.setValue(vToSet, { emitEvent: false });
  }

  private readString(controlName: string | null): string | null {
    if (!controlName) return null;
    const v = this.form.get(controlName)?.value;
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
  }

  private readNumber(controlName: string | null): number | null {
    if (!controlName) return null;
    const v = this.form.get(controlName)?.value;
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private readDateIso(controlName: string | null): string | null {
    if (!controlName) return null;
    const v = this.form.get(controlName)?.value;
    if (!v) return null;

    // ui-datetime-picker often returns ISO-like strings already
    if (typeof v === 'string') return v;

    // Date object
    if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();

    // fallback
    try {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
    } catch {
      return String(v);
    }
  }

  private getUserId(): number {
    return Number(sessionStorage.getItem('loggedInUserid')) || 0;
  }

  private normalizeError(e: any): string {
    return String(e?.error?.message ?? e?.message ?? e ?? 'Error');
  }

  getAssignedToLabel(a: any): string {
    // if API later returns name, prefer it:
    const apiName = a?.referToName ?? a?.assignedToName;
    if (apiName) return String(apiName);
    return this.getLabelFromControlOptions(this.referToControlName, a?.referTo);
  }


  private setOptions(controlName: string | null, opts: UiSmartOption[]): void {
    if (!controlName) return;
    this.dropdownOptions = this.dropdownOptions ?? {};
    this.dropdownOptions[controlName] = (opts ?? []).map(o => this.toUiOption((o as any).value, (o as any).label ?? (o as any).text ?? String((o as any).value ?? '')));
    this.reconcileSelectControl(controlName); // so edit mode snaps to the right typed value
  }


  loadAllUsers(): void {

    if (this.usersLoaded) {
      //// this.applyCaseOwnerOptions();
      return;
    }

    this.userService.getAllUsers().subscribe({
      next: (users: any[]) => {
        this.allUsers = users || [];
        this.usersLoaded = true;

        this.allUserOptions = this.allUsers.map(u => ({
          value: u.userId,
          label: u.userName
        })) as UiSmartOption[];
        this.setOptions(this.assignToControlName, this.allUserOptions);
        //  this.applyCaseOwnerOptions();
      },
      error: (err) => {
        console.error('Failed to load users:', err);
        this.usersLoaded = false;
      }
    });
  }



  loadWorkBasket(): void {
    this.wbService.getByUserId(Number(sessionStorage.getItem('loggedInUserid')) || 0).subscribe({
      next: (res: any) => {
        if (!Array.isArray(res)) {
          console.warn('wbService.getByUserId did not return an array', res);
          this.workBasketOptions = [];
          this.workGroupOptions = [];
          return;
        }
        // keep raw rows for WB->WG filtering
        this.wbWgRows = res;
        const distinctWB = res.filter(
          (item: any, index: number, self: any[]) =>
            index === self.findIndex((t: any) => t.workBasketId === item.workBasketId)
        );

        const distinctWG = res.filter(
          (item: any, index: number, self: any[]) =>
            index === self.findIndex((t: any) => t.workGroupId === item.workGroupId)
        );

        const distinctWBUsers = res.filter(
          (item: any, index: number, self: any[]) =>
            index === self.findIndex((t: any) => t.userId === item.userId)
        );

        // Work Baskets
        // UI selects a Work Basket (workBasketId). For group requests, we derive workGroupWorkBasketId from WB+WG.
        this.workBasketOptions = distinctWB
          .filter((r: any) => r.activeFlag !== false)
          .map((r: any) => ({
            value: Number(r.workBasketId),
            label:
              r.workBasketName ||
              r.workBasketCode ||
              `WB #${r.workBasketId}`
          }))
          .filter(o => !isNaN(o.value));

        // Work Groups
        this.workGroupOptions = distinctWG
          .filter((r: any) => r.activeFlag !== false)
          .map((r: any) => ({
            value: Number(r.workGroupId),
            label:
              r.workGroupName ||
              r.workGroupCode ||
              `WG #${r.workGroupId}`
          }))
          .filter(o => !isNaN(o.value));

        this.setOptions(this.workBasketControlName, this.workBasketOptions);
        this.setOptions(this.workGroupControlName, this.workGroupOptions);
      },
      error: (err: any) => {
        console.error('Error fetching user workgroups/workbaskets', err);
        this.workBasketOptions = [];
        this.workGroupOptions = [];
      }
    });
  }


  // --------------------------
  // Workgroup-workbasket helpers
  // --------------------------
  /** Returns [workGroupWorkBasketId] array if WB+WG combination exists, else null */
  private resolveWorkGroupWorkBasketIds(workGroupId: number | null, workBasketId: number | null): number[] | null {
    const id = this.resolveWorkGroupWorkBasketId(workGroupId, workBasketId);
    return id ? [id] : null;
  }

  private resolveWorkGroupWorkBasketId(workGroupId: number | null, workBasketId: number | null): number | null {
    if (!workGroupId || !workBasketId) return null;
    const row = (this.wbWgRows ?? []).find((r: any) =>
      Number(r.workGroupId ?? r.workgroupid ?? 0) === Number(workGroupId) &&
      Number(r.workBasketId ?? r.workbasketid ?? 0) === Number(workBasketId)
    );
    const id = Number(row?.workGroupWorkBasketId ?? row?.workgroupworkbasketid ?? 0);
    return id && !Number.isNaN(id) ? id : null;
  }

  private mapWorkBasketIdFromWorkGroupWorkBasketId(workGroupWorkBasketId: any): number | null {
    const id = Number(workGroupWorkBasketId ?? 0);
    if (!id) return null;
    const row = (this.wbWgRows ?? []).find((r: any) => Number(r.workGroupWorkBasketId ?? r.workgroupworkbasketid ?? 0) === id);
    const wbId = Number(row?.workBasketId ?? row?.workbasketid ?? 0);
    return wbId && !Number.isNaN(wbId) ? wbId : null;
  }

  private mapWorkGroupIdFromWorkGroupWorkBasketId(workGroupWorkBasketId: any): number | null {
    const id = Number(workGroupWorkBasketId ?? 0);
    if (!id) return null;
    const row = (this.wbWgRows ?? []).find((r: any) => Number(r.workGroupWorkBasketId ?? r.workgroupworkbasketid ?? 0) === id);
    const wgId = Number(row?.workGroupId ?? row?.workgroupid ?? 0);
    return wgId && !Number.isNaN(wgId) ? wgId : null;
  }

  private wireWorkBasketToWorkGroup(): void {
    if (!this.workBasketControlName || !this.workGroupControlName) return;

    const wbName = this.workBasketControlName;  // ✅ now string
    const wgName = this.workGroupControlName;   // ✅ now string

    const wbCtrl = this.form?.get(wbName);
    if (!wbCtrl) return;

    wbCtrl.valueChanges.pipe(takeUntil(this.destroy$)).subscribe((wbId: any) => {
      const id = Number(wbId ?? 0);

      if (!id) {
        // No WB selected: show all workgroups
        this.setOptions(wgName, this.workGroupOptions);
        return;
      }

      // Filter rows to that WB, then distinct workgroups
      const filtered = (this.wbWgRows ?? []).filter((r: any) => Number(r.workBasketId ?? r.workbasketid ?? 0) === id);

      const seen = new Set<number>();
      const wgOpts: UiSmartOption[] = [];
      for (const r of filtered) {
        const wgId = Number(r.workGroupId ?? 0);
        if (!wgId || seen.has(wgId)) continue;
        seen.add(wgId);
        const wgNameText = r.workGroupName ?? r.workgroupname ?? String(wgId);
        wgOpts.push(this.toUiOption(wgId, wgNameText));
      }

      this.setOptions(wgName, wgOpts);

      // If current selected WG is not in list anymore, clear it
      const current = this.form.get(wgName)?.value;  // ✅ wgName is string
      if (current && !wgOpts.some(o => String((o as any).value) === String(current))) {
        this.form.get(wgName)?.setValue(null, { emitEvent: false });  // ✅ wgName is string
      }
    });
  }

}
