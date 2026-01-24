import { Component, OnInit } from '@angular/core';
import { UiSmartOption } from 'src/app/shared/ui/uismartdropdown/uismartdropdown.component';

import {
  RulesengineService,
  RuleDataFunctionListItem,
  RuleDataFunctionModel,
  UpsertRuleDataFunctionRequest
} from 'src/app/service/rulesengine.service';

@Component({
  selector: 'app-functions',
  templateUrl: './functions.component.html',
  styleUrls: ['./functions.component.css'] // ✅ fixed (was styleUrl)
})
export class FunctionsComponent implements OnInit {
  loading = false;

  // list + search
  functions: RuleDataFunctionListItem[] = [];
  searchText = '';

  // form state
  showForm = false;
  editId: number | null = null;

  // designer helpers (embedded, not modal)
  designerError = '';

  // optional toast
  toastText = '';
  toastKind: 'success' | 'error' = 'success';
  private toastTimer: any = null;

  deploymentStatusOptions: UiSmartOption<string>[] = [
    { value: 'DRAFT', label: 'DRAFT' },
    { value: 'DEPLOYED', label: 'DEPLOYED' },
    { value: 'DEPRECATED', label: 'DEPRECATED' }
  ];

  form: {
    name: string;
    description: string;
    deploymentStatus: string;
    version: number;
    activeFlag: boolean;
    designerText: string; // json editor text
  } = this.emptyForm();

  constructor(private api: RulesengineService) { }

  ngOnInit(): void {
    this.refresh();
  }

  get isEditMode(): boolean {
    return this.editId != null;
  }

  get filteredFunctions(): RuleDataFunctionListItem[] {
    const q = (this.searchText ?? '').trim().toLowerCase();
    if (!q) return this.functions;

    return this.functions.filter(f => {
      const name = (f.name ?? '').toLowerCase();
      const st = (f.deploymentStatus ?? '').toLowerCase();
      const v = String(f.version ?? '');
      const act = f.activeFlag ? 'active' : 'inactive';
      return (
        name.includes(q) ||
        st.includes(q) ||
        v.includes(q) ||
        act.includes(q)
      );
    });
  }

  refresh(): void {
    this.loading = true;
    this.api.listRuleDataFunctions().subscribe({
      next: (rows) => {
        this.functions = rows ?? [];
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load rule data functions', err);
        this.functions = [];
        this.loading = false;
        this.showToast('Failed to load functions', 'error');
      }
    });
  }

  onNew(): void {
    this.showForm = true;
    this.editId = null;
    this.designerError = '';
    this.form = this.emptyForm();
  }

  onCancel(): void {
    this.showForm = false;
    this.editId = null;
    this.designerError = '';
  }

  onEdit(item: RuleDataFunctionListItem): void {
    this.showForm = true;
    this.editId = item.id;
    this.designerError = '';

    this.loading = true;
    this.api.getRuleDataFunction(item.id).subscribe({
      next: (m: RuleDataFunctionModel) => {
        this.form = {
          name: (m.ruleDataFunctionName ?? '').toString(),
          description: (m.description ?? '').toString(),
          deploymentStatus: (m.deploymentStatus ?? 'DRAFT').toString(),
          version: Number(m.version ?? 1),
          activeFlag: !!m.activeFlag,
          designerText: this.prettyAnyJson(m.ruleDataFunctionJson)
        };
        this.loading = false;
        this.scrollToDesigner();
      },
      error: (err) => {
        console.error('Failed to load function', err);
        // still open with what we have from list
        this.form = {
          ...this.emptyForm(),
          name: (item.name ?? '').toString(),
          deploymentStatus: (item.deploymentStatus ?? 'DRAFT').toString(),
          version: Number(item.version ?? 1),
          activeFlag: !!item.activeFlag,
        };
        this.loading = false;
        this.showToast('Failed to load full function (opened basic form)', 'error');
        this.scrollToDesigner();
      }
    });
  }

  openDesigner(item: RuleDataFunctionListItem): void {
    // same as edit, but intent is to jump user to designer at bottom
    this.onEdit(item);
  }

  validateDesigner(): void {
    this.designerError = '';
    const text = (this.form.designerText ?? '').trim();
    if (!text) {
      this.designerError = 'Designer JSON is required (cannot be empty).';
      return;
    }
    const parsed = this.tryParseJson(text);
    if (!parsed.ok) this.designerError = parsed.error;
  }

  formatDesigner(): void {
    this.designerError = '';
    const text = (this.form.designerText ?? '').trim();
    if (!text) return;

    const parsed = this.tryParseJson(text);
    if (!parsed.ok) {
      this.designerError = parsed.error;
      return;
    }
    this.form.designerText = JSON.stringify(parsed.value, null, 2);
  }

