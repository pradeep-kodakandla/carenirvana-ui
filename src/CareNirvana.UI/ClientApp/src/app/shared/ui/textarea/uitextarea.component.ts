import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef,
  forwardRef, ElementRef, ViewChild
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { UiControlSize, UiLabelMode, UiValidationMessage } from '../shared/ui-types';

@Component({
  selector: 'ui-textarea',
  templateUrl: './uitextarea.component.html',
  styleUrls: ['./uitextarea.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => UiTextareaComponent),
    multi: true
  }]
})
export class UiTextareaComponent implements ControlValueAccessor {

  @Input() label: string | null = null;
  @Input() labelMode: UiLabelMode = 'float';
  @Input() placeholder = '';
  @Input() disabled = false;
  @Input() readonly = false;
  @Input() required = false;
  @Input() optional = false;
  @Input() maxlength: number | null = null;
  @Input() minlength: number | null = null;
  @Input() rows = 4;
  @Input() resize: 'none' | 'vertical' | 'horizontal' | 'both' = 'vertical';
  @Input() autoResize = false;
  @Input() size: UiControlSize = 'md';
  @Input() width: string | null = null;
  @Input() height: string | null = null;
  @Input() messages: UiValidationMessage[] = [];
  @Input() ariaLabel: string | null = null;

  @Output() valueChange = new EventEmitter<string>();
  @Output() blurred = new EventEmitter<void>();
  @Output() focused = new EventEmitter<void>();

  @ViewChild('textareaRef') textareaRef?: ElementRef<HTMLTextAreaElement>;

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
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.cdr.markForCheck();
  }

  get hasValue(): boolean {
    return !!this.innerValue;
  }

  get hasError(): boolean {
    return this.messages.some(m => m.type === 'error');
  }

  onInput(event: Event): void {
    const val = (event.target as HTMLTextAreaElement).value;
    this.innerValue = val;
    this.onChange(val);
    this.valueChange.emit(val);

    if (this.autoResize) {
      this.adjustHeight();
    }
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

  private adjustHeight(): void {
    const el = this.textareaRef?.nativeElement;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }
}
