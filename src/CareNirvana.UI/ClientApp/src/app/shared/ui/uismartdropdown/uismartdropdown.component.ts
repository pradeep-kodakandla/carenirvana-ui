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
  OnDestroy,
  SimpleChanges,
  Renderer2,
  NgZone
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

/** Default comparator – strict reference equality. */
function defaultCompareWith(a: any, b: any): boolean {
  return a === b;
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
export class UiSmartDropdownComponent implements ControlValueAccessor, OnChanges, OnDestroy {
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

  /** Custom comparator for option values (useful when values are objects). */
  @Input() compareWith: (a: any, b: any) => boolean = defaultCompareWith;

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
  panelDropUp = false; // true → panel opens above the control

  searchTerm = '';
  filteredOptions: UiSmartOption[] = [];
  highlightedIndex = -1;
  private innerValue: any = null;

  private onChange: (value: any) => void = () => {};
  private onTouched: () => void = () => {};
  private lastInteractionWasKeyboard = false;

  /** Handles for dynamically registered global listeners. */
  private globalClickUnlisten: (() => void) | null = null;
  private globalKeydownUnlisten: (() => void) | null = null;
  private globalMousedownUnlisten: (() => void) | null = null;

  /** Guard for the focus setTimeout inside openPanel(). */
  private focusTimerId: ReturnType<typeof setTimeout> | null = null;

  /** Unique id seed for ARIA id attributes. */
  private static nextId = 0;
  readonly instanceId = `ui-sd-${UiSmartDropdownComponent.nextId++}`;

  constructor(
    private cdr: ChangeDetectorRef,
    private hostRef: ElementRef<HTMLElement>,
    private renderer: Renderer2,
    private ngZone: NgZone
  ) {}

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
    if (changes['options'] || changes['caseSensitive'] || changes['minSearchLength']) {
      this.applyFilter();
    }
  }

  // ---------- OnDestroy ----------
  ngOnDestroy(): void {
    this.clearFocusTimer();
    this.removeGlobalListeners();
  }

  // ---------- Getters / helpers ----------
  get value(): any {
    return this.innerValue;
  }

  get selectedOption(): UiSmartOption | null {
    if (this.innerValue === null || this.innerValue === undefined) return null;
    return this.options.find(o => this.compareWith(o.value, this.innerValue)) ?? null;
  }

  get selectedLabel(): string | null {
    return this.selectedOption?.label ?? null;
  }

  /** ARIA: id of the currently highlighted option element. */
  get activeDescendantId(): string | null {
    if (this.highlightedIndex < 0) return null;
    return `${this.instanceId}-opt-${this.highlightedIndex}`;
  }

  /** Generate a unique id for each option element in the template. */
  optionId(index: number): string {
    return `${this.instanceId}-opt-${index}`;
  }

  trackByValue(_index: number, item: UiSmartOption): any {
    return item.value ?? _index; // fall back to index when values could collide
  }

  isSelected(opt: UiSmartOption): boolean {
    return this.compareWith(this.innerValue, opt.value);
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
    this.searchTerm = '';
    this.applyFilter();
    this.syncHighlightToSelected();
    this.computePanelDirection();
    this.addGlobalListeners();
    this.opened.emit();
    this.cdr.markForCheck();

    this.clearFocusTimer();
    this.focusTimerId = setTimeout(() => {
      this.focusTimerId = null;
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
    this.panelDropUp = false;
    this.removeGlobalListeners();
    this.clearFocusTimer();
    this.onTouched();
    this.closed.emit();
    this.cdr.markForCheck();
  }

  // ---------- Panel direction ----------
  private computePanelDirection(): void {
    const controlEl = this.containerRef?.nativeElement?.querySelector('.ui-smart-dropdown__control');
    if (!controlEl) {
      this.panelDropUp = false;
      return;
    }
    const rect = (controlEl as HTMLElement).getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    this.panelDropUp = spaceBelow < this.maxPanelHeight && rect.top > spaceBelow;
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
    if (this.compareWith(this.innerValue, value)) {
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
        this.closePanel();
        return; // let focus move naturally
    }
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (!this.isOpen) return;

    switch (event.key) {
      case 'Tab':
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

    if (
      this.autoOpenOnFocus &&
      this.lastInteractionWasKeyboard &&
      !this.isOpen &&
      !this.disabled
    ) {
      this.openPanel();
    }
  }

  onControlBlur(): void {
    // Delay so a click inside the panel isn't lost.
    setTimeout(() => {
      if (!this.isOpen) {
        this.isFocused = false;
        this.onTouched();
        this.cdr.markForCheck();
      }
    });
  }

  // ---------- Highlight navigation ----------
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
    const idx = this.filteredOptions.findIndex(o =>
      this.compareWith(o.value, this.selectedOption!.value)
    );
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

    if (elRect.top < panelRect.top || elRect.bottom > panelRect.bottom) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }

  // ---------- Dynamic global listeners (only while panel is open) ----------
  private addGlobalListeners(): void {
    this.removeGlobalListeners(); // safety: avoid duplicates

    // Run outside Angular to avoid unnecessary change-detection cycles.
    this.ngZone.runOutsideAngular(() => {
      this.globalClickUnlisten = this.renderer.listen('document', 'click', (event: MouseEvent) => {
        const target = event.target as Node | null;
        if (!target) return;
        if (!this.containerRef.nativeElement.contains(target)) {
          this.ngZone.run(() => this.closePanel());
        }
      });

      this.globalKeydownUnlisten = this.renderer.listen('document', 'keydown', () => {
        this.lastInteractionWasKeyboard = true;
      });

      this.globalMousedownUnlisten = this.renderer.listen('document', 'mousedown', () => {
        this.lastInteractionWasKeyboard = false;
      });
    });
  }

  private removeGlobalListeners(): void {
    this.globalClickUnlisten?.();
    this.globalClickUnlisten = null;
    this.globalKeydownUnlisten?.();
    this.globalKeydownUnlisten = null;
    this.globalMousedownUnlisten?.();
    this.globalMousedownUnlisten = null;
  }

  private clearFocusTimer(): void {
    if (this.focusTimerId !== null) {
      clearTimeout(this.focusTimerId);
      this.focusTimerId = null;
    }
  }
}
