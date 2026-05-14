import {
  Component, ElementRef, HostListener, OnInit, ViewChild
} from '@angular/core';

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

@Component({
  selector: 'app-floatingnotes',
  templateUrl: './floatingnotes.component.html',
  styleUrl: './floatingnotes.component.css'
})
export class FloatingnotesComponent implements OnInit {
  @ViewChild('fab', { static: true }) fab!: ElementRef<HTMLButtonElement>;

  position = { top: 0, left: 0 };
  corner: Corner = 'bottom-right';

  private dragging = false;
  private moved = false;          // distinguishes a click from a drag
  private offsetX = 0;
  private offsetY = 0;
  private readonly size = 56;     // button diameter in px
  private readonly peekRatio = 0.3; // 30% hidden
  private readonly margin = 24;   // distance from top/bottom edge

  ngOnInit(): void {
    this.snapToCorner('bottom-right');
  }

  @HostListener('window:resize')
  onResize(): void {
    this.snapToCorner(this.corner);
  }

  onPointerDown(event: PointerEvent): void {
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

  @HostListener('window:pointerup', ['$event'])
  onPointerUp(event: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;

    // Decide nearest corner based on where the center landed
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
    // Suppress click that follows a drag
    if (this.moved) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    this.openAddNotes();
  }

  private snapToCorner(corner: Corner): void {
    this.corner = corner;
    const hidden = this.size * this.peekRatio;        // 30% pushed off-screen
    const visible = this.size - hidden;
    const onRight = corner.endsWith('right');
    const onBottom = corner.startsWith('bottom');

    this.position = {
      left: onRight
        ? window.innerWidth - visible
        : -hidden,
      top: onBottom
        ? window.innerHeight - this.size - this.margin
        : this.margin
    };
  }

  private openAddNotes(): void {
    console.log('Add Notes clicked');
    // open modal / navigate here
  }
}
