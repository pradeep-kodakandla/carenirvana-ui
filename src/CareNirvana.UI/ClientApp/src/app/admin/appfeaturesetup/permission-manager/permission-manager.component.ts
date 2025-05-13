import { Component } from '@angular/core';
import { RolepermissionService } from 'src/app/service/rolepermission.service';
interface ActionNode {
  name: string;
  checked: boolean;
}


interface ResourceNode {
  name: string;
  checked: boolean;
  actions: ActionNode[];
}

interface PageNode {
  name: string;
  checked: boolean;
  resources: ResourceNode[];
  actions: ActionNode[];
  fields?: FieldNode[]; // New field-level access array
}


interface FeatureGroupNode {
  featureGroupName: string;
  pages: PageNode[];
}

interface ModuleNode {
  moduleId: string;
  moduleName: string;
  featureGroups: FeatureGroupNode[];
}

interface RolePermission {
  roleId: string;
  modules: ModuleNode[];
}

interface FieldNode {
  fieldName: string;
  access: 'Editable' | 'Read-only' | 'Hidden';
}


@Component({
  selector: 'app-permission-manager',
  templateUrl: './permission-manager.component.html',
  styleUrls: ['./permission-manager.component.css']
})
export class PermissionManagerComponent {


  roles = ['Care Manager', 'Admin', 'Supervisor', 'Intake', 'Medical Director'];

  allModules: { moduleId: string, moduleName: string }[] = [];

  ngOnInit(): void {
    this.roleService.getModules().subscribe(modules => {
      this.allModules = modules;
      console.log('Modules:', this.allModules);
    });

  }


  selectedRole: string = '';
  selectedModules: string[] = [];
  readyToRender: boolean = false;
  searchText: string = '';
  filteredModules: ModuleNode[] = [];
  pageExpandState: { [pageName: string]: boolean } = {};
  expandState: { [key: string]: boolean } = {}; // moduleId -> expanded
  selectedFeatureGroups: string[] = [];

  rolePermission: RolePermission = {
    roleId: '',
    modules: [
      {
        moduleId: 'UM',
        moduleName: 'Utilization Management',
        featureGroups: [
          {
            featureGroupName: 'Authorization',
            pages: [
              {
                name: 'Request Details',
                checked: false,
                actions: [
                  { name: 'View', checked: false },
                  { name: 'Edit', checked: false },
                  { name: 'Delete', checked: false }
                ],
                resources: [
                  {
                    name: 'Diagnosis Details',
                    checked: false,
                    actions: [
                      { name: 'View', checked: false },
                      { name: 'Edit', checked: false }
                    ]
                  },
                  {
                    name: 'Service Details',
                    checked: false,
                    actions: [
                      { name: 'View', checked: false },
                      { name: 'Edit', checked: false }
                    ]
                  }
                ]
              },
              {
                name: 'Notes',
                checked: false,
                actions: [
                  { name: 'View', checked: false },
                  { name: 'Add', checked: false },
                  { name: 'Delete', checked: false }
                ],
                resources: []
              },
              {
                name: 'Documents',
                checked: false,
                actions: [
                  { name: 'View', checked: false },
                  { name: 'Upload', checked: false },
                  { name: 'Download', checked: false }
                ],
                resources: []
              }
            ]
          }
        ]
      },
      {
        moduleId: 'CM',
        moduleName: 'Care Management',
        featureGroups: [
          {
            featureGroupName: 'Member Summary',
            pages: [
              {
                name: 'Member Info',
                checked: false,
                actions: [
                  { name: 'View', checked: false },
                  { name: 'Update', checked: false }
                ],
                resources: [],
                fields: [
                  { fieldName: 'First Name', access: 'Editable' },
                  { fieldName: 'Last Name', access: 'Read-only' },
                  { fieldName: 'Phone', access: 'Hidden' }
                ]
              },
              {
                name: 'Program',
                checked: false,
                actions: [
                  { name: 'View', checked: false },
                  { name: 'Edit', checked: false }
                ],
                resources: []
              },
              {
                name: 'Care Team',
                checked: false,
                actions: [
                  { name: 'View', checked: false },
                  { name: 'Assign', checked: false },
                  { name: 'Remove', checked: false }
                ],
                resources: [],
                fields: [
                  { fieldName: 'Care Team Fields1', access: 'Editable' },
                  { fieldName: 'Care Team Fields2', access: 'Read-only' },
                  { fieldName: 'Care Team Fields3', access: 'Hidden' }
                ]
              }
            ]
          },
          {
            featureGroupName: 'Engagement',
            pages: [
              {
                name: 'Tasks',
                checked: false,
                actions: [
                  { name: 'View', checked: false },
                  { name: 'Add', checked: false },
                  { name: 'Complete', checked: false }
                ],
                resources: []
              }
            ]
          },
          {
            featureGroupName: 'Medical History',
            pages: [
              {
                name: 'Alerts',
                checked: false,
                actions: [
                  { name: 'View', checked: false },
                  { name: 'Dismiss', checked: false }
                ],
                resources: []
              }
            ]
          }
        ]
      },
      {
        moduleId: 'AG',
        moduleName: 'Grievance',
        featureGroups: [
          {
            featureGroupName: 'Complaints',
            pages: [
              {
                name: 'Complaint Details',
                checked: false,
                actions: [
                  { name: 'View', checked: false },
                  { name: 'Resolve', checked: false }
                ],
                resources: []
              },
              {
                name: 'Communication Log',
                checked: false,
                actions: [
                  { name: 'View', checked: false },
                  { name: 'Add Note', checked: false }
                ],
                resources: []
              }
            ]
          }
        ]
      }
    ]
  };



