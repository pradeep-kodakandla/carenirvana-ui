import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, Subscription } from 'rxjs';

export interface AuthWizardStep {
  id: string;
  label: string;
  route: string;
  disabled?: boolean;
}

@Component({
  selector: 'app-authwizardshell',
  templateUrl: './authwizardshell.component.html',
  styleUrls: ['./authwizardshell.component.css']
})
export class AuthwizardshellComponent implements OnInit, OnDestroy {
  steps: AuthWizardStep[] = [];
  activeStepId = '';

  authNumber: string = '0';
  isNewAuth = true;

  private sub = new Subscription();

  constructor(private router: Router, private route: ActivatedRoute) { }

  ngOnInit(): void {
    // param from routing: path: ':authNumber'
    this.sub.add(
      this.route.paramMap.subscribe(pm => {
        this.authNumber = pm.get('authNumber') || '0';

        // treat 0 as "new"
        this.isNewAuth = (this.authNumber === '0' || this.authNumber.trim() === '');

        this.buildSteps();
        this.ensureDefaultChild();
        this.syncActiveStepFromRoute();
      })
    );

    this.sub.add(
      this.router.events
        .pipe(filter(e => e instanceof NavigationEnd))
        .subscribe(() => this.syncActiveStepFromRoute())
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  onStepSelected(step: AuthWizardStep): void {
    if (step.disabled) return;
    this.router.navigate([step.route], { relativeTo: this.route });
  }

  private buildSteps(): void {
    const base: AuthWizardStep[] = [
      { id: 'details', label: 'Details', route: 'details' },
      { id: 'decision', label: 'Decision', route: 'decision' },
      { id: 'mdReview', label: 'MD Review', route: 'mdReview' },
      { id: 'activities', label: 'Activities', route: 'activities' },
      { id: 'notes', label: 'Notes', route: 'notes' },
      { id: 'documents', label: 'Documents', route: 'documents' }
    ];

    // ✅ show Smart Check only for NEW auth (authNumber = 0)
    this.steps = this.isNewAuth
      ? [{ id: 'smartcheck', label: 'Smart Check', route: 'smartcheck' }, ...base]
      : base;
  }

  private ensureDefaultChild(): void {
    const childPath = this.route.firstChild?.snapshot?.url?.[0]?.path;

    // if user hits /.../auth/:authNumber (no child), route to correct first step
    if (!childPath) {
      this.router.navigate([this.isNewAuth ? 'smartcheck' : 'details'], {
        relativeTo: this.route,
        replaceUrl: true
      });
      return;
    }

    // if existing auth and user somehow lands on smartcheck -> force details
    if (!this.isNewAuth && childPath === 'smartcheck') {
      this.router.navigate(['details'], { relativeTo: this.route, replaceUrl: true });
    }
  }

  private syncActiveStepFromRoute(): void {
    const childPath = this.route.firstChild?.snapshot?.url?.[0]?.path;
    const match = this.steps.find(s => s.route === childPath);
    this.activeStepId = match?.id ?? (this.isNewAuth ? 'smartcheck' : 'details');
  }
}
