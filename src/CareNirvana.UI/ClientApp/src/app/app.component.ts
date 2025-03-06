import { Component } from '@angular/core';
import { Router } from '@angular/router';



@Component({
  selector: 'app-root',
  templateUrl: './app.component.html'
})


export class AppComponent {
  title = 'app';
  constructor(public router: Router) { }

  // Define routes that should not display header and footer
  hideElementsForRoutes: string[] = ['/'];

  shouldDisplayHeaderAndFooter(): boolean {
        return !this.hideElementsForRoutes.includes(this.router.url);
  }
}



