import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class TabService {
  private tabs: { id: number; name: string; content: string }[] = [];
  private nextTabId = 1;
  private selectedTab: number | null = null;

  // Method to add a new tab with duplicate check
  addTab(name: string, content: string): { added: boolean; tabId: number } {
    const existingTab = this.tabs.find((tab) => tab.name === name);

    if (existingTab) {
      this.selectedTab = existingTab.id;
      return { added: false, tabId: existingTab.id };
    }

    const newTab = { id: this.nextTabId++, name, content };
    this.tabs.push(newTab);
    this.selectedTab = newTab.id;
    return { added: true, tabId: newTab.id };
  }

  // Method to get all tabs
  getTabs() {
    return this.tabs;
  }

  // Method to get the selected tab
  getSelectedTab(): number | null {
    return this.selectedTab;
  }

  // Method to set the selected tab
  setSelectedTab(tabId: number) {
    this.selectedTab = tabId;
  }

  // Method to remove a tab
  removeTab(tabId: number) {
    this.tabs = this.tabs.filter((tab) => tab.id !== tabId);
    if (this.selectedTab === tabId) {
      this.selectedTab = this.tabs.length > 0 ? this.tabs[0].id : null;
    }
  }
}
