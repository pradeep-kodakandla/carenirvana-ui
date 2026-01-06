import { Component, ViewChild, ViewContainerRef, ComponentFactoryResolver, OnInit, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';

// Administration Components
import { UsermanagementComponent } from 'src/app/admin/usermanagement/usermanagement.component';
import { RolemanagementComponent } from 'src/app/admin/rolemanagement/rolemanagement.component';
import { ProfilemanagementComponent } from 'src/app/admin/profilemanagement/profilemanagement.component';
import { AppfeaturesetupComponent } from 'src/app/admin/appfeaturesetup/appfeaturesetup.component';
import { PermissionManagerComponent } from 'src/app/admin/appfeaturesetup/permission-manager/permission-manager.component';
import { WorkgroupComponent } from 'src/app/admin/workgroup/workgroup.component';
import { WorkbasketComponent } from 'src/app/admin/workbasket/workbasket.component';
import { UserDefinedCustomFieldsComponent } from 'src/app/admin/userdefinedcustomfields/userdefinedcustomfields.component';
import { TemplatebuilderComponent } from 'src/app/admin/templatebuilder/templatebuilder/templatebuilder.component';
import { TemplatebuilderpropertiesComponent } from 'src/app/admin/templatebuilder/templatebuilderproperties/templatebuilderproperties.component';


// UM Components
import { UmdocumenttypeComponent } from 'src/app/admin/UM/umdocumenttype/umdocumenttype.component';
import { UmactivitytypeComponent } from 'src/app/admin/UM/umactivitytype/umactivitytype.component';
import { UmnotetypeComponent } from 'src/app/admin/UM/umnotetype/umnotetype.component';
import { ExternallinksComponent } from 'src/app/admin/UM/externallinks/externallinks.component';
import { UmclaimtypeComponent } from 'src/app/admin/UM/umclaimtype/umclaimtype.component';
import { UmactivitypriorityComponent } from 'src/app/admin/UM/umactivitypriority/umactivitypriority.component';
import { UmadmissionlevelComponent } from 'src/app/admin/UM/umadmissionlevel/umadmissionlevel.component';
import { UmadmissiontypeComponent } from 'src/app/admin/UM/umadmissiontype/umadmissiontype.component';
import { UmadmitreasonComponent } from 'src/app/admin/UM/umadmitreason/umadmitreason.component';
import { UmcertificationtypeComponent } from 'src/app/admin/UM/umcertificationtype/umcertificationtype.component';
import { UmdenialtypeComponent } from 'src/app/admin/UM/umdenialtype/umdenialtype.component';
import { UmdeterminationtypeComponent } from 'src/app/admin/UM/umdeterminationtype/umdeterminationtype.component';
import { UmdischargetoComponent } from 'src/app/admin/UM/umdischargeto/umdischargeto.component';
import { UmdischargetypeComponent } from 'src/app/admin/UM/umdischargetype/umdischargetype.component';
import { UmmedicationfrequencyComponent } from 'src/app/admin/UM/ummedicationfrequency/ummedicationfrequency.component';
import { UmnotificationtypeComponent } from 'src/app/admin/UM/umnotificationtype/umnotificationtype.component';
import { UmoutofareaindicatorComponent } from 'src/app/admin/UM/umoutofareaindicator/umoutofareaindicator.component';
import { UmplaceofserviceComponent } from 'src/app/admin/UM/umplaceofservice/umplaceofservice.component';
import { UmprescriptionquantityComponent } from 'src/app/admin/UM/umprescriptionquantity/umprescriptionquantity.component';
import { UmqualityindicatorComponent } from 'src/app/admin/UM/umqualityindicator/umqualityindicator.component';
import { UmtransportationtriptypeComponent } from 'src/app/admin/UM/umtransportationtriptype/umtransportationtriptype.component';
import { UmtreatmenttypeComponent } from 'src/app/admin/UM/umtreatmenttype/umtreatmenttype.component';
import { UmunittypeComponent } from 'src/app/admin/UM/umunittype/umunittype.component';
import { UmdecisionstatuscodeComponent } from 'src/app/admin/UM/umdecisionstatuscode/umdecisionstatuscode.component';
import { UmdenialreasonComponent } from 'src/app/admin/UM/umdenialreason/umdenialreason.component';
import { UmauthtemplateComponent } from 'src/app/admin/UM/umauthtemplate/umauthtemplate.component';
import { UmauthstatusreasonComponent } from 'src/app/admin/UM/umauthstatusreason/umauthstatusreason.component';
import { UmauthtemplateBuilderComponent } from 'src/app/admin/UM/umauthtemplate-builder/umauthtemplate-builder.component';

// CM Components
import { CmdocumenttypeComponent } from 'src/app/admin/CM/cmdocumenttype/cmdocumenttype.component';
import { CmnotetypeComponent } from 'src/app/admin/CM/cmnotetype/cmnotetype.component';
import { CmaddresstypeComponent } from 'src/app/admin/CM/cmaddresstype/cmaddresstype.component';
import { CmadvancedirectivesComponent } from 'src/app/admin/CM/cmadvancedirectives/cmadvancedirectives.component';
import { CmappointmenttypeComponent } from 'src/app/admin/CM/cmappointmenttype/cmappointmenttype.component';
import { CmcauseofdeathComponent } from 'src/app/admin/CM/cmcauseofdeath/cmcauseofdeath.component';
import { CmevacuationzoneComponent } from 'src/app/admin/CM/cmevacuationzone/cmevacuationzone.component';
import { CmplaceofdeathComponent } from 'src/app/admin/CM/cmplaceofdeath/cmplaceofdeath.component';
import { CmsexualorientationComponent } from 'src/app/admin/CM/cmsexualorientation/cmsexualorientation.component';
import { CmconditionComponent } from 'src/app/admin/CM/cmcondition/cmcondition.component';
import { CmproblemComponent } from 'src/app/admin/CM/cmproblem/cmproblem.component';
import { CmgoalclassComponent } from 'src/app/admin/CM/cmgoalclass/cmgoalclass.component';
import { CmgoalComponent } from 'src/app/admin/CM/cmgoal/cmgoal.component';
import { CminterventionComponent } from 'src/app/admin/CM/cmintervention/cmintervention.component';
import { CmcareplanmatrixComponent } from 'src/app/admin/CM/cmcareplanmatrix/cmcareplanmatrix.component';
import { CmcareplanstatusComponent } from 'src/app/admin/CM/cmcareplanstatus/cmcareplanstatus.component';
import { CmcareplandurationComponent } from 'src/app/admin/CM/cmcareplanduration/cmcareplanduration.component';
import { CmbarriertypeComponent } from 'src/app/admin/CM/cmbarriertype/cmbarriertype.component';
import { CmstrengthtypeComponent } from 'src/app/admin/CM/cmstrengthtype/cmstrengthtype.component';
import { CmholidaysComponent } from 'src/app/admin/CM/cmholidays/cmholidays.component';
import { CmmedicationfrequencyComponent } from 'src/app/admin/CM/cmmedicationfrequency/cmmedicationfrequency.component';
import { CmmedicationrouteComponent } from 'src/app/admin/CM/cmmedicationroute/cmmedicationroute.component';
import { CmmedicationdosageunitsComponent } from 'src/app/admin/CM/cmmedicationdosageunits/cmmedicationdosageunits.component';
import { CmmedicationtypeComponent } from 'src/app/admin/CM/cmmedicationtype/cmmedicationtype.component';
import { CmmedicationreconciliationComponent } from 'src/app/admin/CM/cmmedicationreconciliation/cmmedicationreconciliation.component';
import { CmmedicationbarriertypeComponent } from 'src/app/admin/CM/cmmedicationbarriertype/cmmedicationbarriertype.component';
import { CmclinicalindicatorsComponent } from 'src/app/admin/CM/cmclinicalindicators/cmclinicalindicators.component';

// AG Components
import { AgdocumenttypeComponent } from 'src/app/admin/AG/agdocumenttype/agdocumenttype.component';
import { AgnotetypeComponent } from 'src/app/admin/AG/agnotetype/agnotetype.component';
import { AgcomplaintcategoryComponent } from 'src/app/admin/AG/agcomplaintcategory/agcomplaintcategory.component';
import { AgcomplaintclassComponent } from 'src/app/admin/AG/agcomplaintclass/agcomplaintclass.component';
import { AgcomplaintcredentialsComponent } from 'src/app/admin/AG/agcomplaintcredentials/agcomplaintcredentials.component';
import { AgcomplaintstatusreasonComponent } from 'src/app/admin/AG/agcomplaintstatusreason/agcomplaintstatusreason.component';
import { AgcomplaintsubcategoryComponent } from 'src/app/admin/AG/agcomplaintsubcategory/agcomplaintsubcategory.component';
import { AgcoordinatortypeComponent } from 'src/app/admin/AG/agcoordinatortype/agcoordinatortype.component';
import { AgparticipantroleComponent } from 'src/app/admin/AG/agparticipantrole/agparticipantrole.component';
import { AgparticipanttypeComponent } from 'src/app/admin/AG/agparticipanttype/agparticipanttype.component';
import { AgqocinvestigationoutcomeComponent } from 'src/app/admin/AG/agqocinvestigationoutcome/agqocinvestigationoutcome.component';
import { AgqocinvestigationreasonComponent } from 'src/app/admin/AG/agqocinvestigationreason/agqocinvestigationreason.component';
import { AgqocscoreComponent } from 'src/app/admin/AG/agqocscore/agqocscore.component';
import { AgresolutioncategoryComponent } from 'src/app/admin/AG/agresolutioncategory/agresolutioncategory.component';
import { AgresolutionsubcategoryComponent } from 'src/app/admin/AG/agresolutionsubcategory/agresolutionsubcategory.component';

import { BretestComponent } from 'src/app/admin/UM/bretest/bretest.component';
// Interfaces
interface MenuItem {
  name: string;
  children: string[];
}

interface ComponentMap {
  [key: string]: any;
}

@Component({
  selector: 'app-configuration',
  templateUrl: './configuration.component.html',
  styleUrls: ['./configuration.component.css']
})
export class ConfigurationComponent implements OnInit, AfterViewInit {
  @ViewChild('dynamicContainer', { read: ViewContainerRef, static: false })
  dynamicContainer!: ViewContainerRef;

  searchQuery: string = '';
  selectedMenu: MenuItem | null = null;
  selectedSubMenu: string | null = null;
  isMenuCollapsed: boolean = false;
  showRulesEngine: boolean = false;

  private readonly componentMap: ComponentMap = {
    'User Management': UsermanagementComponent,
    'Role Management': RolemanagementComponent,
    'Profile Management': ProfilemanagementComponent,
    'Application Features Setup': AppfeaturesetupComponent,
    'Auth Template': TemplatebuilderComponent,
    'Case Template': TemplatebuilderComponent,
    'UM Document Type': UmdocumenttypeComponent,
    'UM Activity Type': UmactivitytypeComponent,
    'UM Note Type': UmnotetypeComponent,
    'CM Document Type': CmdocumenttypeComponent,
    'CM Note Type': CmnotetypeComponent,
    'AG Note Type': AgnotetypeComponent,
    'AG Document Type': AgdocumenttypeComponent,
    'External Links': ExternallinksComponent,
    'Claim Type': UmclaimtypeComponent,
    'Activity Priority': UmactivitypriorityComponent,
    'Admission Level': UmadmissionlevelComponent,
    'Admission Type': UmadmissiontypeComponent,
    'Admit Reason': UmadmitreasonComponent,
    'Certification Type': UmcertificationtypeComponent,
    'Denial Type': UmdenialtypeComponent,
    'Determination Type': UmdeterminationtypeComponent,
    'Discharge To': UmdischargetoComponent,
    'Discharge Type': UmdischargetypeComponent,
    'Medication Frequency': UmmedicationfrequencyComponent,
    'Notification Type': UmnotificationtypeComponent,
    'Out Of Area Indicator': UmoutofareaindicatorComponent,
    'Place Of Service': UmplaceofserviceComponent,
    'Prescription Quantity': UmprescriptionquantityComponent,
    'Quality Indicator': UmqualityindicatorComponent,
    'Transportation Trip Type': UmtransportationtriptypeComponent,
    'Treatment Type': UmtreatmenttypeComponent,
    'Unit Type': UmunittypeComponent,
    'Decision Status Code': UmdecisionstatuscodeComponent,
    'Denial Reason': UmdenialreasonComponent,
    'Auth Status Reason': UmauthstatusreasonComponent,
    'Address Type': CmaddresstypeComponent,
    'Advance Directives': CmadvancedirectivesComponent,
    'Appointment Type': CmappointmenttypeComponent,
    'Cause Of Death': CmcauseofdeathComponent,
    'Evacuation Zone': CmevacuationzoneComponent,
    'Place Of Death': CmplaceofdeathComponent,
    'Sexual Orientation': CmsexualorientationComponent,
    'Condition': CmconditionComponent,
    'Problem': CmproblemComponent,
    'Goal Class': CmgoalclassComponent,
    'Goal': CmgoalComponent,
    'Intervention': CminterventionComponent,
    'Care Plan Matrix': CmcareplanmatrixComponent,
    'Care Plan Status': CmcareplanstatusComponent,
    'Care Plan Duratoin': CmcareplandurationComponent,
    'Barrier Type': CmbarriertypeComponent,
    'Strength Type': CmstrengthtypeComponent,
    'Holidays': CmholidaysComponent,
    'Medication Route': CmmedicationrouteComponent,
    'Medication Dosage Units': CmmedicationdosageunitsComponent,
    'Medication Type': CmmedicationtypeComponent,
    'Medication Reconciliation': CmmedicationreconciliationComponent,
    'Medication Barrier Type': CmmedicationbarriertypeComponent,
    'Clinical Indicators': CmclinicalindicatorsComponent,
    'Complaint Class': AgcomplaintclassComponent,
    'Complaint Category': AgcomplaintcategoryComponent,
    'Complaint Sub Category': AgcomplaintsubcategoryComponent,
    'Complaint Credentials': AgcomplaintcredentialsComponent,
    'Complaint Status Reason': AgcomplaintstatusreasonComponent,
    'Coordinator Type': AgcoordinatortypeComponent,
    'Participant Role': AgparticipantroleComponent,
    'Participant Type': AgparticipanttypeComponent,
    'QOC Investigation Outcome': AgqocinvestigationoutcomeComponent,
    'QOC Score': AgqocscoreComponent,
    'QOC Investigation Reason': AgqocinvestigationreasonComponent,
    'Resolution Category': AgresolutioncategoryComponent,
    'Resolution Sub Category': AgresolutionsubcategoryComponent,
    'Work Group': WorkgroupComponent,
    'Work Basket': WorkbasketComponent,
    'Custom Field': UserDefinedCustomFieldsComponent,
    'Bre Test': BretestComponent
  };

  private readonly mainMenu: MenuItem[] = [
    { name: 'Business Rules Engine', children: ['Dashboard', 'Rule Groups', 'Rules', 'Data Fields', 'Functions', 'Decision Tables'] },
    {
      name: 'Utilization Management',
      children: [
        'Auth Template', 'External Links', 'UM Activity Type', 'UM Document Type', 'UM Note Type', 'Claim Type',
        'Activity Priority', 'Admission Level', 'Admission Type', 'Admit Reason', 'Certification Type',
        'Denial Type', 'Determination Type', 'Discharge To', 'Discharge Type', 'Medication Frequency',
        'Notification Type', 'Out Of Area Indicator', 'Place Of Service', 'Prescription Quantity',
        'Quality Indicator', 'Transportation Trip Type', 'Treatment Type', 'Unit Type',
        'Decision Status Code', 'Denial Reason', 'Auth Status Reason'
      ]
    },
    {
      name: 'Care Management',
      children: [
        'Clinical Indicators', 'CM Document Type', 'CM Note Type', 'Address Type', 'Advance Directives',
        'Appointment Type', 'Cause Of Death', 'Evacuation Zone', 'Place Of Death', 'Sexual Orientation',
        'Condition', 'Problem', 'Goal Class', 'Goal', 'Intervention', 'Care Plan Matrix',
        'Care Plan Duratoin', 'Care Plan Status', 'Barrier Type', 'Strength Type', 'Holidays',
        'Medication Frequency', 'Medication Route', 'Medication Dosage Units', 'Medication Type',
        'Medication Reconciliation', 'Medication Barrier Type'
      ]
    },
    {
      name: 'Appeals & Grievances',
      children: [
        'Case Template', 'AG Document Type', 'AG Note Type', 'Complaint Class', 'Complaint Category', 'Complaint Sub Category',
        'Complaint Credentials', 'Complaint Status Reason', 'Coordinator Type', 'Participant Role',
        'Participant Type', 'QOC Investigation Outcome', 'QOC Score', 'QOC Investigation Reason',
        'Resolution Category', 'Resolution Sub Category'
      ]
    },
    { name: 'Manage', children: ['Member Merge'] },
    {
      name: 'Administration',
      children: ['Role Management', 'User Management', 'Profile Management', 'Application Features Setup', 'Work Group', 'Work Basket', 'Custom Field']
    },
    { name: 'Configuration Management', children: ['Config Push'] }


  ];

  filteredMainMenu: MenuItem[] = [];
  filteredSubMenu: string[] = [];

  constructor(private componentFactoryResolver: ComponentFactoryResolver,
    private router: Router) {
    this.filteredMainMenu = [...this.mainMenu];
  }

  ngOnInit(): void {
    this.selectMainMenu(this.mainMenu[0]);
  }

  ngAfterViewInit(): void {
    this.loadInitialComponent();
  }

  //selectMainMenu(menuItem: MenuItem): void {
  //  this.selectedMenu = menuItem;

  //  if ((menuItem?.name ?? '').toLowerCase() === 'business rules engine') {
  //    if (this.dynamicContainer) this.dynamicContainer.clear();
  //    this.selectedSubMenu = null;
  //    this.isMenuCollapsed = false;
  //    this.router.navigate(['/rulesengine', 'dashboard']);
  //    return;
  //  }

  //  this.filterSubMenu();
  //  this.selectedSubMenu = this.filteredSubMenu[0] || null;
  //  this.isMenuCollapsed = false;

  //  if (this.selectedSubMenu) {
  //    this.loadComponent(this.selectedSubMenu);
  //  }
  //}

  selectMainMenu(menuItem: MenuItem): void {
    this.selectedMenu = menuItem;
    this.filterSubMenu();
    this.selectedSubMenu = this.filteredSubMenu[0] || null;
    this.isMenuCollapsed = false;

    const isRulesEngine = (menuItem?.name ?? '').toLowerCase() === 'business rules engine';
    this.showRulesEngine = isRulesEngine;

    if (isRulesEngine) {
      // loads inside the Details Section router outlet
      this.router.navigate(['configuration', 'rulesengine', 'dashboard']);
      return;
    }

    // existing workflow stays the same
    if (this.selectedSubMenu) {
      this.loadComponent(this.selectedSubMenu);
    }
  }



  //selectMainMenu(menuItem: MenuItem): void {
  //  this.selectedMenu = menuItem;
  //  this.filterSubMenu();
  //  this.selectedSubMenu = this.filteredSubMenu[0] || null;
  //  this.isMenuCollapsed = false; // Expand menu when selecting main menu
  //  if (this.selectedSubMenu) {
  //    this.loadComponent(this.selectedSubMenu);
  //  }
  //}

  //selectSubMenu(subMenuItem: string): void {
  //  this.selectedSubMenu = subMenuItem;
  //  this.loadComponent(subMenuItem);

  //  // Collapse menu when "Auth Template" is selected
  //  if (subMenuItem === 'Auth Template' || 'Case Template') {
  //    this.isMenuCollapsed = true;
  //  } else {
  //    this.isMenuCollapsed = false;
  //  }
  //}

  selectSubMenu(subMenuItem: string): void {
    this.selectedSubMenu = subMenuItem;

    const isRulesEngine = (this.selectedMenu?.name ?? '').toLowerCase() === 'business rules engine';
    this.showRulesEngine = isRulesEngine;

    if (isRulesEngine) {
      const key = (subMenuItem ?? '').toLowerCase();


      if (key === 'dashboard') this.router.navigate(['configuration', 'rulesengine', 'dashboard']);
      else if (key === 'rule groups') this.router.navigate(['configuration', 'rulesengine', 'rulegroups']);
      else if (key === 'rules') this.router.navigate(['configuration', 'rulesengine', 'rules']);
      else if (key === 'data fields') this.router.navigate(['configuration', 'rulesengine', 'datafields']);
      else if (key === 'functions') this.router.navigate(['configuration', 'rulesengine', 'functions']);
      else if (key === 'decision tables') this.router.navigate(['configuration', 'rulesengine', 'decisiontable']);

      else this.router.navigate(['configuration', 'rulesengine', 'dashboard']);

      return;
    }

    // existing workflow (dynamic component load)
    this.loadComponent(subMenuItem);

    // FIX: your current code has a bug and always collapses
    if (subMenuItem === 'Auth Template' || subMenuItem === 'Case Template') {
      this.isMenuCollapsed = true;
    } else {
      this.isMenuCollapsed = false;
    }
  }



  filterMenus(): void {
    const query = this.searchQuery.toLowerCase().trim();

    this.filteredMainMenu = this.mainMenu.filter(menu =>
      menu.name.toLowerCase().includes(query) ||
      menu.children.some(child => child.toLowerCase().includes(query))
    );

    if (this.selectedMenu && !this.filteredMainMenu.includes(this.selectedMenu)) {
      this.resetSelection();
    }

    this.filterSubMenu();
  }

  private filterSubMenu(): void {
    if (!this.selectedMenu) {
      this.filteredSubMenu = [];
      return;
    }

    const query = this.searchQuery.toLowerCase().trim();
    this.filteredSubMenu = this.selectedMenu.children.filter(child =>
      child.toLowerCase().includes(query)
    );
  }

  private loadComponent(componentKey: string): void {
    try {
      const component = this.componentMap[componentKey];
      if (!component) {
        console.warn(`No component mapped for: ${componentKey}`);
        return;
      }

      if (!this.dynamicContainer) {
        console.error('Dynamic container not available');
        return;
      }

      const componentFactory = this.componentFactoryResolver.resolveComponentFactory(component);
      this.dynamicContainer.clear();
      const componentRef = this.dynamicContainer.createComponent(componentFactory);
      // Check if the loaded component is UmauthtemplateBuilderComponent
      if (componentKey === 'Auth Template' || 'Case Template') {
        // Subscribe to the menuCollapse event to keep collapsing if needed
        const tb = componentRef.instance as TemplatebuilderComponent;
        tb.module = componentKey == 'Case Template' ? 'AG' : 'UM';
        // you already had this subscription:
        tb.menuCollapse.subscribe(() => {
          this.isMenuCollapsed = true;
        });
      }
    } catch (error) {
      console.error(`Error loading component ${componentKey}:`, error);
    }
  }

  toggleMenu(): void {
    //console.log('toggleMenu', !this.isMenuCollapsed);
    this.isMenuCollapsed = !this.isMenuCollapsed; // Collapses the menu
  }

  private loadInitialComponent(): void {
    if (this.dynamicContainer) {
      this.loadComponent('Auth Template');
      //this.loadComponent('Custom Field');
    } else {
      console.error('Dynamic container not initialized');
    }
  }

  private resetSelection(): void {
    this.selectedMenu = null;
    this.selectedSubMenu = null;
    this.isMenuCollapsed = false;
    if (this.dynamicContainer) {
      this.dynamicContainer.clear();
    }
  }

  //// New method to toggle menu visibility manually if needed
  //toggleMenu(): void {
  //  this.isMenuCollapsed = !this.isMenuCollapsed;
  //}
}
