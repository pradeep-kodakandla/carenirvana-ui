import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';

@Component({
  selector: 'app-decisiondetails',
  templateUrl: './decisiondetails.component.html',
  styleUrls: ['./decisiondetails.component.css']
})
export class DecisiondetailsComponent implements OnChanges {
  @Input() decisionData: any;
  formFields: { key: string; value: any }[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['decisionData']) {
      this.updateFormFields(this.decisionData || {});
    }
  }

  updateFormFields(data: any): void {
    this.formFields = Object.keys(data).length > 0
      ? Object.keys(data).map(key => ({ key, value: data[key] }))
      : this.getEmptyFormFields();
  }

  getEmptyFormFields(): { key: string; value: any }[] {
    return [
      { key: 'decisionLine', value: '' },
      { key: 'serviceCode', value: '' },
      { key: 'startDate', value: '' },
      { key: 'endDate', value: '' },
      { key: 'modifier', value: '' },
      { key: 'unitType', value: '' },
      { key: 'updatedDateTime', value: '' },
      { key: 'dueDate', value: '' },
      { key: 'decisionDatetime', value: '' },
      { key: 'createdDatetime', value: '' },
      { key: 'serviceDescription', value: '' },
      { key: 'status', value: '' },
      { key: 'statusCode', value: '' },
      { key: 'requestDatetime', value: '' },
      { key: 'requestPriority', value: '' },
      { key: 'verbalNotificationDatetime', value: '' },
      { key: 'writtenNotificationDatetime', value: '' },
      { key: 'diagnosisCode', value: '' },
      { key: 'diagnosisDescription', value: '' }
    ];
  }
}
