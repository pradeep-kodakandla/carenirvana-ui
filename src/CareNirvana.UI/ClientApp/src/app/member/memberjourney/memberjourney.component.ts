import { Component, OnDestroy, OnInit, Input } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  MemberjourneyService, CATEGORY_META,
  EventCategory,
  MemberJourneyEvent,
  MemberJourneyQuery,
  MemberJourneyResponse, MemberJourneySummary
} from 'src/app/service/memberjourney.service';

// Add this type in your component file
type RenderEvent = {
  e: MemberJourneyEvent;
  side: 'left' | 'right';
  isNewDate: boolean;
  dateLabel: string;  // e.g., "Oct 13, 2025"
};

interface CounterChip {
  label: string;
  count: number;
  color: string;
}

@Component({
  selector: 'app-memberjourney',
  templateUrl: './memberjourney.component.html',
  styleUrl: './memberjourney.component.css'
})
export class MemberJourneyComponent implements OnInit, OnDestroy {

  @Input() memberDetailsId?: number;
  @Input() formOnly = false;

  viewMode: 'timeline' | 'table' = 'timeline';
  granularity: 'Day' | 'Week' | 'Month' = 'Day';
  loading = false;
  error?: string;

  // Data
  events: MemberJourneyEvent[] = [];
  summary!: MemberJourneySummary;
  total = 0;
  page = 1;
  pageSize = 15;


  CATEGORIES = [
    { key: EventCategory.Alert, label: 'Alerts', color: '#ef5350' },
    { key: EventCategory.Auth, label: 'Auth', color: '#42a5f5' },
    { key: EventCategory.AuthActivity, label: 'Activity', color: '#5c6bc0' },
    { key: EventCategory.Enrollment, label: 'Enrollment', color: '#26a69a' },
    { key: EventCategory.CareStaff, label: 'Care Staff', color: '#7e57c2' },
    { key: EventCategory.Caregiver, label: 'Caregiver', color: '#ab47bc' },
    { key: EventCategory.Program, label: 'Program', color: '#29b6f6' },
    { key: EventCategory.Note, label: 'Notes', color: '#90a4ae' },
    { key: EventCategory.Risk, label: 'Risk', color: '#66bb6a' },
  ];

  // Filters form
  form = this.fb.group({
    rangePreset: ['Last 30 Days' as 'Last 7 Days' | 'Last 30 Days' | 'Last 90 Days' | 'All'],
    search: [''],
    categories: [this.CATEGORIES.map(c => c.key)]
  });


  // counters for footer chips
  counters: Array<{ label: string; count: number; color: string }> = [];


  private sub?: Subscription;

  constructor(private fb: FormBuilder, private journeyService: MemberjourneyService) { }

  ngOnInit(): void {
    if (!this.memberDetailsId) {
      this.memberDetailsId = Number(sessionStorage.getItem("selectedMemberDetailsId"));
    }


    this.fetch();
  }


  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  setView(mode: 'timeline' | 'table') { this.viewMode = mode; }


  setGranularity(g: 'Day' | 'Week' | 'Month') { this.granularity = g; }


  onApply() { this.page = 1; this.fetch(); }


  //onPageChange(page: number) { this.page = page; this.fetch(); }


  // Compute date range from preset (used in fetch)
  private getRange(): { fromUtc?: string, toUtc?: string } {
    const now = new Date();
    const end = now.toISOString();
    let fromUtc: string | undefined;
    let toUtc = now.toISOString();

    const preset = this.form.value.rangePreset as string;

    if (preset === 'All') {
      if (!fromUtc) {
        fromUtc = '2025-01-01T00:00:00Z';
      } return { fromUtc, toUtc: end };
    }
    const start = new Date();
    start.setDate(start.getDate() - (preset === 'Last 7 Days' ? 7 : preset === 'Last 90 Days' ? 90 : 30));
    fromUtc = start.toISOString(); toUtc = end;

    return { fromUtc, toUtc };
  }

