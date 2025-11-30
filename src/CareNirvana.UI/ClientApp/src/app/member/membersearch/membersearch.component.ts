import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { DashboardServiceService, MemberSearchCriteria, MemberSummary } from 'src/app/service/dashboard.service.service';
export interface LookupOption {
  id: number | string;
  name: string;
  code?: string;
}

//export interface MemberSummary {
//  memberId: string;
//  firstName: string;
//  lastName: string;
//  dob?: string;
//  gender?: string;
//  programName?: string;
//  status?: string;
//}

//export interface MemberSearchCriteria {
//  quickText: string | null;
//  firstName: string | null;
//  lastName: string | null;
//  memberId: string | null;
//  medicaidId: string | null;
//  dobFrom: string | null;
//  dobTo: string | null;
//  genderId: number | string | null;
//  programIds: (number | string)[];
//  riskIds: (number | string)[];
//  statusId: number | string | null;
//  pcp: string | null;
//  phone: string | null;
//  email: string | null;
//}

@Component({
  selector: 'ui-member-search',
  templateUrl: './membersearch.component.html',
  styleUrls: ['./membersearch.component.css']
})
export class MembersearchComponent implements OnInit {

  // if you want to wire dropdowns from API, you can later expose them as @Input()
  genderOptions: any[] = [
    { id: 'M', name: 'Male' },
    { id: 'F', name: 'Female' },
    { id: 'U', name: 'Unknown' }
  ];
  programOptions: any[] = [];
  riskOptions: any[] = [];
  statusOptions: any[] = [];

  quickSearch = '';
  showAdvanced = false;

  advancedForm!: FormGroup;

  members: MemberSummary[] = [];
  displayedColumns = ['select', 'memberId', 'name', 'dob', 'gender', 'program', 'status'];

  selectedMemberId: string | null = null;

  /** parent can listen when user selects a member */
  @Output() memberSelected = new EventEmitter<MemberSummary | null>();

  /** parent can listen to search criteria if needed */
  @Output() searchExecuted = new EventEmitter<MemberSearchCriteria>();

  constructor(private fb: FormBuilder, private memberSearchService: DashboardServiceService) { }

  ngOnInit(): void {
    this.buildAdvancedForm();
  }

  private buildAdvancedForm(): void {
    this.advancedForm = this.fb.group({
      firstName: [''],
      lastName: [''],
      memberId: [''],
      medicaidId: [''],
      dobFrom: [null],
      dobTo: [null],
      genderId: [null],
      programIds: [[]],
      riskIds: [[]],
      statusId: [null],
      pcp: [''],
      phone: [''],
      email: ['']
    });
  }

  // ---- Search actions ----

  onQuickSearch(): void {
    const criteria = this.buildCriteria(true);
    this.executeSearch(criteria);
  }

  onAdvancedSearch(): void {
    const criteria = this.buildCriteria(false);
    this.executeSearch(criteria);
  }

  onAdvancedClear(): void {
    this.advancedForm.reset({
      firstName: '',
      lastName: '',
      memberId: '',
      medicaidId: '',
      dobFrom: null,
      dobTo: null,
      genderId: null,
      programIds: [],
      riskIds: [],
      statusId: null,
      pcp: '',
      phone: '',
      email: ''
    });
  }

  private buildCriteria(fromQuickOnly: boolean): MemberSearchCriteria {
    const quick = (this.quickSearch || '').trim();
    const adv = this.advancedForm.value;

    return {
      quickText: quick || null,

      firstName: fromQuickOnly ? null : (adv.firstName || '').trim() || null,
      lastName: fromQuickOnly ? null : (adv.lastName || '').trim() || null,
      memberId: fromQuickOnly ? null : (adv.memberId || '').trim() || null,
      medicaidId: fromQuickOnly ? null : (adv.medicaidId || '').trim() || null,

      dobFrom: fromQuickOnly ? null : adv.dobFrom,
      dobTo: fromQuickOnly ? null : adv.dobTo,

      gender: fromQuickOnly ? null : adv.genderId,
      phone: fromQuickOnly ? null : (adv.phone || '').trim() || null,
      email: fromQuickOnly ? null : (adv.email || '').trim() || null,

      // you can later map city/state/zip if you add fields
      pageNumber: 1,
      pageSize: 25
    };
  }

  private executeSearch(criteria: MemberSearchCriteria): void {
    this.memberSearchService.searchMembers(criteria).subscribe({
      next: (res) => {
        this.members = res || [];
        this.selectedMemberId = null;
        this.memberSelected.emit(null);
      },
      error: (err) => {
        console.error('Error searching members', err);
        this.members = [];
        this.selectedMemberId = null;
        this.memberSelected.emit(null);
      }
    });
  }

  // ----- selection -----

  isSelected(row: MemberSummary): boolean {
    return !!this.selectedMemberId && this.selectedMemberId === row.memberId;
  }

  onRowClick(row: MemberSummary): void {
    this.toggleSelection(row);
  }

  onRadioChange(row: MemberSummary): void {
    this.setSelection(row);
  }

  private toggleSelection(row: MemberSummary): void {
    if (this.selectedMemberId === row.memberId) {
      this.selectedMemberId = null;
      this.memberSelected.emit(null);
    } else {
      this.setSelection(row);
    }
  }

  private setSelection(row: MemberSummary): void {
    this.selectedMemberId = row.memberId;
    this.memberSelected.emit(row);
  }

  // membersearch.component.ts

  resetSearch(): void {
    // Clear quick search bar
    this.quickSearch = '';

    // Reset advanced form to defaults (use whatever defaults you already use)
    this.advancedForm.reset({
      firstName: '',
      lastName: '',
      memberId: '',
      medicaidId: '',
      dobFrom: null,
      dobTo: null,
      genderId: null,
      programIds: [],
      riskIds: [],
      statusId: null,
      pcp: '',
      phone: '',
      email: ''
    });

    // Clear results and selection
    this.members = [];
    this.selectedMemberId = null;

    // Notify parent that no member is selected
    this.memberSelected.emit(null);
  }

}

