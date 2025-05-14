import { Component, Input, OnInit, ViewEncapsulation } from '@angular/core';
import { RolepermissionService } from 'src/app/service/rolepermission.service';

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

  constructor(private roleService: RolepermissionService) { }

  ngOnInit(): void {
    this.roleService.getModules().subscribe(modules => {
      this.allModules = modules;
      this.allModules.forEach(mod => this.expandState[mod.moduleId] = true);
    });
  }

  @Input() set permissionData(data: any) {
    if (Array.isArray(data)) {
      this.filteredModules = data;

      this.selectedModules = data.map(m => m.moduleId);
      this.selectedFeatureGroups = data.flatMap(m => m.featureGroups.map((fg: any) => fg.featureGroupName));
      this.availableFeatureGroups = [...this.selectedFeatureGroups]; // ✅ set available FG too

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

  savePermissions() {
    console.log('Permissions JSON:', JSON.stringify(this.filteredModules, null, 2));
    alert('Permissions saved!');
  }
}
