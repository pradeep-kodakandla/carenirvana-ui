import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
  computed,
  forwardRef,
  signal,
} from '@angular/core';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { ValueAccessorBase } from '../shared/valueaccessorbase';
import { UiOption } from '../shared/uioption.model';

@Component({
  selector: 'ui-multi-check-dropdown',
  templateUrl: './uimulticheckdropdown.component.html',
  styleUrls: ['./uimulticheckdropdown.component.css'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UiMultiCheckDropdownComponent),
      multi: true,
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiMultiCheckDropdownComponent<T>
  extends ValueAccessorBase<T[]>
  implements OnInit, OnChanges
{
  // ─── Inputs ──────────────────────────────────────────────────────────────

  private _options: UiOption<T>[] = [];

  @Input({ required: true })
  set options(val: UiOption<T>[]) {
    this._options = Array.isArray(val) ? val : [];
    // Schedule after Angular applies the new @Input so signals are stable
    queueMicrotask(() => this.maybeAutoSelectAll());
    this.cdr.markForCheck();
  }
  get options(): UiOption<T>[] {
    return this._options;
  }

  @Input() placeholder = 'Select...';
  /** Show selected-value chips below the input */
  @Input() showChips = true;
  /** Max chips shown inline before "+N more" label */
  @Input() maxChipCount = 3;
  /** Badge label shown next to disabled options */
  @Input() disabledText = 'Disabled';
  /**
   * When true, all non-disabled options are pre-selected on first render.
   * Respects `defaultSelectOnce` — if that is true the auto-select only
   * fires once even if the options array is replaced later.
   */
  @Input() defaultSelect = false;
  /**
   * When true (default), the auto-select from `defaultSelect` only fires
   * once per component lifetime.  Set to false if you want it to re-apply
   * every time a new options array arrives while the value is still empty.
   */
  @Input() defaultSelectOnce = true;

  // ─── Outputs ─────────────────────────────────────────────────────────────

  @Output() selectionChange = new EventEmitter<T[]>();

  // ─── View refs ───────────────────────────────────────────────────────────

  @ViewChild('menu', { static: false }) menuRef?: ElementRef<HTMLElement>;
  @ViewChild('inputEl', { static: false }) inputRef?: ElementRef<HTMLInputElement>;

  // ─── Reactive state ──────────────────────────────────────────────────────

  open = signal(false);
  focused = signal(false);
  search = signal('');
  valueSet = signal<Set<T>>(new Set<T>());
  highlightedIndex = signal<number>(-1);

  /** Guards re-applying default selection repeatedly */
  private autoSelected = false;

  // ─── Constructor ─────────────────────────────────────────────────────────

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly el: ElementRef<HTMLElement>
  ) {
    super();
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.maybeAutoSelectAll();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Only re-attempt when the *flag* itself changes; options setter handles
    // the options-array case to avoid double-firing.
    if (changes['defaultSelect']) {
      // Reset guard so the new flag value takes effect immediately
      if (!this.defaultSelect) this.autoSelected = false;
      this.maybeAutoSelectAll();
    }
  }

  // ─── ControlValueAccessor ────────────────────────────────────────────────

  override writeValue(value: T[] | null): void {
    const arr = value ?? [];
    this._value = arr;
    this.valueSet.set(new Set(arr));
    if (arr.length > 0) this.autoSelected = true;
    this.cdr.markForCheck();
  }

  // ─── Computed derivations ────────────────────────────────────────────────

  /** Options filtered by the current search query */
  filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    return q
      ? this.options.filter((o) => o.label.toLowerCase().includes(q))
      : this.options;
  });

  /**
   * Reactive summary label — a `computed` so the template re-renders
   * automatically whenever `valueSet` or `options` change.
   */
  displayLabel = computed(() => {
    const count = this.valueSet().size;
    if (count === 0) return '';
    const labels = this.options
      .filter((o) => this.valueSet().has(o.value))
      .map((o) => o.label);
    if (labels.length <= this.maxChipCount) return labels.join(', ');
    return `${labels.slice(0, this.maxChipCount).join(', ')} +${labels.length - this.maxChipCount} more`;
  });

  /** Text shown in the input: the search query while focused, else the summary */
  displayText = computed(() =>
    this.focused() ? this.search() : this.displayLabel()
  );

  // ─── Selection helpers ───────────────────────────────────────────────────

  toggleValue(v: T, disabled?: boolean): void {
    if (disabled) return;
    const s = new Set(this.valueSet());
    if (s.has(v)) s.delete(v);
    else s.add(v);
    this.commit(s);
  }

  removeChip(v: T): void {
    const s = new Set(this.valueSet());
    s.delete(v);
    this.commit(s);
  }

  selectAllVisible(): void {
    const s = new Set(this.valueSet());
    for (const o of this.filtered()) if (!o.disabled) s.add(o.value);
    this.commit(s);
  }

  clearVisible(): void {
    const s = new Set(this.valueSet());
    for (const o of this.filtered()) s.delete(o.value);
    this.commit(s);
  }

  private commit(s: Set<T>, fromAuto = false): void {
    this.valueSet.set(s);
    const arr = Array.from(s.values());
    this._value = arr;
    this.onChange(arr);
    this.selectionChange.emit(arr);
    if (fromAuto) this.autoSelected = true;
    this.cdr.markForCheck();
  }

  // ─── Menu open / close ───────────────────────────────────────────────────

  openMenu(focusInput = true): void {
    if (this.isDisabled) return;
    this.open.set(true);
    if (focusInput) setTimeout(() => this.inputRef?.nativeElement?.focus(), 0);
    if (!this.focused()) this.focused.set(true);
  }

  closeMenu(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.search.set('');
    this.highlightedIndex.set(-1);
  }

  // ─── Input event handlers ────────────────────────────────────────────────

  onInput(ev: Event): void {
    const v = ((ev.target as HTMLInputElement)?.value ?? '').toString();
    this.search.set(v);
    if (!this.open()) this.openMenu(false);
  }

  onFocus(): void {
    this.focused.set(true);
    this.openMenu(false);
  }

  onBlur(): void {
    // Use requestAnimationFrame to let the browser process the next focus
    // event before deciding whether focus moved outside the component.
    // This avoids the brittle magic-number timeout.
    requestAnimationFrame(() => {
      const menuEl = this.menuRef?.nativeElement;
      const active = document.activeElement;
      const hostEl = this.el.nativeElement;
      const focusStillInside =
        (menuEl && menuEl.contains(active)) || hostEl.contains(active);

      if (!focusStillInside) {
        this.focused.set(false);
        this.closeMenu();
      }
      this.onTouched();
      this.cdr.markForCheck();
    });
  }

  // ─── Keyboard navigation ─────────────────────────────────────────────────

  onMenuKey(e: KeyboardEvent): void {
    const items = this.filtered();

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        this.closeMenu();
        this.inputRef?.nativeElement?.blur();
        this.focused.set(false);
        break;

      case 'ArrowDown':
        e.preventDefault();
        this.highlightedIndex.set(
          Math.min(items.length - 1, this.highlightedIndex() + 1)
        );
        this.scrollHighlightedIntoView();
        break;

      case 'ArrowUp':
        e.preventDefault();
        this.highlightedIndex.set(Math.max(0, this.highlightedIndex() - 1));
        this.scrollHighlightedIntoView();
        break;

      case 'Enter': {
        e.preventDefault();
        const idx = this.highlightedIndex();
        const o = idx >= 0 ? items[idx] : items[0];
        if (o) this.toggleValue(o.value, o.disabled);
        break;
      }

      case 'Tab':
        this.closeMenu();
        this.focused.set(false);
        break;
    }
  }

  private scrollHighlightedIntoView(): void {
    requestAnimationFrame(() => {
      const menuEl = this.menuRef?.nativeElement;
      if (!menuEl) return;
      const active = menuEl.querySelector<HTMLElement>('.dropdown-item.active');
      active?.scrollIntoView({ block: 'nearest' });
    });
  }

  // ─── Click-outside close ─────────────────────────────────────────────────

  @HostListener('document:click', ['$event'])
  onDocClick(ev: MouseEvent): void {
    if (!this.open()) return;
    const target = ev.target as Node | null;
    if (target && !this.el.nativeElement.contains(target)) {
      this.closeMenu();
      this.focused.set(false);
    }
  }

  // ─── Default select-all ──────────────────────────────────────────────────

  /**
   * Applies default select-all exactly once (when `defaultSelectOnce` is
   * true), or every time options arrive while the value is empty (when false).
   */
  private maybeAutoSelectAll(): void {
    if (!this.defaultSelect) return;
    if (this.defaultSelectOnce && this.autoSelected) return;
    if (!this.options?.length) return;
    if (this.valueSet().size > 0) return; // never overwrite existing selections

    const s = new Set<T>();
    for (const o of this.options) if (!o.disabled) s.add(o.value);
    this.commit(s, /* fromAuto */ true);
  }
}