  constructor(private roleService: RolepermissionService) {
    this.rolePermission.modules.forEach(mod => {
      this.expandState[mod.moduleId] = true;
    });
  }

  //get currentModules(): ModuleNode[] {
  //  return this.rolePermission.modules.filter(m => this.selectedModules.includes(m.moduleId));
  //}

  toggleExpand(moduleId: string) {
    this.expandState[moduleId] = !this.expandState[moduleId];
  }

  togglePage(page: PageNode, value?: boolean) {
    page.checked = value !== undefined ? value : !page.checked;
    page.actions.forEach(action => action.checked = page.checked);
    page.resources.forEach(resource => this.toggleResource(resource, page.checked));
  }

  toggleResource(resource: ResourceNode, value?: boolean) {
    resource.checked = value !== undefined ? value : !resource.checked;
    resource.actions.forEach(action => action.checked = resource.checked);
  }

  toggleAction(action: ActionNode) {
    action.checked = !action.checked;
  }

  expandAll(moduleId: string) {
    this.expandState[moduleId] = true;
  }

  collapseAll(moduleId: string) {
    this.expandState[moduleId] = false;
  }

  filterPage(pageName: string): boolean {
    return this.searchText.trim() === '' || pageName.toLowerCase().includes(this.searchText.toLowerCase());
  }

  filterResource(resourceName: string): boolean {
    return this.searchText.trim() === '' || resourceName.toLowerCase().includes(this.searchText.toLowerCase());
  }

  savePermissions() {
    console.log('Permissions JSON:', JSON.stringify(this.rolePermission, null, 2));
    alert('Permissions JSON saved! Check console.');
  }

  onModuleCheck(event: any) {
    const moduleId = event.target.value;
    if (event.target.checked) {
      if (!this.selectedModules.includes(moduleId)) {
        this.selectedModules.push(moduleId);
      }
    } else {
      this.selectedModules = this.selectedModules.filter(m => m !== moduleId);
    }
  }

  getModuleName(moduleId: string): string {
    const mod = this.allModules.find(m => m.moduleId === moduleId);
    return mod ? mod.moduleName : moduleId;
  }
  getSelectedModulesLabel(): string {
    if (!this.selectedModules || this.selectedModules.length === 0) {
      return 'Select Modules';
    }
    const selectedNames = this.selectedModules
      .map(moduleId => {
        const mod = this.allModules.find(m => m.moduleId === moduleId);
        return mod ? mod.moduleName : moduleId;
      })
      .filter(name => !!name); // skip undefined names

    return selectedNames.join(', ');
  }

