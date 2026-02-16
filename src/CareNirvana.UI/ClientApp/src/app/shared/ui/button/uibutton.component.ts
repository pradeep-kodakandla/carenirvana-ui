import {
  Component, Input, Output, EventEmitter,
  ChangeDetectionStrategy
} from '@angular/core';
import { UiButtonVariant, UiControlSize } from '../shared/ui-types';

@Component({
  selector: 'ui-button',
  templateUrl: './uibutton.component.html',
  styleUrls: ['./uibutton.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UiButtonComponent {

  @Input() label = '';
  @Input() variant: UiButtonVariant = 'primary';
  @Input() size: UiControlSize = 'md';
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() disabled = false;
  @Input() loading = false;
  @Input() block = false;
  @Input() iconLeft: string | null = null;
  @Input() iconRight: string | null = null;
  @Input() ariaLabel: string | null = null;
  @Input() width: string | null = null;

  @Output() clicked = new EventEmitter<MouseEvent>();

  onClick(event: MouseEvent): void {
    if (this.disabled || this.loading) return;
    this.clicked.emit(event);
  }
}
