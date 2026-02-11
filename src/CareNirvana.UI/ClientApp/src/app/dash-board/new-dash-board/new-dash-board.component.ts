import { Component, OnInit, ViewEncapsulation } from '@angular/core';

// Interfaces for type safety
interface StatCard {
  label: string;
  value: number | string;
  type: 'teal' | 'blue' | 'purple' | 'orange' | 'red';
  icon: string;
  alertCount?: number;
  alertText?: string;
  actions: CardAction[];
  breakdowns?: CardBreakdown[];  // Added for utilization cards
}

interface CardBreakdown {
  label: string;
  value: number;
}

interface CardAction {
  label: string;
  type: 'primary' | 'secondary';
}

interface Metric {
  value: number | string;
  label: string;
  icon: string;
  iconColor: string;
  change: {
    value: string;
    type: 'positive' | 'negative' | 'neutral';
  };
}

interface RiskLevel {
  level: 'critical' | 'high' | 'medium' | 'low';
  label: string;
  count: number;
  color: string;
}

interface Program {
  name: string;
  current: number;
  total: number;
  percentage: number;
}

interface RecommendedAction {
  number: number;
  title: string;
  subtitle: string;
}

interface NavTab {
  label: string;
  icon: string;
  active: boolean;
}

@Component({
  selector: 'app-new-dash-board',
  templateUrl: './new-dash-board.component.html',
  styleUrls: ['./new-dash-board.component.css'],
  encapsulation: ViewEncapsulation.None  // Required for dynamic loading
})
export class NewDashBoardComponent implements OnInit {
  // View state
  selectedDiv: number | null = 1;
  selectedView: string = 'utilization-management';  // Changed default
  dateFilter: string = 'Today';
  showDateDropdown: boolean = false;

  // Navigation tabs
  navTabs: NavTab[] = [
    { label: 'Utilization Management', icon: 'dashboard', active: true },
    { label: 'Care Management', icon: 'favorite', active: false },
    { label: 'Appeals & Grievances', icon: 'info', active: false }
  ];

  // Utilization Management Cards
  utilizationCards: StatCard[] = [
    {
      label: 'My Pending',
      value: 47,
      type: 'blue',
      icon: 'schedule',
      alertCount: 8,
      alertText: 'urgent',
      actions: [],
      breakdowns: [
        { label: 'Inpatient', value: 12 },
        { label: 'Outpatient', value: 35 }
      ]
    },
    {
      label: 'Due Today',
      value: 12,
      type: 'orange',
      icon: 'event_available',
      alertCount: 3,
      alertText: 'urgent',
      actions: [],
      breakdowns: [
        { label: 'AM', value: 5 },
        { label: 'PM', value: 7 }
      ]
    },
    {
      label: 'Overdue',
      value: 5,
      type: 'red',
      icon: 'error_outline',
      alertCount: 5,
      alertText: 'urgent',
      actions: [],
      breakdowns: [
        { label: '1-2 days', value: 3 },
        { label: '3+ days', value: 2 }
      ]
    },
    {
      label: 'Activities',
      value: 28,
      type: 'purple',
      icon: 'show_chart',
      alertCount: 4,
      alertText: 'urgent',
      actions: [],
      breakdowns: [
        { label: 'Calls', value: 15 },
        { label: 'Reviews', value: 13 }
      ]
    },
    {
      label: 'Assigned Today',
      value: 18,
      type: 'teal',
      icon: 'assignment',
      actions: [],
      breakdowns: [
        { label: 'New', value: 12 },
        { label: 'Reassign', value: 6 }
      ]
    }
  ];

  // Care Management Cards (original)
  careManagementCards: StatCard[] = [
    {
      label: 'Active Cases',
      value: 234,
      type: 'teal',
      icon: 'favorite',
      alertCount: 12,
      alertText: 'require immediate attention',
      actions: [
        { label: 'View All', type: 'secondary' },
        { label: 'High Risk', type: 'primary' }
      ]
    },
    {
      label: 'Outreach Due',
      value: 28,
      type: 'blue',
      icon: 'phone',
      alertCount: 8,
      alertText: 'require immediate attention',
      actions: [
        { label: 'Start Calls', type: 'primary' }
      ]
    },
    {
      label: 'Care Plans Due',
      value: 15,
      type: 'purple',
      icon: 'assignment_turned_in',
      alertCount: 4,
      alertText: 'require immediate attention',
      actions: [
        { label: 'Review', type: 'primary' }
      ]
    },
    {
      label: 'Transitions Today',
      value: 7,
      type: 'orange',
      icon: 'cloud_download',
      alertCount: 2,
      alertText: 'require immediate attention',
      actions: [
        { label: 'Manage', type: 'primary' }
      ]
    }
  ];

