import { Component } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs/operators';

@Component({
  selector: 'appRulesEngineShell',
  templateUrl: './rulesengineshell.component.html',
  styleUrls: ['./rulesengineshell.component.css']
})
export class RulesEngineShellComponent {
  pageTitle = 'Dashboard';
  showHeader = true;
  constructor(private router: Router, private route: ActivatedRoute) {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        map(() => {
          // get deepest route title
          let r: ActivatedRoute | null = this.route;
          while (r?.firstChild) r = r.firstChild;
          const title = r?.snapshot?.data?.['title'] ?? 'Rules Engine';

          // show header only on dashboard
          const url = (this.router.url ?? '').toLowerCase();
          this.showHeader = url.includes('/dashboard');

          return title;
        })
      )
      .subscribe((title) => (this.pageTitle = title));

    // initial load (no NavigationEnd yet sometimes)
    const initUrl = (this.router.url ?? '').toLowerCase();
    this.showHeader = initUrl.includes('/dashboard');
  }

  onHelp(): void {
    console.log('Help clicked');
  }

  onCreateNewRule(): void {
    console.log('Create New Rule clicked');
  }
}
