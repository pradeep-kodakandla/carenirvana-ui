import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef,
  forwardRef, ElementRef, ViewChild, OnChanges,
  SimpleChanges, HostListener
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { UiOption, UiControlSize, UiLabelMode, UiValidationMessage } from '../shared/ui-types';

export interface UiColumnDef {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

@Component({
  selector: 'ui-multi-column-dropdown',
  templateUrl: './uimulticolumndropdown.component.html',
  styleUrls: ['./uimulticolumndropdown.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => UiMultiColumnDropdownComponent),
    multi: true
  }]
})
export class UiMultiColumnDropdownComponent implements ControlValueAccessor, OnChanges {

  @Input() options: UiOption[] = [];
  @Input() columns: UiColumnDef[] = [];
  @Input() label: string | null = null;
  @Input() labelMode: UiLabelMode = 'float';
  @Input() placeholder = 'Search...';
  @Input() searchPlaceholder = 'Type to search...';
  @Input() disabled = false;
  @Input() required = false;
  @Input() optional = false;
  @Input() clearable = true;
  @Input() minSearchLength = 0;
  @Input() maxPanelHeight = 320;
  @Input() panelWidth: string | null = null;
  @Input() size: UiControlSize = 'md';
  @Input() width: string | null = null;
  @Input() height: string | null = null;
  @Input() messages: UiValidationMessage[] = [];
  @Input() ariaLabel: string | null = null;
  @Input() noResultsText = 'No results found';

  @Output() valueChange = new EventEmitter<any>();
  @Output() selectionChange = new EventEmitter<UiOption | null>();
  @Output() opened = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLElement>;

  isOpen = false;
  isFocused = false;
  searchTerm = '';
  filteredOptions: UiOption[] = [];
  highlightedIndex = -1;
  private innerValue: any = null;

  private onChange: (v: any) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private cdr: ChangeDetectorRef) {}

  writeValue(obj: any): void { this.innerValue = obj; this.cdr.markForCheck(); }
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled = d; this.cdr.markForCheck(); }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options']) this.applyFilter();
  }

  get selectedOption(): UiOption | null {
    if (this.innerValue == null) return null;
    return this.options.find(o => o.value === this.innerValue) ?? null;
  }

  get selectedLabel(): string | null { return this.selectedOption?.label ?? null; }
  get hasValue(): boolean { return this.selectedLabel !== null; }
  get hasError(): boolean { return this.messages.some(m => m.type === 'error'); }

  isSelected(opt: UiOption): boolean { return this.innerValue === opt.value; }
  trackByValue(_i: number, item: UiOption): any { return item.value; }

  getColumnValue(opt: UiOption, key: string): string {
    if (key === 'label') return opt.label;
    return opt.columns?.[key]?.toString() ?? '';
  }

  // ── Panel ──
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
    this.syncHighlight();
    this.opened.emit();
    this.cdr.markForCheck();
    setTimeout(() => this.searchInputRef?.nativeElement?.focus());
  }

  closePanel(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.isFocused = false;
    this.searchTerm = '';
    this.highlightedIndex = -1;
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
    if (!term || term.length < this.minSearchLength) {
      this.filteredOptions = [...this.options];
    } else {
      this.filteredOptions = this.options.filter(opt => {
        if (opt.label.toLowerCase().includes(term)) return true;
        if (opt.columns) {
          return Object.values(opt.columns).some(v =>
            v?.toString().toLowerCase().includes(term)
          );
        }
        return false;
      });
    }
    if (this.highlightedIndex >= this.filteredOptions.length) {
      this.highlightedIndex = this.filteredOptions.length ? 0 : -1;
    }
    this.cdr.markForCheck();
  }

  // ── Selection ──
  optionClick(opt: UiOption): void {
    if (opt.disabled) return;
    this.innerValue = opt.value;
    this.onChange(opt.value);
    this.valueChange.emit(opt.value);
    this.selectionChange.emit(opt);
    this.closePanel();
  }

  clear(event?: MouseEvent): void {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    this.innerValue = null;
    this.onChange(null);
    this.valueChange.emit(null);
    this.selectionChange.emit(null);
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
        this.isOpen ? this.moveHighlight(1) : this.openPanel(); break;
      case 'ArrowUp':
        event.preventDefault();
        if (this.isOpen) this.moveHighlight(-1); break;
      case 'Escape':
        if (this.isOpen) { event.preventDefault(); this.closePanel(); } break;
      case 'Tab': this.closePanel(); return;
    }
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (!this.isOpen) return;
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); this.moveHighlight(1); break;
      case 'ArrowUp': event.preventDefault(); this.moveHighlight(-1); break;
      case 'Enter':
        event.preventDefault();
        if (this.highlightedIndex >= 0) {
          this.optionClick(this.filteredOptions[this.highlightedIndex]);
        } break;
      case 'Escape': event.preventDefault(); this.closePanel(); break;
      case 'Tab': this.closePanel(); return;
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

  private syncHighlight(): void {
    if (!this.selectedOption) {
      this.highlightedIndex = this.filteredOptions.length ? 0 : -1;
      return;
    }
    const idx = this.filteredOptions.findIndex(o => o.value === this.selectedOption!.value);
    this.highlightedIndex = idx >= 0 ? idx : 0;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen) return;
    if (!(event.target as Node) || !this.containerRef.nativeElement.contains(event.target as Node)) {
      this.closePanel();
    }
  }
}
