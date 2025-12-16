import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  forwardRef,
  Input,
  Output
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { DateTime } from 'luxon';
import { ViewChild } from '@angular/core';
import { DatePickerComponent, DateTimePickerComponent } from '@progress/kendo-angular-dateinputs';

export type SmartDateTimeMode = 'date' | 'datetime';

export interface TimeZoneOption {
  /** IANA zone id, e.g. America/New_York */
  id: string;
  /** What the user sees, e.g. "EST/EDT (New York)" */
  label: string;
}

@Component({
  selector: 'app-uismartdatetime',
  templateUrl: './uismartdatetime.component.html',
  styleUrl: './uismartdatetime.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UismartdatetimeComponent),
      multi: true
    }
  ]
})
export class UismartdatetimeComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() mode: SmartDateTimeMode = 'datetime';

  /** Default: "MM/dd/yyyy HH:mm:ss" (24-hour with seconds) */
  @Input() dateFormat = 'MM/dd/yyyy';
  @Input() dateTimeFormat = 'MM/dd/yyyy HH:mm:ss';

  /** Commit changes immediately or only on blur (helps heavy forms). */
  @Input() commit: 'change' | 'blur' = 'change';

  /** Timezone dropdown */
  @Input() showTimezone = true;
  @Input() timezones: TimeZoneOption[] = [
    { id: 'America/New_York', label: 'EST/EDT (New York)' },
    { id: 'America/Chicago', label: 'CST/CDT (Chicago)' },
    { id: 'America/Denver', label: 'MST/MDT (Denver)' },
    { id: 'America/Los_Angeles', label: 'PST/PDT (Los Angeles)' },
    { id: 'UTC', label: 'UTC' }
  ];
  @Input() timezone = 'America/New_York';

  /** Optional min/max (in UTC Date “instant”) */
  @Input() min: Date | null = null;
  @Input() max: Date | null = null;

  /** Enable typing shortcuts: D, D+1, D-1 */
  @Input() enableDShortcuts = true;

  /** Emits the stored UTC instant (Date) whenever it changes */
  @Output() utcValueChange = new EventEmitter<Date | null>();

  disabled = false;

  // Stored value as an instant (UTC timestamp in JS Date)
  private utcValue: Date | null = null;

  // What we feed into Kendo (a “display date” in local zone but representing selected timezone wall-clock)
  viewValue: Date | null = null;

  private pendingUtc: Date | null = null;

  private readonly localZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  constructor(private cdr: ChangeDetectorRef) { }

  // ---- ControlValueAccessor ----
  writeValue(value: Date | null): void {
    this.utcValue = value ?? null;
    this.pendingUtc = this.utcValue;
    this.viewValue = this.toViewDate(this.utcValue);
    this.cdr.markForCheck();
  }

  private onChange: (value: Date | null) => void = () => { };
  private onTouched: () => void = () => { };

  registerOnChange(fn: (value: Date | null) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.cdr.markForCheck();
  }

  // ---- UI bindings ----
  get format(): string {
    return this.mode === 'date' ? this.dateFormat : this.dateTimeFormat;
  }

  get placeholder(): string {
    return this.format; // Kendo supports placeholder input :contentReference[oaicite:2]{index=2}
  }

  get steps(): any {
    // Kendo supports second steps :contentReference[oaicite:3]{index=3}
    return this.mode === 'datetime' ? { second: 1 } : { day: 1 };
  }

  timezoneChanged(zoneId: string): void {
    this.timezone = zoneId;
    // Recompute display without changing the instant
    this.viewValue = this.toViewDate(this.utcValue);
    this.cdr.markForCheck();
  }

  kendoValueChange(viewDate: Date | null): void {
    const utc = this.fromViewDate(viewDate);
    this.pendingUtc = utc;

    if (this.commit === 'change') {
      this.commitPending();
    } else {
      // show updates visually, but delay form update until blur
      this.utcValue = utc;
      this.viewValue = this.toViewDate(this.utcValue);
      this.utcValueChange.emit(this.utcValue);
      this.cdr.markForCheck();
    }
  }

  get minView(): Date | null {
    return this.min ? this.toViewDate(this.min) : null;
  }

  get maxView(): Date | null {
    return this.max ? this.toViewDate(this.max) : null;
  }

  //kendoBlur(e: any): void {
  //  // Support D / D+1 / D-1
  //  if (this.enableDShortcuts) {
  //    const raw = (e?.target?.value ?? '').toString().trim();
  //    const shortcutUtc = this.parseDShortcutToUtc(raw);
  //    if (shortcutUtc !== undefined) {
  //      this.pendingUtc = shortcutUtc;
  //      this.utcValue = shortcutUtc;
  //      this.viewValue = this.toViewDate(this.utcValue);
  //      this.cdr.markForCheck();
  //    }
  //  }

  //  if (this.commit === 'blur') {
  //    this.commitPending();
  //  }

  //  this.onTouched();
  //}

  private commitPending(): void {
    this.utcValue = this.pendingUtc ?? null;
    this.viewValue = this.toViewDate(this.utcValue);

    this.onChange(this.utcValue);
    this.utcValueChange.emit(this.utcValue);

    this.cdr.markForCheck();
  }

  // ---- Timezone conversion helpers ----
  private toViewDate(utc: Date | null): Date | null {
    if (!utc) return null;

    // Instant -> selected zone wall-clock
    const dtSelected = DateTime.fromJSDate(utc, { zone: 'utc' }).setZone(this.timezone);

    // Create a LOCAL-zone Date with the same wall-clock so Kendo displays it as desired
    const dtLocalDisplay = DateTime.fromObject(
      {
        year: dtSelected.year,
        month: dtSelected.month,
        day: dtSelected.day,
        hour: this.mode === 'date' ? 0 : dtSelected.hour,
        minute: this.mode === 'date' ? 0 : dtSelected.minute,
        second: this.mode === 'date' ? 0 : dtSelected.second,
        millisecond: 0
      },
      { zone: this.localZone }
    );

    return dtLocalDisplay.toJSDate();
  }

  private fromViewDate(view: Date | null): Date | null {
    if (!view) return null;

    // Read LOCAL wall-clock from picker
    const dtLocal = DateTime.fromJSDate(view, { zone: this.localZone });

    // Interpret that wall-clock as SELECTED timezone
    let dtSelected = DateTime.fromObject(
      {
        year: dtLocal.year,
        month: dtLocal.month,
        day: dtLocal.day,
        hour: this.mode === 'date' ? 0 : dtLocal.hour,
        minute: this.mode === 'date' ? 0 : dtLocal.minute,
        second: this.mode === 'date' ? 0 : dtLocal.second,
        millisecond: 0
      },
      { zone: this.timezone }
    );

    if (this.mode === 'date') {
      dtSelected = dtSelected.startOf('day');
    }

    return dtSelected.toUTC().toJSDate();
  }

  /**
   * Returns:
   * - Date|null if input matches D shortcuts
   * - undefined if not a D shortcut (so we do nothing)
   */
  private parseDShortcutToUtc(raw: string): Date | null | undefined {
    if (!raw) return undefined;

    const m = raw.match(/^D\s*([+-]\s*\d+)?$/i);
    if (!m) return undefined;

    const offsetDays = m[1] ? parseInt(m[1].replace(/\s+/g, ''), 10) : 0;

    let dt = DateTime.now().setZone(this.timezone).plus({ days: offsetDays });

    if (this.mode === 'date') {
      dt = dt.startOf('day');
    } else {
      dt = dt.set({ millisecond: 0 });
    }

    return dt.toUTC().toJSDate();
  }

  @ViewChild('dp') private dp?: DatePickerComponent;
  @ViewChild('dtp') private dtp?: DateTimePickerComponent;

  // keep last raw text typed (so D doesn't get lost)
  private rawInput = '';

  // Kendo inputAttributes exists for the inner input :contentReference[oaicite:2]{index=2}
  public inputAttrs: { [key: string]: string } = {
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false'
  };

  // Kendo min/max are typed as Date, not nullable :contentReference[oaicite:3]{index=3}
  private readonly FALLBACK_MIN = new Date(1900, 0, 1, 0, 0, 0);
  private readonly FALLBACK_MAX = new Date(2099, 11, 31, 23, 59, 59);

  openPicker(e: MouseEvent): void {
    if (this.disabled) return;

    // clicking on timezone shouldn't open date popup
    const target = e.target as HTMLElement | null;
    if (target?.closest('.smart-dt__tz')) return;

    const picker = this.mode === 'date' ? this.dp : this.dtp;

    // Kendo supports programmatic toggle(true) :contentReference[oaicite:4]{index=4}
    picker?.toggle(true);
    picker?.focus?.();
  }

  captureRaw(evt: any): void {
    const input = this.findInnerInput(evt);
    if (input) {
      this.rawInput = (input.value ?? '').toString();
    }
  }

  private findInnerInput(evt: any): HTMLInputElement | null {
    const t = evt?.target as HTMLElement | null;
    if (!t) return null;

    if (t.tagName === 'INPUT') return t as HTMLInputElement;

    const host = t.closest('kendo-datepicker, kendo-datetimepicker');
    return host ? (host.querySelector('input') as HTMLInputElement | null) : null;
  }

  kendoBlur(e: any): void {
    // refresh rawInput before parsing
    this.captureRaw(e);

    if (this.enableDShortcuts) {
      const raw = (this.rawInput || '').trim();
      const shortcutUtc = this.parseDShortcutToUtc(raw);

      if (shortcutUtc !== undefined) {
        // apply shortcut result
        this.pendingUtc = shortcutUtc;
        this.utcValue = shortcutUtc;
        this.viewValue = this.toViewDate(this.utcValue);
        this.rawInput = '';
        this.cdr.markForCheck();
      }
    }

    if (this.commit === 'blur') {
      this.commitPending();
    }

    this.onTouched();
  }


}
