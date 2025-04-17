import { Injectable } from '@angular/core';

interface Field {
  id: string;
  displayName?: string;
  label?: string;
}

interface Section {
  fields?: Field[];
}

@Injectable({
  providedIn: 'root'
})
export class ValidationExpressionsService {
  private fieldAliases: { id: string; label: string }[] = [];

  private synonyms = {
    operators: {
      'greater than': '>', 'after': '>', 'later than': '>', 'exceeds': '>',
      'less than': '<', 'before': '<',
      'equal to': '==', 'equals': '==', 'equal': '==', 'is': '==',
      'not equal': '!=', 'different from': '!=',
      'greater or equal': '>=', 'not less than': '>=', 'at least': '>=',
      'less or equal': '<=', 'not greater than': '<=', 'cannot exceed': '<=',
      'within': 'within'
    },
    conditions: ['if', 'when', 'unless'],
    logical: { 'and': '&&', 'or': '||' },
    then: ['then'],
    else: ['else']
  };

  private patterns = [
    {
      regex: /(.*)\s+(greater than|after|later than|exceeds)\s+(.*)/i,
      generate: (match: RegExpMatchArray, fields: string[]) => ({
        expression: `${ fields[0] } > ${ fields[1] } `,
        errorMessage: `${ this.getFieldLabel(fields[0]) } must be greater than ${ this.getFieldLabel(fields[1]) }.`,
        dependsOn: fields
      })
    },
    {
      regex: /(.*)\s+within\s+(.*)\s+and\s+(.*)/i,
      generate: (match: RegExpMatchArray, fields: string[]) => ({
        expression: `${ fields[0] } >= ${ fields[1] } && ${ fields[0] } <= ${ fields[2] } `,
        errorMessage: `${ this.getFieldLabel(fields[0]) } must be between ${ this.getFieldLabel(fields[1]) } and ${ this.getFieldLabel(fields[2]) }.`,
        dependsOn: fields
      })
    },
    {
      regex: /(.*)\s+required\s+if\s+(.*)\s+is set/i,
      generate: (match: RegExpMatchArray, fields: string[]) => ({
        expression: `${ fields[1] } ?!!${ fields[0] } : true`,
        errorMessage: `${ this.getFieldLabel(fields[0]) } is required when ${ this.getFieldLabel(fields[1]) } is set.`,
        dependsOn: fields
      })
    },
    {
      regex: /(.*)\s+(not greater than|cannot exceed)\s+(\d+)/i,
      generate: (match: RegExpMatchArray, fields: string[]) => ({
        expression: `${ fields[0] } <= ${ match[3] } `,
        errorMessage: `${ this.getFieldLabel(fields[0]) } must not be greater than ${ match[3] }.`,
        dependsOn: fields
      })
    },
    {
      regex: /(.*)\s+(not less than|cannot be less than|at least)\s+(\d+)/i,
      generate: (match: RegExpMatchArray, fields: string[]) => ({
        expression: `${ fields[0] } >= ${ match[3] } `,
        errorMessage: `${ this.getFieldLabel(fields[0]) } must not be less than ${ match[3] }.`,
        dependsOn: fields
      })
    },
    {
      regex: /(if\s+)?(.*)\s+(>|>=|<=|<|==|!=)\s+(.*)\s+then\s+(.*)\s+=\s+(.*)\s+else\s+(.*)\s+=\s+(.*)/i,
      generate: (match: RegExpMatchArray, fields: string[]) => {
        const conditionField1 = fields[0];
        const conditionField2 = fields[1];
        const operator = match[3];
        const thenField = fields[2];
        const thenValue = isNaN(Number(match[6])) ? `'${match[6]}'` : match[6];
        const elseField = fields[3];
        const elseValue = isNaN(Number(match[8])) ? `'${match[8]}'` : match[8];
        return {
          expression: `${ conditionField1 } ${ operator } ${ conditionField2 } ?(${ thenField } = ${ thenValue }) : (${ elseField } = ${ elseValue })`,
          errorMessage: `If ${ this.getFieldLabel(conditionField1) } ${ operator } ${ this.getFieldLabel(conditionField2) }, then ${ this.getFieldLabel(thenField) } must be ${ match[6] }, else ${ this.getFieldLabel(elseField) } must be ${ match[8] }.`,
          dependsOn: [conditionField1, conditionField2, thenField, elseField]
        };
      }
    },
    {
      regex: /(if\s+)?(.*)\s+(>|>=|<=|<|==|!=)\s+(.*)\s+and\s+(.*)\s+(>|>=|<=|<|==|!=)\s+(.*)\s+then\s+(.*)\s+=\s+(.*)/i,
      generate: (match: RegExpMatchArray, fields: string[]) => {
        const conditionField1 = fields[0];
        const conditionField2 = fields[1];
        const operator1 = match[3];
        const conditionField3 = fields[2];
        const operator2 = match[6];
        const conditionField4 = fields[3];
        const thenField = fields[4];
        const thenValue = isNaN(Number(match[9])) ? `'${match[9]}'` : match[9];
        return {
          expression: `(${ conditionField1 } ${ operator1 } ${ conditionField2 }) && (${ conditionField3 } ${ operator2 } ${ conditionField4 }) ?(${ thenField } = ${ thenValue }) : true`,
          errorMessage: `If ${ this.getFieldLabel(conditionField1) } ${ operator1 } ${ this.getFieldLabel(conditionField2) } and ${ this.getFieldLabel(conditionField3) } ${ operator2 } ${ this.getFieldLabel(conditionField4) }, then ${ this.getFieldLabel(thenField) } must be ${ match[9] }.`,
          dependsOn: [conditionField1, conditionField2, conditionField3, conditionField4, thenField]
        };
      }
    }
  ];