  // Active cards (switches based on view)
  statCards: StatCard[] = this.utilizationCards;

  // Utilization Management Metrics
  utilizationMetrics: Metric[] = [
    {
      value: '2,847',
      label: 'Total Auths',
      icon: 'description',
      iconColor: 'blue',
      change: { value: '↑ 12%', type: 'positive' }
    },
    {
      value: '87.3%',
      label: 'Goal: 85% Approval Rate',
      icon: 'check_circle',
      iconColor: 'green',
      change: { value: '↑ 2.1%', type: 'positive' }
    },
    {
      value: '2.4h',
      label: 'SLA: 4h Avg TAT',
      icon: 'schedule',
      iconColor: 'purple',
      change: { value: '↑ 18%', type: 'positive' }
    },
    {
      value: '156',
      label: 'Pending Review',
      icon: 'rate_review',
      iconColor: 'orange',
      change: { value: '↑ 8%', type: 'positive' }
    },
    {
      value: '34',
      label: 'In Draft',
      icon: 'edit',
      iconColor: 'blue',
      change: { value: '↑ 5%', type: 'positive' }
    },
    {
      value: '23',
      label: 'No Due Date',
      icon: 'event_busy',
      iconColor: 'red',
      change: { value: '↑ 12%', type: 'positive' }
    },
    {
      value: '89',
      label: '± 15 today External Subs',
      icon: 'people_outline',
      iconColor: 'teal',
      change: { value: '↑ 15%', type: 'positive' }
    },
    {
      value: '3.2',
      label: 'Per Enrollment',
      icon: 'person',
      iconColor: 'green',
      change: { value: '↑ 8%', type: 'positive' }
    },
    {
      value: '67',
      label: 'Closed Today',
      icon: 'done_all',
      iconColor: 'green',
      change: { value: '↑ 22%', type: 'positive' }
    },
    {
      value: '134',
      label: 'Worked On',
      icon: 'work',
      iconColor: 'blue',
      change: { value: '↑ 18%', type: 'positive' }
    },
    {
      value: '45',
      label: '16% rate Auto-Approved',
      icon: 'flash_on',
      iconColor: 'purple',
      change: { value: '↑ 30%', type: 'positive' }
    },
    {
      value: '28',
      label: 'Peer Review Q',
      icon: 'supervisor_account',
      iconColor: 'orange',
      change: { value: '↑ 5%', type: 'positive' }
    },
    {
      value: '12',
      label: 'MD Review Q',
      icon: 'local_hospital',
      iconColor: 'red',
      change: { value: '↑ 10%', type: 'positive' }
    },
    {
      value: '34',
      label: 'Info Requested',
      icon: 'info',
      iconColor: 'blue',
      change: { value: '↑ 15%', type: 'positive' }
    },
    {
      value: '23',
      label: '8.1% Denied',
      icon: 'block',
      iconColor: 'red',
      change: { value: '↑ 3%', type: 'neutral' }
    },
    {
      value: '8',
      label: 'Urgent Queue',
      icon: 'priority_high',
      iconColor: 'red',
      change: { value: '↑ 2%', type: 'positive' }
    }
  ];

  // Care Management Metrics (original)
  careManagementMetrics: Metric[] = [
    {
      value: '1,456',
      label: 'Total Members',
      icon: 'people',
      iconColor: 'teal',
      change: { value: '↑ 5%', type: 'positive' }
    },
    {
      value: '89',
      label: 'High Risk Members',
      icon: 'warning',
      iconColor: 'red',
      change: { value: '↑ 8%', type: 'positive' }
    },
    {
      value: '78%',
      label: 'Engagement Rate',
      icon: 'trending_up',
      iconColor: 'green',
      change: { value: '↑ 12%', type: 'positive' }
    },
    {
      value: '234',
      label: 'Care Gap Closures',
      icon: 'check_circle',
      iconColor: 'blue',
      change: { value: '↑ 18%', type: 'positive' }
    },
    {
      value: '45',
      label: 'Avg Days in Program',
      icon: 'event',
      iconColor: 'purple',
      change: { value: '↑ 3%', type: 'neutral' }
    },
    {
      value: '8.2%',
      label: 'Readmission Rate',
      icon: 'sync',
      iconColor: 'teal',
      change: { value: '↑ 15%', type: 'positive' }
    },
    {
      value: '42',
      label: 'Assessments Due',
      icon: 'assignment',
      iconColor: 'orange',
      change: { value: '↑ 10%', type: 'positive' }
    },
    {
      value: '156',
      label: 'Goals Met This Week',
      icon: 'emoji_events',
      iconColor: 'green',
      change: { value: '↑ 22%', type: 'positive' }
    },
    {
      value: '23',
      label: 'Pending Referrals',
      icon: 'person_add',
      iconColor: 'blue',
      change: { value: '↑ 5%', type: 'neutral' }
    },
    {
      value: '89',
      label: 'Member Contacts',
      icon: 'phone_in_talk',
      iconColor: 'purple',
      change: { value: '↑ 15%', type: 'positive' }
    },
    {
      value: '18',
      label: 'Documentation Due',
      icon: 'description',
      iconColor: 'red',
      change: { value: '↑ 20%', type: 'positive' }
    },
    {
      value: '82%',
      label: 'Team Capacity',
      icon: 'groups',
      iconColor: 'teal',
      change: { value: '↑ 5%', type: 'neutral' }
    }
  ];

