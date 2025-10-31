import {
  ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output,
  ViewChild, forwardRef, HostListener, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { ValueAccessorBase } from '../shared/valueaccessorbase';
import { UiOption } from '../shared/uioption.model';

@Component({
  selector: 'ui-dropdown',
  templateUrl: './uidropdown.component.html',
  styleUrls: ['./uidropdown.component.css'],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => UiDropdownComponent),
    multi: true
  }],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UiDropdownComponent<T> extends ValueAccessorBase<T | null> {
  @Input({ required: true }) options: UiOption<T>[] = [];
  @Input() placeholder = 'Select...';
  @Input() disabledText = 'Disabled';
  @Input() compareWith: (a: T, b: T) => boolean = (a, b) => a === b;

  @Output() selectionChange = new EventEmitter<T | null>();

  @ViewChild('menu', { static: false }) menuRef?: ElementRef<HTMLElement>;
  @ViewChild('inputEl', { static: false }) inputRef?: ElementRef<HTMLInputElement>;


  open = signal(false);
  focused = signal(false);
  search = signal('');
  highlightedIndex = signal<number>(-1);

  /** Current selected label (for display when not typing) */
  selectedLabel = computed(() => {
    if (this._value === null || this._value === undefined) return '';
    const found = this.options.find(o => this.compareWith(o.value, this._value as T));
    return found?.label ?? '';
  });

  /** Filtered options from search text */
  get filtered(): UiOption<T>[] {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.options;
    return this.options.filter(o => o.label.toLowerCase().includes(q));
  }

  /** The text to render in the input */
  displayText(): string {
    const label = this.selectedLabel();
    // When not focused, prefer selected label; if none, show whatever is in search()
    return this.focused() ? this.search() : (label || this.search() || '');
  }

  /** Open and focus input */
  openMenu(focusInput = true) {
    if (this.isDisabled) return;
    this.open.set(true);
    if (focusInput) setTimeout(() => this.inputRef?.nativeElement?.focus(), 0);
    if (!this.focused()) this.focused.set(true);
    // When opened, preset search to the selected label (so typing refines it)
    if (!this.search() && this.selectedLabel()) this.search.set(this.selectedLabel());
  }

  closeMenu() {
    if (!this.open()) return;
    this.open.set(false);
    this.highlightedIndex.set(-1);
  }

  /** Select an option */
  selectOption(o: UiOption<T>) {
    if (o.disabled) return;
    this._value = o.value;
    this.onChange(o.value);
    this.selectionChange.emit(o.value);
    // Ensure the input shows the label even after blur
    this.search.set(o.label);
    this.closeMenu();
    this.inputRef?.nativeElement?.blur();
    this.focused.set(false);
  }

  clearSelection(e?: MouseEvent) {
    e?.stopPropagation();
    this._value = null as any;
    this.onChange(null as any);
    this.selectionChange.emit(null);
    this.search.set('');
    this.inputRef?.nativeElement?.focus();
    this.openMenu(false);
  }

  onInput(ev: Event) {
    const v = ((ev.target as HTMLInputElement)?.value ?? '').toString();
    this.search.set(v);
    if (!this.open()) this.openMenu(false);
  }

  //onFocus() {
  //  this.focused.set(true);
  //  this.openMenu(false);
  //}
  onFocus() {
    this.focused.set(true);
    // seed search so the input shows the selected option immediately
    if (!this.search() && this.selectedLabel()) this.search.set(this.selectedLabel());
    this.openMenu(false);
  }

  onBlur() {
    // small delay so clicks in the menu still register
    setTimeout(() => {
      if (!this.menuRef?.nativeElement.contains(document.activeElement)) {
        this.focused.set(false);
        this.closeMenu();
        // Snap input to selected label when leaving
        if (this.selectedLabel() && !this.search().trim()) this.search.set(this.selectedLabel());
      }
    }, 120);
    this.onTouched();
  }

  // Keyboard handling when input or menu has focus
  @HostListener('keydown', ['$event'])
  handleKey(e: KeyboardEvent) {
    if (this.isDisabled) return;
    const items = this.filtered;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!this.open()) this.openMenu();
      const i = this.highlightedIndex();
      this.highlightedIndex.set(Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const i = this.highlightedIndex();
      this.highlightedIndex.set(Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (this.open()) {
        e.preventDefault();
        const idx = this.highlightedIndex();
        const candidate = idx >= 0 ? items[idx] : (items.length ? items[0] : undefined);
        if (candidate) this.selectOption(candidate);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.closeMenu();
      this.inputRef?.nativeElement?.blur();
      this.focused.set(false);
    }
  }

  // Clicks outside close the menu
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

  override writeValue(value: T | null): void {
    super.writeValue(value);
    // After _value changes, reflect label into the input when not focused
    const label = this.selectedLabel();
    if (!this.focused()) {
      this.search.set(label);
    }
  }
  constructor(private el: ElementRef<HTMLElement>) { super(); (this as any).el = el; }

  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean) { /* ... */ }

  onUserPick(next: any) {
    this._value = next;
    this.onChange(next);
    this.onTouched();
  }


}
