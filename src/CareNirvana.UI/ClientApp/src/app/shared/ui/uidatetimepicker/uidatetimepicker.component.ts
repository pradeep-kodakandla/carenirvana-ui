import { ChangeDetectionStrategy, Component, ElementRef, Input, ViewChild, forwardRef } from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { ValueAccessorBase } from '../shared/valueaccessorbase';

type TimeFormat = '12' | '24';

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
  /** If true: date only; else: date + time */
  @Input() dateOnly = false;

  /** '12' => show AM/PM (default), '24' => 24-hour */
  @Input() timeFormat: TimeFormat = '12';

  @Input() placeholderDate = 'mm/dd/yyyy';
  @Input() placeholderDateTime = 'mm/dd/yyyy --:--:-- AM';

  @Input() min?: Date;
  @Input() max?: Date;

  /** Backing strings for native picker */
  dateStr = '';        // yyyy-MM-dd
  datetimeStr = '';    // yyyy-MM-ddTHH:mm:ss

  /** Visible text input */
  displayValue = '';
  private rawText = '';
  private isEditing = false;

  @ViewChild('pickerInput', { static: false }) pickerInput?: ElementRef<HTMLInputElement>;

  override writeValue(value: Date | null): void {
    this._value = value;

    if (!value) {
      this.dateStr = '';
      this.datetimeStr = '';
      if (!this.isEditing) {
        this.displayValue = '';
        this.rawText = '';
      }
      return;
    }

    const d = new Date(value);

    // Keep seconds
    this.dateStr = this.toDateInputValue(d);
    this.datetimeStr = this.toDatetimeLocalValue(d);

    // CRITICAL: do NOT overwrite the user's typing (prevents "refresh" while editing)
    if (!this.isEditing) {
      this.displayValue = this.formatDisplayValue(d);
      this.rawText = this.displayValue;
    }
  }

  // -------------------------
  // Editing lifecycle (prevents refresh/reset while typing)
  // -------------------------
  startEdit() {
    this.isEditing = true;
  }

  onTextInput(v: string) {
    this.rawText = v ?? '';
    this.displayValue = this.rawText;
  }

  commitText(): void {
    // end editing first so writeValue() can safely update formatted value after setValue()
    this.isEditing = false;

    const v = (this.rawText ?? '').trim();
    if (!v) {
      this.setValue(null);
      return;
    }

    // 1) D, D+N, D-N
    const rel = this.tryParseRelative(v);
    if (rel) {
      this.setValue(rel);
      return;
    }

    // 2) typed date/time formats (with seconds + optional AM/PM)
    const parsed = this.tryParseUserDate(v);
    if (parsed) {
      this.setValue(parsed);
      return;
    }

    // invalid: keep user text visible, don’t emit junk value
    this.displayValue = v;
    this.rawText = v;
  }

  // -------------------------
  // Native picker
  // -------------------------
  onNativePickerChange(v: string) {
    if (!v) {
      this.setValue(null);
      return;
    }

    let out: Date;

    if (this.dateOnly) {
      const [y, m, d] = v.split('-').map(Number);
      out = new Date(y, m - 1, d, 0, 0, 0, 0);
    } else {
      // yyyy-MM-ddTHH:mm[:ss]
      const [datePart, timePart = '00:00'] = v.split('T');
      const [y, m, d] = datePart.split('-').map(Number);

      const t = timePart.split(':').map(Number);
      const hh = t[0] ?? 0;
      const mi = t[1] ?? 0;

      // If seconds not supplied by browser, preserve existing seconds if we have them; else 0
      const existingSec = this._value ? new Date(this._value).getSeconds() : 0;
      const ss = (t.length >= 3 && Number.isFinite(t[2])) ? (t[2] ?? 0) : existingSec;

      out = new Date(y, m - 1, d, hh, mi, ss, 0);
    }

    this.setValue(out);
  }

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

  // -------------------------
  // Core setValue (min/max + sync UI strings)
  // -------------------------
  private setValue(out: Date | null): void {
    if (out) {
      if (this.min && out < this.min) return;
      if (this.max && out > this.max) return;
    }

    this._value = out;
    this.onChange(out);
    this.onTouched();

    if (!out) {
      this.dateStr = '';
      this.datetimeStr = '';
      this.displayValue = '';
      this.rawText = '';
      return;
    }

    const d = new Date(out);
    this.dateStr = this.toDateInputValue(d);
    this.datetimeStr = this.toDatetimeLocalValue(d);

    // update display in chosen format (12/24, AM/PM) AFTER commit
    this.displayValue = this.formatDisplayValue(d);
    this.rawText = this.displayValue;
  }

  // -------------------------
  // Relative parser: D / D+N / D-N
  // -------------------------
  private tryParseRelative(input: string): Date | null {
    const m = input.match(/^\s*[dD]\s*(?:([+-])\s*(\d+)\s*)?$/);
    if (!m) return null;

    const sign = m[1];
    const num = m[2];
    const offset = num ? parseInt(num, 10) * (sign === '-' ? -1 : 1) : 0;

    const base = new Date(); // "D" means now
    // Keep seconds (requirement) but clear ms for stability
    base.setMilliseconds(0);

    if (this.dateOnly) {
      base.setHours(0, 0, 0, 0);
    }

    if (offset !== 0) base.setDate(base.getDate() + offset);
    return base;
  }

  // -------------------------
  // Typed parser (supports seconds + optional AM/PM)
  // -------------------------
  private tryParseUserDate(input: string): Date | null {
    const s = input.trim();

    // yyyy-MM-dd
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0);

    // MM/dd/yyyy
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(+m[3], +m[1] - 1, +m[2], 0, 0, 0, 0);

    // yyyy-MM-ddTHH:mm[:ss]
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const ss = m[6] ? +m[6] : 0;
      return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], ss, 0);
    }

    // MM/dd/yyyy HH:mm[:ss] (24h)
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const ss = m[6] ? +m[6] : 0;
      return new Date(+m[3], +m[1] - 1, +m[2], +m[4], +m[5], ss, 0);
    }

    // MM/dd/yyyy h:mm[:ss] AM|PM  (12h)
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if (m) {
      const mo = +m[1], d = +m[2], y = +m[3];
      let hh = +m[4];
      const mi = +m[5];
      const ss = m[6] ? +m[6] : 0;
      const ap = (m[7] ?? '').toUpperCase();

      if (hh === 12) hh = 0;
      if (ap === 'PM') hh += 12;

      return new Date(y, mo - 1, d, hh, mi, ss, 0);
    }

    return null;
  }

  // -------------------------
  // Formatting (12/24 + seconds + AM/PM)
  // -------------------------
  private formatDisplayValue(d: Date): string {
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const DD = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();

    if (this.dateOnly) {
      return `${MM}/${DD}/${yyyy}`;
    }

    const sec = String(d.getSeconds()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');

    if (this.timeFormat === '24') {
      const hr = String(d.getHours()).padStart(2, '0');
      return `${MM}/${DD}/${yyyy} ${hr}:${min}:${sec}`;
    }

    // 12-hour with AM/PM
    let h = d.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;

    const hr12 = String(h).padStart(2, '0');
    return `${MM}/${DD}/${yyyy} ${hr12}:${min}:${sec} ${ampm}`;
  }

  // -------------------------
  // Native input value builders (keep seconds)
  // -------------------------
  toDateInputValue(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  toDatetimeLocalValue(d: Date): string {
    const yyyy = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const DD = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${yyyy}-${MM}-${DD}T${hh}:${mi}:${ss}`;
  }
  //onFieldClick(event: MouseEvent) {
  //  if (this.isDisabled) return;

  //  const target = event.target as HTMLElement;

  //  // If user clicked the calendar button, openPicker() already handled it
  //  if (target.closest('button')) return;

  //  // Clicking anywhere else opens the picker
  //  this.openPicker();
  //}

}
