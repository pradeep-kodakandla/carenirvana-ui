import { Component, ViewChild, ViewContainerRef, ComponentFactoryResolver, ComponentRef, Type } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { CaseUnsavedChangesAwareService } from '../../guards/services/caseunsavedchangesaware.service'; // adjust path
import { CasedetailsComponent } from 'src/app/member/AG/steps/casedetails/casedetails.component';
import { CasedispositionComponent } from 'src/app/member/AG/steps/casedisposition/casedisposition.component';
import { CasemdreviewComponent } from 'src/app/member/AG/steps/casemdreview/casemdreview.component';
import { CaseactivitiesComponent } from 'src/app/member/AG/steps/caseactivities/caseactivities.component';
import { CasenotesComponent } from 'src/app/member/AG/steps/casenotes/casenotes.component';
import { CasedocumentsComponent } from 'src/app/member/AG/steps/casedocuments/casedocuments.component';
import { CasecloseComponent } from 'src/app/member/AG/steps/caseclose/caseclose.component';
import { CaseWizardStoreService } from 'src/app/member/AG/services/case-wizard-store.service';
interface LevelTab {
  levelId: number;
  label: string;
}

export interface CaseStep {
  id: string;
  label: string;
  route: string;   // child route segment
  disabled?: boolean;
}

@Component({
  selector: 'casewizardshell', // no hyphen
  templateUrl: './casewizardshell.component.html',
  styleUrls: ['./casewizardshell.component.css'],
})
export class CasewizardshellComponent {
  @ViewChild('stepContainer', { read: ViewContainerRef }) stepContainer!: ViewContainerRef;

  steps: CaseStep[] = [
    { id: 'details', label: 'Case Details', route: 'details' },
    { id: 'disposition', label: 'Disposition Details', route: 'disposition' },
    { id: 'mdReview', label: 'MD Review', route: 'mdReview' },
    { id: 'activities', label: 'Activities', route: 'activities' },
    { id: 'notes', label: 'Notes', route: 'notes' },
    { id: 'documents', label: 'Documents', route: 'documents' },
    { id: 'close', label: 'Close', route: 'close' },
  ];

  activeStepId = 'details';

  private currentStepRef?: ComponentRef<any>;

  tabs$ = this.state.tabs$;
  activeLevelId$ = this.state.activeLevelId$;

  private stepMap: Record<string, Type<any>> = {
    details: CasedetailsComponent,
    disposition: CasedispositionComponent,
    mdReview: CasemdreviewComponent,
    activities: CaseactivitiesComponent,
    notes: CasenotesComponent,
    documents: CasedocumentsComponent,
    close: CasecloseComponent,
  };

  constructor(private componentFactoryResolver: ComponentFactoryResolver, private state: CaseWizardStoreService) { }

  ngAfterViewInit(): void {
    this.loadStep(this.activeStepId);
  }

  onStepSelected(step: CaseStep) {
    if (step.disabled) return;

    // ✅ warn if current step has unsaved changes
    const current = this.currentStepRef?.instance as CaseUnsavedChangesAwareService | undefined;
    if (current?.caseHasUnsavedChanges?.()) {
      const ok = confirm('You have unsaved changes. Leave without saving?');
      if (!ok) return;
    }

    this.activeStepId = step.id;
    this.loadStep(step.id);
  }

  private loadStep(stepId: string): void {
    const cmp = this.stepMap[stepId];
    if (!cmp) return;

    this.stepContainer.clear();
    this.currentStepRef?.destroy();

    const factory = this.componentFactoryResolver.resolveComponentFactory(cmp);
    this.currentStepRef = this.stepContainer.createComponent(factory);
  }

  selectLevel(levelId: number) {
    this.state.setActiveLevel(levelId);
  }
}