  onSave(): void {
    const name = (this.form.name ?? '').trim();
    const description = (this.form.description ?? '').trim();
    const deploymentStatus = (this.form.deploymentStatus ?? 'DRAFT').trim() || 'DRAFT';
    const version = Number(this.form.version ?? 1) || 1;
    const activeFlag = !!this.form.activeFlag;

    if (!name) {
      this.showToast('Function Name is required', 'error');
      return;
    }
    if (!description) {
      this.showToast('Description is required', 'error');
      return;
    }

    // ruleDataFunctionJson is NOT NULL in DB, so require non-empty JSON
    const designerText = (this.form.designerText ?? '').trim();
    if (!designerText) {
      this.designerError = 'Designer JSON is required (cannot be empty).';
      this.showToast('Designer JSON is required', 'error');
      return;
    }

    const parsed = this.tryParseJson(designerText);
    if (!parsed.ok) {
      this.designerError = parsed.error;
      this.showToast('Invalid JSON in Designer', 'error');
      return;
    }

    // ✅ IMPORTANT: UpsertRuleDataFunctionRequest expects "name", NOT ruleDataFunctionName
    const req: UpsertRuleDataFunctionRequest = {
      name,
      description,
      deploymentStatus,
      version,
      activeFlag,
      ruleDataFunctionJson: parsed.value
    };

    this.loading = true;

    this.loading = true;

    if (this.editId != null) {
      this.api.updateRuleDataFunction(this.editId, req).subscribe({
        next: () => {
          this.loading = false;
          this.showForm = false;
          this.editId = null;
          this.designerError = '';
          this.showToast('Function updated', 'success');
          this.refresh();
        },
        error: (err: any) => {
          console.error('Update function failed', err);
          this.loading = false;
          this.showToast('Save failed', 'error');
        }
      });
    } else {
      this.api.createRuleDataFunction(req).subscribe({
        next: (id: number) => {
          this.loading = false;
          this.showForm = false;
          this.editId = null;
          this.designerError = '';
          this.showToast('Function created', 'success');
          this.refresh();
        },
        error: (err: any) => {
          console.error('Create function failed', err);
          this.loading = false;
          this.showToast('Save failed', 'error');
        }
      });
    }
  }

  onDelete(item: RuleDataFunctionListItem): void {
    const ok = confirm(`Delete function "${item.name}"? This is a soft delete.`);
    if (!ok) return;

    this.loading = true;
    this.api.deleteRuleDataFunction(item.id).subscribe({
      next: () => {
        this.loading = false;
        this.showToast('Function deleted', 'success');
        this.refresh();
      },
      error: (err) => {
        console.error('Delete function failed', err);
        this.loading = false;
        this.showToast('Delete failed', 'error');
      }
    });
  }

  // --------------------
  // helpers
  // --------------------

  private emptyForm() {
    return {
      name: '',
      description: '',
      deploymentStatus: 'DRAFT',
      version: 1,
      activeFlag: true,
      designerText: this.defaultFunctionTemplate()
    };
  }

  private defaultFunctionTemplate(): string {
    // You can evolve this schema later — this is a safe starting point for the Designer.
    return JSON.stringify({
      key: "ageCalculation",
      displayName: "Age Calculation",
      description: "Calculates age based on DOB and reference date.",
      returnType: "number",
      parameters: [
        { name: "dob", type: "date", required: true },
        { name: "asOf", type: "date", required: false }
      ],
      implementation: {
        type: "expression",
        language: "javascript",
        body: "const ref = asOf ? new Date(asOf) : new Date(); const b = new Date(dob); return Math.floor((ref - b) / 31557600000);"
      }
    }, null, 2);
  }

  private prettyAnyJson(val: any): string {
    if (val == null) return '';
    if (typeof val === 'string') return this.prettyIfJson(val);
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  }

  private prettyIfJson(text: string): string {
    const t = (text ?? '').trim();
    if (!t) return '';
    const parsed = this.tryParseJson(t);
    if (!parsed.ok) return text;
    return JSON.stringify(parsed.value, null, 2);
  }

  private tryParseJson(text: string): { ok: true; value: any } | { ok: false; error: string } {
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (e: any) {
      return { ok: false, error: (e?.message ?? 'Invalid JSON').toString() };
    }
  }

  private showToast(text: string, kind: 'success' | 'error') {
    this.toastText = text;
    this.toastKind = kind;

    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastText = '';
      this.toastTimer = null;
    }, 2500);
  }

  private scrollToDesigner() {
    setTimeout(() => {
      const el = document.getElementById('fnDesigner');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }
}