  selectedFeatureGroup: string = '';
  featureGroupsMapping: { [moduleId: string]: string[] } = {
    'UM': ['Authorization'],
    'CM': ['Medical History', 'Engagement', 'Member Summary'],
    'AG': ['Complaints']
  };

  availableFeatureGroups: string[] = [];


  onModulesChanged() {
    this.availableFeatureGroups = [];
    this.selectedFeatureGroups = [];

    const allRequests = this.selectedModules.map(modId =>
      this.roleService.getFeatureGroups(+modId)
    );

    Promise.all(allRequests.map(obs => obs.toPromise()))
      .then(results => {
        const uniqueGroups = new Set<string>();
        results.forEach(groups => {
          (groups ?? []).forEach(group => uniqueGroups.add(group.featureGroupName));
        });
        this.availableFeatureGroups = Array.from(uniqueGroups);
      })

      .catch(error => {
        console.error('Error loading feature groups:', error);
      });
  }



  onFeatureGroupChanged(event: any) {
    this.selectedFeatureGroup = event.value;
    this.readyToRender = false;

    this.filteredModules = [];

    if (!this.selectedModules || this.selectedModules.length === 0) return;

    this.filteredModules = this.rolePermission.modules
      .filter(m => this.selectedModules.includes(m.moduleId))
      .map(mod => {
        if (!this.selectedFeatureGroup || this.selectedFeatureGroup.trim() === '') {
          return mod;
        }

        const matchingFeatureGroups = mod.featureGroups.filter(fg => fg.featureGroupName === this.selectedFeatureGroup);

        if (matchingFeatureGroups.length === 0) {
          return null as any;
        }

        return {
          ...mod,
          featureGroups: matchingFeatureGroups
        };
      })
      .filter(mod => mod !== null);

    this.pageExpandState = {};
    this.filteredModules.forEach(mod => {
      mod.featureGroups.forEach(fg => {
        fg.pages.forEach(page => {
          this.pageExpandState[page.name] = false;
        });
      });
    });


    this.readyToRender = true;
  }


  getAction(page: PageNode, actionName: string): ActionNode | undefined {
    return page.actions.find(a => a.name.toLowerCase() === actionName.toLowerCase());
  }

  toggleAllPagesAction(actionName: string, event: any) {
    const checked = event.target.checked;

    this.filteredModules.forEach(module => {
      module.featureGroups.forEach(featureGroup => {
        featureGroup.pages.forEach(page => {
          const action = this.getAction(page, actionName);
          if (action) {
            action.checked = checked;
          }
        });
      });
    });
  }

  // For page level full selection
  isPageFullySelected(page: PageNode): boolean {
    if (!page.actions.length) return false;
    return page.actions.every(a => a.checked);
  }

  isPagePartiallySelected(page: PageNode): boolean {
    if (!page.actions.length) return false;
    return page.actions.some(a => a.checked) && !this.isPageFullySelected(page);
  }

  togglePageSelection(page: PageNode, event: any): void {
    const checked = event.target.checked;
    page.actions.forEach(action => action.checked = checked);
  }

  // For column (action) header level
  //isAllSelected(actionName: string, featureGroup: FeatureGroupNode): boolean {
  //  const allPages = featureGroup.pages.filter(p => this.getAction(p, actionName));
  //  return allPages.length > 0 && allPages.every(p => this.getAction(p, actionName)?.checked);
  //}

  //isSomeSelected(actionName: string, featureGroup: FeatureGroupNode): boolean {
  //  const pages = featureGroup.pages.filter(p => this.getAction(p, actionName));
  //  return pages.some(p => this.getAction(p, actionName)?.checked) && !this.isAllSelected(actionName, featureGroup);
  //}

