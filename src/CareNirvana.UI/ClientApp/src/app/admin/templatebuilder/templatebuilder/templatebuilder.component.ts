import {
  Component, ViewChild, OnInit, EventEmitter, Output, HostListener,
  Input, OnChanges, SimpleChanges, ChangeDetectorRef
} from '@angular/core';
import { CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { TemplateService } from 'src/app/service/template.service';
import { KeyValue } from '@angular/common';
import { AuthService } from 'src/app/service/auth.service';
import { MatDialog } from '@angular/material/dialog';
import { SettingsDialogComponent } from 'src/app/admin/UM/settings-dialog/settings-dialog.component';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CrudService } from 'src/app/service/crud.service';
import { ValidationDialogComponent } from 'src/app/admin/UM/validation-dialog/validation-dialog.component';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

// ─── Shared interfaces ────────────────────────────────────────────────────────

interface TemplateField {
  label: string;
  displayName?: string;
  type: string;
  id: string;
  options?: string[];
  required?: boolean;
  requiredMsg?: string;
  buttonText?: string;
  datasource?: string;
  selectedOptions?: string[];
  defaultValue?: string;
  order?: number;
  layout?: string;
  fields?: TemplateField[];
  authStatus?: string[];
  isActive?: boolean;
  isEnabled?: boolean;
  sectionName?: string;
  dateOnly?: boolean;
  level?: string[];
  showWhen?: ShowWhen;
  referenceFieldId?: string | null;
  visibilityValue?: string | number | null;
  conditions?: any[];
  isVisible?: boolean | null;
  info?: string;
  primary?: boolean;
  caseStatus?: string[];
  lookup?: LookupConfig;
}

export type LookupEntity =
  | 'icd' | 'medicalcodes' | 'procedure' | 'medication'
  | 'member' | 'provider' | 'staff' | 'authorization' | 'claim'
  | (string & {});

export interface LookupFillMap {
  targetFieldId: string;
  sourcePath: string;
  transform?: 'trim' | 'upper' | 'lower' | 'phoneDigits';
  defaultValue?: any;
}

export interface LookupConfig {
  enabled?: boolean;
  entity?: LookupEntity;
  datasource?: string;
  minChars?: number;
  debounceMs?: number;
  limit?: number;
  placeholder?: string;
  displayTemplate?: string;
  displayFields?: string[];
  valueField?: string;
  fill?: LookupFillMap[];
  clearOnEmpty?: boolean;
  clearTargets?: string[];
  queryParam?: string;
  limitParam?: string;
}

type ShowWhen = 'always' | 'fieldEquals' | 'fieldNotEquals' | 'fieldhasvalue';

interface RepeatConfig {
  enabled?: boolean;
  min?: number;
  max?: number;
  defaultCount?: number;
  showControls?: boolean;
  instanceLabel?: string;
}

type PredefinedSubsectionKey =
  | 'provider' | 'member' | 'icd' | 'procedure'
  | 'medication' | 'staff' | 'authorization' | 'claim';

interface PredefinedSubsectionTemplate {
  key: PredefinedSubsectionKey;
  title: string;
  subtitle: string;
  icon: string;
  subsection: Partial<TemplateSectionModel>;
}

interface TemplateSectionModel {
  sectionName: string;
  sectionDisplayName?: string;
  order?: number;
  fields: TemplateField[];
  subsections?: { [key: string]: TemplateSectionModel };
  subsectionKey?: string;
  repeat?: RepeatConfig;
  baseKey?: string;
  parentSectionName?: string;
  showWhen?: ShowWhen;
  referenceFieldId?: string | null;
  visibilityValue?: string | number | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-templatebuilder',
  templateUrl: './templatebuilder.component.html',
  styleUrls: ['./templatebuilder.component.css']
})
export class TemplatebuilderComponent implements OnInit, OnChanges {

  // ─── State ──────────────────────────────────────────────────────────────────

  masterTemplate: { sections?: TemplateSectionModel[] } = {};
  originalMasterTemplate: { sections?: TemplateSectionModel[] } = {};
  availableFields: TemplateField[] = [];
  selectedField: TemplateField | null = null;
  selectedSection = '';
  selectedSectionObject: TemplateSectionModel | null = null;
  selectedSubSectionObject: any = null;
  selectedSubSectionPath = '';

  allDropLists: string[] = ['available'];
  readonly subsectionTemplatesDropId = 'subsection-templates';
  subsectionDropTargets: string[] = [];
  subsectionDropDummy: any[] = [];
  isDraggingSubsectionTemplate = false;

  defaultFieldIds: string[] = [];
  authTemplates: any[] = [];
  selectedTemplateId = 0;
  newTemplateName = '';
  showTemplateNameError = false;
  displayedColumns: string[] = [];
  isFormVisible = false;
  formMode: 'add' | 'edit' | 'view' = 'add';
  selectedEntry: any = {};
  visibleColumns: string[] = [];
  editingRowId: string | null = null;
  dataSource = new MatTableDataSource<any>();
  authClass: any[] = [];
  selectedClassId = 0;
  unavailableSections: string[] = [];
  unavailableFieldsList: TemplateField[] = [];
  unavailableFieldsGrouped: { [sectionName: string]: TemplateField[] } = {};
  emptySectionCounter = 1;
  activeSections: { [key: string]: boolean } = {};
  activeSubSections: { [key: string]: boolean } = {};
  isFocused = false;
  isVisible = false;

  // ─── Unsaved changes guard ────────────────────────────────────────────────
  isDirty               = false;
  private _templateLoaded      = false;
  private _lastLoadedTemplateId = 0;

  /** Controls the navigation-guard dialog (leave / switch template / switch row). */
  showUnsavedDialog     = false;
  unsavedDialogContext: 'leave' | 'switchTemplate' | 'newTemplate' | 'switchRow' = 'leave';
  private _pendingNavAction: (() => void) | null = null;

  /** Controls the generic destructive-action confirmation dialog. */
  showConfirmDialog     = false;
  confirmDialogConfig   = {
    title:        '',
    message:      '',
    detail:       '',
    primaryLabel: 'Confirm',
    primaryClass: 'danger' as 'danger' | 'warning',
  };
  private _pendingConfirmAction: (() => void) | null = null;

  private readonly PROVIDER_SECTION_NAME = 'Provider Details';
  private providerNonButtonFieldsCache = new Map<string, TemplateField[]>();

  leftPanelGroups = {
    available: true,
    predefinedSubsections: true,
    unavailSections: true,
    unavailFields: true
  };

  aliasMapping: { [key: string]: string } = {
    authDetails: 'Auth Details',
    providerDetails: 'Provider Details',
    diagnosisDetails: 'Diagnosis Details',
    serviceDetails: 'Service Details',
    additionalDetails: 'Additional Details'
  };

  @Input() module = 'UM';
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @Output() menuCollapse = new EventEmitter<void>();

  // ─── Predefined subsections (kept verbatim per requirement) ─────────────────

