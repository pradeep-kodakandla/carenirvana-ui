import { Component } from '@angular/core';

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

@Component({
  selector: 'app-permission-manager',
  templateUrl: './permission-manager.component.html',
  styleUrls: ['./permission-manager.component.css']
})
export class PermissionManagerComponent {

  roles = ['Care Manager', 'Admin', 'Supervisor', 'Intake', 'Medical Director'];

  allModules = [
    { moduleId: 'UM', moduleName: 'UM' },
    { moduleId: 'CM', moduleName: 'CM' },
    { moduleId: 'AG', moduleName: 'AG' }
  ];

  selectedRole: string = '';
  selectedModules: string[] = [];
  readyToRender: boolean = false;
  searchText: string = '';
  filteredModules: ModuleNode[] = [];

  expandState: { [key: string]: boolean } = {}; // moduleId -> expanded

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
            featureGroupName: 'Medical History',
            pages: [
              {
                name: 'Member Info',
                checked: false,
                actions: [
                  { name: 'View', checked: false },
                  { name: 'Update', checked: false }
                ],
                resources: []
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
                resources: []
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
            featureGroupName: 'Member Summary',
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



  constructor() {
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
    this.readyToRender = false; // Reset
    this.selectedFeatureGroup = '';
    this.availableFeatureGroups = [];

    if (this.selectedModules && this.selectedModules.length > 0) {
      const featureGroupsSet = new Set<string>();

      this.selectedModules.forEach(moduleId => {
        const groups = this.featureGroupsMapping[moduleId];
        if (groups) {
          groups.forEach(g => featureGroupsSet.add(g));
        }
      });

      this.availableFeatureGroups = Array.from(featureGroupsSet);
    }
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
  isAllSelected(actionName: string, featureGroup: FeatureGroupNode): boolean {
    const allPages = featureGroup.pages.filter(p => this.getAction(p, actionName));
    return allPages.length > 0 && allPages.every(p => this.getAction(p, actionName)?.checked);
  }

  isSomeSelected(actionName: string, featureGroup: FeatureGroupNode): boolean {
    const pages = featureGroup.pages.filter(p => this.getAction(p, actionName));
    return pages.some(p => this.getAction(p, actionName)?.checked) && !this.isAllSelected(actionName, featureGroup);
  }

  toggleAll(actionName: string, featureGroup: FeatureGroupNode, event: any): void {
    const checked = event.target.checked;
    featureGroup.pages.forEach(page => {
      const action = this.getAction(page, actionName);
      if (action) {
        action.checked = checked;
      }
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
  }


}