  toggleAll(actionName: string, featureGroup: FeatureGroupNode, event: any): void {
    const checked = event.target.checked;
    featureGroup.pages.forEach(page => {
      const pageAction = this.getAction(page, actionName);
      if (pageAction) {
        pageAction.checked = checked;
      }
      page.resources?.forEach(res => {
        const resAction = res.actions.find(a => a.name.toLowerCase() === actionName.toLowerCase());
        if (resAction) {
          resAction.checked = checked;
        }
      });
    });
  }


  // For page-name header level (all page's all actions)
  isAllPagesSelected(featureGroup: FeatureGroupNode): boolean {
    const allPages = featureGroup.pages;
    return allPages.length > 0 && allPages.every(page => this.isPageFullySelected(page));
  }

  isSomePagesSelected(featureGroup: FeatureGroupNode): boolean {
    const allPages = featureGroup.pages;
    return allPages.some(page => this.isPageFullySelected(page)) && !this.isAllPagesSelected(featureGroup);
  }

  toggleAllPagesForGroup(featureGroup: FeatureGroupNode, event: any): void {
    const checked = event.target.checked;
    featureGroup.pages.forEach(page => {
      page.actions.forEach(action => action.checked = checked);
    });
  }

  onActionChange(page: PageNode, actionName: string, checked: boolean) {
    const action = this.getAction(page, actionName);
    if (action) {
      action.checked = checked;
    }

    page.resources?.forEach(res => {
      const resAction = res.actions.find(a => a.name.toLowerCase() === actionName.toLowerCase());
      if (resAction) {
        resAction.checked = checked;
      }
    });
  }


  togglePageExpand(pageName: string): void {
    this.pageExpandState[pageName] = !this.pageExpandState[pageName];
  }

  // At Page level
  isPageActionSelected(actionName: string, page: PageNode): boolean {
    const allActions: ActionNode[] = [];

    const pageAction = this.getAction(page, actionName);
    if (pageAction) allActions.push(pageAction);

    page.resources.forEach(res => {
      const resAction = this.getResourceAction(res, actionName);
      if (resAction) allActions.push(resAction);
    });

    return allActions.length > 0 && allActions.every(a => a.checked);
  }

  isPageActionPartiallySelected(actionName: string, page: PageNode): boolean {
    const allActions: ActionNode[] = [];

    const pageAction = this.getAction(page, actionName);
    if (pageAction) allActions.push(pageAction);

    page.resources.forEach(res => {
      const resAction = this.getResourceAction(res, actionName);
      if (resAction) allActions.push(resAction);
    });

    const anyChecked = allActions.some(a => a.checked);
    const allChecked = allActions.every(a => a.checked);

    return anyChecked && !allChecked;
  }


  // At Feature Group (header) level
  isAllSelected(actionName: string, featureGroup: FeatureGroupNode): boolean {
    const allActions: ActionNode[] = [];

    featureGroup.pages.forEach(page => {
      const pageAction = this.getAction(page, actionName);
      if (pageAction) allActions.push(pageAction);

      page.resources.forEach(res => {
        const resAction = this.getResourceAction(res, actionName);
        if (resAction) allActions.push(resAction);
      });
    });

    return allActions.length > 0 && allActions.every(a => a.checked);
  }

  isSomeSelected(actionName: string, featureGroup: FeatureGroupNode): boolean {
    const allActions: ActionNode[] = [];

    featureGroup.pages.forEach(page => {
      const pageAction = this.getAction(page, actionName);
      if (pageAction) allActions.push(pageAction);

      page.resources.forEach(res => {
        const resAction = this.getResourceAction(res, actionName);
        if (resAction) allActions.push(resAction);
      });
    });

    const any = allActions.some(a => a.checked);
    const all = allActions.every(a => a.checked);

    return any && !all;
  }

  // Reuse this helper
  getResourceAction(res: ResourceNode, actionName: string): ActionNode | undefined {
    return res.actions.find(a => a.name.toLowerCase() === actionName.toLowerCase());
  }

  onPageCheckboxChanged(event: Event, page: PageNode, actionName: string): void {
    const input = event.target as HTMLInputElement;
    const checked = input?.checked ?? false;
    this.onActionChange(page, actionName, checked);
  }

  onResourceCheckboxChange(): void {
    // intentionally empty — triggers change detection
  }

