import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef,
  forwardRef, ElementRef, ViewChild
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { UiControlSize, UiLabelMode, UiValidationMessage } from '../shared/ui-types';

@Component({
  selector: 'ui-textbox',
  templateUrl: './uitextbox.component.html',
  styleUrls: ['./uitextbox.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => UiTextboxComponent),
    multi: true
  }]
})
export class UiTextboxComponent implements ControlValueAccessor {

  // ── Inputs ──
  @Input() label: string | null = null;
  @Input() labelMode: UiLabelMode = 'float';
  @Input() placeholder = '';
  @Input() type: 'text' | 'email' | 'password' | 'tel' | 'url' | 'number' = 'text';
  @Input() disabled = false;
  @Input() readonly = false;
  @Input() required = false;
  @Input() optional = false;
  @Input() maxlength: number | null = null;
  @Input() minlength: number | null = null;
  @Input() pattern: string | null = null;
  @Input() size: UiControlSize = 'md';
  @Input() width: string | null = null;
  @Input() height: string | null = null;
  @Input() clearable = false;
  @Input() prefix: string | null = null;
  @Input() suffix: string | null = null;
  @Input() messages: UiValidationMessage[] = [];
  @Input() autocomplete = 'off';
  @Input() ariaLabel: string | null = null;
  @Input() ariaDescribedBy: string | null = null;

  // ── Outputs ──
  @Output() valueChange = new EventEmitter<string>();
  @Output() blurred = new EventEmitter<void>();
  @Output() focused = new EventEmitter<void>();

  @ViewChild('inputRef') inputRef?: ElementRef<HTMLInputElement>;

  // ── State ──
  isFocused = false;
  innerValue = '';

  private onChange: (v: any) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private cdr: ChangeDetectorRef) {}

  // ── CVA ──
  writeValue(value: any): void {
    this.innerValue = value ?? '';
    this.cdr.markForCheck();
  }
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.cdr.markForCheck();
  }

  // ── Getters ──
  get hasValue(): boolean {
    return this.innerValue !== null && this.innerValue !== undefined && this.innerValue !== '';
  }

  get errorMessages(): UiValidationMessage[] {
    return this.messages.filter(m => m.type === 'error');
  }

  get hasError(): boolean {
    return this.errorMessages.length > 0;
  }

  get controlId(): string {
    return `ui-textbox-${Math.random().toString(36).substr(2, 9)}`;
  }

  // ── Handlers ──
  onInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.innerValue = val;
    this.onChange(val);
    this.valueChange.emit(val);
  }

  onFocus(): void {
    this.isFocused = true;
    this.focused.emit();
    this.cdr.markForCheck();
  }

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
    this.inputRef?.nativeElement?.focus();
    this.cdr.markForCheck();
  }
}
