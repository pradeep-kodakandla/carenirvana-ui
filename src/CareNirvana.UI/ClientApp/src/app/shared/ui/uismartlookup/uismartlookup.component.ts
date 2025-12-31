import {
  Component,
  EventEmitter,
  forwardRef,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ChangeDetectionStrategy,
  ElementRef,
  HostListener
} from '@angular/core';
import { ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Observable, Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, filter, map, switchMap, takeUntil, tap } from 'rxjs/operators';

/**
 * UiSmartLookupComponent
 * ---------------------
 * Reusable, "search-as-you-type" autocomplete that can be bound either:
 * 1) as a form control (ControlValueAccessor), OR
 * 2) as a standalone component using (selected)/(textChange) outputs.
 *
 * It does NOT own any domain knowledge (ICD/Member/Provider). You provide a searchFn.
 */
@Component({
  selector: 'ui-smart-lookup',
  templateUrl: './uismartlookup.component.html',
  styleUrls: ['./uismartlookup.component.css'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UiSmartLookupComponent),
      multi: true
    }
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UiSmartLookupComponent<T> implements OnInit, OnDestroy, ControlValueAccessor {
  /** Optional label shown above the input */
  @Input() label?: string;
  @Input() placeholder = 'Search...';
  @Input() minChars = 2;
  @Input() debounceMs = 250;
  @Input() limit = 25;
  @Input() disabled = false;

  /** Required: function that returns results for a query. */
  @Input() searchFn!: (q: string, limit: number) => Observable<T[]>;

  /** Optional: controls how each result is displayed. */
  @Input() displayWith: (item: T) => string = (x: any) => (x?.display ?? x?.label ?? x?.name ?? x?.code ?? '').toString();

  /** Optional: stable id for trackBy */
  @Input() trackBy: (item: T) => any = (x: any) => x?.id ?? x?.code ?? x;

  @Output() selected = new EventEmitter<T>();
  @Output() textChange = new EventEmitter<string>();
  @Output() cleared = new EventEmitter<void>();

  inputCtrl = new FormControl<string>('', { nonNullable: true });

  results: T[] = [];
  loading = false;
  open = false;

  /** used by template to show "No results" only after a search has been attempted */
  lastQuery = '';

  private destroy$ = new Subject<void>();

  // CVA
  private onChange: (v: any) => void = () => { };
  private onTouched: () => void = () => { };

  constructor(private host: ElementRef<HTMLElement>) { }

  ngOnInit(): void {
    if (!this.searchFn) {
      // Fail fast during development (prevents silent null behavior)
      // eslint-disable-next-line no-console
      console.warn('ui-smart-lookup: searchFn is required.');
    }

    if (this.disabled) this.inputCtrl.disable({ emitEvent: false });

    this.inputCtrl.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        map(v => (v ?? '').toString()),
        tap(v => {
          this.lastQuery = v;
          this.textChange.emit(v);
          this.onChange(v); // CVA: treat typed text as current value (until selection)
          if (v.length < this.minChars) {
            this.results = [];
            this.open = false;
            this.loading = false;
          }
        }),
        filter(v => v.length >= this.minChars),
        debounceTime(this.debounceMs),
        distinctUntilChanged(),
        tap(() => {
          this.loading = true;
          this.open = true; // keep panel open even if zero results so "No results" can render
        }),
        switchMap(q =>
          (this.searchFn ? this.searchFn(q, this.limit) : of([] as T[])).pipe(
            catchError(() => of([] as T[])),
            tap(() => (this.loading = false))
          )
        )
      )
      .subscribe(list => {
        this.results = list || [];
        // Keep open when query >= minChars so user sees "No results"
        this.open = (this.lastQuery?.length ?? 0) >= this.minChars;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ==========================
  // UI events
  // ==========================
  onPick(item: T): void {
    this.open = false;

    // Set visible text to selected display label
    const label = this.displayWith(item);
    this.inputCtrl.setValue(label, { emitEvent: false });

    // Emit selection to parent
    this.selected.emit(item);

    // CVA: set selected item as value
    this.onChange(item);
    this.onTouched();
  }

  onClear(): void {
    this.results = [];
    this.open = false;
    this.inputCtrl.setValue('', { emitEvent: true });
    this.cleared.emit();
  }

  /** trackBy adapter for ngFor (Angular expects (index,item) signature) */
  trackByIndex = (index: number, item: T): any => this.trackBy(item);

  /** Close the panel when clicking outside */
  @HostListener('document:mousedown', ['$event'])
  onDocMouseDown(ev: MouseEvent): void {
    if (!this.open) return;
    const target = ev.target as Node | null;
    if (!target) return;
    if (!this.host?.nativeElement?.contains(target)) {
      this.open = false;
    }
  }

  // ==========================
  // ControlValueAccessor
  // ==========================
  writeValue(value: any): void {
    // Allow writing either an object (selected item) or string
    if (value == null) {
      this.inputCtrl.setValue('', { emitEvent: false });
      return;
    }

    if (typeof value === 'string') {
      this.inputCtrl.setValue(value, { emitEvent: false });
      return;
    }

    // object
    try {
      this.inputCtrl.setValue(this.displayWith(value as T), { emitEvent: false });
    } catch {
      this.inputCtrl.setValue('', { emitEvent: false });
    }
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    if (isDisabled) this.inputCtrl.disable({ emitEvent: false });
    else this.inputCtrl.enable({ emitEvent: false });
  }
}
