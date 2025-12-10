import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ElementRef,
  ViewChild,
  forwardRef,
  OnChanges,
  SimpleChanges, HostListener
} from '@angular/core';
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR
} from '@angular/forms';

export interface UiSmartOption<T = any> {
  label: string;
  value: T;
  disabled?: boolean;
}

@Component({
  selector: 'ui-smart-dropdown',
  templateUrl: './uismartdropdown.component.html',
  styleUrls: ['./uismartdropdown.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UiSmartDropdownComponent),
      multi: true
    }
  ]
})
export class UiSmartDropdownComponent implements ControlValueAccessor, OnChanges {
  // === Inputs ===
  @Input() options: UiSmartOption[] = [];
  @Input() placeholder = 'Select...';
  @Input() searchPlaceholder = 'Type to search...';
  @Input() disabled = false;
  @Input() clearable = true;
  @Input() minSearchLength = 0;
  @Input() caseSensitive = false;
  @Input() maxPanelHeight = 260;
  @Input() label: string | null = null;
  @Input() autoOpenOnFocus = true;

  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLElement>;

  // === Outputs ===
  @Output() valueChange = new EventEmitter<any>();
  @Output() selectionChange = new EventEmitter<UiSmartOption | null>();
  @Output() opened = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();


  // === State ===
  isOpen = false;
  isFocused = false;

  searchTerm = '';
  filteredOptions: UiSmartOption[] = [];
  highlightedIndex = -1;        // public for template
  private innerValue: any = null;

  private onChange: (value: any) => void = () => { };
  private onTouched: () => void = () => { };
  private lastInteractionWasKeyboard = false;

  constructor(
    private cdr: ChangeDetectorRef,
    private hostRef: ElementRef<HTMLElement>
  ) { }

  // ---------- ControlValueAccessor ----------
  writeValue(obj: any): void {
    this.innerValue = obj;
    this.cdr.markForCheck();
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.cdr.markForCheck();
  }

