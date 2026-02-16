import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy, ChangeDetectorRef,
  forwardRef, ElementRef, ViewChild, OnChanges,
  SimpleChanges, HostListener
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { UiOption, UiControlSize, UiLabelMode, UiValidationMessage } from '../shared/ui-types';

@Component({
  selector: 'ui-dropdown',
  templateUrl: './uidropdown.component.html',
  styleUrls: ['./uidropdown.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => UiDropdownComponent),
    multi: true
  }]
})
export class UiDropdownComponent implements ControlValueAccessor, OnChanges {

  // ── Inputs ──
  @Input() options: UiOption[] = [];
  @Input() label: string | null = null;
  @Input() labelMode: UiLabelMode = 'float';
  @Input() placeholder = 'Select...';
  @Input() searchPlaceholder = 'Type to search...';
  @Input() disabled = false;
  @Input() required = false;
  @Input() optional = false;
  @Input() clearable = true;
  @Input() searchable = true;
  @Input() minSearchLength = 0;
  @Input() caseSensitive = false;
  @Input() maxPanelHeight = 260;
  @Input() size: UiControlSize = 'md';
  @Input() width: string | null = null;
  @Input() height: string | null = null;
  @Input() messages: UiValidationMessage[] = [];
  @Input() ariaLabel: string | null = null;
  @Input() autoOpenOnFocus = true;
  @Input() noResultsText = 'No results found';

  // ── Outputs ──
  @Output() valueChange = new EventEmitter<any>();
  @Output() selectionChange = new EventEmitter<UiOption | null>();
  @Output() opened = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLElement>;

  // ── State ──
  isOpen = false;
  isFocused = false;
  searchTerm = '';
  filteredOptions: UiOption[] = [];
  highlightedIndex = -1;
  private innerValue: any = null;
  private onChange: (v: any) => void = () => {};
  private onTouched: () => void = () => {};
  private lastInteractionWasKeyboard = false;

  constructor(
    private cdr: ChangeDetectorRef,
    private hostRef: ElementRef<HTMLElement>
  ) {}

  // ── CVA ──
  writeValue(obj: any): void {
    this.innerValue = obj;
    this.cdr.markForCheck();
  }
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.cdr.markForCheck();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options']) {
      this.applyFilter();
    }
  }

  // ── Getters ──
  get value(): any { return this.innerValue; }

  get selectedOption(): UiOption | null {
    if (this.innerValue == null) return null;
    return this.options.find(o => o.value === this.innerValue) ?? null;
  }

  get selectedLabel(): string | null {
    return this.selectedOption?.label ?? null;
  }

  get hasValue(): boolean {
    return this.selectedLabel !== null;
  }

  get hasError(): boolean {
    return this.messages.some(m => m.type === 'error');
  }

  trackByValue(_index: number, item: UiOption): any {
    return item.value;
  }

  isSelected(opt: UiOption): boolean {
    return this.innerValue === opt.value;
  }

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
    this.syncHighlightToSelected();
    this.opened.emit();
    this.cdr.markForCheck();

    setTimeout(() => {
      if (this.searchInputRef?.nativeElement) {
        this.searchInputRef.nativeElement.focus();
        this.searchInputRef.nativeElement.select();
      }
    });
  }

  closePanel(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.isFocused = false;
    this.highlightedIndex = -1;
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
    const term = this.searchTerm || '';
    if (!term || term.length < this.minSearchLength) {
      this.filteredOptions = [...this.options];
    } else {
      const t = this.caseSensitive ? term : term.toLowerCase();
      this.filteredOptions = this.options.filter(opt => {
        const lbl = this.caseSensitive ? opt.label : opt.label.toLowerCase();
        return lbl.includes(t);
      });
    }
    if (this.highlightedIndex >= this.filteredOptions.length) {
      this.highlightedIndex = this.filteredOptions.length ? 0 : -1;
    }
    this.cdr.markForCheck();
  }

  // ── Selection ──
  optionClick(option: UiOption): void {
    if (option.disabled) return;
    this.setValue(option.value);
    this.closePanel();
  }

  private setValue(value: any): void {
    if (this.innerValue !== value) {
      this.innerValue = value;
      this.onChange(value);
      this.valueChange.emit(value);
    }
    this.selectionChange.emit(this.selectedOption);
    this.cdr.markForCheck();
  }

  clear(event?: MouseEvent): void {
    if (event) { event.stopPropagation(); event.preventDefault(); }
    this.innerValue = null;
    this.onChange(null);
    this.valueChange.emit(null);
    this.selectionChange.emit(null);
    this.searchTerm = '';
    this.applyFilter();
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
      case 'Tab':
        this.closePanel(); return;
    }
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (!this.isOpen) return;
    switch (event.key) {
      case 'Tab': this.closePanel(); return;
      case 'ArrowDown': event.preventDefault(); this.moveHighlight(1); break;
      case 'ArrowUp': event.preventDefault(); this.moveHighlight(-1); break;
      case 'Enter':
        event.preventDefault();
        if (this.highlightedIndex >= 0 && this.highlightedIndex < this.filteredOptions.length) {
          this.optionClick(this.filteredOptions[this.highlightedIndex]);
        } break;
      case 'Escape': event.preventDefault(); this.closePanel(); break;
    }
  }

  onControlFocus(): void {
    this.isFocused = true;
    if (this.autoOpenOnFocus && this.lastInteractionWasKeyboard && !this.isOpen && !this.disabled) {
      this.openPanel();
    }
  }

  private moveHighlight(delta: number): void {
    if (!this.filteredOptions.length) { this.highlightedIndex = -1; return; }
    let next = this.highlightedIndex + delta;
    if (next < 0) next = this.filteredOptions.length - 1;
    else if (next >= this.filteredOptions.length) next = 0;
    let attempts = 0;
    while (this.filteredOptions[next]?.disabled && attempts < this.filteredOptions.length) {
      next += delta;
      if (next < 0) next = this.filteredOptions.length - 1;
      if (next >= this.filteredOptions.length) next = 0;
      attempts++;
    }
    this.highlightedIndex = next;
    this.scrollIntoView();
    this.cdr.markForCheck();
  }

  private syncHighlightToSelected(): void {
    if (!this.selectedOption) {
      this.highlightedIndex = this.filteredOptions.length ? 0 : -1;
      return;
    }
    const idx = this.filteredOptions.findIndex(o => o.value === this.selectedOption!.value);
    this.highlightedIndex = idx >= 0 ? idx : 0;
  }

  private scrollIntoView(): void {
    const panel = this.hostRef.nativeElement.querySelector('.ui-panel__options');
    if (!panel) return;
    const items = panel.querySelectorAll('.ui-panel__option');
    const el = items[this.highlightedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen) return;
    const target = event.target as Node;
    if (target && !this.containerRef.nativeElement.contains(target)) {
      this.closePanel();
    }
  }

  @HostListener('document:keydown')
  onGlobalKeydown(): void { this.lastInteractionWasKeyboard = true; }

  @HostListener('document:mousedown')
  onGlobalMousedown(): void { this.lastInteractionWasKeyboard = false; }
}