  onResourceCheckboxChanged(event: Event, resAction: ActionNode): void {
    const input = event.target as HTMLInputElement;
    resAction.checked = input?.checked ?? false;
  }

  onFeatureGroupsChanged(): void {
    this.readyToRender = false;
    this.filteredModules = [];

    if (!this.selectedModules.length) return;

    const modulePromises = this.selectedModules.map(async modId => {
      const featureGroups = await this.roleService.getFeatureGroups(+modId).toPromise();
      const matchingGroups = (featureGroups ?? []).filter(g =>
        this.selectedFeatureGroups.includes(g.featureGroupName)
      );

      const featureGroupNodes = await Promise.all(
        matchingGroups.map(async fg => {
          const features = await this.roleService.getFeatures(fg.featureGroupId).toPromise();

          const pageNodes = await Promise.all(
            (features ?? []).map(async f => {
              const resources = await this.roleService.getResources(f.featureId).toPromise();

              return {
                name: f.featureName,
                checked: false,
                actions: [
                  { name: 'View', checked: false },
                  { name: 'Edit', checked: false },
                  { name: 'Add', checked: false },
                  { name: 'Delete', checked: false },
                  { name: 'Print', checked: false },
                  { name: 'Download', checked: false }
                ],
                resources: (resources ?? []).map(r => ({
                  name: r.resourceName,
                  checked: false,
                  actions: [
                    ...(r.allowView ? [{ name: 'View', checked: false }] : []),
                    ...(r.allowAdd ? [{ name: 'Add', checked: false }] : []),
                    ...(r.allowEdit ? [{ name: 'Edit', checked: false }] : []),
                    ...(r.allowDelete ? [{ name: 'Delete', checked: false }] : []),
                    ...(r.allowPrint ? [{ name: 'Print', checked: false }] : []),
                    ...(r.allowDownload ? [{ name: 'Download', checked: false }] : [])
                  ]
                }))
              };
            })
          );

          return {
            featureGroupName: fg.featureGroupName,
            pages: pageNodes
          };
        })
      );

      return {
        moduleId: modId,
        moduleName: this.getModuleName(modId),
        featureGroups: featureGroupNodes
      };
    });

    Promise.all(modulePromises).then(result => {
      this.filteredModules = result;
      this.readyToRender = true;
    });
  }


  isAllSelectedGlobal(actionName: string): boolean {
    const actions: ActionNode[] = [];

    this.filteredModules.forEach(module => {
      module.featureGroups.forEach(fg => {
        fg.pages.forEach(page => {
          const pageAction = this.getAction(page, actionName);
          if (pageAction) actions.push(pageAction);
          page.resources?.forEach(res => {
            const resAction = this.getResourceAction(res, actionName);
            if (resAction) actions.push(resAction);
          });
        });
      });
    });

    return actions.length > 0 && actions.every(a => a.checked);
  }

  isSomeSelectedGlobal(actionName: string): boolean {
    const actions: ActionNode[] = [];

    this.filteredModules.forEach(module => {
      module.featureGroups.forEach(fg => {
        fg.pages.forEach(page => {
          const pageAction = this.getAction(page, actionName);
          if (pageAction) actions.push(pageAction);
          page.resources?.forEach(res => {
            const resAction = this.getResourceAction(res, actionName);
            if (resAction) actions.push(resAction);
          });
        });
      });
    });

    const anyChecked = actions.some(a => a.checked);
    const allChecked = actions.every(a => a.checked);

    return anyChecked && !allChecked;
  }

  toggleAllGlobal(actionName: string, event: Event): void {
    const checked = (event.target as HTMLInputElement)?.checked ?? false;

    this.filteredModules.forEach(module => {
      module.featureGroups.forEach(fg => {
        fg.pages.forEach(page => {
          const pageAction = this.getAction(page, actionName);
          if (pageAction) pageAction.checked = checked;

          page.resources?.forEach(res => {
            const resAction = this.getResourceAction(res, actionName);
            if (resAction) resAction.checked = checked;
          });
        });
      });
    });
  }


}