  fetch() {
    this.error = undefined;
    this.loading = true;


    const { fromUtc, toUtc } = this.getRange();
    const search = (this.form.value.search || '')!.trim() || undefined;
    const cats = (this.form.value.categories || []) as number[];


    const query: MemberJourneyQuery = {
      memberDetailsId: this.memberDetailsId!,
      fromUtc, toUtc,
      page: this.page,
      pageSize: this.pageSize,
      //categories: [EventCategory.Auth, EventCategory.AuthActivity, EventCategory.Caregiver, EventCategory.CareStaff, EventCategory.Enrollment, EventCategory.Note, EventCategory.Program, EventCategory.Alert, EventCategory.Risk],
      categories: cats.length ? cats as any : undefined,
      search: (this.form.value.search || '')!.trim() || undefined
    };

    this.journeyService.getJourney(query).subscribe({
      next: (res) => {
        this.events = res.page.items;
        this.total = res.page.total;
        this.page = res.page.page;
        this.pageSize = res.page.pageSize;
        this.summary = res.summary;


        this.counters = [
          { label: 'Total Events', count: res.summary.total, color: '#3f51b5' },
          { label: 'Auth', count: res.summary.authCount, color: '#42a5f5' },
          { label: 'Activity', count: res.summary.authActivityCount, color: '#5c6bc0' },
          { label: 'Enrollment', count: res.summary.enrollmentCount, color: '#26a69a' },
          { label: 'Care Staff', count: res.summary.careStaffCount, color: '#7e57c2' },
          { label: 'Caregiver', count: res.summary.caregiverCount, color: '#ab47bc' },
          { label: 'Program', count: res.summary.programCount, color: '#29b6f6' },
          { label: 'Notes', count: res.summary.noteCount, color: '#90a4ae' },
          { label: 'Risk', count: res.summary.riskCount, color: '#66bb6a' },
          { label: 'Alerts', count: res.summary.alertCount, color: '#ef5350' },
        ];

        this.buildRenderEvents(this.events);
        this.loading = false;

      },

      error: err => console.error('Failed to load journey', err)
    });

  }


  // Rendering helpers
  categoryColor(e: MemberJourneyEvent): string {
    const meta = CATEGORY_META[e.category];
    return meta?.color || '#90a4ae';
  }


  isRightBorder(e: MemberJourneyEvent): boolean {
    return !!CATEGORY_META[e.category]?.rightBorder || e.category === EventCategory.Risk;
  }


  fmtDate(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime())
      ? ''
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  fmtTime(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime())
      ? ''
      : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }


  get totalPages(): number {
    const ps = Math.max(1, this.pageSize || 1);
    return Math.max(1, Math.ceil((this.total || 0) / ps));
  }

  // (optional) guard to keep page in range
  onPageChange(next: number) {
    const clamped = Math.min(Math.max(1, next), this.totalPages);
    if (clamped !== this.page) {
      this.page = clamped;
      this.fetch?.();
    }
  }

  // helpers

  toggleCategory(key: number) {
    const set = new Set(this.form.value.categories || []);
    set.has(key) ? set.delete(key) : set.add(key);
    this.form.patchValue({ categories: Array.from(set) });
  }


  renderEvents: RenderEvent[] = [];

  // Helper
  private sameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  private buildRenderEvents(items: MemberJourneyEvent[]) {
    const out: RenderEvent[] = [];
    let lastDate: Date | null = null;
    let rightSide = true; // start on right, then alternate

    for (const e of items) {
      const d = new Date(e.eventUtc);
      const isNewDate = !lastDate || !this.sameDay(d, lastDate);
      if (isNewDate) {
        // reset alternation at each new date so the first card after a date label always starts right
        rightSide = true;
      }
      out.push({
        e,
        side: rightSide ? 'right' : 'left',
        isNewDate,
        dateLabel: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      });
      rightSide = !rightSide;
      lastDate = d;
    }
    this.renderEvents = out;
  }
  trackByLabel(_i: number, item: { label: string }) { return item.label; }

}
