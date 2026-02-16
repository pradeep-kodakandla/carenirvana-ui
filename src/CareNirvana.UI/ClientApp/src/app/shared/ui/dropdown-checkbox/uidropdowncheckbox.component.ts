import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef,
  forwardRef, ElementRef, ViewChild, OnChanges,
  SimpleChanges, HostListener
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { UiOption, UiControlSize, UiLabelMode, UiValidationMessage } from '../shared/ui-types';

@Component({
  selector: 'ui-dropdown-checkbox',
  templateUrl: './uidropdowncheckbox.component.html',
  styleUrls: ['./uidropdowncheckbox.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => UiDropdownCheckboxComponent),
    multi: true
  }]
})
export class UiDropdownCheckboxComponent implements ControlValueAccessor, OnChanges {

  @Input() options: UiOption[] = [];
  @Input() label: string | null = null;
  @Input() labelMode: UiLabelMode = 'float';
  @Input() placeholder = 'Select...';
  @Input() searchPlaceholder = 'Type to search...';
  @Input() disabled = false;
  @Input() required = false;
  @Input() optional = false;
  @Input() searchable = true;
  @Input() clearable = true;
  @Input() selectAll = true;
  @Input() maxPanelHeight = 280;
  @Input() maxDisplayChips = 3;
  @Input() size: UiControlSize = 'md';
  @Input() width: string | null = null;
  @Input() height: string | null = null;
  @Input() messages: UiValidationMessage[] = [];
  @Input() ariaLabel: string | null = null;
  @Input() noResultsText = 'No results found';

  @Output() valueChange = new EventEmitter<any[]>();
  @Output() opened = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLElement>;

  isOpen = false;
  isFocused = false;
  searchTerm = '';
  filteredOptions: UiOption[] = [];
  highlightedIndex = -1;
  private selectedValues: any[] = [];

  private onChange: (v: any) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private cdr: ChangeDetectorRef) {}

  writeValue(value: any): void {
    this.selectedValues = Array.isArray(value) ? [...value] : [];
    this.cdr.markForCheck();
  }
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled = d; this.cdr.markForCheck(); }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options']) this.applyFilter();
  }

  // ── Getters ──
  get value(): any[] { return this.selectedValues; }

  get hasValue(): boolean { return this.selectedValues.length > 0; }

  get hasError(): boolean { return this.messages.some(m => m.type === 'error'); }

  get selectedOptions(): UiOption[] {
    return this.options.filter(o => this.selectedValues.includes(o.value));
  }

  get displayText(): string {
    const sel = this.selectedOptions;
    if (sel.length === 0) return '';
    if (sel.length <= this.maxDisplayChips) return sel.map(o => o.label).join(', ');
    return `${sel.length} selected`;
  }

  get visibleChips(): UiOption[] {
    return this.selectedOptions.slice(0, this.maxDisplayChips);
  }

  get remainingCount(): number {
    return Math.max(0, this.selectedOptions.length - this.maxDisplayChips);
  }

  get allSelected(): boolean {
    const enabled = this.filteredOptions.filter(o => !o.disabled);
    return enabled.length > 0 && enabled.every(o => this.selectedValues.includes(o.value));
  }

  get someSelected(): boolean {
    const enabled = this.filteredOptions.filter(o => !o.disabled);
    const count = enabled.filter(o => this.selectedValues.includes(o.value)).length;
    return count > 0 && count < enabled.length;
  }

  isSelected(opt: UiOption): boolean {
    return this.selectedValues.includes(opt.value);
  }

  trackByValue(_i: number, item: UiOption): any { return item.value; }

  // ── Open / Close ──
  togglePanel(): void {
    if (this.disabled) return;
    this.isOpen ? this.closePanel() : this.openPanel();
  }

  openPanel(): void {
    if (this.disabled || this.isOpen) return;
    this.isOpen = true;
    this.isFocused = true;
    this.searchTerm = '';
    this.applyFilter();
    this.opened.emit();
    this.cdr.markForCheck();
    setTimeout(() => this.searchInputRef?.nativeElement?.focus());
  }

  closePanel(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.isFocused = false;
    this.searchTerm = '';
    this.onTouched();
    this.closed.emit();
    this.cdr.markForCheck();
  }

  // ── Filter ──
  onSearchChange(term: string): void {
    this.searchTerm = term;
    this.applyFilter();
  }

  private applyFilter(): void {
    const term = (this.searchTerm || '').toLowerCase();
    if (!term) {
      this.filteredOptions = [...this.options];
    } else {
      this.filteredOptions = this.options.filter(o => o.label.toLowerCase().includes(term));
    }
    this.cdr.markForCheck();
  }

  // ── Selection ──
  toggleOption(opt: UiOption, event?: MouseEvent): void {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    if (opt.disabled) return;
    const idx = this.selectedValues.indexOf(opt.value);
    if (idx >= 0) {
      this.selectedValues = this.selectedValues.filter(v => v !== opt.value);
    } else {
      this.selectedValues = [...this.selectedValues, opt.value];
    }
    this.emitChange();
  }

  toggleSelectAll(): void {
    const enabled = this.filteredOptions.filter(o => !o.disabled);
    if (this.allSelected) {
      const removeSet = new Set(enabled.map(o => o.value));
      this.selectedValues = this.selectedValues.filter(v => !removeSet.has(v));
    } else {
      const current = new Set(this.selectedValues);
      enabled.forEach(o => current.add(o.value));
      this.selectedValues = Array.from(current);
    }
    this.emitChange();
  }

  removeChip(opt: UiOption, event?: MouseEvent): void {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    this.selectedValues = this.selectedValues.filter(v => v !== opt.value);
    this.emitChange();
  }

  clearAll(event?: MouseEvent): void {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    this.selectedValues = [];
    this.emitChange();
  }

  private emitChange(): void {
    this.onChange(this.selectedValues);
    this.valueChange.emit(this.selectedValues);
    this.cdr.markForCheck();
  }

  // ── Keyboard ──
  onControlKeydown(event: KeyboardEvent): void {
    if (this.disabled) return;
    switch (event.key) {
      case 'Enter': case ' ':
        event.preventDefault(); this.togglePanel(); break;
      case 'ArrowDown':
        event.preventDefault();
        if (!this.isOpen) this.openPanel(); break;
      case 'Escape':
        if (this.isOpen) { event.preventDefault(); this.closePanel(); } break;
      case 'Tab': this.closePanel(); return;
    }
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (!this.isOpen) return;
    switch (event.key) {
      case 'Escape': event.preventDefault(); this.closePanel(); break;
      case 'Tab': this.closePanel(); return;
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen) return;
    if (!(event.target as Node) || !this.containerRef.nativeElement.contains(event.target as Node)) {
      this.closePanel();
    }
  }
}
