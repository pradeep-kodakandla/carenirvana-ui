import { Component, Input, OnInit, ViewEncapsulation } from '@angular/core';
import { RolepermissionService } from 'src/app/service/rolepermission.service';

export interface CfgResourceField {
  resourceFieldId: number;
  resourceId: number;
  fieldName: string;
  allowEdit: boolean;
  allowVisible: boolean;
  activeFlag: boolean;
  createdOn?: string;
  createdBy?: number;
  updatedOn?: string;
  updatedBy?: number;
  deletedOn?: string;
  deletedBy?: number;
  access?: 'Edit' | 'View' | 'Hide'; // For dropdown binding
}

@Component({
  selector: 'app-permission-manager',
  templateUrl: './permission-manager.component.html',
  styleUrls: ['./permission-manager.component.css'],
  encapsulation: ViewEncapsulation.None,
})
export class PermissionManagerComponent implements OnInit {

  roles: string[] = ['Care Manager', 'Admin', 'Supervisor', 'Intake', 'Medical Director'];
  allModules: { moduleId: string, moduleName: string }[] = [];
  selectedRole: string = '';
  selectedModules: string[] = [];
  selectedFeatureGroups: string[] = [];
  availableFeatureGroups: string[] = [];
  filteredModules: any[] = [];
  pageExpandState: { [pageName: string]: boolean } = {};
  expandState: { [key: string]: boolean } = {};
  searchText: string = '';
  readyToRender = false;
  fieldLevelAccessFields: CfgResourceField[] = [];

  constructor(private roleService: RolepermissionService) { }

  ngOnInit(): void {
    this.roleService.getModules().subscribe(modules => {
      this.allModules = modules;
      this.allModules.forEach(mod => this.expandState[mod.moduleId] = true);
    });
    this.loadFieldLevelAccess(); // Load field level access data

  }

  @Input() set permissionData(data: any) {
    

    if (!data || typeof data !== 'object') {
      return;
    }

    // ✅ Handle full JSON { modules: [...], dashboardWidgets: { ... } }
    const modules = Array.isArray(data) ? data : data.modules;

    if (Array.isArray(modules)) {
      this.filteredModules = modules;
      
      this.selectedModules = modules.map(m => m.moduleId);
      this.selectedFeatureGroups = modules.flatMap(m => m.featureGroups.map((fg: any) => fg.featureGroupName));
      this.availableFeatureGroups = [...this.selectedFeatureGroups];
      this.readyToRender = true;

      // Expand all pages
      this.pageExpandState = {};
      this.filteredModules.forEach(m =>
        m.featureGroups.forEach((fg: any) =>
          fg.pages.forEach((p: any) => (this.pageExpandState[p.name] = true))
        )
      );
    } else {
      this.filteredModules = [];
      this.selectedModules = [];
      this.selectedFeatureGroups = [];
      this.availableFeatureGroups = [];
      this.readyToRender = false;
    }

    // ✅ Load dashboard widgets if available
    if (data.dashboardWidgets?.widgets?.length) {
      this.dashboardWidgets = data.dashboardWidgets.widgets.map((w: any) => ({
        key: w.key,
        defaultLabel: w.defaultLabel,
        customLabel: w.customLabel || '',
        enabled: w.enabled
      }));
      this.defaultWidget = data.dashboardWidgets.defaultWidget;
    }
  }



  onModulesChanged() {
    const existingGroups = new Set(this.selectedFeatureGroups);
    this.availableFeatureGroups = []; // reset available FG only

    const requests = this.selectedModules.map(modId => this.roleService.getFeatureGroups(+modId).toPromise());
    Promise.all(requests).then(results => {
      const groups = new Set<string>();
      results.forEach(res => (res ?? []).forEach(g => groups.add(g.featureGroupName)));
      this.availableFeatureGroups = Array.from(groups);
    }).catch(err => console.error('Feature group fetch error', err));
  }

