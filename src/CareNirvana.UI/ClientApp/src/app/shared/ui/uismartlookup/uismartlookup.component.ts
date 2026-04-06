import {
  Component,
  EventEmitter,
  forwardRef,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  ElementRef,
  HostListener
} from '@angular/core';
import {
  ControlValueAccessor,
  FormControl,
  NG_VALUE_ACCESSOR
} from '@angular/forms';
import { Observable, Subject, of } from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  finalize,
  map,
  switchMap,
  takeUntil,
  tap
} from 'rxjs/operators';

/**
 * UiSmartLookupComponent
 * ----------------------
 * Reusable search-as-you-type autocomplete. Bind as a reactive form control
 * (ControlValueAccessor) or in standalone mode via (selected) / (textChange).
 *
 * CVA value contract:
 *   • While the user is typing → emits null  (no confirmed selection)
 *   • After the user picks a result → emits T (the selected item)
 *   • After clear → emits null
 *
 * Multi-column display:
 *   Supply `columns` to render results as a table. Each column maps a header
 *   label to a resolver function: (item: T) => string.
 *   When columns is empty/undefined the panel falls back to a single-line list
 *   using displayWith.
 */
export interface SlColumn<T> {
  header: string;
  cell: (item: T) => string;
  /** Optional relative flex weight (default 1) */
  flex?: number;
}

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

  // ─── Inputs ────────────────────────────────────────────────────────────────

  @Input() label?: string;
  @Input() placeholder = 'Search…';
  @Input() minChars = 2;
  @Input() debounceMs = 250;
  @Input() limit = 25;
  @Input() maxPanelHeight = '340px';

  /**
   * Required: provide a function that returns an observable of results.
   * The component is completely domain-agnostic.
   */
  @Input() searchFn!: (q: string, limit: number) => Observable<T[]>;

  /**
   * Single-column display label. Used when `columns` is not provided.
   * Defaults to common label-like properties.
   */
  @Input() displayWith: (item: T) => string =
    (x: any) => (x?.display ?? x?.label ?? x?.name ?? x?.code ?? '').toString();

  /**
   * Multi-column table configuration. When supplied, the dropdown renders
   * results as a table with column headers.
   */
  @Input() columns: SlColumn<T>[] = [];

  /** Stable identity function for trackBy. */
  @Input() trackBy: (item: T) => any = (x: any) => x?.id ?? x?.code ?? x;

  // ─── Outputs ───────────────────────────────────────────────────────────────

  @Output() selected = new EventEmitter<T>();
  @Output() textChange = new EventEmitter<string>();
  @Output() cleared = new EventEmitter<void>();

  // ─── Internal state ────────────────────────────────────────────────────────

  readonly panelId = `sl-panel-${Math.random().toString(36).slice(2)}`;

  inputCtrl = new FormControl<string>('', { nonNullable: true });

  results: T[] = [];
  loading = false;
  open = false;

  // FIX #6: removed redundant `lastQuery` — read from inputCtrl.value directly
  get queryLength(): number {
    return (this.inputCtrl.value ?? '').length;
  }

  // FIX #4: disabled is derived from the FormControl's state, no @Input clash
  get disabled(): boolean {
    return this.inputCtrl.disabled;
  }

  private destroy$ = new Subject<void>();

  // CVA
  private onChange: (v: T | null) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(
    private host: ElementRef<HTMLElement>,
    // FIX #1: inject ChangeDetectorRef so OnPush re-renders correctly
    private cdr: ChangeDetectorRef
  ) {}

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    if (!this.searchFn) {
      console.warn('ui-smart-lookup: [searchFn] is required.');
    }

    this.inputCtrl.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        map(v => (v ?? '').toString()),
        tap(v => {
          this.textChange.emit(v);
          // FIX #2: emit null while user is typing (no confirmed selection yet)
          this.onChange(null);

          if (v.length < this.minChars) {
            this.results = [];
            this.open = false;
            this.loading = false;
            this.cdr.markForCheck();
          }
        }),
        filter(v => v.length >= this.minChars),
        debounceTime(this.debounceMs),
        distinctUntilChanged(),
        tap(() => {
          this.loading = true;
          this.open = true;
          this.cdr.markForCheck();
        }),
        switchMap(q =>
          // FIX #3: finalize() runs on both completion AND cancellation (unlike tap)
          (this.searchFn ? this.searchFn(q, this.limit) : of([] as T[])).pipe(
            catchError(() => of([] as T[])),
            finalize(() => {
              this.loading = false;
              this.cdr.markForCheck();
            })
          )
        )
      )
      .subscribe(list => {
        this.results = list ?? [];
        this.open = this.queryLength >= this.minChars;
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── UI events ─────────────────────────────────────────────────────────────

  onPick(item: T): void {
    this.open = false;
    this.results = [];

    const label = this.displayWith(item);
    this.inputCtrl.setValue(label, { emitEvent: false });

    this.selected.emit(item);
    // FIX #2: CVA now emits T (the selected item) on confirmed pick
    this.onChange(item);
    this.onTouched();
    this.cdr.markForCheck();
  }

  onClear(): void {
    this.results = [];
    this.open = false;
    this.inputCtrl.setValue('', { emitEvent: true });
    this.onChange(null);
    this.cleared.emit();
    this.cdr.markForCheck();
  }

  trackByIndex = (_index: number, item: T): any => this.trackBy(item);

  /** Close panel on outside click */
  @HostListener('document:mousedown', ['$event'])
  onDocMouseDown(ev: MouseEvent): void {
    if (!this.open) return;
    const target = ev.target as Node | null;
    if (!target) return;
    if (!this.host?.nativeElement?.contains(target)) {
      this.open = false;
      this.cdr.markForCheck();
    }
  }

  // ─── ControlValueAccessor ──────────────────────────────────────────────────

  writeValue(value: any): void {
    if (value == null) {
      this.inputCtrl.setValue('', { emitEvent: false });
      return;
    }
    if (typeof value === 'string') {
      this.inputCtrl.setValue(value, { emitEvent: false });
      return;
    }
    try {
      this.inputCtrl.setValue(this.displayWith(value as T), { emitEvent: false });
    } catch {
      this.inputCtrl.setValue('', { emitEvent: false });
    }
  }

  registerOnChange(fn: (v: T | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  // FIX #4: single source of truth — FormControl manages disabled state
  setDisabledState(isDisabled: boolean): void {
    if (isDisabled) this.inputCtrl.disable({ emitEvent: false });
    else this.inputCtrl.enable({ emitEvent: false });
    this.cdr.markForCheck();
  }
}
