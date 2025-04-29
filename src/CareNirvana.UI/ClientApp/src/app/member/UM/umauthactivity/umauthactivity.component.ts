import { Component, ElementRef, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { AuthActivity } from 'src/app/member/UM/umauthactivity/auth-activity.model.service';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { trigger, state, style, transition, animate } from '@angular/animations';

@Component({
  selector: 'app-umauthactivity',
  templateUrl: './umauthactivity.component.html',
  styleUrl: './umauthactivity.component.css',
  animations: [
    trigger('collapseExpand', [
      state('collapsed', style({
        height: '0px',
        opacity: 0,
        overflow: 'hidden',
      })),
      state('expanded', style({
        height: '*',
        opacity: 1,
        overflow: 'hidden',
      })),
      transition('collapsed <=> expanded', [
        animate('300ms ease-in-out')
      ]),
    ])
  ]
})
export class UmauthactivityComponent {
  activityForm: FormGroup;
  activities = new MatTableDataSource<AuthActivity>([]);
  displayedColumns: string[] = ['activityType', 'priority', 'scheduledDateTime', 'dueDateTime', 'assignTo', 'comments', 'actions'];
  editingIndex: number | null = null;
  isEditing: boolean = false; // NEW FLAG

  constructor(private fb: FormBuilder) {
    this.activityForm = this.fb.group({
      memberName: ['John Doer'], // <-- string, which is correct
      activityType: [''],
      priority: [''],
      assignTo: ['Current user'],
      workBasket: [''],
      scheduledDateTime: [new Date()],
      dueDateTime: [''],
      comments: ['']
    });
  }

  onSubmit() {
    const newActivity: AuthActivity = {
      ...this.activityForm.value,
      status: this.editingIndex !== null ? this.activities.data[this.editingIndex].status : 'Pending',
      completedDate: this.editingIndex !== null ? this.activities.data[this.editingIndex].completedDate : 'N/A',
      createdDatetime: new Date().toLocaleString(),
      createdBy: 'Test User',
    };

    if (this.editingIndex !== null) {
      this.activities.data[this.editingIndex] = newActivity;
      this.editingIndex = null;
    } else {
      this.activities.data.push(newActivity);
    }

    this.activities._updateChangeSubscription();
    this.onReset();
  }

  onReset() {
    this.activityForm.reset({
      memberName: 'John Doer',
      assignTo: 'Current user',
      scheduledDateTime: new Date()
    });
    this.editingIndex = null;
  }

  editActivity(index: number) {
    const activity = this.activities.data[index];
    this.activityForm.patchValue(activity);
    this.editingIndex = index;
  }

  deleteActivity(index: number) {
    this.activities.data.splice(index, 1);
    this.activities._updateChangeSubscription();
    this.onReset();
  }

  handleDateShortcut(controlName: string): void {
    let rawValue: any;

    if (controlName === 'scheduledDateTime' || controlName === 'dueDateTime') {
      rawValue = this.displayedScheduledValue;
    } else {
      rawValue = ''; // or handle other controls if needed
    }

    // Convert to string safely before using .trim()
    const value = (rawValue ?? '').toString().trim();

    if (!value) return;

    const now = new Date();

    // Match shortcuts like d+2
    const match = value.match(/^d\+(\d+)$/i);
    if (match) {
      const daysToAdd = parseInt(match[1], 10);
      const futureDate = new Date(now);
      futureDate.setDate(now.getDate() + daysToAdd);
      futureDate.setHours(10); futureDate.setMinutes(0); // Optional default time

      const formatted = this.formatDateTimeLocal(futureDate);

      this.activityForm.get(controlName)?.setValue(formatted);

      if (controlName === 'scheduledDateTime' || controlName === 'dueDateTime') {
        this.displayedScheduledValue = formatted;
      }
    }
  }


  formatDateTimeLocal(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const min = pad(date.getMinutes());
    const sec = pad(date.getSeconds());
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${sec}`;
  }

  displayedScheduledValue: string = '';

  onInputChange(event: Event, controlName: string) {
    const input = (event.target as HTMLInputElement).value;
    if (controlName === 'scheduledDateTime' || controlName === 'dueDateTime') {
      this.displayedScheduledValue = input;
    }
  }

  onNativeDateChange(event: Event, controlName: string) {
    const input = (event.target as HTMLInputElement).value;
    this.activityForm.get(controlName)?.setValue(input);
    if (controlName === 'scheduledDateTime' || controlName === 'dueDateTime') {
      this.displayedScheduledValue = input;
    }
  }
  @ViewChild('scheduledPicker') scheduledPicker!: ElementRef<HTMLInputElement>;

  triggerCalendar(controlName: string) {
    if ((controlName === 'scheduledDateTime' || controlName === 'dueDateTime') && this.scheduledPicker) {
      this.scheduledPicker.nativeElement.showPicker?.(); // opens calendar on modern browsers
      this.scheduledPicker.nativeElement.click(); // fallback
    }
  }



  collapsedIndexes: number[] = [];

  toggleCollapse(index: number) {
    if (this.collapsedIndexes.includes(index)) {
      this.collapsedIndexes = this.collapsedIndexes.filter(i => i !== index);
    } else {
      this.collapsedIndexes.push(index);
    }
  }

  dropActivity(event: CdkDragDrop<any[]>) {
    moveItemInArray(this.activities.data, event.previousIndex, event.currentIndex);
    this.activities._updateChangeSubscription(); // Refresh display
  }

  getPriorityClass(priority: string | null | undefined): string {
    switch ((priority || '').toLowerCase()) {
      case 'high':
        return 'priority-high';
      case 'low':
        return 'priority-low';
      default:
        return 'priority-default';
    }
  }

  selectedIndex: number | null = null;

  onAddNewActivity() {
    this.selectedIndex = null;
    this.isEditing = true;   // Very important
    this.onReset();          // Reset form
  }


  selectActivity(index: number) {
    this.editActivity(index);
    this.selectedIndex = index;
    this.isEditing = true;   // Now we are in edit mode
  }


  onCancel() {
    this.selectedIndex = null;
    this.isEditing = false;  // Go back to summary
  }


  getCompletedCount(): number {
    return this.activities.data.filter(a => a.status === 'Completed').length;
  }

  getPendingCount(): number {
    return this.activities.data.filter(a => a.status !== 'Completed').length;
  }

  getPriorityCount(priority: string): number {
    return this.activities.data.filter(a => (a.priority || '').toLowerCase() === priority.toLowerCase()).length;
  }


}
