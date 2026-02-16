import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef, forwardRef
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { UiOption, UiValidationMessage } from '../shared/ui-types';

@Component({
  selector: 'ui-radio-group',
  templateUrl: './uiradio.component.html',
  styleUrls: ['./uiradio.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => UiRadioGroupComponent),
    multi: true
  }]
})
export class UiRadioGroupComponent implements ControlValueAccessor {

  @Input() options: UiOption[] = [];
  @Input() label: string | null = null;
  @Input() name = `ui-radio-${Math.random().toString(36).substr(2, 6)}`;
  @Input() disabled = false;
  @Input() required = false;
  @Input() inline = false;
  @Input() messages: UiValidationMessage[] = [];
  @Input() ariaLabel: string | null = null;

  @Output() valueChange = new EventEmitter<any>();

  innerValue: any = null;

  private onChange: (v: any) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private cdr: ChangeDetectorRef) {}

  writeValue(value: any): void { this.innerValue = value; this.cdr.markForCheck(); }
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled = d; this.cdr.markForCheck(); }

  get hasError(): boolean { return this.messages.some(m => m.type === 'error'); }

  isSelected(opt: UiOption): boolean { return this.innerValue === opt.value; }

  select(opt: UiOption): void {
    if (opt.disabled || this.disabled) return;
    this.innerValue = opt.value;
    this.onChange(opt.value);
    this.valueChange.emit(opt.value);
    this.cdr.markForCheck();
  }

  onBlur(): void { this.onTouched(); }
}