  updateFieldAliases(templateJson: { sections?: Section[] }): void {
    this.fieldAliases = (templateJson?.sections || [])
      .flatMap((section: Section) => section.fields || [])
      .map((field: Field) => ({
        id: field.id || 'unknown_' + Math.random().toString(36).substr(2, 9),
        label: field.displayName || field.label || field.id || 'Unnamed Field'
      }))
      .filter((field: { id: string; label: string }) => typeof field.id === 'string' && typeof field.label === 'string');
  }

  generateExpressionFromText(templateJson: any, ruleText: string): any {
    this.updateFieldAliases(templateJson);
    if (!ruleText || typeof ruleText !== 'string') {
      return this.createErrorRule('Invalid or empty input provided.');
    }

    const normalizedText = ruleText.toLowerCase().trim();
    if (!normalizedText) {
      return this.createErrorRule('Empty input provided.');
    }

    for (const pattern of this.patterns) {
      const match = normalizedText.match(pattern.regex);
      if (match) {
        const fields = this.extractFieldsFromMatch(match);
        if (fields.length >= (pattern.regex.source.includes('then') ? 3 : 1)) {
          const rule = pattern.generate(match, fields);
          return {
            ...rule,
            enabled: true
          };
        }
      }
    }

    const fieldMatches = this.findFieldMatches(normalizedText);
    const operator = this.detectOperator(normalizedText);
    const hasNow = normalizedText.includes('now');

    if (fieldMatches.length >= 2 && operator) {
      const fields = fieldMatches.map(m => m.id);
      const expression = hasNow
        ? `${ fields[0] } ${ operator } now ? ${ fields[1] } ${ operator } ${ fields[0] } : true`
        : `${ fields[0] } ${ operator } ${ fields[1] } `;

      return {
        expression,
        errorMessage: ruleText,
        dependsOn: fields,
        enabled: true
      };
    }

    return this.createErrorRule('Could not parse validation rule. Please clarify the statement.');
  }

  private extractFieldsFromMatch(match: RegExpMatchArray): string[] {
    const fields: string[] = [];
    for (let i = 1; i < match.length; i++) {
      const fieldLabel = match[i]?.trim();
      if (!fieldLabel || /^\d+$/.test(fieldLabel) || ['then', 'else', 'and', 'if'].includes(fieldLabel.toLowerCase())) continue;
      const field = this.fieldAliases.find(f => f.label.toLowerCase() === fieldLabel || f.id.toLowerCase() === fieldLabel);
      if (field && !fields.includes(field.id)) {
        fields.push(field.id);
      }
    }
    return fields;
  }

  private findFieldMatches(text: string): { id: string; label: string; index: number }[] {
    const matches: { id: string; label: string; index: number }[] = [];
    for (const field of this.fieldAliases) {
      if (!field.label || typeof field.label !== 'string') {
        console.warn(`Skipping field with invalid label: `, field);
        continue;
      }
      const label = field.label.toLowerCase();
      const index = text.indexOf(label);
      if (index !== -1) {
        matches.push({ id: field.id, label, index });
      }
    }
    return matches.sort((a, b) => a.index - b.index);
  }

  private detectOperator(text: string): string {
    for (const [key, value] of Object.entries(this.synonyms.operators)) {
      if (text.includes(key)) {
        return value;
      }
    }
    return '';
  }

  private getFieldLabel(id: string): string {
    return this.fieldAliases.find(f => f.id === id)?.label || id;
  }

  private createErrorRule(message: string) {
    return {
      dependsOn: [],
      expression: '',
      errorMessage: message,
      enabled: false
    };
  }

  getFieldAliases(): any[] {
    return this.fieldAliases;
  }
}
