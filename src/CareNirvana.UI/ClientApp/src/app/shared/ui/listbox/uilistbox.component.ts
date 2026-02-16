import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef, forwardRef
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { UiOption, UiControlSize, UiValidationMessage } from '../shared/ui-types';

@Component({
  selector: 'ui-listbox',
  templateUrl: './uilistbox.component.html',
  styleUrls: ['./uilistbox.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => UiListboxComponent),
    multi: true
  }]
})
export class UiListboxComponent implements ControlValueAccessor {

  @Input() options: UiOption[] = [];
  @Input() label: string | null = null;
  @Input() disabled = false;
  @Input() required = false;
  @Input() optional = false;
  @Input() multiple = false;
  @Input() searchable = false;
  @Input() searchPlaceholder = 'Filter...';
  @Input() size: UiControlSize = 'md';
  @Input() width: string | null = null;
  @Input() height = '200px';
  @Input() messages: UiValidationMessage[] = [];
  @Input() ariaLabel: string | null = null;
  @Input() noResultsText = 'No results found';

  @Output() valueChange = new EventEmitter<any>();
  @Output() selectionChange = new EventEmitter<UiOption[]>();

  searchTerm = '';
  filteredOptions: UiOption[] = [];
  highlightedIndex = -1;
  private selectedValues: any[] = [];

  private onChange: (v: any) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private cdr: ChangeDetectorRef) {}

  writeValue(value: any): void {
    if (this.multiple) {
      this.selectedValues = Array.isArray(value) ? [...value] : [];
    } else {
      this.selectedValues = value != null ? [value] : [];
    }
    this.cdr.markForCheck();
  }
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled = d; this.cdr.markForCheck(); }

  ngOnInit(): void { this.applyFilter(); }

  ngOnChanges(): void { this.applyFilter(); }

  get hasError(): boolean { return this.messages.some(m => m.type === 'error'); }

  isSelected(opt: UiOption): boolean {
    return this.selectedValues.includes(opt.value);
  }

  trackByValue(_i: number, item: UiOption): any { return item.value; }

  onSearchChange(term: string): void {
    this.searchTerm = term;
    this.applyFilter();
  }

  private applyFilter(): void {
    const term = (this.searchTerm || '').toLowerCase();
    this.filteredOptions = !term
      ? [...this.options]
      : this.options.filter(o => o.label.toLowerCase().includes(term));
    this.cdr.markForCheck();
  }

  optionClick(opt: UiOption): void {
    if (opt.disabled || this.disabled) return;

    if (this.multiple) {
      const idx = this.selectedValues.indexOf(opt.value);
      if (idx >= 0) {
        this.selectedValues = this.selectedValues.filter(v => v !== opt.value);
      } else {
        this.selectedValues = [...this.selectedValues, opt.value];
      }
      this.onChange(this.selectedValues);
      this.valueChange.emit(this.selectedValues);
    } else {
      this.selectedValues = [opt.value];
      this.onChange(opt.value);
      this.valueChange.emit(opt.value);
    }

    this.selectionChange.emit(
      this.options.filter(o => this.selectedValues.includes(o.value))
    );
    this.cdr.markForCheck();
  }

  onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveHighlight(1); break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveHighlight(-1); break;
      case 'Enter': case ' ':
        event.preventDefault();
        if (this.highlightedIndex >= 0) {
          this.optionClick(this.filteredOptions[this.highlightedIndex]);
        } break;
    }
  }

  private moveHighlight(delta: number): void {
    if (!this.filteredOptions.length) return;
    let next = this.highlightedIndex + delta;
    if (next < 0) next = this.filteredOptions.length - 1;
    if (next >= this.filteredOptions.length) next = 0;
    this.highlightedIndex = next;
    this.cdr.markForCheck();
  }

  onBlur(): void { this.onTouched(); }
}
