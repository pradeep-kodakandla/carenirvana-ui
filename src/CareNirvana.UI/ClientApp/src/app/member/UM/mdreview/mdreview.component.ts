import { Component, OnInit, ViewChild, ElementRef, Input, OnChanges, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MdReviewLine } from '../decisiondetails/decisiondetails.component';

@Component({
  selector: 'app-mdreview',
  templateUrl: './mdreview.component.html',
  styleUrls: ['./mdreview.component.css']
})
export class MdreviewComponent implements OnInit, OnChanges {

  @Input() serviceLines: MdReviewLine[] = [];

  mdrForm!: FormGroup;

  activityTypeDisplay = '';
  assignmentTypeDisplay = '';
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
  filteredAssignmentTypes = [{ label: 'Individual' }, { label: 'Work Basket' }];
  filteredPriorities = [{ label: 'High' }, { label: 'Medium' }, { label: 'Low' }];
  filteredUsers = [{ label: 'Dr. Smith' }, { label: 'Dr. Jane' }];
  filteredWorkBaskets = [{ label: 'UM-QA' }, { label: 'UM-CCR' }];

  @ViewChild('scheduledPicker') scheduledPicker!: ElementRef<HTMLInputElement>;
  @ViewChild('duePicker') duePicker!: ElementRef<HTMLInputElement>;
  constructor(private fb: FormBuilder) { }

  ngOnInit(): void {


    // Initialize form with default values
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

    const s = this.mdrForm.get('scheduledDateTime')?.value ?? '';
    const d = this.mdrForm.get('dueDateTime')?.value ?? '';
    this.scheduledDateText = s;
    this.dueDateText = d;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['serviceLines']) {
      const incoming = this.serviceLines ?? [];
      this.serviceLines = incoming.map((l) => {
        const copy: MdReviewLine = { ...l }; // 1) spread once
        if (copy.selected === undefined) copy.selected = false;           // 2) fill defaults
        if (copy.recommendation === undefined) copy.recommendation = 'Pending';
        return copy;
      });
    }
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
      case 'assignmentType':
        this.assignmentTypeDisplay = option.label;
        this.mdrForm.get('assignmentType')?.setValue(option.label);
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
  triggerCalendar(which: 'scheduled' | 'due') {
    const el = which === 'scheduled' ? this.scheduledPicker?.nativeElement : this.duePicker?.nativeElement;
    if (!el) return;
    // Chromium supports showPicker(); fallback to click()
    if ((el as any).showPicker) { try { (el as any).showPicker(); return; } catch { } }
    el.click();
  }

  handleCalendarChange(evt: Event, control: 'scheduledDateTime' | 'dueDateTime') {
    let v = (evt.target as HTMLInputElement).value || '';
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) v = v + ':00'; // ensure seconds
    this.mdrForm.get(control)?.setValue(v);
    const disp = this.toDisplayFormat(v);
    if (control === 'scheduledDateTime') this.scheduledDateText = disp;
    else this.dueDateText = disp;
  }


  onDateTextChange(evt: Event, control: 'scheduledDateTime' | 'dueDateTime') {
    const v = (evt.target as HTMLInputElement).value;
    if (control === 'scheduledDateTime') this.scheduledDateText = v;
    else this.dueDateText = v;
  }

  handleDateBlur(control: 'scheduledDateTime' | 'dueDateTime') {
    const raw = control === 'scheduledDateTime' ? this.scheduledDateText : this.dueDateText;
    const parsed = this.parseRelativeOrIso(raw);
    if (parsed) {
      this.mdrForm.get(control)?.setValue(parsed);
      if (control === 'scheduledDateTime') this.scheduledDateText = parsed;
      else this.dueDateText = parsed;
      this.mdrForm.get(control)?.setErrors(null);
    } else {
      // mark invalid (optional)
      this.mdrForm.get(control)?.setErrors({ invalidDate: true });
    }
  }
  private pad2(n: number) { return String(n).padStart(2, '0'); }

  private toLocalInputValue(d: Date): string {
    // yyyy-MM-ddTHH:mm:ss for <input type="datetime-local" step=1>
    return `${d.getFullYear()}-${this.pad2(d.getMonth() + 1)}-${this.pad2(d.getDate())}`
      + `T${this.pad2(d.getHours())}:${this.pad2(d.getMinutes())}:${this.pad2(d.getSeconds())}`;
  }

  toDisplayFormat(input: any): string {
    const dt = this.parseToDate(input);
    if (!dt) return '';
    return `${this.pad2(dt.getMonth() + 1)}/${this.pad2(dt.getDate())}/${dt.getFullYear()} `
      + `${this.pad2(dt.getHours())}:${this.pad2(dt.getMinutes())}:${this.pad2(dt.getSeconds())}`;
  }

  private parseToDate(input: any): Date | null {
    if (!input) return null;
    if (input instanceof Date) return input;

    const s = String(input).trim();

    // yyyy-MM-ddTHH:mm[:ss]
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const [, y, mo, d, h, mi, se] = m;
      return new Date(+y, +mo - 1, +d, +h, +mi, se ? +se : 0);
    }

    // MM/dd/yyyy HH:mm:ss
    m = s.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
    if (m) {
      const [, mo, d, y, h, mi, se] = m;
      return new Date(+y, +mo - 1, +d, +h, +mi, +se);
    }

    return null;
  }

  private parseRelativeOrIso(text: string): string | null {
    const t = (text || '').trim().toUpperCase();
    if (!t) return null;

    if (t === 'D') {
      return this.toLocalInputValue(new Date());
    }

    const rel = t.match(/^D\s*([+-])\s*(\d+)$/);
    if (rel) {
      const sign = rel[1] === '+' ? 1 : -1;
      const days = parseInt(rel[2], 10);
      const d = new Date();
      d.setDate(d.getDate() + sign * days);
      return this.toLocalInputValue(d);
    }

    const dt = this.parseToDate(text);
    return dt ? this.toLocalInputValue(dt) : null;
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
