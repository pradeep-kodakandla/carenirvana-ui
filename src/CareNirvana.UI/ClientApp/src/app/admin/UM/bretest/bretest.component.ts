import { Component } from '@angular/core';

@Component({
  selector: 'app-bretest',
  templateUrl: './bretest.component.html',
  styleUrl: './bretest.component.css'
})
export class BretestComponent {
  conditions = [{ property: '', operator: '', value: '' }];
  results = [{ property: '', value: '' }];

  addCondition() {
    this.conditions.push({ property: '', operator: '', value: '' });
  }

  removeCondition(index: number) {
    this.conditions.splice(index, 1);
  }

  addResult() {
    this.results.push({ property: '', value: '' });
  }

  removeResult(index: number) {
    this.results.splice(index, 1);
  }
}
