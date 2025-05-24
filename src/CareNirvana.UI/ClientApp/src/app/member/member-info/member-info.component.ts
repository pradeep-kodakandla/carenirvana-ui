import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-member-info',
  templateUrl: './member-info.component.html',
  styleUrl: './member-info.component.css'
})
export class MemberInfoComponent implements OnInit {
  editMode = false;
  editModeMI = false;
  detailsForm: FormGroup;

  constructor(private fb: FormBuilder) {
    this.detailsForm = this.fb.group({
      prefix: ['Mr.'],
      firstName: ['John'],
      middleInitial: ['I'],
      lastName: ['Smith'],
      dateOfBirth: ['12/05/1981'],
      maritalStatus: ['Married'],
      preferredName: ['Not Available'],
      gender: ['Male'],
      genderIdentity: ['Male'],
      sexualOrientation: ['Bisexual'],
      veteranStatus: ['Yes'],
      preferredcontactformat: ['Mail'],
      veteranstatus: ['Yes'],
      race: ['American'],
      primaryLanguage: ['English'],

      preferredRace: [''],
      prefferedWrittenLanguages: ['English, Spanish'],
      ethincity: ['American'],
      prefferedSpokeLanguages: ['English'],
      communicationImpairment: ['English'],
      preferredEthincity: ['American'],
      residenceStatus: ['Adult Foster Home'],
      evacuationZone: ['Zone1'],
      incomeStatus: ['$60,000'],
      serviceInterruption: [''],
      dateOfDeath: [''],
      causeOfDeath: [''],
      actualPlaceOfDeath: [''],
      alternatePhone: [''],
      fax: [''],
      preferredTimeOfCall: [''],
      primaryEmail: ['test@yahoo.com'],
      preferredEmail: [''],
      alternateEmail: [''],
    });
  }

  ngOnInit(): void { }

  toggleEditMode(): void {
    if (this.editMode) {
      console.log(this.detailsForm.value); // Save the form values
    }
    this.editMode = !this.editMode;
  }

  toggleEditModeMemberIdentifier(): void {
    if (this.editModeMI) {
      console.log(this.detailsForm.value); // Save the form values
    }
    this.editModeMI = !this.editModeMI;
  }

  phoneNumbers = [
    { type: 'Primary', number: '(111) 111-1111' },
    { type: 'Cell Phone', number: '(123) 123-4232' },
  ];

  addresses = [
    {
      type: 'Primary', number: '12345 Example Way'
    },
    { type: 'Secondary', number: '12345 Example Way' },
  ];

  emails = [
    { type: 'Primary', email: 'test@yahoo.com' },
    { type: 'Secondary', email: 'test@gmail.com' },
  ];

  languages = [
    { type: 'Primary', language: 'English' },
    { type: 'Written', language: 'English, Spanish' },
  ];

  phoneColumns = ['type', 'number'];
  addressColumns = ['type', 'number'];
  emailColumns = ['type', 'email'];
  languageColumns = ['type', 'language'];

  onEdit(section: string) {
    console.log(`Edit button clicked for ${section}`);
  }




}
