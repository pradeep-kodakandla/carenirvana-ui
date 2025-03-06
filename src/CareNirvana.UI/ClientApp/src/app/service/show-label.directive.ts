import { Directive, ElementRef, Renderer2, HostListener, OnInit } from '@angular/core';

@Directive({
  selector: '[appShowLabel]'
})
export class ShowLabelDirective implements OnInit {
  private label!: HTMLElement;

  constructor(private el: ElementRef, private renderer: Renderer2) { }

  ngOnInit() {
    this.createLabel();
  }

  private createLabel() {
    const inputElement = this.el.nativeElement;
    const parentElement = inputElement.parentElement;

    if (!parentElement) return;

    // Create a label element
    this.label = this.renderer.createElement('label');
    const labelText = inputElement.getAttribute('placeholder') || inputElement.getAttribute('name') || 'Select an option';
    this.label.innerText = labelText;

    // Add classes and styles
    this.renderer.addClass(this.label, 'dynamic-label');
    this.renderer.setStyle(this.label, 'position', 'absolute');
    this.renderer.setStyle(this.label, 'top', '10px');
    this.renderer.setStyle(this.label, 'left', '15px');
    this.renderer.setStyle(this.label, 'font-size', '14px');
    this.renderer.setStyle(this.label, 'color', '#6c757d');
    this.renderer.setStyle(this.label, 'opacity', '0');
    this.renderer.setStyle(this.label, 'transition', '0.2s ease-in-out');
    this.renderer.setStyle(this.label, 'pointer-events', 'none');

    // Insert label before the input field
    this.renderer.insertBefore(parentElement, this.label, inputElement);
  }

  @HostListener('focus') onFocus() {
    this.showLabel();
  }

  @HostListener('blur') onBlur() {
    if (!this.el.nativeElement.value) {
      this.hideLabel();
    }
  }

  @HostListener('change') onChange() {
    if (this.el.nativeElement.value) {
      this.showLabel();
    } else {
      this.hideLabel();
    }
  }

  private showLabel() {
    this.renderer.setStyle(this.label, 'opacity', '1');
    this.renderer.setStyle(this.label, 'top', '-10px');
    this.renderer.setStyle(this.label, 'font-size', '12px');
    this.renderer.setStyle(this.label, 'background', 'white');
    this.renderer.setStyle(this.label, 'padding', '0 5px');
  }

  private hideLabel() {
    this.renderer.setStyle(this.label, 'opacity', '0');
    this.renderer.setStyle(this.label, 'top', '10px');
    this.renderer.setStyle(this.label, 'font-size', '14px');
  }
}
