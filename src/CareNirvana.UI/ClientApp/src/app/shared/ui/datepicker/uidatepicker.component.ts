import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef,
  forwardRef
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { UiControlSize, UiLabelMode, UiValidationMessage } from '../shared/ui-types';

@Component({
  selector: 'ui-datepicker',
  templateUrl: './uidatepicker.component.html',
  styleUrls: ['./uidatepicker.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => UiDatepickerComponent),
    multi: true
  }]
})
export class UiDatepickerComponent implements ControlValueAccessor {

  @Input() label: string | null = null;
  @Input() labelMode: UiLabelMode = 'float';
  @Input() placeholder = 'mm/dd/yyyy';
  @Input() disabled = false;
  @Input() readonly = false;
  @Input() required = false;
  @Input() optional = false;
  @Input() min: string | null = null;
  @Input() max: string | null = null;
  @Input() size: UiControlSize = 'md';
  @Input() width: string | null = null;
  @Input() height: string | null = null;
  @Input() messages: UiValidationMessage[] = [];
  @Input() ariaLabel: string | null = null;

  @Output() valueChange = new EventEmitter<string>();
  @Output() blurred = new EventEmitter<void>();

  isFocused = false;
  innerValue = '';

  private onChange: (v: any) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private cdr: ChangeDetectorRef) {}

  writeValue(value: any): void {
    this.innerValue = value ?? '';
    this.cdr.markForCheck();
  }
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void {
    this.disabled = d; this.cdr.markForCheck();
  }

  get hasValue(): boolean { return !!this.innerValue; }
  get hasError(): boolean { return this.messages.some(m => m.type === 'error'); }

  onInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.innerValue = val;
    this.onChange(val);
    this.valueChange.emit(val);
  }

  onFocus(): void { this.isFocused = true; this.cdr.markForCheck(); }

  onBlur(): void {
    this.isFocused = false;
    this.onTouched();
    this.blurred.emit();
    this.cdr.markForCheck();
  }

  clear(event?: MouseEvent): void {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    this.innerValue = '';
    this.onChange('');
    this.valueChange.emit('');
    this.cdr.markForCheck();
  }
}
