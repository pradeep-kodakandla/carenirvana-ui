import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef, forwardRef
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { UiValidationMessage } from '../shared/ui-types';

@Component({
  selector: 'ui-checkbox',
  templateUrl: './uicheckbox.component.html',
  styleUrls: ['./uicheckbox.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => UiCheckboxComponent),
    multi: true
  }]
})
export class UiCheckboxComponent implements ControlValueAccessor {

  @Input() label = '';
  @Input() disabled = false;
  @Input() required = false;
  @Input() indeterminate = false;
  @Input() messages: UiValidationMessage[] = [];
  @Input() ariaLabel: string | null = null;

  @Output() valueChange = new EventEmitter<boolean>();

  innerValue = false;
  isFocused = false;

  private onChange: (v: any) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private cdr: ChangeDetectorRef) {}

  writeValue(value: any): void {
    this.innerValue = !!value;
    this.cdr.markForCheck();
  }
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled = d; this.cdr.markForCheck(); }

  get hasError(): boolean { return this.messages.some(m => m.type === 'error'); }

  toggle(): void {
    if (this.disabled) return;
    this.innerValue = !this.innerValue;
    this.indeterminate = false;
    this.onChange(this.innerValue);
    this.valueChange.emit(this.innerValue);
    this.cdr.markForCheck();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      this.toggle();
    }
  }

  onFocus(): void { this.isFocused = true; }
  onBlur(): void { this.isFocused = false; this.onTouched(); }
}
