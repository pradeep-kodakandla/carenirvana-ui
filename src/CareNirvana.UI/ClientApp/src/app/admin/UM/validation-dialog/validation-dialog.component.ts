import { Component, Inject, OnInit, ViewChild, ElementRef } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ValidationExpressionsService } from 'src/app/service/validation-expressions.service';
import { FormControl } from '@angular/forms';
import { of, Observable } from 'rxjs';
import { map, startWith, debounceTime, tap } from 'rxjs/operators';



interface ValidationRule {
  id: string;
  errorMessage: string;
  expression: string;
  dependsOn: string[];
  enabled: boolean;
}

@Component({
  selector: 'app-validation-dialog',
  templateUrl: './validation-dialog.component.html',
  styleUrls: ['./validation-dialog.component.css']
})
export class ValidationDialogComponent implements OnInit {

  autoCompleteControl = new FormControl('');
  allAliases: string[] = [];
  filteredOptions$: Observable<string[]> = of([]);
  showAutocomplete = true;

  newRuleText: string = '';
  generateError: boolean = false;

  @ViewChild('inputElement', { static: true }) inputElement!: ElementRef<HTMLInputElement>;

  ngOnInit(): void {
    const aliasSet = new Set<string>();
    this.expressionService.getFieldAliases().forEach(item => {
      item.aliases.forEach((alias: string) => aliasSet.add(alias));
    });
    this.allAliases = Array.from(aliasSet);

    this.filteredOptions$ = this.autoCompleteControl.valueChanges.pipe(
      debounceTime(200),
      map((value: string | null) => value ?? ''),
      map(value => {
        this.newRuleText = value;
        const word = this.getCurrentFragment(value);
        this.showAutocomplete = word.length > 0;
        return this.allAliases.filter(alias =>
          alias.toLowerCase().includes(word.toLowerCase())
        );
      })
    );
  }

  getCurrentFragment(value: string): string {
    const input = value ?? '';
    const cursorPos = this.inputElement.nativeElement.selectionStart ?? input.length;
    const beforeCursor = input.substring(0, cursorPos);
    const match = beforeCursor.match(/[\w\s]*?(\w+)$/);
    return match ? match[1] : '';
  }

  onOptionSelected(selected: string): void {
    const inputEl = this.inputElement.nativeElement;
    const fullText = this.autoCompleteControl.value || '';
    const cursor = inputEl.selectionStart ?? fullText.length;

    const before = fullText.substring(0, cursor);
    const after = fullText.substring(cursor);

    const words = before.split(/(\s+)/); // preserve spacing
    for (let i = words.length - 1; i >= 0; i--) {
      if (words[i].trim().length > 0) {
        words[i] = selected;
        break;
      }
    }

    const newText = words.join('') + after;
    this.autoCompleteControl.setValue(newText);
    this.newRuleText = newText;

    setTimeout(() => {
      const newCursor = words.join('').length;
      inputEl.setSelectionRange(newCursor, newCursor);
      inputEl.focus();
    });

    this.showAutocomplete = false;
  }

  onInputFocus() {
    if ((this.autoCompleteControl.value ?? '').length > 0) {
      this.showAutocomplete = true;
    }
  }

  onInputBlur() {
    setTimeout(() => this.showAutocomplete = false, 200);
  }






  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { templateId: number; validations: any[]; templateJson: any },
    public dialogRef: MatDialogRef<ValidationDialogComponent>,
    private expressionService: ValidationExpressionsService
  ) {
    console.log('Validation data received in dialog:', this.data);
  }



  save() {
    this.dialogRef.close(this.data.validations);
  }

  close() {
    this.dialogRef.close();
  }

  addValidation() {
    this.data.validations.push({
      id: '',
      errorMessage: '',
      expression: '',
      dependsOn: [],
      enabled: true
    });
  }

  removeValidation(index: number) {
    this.data.validations.splice(index, 1);
  }

  onDependsOnChange(value: string, rule: any) {
    rule.dependsOn = value
      .split(',')
      .map(v => v.trim())
      .filter(v => v.length > 0);
  }

  addGeneratedValidation(): void {


    const rule = this.expressionService.generateExpressionFromText(this.data.templateJson, this.newRuleText);
    console.log('Generated rule:', rule);
    if (rule) {
      this.data.validations.push(rule);
      this.newRuleText = '';
      this.generateError = false;
    } else {
      this.generateError = true;
    }
  }


}