  predefinedSubsections: PredefinedSubsectionTemplate[] = [
    {
      key: 'provider',
      title: 'Provider',
      subtitle: 'Search + First/Last/Phone/Fax',
      icon: 'local_hospital',
      subsection: {
        sectionName: 'Provider', subsectionKey: 'provider', order: 0,
        repeat: { enabled: true, min: 1, max: 10, defaultCount: 1, showControls: true, instanceLabel: 'Provider' },
        fields: [
          {
            id: 'providerSearch', label: 'Search Provider', displayName: 'Search Provider',
            type: 'search', order: 0, isEnabled: true, info: 'Search by NPI/Name/Phone',
            lookup: {
              enabled: true, entity: 'provider', datasource: 'providers',
              minChars: 2, debounceMs: 250, limit: 25,
              placeholder: 'Search Provider (Last/First Name / Org / NPI)',
              valueField: 'providerId', displayTemplate: '{{fullName}} (ID: {{providerId}})',
              fill: [
                { targetFieldId: 'providerFirstName',    sourcePath: 'firstName' },
                { targetFieldId: 'providerLastName',     sourcePath: 'lastName' },
                { targetFieldId: 'providerName',         sourcePath: 'fullName' },
                { targetFieldId: 'providerNPI',          sourcePath: 'npi' },
                { targetFieldId: 'providerTaxId',        sourcePath: 'taxId' },
                { targetFieldId: 'providerAddressLine1', sourcePath: 'addressLine1' },
                { targetFieldId: 'providerAddressLine2', sourcePath: 'addressLine2' },
                { targetFieldId: 'providerCity',         sourcePath: 'city' },
                { targetFieldId: 'providerState',        sourcePath: 'state' },
                { targetFieldId: 'providerZipCode',      sourcePath: 'zipCode' }
              ]
            }
          },
          { id: 'providerFirstName',    label: 'First Name',    displayName: 'First Name',    type: 'text', order: 1,  isEnabled: true },
          { id: 'providerLastName',     label: 'Last Name',     displayName: 'Last Name',     type: 'text', order: 2,  isEnabled: true },
          { id: 'providerName',         label: 'Provider Name', displayName: 'Provider Name', type: 'text', order: 3,  isEnabled: true },
          { id: 'providerNPI',          label: 'NPI',           displayName: 'NPI',           type: 'text', order: 4,  isEnabled: true },
          { id: 'providerTaxId',        label: 'Tax ID',        displayName: 'Tax ID',        type: 'text', order: 5,  isEnabled: true },
          { id: 'providerAddressLine1', label: 'Address Line1', displayName: 'Address Line1', type: 'text', order: 6,  isEnabled: true },
          { id: 'providerAddressLine2', label: 'Address Line2', displayName: 'Address Line2', type: 'text', order: 7,  isEnabled: true },
          { id: 'providerCity',         label: 'City',          displayName: 'City',          type: 'text', order: 8,  isEnabled: true },
          { id: 'providerState',        label: 'State',         displayName: 'State',         type: 'text', order: 9,  isEnabled: true },
          { id: 'providerZipCode',      label: 'ZipCode',       displayName: 'ZipCode',       type: 'text', order: 10, isEnabled: true }
        ]
      }
    },
    {
      key: 'member', title: 'Member', subtitle: 'Search + First/Last/Phone', icon: 'person',
      subsection: {
        sectionName: 'Member', subsectionKey: 'member', order: 0,
        repeat: { enabled: true, min: 1, max: 5, defaultCount: 1, showControls: true, instanceLabel: 'Member' },
        fields: [
          {
            id: 'memberSearch', label: 'Search Member', displayName: 'Search Member',
            type: 'search', order: 0, isEnabled: true, info: 'Search by Member ID/Name/Phone',
            lookup: {
              enabled: true, entity: 'member', minChars: 2, debounceMs: 250, limit: 25,
              placeholder: 'Search by Member ID / Name / Phone',
              valueField: 'memberdetailsid',
              displayTemplate: '{{memberid}} - {{firstname}} {{lastname}} ({{phone}})',
              fill: [
                { targetFieldId: 'memberFirstName', sourcePath: 'firstname' },
                { targetFieldId: 'memberLastName',  sourcePath: 'lastname' },
                { targetFieldId: 'memberPhone',     sourcePath: 'phone' },
                { targetFieldId: 'memberId',        sourcePath: 'memberid' }
              ]
            }
          },
          { id: 'memberFirstName', label: 'First Name', displayName: 'First Name', type: 'text', order: 1, isEnabled: true },
          { id: 'memberLastName',  label: 'Last Name',  displayName: 'Last Name',  type: 'text', order: 2, isEnabled: true },
          { id: 'memberPhone',     label: 'Phone',      displayName: 'Phone',      type: 'text', order: 3, isEnabled: true },
          { id: 'memberId',        label: 'Member ID',  displayName: 'Member ID',  type: 'text', order: 4, isEnabled: true }
        ]
      }
    },
    {
      key: 'icd', title: 'ICD', subtitle: 'ICD Code (search) + Description', icon: 'assignment',
      subsection: {
        sectionName: 'ICD', subsectionKey: 'icd', order: 0,
        repeat: { enabled: true, min: 1, max: 30, defaultCount: 1, showControls: true, instanceLabel: 'ICD' },
        fields: [
          {
            id: 'icdCode', label: 'ICD Code', displayName: 'ICD Code',
            type: 'search', order: 1, isEnabled: true, info: 'Search ICD code/description',
            lookup: {
              enabled: true, entity: 'icd', minChars: 2, debounceMs: 250, limit: 25,
              placeholder: 'Search ICD Code or Description', valueField: 'code',
              displayTemplate: '{{code}} - {{codeDesc}}',
              fill: [{ targetFieldId: 'icdDescription', sourcePath: 'codeDesc' }]
            }
          },
          { id: 'icdDescription', label: 'Description', displayName: 'Description', type: 'text', order: 2, isEnabled: true }
        ]
      }
    },
    {
      key: 'procedure', title: 'Procedure', subtitle: 'CPT Code (search) + Description', icon: 'medical_services',
      subsection: {
        sectionName: 'Procedure', subsectionKey: 'procedure', order: 0,
        repeat: { enabled: true, min: 1, max: 30, defaultCount: 1, showControls: true, instanceLabel: 'Procedure' },
        fields: [
          {
            id: 'procedureCode', label: 'Procedure Code', displayName: 'Procedure Code',
            type: 'search', order: 1, isEnabled: true, info: 'Search CPT/Procedure code',
            lookup: {
              enabled: true, entity: 'procedure', minChars: 2, debounceMs: 250, limit: 25,
              placeholder: 'Search Procedure Code or Description', valueField: 'code',
              displayTemplate: '{{code}} - {{codeDesc}}',
              fill: [{ targetFieldId: 'procedureDescription', sourcePath: 'codeDesc' }]
            }
          },
          { id: 'procedureDescription', label: 'Description', displayName: 'Description', type: 'text',           order: 2, isEnabled: true },
          { id: 'procedureQuantity',    label: 'Quantity',    displayName: 'Quantity',    type: 'number',         order: 3, isEnabled: true },
          { id: 'procedureFromDate',    label: 'From Date',   displayName: 'From Date',   type: 'datetime-local', order: 4, isEnabled: true },
          { id: 'procedureToDate',      label: 'To Date',     displayName: 'To Date',     type: 'datetime-local', order: 5, isEnabled: true }
        ]
      }
    },
    {
      key: 'medication', title: 'Medication', subtitle: 'Drug search + Dosage/Frequency', icon: 'medication',
      subsection: {
        sectionName: 'Medication', subsectionKey: 'medication', order: 0,
        repeat: { enabled: true, min: 1, max: 20, defaultCount: 1, showControls: true, instanceLabel: 'Medication' },
        fields: [
          {
            id: 'medicationSearch', label: 'Search Medication', displayName: 'Search Medication',
            type: 'search', order: 0, isEnabled: true, info: 'Search by drug name/NDC',
            lookup: {
              enabled: true, entity: 'medication', minChars: 2, debounceMs: 250, limit: 25,
              placeholder: 'Search Medication (Name / NDC)', valueField: 'medicationId',
              displayTemplate: '{{drugName}} (NDC: {{ndc}})',
              fill: [
                { targetFieldId: 'medicationName', sourcePath: 'drugName' },
                { targetFieldId: 'medicationNDC',  sourcePath: 'ndc' }
              ]
            }
          },
          { id: 'medicationName',      label: 'Medication Name', displayName: 'Medication Name', type: 'text',           order: 1, isEnabled: true },
          { id: 'medicationNDC',       label: 'NDC',             displayName: 'NDC',             type: 'text',           order: 2, isEnabled: true },
          { id: 'medicationDosage',    label: 'Dosage',          displayName: 'Dosage',          type: 'text',           order: 3, isEnabled: true },
          { id: 'medicationFrequency', label: 'Frequency',       displayName: 'Frequency',       type: 'text',           order: 4, isEnabled: true },
          { id: 'medicationQuantity',  label: 'Quantity',        displayName: 'Quantity',        type: 'number',         order: 5, isEnabled: true },
          { id: 'medicationStartDate', label: 'Start Date',      displayName: 'Start Date',      type: 'datetime-local', order: 6, isEnabled: true },
          { id: 'medicationEndDate',   label: 'End Date',        displayName: 'End Date',        type: 'datetime-local', order: 7, isEnabled: true }
        ]
      }
    },
    {
      key: 'staff', title: 'Staff', subtitle: 'Staff search + Role/Department', icon: 'badge',
      subsection: {
        sectionName: 'Staff', subsectionKey: 'staff', order: 0,
        repeat: { enabled: true, min: 1, max: 10, defaultCount: 1, showControls: true, instanceLabel: 'Staff' },
        fields: [
          {
            id: 'staffSearch', label: 'Search Staff', displayName: 'Search Staff',
            type: 'search', order: 0, isEnabled: true, info: 'Search by staff name/ID',
            lookup: {
              enabled: true, entity: 'staff', minChars: 2, debounceMs: 250, limit: 25,
              placeholder: 'Search Staff (Name / ID)', valueField: 'staffId',
              displayTemplate: '{{fullName}} ({{role}})',
              fill: [
                { targetFieldId: 'staffFirstName', sourcePath: 'firstName' },
                { targetFieldId: 'staffLastName',  sourcePath: 'lastName' },
                { targetFieldId: 'staffRole',      sourcePath: 'role' }
              ]
            }
          },
          { id: 'staffFirstName',  label: 'First Name', displayName: 'First Name', type: 'text', order: 1, isEnabled: true },
          { id: 'staffLastName',   label: 'Last Name',  displayName: 'Last Name',  type: 'text', order: 2, isEnabled: true },
          { id: 'staffRole',       label: 'Role',       displayName: 'Role',       type: 'text', order: 3, isEnabled: true },
          { id: 'staffDepartment', label: 'Department', displayName: 'Department', type: 'text', order: 4, isEnabled: true }
        ]
      }
    },
    {
      key: 'authorization', title: 'Authorization', subtitle: 'Auth Number + Dates/Status', icon: 'verified',
      subsection: {
        sectionName: 'Authorization', subsectionKey: 'authorization', order: 0,
        repeat: { enabled: true, min: 1, max: 10, defaultCount: 1, showControls: true, instanceLabel: 'Authorization' },
        fields: [
          {
            id: 'authSearch', label: 'Search Authorization', displayName: 'Search Authorization',
            type: 'search', order: 0, isEnabled: true, info: 'Search by auth number',
            lookup: {
              enabled: true, entity: 'authorization', minChars: 2, debounceMs: 250, limit: 25,
              placeholder: 'Search Authorization Number', valueField: 'authId',
              displayTemplate: '{{authNumber}} - {{status}}',
              fill: [
                { targetFieldId: 'authNumber',   sourcePath: 'authNumber' },
                { targetFieldId: 'authStatus',   sourcePath: 'status' },
                { targetFieldId: 'authFromDate', sourcePath: 'fromDate' },
                { targetFieldId: 'authToDate',   sourcePath: 'toDate' }
              ]
            }
          },
          { id: 'authNumber',   label: 'Auth Number',  displayName: 'Auth Number',  type: 'text',           order: 1, isEnabled: true },
          { id: 'authStatus',   label: 'Status',       displayName: 'Status',       type: 'select',         order: 2, isEnabled: true },
          { id: 'authFromDate', label: 'From Date',    displayName: 'From Date',    type: 'datetime-local', order: 3, isEnabled: true },
          { id: 'authToDate',   label: 'To Date',      displayName: 'To Date',      type: 'datetime-local', order: 4, isEnabled: true },
          { id: 'denialReason', label: 'Denial Reason',displayName: 'Denial Reason',type: 'text',           order: 5, isEnabled: true }
        ]
      }
    },
    {
      key: 'claim', title: 'Claim', subtitle: 'Search + Claim Number/Dates', icon: 'receipt_long',
      subsection: {
        sectionName: 'Claim', subsectionKey: 'claim', order: 0,
        repeat: { enabled: true, min: 1, max: 10, defaultCount: 1, showControls: true, instanceLabel: 'Claim' },
        fields: [
          {
            id: 'claimSearch', label: 'Search Claims', displayName: 'Search Claims',
            type: 'search', order: 0, isEnabled: true, info: 'Search claims by claimnumber/fromdate/todate/providername',
            lookup: {
              enabled: true, entity: 'claim', minChars: 2, debounceMs: 250, limit: 25,
              placeholder: 'Search Claim (Claim Number / From Date / To Date / Provider Name)',
              valueField: 'claimNumber', displayTemplate: '{{claimNumber}}',
              fill: [
                { targetFieldId: 'claimNumber',     sourcePath: 'claimNumber' },
                { targetFieldId: 'providerName',    sourcePath: 'providerName' },
                { targetFieldId: 'visitType',       sourcePath: 'visitTypeId' },
                { targetFieldId: 'reasonForVisit',  sourcePath: 'reasonForVisit' },
                { targetFieldId: 'serviceFromDate', sourcePath: 'dosFrom' },
                { targetFieldId: 'serviceToDate',   sourcePath: 'dosTo' },
                { targetFieldId: 'billed',          sourcePath: 'billed' },
                { targetFieldId: 'allowed',         sourcePath: 'allowedAmount' },
                { targetFieldId: 'copay',           sourcePath: 'copayAmount' },
                { targetFieldId: 'paid',            sourcePath: 'paid' }
              ]
            }
          },
          { id: 'claimNumber',       label: 'Claim Number',       displayName: 'Claim Number',       type: 'text',           order: 1,  isEnabled: true },
          { id: 'providerName',      label: 'Provider Name',      displayName: 'Provider Name',      type: 'text',           order: 2,  isEnabled: true },
          { id: 'claimProviderType', label: 'Claim Provider Type',displayName: 'Claim Provider Type',type: 'text',           order: 3,  isEnabled: true },
          { id: 'visitType',         label: 'Visit Type',         displayName: 'Visit Type',         type: 'text',           order: 4,  isEnabled: true },
          { id: 'reasonForVisit',    label: 'Reason For Visit',   displayName: 'Reason For Visit',   type: 'text',           order: 5,  isEnabled: true },
          { id: 'serviceFromDate',   label: 'Service From Date',  displayName: 'Service From Date',  type: 'datetime-local', order: 11, isEnabled: true },
          { id: 'serviceToDate',     label: 'Service To Date',    displayName: 'Service To Date',    type: 'datetime-local', order: 12, isEnabled: true },
          { id: 'billed',            label: 'Billed',             displayName: 'Billed',             type: 'text',           order: 14, isEnabled: true },
          { id: 'allowed',           label: 'Allowed',            displayName: 'Allowed',            type: 'text',           order: 15, isEnabled: true },
          { id: 'copay',             label: 'Copay',              displayName: 'Copay',              type: 'text',           order: 16, isEnabled: true },
          { id: 'paid',              label: 'Paid',               displayName: 'Paid',               type: 'text',           order: 17, isEnabled: true }
        ]
      }
    }
  ];