  // ---------- OnChanges ----------
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options']) {
      this.applyFilter();
    }
  }

  // ---------- Getters / helpers ----------
  get value(): any {
    return this.innerValue;
  }

  get selectedOption(): UiSmartOption | null {
    if (this.innerValue === null || this.innerValue === undefined) return null;
    return this.options.find(o => o.value === this.innerValue) ?? null;
  }

  get selectedLabel(): string | null {
    return this.selectedOption?.label ?? null;
  }

  trackByValue(_index: number, item: UiSmartOption): any {
    return item.value;
  }

  isSelected(opt: UiSmartOption): boolean {
    return this.innerValue === opt.value;
  }

  // ---------- Open / close ----------
  togglePanel(): void {
    if (this.disabled) return;
    this.isOpen ? this.closePanel() : this.openPanel();
  }

  openPanel(): void {
    if (this.disabled || this.isOpen) return;

    this.isOpen = true;
    this.isFocused = true;
    this.applyFilter();
    this.syncHighlightToSelected();
    this.opened.emit();
    this.cdr.markForCheck();

    // IMPORTANT: no auto-focus to avoid focus/blur loops
    // If you want it later, we can add an Input to control it.
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
    this.closed.emit();
    this.cdr.markForCheck();
  }

  // ---------- Search / filtering ----------
  onSearchChange(term: string): void {
    this.searchTerm = term;
    this.applyFilter();
  }

  private applyFilter(): void {
    const term = this.searchTerm || '';

    if (!term || term.length < this.minSearchLength) {
      this.filteredOptions = [...this.options];
    } else {
      const normalizedTerm = this.caseSensitive ? term : term.toLowerCase();
      this.filteredOptions = this.options.filter(opt => {
        const label = this.caseSensitive ? opt.label : opt.label.toLowerCase();
        return label.includes(normalizedTerm);
      });
    }

    if (this.highlightedIndex >= this.filteredOptions.length) {
      this.highlightedIndex = this.filteredOptions.length ? 0 : -1;
    }

    this.cdr.markForCheck();
  }

  // ---------- Selection ----------
  optionClick(option: UiSmartOption): void {
    if (option.disabled) return;
    this.setValue(option.value);
    this.closePanel();
  }

  private setValue(value: any): void {
    if (this.innerValue === value) {
      this.selectionChange.emit(this.selectedOption);
      return;
    }

    this.innerValue = value;
    this.onChange(value);
    this.valueChange.emit(value);
    this.selectionChange.emit(this.selectedOption);
    this.cdr.markForCheck();
  }

  clear(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    this.innerValue = null;
    this.onChange(null);
    this.valueChange.emit(null);
    this.selectionChange.emit(null);
    this.searchTerm = '';
    this.applyFilter();
    this.cdr.markForCheck();
  }

  // ---------- Keyboard & focus ----------
  onControlKeydown(event: KeyboardEvent): void {
    if (this.disabled) return;

    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.togglePanel();
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (!this.isOpen) {
          this.openPanel();
        } else {
          this.moveHighlight(1);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (this.isOpen) {
          this.moveHighlight(-1);
        }
        break;
      case 'Escape':
        if (this.isOpen) {
          event.preventDefault();
          this.closePanel();
        }
        break;
      case 'Tab':
        // User is tabbing away from the control → close the panel
        this.closePanel();
        // do NOT preventDefault → let focus move to next field
        return;
    }
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (!this.isOpen) return;

    switch (event.key) {
      case 'Tab':
        // User tabs out of search → close, let focus move on
        this.closePanel();
        return;
      case 'ArrowDown':
        event.preventDefault();
        this.moveHighlight(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveHighlight(-1);
        break;
      case 'Enter':
        event.preventDefault();
        if (this.highlightedIndex >= 0 && this.highlightedIndex < this.filteredOptions.length) {
          const opt = this.filteredOptions[this.highlightedIndex];
          this.optionClick(opt);
        }
        break;
      case 'Escape':
        event.preventDefault();
        this.closePanel();
        break;
    }
  }

  onControlFocus(): void {
    this.isFocused = true;

    // Only auto-open if:
    // - autoOpenOnFocus is enabled
    // - the last interaction was from keyboard (Tab/Shift+Tab)
    // - not already open and not disabled
    if (
      this.autoOpenOnFocus &&
      this.lastInteractionWasKeyboard &&
      !this.isOpen &&
      !this.disabled
    ) {
      this.openPanel();
    }
  }


  private moveHighlight(delta: number): void {
    if (!this.filteredOptions.length) {
      this.highlightedIndex = -1;
      this.cdr.markForCheck();
      return;
    }

    let next = this.highlightedIndex + delta;

    if (next < 0) {
      next = this.filteredOptions.length - 1;
    } else if (next >= this.filteredOptions.length) {
      next = 0;
    }

    let attempts = 0;
    while (this.filteredOptions[next]?.disabled && attempts < this.filteredOptions.length) {
      next += delta;
      if (next < 0) next = this.filteredOptions.length - 1;
      if (next >= this.filteredOptions.length) next = 0;
      attempts++;
    }

    this.highlightedIndex = next;
    this.scrollHighlightedIntoView();
    this.cdr.markForCheck();
  }

  private syncHighlightToSelected(): void {
    if (!this.selectedOption) {
      this.highlightedIndex = this.filteredOptions.length ? 0 : -1;
      return;
    }
    const idx = this.filteredOptions.findIndex(o => o.value === this.selectedOption!.value);
    this.highlightedIndex = idx >= 0 ? idx : (this.filteredOptions.length ? 0 : -1);
  }

  private scrollHighlightedIntoView(): void {
    const panel = this.hostRef.nativeElement.querySelector('.ui-smart-dropdown__options');
    if (!panel) return;

    const items = panel.querySelectorAll('.ui-smart-dropdown__option');
    const el = items[this.highlightedIndex] as HTMLElement | undefined;
    if (!el) return;

    const panelRect = (panel as HTMLElement).getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    if (elRect.top < panelRect.top) {
      el.scrollIntoView({ block: 'nearest' });
    } else if (elRect.bottom > panelRect.bottom) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen) return;

    const target = event.target as Node | null;
    if (!target) return;

    // If click happened OUTSIDE the dropdown → close it
    if (!this.containerRef.nativeElement.contains(target)) {
      this.closePanel();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    // Any keydown means the next focus is likely from keyboard (Tab, Shift+Tab, etc.)
    this.lastInteractionWasKeyboard = true;
  }

  @HostListener('document:mousedown')
  onGlobalMousedown(): void {
    // Mouse interaction: next focus is from mouse
    this.lastInteractionWasKeyboard = false;
  }


}
