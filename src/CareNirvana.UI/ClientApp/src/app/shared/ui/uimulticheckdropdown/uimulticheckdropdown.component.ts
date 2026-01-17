import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, Output, OnInit, OnChanges, SimpleChanges,
  ViewChild, forwardRef, HostListener, signal, computed
} from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { ValueAccessorBase } from '../shared/valueaccessorbase';
import { UiOption } from '../shared/uioption.model';

@Component({
  selector: 'ui-multi-check-dropdown',
  templateUrl: './uimulticheckdropdown.component.html',
  styleUrls: ['./uimulticheckdropdown.component.css'],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => UiMultiCheckDropdownComponent),
    multi: true
  }],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UiMultiCheckDropdownComponent<T> extends ValueAccessorBase<T[]> implements OnInit, OnChanges {

  //@Input({ required: true }) options: UiOption<T>[] = [];
  private _options: UiOption<T>[] = [];
  @Input({ required: true })
  set options(val: UiOption<T>[]) {
    this._options = Array.isArray(val) ? val : [];
    // schedule after Angular applies the new @Input
    queueMicrotask(() => this.maybeAutoSelectAll());
    this.cdr.markForCheck();
  }
  get options(): UiOption<T>[] { return this._options; }

  @Input() placeholder = 'Select...';
  @Input() showChips = true;
  @Input() maxChipCount = 3;
  @Input() disabledText = 'Disabled';
  @Input() defaultSelect = false;
  @Input() defaultSelectOnce = true;   
  selectedValues: any[] = [];

  @Output() selectionChange = new EventEmitter<T[]>();

  @ViewChild('menu', { static: false }) menuRef?: ElementRef<HTMLElement>;
  @ViewChild('inputEl', { static: false }) inputRef?: ElementRef<HTMLInputElement>;

  open = signal(false);
  focused = signal(false);
  search = signal('');
  valueSet = signal<Set<T>>(new Set<T>());
  highlightedIndex = signal<number>(-1);

  /** guards re-applying default selection repeatedly */
  private autoSelected = false;

  constructor(private cdr: ChangeDetectorRef, private el: ElementRef<HTMLElement>) { super(); (this as any).el = el; }


  ngOnInit(): void {
    this.maybeAutoSelectAll();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // If options or defaultSelect toggle changes, try again
    if (changes['options'] || changes['defaultSelect']) {
      this.maybeAutoSelectAll();
    }
  }

  override writeValue(value: T[] | null): void {
    const arr = value ?? [];
    this._value = arr;
    this.valueSet.set(new Set(arr));
    if (arr.length > 0) this.autoSelected = true;
    this.cdr.markForCheck();
  }

  filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    return q ? this.options.filter(o => o.label.toLowerCase().includes(q)) : this.options;
  });

  displayLabel(): string {
    const count = this.valueSet().size;
    if (count === 0) return '';
    const selected = this.options.filter(o => this.valueSet().has(o.value)).map(o => o.label);
    if (selected.length <= this.maxChipCount) return selected.join(', ');
    return `${selected.slice(0, this.maxChipCount).join(', ')} +${selected.length - this.maxChipCount}`;
  }

  /** The text in the input while focused/typing */
  displayText(): string {
    return this.focused() ? this.search() : this.displayLabel();
  }

  toggleValue(v: T, disabled?: boolean) {
    if (disabled) return;
    const s = new Set(this.valueSet());
    if (s.has(v)) s.delete(v); else s.add(v);
    this.commit(s);
  }

  removeChip(v: T) {
    const s = new Set(this.valueSet());
    s.delete(v);
    this.commit(s);
  }

  selectAllVisible() {
    const s = new Set(this.valueSet());
    for (const o of this.filtered()) if (!o.disabled) s.add(o.value);
    this.commit(s);
  }

  clearVisible() {
    const s = new Set(this.valueSet());
    for (const o of this.filtered()) s.delete(o.value);
    this.commit(s);
  }

  private commit(s: Set<T>, fromAuto = false) {
    this.valueSet.set(s);
    const arr = Array.from(s.values());      // <-- T[]
    this._value = arr;
    this.onChange(arr);                      // <-- propagate T[]
    this.selectionChange.emit(arr);
    if (fromAuto) this.autoSelected = true;
    this.cdr.markForCheck();
  }

  // Autocomplete lifecycle
  openMenu(focusInput = true) {
    if (this.isDisabled) return;
    this.open.set(true);
    if (focusInput) setTimeout(() => this.inputRef?.nativeElement?.focus(), 0);
    if (!this.focused()) this.focused.set(true);
  }

  closeMenu() {
    if (!this.open()) return;
    this.open.set(false);
    this.highlightedIndex.set(-1);
  }

  onInput(ev: Event) {
    const v = ((ev.target as HTMLInputElement)?.value ?? '').toString();
    this.search.set(v);
    if (!this.open()) this.openMenu(false);
  }

  onFocus() {
    this.focused.set(true);
    this.openMenu(false);
  }

  onBlur() {
    setTimeout(() => {
      if (!this.menuRef?.nativeElement.contains(document.activeElement)) {
        this.focused.set(false);
        this.closeMenu();
        // snap text to summary when leaving
        if (!this.search().trim()) this.search.set('');
      }
    }, 120);
    this.onTouched();
  }

  onMenuKey(e: KeyboardEvent) {
    const items = this.filtered();
    if (e.key === 'Escape') { e.preventDefault(); this.closeMenu(); this.inputRef?.nativeElement?.blur(); this.focused.set(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); const i = this.highlightedIndex(); this.highlightedIndex.set(Math.min(items.length - 1, i + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); const i = this.highlightedIndex(); this.highlightedIndex.set(Math.max(0, i - 1)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const idx = this.highlightedIndex();
      const o = idx >= 0 ? items[idx] : (items.length ? items[0] : undefined);
      if (o) this.toggleValue(o.value, o.disabled);
    }
  }

  // Click outside closes
  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent) {
    if (!this.open()) return;
    const target = ev.target as Node | null;
    const host = (this as any).el?.nativeElement as HTMLElement;
    if (host && target && !host.contains(target)) {
      this.closeMenu();
      this.focused.set(false);
    }
  }


  /** Apply default select-all exactly once, only when value is empty */
  private maybeAutoSelectAll(): void {
    if (!this.defaultSelect) return;
    if (this.defaultSelectOnce && this.autoSelected) return;
    if (!this.options?.length) return;
    if (this.valueSet().size > 0) return;    // don't override existing selections

    const s = new Set<T>();
    for (const o of this.options) if (!o.disabled) s.add(o.value);
    this.commit(s, /*fromAuto*/ true);
  }

  /** Automatically select all options if defaultSelect is true */
  private applyDefaultSelect(): void {
    if (this.defaultSelect && this.options?.length) {
      this.selectedValues = [...this.options];
      this.onChange(this.selectedValues);
    }
  }
}
