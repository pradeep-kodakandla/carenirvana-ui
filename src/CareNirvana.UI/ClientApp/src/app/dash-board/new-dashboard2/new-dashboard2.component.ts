import { Component } from '@angular/core';

export interface Tile {
  color: string;
  cols: number;
  rows: number;
  text: string;
}

@Component({
  selector: 'app-new-dashboard2',
  templateUrl: './new-dashboard2.component.html',
  styleUrl: './new-dashboard2.component.css'
})
export class NewDashboard2Component {
  expandedCard: string | null = null;
  collapsedCards: string[] = [];
  removedCards: string[] = [];

  toggleExpand(card: string): void {
    if (this.expandedCard === card) {
      this.expandedCard = null;
    } else {
      this.expandedCard = card;
    }
  }

  removeCard(card: string): void {
    this.removedCards.push(card);
  }

  isCardRemoved(card: string): boolean {
    return this.removedCards.includes(card);
  }
}
