import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

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
export class ValidationDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { templateId: number, validations: any[] },
    public dialogRef: MatDialogRef<ValidationDialogComponent>
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


}
