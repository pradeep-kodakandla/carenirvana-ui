import { ChangeDetectionStrategy, Component, ElementRef, Input, ViewChild, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { ValueAccessorBase } from '../shared/valueaccessorbase';

@Component({
  selector: 'ui-datetime-picker',
  templateUrl: './uidatetimepicker.component.html',
  styleUrls: ['./uidatetimepicker.component.css'],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => UiDatetimePickerComponent),
    multi: true
  }],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UiDatetimePickerComponent extends ValueAccessorBase<Date | null> {
  /** If true, show a date-only input; otherwise a single datetime-local input with seconds. */
  @Input() dateOnly = false;

  @Input() placeholderDate = 'Select date';
  @Input() placeholderDateTime = 'Select date & time';
  @Input() min?: Date;
  @Input() max?: Date;

  /** Backing strings bound to the native input(s) */
  dateStr = '';       // yyyy-MM-dd
  datetimeStr = '';   // yyyy-MM-ddTHH:mm:ss   (seconds always included)

  @ViewChild('pickerInput', { static: false }) pickerInput?: ElementRef<HTMLInputElement>;

 override writeValue(value: Date | null): void {
    this._value = value;
    if (!value) {
      this.dateStr = '';
      this.datetimeStr = '';
      return;
    }
    const d = new Date(value);
    this.dateStr = this.toDateInputValue(d);
    this.datetimeStr = this.toDatetimeLocalValue(d);
  }

  onDateTimeChange(v: string) {
    if (!v) {
      this._value = null;
      this.onChange(null);
      return;
    }

    let out: Date;
    if (this.dateOnly) {
      const [y, m, d] = v.split('-').map(Number);
      out = new Date(y, m - 1, d, 0, 0, 0);
    } else {
      const [datePart, timePart = '00:00'] = v.split('T');
      const [y, m, d] = datePart.split('-').map(Number);
      const [hh, mi] = timePart.split(':').map(Number);
      out = new Date(y, m - 1, d, hh || 0, mi || 0, 0);
    }

    if (this.min && out < this.min) return;
    if (this.max && out > this.max) return;

    this._value = out;
    this.onChange(out);
  }

  /** Click anywhere to open picker */
  openPicker() {
    if (this.isDisabled) return;
    const el = this.pickerInput?.nativeElement;
    if (!el) return;
    if (typeof (el as any).showPicker === 'function') (el as any).showPicker();
    else {
      el.focus();
      el.click();
    }
  }

  now(event?: MouseEvent) {
    event?.stopPropagation();
    const n = new Date();
    if (this.dateOnly) this.dateStr = this.toDateInputValue(n);
    else this.datetimeStr = this.toDatetimeLocalValue(n);
    this.onChange(n);
    this.onTouched();
  }

  clear(event?: MouseEvent) {
    event?.stopPropagation();
    this.dateStr = '';
    this.datetimeStr = '';
    this.onChange(null);
    this.onTouched();
  }

  toDateInputValue(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  toDatetimeLocalValue(d: Date): string {
    const yyyy = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const DD = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${MM}-${DD}T${hh}:${mi}`;
  }
}
