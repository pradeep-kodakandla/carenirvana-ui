// src/app/rulesengine/decisiontable/decisiontableservice.ts

import { Injectable } from '@angular/core';
import { DecisionTableBinding, DecisionTableDefinition } from '../models/decisiontable.model';

@Injectable({ providedIn: 'root' })
export class DecisionTableService {
  private tableKey = 'rulesengine.decisiontables';
  private bindingKey = 'rulesengine.decisiontablebindings';

  // ---------- Tables ----------
  listTables(): DecisionTableDefinition[] {
    return this.safeRead<DecisionTableDefinition[]>(this.tableKey, []);
  }

  getTable(id: string): DecisionTableDefinition | null {
    return this.listTables().find(t => t.id === id) ?? null;
  }

  upsertTable(table: DecisionTableDefinition): void {
    const all = this.listTables();
    const idx = all.findIndex(t => t.id === table.id);
    const next: DecisionTableDefinition = { ...table, updatedOn: new Date().toISOString() };

    if (idx >= 0) all[idx] = next;
    else all.push(next);

    this.safeWrite(this.tableKey, all);
  }

  deleteTable(id: string): void {
    const all = this.listTables().filter(t => t.id !== id);
    this.safeWrite(this.tableKey, all);

    // also delete bindings pointing to it
    const bindings = this.listBindings().filter(b => b.decisionTableId !== id);
    this.safeWrite(this.bindingKey, bindings);
  }

  // ---------- Bindings ----------
  listBindings(): DecisionTableBinding[] {
    return this.safeRead<DecisionTableBinding[]>(this.bindingKey, []);
  }

  listBindingsForTable(tableId: string): DecisionTableBinding[] {
    return this.listBindings().filter(b => b.decisionTableId === tableId);
  }

  getBinding(id: string): DecisionTableBinding | null {
    return this.listBindings().find(b => b.id === id) ?? null;
  }

  upsertBinding(binding: DecisionTableBinding): void {
    const all = this.listBindings();
    const idx = all.findIndex(b => b.id === binding.id);
    const next: DecisionTableBinding = { ...binding, updatedOn: new Date().toISOString() };

    if (idx >= 0) all[idx] = next;
    else all.push(next);

    this.safeWrite(this.bindingKey, all);
  }

  deleteBinding(id: string): void {
    const all = this.listBindings().filter(b => b.id !== id);
    this.safeWrite(this.bindingKey, all);
  }

  // ---------- Helpers ----------
  private safeRead<T>(key: string, fallback: T): T {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  }

  private safeWrite(key: string, value: any): void {
    localStorage.setItem(key, JSON.stringify(value));
  }

  newId(prefix: string): string {
    return `${prefix}${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(2, 6)}`;
  }
}
