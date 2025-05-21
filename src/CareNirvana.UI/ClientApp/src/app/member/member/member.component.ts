import { Component, Input, ViewEncapsulation } from '@angular/core';
import { RolepermissionService, CfgRole } from 'src/app/service/rolepermission.service';


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
  constructor(private roleService: RolepermissionService) { }

  ngOnInit(): void {
    this.fetchRoleData(4); // ⬅️ Hardcoded roleId = 1 for now
  }

  fetchRoleData(roleId: number) {
    this.roleService.getRoleById(roleId).subscribe((role: any) => {
      const rawPermissions = role.Permissions || role.permissions;

      this.roleConfig = typeof rawPermissions === 'string'
        ? JSON.parse(rawPermissions)
        : rawPermissions;

      sessionStorage.setItem('rolePermissionsJson', JSON.stringify(this.roleConfig.modules));
      console.log('Role Permissions:', this.roleConfig.modules); // ✅ Debugging log

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

    console.log('Main Tabs (including empty feature groups):', this.mainTabs);
  }


  setStep(step: number): void {
    this.currentStep = step;
  }

  showAuthorizationComponent = false;

  onAddClick(authNumber: string) {
    console.log('Parent Received Auth Number:', authNumber); // ✅ Debugging log
    // If authNumber is received, pass it properly
    if (authNumber) {
      this.authNumber = authNumber;  // Store it
    }

    this.showAuthorizationComponent = true;
  }

  onCancel() {
    this.showAuthorizationComponent = false;
  }

  getSafeId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-'); // Only lowercase letters and digits
  }


}