  onFeatureGroupsChanged(): void {
    this.readyToRender = false;
    const preservedModules = [...this.filteredModules]; // Keep existing

    const modulePromises = this.selectedModules.map(async modId => {
      const featureGroups = await this.roleService.getFeatureGroups(+modId).toPromise();
      const validGroups = (featureGroups ?? []).filter(fg => this.selectedFeatureGroups.includes(fg.featureGroupName));

      const fgNodes = await Promise.all(validGroups.map(async fg => {
        const features = await this.roleService.getFeatures(fg.featureGroupId).toPromise();

        const pages = await Promise.all((features ?? []).map(async f => {
          const resources = await this.roleService.getResources(f.featureId).toPromise();
          return {
            name: f.featureName,
            checked: false,
            actions: ['Add', 'Edit', 'View', 'Delete', 'Download', 'Print'].map(a => ({ name: a, checked: false })),
            resources: (resources ?? []).map(r => ({
              name: r.resourceName,
              checked: false,
              actions: [
                ...(r.allowAdd ? [{ name: 'Add', checked: false }] : []),
                ...(r.allowEdit ? [{ name: 'Edit', checked: false }] : []),
                ...(r.allowView ? [{ name: 'View', checked: false }] : []),
                ...(r.allowDelete ? [{ name: 'Delete', checked: false }] : []),
                ...(r.allowPrint ? [{ name: 'Print', checked: false }] : []),
                ...(r.allowDownload ? [{ name: 'Download', checked: false }] : [])
              ]
            }))
          };
        }));

        return {
          featureGroupName: fg.featureGroupName,
          pages
        };
      }));

      return {
        moduleId: modId,
        moduleName: this.getModuleName(modId),
        featureGroups: fgNodes
      };
    });

    Promise.all(modulePromises).then(newModules => {
      // Merge newModules into preservedModules
      for (const newMod of newModules) {
        let existingMod = preservedModules.find(m => m.moduleId === newMod.moduleId);
        if (!existingMod) {
          preservedModules.push(newMod); // entirely new module
          continue;
        }

        for (const newFg of newMod.featureGroups) {
          const existingFg = existingMod.featureGroups.find((fg: any) => fg.featureGroupName === newFg.featureGroupName);
          if (!existingFg) {
            existingMod.featureGroups.push(newFg); // new group in existing module
          }
          // else: do not overwrite existing FG → keep previously selected actions
        }
      }

      // Remove modules and feature groups that are no longer selected
      const filtered = preservedModules
        .filter(m => this.selectedModules.includes(m.moduleId))
        .map(m => ({
          ...m,
          featureGroups: m.featureGroups.filter((fg: any) =>
            this.selectedFeatureGroups.includes(fg.featureGroupName)
          )
        }));

      this.filteredModules = filtered;

      // Reset page expand state
      this.pageExpandState = {};
      this.filteredModules.forEach(m =>
        m.featureGroups.forEach((fg: any) =>
          fg.pages.forEach((p: any) => this.pageExpandState[p.name] = true)
        )
      );

      this.readyToRender = true;
    });
  }


  getModuleName(moduleId: string): string {
    const mod = this.allModules.find(m => m.moduleId === moduleId);
    return mod ? mod.moduleName : moduleId;
  }

  filterPage(name: string): boolean {
    return this.searchText.trim() === '' || name.toLowerCase().includes(this.searchText.toLowerCase());
  }

  togglePageExpand(pageName: string): void {
    this.pageExpandState[pageName] = !this.pageExpandState[pageName];
  }

  getResourceAction(resource: any, action: string) {
    return resource.actions.find((a: any) => a.name.toLowerCase() === action.toLowerCase());
  }

  getAction(page: any, action: string) {
    return page.actions.find((a: any) => a.name.toLowerCase() === action.toLowerCase());
  }

  isPageActionSelected(action: string, page: any): boolean {
    const actions = [this.getAction(page, action), ...page.resources.map((r: any) => this.getResourceAction(r, action))].filter(Boolean);
    return actions.length > 0 && actions.every((a: any) => a.checked);
  }

  isPageActionPartiallySelected(action: string, page: any): boolean {
    const actions = [this.getAction(page, action), ...page.resources.map((r: any) => this.getResourceAction(r, action))].filter(Boolean);
    return actions.some((a: any) => a.checked) && !actions.every((a: any) => a.checked);
  }

