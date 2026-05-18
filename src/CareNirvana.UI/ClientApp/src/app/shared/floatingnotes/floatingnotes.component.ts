import {
  Component, ElementRef, HostListener, OnInit, OnDestroy,
  ViewChild, ViewContainerRef, ComponentRef, ChangeDetectorRef
} from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { HeaderService } from 'src/app/service/header.service';
import { MemberNotesComponent } from 'src/app/member/member-notes/member-notes.component';
import {
  DashboardServiceService,
  SearchNavigationResult
} from 'src/app/service/dashboard.service.service';

// NOTE: adjust these two import paths if the components live elsewhere in your
// project. The classes are AuthnotesComponent (selector app-authnotes) and
// CasenotesComponent (selector app-casenotes).
import { AuthnotesComponent } from 'src/app/member/UM/steps/authnotes/authnotes.component';
import { CasenotesComponent } from 'src/app/member/AG/steps/casenotes/casenotes.component';

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** Which notes surface the panel should render. */
export type NotesContext = 'member' | 'auth' | 'case';

/** Search-bar module: Member (CM) / Auth (UM) / Case (AG). */
export type SearchModule = 'CM' | 'UM' | 'AG';

/** Union of every notes component the panel can mount dynamically. */
type AnyNotesComponent =
  | MemberNotesComponent
  | AuthnotesComponent
  | CasenotesComponent;

@Component({
  selector: 'app-floatingnotes',
  templateUrl: './floatingnotes.component.html',
  styleUrl: './floatingnotes.component.css'
})
export class FloatingnotesComponent implements OnInit, OnDestroy {
  // Non-static: the FAB is behind *ngIf, so the query must refresh after CD.
  @ViewChild('fab') fab?: ElementRef<HTMLButtonElement>;

  /** Anchor element where the notes component is dynamically mounted. */
  @ViewChild('notesHost', { read: ViewContainerRef })
  private notesHost?: ViewContainerRef;

  // ─── FAB drag state ───────────────────────────────────────────────────────
  position = { top: 0, left: 0 };
  corner: Corner = 'bottom-right';

  private dragging = false;
  private moved = false;            // distinguishes a click from a drag
  private offsetX = 0;
  private offsetY = 0;
  private readonly size = 56;       // button diameter in px
  private readonly peekRatio = 0.3; // 30% hidden
  private readonly margin = 24;     // distance from top/bottom edge

  // ─── Panel state ──────────────────────────────────────────────────────────
  expanded = false;
  showConfirmClose = false;

  /** True while a CM/UM/AG searchNavigation lookup is in flight. */
  loading = false;
  /** Set when the member/auth/case context could not be resolved. */
  loadError: string | null = null;

  // ─── Member context resolved from the active tab / search ─────────────────
  memberId?: number;
  memberDetailsId?: number;
  contextType: NotesContext = 'member';
  activeTabLabel = '';

  // ─── Auth / Case identifiers resolved from the active tab / search ────────
  authNumber?: string;
  caseNumber?: string;

  // ─── Search bar ───────────────────────────────────────────────────────────
  /** Module selected in the search bar. */
  searchModule: SearchModule = 'CM';
  /** Free-text value typed into the search box. */
  searchQuery = '';

  /**
   * Monotonic token for async context resolution. Every resolve (tab open or
   * manual search) captures the current value; a stale callback whose token no
   * longer matches is ignored — so a slow lookup can't mount the wrong
   * component after a newer search/close.
   */
  private resolveSeq = 0;

  /** Refresh stream passed to the notes component (mirrors mycaseload). */
  refreshNotes$ = new Subject<number>();

  /** Live reference to the dynamically created notes component. */
  private activeRef?: ComponentRef<AnyNotesComponent>;

  private destroy$ = new Subject<void>();

  constructor(
    private headerService: HeaderService,
    private cdr: ChangeDetectorRef,
    private dashboardService: DashboardServiceService
  ) {}

  ngOnInit(): void {
    this.snapToCorner('bottom-right');
  }

