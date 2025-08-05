import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-mdreview',
  templateUrl: './mdreview.component.html',
  styleUrls: ['./mdreview.component.css']
})
export class MdreviewComponent implements OnInit {
  mdrForm!: FormGroup;

  activityTypeDisplay = '';
  priorityDisplay = '';
  assignToDisplay = '';
  workBasketDisplay = '';
  workBasketUserDisplay = '';
  scheduledDateText = '';
  dueDateText = '';

  showDropdowns: any = {
    activityType: false,
    priority: false,
    assignTo: false,
    workBasket: false,
    workBasketUser: false
  };

  activeDropdown = '';
  highlightedIndex = -1;

  filteredActivityTypes = [{ label: 'Initial Review' }, { label: 'Follow-Up' }];
  filteredPriorities = [{ label: 'High' }, { label: 'Medium' }, { label: 'Low' }];
  filteredUsers = [{ label: 'Dr. Smith' }, { label: 'Dr. Jane' }];
  filteredWorkBaskets = [{ label: 'UM-QA' }, { label: 'UM-CCR' }];

  serviceLines = [
    {
      serviceCode: '99213',
      description: 'Office Visit',
      fromDate: '2025-01-01',
      toDate: '2025-01-02',
      requested: 4,
      approved: 0,
      denied: 0,
      recommendation: 'Approved',
      selected: false
    },
    {
      serviceCode: '99381',
      description: 'Initial Preventive Exam',
      fromDate: '2025-01-03',
      toDate: '2025-01-04',
      requested: 2,
      approved: 0,
      denied: 0,
      recommendation: 'Pending',
      selected: false
    }
  ];

  constructor(private fb: FormBuilder) { }

  ngOnInit(): void {
    this.mdrForm = this.fb.group({
      assignmentType: ['', Validators.required],
      activityType: ['', Validators.required],
      priority: ['', Validators.required],
      assignTo: ['', Validators.required],
      scheduledDateTime: ['', Validators.required],
      dueDateTime: ['', Validators.required],
      workBasket: [''],
      workBasketUser: [''],
      clinicalInstructions: ['']
    });
  }

  // Dropdown behavior
  onDropdownInput(event: any, field: string) {
    const value = event.target.value.toLowerCase();
    this.showDropdowns[field] = true;
    this.activeDropdown = field;
    this.highlightedIndex = 0;

    switch (field) {
      case 'activityType':
        this.filteredActivityTypes = this.filteredActivityTypes.filter(o => o.label.toLowerCase().includes(value));
        break;
      case 'priority':
        this.filteredPriorities = this.filteredPriorities.filter(o => o.label.toLowerCase().includes(value));
        break;
      case 'assignTo':
      case 'workBasketUser':
        this.filteredUsers = this.filteredUsers.filter(o => o.label.toLowerCase().includes(value));
        break;
      case 'workBasket':
        this.filteredWorkBaskets = this.filteredWorkBaskets.filter(o => o.label.toLowerCase().includes(value));
        break;
    }
  }

  openDropdown(field: string) {
    this.showDropdowns[field] = true;
    this.activeDropdown = field;
    this.highlightedIndex = 0;
  }

  closeDropdown(field: string) {
    setTimeout(() => {
      this.showDropdowns[field] = false;
    }, 150); // slight delay for click selection
  }

  selectDropdownOption(field: string, option: any) {
    switch (field) {
      case 'activityType':
        this.activityTypeDisplay = option.label;
        this.mdrForm.get('activityType')?.setValue(option.label);
        break;
      case 'priority':
        this.priorityDisplay = option.label;
        this.mdrForm.get('priority')?.setValue(option.label);
        break;
      case 'assignTo':
        this.assignToDisplay = option.label;
        this.mdrForm.get('assignTo')?.setValue(option.label);
        break;
      case 'workBasket':
        this.workBasketDisplay = option.label;
        this.mdrForm.get('workBasket')?.setValue(option.label);
        break;
      case 'workBasketUser':
        this.workBasketUserDisplay = option.label;
        this.mdrForm.get('workBasketUser')?.setValue(option.label);
        break;
    }
    this.showDropdowns[field] = false;
  }

  // Calendar
  triggerCalendar(type: string) {
    if (type === 'scheduled') {
      document.querySelector<HTMLInputElement>('#scheduledPicker')?.click();
    } else if (type === 'due') {
      document.querySelector<HTMLInputElement>('#duePicker')?.click();
    }
  }

  handleCalendarChange(event: any, controlName: string) {
    const dateVal = event.target.value;
    this.mdrForm.get(controlName)?.setValue(dateVal);
    if (controlName === 'scheduledDateTime') this.scheduledDateText = dateVal;
    if (controlName === 'dueDateTime') this.dueDateText = dateVal;
  }

  onDateTextChange(event: any, controlName: string) {
    const value = event.target.value;
    if (controlName === 'scheduledDateTime') this.scheduledDateText = value;
    if (controlName === 'dueDateTime') this.dueDateText = value;
  }

  handleDateBlur(controlName: string) {
    const control = this.mdrForm.get(controlName);
    if (control?.value && !Date.parse(control.value)) {
      control.setErrors({ invalid: true });
    }
  }

  // Service lines
  isAllSelected(): boolean {
    return this.serviceLines.every(line => line.selected);
  }

  toggleAllSelection(event: any) {
    const isChecked = event.target.checked;
    this.serviceLines.forEach(line => (line.selected = isChecked));
  }

  getRecommendationClass(status: string): string {
    switch (status.toLowerCase()) {
      case 'approved':
        return 'btn-approved';
      case 'denied':
        return 'btn-denied';
      case 'void':
        return 'btn-void';
      default:
        return 'btn-pending';
    }
  }

  submitReview() {
    console.log('Form submitted:', this.mdrForm.value);
    console.log('Selected lines:', this.serviceLines.filter(l => l.selected));
  }

  cancelReview() {
    this.mdrForm.reset();
    this.serviceLines.forEach(l => (l.selected = false));
  }
}
