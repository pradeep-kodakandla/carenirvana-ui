import { Component, Input, ViewEncapsulation } from '@angular/core';
import { RolepermissionService, CfgRole } from 'src/app/service/rolepermission.service';
import { ActivatedRoute, Router } from '@angular/router';
import { MemberService } from 'src/app/service/shared-member.service';

interface DashboardWidget {
  key: string;
  defaultLabel: string;
  customLabel: string;
  enabled: boolean;
}
interface PermissionConfig {
  modules?: any[];
  dashboardWidgets?: {
    widgets: DashboardWidget[];
    defaultWidget: string;
  };
}

@Component({
  selector: 'app-member',
  templateUrl: './member.component.html',
  styleUrl: './member.component.css',
  encapsulation: ViewEncapsulation.None,
})
export class MemberComponent {
  /*@Input() memberId: string | undefined;*/
  @Input() memberId!: number;
  authNumber: string = '';
  currentStep = 1;
  roleConfig: PermissionConfig = {};
  mainTabs: any[] = [];
  showAuthorizationComponent = false;
  constructor(private roleService: RolepermissionService, private route: ActivatedRoute, private router: Router, private shared: MemberService) { }

  ngOnInit(): void {
    this.fetchRoleData(4); // ⬅️ Hardcoded roleId = 1 for now
    this.route.parent?.paramMap.subscribe(params => {
      console.log('Route Params:', params); // ✅ Debugging log
      this.memberId = Number(params.get('id')!);
      console.log('Loaded Member ID:', this.memberId);
    });

    this.shared.showAuthorization$.subscribe(v => this.showAuthorizationComponent = v);

    // Ensure reset when we land on the tabs route
    this.router.events.subscribe(() => {
      const child = this.route.firstChild;
      const isAuthPage = child?.snapshot?.url?.[0]?.path === 'member-auth';
      // render list on default child, not on auth
      this.shared.setShowAuthorization(!!isAuthPage);
    });
  }

  fetchRoleData(roleId: number) {
    this.roleService.getRoleById(roleId).subscribe((role: any) => {
      const rawPermissions = role.Permissions || role.permissions;

      this.roleConfig = typeof rawPermissions === 'string'
        ? JSON.parse(rawPermissions)
        : rawPermissions;

      sessionStorage.setItem('rolePermissionsJson', JSON.stringify(this.roleConfig.modules));

      // console.log('Role Config:', this.roleConfig); // ✅ Debugging log
      this.buildTabsFromRoleConfig();
    });
  }


  buildTabsFromRoleConfig(): void {
    this.mainTabs = [];

    this.roleConfig.modules?.forEach((module: any) => {
      (module.featureGroups || []).forEach((group: any) => {
        this.mainTabs.push({
          name: group.featureGroupName,
          pages: group.pages || []
        });
      });
    });
  }


  setStep(step: number): void {
    this.currentStep = step;
  }



  onAddClick(authNumber: string) {
    console.log('Parent Received Auth Number:', authNumber); // ✅ Debugging log
    // If authNumber is received, pass it properly
    if (authNumber) {
      this.authNumber = authNumber;  // Store it
    }
    this.shared.setShowAuthorization(true);
    this.showAuthorizationComponent = false;
  }

  onCancel() {
    this.shared.setShowAuthorization(false);
    this.showAuthorizationComponent = false;
  }

  //getSafeId(name: string): string {
  //  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-'); // Only lowercase letters and digits
  //}

  getSafeId(name: string): string {
    return name.replace(/\s+/g, '-').toLowerCase();
  }


}