  ngOnDestroy(): void {
    this.disposeNotes();
    this.refreshNotes$.complete();
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ═══ FAB drag (collapsed mode only) ═══════════════════════════════════════

  @HostListener('window:resize')
  onResize(): void {
    if (!this.expanded) this.snapToCorner(this.corner);
  }

  onPointerDown(event: PointerEvent): void {
    if (this.expanded || !this.fab) return;
    this.dragging = true;
    this.moved = false;
    const rect = this.fab.nativeElement.getBoundingClientRect();
    this.offsetX = event.clientX - rect.left;
    this.offsetY = event.clientY - rect.top;
    this.fab.nativeElement.setPointerCapture(event.pointerId);
  }

  @HostListener('window:pointermove', ['$event'])
  onPointerMove(event: PointerEvent): void {
    if (!this.dragging) return;
    this.moved = true;
    this.position = {
      left: event.clientX - this.offsetX,
      top: event.clientY - this.offsetY
    };
  }

  @HostListener('window:pointerup')
  onPointerUp(): void {
    if (!this.dragging) return;
    this.dragging = false;

    const centerX = this.position.left + this.size / 2;
    const centerY = this.position.top + this.size / 2;
    const isRight = centerX > window.innerWidth / 2;
    const isBottom = centerY > window.innerHeight / 2;

    const next: Corner =
      isBottom && isRight ? 'bottom-right' :
      isBottom && !isRight ? 'bottom-left' :
      !isBottom && isRight ? 'top-right' : 'top-left';

    this.snapToCorner(next);
  }

  onClick(event: MouseEvent): void {
    // Suppress the click that follows a drag.
    if (this.moved) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    this.openPanel();
  }

  private snapToCorner(corner: Corner): void {
    this.corner = corner;
    const hidden = this.size * this.peekRatio;
    const visible = this.size - hidden;
    const onRight = corner.endsWith('right');
    const onBottom = corner.startsWith('bottom');

    this.position = {
      left: onRight ? window.innerWidth - visible : -hidden,
      top: onBottom ? window.innerHeight - this.size - this.margin : this.margin
    };
  }

  // ═══ Panel open / close ═══════════════════════════════════════════════════

  /** Opens the notes panel and mounts the notes component for the active tab. */
  openPanel(): void {
    this.resolveActiveTabContext();
    this.syncSearchToActiveTab();
    this.loading = false;
    this.loadError = null;
    this.expanded = true;

    // Render the panel (and its #notesHost anchor) before mounting into it.
    this.cdr.detectChanges();
    this.mountNotes();
  }

  /**
   * Dynamically creates the right notes component inside the panel based on
   * the active tab:
   *   member -> MemberNotesComponent  (formOnly, opened on the "add" form)
   *   auth   -> AuthnotesComponent    (singlePane, mode 'add')
   *   case   -> CasenotesComponent    (singlePane, isAddOnly)
   *
   * Auth/Case first resolve their IDs through dashboardService.searchNavigation
   * (module 'UM' / 'AG') using the auth/case number picked from the active tab.
   */
  private mountNotes(): void {
    this.disposeNotes();
    const seq = ++this.resolveSeq;

    switch (this.contextType) {
      case 'auth':
        this.mountAuthNotes(seq);
        break;
      case 'case':
        this.mountCaseNotes(seq);
        break;
      default:
        this.mountMemberNotes();
        break;
    }
  }

  // ═══ Search bar ════════════════════════════════════════════════════════════

  /** Placeholder text for the search box, driven by the selected module. */
  get searchPlaceholder(): string {
    switch (this.searchModule) {
      case 'UM': return 'Enter authorization number';
      case 'AG': return 'Enter case number';
      default:   return 'Enter member ID';
    }
  }

  /**
   * Manual search. Looks up the entered value for the chosen module via
   * searchNavigation and, on a successful response, mounts the matching notes
   * component — overriding whatever the active tab had resolved to.
   */
  runSearch(): void {
    const query = (this.searchQuery ?? '').trim();
    const module = this.searchModule;
    if (!query) return;

    const seq = ++this.resolveSeq;
    this.disposeNotes();
    this.loading = true;
    this.loadError = null;
    this.cdr.detectChanges();

    this.dashboardService
      .searchNavigation(module, query)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => this.onSearchResolved(module, query, res, seq),
        error: () =>
          this.onContextResolveError('Unable to complete the search. Please try again.', seq)
      });
  }

  /** Route a search response to the right context handler. */
  private onSearchResolved(
    module: SearchModule,
    query: string,
    res: SearchNavigationResult | null,
    seq: number
  ): void {
    if (seq !== this.resolveSeq || !this.expanded) return;

    if (!res || res.found === false) {
      this.loading = false;
      this.loadError =
        res?.message ?? `No ${this.moduleLabel(module)} found for "${query}".`;
      this.cdr.detectChanges();
      return;
    }

    // The search result overrides the active-tab context.
    switch (module) {
      case 'UM':
        this.contextType = 'auth';
        this.activeTabLabel = res.authNumber ?? query;
        this.onAuthContextResolved(res, seq);
        break;
      case 'AG':
        this.contextType = 'case';
        this.activeTabLabel = res.caseNumber ?? query;
        this.onCaseContextResolved(res, seq);
        break;
      case 'CM':
      default:
        this.contextType = 'member';
        this.activeTabLabel = res.memberId != null ? 'ID ' + res.memberId : query;
        this.onMemberContextResolved(res, seq);
        break;
    }
  }

  private moduleLabel(module: SearchModule): string {
    return module === 'UM' ? 'authorization'
         : module === 'AG' ? 'case'
         : 'member';
  }

  /** Pre-fill the search bar so it mirrors whatever the active tab resolved to. */
  private syncSearchToActiveTab(): void {
    switch (this.contextType) {
      case 'auth':
        this.searchModule = 'UM';
        this.searchQuery = this.authNumber ?? '';
        break;
      case 'case':
        this.searchModule = 'AG';
        this.searchQuery = this.caseNumber ?? '';
        break;
      default:
        this.searchModule = 'CM';
        this.searchQuery = this.memberId != null ? String(this.memberId) : '';
        break;
    }
  }

  // ── Member ────────────────────────────────────────────────────────────────

  /**
   * Mounts Member Notes. Mirrors mycaseload.mountPane(): setInput(...) +
   * instance.openForm('add'). Reads memberId / memberDetailsId, which are set
   * either from the active tab or from a 'CM' search.
   */
  private mountMemberNotes(): void {
    if (!this.notesHost || !this.hasMemberContext) return;

    this.disposeNotes();

    const ref = this.notesHost.createComponent(MemberNotesComponent);
    this.activeRef = ref;

    const id = this.memberDetailsId ?? this.memberId;

    // Feed the member context.
    if (this.memberDetailsId != null) ref.setInput('memberDetailsId', this.memberDetailsId);
    if (this.memberId != null)        ref.setInput('memberId', this.memberId);

    // Open straight into the "add note" form (mirrors mycaseload).
    ref.setInput('formOnly', true);
    ref.instance.openForm?.('add');
    if (id != null) this.refreshNotes$.next(id);

    // Flush the newly created component's first change detection.
    this.cdr.detectChanges();
  }

  /** Apply a 'CM' search result, then mount Member Notes. */
  private onMemberContextResolved(res: SearchNavigationResult | null, seq: number): void {
    if (seq !== this.resolveSeq || !this.expanded) return;

    this.loading = false;

    this.memberDetailsId = res?.memberDetailsId ?? undefined;
    this.memberId = res?.memberId ?? undefined;

    if (!this.hasMemberContext) {
      this.loadError = res?.message ?? 'Could not resolve this member.';
      this.cdr.detectChanges();
      return;
    }

    this.loadError = null;
    this.cdr.detectChanges();          // render the #notesHost anchor
    this.mountMemberNotes();
  }

  // ── Auth (UM) ─────────────────────────────────────────────────────────────

  /** Resolve the auth context via searchNavigation('UM', ...) then mount. */
  private mountAuthNotes(seq: number): void {
    if (!this.authNumber) return; // hasNotesContext is false -> empty state shown

    this.loading = true;
    this.loadError = null;
    this.cdr.detectChanges();

    this.dashboardService
      .searchNavigation('UM', this.authNumber)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => this.onAuthContextResolved(res, seq),
        error: () =>
          this.onContextResolveError('Unable to load authorization notes for this tab.', seq)
      });
  }

  private onAuthContextResolved(res: SearchNavigationResult | null, seq: number): void {
    if (seq !== this.resolveSeq || !this.expanded) return;

    this.loading = false;

    if (!res || res.found === false || res.authDetailId == null) {
      this.loadError = res?.message ?? 'Could not resolve this authorization.';
      this.cdr.detectChanges();
      return;
    }

    // Keep authNumber in sync so hasNotesContext stays truthy (search flow).
    this.authNumber = res.authNumber ?? this.authNumber;

    this.loadError = null;
    this.cdr.detectChanges();          // render the #notesHost anchor
    if (!this.notesHost) return;

    this.disposeNotes();

    const ref = this.notesHost.createComponent(AuthnotesComponent);
    this.activeRef = ref;

    ref.setInput('authDetailId', res.authDetailId);
    if (res.authTemplateId != null) ref.setInput('authTemplateId', res.authTemplateId);
    if (res.authNumber)             ref.setInput('authNumber', res.authNumber);

    // Add-only, single-pane embed. mode='add' auto-opens the add editor.
    ref.setInput('singlePane', true);
    ref.setInput('mode', 'add');

    this.cdr.detectChanges();
  }

  // ── Case (AG) ─────────────────────────────────────────────────────────────

  /** Resolve the case context via searchNavigation('AG', ...) then mount. */
  private mountCaseNotes(seq: number): void {
    if (!this.caseNumber) return; // hasNotesContext is false -> empty state shown

    this.loading = true;
    this.loadError = null;
    this.cdr.detectChanges();

    this.dashboardService
      .searchNavigation('AG', this.caseNumber)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => this.onCaseContextResolved(res, seq),
        error: () =>
          this.onContextResolveError('Unable to load case notes for this tab.', seq)
      });
  }

  private onCaseContextResolved(res: SearchNavigationResult | null, seq: number): void {
    if (seq !== this.resolveSeq || !this.expanded) return;

    this.loading = false;

    if (!res || res.found === false || res.caseHeaderId == null) {
      this.loadError = res?.message ?? 'Could not resolve this case.';
      this.cdr.detectChanges();
      return;
    }

    // Keep caseNumber in sync so hasNotesContext stays truthy (search flow).
    this.caseNumber = res.caseNumber ?? this.caseNumber;

    this.loadError = null;
    this.cdr.detectChanges();          // render the #notesHost anchor
    if (!this.notesHost) return;

    this.disposeNotes();

    const ref = this.notesHost.createComponent(CasenotesComponent);
    this.activeRef = ref;

    ref.setInput('caseHeaderId', res.caseHeaderId);
    // searchNavigation returns the case type id, which CasenotesComponent uses
    // as its template id (see its own caseNumber resolver).
    if (res.caseTypeId != null)  ref.setInput('caseTemplateId', res.caseTypeId);
    if (res.caseLevelId != null) ref.setInput('levelId', res.caseLevelId);
    if (res.caseNumber)          ref.setInput('caseNumber', res.caseNumber);

    // Add-only, single-pane embed. isAddOnly auto-opens the add editor.
    ref.setInput('singlePane', true);
    ref.setInput('isAddOnly', true);

    this.cdr.detectChanges();
  }

  /** Shared failure handler for the CM/UM/AG navigation lookups. */
  private onContextResolveError(message: string, seq: number): void {
    if (seq !== this.resolveSeq || !this.expanded) return;
    this.loading = false;
    this.loadError = message;
    this.cdr.detectChanges();
  }

  /** Destroy the mounted notes component and clear the host. */
  private disposeNotes(): void {
    this.activeRef?.destroy();
    this.activeRef = undefined;
    this.notesHost?.clear();
  }

  /** Resolve memberId / memberDetailsId / context from the selected tab. */
  private resolveActiveTabContext(): void {
    const route = this.headerService.getSelectedRoute();

    if (!route) {
      this.memberId = undefined;
      this.memberDetailsId = undefined;
      this.contextType = 'member';
      this.activeTabLabel = '';
      this.authNumber = undefined;
      this.caseNumber = undefined;
      return;
    }

    this.memberId = this.toId(this.headerService.getMemberId(route));
    this.memberDetailsId =
      this.toId(this.headerService.getMemberDetailsId(route)) ??
      this.toId(sessionStorage.getItem('selectedMemberDetailsId'));

    this.contextType = this.detectContext(route);

    const tab = this.headerService.getTabs()
      .find(t => t.route.toLowerCase() === route.toLowerCase());
    this.activeTabLabel = tab?.label ?? '';

    // Pick the auth / case number off the active tab so it can be fed into
    // searchNavigation('UM' | 'AG', ...).
    this.authNumber = this.contextType === 'auth'
      ? this.getTabIdentifier(route, 'auth')
      : undefined;
    this.caseNumber = this.contextType === 'case'
      ? this.getTabIdentifier(route, 'case')
      : undefined;
  }

  private toId(v: string | null | undefined): number | undefined {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  /** Detect whether the active tab is a member / auth / case route. */
  private detectContext(route: string): NotesContext {
    const segments = route.toLowerCase().split('/').filter(Boolean);
    if (segments.includes('auth')) return 'auth';
    if (segments.includes('case')) return 'case';
    return 'member';
  }

  /**
   * Pull the auth / case number out of the active tab's route.
   *
   * The route carries the identifier as the segment immediately after the
   * `auth` / `case` keyword (e.g. `.../auth/AUTH-1001` -> `AUTH-1001`),
   * falling back to the last route segment.
   *
   * >>> This is the single place to adjust if HeaderService exposes a
   * dedicated accessor (e.g. headerService.getAuthNumber(route)) — swap the
   * body of this method and nothing else changes.
   */
  private getTabIdentifier(route: string, keyword: 'auth' | 'case'): string | undefined {
    const segments = route.split('/').map(s => s.trim()).filter(Boolean);

    const idx = segments.findIndex(s => s.toLowerCase() === keyword);
    const raw = idx >= 0 && idx + 1 < segments.length
      ? segments[idx + 1]
      : segments[segments.length - 1];

    const value = (raw ?? '').trim();
    if (!value) return undefined;

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  /** True when there is a member to attach notes to. */
  get hasMemberContext(): boolean {
    return !!this.memberId || !!this.memberDetailsId;
  }

  /** True when the current context has enough data to mount a notes component. */
  get hasNotesContext(): boolean {
    if (this.contextType === 'auth') return !!this.authNumber;
    if (this.contextType === 'case') return !!this.caseNumber;
    return this.hasMemberContext;
  }

  /** Close request — guards against discarding unsaved edits. */
  requestClose(): void {
    if (this.hasUnsavedChanges()) {
      this.showConfirmClose = true;
      return;
    }
    this.closePanel();
  }

  /** Whether the embedded notes component currently has unsaved edits. */
  private hasUnsavedChanges(): boolean {
    return !!this.activeRef?.instance?.hasUnsavedChanges?.();
  }

  /** Confirmation dialog → keep editing. */
  cancelClose(): void {
    this.showConfirmClose = false;
  }

  /** Confirmation dialog → discard and close. */
  confirmClose(): void {
    this.showConfirmClose = false;
    this.closePanel();
  }

  private closePanel(): void {
    this.disposeNotes();
    this.resolveSeq++;              // invalidate any in-flight lookup
    this.expanded = false;
    this.showConfirmClose = false;
    this.loading = false;
    this.loadError = null;
    this.snapToCorner(this.corner); // re-anchor the FAB for next open
  }

  // ═══ Keyboard / browser guards ════════════════════════════════════════════

  /**
   * Escape only dismisses the confirm dialog ("keep editing"). It does NOT
   * close the panel — the panel is non-modal, and an Escape inside the note
   * form (e.g. closing the note-type dropdown) must not close the whole panel.
   */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showConfirmClose) this.cancelClose();
  }

  /** Warn if the browser tab is closed/refreshed with unsaved notes. */
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.expanded && this.hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
