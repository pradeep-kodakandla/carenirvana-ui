import {
  Component,
  ViewChild,
  ViewContainerRef,
  ComponentFactoryResolver,
  ComponentRef,
  Type,
  OnDestroy,
  OnInit,
  AfterViewInit
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Subject, combineLatest } from 'rxjs';
import { distinctUntilChanged, map, takeUntil } from 'rxjs/operators';

import { AuthService } from 'src/app/service/auth.service';
import { CasedetailService } from 'src/app/service/casedetail.service';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';

import { CaseWizardStoreService } from 'src/app/member/AG/services/case-wizard-store.service';

import { CasedetailsComponent } from 'src/app/member/AG/steps/casedetails/casedetails.component';
import { CasedispositionComponent } from 'src/app/member/AG/steps/casedisposition/casedisposition.component';
import { CasemdreviewComponent } from 'src/app/member/AG/steps/casemdreview/casemdreview.component';
import { CaseactivitiesComponent } from 'src/app/member/AG/steps/caseactivities/caseactivities.component';
import { CasenotesComponent } from 'src/app/member/AG/steps/casenotes/casenotes.component';
import { CasedocumentsComponent } from 'src/app/member/AG/steps/casedocuments/casedocuments.component';
import { CasecloseComponent } from 'src/app/member/AG/steps/caseclose/caseclose.component';
import { CaseUnsavedChangesAwareService } from 'src/app/member/AG/guards/services/caseunsavedchangesaware.service';

export interface CaseStep {
  id: string;
  label: string;
  route: string;
  disabled?: boolean; // ✅ fixes your stepper TS2339 errors
}

@Component({
  selector: 'app-casewizardshell',
  templateUrl: './casewizardshell.component.html',
  styleUrls: ['./casewizardshell.component.css']
})
export class CasewizardshellComponent implements OnInit, AfterViewInit, OnDestroy, CaseUnsavedChangesAwareService {

  @ViewChild('stepContainer', { read: ViewContainerRef }) stepContainer!: ViewContainerRef;

  // Header
  headerForm!: FormGroup;
  caseTypeOptions: UiSmartOption[] = [];
  savingTop = false;

  // Expose store streams to template
  tabs$ = this.state.tabs$;
  activeLevelId$ = this.state.activeLevelId$;
  aggregate$ = this.state.aggregate$;

  // Stepper
  steps: CaseStep[] = [
    { id: 'details', label: 'Case Details', route: 'details' },
    { id: 'disposition', label: 'Disposition Details', route: 'disposition' },
    { id: 'mdReview', label: 'MD Review', route: 'mdReview' },
    { id: 'activities', label: 'Activities', route: 'activities' },
    { id: 'notes', label: 'Notes', route: 'notes' },
    { id: 'documents', label: 'Documents', route: 'documents' },
    { id: 'close', label: 'Close', route: 'close' }
  ];

  activeStepId = 'details';
  private currentStepRef?: ComponentRef<any>;

  private destroy$ = new Subject<void>();

  private stepMap: Record<string, Type<any>> = {
    details: CasedetailsComponent,
    disposition: CasedispositionComponent,
    mdReview: CasemdreviewComponent,
    activities: CaseactivitiesComponent,
    notes: CasenotesComponent,
    documents: CasedocumentsComponent,
    close: CasecloseComponent
  };

  constructor(
    private componentFactoryResolver: ComponentFactoryResolver,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private authService: AuthService,
    private caseApi: CasedetailService,
    private state: CaseWizardStoreService
  ) { }

