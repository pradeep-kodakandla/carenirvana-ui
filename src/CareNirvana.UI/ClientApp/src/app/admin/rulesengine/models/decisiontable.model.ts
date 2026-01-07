// src/app/rulesengine/decisiontable/decisiontablemodels.ts

export type HitPolicy = 'FIRST' | 'PRIORITY' | 'COLLECT' | 'ALL';
export type DataType = 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'enum';

export interface DtOption {
  label: string;
  value: any;
}

export interface DtParameter {
  id: string; // stable id referenced by row cells + bindings
  kind: 'input' | 'output';
  key: string; // unique within table (ex: MemberAge)
  label: string; // display label (ex: Member Age)
  dataType: DataType;
  inputType: 'text' | 'number' | 'date' | 'datetime' | 'select' | 'toggle';
  operators?: string[]; // input only
  options?: DtOption[]; // enum/select
  isEnabled?: boolean;
}

export interface DtCell {
  parameterId: string;
  isAny?: boolean;     // input only
  operator?: string;   // input only
  value?: any;         // stored as string/bool/object; evaluated later
}

export interface DtRow {
  id: string;
  name?: string;
  enabled: boolean;
  priority: number;
  when: DtCell[]; // for input parameters
  then: DtCell[]; // for output parameters
}

export interface DecisionTableDefinition {
  id: string;
  name: string;
  description?: string;
  hitPolicy: HitPolicy;
  inputs: DtParameter[];
  outputs: DtParameter[];
  rows: DtRow[];
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  updatedOn?: string;
}

/**
 * Binding (mapping) created in Rule Designer when user selects this Decision Table.
 * Inputs map to Facts fields. Outputs map to target fields/variables.
 */
export interface DecisionTableBinding {
  id: string;
  decisionTableId: string;
  name?: string;

  inputBindings: Array<{
    parameterId: string;
    sourcePath: string; // ex: member.age
  }>;

  outputBindings: Array<{
    parameterId: string;
    targetPath: string; // ex: auth.slaHours
  }>;

  updatedOn?: string;
}

export interface FieldDictionaryItem {
  path: string;     // ex: member.age
  label: string;    // ex: Member Age
  dataType: DataType;
}