  onPageCheckboxChanged(e: Event, page: any, action: string): void {
    const checked = (e.target as HTMLInputElement).checked;
    const pageAction = this.getAction(page, action);
    if (pageAction) pageAction.checked = checked;
    page.resources.forEach((r: any) => {
      const resAction = this.getResourceAction(r, action);
      if (resAction) resAction.checked = checked;
    });
  }

  onResourceCheckboxChanged(e: Event, resAction: any): void {
    resAction.checked = (e.target as HTMLInputElement).checked;
  }

  isAllSelectedGlobal(action: string): boolean {
    const all = this.collectAllActions(action);
    return all.length > 0 && all.every((a: any) => a.checked);
  }

  isSomeSelectedGlobal(action: string): boolean {
    const all = this.collectAllActions(action);
    return all.some((a: any) => a.checked) && !all.every((a: any) => a.checked);
  }

  toggleAllGlobal(action: string, e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    this.filteredModules.forEach(mod => {
      mod.featureGroups.forEach((fg: any) => {
        fg.pages.forEach((p: any) => {
          const pa = this.getAction(p, action);
          if (pa) pa.checked = checked;
          p.resources.forEach((r: any) => {
            const ra = this.getResourceAction(r, action);
            if (ra) ra.checked = checked;
          });
        });
      });
    });
  }

  collectAllActions(action: string): any[] {
    const actions: any[] = [];
    this.filteredModules.forEach(mod => {
      mod.featureGroups.forEach((fg: any) => {
        fg.pages.forEach((p: any) => {
          const pa = this.getAction(p, action);
          if (pa) actions.push(pa);
          p.resources.forEach((r: any) => {
            const ra = this.getResourceAction(r, action);
            if (ra) actions.push(ra);
          });
        });
      });
    });
    return actions;
  }


  /*********Resource Field Logic***********/

  selectedFieldAccessHeader: 'Edit' | 'View' | 'Hide' = 'Edit';

  loadFieldLevelAccess(): void {
    const resourceId = 1;
    this.roleService.getResourceFieldsByResourceId(resourceId).subscribe(data => {
      // Attach a default 'access' property for UI binding
      this.fieldLevelAccessFields = data.map(f => ({
        ...f,
        access: f.allowEdit ? 'Edit' : f.allowVisible ? 'View' : 'Hide'
      }));
      
    });
  }

  setAllFieldAccess(accessType: 'Edit' | 'View' | 'Hide') {
    for (const field of this.fieldLevelAccessFields) {
      field.access = accessType;
    }
    this.selectedFieldAccessHeader = accessType;
  }
  /*********Resource Field Logic***********/

  /*********Dash Board Logic***********/
  dashboardWidgets = [
    { key: 'myCaseLoad', defaultLabel: 'My Case Load', customLabel: 'My Case Load', enabled: true },
    { key: 'assignedAuthorizations', defaultLabel: 'Assigned Authorizations', customLabel: 'Assigned Authorizations', enabled: true },
    { key: 'requests', defaultLabel: 'Requests', customLabel: 'Requests', enabled: true },
    { key: 'myActivities', defaultLabel: 'My Activities', customLabel: 'My Activities', enabled: true },
    { key: 'assignedComplaints', defaultLabel: 'Assigned Complaints', customLabel: 'Assigned Complaints', enabled: true },
    { key: 'faxes', defaultLabel: 'Faxes', customLabel: 'Faxes', enabled: true },
    { key: 'mdreview', defaultLabel: 'MD Review', customLabel: 'MD Review', enabled: true },
  ];

  defaultWidget: string = 'myCaseLoad';

  getFinalPermissionJson(): any {
    return {
      modules: this.filteredModules,
      dashboardWidgets: {
        widgets: this.dashboardWidgets.map(w => ({
          key: w.key,
          defaultLabel: w.defaultLabel,
          customLabel: w.customLabel,
          enabled: w.enabled
        })),
        defaultWidget: this.defaultWidget
      }
    };
  }

  hasAnyWidgetSelected(): boolean {
    return this.dashboardWidgets?.some(widget => widget.enabled);
  }

  /*********Dash Board Logic***********/
}