  ngOnInit(): void {
    this.headerForm = this.fb.group({
      caseType: [null] // holds templateId
    });

    // Load Case Types (NO default selection)
    this.authService.getTemplates('AG', 0)
      .pipe(takeUntil(this.destroy$))
      .subscribe((rows: any[]) => {
        const list = rows ?? [];
        this.caseTypeOptions = list.map(x => ({
          value: x.id,
          label: x.templateName
        }));
      });

    // Case Type selection => push templateId to store (all steps listen)
    this.headerForm.get('caseType')!.valueChanges
      .pipe(takeUntil(this.destroy$), distinctUntilChanged())
      .subscribe((templateId: number | null) => {
        this.state.setTemplateId(templateId);
        this.updateStepDisabled(templateId);
        this.pushTemplateIdIntoCurrentStep(templateId);
      });

    // EDIT MODE detection: caseNumber in route
    this.watchParamFromAnyLevel('caseNumber')
      .pipe(takeUntil(this.destroy$), distinctUntilChanged())
      .subscribe(caseNumber => {
        if (!caseNumber || caseNumber === '0') {
          this.state.resetForNew();
          this.updateStepDisabled(this.state.getTemplateId());
          return;
        }

        // Load aggregate once for edit
        this.caseApi.getCaseByNumber(caseNumber)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (agg: any) => {
              this.state.setAggregate(agg);

              // derive templateId from agg.header.caseType
              const templateId = this.deriveTemplateIdFromAggregate(agg);
              this.state.setTemplateId(templateId);

              // patch dropdown without firing valueChanges again
              this.headerForm.patchValue({ caseType: templateId }, { emitEvent: false });
              this.updateStepDisabled(templateId);

              // choose first available level
              const level = this.deriveActiveLevelIdFromAggregate(agg) ?? 1;
              this.state.setActiveLevel(level);

              // push template into whatever step is currently rendered
              this.pushTemplateIdIntoCurrentStep(templateId);
            },
            error: (e: any) => console.error(e)
          });
      });

    // Also recalc disabled whenever aggregate/template changes externally
    combineLatest([this.state.templateId$, this.state.aggregate$])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([tid]) => this.updateStepDisabled(tid));
  }

  ngAfterViewInit(): void {
    this.loadStep(this.activeStepId);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.currentStepRef?.destroy();
  }

  // ---------------- UI actions ----------------

  selectLevel(levelId: number): void {
    if (!this.canNavigateAway()) return;
    this.state.setActiveLevel(levelId);

    // ✅ push new level into current step (notes/documents should reload)
    this.currentStepRef?.setInput?.('levelId', levelId);

    const inst: any = this.currentStepRef?.instance;
    if (typeof inst?.onLevelChanged === 'function') inst.onLevelChanged(levelId);
    if (typeof inst?.reload === 'function') inst.reload(); // if you built reload()
  }

  onStepSelected(step: any): void {
    const stepId = typeof step === 'string' ? step : (step?.id ?? step?.route);
    if (!stepId || stepId === this.activeStepId) return;

    if (!this.canNavigateAway()) return;

    this.activeStepId = stepId;
    this.loadStep(stepId);
  }

  saveFromTop(): void {
    const inst: any = this.currentStepRef?.instance;
    if (!inst || typeof inst.save !== 'function') {
      console.warn('Current step has no save() method.');
      return;
    }

    try {
      this.savingTop = true;
      // wrapper steps forward save() to inner casedetails
      inst.save();
    } finally {
      this.savingTop = false;
    }
  }

  // ---------------- dynamic load ----------------

  private loadStep(stepId: string): void {
    const cmp = this.stepMap[stepId] ?? CasedetailsComponent;

    this.stepContainer.clear();
    this.currentStepRef?.destroy();

    const factory = this.componentFactoryResolver.resolveComponentFactory(cmp);
    this.currentStepRef = this.stepContainer.createComponent(factory);

    const inst: any = this.currentStepRef.instance;

    // ✅ Set stepId FIRST (prevents "empty" on first load)
    if (inst && 'stepId' in inst) {
      inst.stepId = stepId;
    }

    // Push current templateId (may be null on new until user selects)
    const templateId = this.state.getTemplateId?.() ?? this.headerForm.get('caseType')?.value;
    if (typeof inst?.setTemplateId === 'function') {
      inst.setTemplateId(templateId);
    }

    this.pushContextIntoCurrentStep();

    // ✅ Force immediate CD so inputs are applied before user sees it
    this.currentStepRef.changeDetectorRef.detectChanges();
  }

  private pushContextIntoCurrentStep(): void {
    if (!this.currentStepRef) return;

    const inst: any = this.currentStepRef.instance;

    const caseHeaderId = this.state.getHeaderId?.() ?? null;
    const caseTemplateId = this.state.getTemplateId?.() ?? null;
    const levelId = this.state.getActiveLevelId() ?? 1;

    // from your shell header you already display case number via aggregate$ :contentReference[oaicite:0]{index=0}
    const agg: any = (this.state as any).getAggregate?.() ?? null;
    const caseNumber = agg?.header?.caseNumber ?? agg?.caseNumber ?? null;
    const memeberDetailsId = Number(sessionStorage.getItem('selectedMemberDetailsId') || 0);
    // ✅ Only set inputs if the component declares them
    if ('caseHeaderId' in inst) this.currentStepRef.setInput('caseHeaderId', caseHeaderId);
    if ('caseTemplateId' in inst) this.currentStepRef.setInput('caseTemplateId', caseTemplateId);
    if ('levelId' in inst) this.currentStepRef.setInput('levelId', levelId);
    if ('caseNumber' in inst) this.currentStepRef.setInput('caseNumber', caseNumber);
    if ('memberDetailsId' in inst) this.currentStepRef.setInput('memberDetailsId', memeberDetailsId);

    // optional hook
    if (typeof inst?.setContext === 'function') {
      inst.setContext({ caseHeaderId, caseTemplateId, levelId, caseNumber, memeberDetailsId });
    }
  }


  private pushTemplateIdIntoCurrentStep(templateId: number | null): void {
    const inst: any = this.currentStepRef?.instance;
    if (typeof inst?.setTemplateId === 'function') {
      inst.setTemplateId(templateId);
    } else if (typeof inst?.forwardTemplateId === 'function') {
      inst.forwardTemplateId(templateId);
    }
  }

  private updateStepDisabled(templateId: number | null): void {
    const hasType = !!templateId;
    this.steps = this.steps.map(s => ({
      ...s,
      // allow details always; block other steps until template chosen
      disabled: !hasType && s.id !== 'details'
    }));
  }

  private canNavigateAway(): boolean {
    const inst: any = this.currentStepRef?.instance;
    const hasUnsaved = !!inst?.hasUnsavedChanges?.();
    if (!hasUnsaved) return true;

    // Keep your existing UX here if you already have a confirmation flow
    return confirm('You have unsaved changes. Do you want to continue?');
  }

  // ---------------- route helpers ----------------

  private watchParamFromAnyLevel(paramName: string) {
    const chain: ActivatedRoute[] = [];
    let r: ActivatedRoute | null = this.route;
    while (r) {
      chain.push(r);
      r = r.parent;
    }

    return combineLatest(
      chain.map(x => x.paramMap.pipe(map(pm => pm.get(paramName))))
    ).pipe(
      map(list => list.find(v => v != null) ?? null),
      distinctUntilChanged()
    );
  }

  private deriveTemplateIdFromAggregate(agg: any): number | null {
    const raw = agg?.header?.caseType ?? agg?.header?.templateId ?? null;
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  private deriveActiveLevelIdFromAggregate(agg: any): number | null {
    const details: any[] = agg?.details ?? [];
    const ids = (details ?? [])
      .map(d => Number(d?.caseLevelId ?? d?.levelId))
      .filter(x => Number.isFinite(x) && x > 0)
      .sort((a, b) => a - b);

    return ids.length ? ids[0] : null;
  }

  // ---------------- header extractors ----------------
  // (these are called by the HTML) :contentReference[oaicite:1]{index=1}

  getCaseNumber(agg: any): string {
    return agg?.header?.caseNumber ?? agg?.caseNumber ?? '';
  }

  public isCaseTypeLocked(agg: any): boolean {
    const cn = (this.getCaseNumber(agg));
    return !!cn; // true when real caseNumber exists (not '', not '0')
  }

  getCreatedOn(agg: any): any {
    return agg?.header?.createdOn ?? agg?.createdOn ?? null;
  }

  /**
   * Received Date is not in your header sample, so fallback to Level 1 jsonData.
   * Looks for Case_Overview_receivedDateTime.
   */
  getReceivedOn(agg: any): any {
    const direct = agg?.header?.receivedOn ?? agg?.receivedOn ?? null;
    if (direct) return direct;

    const first = agg?.details?.[0];
    const json = first?.jsonData;
    if (!json) return null;

    try {
      const obj = typeof json === 'string' ? JSON.parse(json) : json;
      return obj?.Case_Overview_receivedDateTime ?? null;
    } catch {
      return null;
    }
  }

  caseHasUnsavedChanges(): boolean {
    const inst: any = this.currentStepRef?.instance;

    // support both naming styles so all steps work
    return !!(
      inst?.caseHasUnsavedChanges?.() ??
      inst?.hasUnsavedChanges?.() ??
      false
    );
  }

  //private canNavigateAway(): boolean {
  //  if (!this.caseHasUnsavedChanges()) return true;
  //  return confirm('You have unsaved changes. Do you want to continue?');
  //}
}
