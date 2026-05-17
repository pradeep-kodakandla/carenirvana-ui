import {
  Component, ElementRef, HostListener, OnInit, OnDestroy,
  ViewChild, ViewContainerRef, ComponentRef, ChangeDetectorRef
} from '@angular/core';
import { Subject } from 'rxjs';

import { HeaderService } from 'src/app/service/header.service';
import { MemberNotesComponent } from 'src/app/member/member-notes/member-notes.component';

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** Which notes surface the panel should render. Auth/Case are wired up later. */
export type NotesContext = 'member' | 'auth' | 'case';

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

  // ─── Member context resolved from the active tab ──────────────────────────
  memberId?: number;
  memberDetailsId?: number;
  contextType: NotesContext = 'member';
  activeTabLabel = '';

  /** Refresh stream passed to the notes component (mirrors mycaseload). */
  refreshNotes$ = new Subject<number>();

  /** Live reference to the dynamically created notes component. */
  private activeRef?: ComponentRef<MemberNotesComponent>;

  constructor(
    private headerService: HeaderService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.snapToCorner('bottom-right');
  }

  ngOnDestroy(): void {
    this.disposeNotes();
    this.refreshNotes$.complete();
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
    this.expanded = true;

    // Render the panel (and its #notesHost anchor) before mounting into it.
    this.cdr.detectChanges();
    this.mountNotes();
  }

  /**
   * Dynamically creates the notes component inside the panel.
   * Mirrors mycaseload.mountPane(): setInput(...) + instance.openForm('add').
   */
  private mountNotes(): void {
    if (!this.notesHost || !this.hasMemberContext) return;

    this.disposeNotes();

    // For now we always mount Member Notes. When the Auth/Case note
    // components exist, switch on `contextType` here and create the right
    // one — everything below this line stays the same:
    //   this.contextType === 'auth' -> this.notesHost.createComponent(AuthNotesComponent)
    //   this.contextType === 'case' -> this.notesHost.createComponent(CaseNotesComponent)
    this.activeRef = this.notesHost.createComponent(MemberNotesComponent);

    const ref = this.activeRef;
    const id = this.memberDetailsId ?? this.memberId;

    // Feed the member context resolved from the active tab.
    if (this.memberDetailsId != null) ref.setInput('memberDetailsId', this.memberDetailsId);
    if (this.memberId != null)        ref.setInput('memberId', this.memberId);

    // Open straight into the "add note" form (mirrors mycaseload).
    ref.setInput('formOnly', true);
    ref.instance.openForm?.('add');
    if (id != null) this.refreshNotes$.next(id);

    // Flush the newly created component's first change detection.
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

  /** True when there is a member to attach notes to. */
  get hasMemberContext(): boolean {
    return !!this.memberId || !!this.memberDetailsId;
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
    this.expanded = false;
    this.showConfirmClose = false;
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