  // ─── Constructor ─────────────────────────────────────────────────────────────

  constructor(
    private templateService: TemplateService,
    private authService: AuthService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private crudService: CrudService,
    private cdr: ChangeDetectorRef
  ) {}

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.setupColumns();
    this.loadAuthClass();
    if (this.module === 'AG') this.loadAuthTemplates();
    this.validatePredefinedSubsections();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['module']) this.setupColumns();
  }

  // ─── Column setup ─────────────────────────────────────────────────────────

  private setupColumns(): void {
    const cols = ['Id', 'TemplateName'];
    if (this.module === 'UM') cols.push('authClass');
    cols.push('CreatedBy', 'CreatedOn', 'actions');
    this.displayedColumns = cols;
  }

  updateDisplayedColumns(): void {
    const optional = ['updatedBy', 'updatedOn', 'deletedBy', 'deletedOn'];
    this.setupColumns();
    this.displayedColumns.push(...this.visibleColumns.filter(c => optional.includes(c)));
  }

  // ─── Normalization ────────────────────────────────────────────────────────

  private normalizeTemplateStructure(template?: { sections?: any[] }): void {
    const tmpl = template ?? this.masterTemplate;
    if (!tmpl?.sections || !Array.isArray(tmpl.sections)) return;

    const normalizeNode = (node: any, parentPath?: string): void => {
      if (!node) return;
      if (!Array.isArray(node.fields)) node.fields = [];

      const thisPath = parentPath ? `${parentPath}.${node.sectionName}` : node.sectionName;
      (node.fields as any[]).forEach((f: any) => {
        if (f && typeof f === 'object') f.sectionName = f.sectionName ?? thisPath;
      });

      const subs = node.subsections;
      if (Array.isArray(subs)) {
        const map: { [key: string]: any } = {};
        subs.forEach((s: any, idx: number) => {
          const key = (s?.subsectionKey || s?.sectionName || `Subsection${idx}`).toString();
          map[key] = s;
        });
        node.subsections = map;
      }

      if (node.subsections && typeof node.subsections === 'object' && !Array.isArray(node.subsections)) {
        Object.keys(node.subsections).forEach(key => {
          const child = node.subsections[key];
          if (child && typeof child === 'object') {
            child.subsectionKey = child.subsectionKey ?? key;
            child.sectionName   = child.sectionName   ?? key;
            normalizeNode(child, thisPath);
          }
        });
      } else {
        delete node.subsections;
      }
    };

    tmpl.sections.forEach((s: any) => { if (s?.sectionName) normalizeNode(s); });
  }

  private rebuildAllDropLists(): void {
    const all        = new Set<string>(['available', 'unavailable']);
    const subTargets = new Set<string>();

    if (this.masterTemplate?.sections) {
      const walk = (container: any, path: string): void => {
        if (!container || !path) return;
        all.add(path);
        subTargets.add(this.getSubsectionZoneId(path));
        const subs = container.subsections;
        if (subs && typeof subs === 'object' && !Array.isArray(subs)) {
          Object.keys(subs).forEach(k => walk(subs[k], `${path}.${k}`));
        }
      };
      this.masterTemplate.sections.forEach((s: any) => { if (s?.sectionName) walk(s, s.sectionName); });
    }

    this.allDropLists          = Array.from(all);
    this.subsectionDropTargets = Array.from(subTargets);
  }

  // ─── Path helpers ─────────────────────────────────────────────────────────

  private safeId(val: string): string {
    return (val ?? '').toString().trim().toLowerCase()
      .replace(/\s+/g, '-').replace(/[^a-z0-9\-_]/g, '');
  }

  getSubsectionZoneId(n: string): string { return `subsection-zone-${this.safeId(n)}`; }
  getSubKey(s: any): string { return (s?.subsectionKey || s?.sectionName || '').toString(); }
  getSubPath(parentPath: string, sub: any): string {
    return parentPath ? `${parentPath}.${this.getSubKey(sub)}` : this.getSubKey(sub);
  }

  private resolveContainerByPath(path: string): any | null {
    if (!path || !this.masterTemplate?.sections) return null;
    const parts = path.split('.').filter(Boolean);
    if (!parts.length) return null;
    const main = this.masterTemplate.sections.find((s: any) => s.sectionName === parts[0]);
    if (!main) return null;
    let container: any = main;
    for (let i = 1; i < parts.length; i++) {
      if (!container?.subsections?.[parts[i]]) return null;
      container = container.subsections[parts[i]];
    }
    return container;
  }

  private resolveFieldsArray(path: string): TemplateField[] | null {
    return this.resolveContainerByPath(path)?.fields ?? null;
  }

  // ─── Field type helpers ──────────────────────────────────────────────────

  getInputType(type: string): string {
    switch (type) {
      case 'datetime-local': return 'datetime-local';
      case 'number':         return 'number';
      case 'checkbox':       return 'checkbox';
      case 'radio':
      case 'multicheck':     return 'checkbox';
      default:               return 'text';
    }
  }

  getFieldIcon(type: string): string {
    const map: Record<string, string> = {
      text:            'text_fields',
      number:          'tag',
      'datetime-local':'calendar_today',
      select:          'arrow_drop_down_circle',
      textarea:        'notes',
      search:          'manage_search',
      button:          'smart_button',
      checkbox:        'check_box',
      radio:           'radio_button_checked',
      multicheck:      'checklist'
    };
    return map[type] || 'input';
  }

  isArray(v: any): v is TemplateField[] { return Array.isArray(v); }
  objectKeys(obj: any): string[] { return obj ? Object.keys(obj) : []; }
  originalOrderComparator(_a: KeyValue<string, any>, _b: KeyValue<string, any>): number { return 0; }

  // ─── Subsection type helpers ──────────────────────────────────────────────
  //  Used by the canvas to render context-aware shells that match authdetails.

  /**
   * Returns a stable type key for a subsection based on its subsectionKey / baseKey.
   * Handles suffixed duplicates like 'icd_2', 'provider_3' by splitting on '_'.
   */
  getSubsectionType(sub: any): string {
    const raw = (sub?.subsectionKey || sub?.baseKey || '').toString().toLowerCase();
    // Strip numeric suffix so 'provider_2' → 'provider'
    const base = raw.replace(/_\d+$/, '');
    const typeMap: Record<string, string> = {
      icd:            'icd',
      provider:       'provider',
      procedure:      'procedure',
      medication:     'medication',
      transportation: 'transportation',
      member:         'member',
      staff:          'staff',
      authorization:  'authorization',
      claim:          'claim',
    };
    return typeMap[base] ?? 'default';
  }

  /** Human-readable label shown as a badge on the subsection header. */
  getSubsectionTypeLabel(sub: any): string {
    const labels: Record<string, string> = {
      icd:            'ICD / Diagnosis',
      provider:       'Provider Card',
      procedure:      'Service Code',
      medication:     'Medication',
      transportation: 'Transportation',
      member:         'Member',
      staff:          'Staff',
      authorization:  'Authorization',
      claim:          'Claim',
    };
    return labels[this.getSubsectionType(sub)] ?? '';
  }

  /** Material icon for the subsection header. */
  getSubsectionIcon(sub: any): string {
    const icons: Record<string, string> = {
      icd:            'assignment',
      provider:       'local_hospital',
      procedure:      'medical_services',
      medication:     'medication',
      transportation: 'directions_car',
      member:         'person',
      staff:          'badge',
      authorization:  'verified',
      claim:          'receipt_long',
    };
    return icons[this.getSubsectionType(sub)] ?? 'view_stream';
  }

  // ─── Left panel ──────────────────────────────────────────────────────────

  toggleLeftPanelGroup(key: keyof typeof this.leftPanelGroups): void {
    this.leftPanelGroups[key] = !this.leftPanelGroups[key];
  }

  get totalUnavailableFieldCount(): number {
    return Object.values(this.unavailableFieldsGrouped).reduce((s, a) => s + (a?.length || 0), 0);
  }

  getSectionFieldCount(section: TemplateSectionModel): number {
    let count = 0;
    const countFields = (fields?: TemplateField[]) => {
      if (!Array.isArray(fields)) return;
      fields.forEach(f => count += (f.layout === 'row' && f.fields?.length) ? f.fields.length : 1);
    };
    countFields(section.fields);
    if (section.subsections) Object.values(section.subsections).forEach(s => countFields(s.fields));
    return count;
  }

  // ─── Data loading ────────────────────────────────────────────────────────

  loadAuthTemplates(): void {
    this.authService.getTemplates(this.module, this.selectedClassId).subscribe({
      next: (data: any[]) => { this.authTemplates = [{ Id: 0, TemplateName: 'Select Auth Type' }, ...data]; },
      error: ()           => { this.authTemplates = [{ Id: 0, TemplateName: 'Select Auth Type' }]; }
    });
  }

  loadAuthClass(): void {
    this.crudService.getData('um', 'authclass').subscribe({
      next: (res: any[]) => {
        this.authClass = [{ id: 0, authClass: 'Select Auth Case' }, ...res];
        console.log('Auth classes loaded:', this.authClass);
        this.loadData();
      },
      error: () => { this.authClass = [{ id: 0, authClass: 'Select Auth Class' }]; }
    });
  }

  getAuthClassName(authclassid: number | string): string {
    const found = this.authClass.find(c => Number(c.id) === Number(authclassid));
    return found ? found.authClass : '—';
  }

  loadData(): void {
    this.authService.getTemplates(this.module, this.selectedClassId).subscribe({
      next: (data: any[]) => {
        this.dataSource.data = data;
        console.log('Data loaded:', data);
        this.dataSource.paginator = this.paginator;
        this.dataSource.sort = this.sort;
      },
      error: (err: any) => console.error('Error loading data:', err)
    });
  }

  onAuthClassChange(): void {
    this.selectedTemplateId = 0;
    this.loadAuthTemplates();
  }

  applyFilter(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.dataSource.filter = val.trim().toLowerCase();
    if (this.dataSource.paginator) this.dataSource.paginator.firstPage();
  }

  // ─── Form management ─────────────────────────────────────────────────────

  /** Public entry point — checks dirty state before opening. */
  requestOpenForm(mode: 'add' | 'edit', element: any = null): void {
    const ctx = mode === 'edit' ? 'switchRow' : 'newTemplate';
    this.guardedNavigate(ctx, () => this.openForm(mode, element));
  }

  openForm(mode: 'add' | 'edit' | 'view', element: any = null): void {
    this.formMode = mode;
    this.isVisible = true;
    this.menuCollapse.emit();

    if (mode === 'edit' && element) {
      this.newTemplateName    = element.templateName;
      this.selectedTemplateId = element.id;
      this.selectedClassId    = element.authclassid;

      // Reset dirty state before loading a new template
      this.isDirty          = false;
      this._templateLoaded  = false;
      // Reset ALL canvas state from any previous Add/Edit session
      this.masterTemplate           = {};
      this.originalMasterTemplate   = {};
      this.activeSections           = {};
      this.activeSubSections        = {};
      this.selectedField            = null;
      this.selectedSubSectionObject = null;
      this.selectedSubSectionPath   = '';
      this.selectedSectionObject    = null;
      this.unavailableSections      = [];
      this.unavailableFieldsList    = [];
      this.unavailableFieldsGrouped = {};
      this.providerNonButtonFieldsCache.clear();

      // Load template list (clone dropdown) AND canvas content
      this.authService.getTemplates(this.module, this.selectedClassId).subscribe({
        next: (templates: any[]) => { this.authTemplates = templates; },
        error: ()                 => { this.authTemplates = []; }
      });
      this.onTemplateChange();   // loads the actual JSON into the canvas

      this.selectedEntry = { ...element };
    } else if (mode === 'add') {
      this.newTemplateName          = '';
      this.selectedTemplateId       = 0;
      this.selectedClassId          = 0;
      this.isDirty          = false;
      this._templateLoaded  = false;
      this.masterTemplate           = {};
      this.originalMasterTemplate   = {};
      this.activeSections           = {};
      this.activeSubSections        = {};
      this.selectedField            = null;
      this.selectedSubSectionObject = null;
      this.selectedSubSectionPath   = '';
      this.selectedSectionObject    = null;
      this.unavailableSections      = [];
      this.unavailableFieldsList    = [];
      this.unavailableFieldsGrouped = {};
      this.providerNonButtonFieldsCache.clear();
      this.selectedEntry = {};
    } else if (mode === 'view') {
      this.selectedEntry = { ...element };
    }
  }

  cancel(): void {
    this.guardedNavigate('leave', () => {
      this.isVisible     = false;
      this._templateLoaded = false;
      this.isDirty       = false;
    });
  }
  confirmDelete(_element: any = null): void {}
  onFocus():  void { this.isFocused = true;  }
  onBlur():   void { this.isFocused = false; }
  onTemplateNameInput(): void { if (this.newTemplateName?.trim()) this.showTemplateNameError = false; if (this._templateLoaded) this.isDirty = true; }

  // ─── Template loading ─────────────────────────────────────────────────────

  /** Called from the Clone Template dropdown — guards unsaved changes first. */
  onCloneTemplateChange(): void {
    this.guardedNavigate('switchTemplate', () => this.onTemplateChange());
  }

  onTemplateChange(): void {
    if (!this.selectedTemplateId || this.selectedTemplateId <= 0) {
      this.masterTemplate = {};
      return;
    }

    const originalId = this.module === 'UM' ? 2 : 1;

    forkJoin({
      current:  this.authService.getTemplate(this.module, this.selectedTemplateId).pipe(catchError(() => of([]))),
      original: this.authService.getTemplate(this.module, originalId).pipe(catchError(() => of([])))
    }).subscribe(({ current, original }) => {

      try {
        if (current?.[0]?.jsonContent) {
          this.masterTemplate = JSON.parse(current[0].jsonContent);
          this.normalizeTemplateStructure();
          this.rebuildAllDropLists();
          this.providerNonButtonFieldsCache.clear();

          if (Array.isArray(this.masterTemplate.sections)) {
            this.masterTemplate.sections.sort((a, b) => (a.order || 0) - (b.order || 0));
            this.masterTemplate.sections.forEach(sec => {
              this.activeSections[sec.sectionName] = true;
              if (Array.isArray(sec.fields)) {
                sec.fields.sort((a, b) => (a.order || 0) - (b.order || 0));
                sec.fields.forEach(f => { f.sectionName = sec.sectionName; });
              }
            });
          }
        }
      } catch (e) {
        console.error('Error parsing current template:', e);
        this.masterTemplate = {};
      }

      try {
        if (original?.[0]?.jsonContent) {
          this.originalMasterTemplate = JSON.parse(original[0].jsonContent);
          this.normalizeTemplateStructure(this.originalMasterTemplate as any);
          if (Array.isArray(this.originalMasterTemplate.sections)) {
            this.originalMasterTemplate.sections.sort((a, b) => (a.order || 0) - (b.order || 0));
          }
        }
      } catch (e) {
        console.error('Error parsing original template:', e);
        this.originalMasterTemplate = {};
      }

      if (this.originalMasterTemplate.sections && this.masterTemplate.sections) {
        this.compareWithMasterTemplate(this.originalMasterTemplate.sections, this.masterTemplate.sections);
      }

      this.availableFields = [
        { label: 'Text Field',  displayName: 'Text Field',  type: 'text',           id: 'newText' },
        { label: 'Number',      displayName: 'Number',      type: 'number',         id: 'newNumber' },
        { label: 'Date / Time', displayName: 'Date / Time', type: 'datetime-local', id: 'newDate' },
        { label: 'Drop Down',   displayName: 'Drop Down',   type: 'select',         id: 'newSelect',     options: [] },
        { label: 'Multi-Check', displayName: 'Multi-Check', type: 'multicheck',     id: 'newMultiCheck', options: [] },
        { label: 'Radio Group', displayName: 'Radio Group', type: 'radio',          id: 'newRadio',      options: [] },
        { label: 'Checkbox',    displayName: 'Checkbox',    type: 'checkbox',       id: 'newCheckbox' },
        { label: 'Text Area',   displayName: 'Text Area',   type: 'textarea',       id: 'newTextarea' }
      ];
      this.defaultFieldIds = this.availableFields.map(f => f.id);

      // Run change detection BEFORE marking loaded so the detection call
      // itself cannot trigger the dirty flag (forceAngularChangeDetection
      // only sets isDirty when _templateLoaded is already true).
      this.forceAngularChangeDetection();

      // Mark template as cleanly loaded — must come AFTER forceAngularChangeDetection
      this._lastLoadedTemplateId = this.selectedTemplateId;
      this._templateLoaded       = true;
      this.isDirty               = false;
    });
  }

  // ─── Template comparison ──────────────────────────────────────────────────

  compareWithMasterTemplate(master: TemplateSectionModel[], selected: TemplateSectionModel[]): void {
    this.unavailableSections     = [];
    this.unavailableFieldsList   = [];
    this.unavailableFieldsGrouped = {};

    const selectedMap = new Map<string, Set<string>>();
    const buildMap = (container: any, path: string): void => {
      const ids = new Set<string>();
      (container.fields || []).forEach((f: any) => { if (f?.id) ids.add(f.id); });
      selectedMap.set(path, ids);
      const subs = container.subsections;
      if (subs && typeof subs === 'object') Object.keys(subs).forEach(k => buildMap(subs[k], `${path}.${k}`));
    };
    selected.forEach(s => buildMap(s, s.sectionName));

    const processContainer = (container: any, path: string): void => {
      if (!selectedMap.has(path)) {
        if (!path.includes('.')) this.unavailableSections.push(path);
        return;
      }
      const present = selectedMap.get(path)!;
      (container.fields || []).forEach((f: any) => {
        if (f?.id && !present.has(f.id)) {
          const displayName = f.displayName || f.label || f.id;
          const entry: TemplateField = { ...f, sectionName: path, displayName, label: displayName };
          this.unavailableFieldsList.push(entry);
          if (!this.unavailableFieldsGrouped[path]) this.unavailableFieldsGrouped[path] = [];
          this.unavailableFieldsGrouped[path].push(entry);
        }
      });
      const subs = container.subsections;
      if (subs && typeof subs === 'object') Object.keys(subs).forEach(k => processContainer(subs[k], `${path}.${k}`));
    };

    master.forEach(s => processContainer(s, s.sectionName));
  }

  // ─── Section management ───────────────────────────────────────────────────

  selectSection(section: TemplateSectionModel): void { this.selectedSectionObject = section; }
  toggleSection(name: string): void { this.activeSections[name] = !this.activeSections[name]; }
  toggleSubSection(key: string): void { this.activeSubSections[key] = !this.activeSubSections[key]; }

  getSortedSubsections(subs: { [k: string]: TemplateSectionModel }): TemplateSectionModel[] {
    return Object.values(subs).sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  moveMainSection(sectionName: string, direction: 'up' | 'down', event: Event): void {
    event.stopPropagation();
    if (!this.masterTemplate?.sections?.length) return;

    this.masterTemplate.sections.forEach((s: any, i: number) => { if (s?.order == null) s.order = (i + 1) * 10; });
    const sorted = [...this.masterTemplate.sections].sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
    const idx    = sorted.findIndex((s: any) => s.sectionName === sectionName);
    if (idx < 0) return;
    const swapWith = direction === 'up' ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= sorted.length) return;

    [sorted[idx].order, sorted[swapWith].order] = [sorted[swapWith].order, sorted[idx].order];
    this.masterTemplate.sections = sorted;
    this.rebuildAllDropLists();
    this.forceAngularChangeDetection();
  }

  moveSubSectionByPath(parentPath: string, subKey: string, direction: 'up' | 'down', event: Event): void {
    event.stopPropagation();
    const parent = this.resolveContainerByPath(parentPath);
    if (!parent?.subsections) return;

    const sorted = Object.keys(parent.subsections)
      .map(k => ({ key: k, order: Number(parent.subsections[k]?.order ?? 0) }))
      .sort((a, b) => a.order - b.order).map(x => x.key);

    const idx = sorted.indexOf(subKey);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const a = parent.subsections[sorted[idx]];
    const b = parent.subsections[sorted[swapIdx]];
    [a.order, b.order] = [b.order ?? 0, a.order ?? 0];
    this.forceAngularChangeDetection();
  }

  deleteAccordionSection(sectionName: string, event: Event): void {
    event.stopPropagation();
    this.showConfirm({
      title:        'Remove Section',
      message:      `Remove "${sectionName}" from this template?`,
      detail:       'The section will be moved to the Section Templates panel and can be restored at any time.',
      primaryLabel: 'Remove Section',
    }, () => {
      if (Array.isArray(this.masterTemplate.sections)) {
        const index = this.masterTemplate.sections.findIndex(s => s.sectionName === sectionName);
        if (index > -1) {
          this.unavailableSections.push(this.masterTemplate.sections[index].sectionName);
          this.masterTemplate.sections.splice(index, 1);
        }
      }
      delete this.activeSections[sectionName];
      this.rebuildAllDropLists();
      this.forceAngularChangeDetection();
    });
  }

  deleteSubSectionByPath(parentPath: string, subKey: string, event: Event): void {
    event.stopPropagation();
    this.showConfirm({
      title:        'Remove Subsection',
      message:      'Remove this subsection and all its configured fields?',
      detail:       'Fields inside this subsection will not be recoverable from the panel. You may need to re-add them manually.',
      primaryLabel: 'Remove Subsection',
    }, () => {
      const parent = this.resolveContainerByPath(parentPath);
      if (!parent?.subsections?.[subKey]) return;
      delete parent.subsections[subKey];
      this.normalizeTemplateStructure();
      this.rebuildAllDropLists();
      this.forceAngularChangeDetection();
    });
  }

  updateSection(updatedSection: TemplateSectionModel): void {
    if (!this.masterTemplate.sections) return;
    const idx = this.masterTemplate.sections.findIndex(s => s.sectionName === this.selectedSectionObject?.sectionName);
    if (idx !== -1) this.masterTemplate.sections[idx].sectionName = updatedSection.sectionName;
  }

  onSectionSettings(_section: TemplateSectionModel, event: Event): void { event.stopPropagation(); }
  onAddFieldClicked(section: TemplateSectionModel, event: Event): void {
    event.stopPropagation();
    this.selectSection(section);
  }

  // ─── Subsection selection ─────────────────────────────────────────────────

  selectSubSectionByPath(subPath: string, subSection: any, event?: Event): void {
    event?.stopPropagation();
    if (this.selectedField) this.selectedField.isActive = false;
    this.selectedField             = null;
    this.selectedSubSectionObject  = subSection;
    this.selectedSubSectionPath    = subPath;
    const mainName = subPath?.split('.')?.[0];
    this.selectedSectionObject = this.masterTemplate.sections?.find((s: any) => s.sectionName === mainName) ?? null;
  }

  selectSubSection(section: any, subSection: any, event?: Event): void {
    event?.stopPropagation();
    if (this.selectedField) this.selectedField.isActive = false;
    this.selectedField            = null;
    this.selectedSubSectionObject = subSection;
    this.selectedSubSectionPath   = `${section.sectionName}.${subSection.subsectionKey || subSection.sectionName}`;
    this.selectedSectionObject    = section;
  }

  saveSelectedSubSection(): void {
    if (!this.selectedSubSectionObject || !this.selectedSubSectionPath) return;
    const container = this.resolveContainerByPath(this.selectedSubSectionPath);
    if (container) Object.assign(container, this.selectedSubSectionObject);
  }

  // ─── Repeat controls ──────────────────────────────────────────────────────

  incRepeatDefaultCount(parentPath: string, subKey: string, event: Event): void {
    event.stopPropagation();
    const sub = this.resolveContainerByPath(parentPath)?.subsections?.[subKey];
    if (!sub) return;
    sub.repeat = sub.repeat ?? {};
    sub.repeat.defaultCount = Math.min(Number(sub.repeat.defaultCount ?? 1) + 1, Number(sub.repeat.max ?? 99));
    this.forceAngularChangeDetection();
  }

  decRepeatDefaultCount(parentPath: string, subKey: string, event: Event): void {
    event.stopPropagation();
    const sub = this.resolveContainerByPath(parentPath)?.subsections?.[subKey];
    if (!sub) return;
    sub.repeat = sub.repeat ?? {};
    sub.repeat.defaultCount = Math.max(Number(sub.repeat.defaultCount ?? 1) - 1, Number(sub.repeat.min ?? 1));
    this.forceAngularChangeDetection();
  }

  getRepeatDefaultCount(sub: any): number { return Number(sub?.repeat?.defaultCount ?? 1); }
  getRepeatMin(sub: any): number          { return Number(sub?.repeat?.min          ?? 1); }

  // ─── Field selection & update ─────────────────────────────────────────────

  selectField(field: TemplateField, section: string): void {
    if (section === 'available') return;
    if (this.selectedField && this.selectedField.id !== field.id) this.selectedField.isActive = false;
    this.selectedField = null;
    this.selectedSection = '';
    this.selectedSectionObject = null;
    this.selectedSubSectionObject = null;
    this.selectedSubSectionPath   = '';
    if (!field.displayName) field.displayName = field.label;
    this.selectedField   = field;
    this.selectedSection = section;
    field.isActive = true;
    this.forceAngularChangeDetection();
  }

  updateField(updatedField: TemplateField | TemplateSectionModel): void {
    if (!('id' in (updatedField as any))) {
      const upd = updatedField as TemplateSectionModel;

      if (this.selectedSubSectionObject && this.selectedSubSectionPath) {
        Object.assign(this.selectedSubSectionObject, upd);
        this.saveSelectedSubSection();
        this.normalizeTemplateStructure();
        this.rebuildAllDropLists();
        this.forceAngularChangeDetection();
        return;
      }

      if (this.selectedSectionObject) {
        const oldName  = this.selectedSectionObject.sectionName;
        const sections = this.masterTemplate.sections!;
        const idx      = sections.findIndex(s => s.sectionName === oldName);
        if (idx > -1) {
          const current = sections[idx];
          const merged: TemplateSectionModel = {
            ...current, ...upd,
            fields:      upd.fields      ?? current.fields,
            subsections: (upd as any).subsections ?? (current as any).subsections
          } as any;
          sections[idx] = merged;
          this.selectedSectionObject = merged;
          if (typeof upd.sectionName === 'string' && this.selectedSection === oldName) {
            this.selectedSection = upd.sectionName;
          }
        }
      }
      this.normalizeTemplateStructure();
      this.rebuildAllDropLists();
      this.forceAngularChangeDetection();
      return;
    }

    const updated = updatedField as TemplateField;
    const fields  = this.resolveFieldsArray(this.selectedSection);
    if (!fields) return;

    const idx = fields.findIndex(f => f.id === updated.id);
    if (idx > -1) {
      const merged: any = { ...fields[idx], ...updated };
      if ('showWhen'         in (updated as any)) merged.showWhen         = (updated as any).showWhen;
      if ('referenceFieldId' in (updated as any)) merged.referenceFieldId = (updated as any).referenceFieldId;
      if ('visibilityValue'  in (updated as any)) merged.visibilityValue  = (updated as any).visibilityValue;
      if ('conditions'       in (updated as any)) merged.conditions       = (updated as any).conditions;
      fields[idx] = merged as TemplateField;
      this.selectedField = fields[idx];
    } else {
      fields.push(updated);
      this.selectedField = updated;
    }
    this.normalizeTemplateStructure();
    this.rebuildAllDropLists();
    this.forceAngularChangeDetection();
  }

  onFieldOrSubSectionUpdated(item: any): void {
    if (this.selectedSubSectionObject) this.saveSelectedSubSection();
    else this.updateField(item);
  }

  // ─── Field removal ────────────────────────────────────────────────────────

  deleteField(field: TemplateField, sectionName: string, event: Event): void {
    event.stopPropagation();
    if (sectionName === 'available') {
      const i = this.availableFields.findIndex(f => f.id === field.id);
      if (i > -1) this.availableFields.splice(i, 1);
      return;
    }
    const fields = this.resolveFieldsArray(sectionName);
    if (fields) {
      const i = fields.findIndex(f => f.id === field.id);
      if (i > -1) { fields.splice(i, 1); this.pushToUnavailable(field, sectionName); }
    }
    this.forceAngularChangeDetection();
  }

  /** Shows the confirm dialog before removing a field chip from the canvas. */
  confirmRemoveField(field: TemplateField, sectionName: string, event: Event): void {
    event.stopPropagation();
    const name = field.displayName || field.label || 'this field';
    this.showConfirm({
      title:        'Remove Field',
      message:      `Remove "${name}" from the template?`,
      detail:       'The field will be moved to the Standard Fields panel on the left and can be dragged back at any time.',
      primaryLabel: 'Remove Field',
    }, () => this.moveFieldToAvailable(field, sectionName, new Event('click')));
  }

  moveFieldToAvailable(field: TemplateField, sectionName: string, event: Event): void {
    event.stopPropagation();
    const container = this.resolveContainerByPath(sectionName);
    if (!container?.fields) return;
    const i = (container.fields as TemplateField[]).findIndex(f => f.id === field.id);
    if (i === -1) return;
    container.fields.splice(i, 1);
    if (sectionName === this.PROVIDER_SECTION_NAME) this.refreshProviderCacheFromTemplate();
    this.pushToUnavailable(field, sectionName);
    this.forceAngularChangeDetection();
  }

  private pushToUnavailable(field: TemplateField, sectionName: string): void {
    const orig  = field.sectionName || sectionName;
    const name  = field.displayName || field.label || field.id;
    const entry: TemplateField = { ...field, displayName: name, label: name, sectionName: orig };
    if (field.sectionName) {
      if (!this.unavailableFieldsGrouped[orig]) this.unavailableFieldsGrouped[orig] = [];
      this.unavailableFieldsGrouped[orig].push(entry);
      this.unavailableFieldsList.push(entry);
    } else {
      this.availableFields.push(entry);
    }
  }

  // ─── Provider Details ─────────────────────────────────────────────────────

  getFieldsByType(fields: TemplateField[], type: string): TemplateField[] {
    return fields.filter(f => f.type === type);
  }

  getProviderDropFields(section: TemplateSectionModel): TemplateField[] {
    const key = section.sectionName || this.PROVIDER_SECTION_NAME;
    if (!this.providerNonButtonFieldsCache.has(key)) {
      this.providerNonButtonFieldsCache.set(key, (section.fields || []).filter(f => f?.type !== 'button'));
    }
    return this.providerNonButtonFieldsCache.get(key)!;
  }

  private isProviderSectionId(id: string): boolean { return id === this.PROVIDER_SECTION_NAME; }

  private syncProviderSectionFields(): void {
    const section = this.masterTemplate.sections?.find(s => s.sectionName === this.PROVIDER_SECTION_NAME);
    if (!section) return;
    const nonButtons = this.providerNonButtonFieldsCache.get(this.PROVIDER_SECTION_NAME);
    if (!nonButtons) return;
    const buttons = (section.fields || []).filter(f => f?.type === 'button');
    section.fields = [...buttons, ...nonButtons];
    section.fields.forEach(f => (f.sectionName = section.sectionName));
  }

  private refreshProviderCacheFromTemplate(): void {
    const section = this.masterTemplate.sections?.find(s => s.sectionName === this.PROVIDER_SECTION_NAME);
    if (!section) return;
    const cached = this.providerNonButtonFieldsCache.get(this.PROVIDER_SECTION_NAME) ?? [];
    cached.length = 0;
    (section.fields || []).filter(f => f?.type !== 'button').forEach(f => cached.push(f));
    if (!this.providerNonButtonFieldsCache.has(this.PROVIDER_SECTION_NAME)) {
      this.providerNonButtonFieldsCache.set(this.PROVIDER_SECTION_NAME, cached);
    }
  }

  // ─── Drag & drop ──────────────────────────────────────────────────────────

  denyDropPredicate = (_drag: any, _drop: any): boolean => false;

  subsectionEnterPredicate = (drag: any, _drop: any): boolean => {
    const kind = drag?.data?.kind;
    return kind === 'subsectionTemplate' || kind === 'emptySubsection';
  };

  onSubsectionTemplateDragStart(): void {
    this.isDraggingSubsectionTemplate = true;
    this.cdr.detectChanges();
  }
  onSubsectionTemplateDragEnd(): void {
    this.isDraggingSubsectionTemplate = false;
    this.cdr.detectChanges();
  }

  onDragStarted(field: TemplateField, section: string): void {
    if (section !== 'available') { field.isActive = true;  this.forceAngularChangeDetection(); }
  }
  onDragEnded(field: TemplateField, section: string): void {
    if (section !== 'available') { field.isActive = false; this.forceAngularChangeDetection(); }
  }

  drop(event: CdkDragDrop<TemplateField[]>, sectionName: string): void {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      const dragged       = event.previousContainer.data[event.previousIndex];
      const isDefault     = this.defaultFieldIds.includes(dragged.id);
      let fieldToSelect!: TemplateField;

      const prevId = event.previousContainer.id;
      if (prevId === 'available' || prevId === 'unavailable') {
        if (isDefault) {
          const copy: TemplateField = {
            ...dragged,
            id:          `${dragged.id}_copy_${Math.random().toString(36).substr(2, 9)}`,
            displayName: dragged.label,
            isEnabled:   true
          };
          if (!event.container.data.some(f => f.id === copy.id)) {
            event.container.data.splice(event.currentIndex, 0, copy);
            this.addFieldToSection(copy, sectionName);
          }
          fieldToSelect = copy;
          if (prevId === 'unavailable') {
            const i = this.unavailableFieldsList.findIndex(f => f.id === copy.id);
            if (i > -1) this.unavailableFieldsList.splice(i, 1);
          }
        } else {
          transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
          fieldToSelect = event.container.data[event.currentIndex];
          this.addFieldToSection(fieldToSelect, sectionName);
        }
        this.selectedField = fieldToSelect;
        this.selectedSection = sectionName;
        fieldToSelect.isEnabled = fieldToSelect.isEnabled ?? true;
      } else if (event.container.id === 'available' && !this.defaultFieldIds.includes(dragged.id)) {
        transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
        this.selectedField = event.container.data[event.currentIndex];
      } else {
        transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
        this.selectedField = event.container.data[event.currentIndex];
        this.selectedSection = sectionName;
        this.addFieldToSection(this.selectedField, sectionName);
      }
    }

    if (this.isProviderSectionId(event.container.id) || this.isProviderSectionId(event.previousContainer.id)) {
      this.syncProviderSectionFields();
    }
    this.forceAngularChangeDetection();
  }

  addFieldToSection(field: TemplateField, sectionName: string): void {
    if (sectionName === this.PROVIDER_SECTION_NAME) {
      if (field?.type !== 'button') {
        const section = this.masterTemplate.sections?.find(s => s.sectionName === this.PROVIDER_SECTION_NAME);
        if (section) {
          const cache = this.getProviderDropFields(section);
          if (!cache.some(f => f.id === field.id)) cache.push(field);
          this.syncProviderSectionFields();
        }
      }
      return;
    }
    const arr = this.resolveFieldsArray(sectionName);
    if (!arr) { console.warn(`Section not found: ${sectionName}`); return; }
    if (!arr.some(f => f.id === field.id)) arr.push(field);
  }

  dropSection(event: CdkDragDrop<any[]>): void {
    const data = event.item.data;

    if (data && typeof data === 'object' && data.kind === 'emptySection') {
      const sections  = this.masterTemplate.sections || [];
      const maxOrder  = sections.length ? Math.max(...sections.map(s => s.order ?? 0)) : 0;
      const name      = `New Section ${this.emptySectionCounter++}`;
      const newSection: TemplateSectionModel = { sectionName: name, order: maxOrder + 10, fields: [] };
      this.masterTemplate.sections = [...sections, newSection];
      this.activeSections[name]    = true;
      this.selectedSectionObject   = newSection;
      this.rebuildAllDropLists();
      this.forceAngularChangeDetection();
      return;
    }

    const sectionName: string = data as string;
    const toRestore = this.originalMasterTemplate.sections?.find(s => s.sectionName === sectionName);
    if (!toRestore) return;
    if (this.masterTemplate.sections?.some(s => s.sectionName === sectionName)) return;

    this.masterTemplate.sections = this.masterTemplate.sections || [];
    this.masterTemplate.sections.push(JSON.parse(JSON.stringify(toRestore)));
    this.activeSections[sectionName] = true;

    const idx = this.unavailableSections.indexOf(sectionName);
    if (idx > -1) this.unavailableSections.splice(idx, 1);
    if (this.unavailableFieldsGrouped[sectionName]) delete this.unavailableFieldsGrouped[sectionName];
    this.unavailableFieldsList = this.unavailableFieldsList.filter(f => f.sectionName !== sectionName);

    this.rebuildAllDropLists();
    this.forceAngularChangeDetection();
  }

  dropPredefinedSubsection(event: CdkDragDrop<any>, containerPath: string): void {
    const data = event?.item?.data;
    if (!data) return;

    const container = this.resolveContainerByPath(containerPath);
    if (!container) return;
    if (!container.subsections) container.subsections = {};

    if (data.kind === 'emptySubsection') {
      const key = this.generateUniqueSubsectionKey(container, 'subsection');
      container.subsections[key] = {
        sectionName: 'New Subsection', subsectionKey: key,
        parentSectionName: containerPath,
        order: this.getNextSubsectionOrder(container),
        fields: []
      };
      this.normalizeTemplateStructure();
      this.rebuildAllDropLists();
      this.forceAngularChangeDetection();
      return;
    }

    if (data.kind !== 'subsectionTemplate') return;

    const tpl = this.predefinedSubsections.find(x => x.key === data.templateKey);
    if (!tpl) return;

    const newKey = this.generateUniqueSubsectionKey(container, tpl.key);
    const newSub: any = JSON.parse(JSON.stringify(tpl.subsection));

    newSub.subsectionKey     = newKey;
    newSub.baseKey           = tpl.key;
    newSub.parentSectionName = containerPath;
    newSub.sectionName       = newSub.sectionName ?? tpl.title ?? newKey;
    newSub.order             = this.getNextSubsectionOrder(container);
    if (!Array.isArray(newSub.fields)) newSub.fields = [];
    newSub.fields = newSub.fields.map((f: any) => ({ ...f, sectionName: `${containerPath}.${newKey}` }));

    container.subsections[newKey] = newSub;
    this.normalizeTemplateStructure();
    this.rebuildAllDropLists();
    this.forceAngularChangeDetection();
  }

  private getNextSubsectionOrder(container: any): number {
    const subs = container?.subsections;
    if (!subs || typeof subs !== 'object') return 10;
    const orders = Object.values(subs).map((s: any) => Number((s as any)?.order ?? 0));
    return (orders.length ? Math.max(...orders) : 0) + 10;
  }

  private generateUniqueSubsectionKey(container: any, base: string): string {
    const subs = container?.subsections || {};
    let key = base, n = 2;
    while (subs[key]) { key = `${base}_${n++}`; }
    return key;
  }

  // ─── Save ──────────────────────────────────────────────────────────────────

  saveTemplate(): void {
    if (!this.newTemplateName?.trim()) { this.showTemplateNameError = true; return; }
    this.showTemplateNameError = false;

    this.masterTemplate.sections?.forEach(sec => {
      sec.fields?.forEach((f, i) => (f.order = i));
      if (sec.subsections) Object.values(sec.subsections).forEach(sub => sub.fields?.forEach((f, i) => (f.order = i)));
    });

    this.normalizeVisibilityForSave(this.masterTemplate);

    this.authService.saveAuthTemplate({
      TemplateName: this.newTemplateName,
      JsonContent:  JSON.stringify(this.masterTemplate),
      CreatedOn:    new Date().toISOString(),
      CreatedBy:    1,
      authclassid:  this.selectedClassId,
      Id:           this.formMode === 'edit' ? this.selectedTemplateId : 0,
      module:       this.module,
      EnrollmentHierarchyId: 1
    }).subscribe({
      next:  () => { this.isDirty = false; this._templateLoaded = false; this.isVisible = false; this.loadData(); this.snackBar.open('Template saved!', 'Close', { duration: 5000, panelClass: ['success-snackbar'] }); },
      error: (err: any) => console.error('Save error:', err)
    });
  }

  // ─── Visibility normalization ─────────────────────────────────────────────

  private normalizeVisibilityForSave(tmpl: any): void {
    const walkFields = (fields: any[]) => {
      for (const f of (fields || [])) {
        if (f.layout === 'row' && Array.isArray(f.fields)) walkFields(f.fields);
        const conds = Array.isArray(f.conditions) ? f.conditions : [];
        if (!conds.length) { f.conditions = [{ showWhen: 'always', referenceFieldId: null, value: null }]; }
        else { f.conditions[0].showWhen = f.conditions[0].showWhen ?? 'always'; delete f.conditions[0].operatorWithPrev; }
        const first = f.conditions[0];
        f.showWhen = first.showWhen ?? 'always'; f.referenceFieldId = first.referenceFieldId ?? null; f.visibilityValue = first.value ?? null;
      }
    };
    const normTarget = (t: any) => {
      if (!t) return;
      const conds = Array.isArray(t.conditions) ? t.conditions : [];
      if (!conds.length) { t.conditions = [{ showWhen: 'always', referenceFieldId: null, value: null }]; }
      else { t.conditions[0].showWhen = t.conditions[0].showWhen ?? 'always'; delete t.conditions[0].operatorWithPrev; }
      const first = t.conditions[0];
      t.showWhen = first.showWhen ?? 'always'; t.referenceFieldId = first.referenceFieldId ?? null; t.visibilityValue = first.value ?? null;
    };
    const walkSections = (sections: any[]) => {
      for (const s of (sections || [])) {
        normTarget(s); walkFields(s.fields || []);
        const subs = s.subsections;
        if (Array.isArray(subs)) walkSections(subs);
        else if (subs && typeof subs === 'object') walkSections(Object.values(subs));
      }
    };
    walkSections(tmpl?.sections || []);
  }

  // ─── Validation dialog ────────────────────────────────────────────────────

  openValidationDialog(): void {
    if (!this.selectedTemplateId) { this.snackBar.open('Please select a template first', 'Close', { duration: 3000 }); return; }
    this.authService.getTemplateValidation(this.selectedTemplateId).subscribe({
      next: (response: any) => {
        let validations: any[] = [];
        try { validations = response?.validationJson ? JSON.parse(response.validationJson) : []; } catch {}
        this.dialog.open(ValidationDialogComponent, {
          width: '1300px', maxWidth: '1300px',
          data: { templateId: this.selectedTemplateId, validations, templateJson: this.masterTemplate }
        }).afterClosed().subscribe((result: any) => {
          if (result) {
            this.authService.updateTemplateValidation({ templateId: this.selectedTemplateId, validationJson: JSON.stringify(result) })
              .subscribe(() => this.snackBar.open('Validations saved!', 'Close', { duration: 3000 }));
          }
        });
      },
      error: (err: any) => console.error('Validation error:', err)
    });
  }

  openSettingsDialog(): void {
    this.dialog.open(SettingsDialogComponent, { width: '400px', data: { visibleColumns: this.visibleColumns } })
      .afterClosed().subscribe(result => { if (result) { this.visibleColumns = result; this.updateDisplayedColumns(); } });
  }

  // ─── Unsaved-changes guard ───────────────────────────────────────────────────

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.isDirty && this.isVisible) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  /**
   * If there are unsaved changes, shows the navigation-guard dialog and defers `action`.
   * Otherwise executes `action` immediately.
   */
  guardedNavigate(context: typeof this.unsavedDialogContext, action: () => void): void {
    if (!this.isDirty || !this._templateLoaded) { action(); return; }
    this.unsavedDialogContext = context;
    this._pendingNavAction    = action;
    this.showUnsavedDialog    = true;
  }

  /** User clicked "Stay & Continue Editing" — close dialog, restore dropdown if needed. */
  dismissUnsavedDialog(): void {
    this.showUnsavedDialog = false;
    this._pendingNavAction = null;
    if (this.unsavedDialogContext === 'switchTemplate') {
      this.selectedTemplateId = this._lastLoadedTemplateId;
      this.cdr.detectChanges();
    }
  }

  /** User clicked "Discard Changes" — clear dirty state and execute the deferred action. */
  confirmDiscard(): void {
    this.isDirty         = false;
    this._templateLoaded = false;
    this.showUnsavedDialog = false;
    const action = this._pendingNavAction;
    this._pendingNavAction = null;
    action?.();
  }

  /** User clicked "Save & Continue" — save first, then execute the deferred action. */
  saveAndLeave(): void {
    if (!this.newTemplateName?.trim()) { this.showTemplateNameError = true; this.showUnsavedDialog = false; return; }
    this.showTemplateNameError = false;
    this.showUnsavedDialog = false;
    const action = this._pendingNavAction;
    this._pendingNavAction = null;

    this.masterTemplate.sections?.forEach(sec => {
      sec.fields?.forEach((f, i) => (f.order = i));
      if (sec.subsections) Object.values(sec.subsections).forEach(sub => sub.fields?.forEach((f, i) => (f.order = i)));
    });
    this.normalizeVisibilityForSave(this.masterTemplate);

    this.authService.saveAuthTemplate({
      TemplateName: this.newTemplateName,
      JsonContent:  JSON.stringify(this.masterTemplate),
      CreatedOn:    new Date().toISOString(),
      CreatedBy:    1,
      authclassid:  this.selectedClassId,
      Id:           this.formMode === 'edit' ? this.selectedTemplateId : 0,
      module:       this.module,
      EnrollmentHierarchyId: 1
    }).subscribe({
      next:  () => {
        this.isDirty = false; this._templateLoaded = false;
        this.snackBar.open('Template saved!', 'Close', { duration: 4000, panelClass: ['success-snackbar'] });
        action?.();
      },
      error: () => this.snackBar.open('Save failed. Please try again.', 'Close', { duration: 4000 })
    });
  }

  // ─── Confirm dialog (destructive in-canvas actions) ─────────────────────────

  showConfirm(cfg: { title: string; message: string; detail?: string; primaryLabel: string; primaryClass?: 'danger' | 'warning' }, action: () => void): void {
    this.confirmDialogConfig = { primaryClass: 'danger', detail: '', ...cfg };
    this._pendingConfirmAction = action;
    this.showConfirmDialog = true;
  }

  onConfirmPrimary(): void {
    this.showConfirmDialog = false;
    const action = this._pendingConfirmAction;
    this._pendingConfirmAction = null;
    action?.();
  }

  onConfirmDismiss(): void {
    this.showConfirmDialog = false;
    this._pendingConfirmAction = null;
  }

  // ─── Change detection ─────────────────────────────────────────────────────

  forceAngularChangeDetection(): void {
    this.masterTemplate = { ...this.masterTemplate };
    if (this._templateLoaded) this.isDirty = true;
    this.cdr.detectChanges();
  }

  // ─── Predefined subsection validation ────────────────────────────────────

  private validatePredefinedSubsections(): void {
    for (const tpl of this.predefinedSubsections) {
      const sub: any   = (tpl?.subsection ?? {}) as any;
      const fields: any[] = Array.isArray(sub.fields) ? sub.fields : [];
      sub.subsectionKey = sub.subsectionKey ?? tpl.key;

      const seen      = new Map<string, number>();
      const renameMap = new Map<string, string>();
      for (const f of fields) {
        const id = String(f?.id ?? '').trim();
        if (!id) continue;
        const count = (seen.get(id) ?? 0) + 1;
        seen.set(id, count);
        if (count > 1) {
          let newId = `${id}_${count}`, n = count;
          while (seen.has(newId)) newId = `${id}_${++n}`;
          renameMap.set(id, newId);
          f.id = newId;
        }
      }
      for (const f of fields) {
        const fill = f?.lookup?.fill;
        if (!Array.isArray(fill)) continue;
        for (const m of fill) {
          const t = String(m?.targetFieldId ?? '').trim();
          if (t && renameMap.has(t)) m.targetFieldId = renameMap.get(t);
        }
      }
      (tpl as any).subsection = sub;
    }
  }
}
