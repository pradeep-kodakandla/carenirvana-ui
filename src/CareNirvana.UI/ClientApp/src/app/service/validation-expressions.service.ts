import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ValidationExpressionsService {
  private fieldAliases = [
    { id: 'actualAdmissionDatetime', aliases: ['Actual Admission Datetime', 'actualAdmissionDatetime', 'Actual Admission Date time', 'Actual Admission Date and time'] },
    { id: 'expectedDischargeDatetime', aliases: ['Expected Discharge Datetime', 'expectedDischargeDatetime', 'Expected Discharge Date time', 'Expected Discharge Date and time'] },
    { id: 'requestDatetime', aliases: ['Request Datetime', 'requestDatetime', 'Request Date time', 'Request Date and time'] },
    { id: 'expectedAdmissionDatetime', aliases: ['Expected Admission Datetime', 'expectedAdmissionDatetime', 'Expected Admission Date time', 'Expected Admission Date and time'] },
    { id: 'fromDate', aliases: ['From Date', 'fromDate', 'From Date time', 'From Date and time', 'Service From Date and time', 'Service From Date', 'service from date'] },
    { id: 'toDate', aliases: ['To Date', 'toDate', 'To Date time', 'To Date and time', 'Service To Date and time', 'Service To Date', 'service to date'] },
    { id: 'effectiveDate', aliases: ['Effective Date', 'effectiveDate', 'Effective Date time', 'Effective Date and time'] },
    { id: 'createdDateTime', aliases: ['Created Datetime', 'createdDateTime', 'Created Date time', 'Created Date and time'] },
    { id: 'updatedDateTime', aliases: ['Updated Datetime', 'updatedDateTime', 'Updated Date time', 'Updated Date and time'] },
    { id: 'notificationDate', aliases: ['Notification Date', 'notificationDate', 'Notification Date time', 'Notification Date and time'] },
    { id: 'decisionDateTime', aliases: ['Decision Datetime', 'decisionDateTime', 'Decision Date time', 'Decision Date and time'] },
    { id: 'dueDate', aliases: ['Due Date', 'dueDate', 'Due Date time', 'Due Date and time'] },
    { id: 'appointmentDateTime', aliases: ['Appointment Date & Time', 'appointmentDateTime', 'Appointment Date time', 'Appointment Date and time'] },
    { id: 'beginDate', aliases: ['Begin Date', 'beginDate', 'Begin Date time', 'Begin Date and time'] },
    { id: 'endDate', aliases: ['End Date', 'endDate', 'End Date time', 'End Date and time'] },
    { id: 'noteEncounteredDatetime', aliases: ['Note Encountered Datetime', 'noteEncounteredDatetime', 'Note Encountered Date time', 'Note Encountered Date and time'] },
    { id: 'notificationDateDecision', aliases: ['Notification Date', 'notificationDateDecision', 'Notification Date time', 'Notification Date and time'] },
    { id: 'decisionRequestDatetime', aliases: ['Request Datetime', 'decisionRequestDatetime', 'Request Date time', 'Request Date and time'] }
  ];

  generateExpressionFromText(templateJson: any, ruleText: string): any {
    const normalizedText = ruleText.toLowerCase().trim();
    const words = normalizedText.split(/\s+/);

    let fieldMatches: { id: string, index: number }[] = [];

    for (const field of this.fieldAliases) {
      for (const alias of field.aliases) {
        const index = normalizedText.indexOf(alias.toLowerCase());
        if (index !== -1) {
          fieldMatches.push({ id: field.id, index });
          break;
        }
      }
    }

    fieldMatches.sort((a, b) => a.index - b.index);

    let leftField = fieldMatches[0]?.id || null;
    let rightField = fieldMatches[1]?.id || null;

    if (!leftField || !rightField) {
      return {
        dependsOn: [],
        expression: '',
        errorMessage: 'Could not generate validation from input. Please check your statement.',
        enabled: false
      };
    }

    const hasNow = normalizedText.includes('now');
    const hasCondition = normalizedText.includes('if') || normalizedText.includes('then');

    let condition = '';
    let expression = '';
    let operator = '';

    if (normalizedText.includes('greater than') || normalizedText.includes('after')) {
      operator = '>';
    } else if (normalizedText.includes('less than') || normalizedText.includes('before')) {
      operator = '<';
    } else if (normalizedText.includes('equal')) {
      operator = '==';
    }

    // Conditional expression (ternary style)
    if (hasCondition && hasNow) {
      if (normalizedText.indexOf(leftField) < normalizedText.indexOf('now')) {
        condition = `${leftField} ${operator} now`;
        expression = `${rightField} ${operator} ${leftField}`;
      } else {
        condition = `${rightField} ${operator} now`;
        expression = `${leftField} ${operator} ${rightField}`;
      }

      return {
        dependsOn: [leftField, rightField],
        expression: `${condition} ? ${expression} : true`,
        errorMessage: ruleText,
        enabled: true
      };
    }

    // Simple comparison without "if/then"
    return {
      dependsOn: [leftField, rightField],
      expression: `${leftField} ${operator} ${rightField}`,
      errorMessage: ruleText,
      enabled: true
    };
  }



  private getLabelForId(id: string): string | undefined {
    return this.fieldAliases.find(field => field.id === id)?.aliases[0];
  }




  public getFieldAliases(): any[] {
    return this.fieldAliases;
  }

}