  // Active metrics (switches based on view)
  metrics: Metric[] = this.utilizationMetrics;

  // Risk stratification
  riskLevels: RiskLevel[] = [
    { level: 'critical', label: 'Critical Risk', count: 23, color: '#ef4444' },
    { level: 'high', label: 'High Risk', count: 66, color: '#f97316' },
    { level: 'medium', label: 'Medium Risk', count: 189, color: '#fb923c' },
    { level: 'low', label: 'Low Risk', count: 956, color: '#10b981' }
  ];

  // Program enrollment
  programs: Program[] = [
    { name: 'CHF Management', current: 145, total: 200, percentage: 72.5 },
    { name: 'Diabetes Care', current: 189, total: 250, percentage: 75.6 },
    { name: 'COPD Support', current: 78, total: 100, percentage: 78 },
    { name: 'Behavioral Health', current: 56, total: 80, percentage: 70 }
  ];

  // Recommended actions
  recommendedActions: RecommendedAction[] = [
    {
      number: 1,
      title: 'Call 3 high-risk members',
      subtitle: 'No contact in 14+ days'
    },
    {
      number: 2,
      title: 'Complete care plan reviews',
      subtitle: '4 expire this week'
    },
    {
      number: 3,
      title: 'Process transition referrals',
      subtitle: '5 pending >48 hours'
    }
  ];

  // Date filter options
  dateFilterOptions: string[] = [
    'Today',
    'This Week',
    'This Month',
    'This Quarter',
    'Custom Range'
  ];

  constructor() { }

  ngOnInit(): void {
    // Initialize component
    this.loadDashboardData();
  }

  // Load dashboard data (replace with API call)
  loadDashboardData(): void {
    // This would typically call a service to fetch data
    console.log('Dashboard data loaded');
  }

  // Select card/div
  selectDiv(index: number): void {
    this.selectedDiv = index;
    // Handle card selection logic
    console.log('Selected card:', index);
  }

  // Select navigation tab
  selectTab(tab: NavTab): void {
    this.navTabs.forEach(t => t.active = false);
    tab.active = true;
    this.selectedView = tab.label.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-');

    // Switch data based on view
    if (this.selectedView === 'utilization-management') {
      this.statCards = this.utilizationCards;
      this.metrics = this.utilizationMetrics;
    } else if (this.selectedView === 'care-management') {
      this.statCards = this.careManagementCards;
      this.metrics = this.careManagementMetrics;
    }

    console.log('Switched to view:', this.selectedView);
  }

  // Handle card action
  onCardAction(card: StatCard, action: CardAction): void {
    console.log('Card action:', card.label, action.label);
    // Implement navigation or action logic here
  }

  // Handle action button click
  onActionClick(action: RecommendedAction): void {
    console.log('Action clicked:', action.title);
    // Implement action logic here
  }

  // Toggle date filter dropdown
  toggleDateDropdown(): void {
    this.showDateDropdown = !this.showDateDropdown;
  }

  // Select date filter
  selectDateFilter(filter: string): void {
    this.dateFilter = filter;
    this.showDateDropdown = false;
  }

  // Get card color class
  getCardColorClass(type: string): string {
    return `card-${type}`;
  }

  // Get metric icon color class
  getMetricIconClass(color: string): string {
    return `metric-icon-${color}`;
  }

  // Format number with commas
  formatNumber(num: number): string {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // Calculate percentage
  calculatePercentage(current: number, total: number): number {
    return Math.round((current / total) * 100);
  }
}
