import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { RouterModule, Routes } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { AngularMaterialModule } from './shared/helpers/angular-material/angular-material.module';
import { AppComponent } from './app.component';
import { LoginComponent } from './login/login.component'
import { DashBoardComponent } from './dash-board/dash-board.component';
import { MessagesComponent } from './messages/messages.component';
import { HeaderComponent } from './header/header.component';
import { FooterComponent } from './footer/footer.component';
import { CounterComponent } from './counter/counter.component';
import { FetchDataComponent } from './fetch-data/fetch-data.component';
import { MemberDetailsComponent } from './member/member-details/member-details.component';
import { SidenavService } from 'src/app/service/sidenav.service.service'
import { MemberComponent } from './member/member/member.component';
import { MycaseloadComponent } from './dash-board/mycaseload/mycaseload.component';
import { AssignedauthsComponent } from './dash-board/assignedauths/assignedauths.component';
import { RequestsComponent } from './dash-board/requests/requests.component';
import { MyactivitiesComponent } from './dash-board/myactivities/myactivities.component';
import { AssignedcomplaintsComponent } from './dash-board/assignedcomplaints/assignedcomplaints.component';
import { FaxesComponent } from './dash-board/faxes/faxes.component';
import { NewDashBoardComponent } from './dash-board/new-dash-board/new-dash-board.component';
import { NewDashboard2Component } from './dash-board/new-dashboard2/new-dashboard2.component';
import { MdreviewdashboardComponent } from './dash-board/mdreviewdashboard/MdreviewdashboardComponent';

import { MemberAlertsComponent } from './member/member-alerts/member-alerts.component';
import { MemberCareplanComponent } from './member/member-careplan/member-careplan.component';
import { MemberCareteamComponent } from './member/member-careteam/member-careteam.component';
import { MemberCaregiverComponent } from './member/member-caregiver/member-caregiver.component';
import { MemberDocumentsComponent } from './member/member-documents/member-documents.component';
import { MemberEnrollmentComponent } from './member/member-enrollment/member-enrollment.component';
import { MemberNotesComponent } from './member/member-notes/member-notes.component';
import { MemberProgramComponent } from './member/member-program/member-program.component';
import { MemberTasksummaryComponent } from './member/member-tasksummary/member-tasksummary.component';
import { MemberInfoComponent } from './member/member-info/member-info.component';
import { MemberJourneyComponent } from './member/memberjourney/memberjourney.component';
import { MemberSummaryaiComponent } from './member/member-summaryai/member-summaryai.component';
import { MemberActivityComponent } from './member/memberactivity/memberactivity.component';
import { MembersearchComponent } from './member/membersearch/membersearch.component';

import { AuthorizationComponent } from './member/UM/authorization/authorization.component';
import { DecisiondetailsComponent } from './member/UM/decisiondetails/decisiondetails.component';
import { DecisionbulkdialogComponent } from './member/UM/decisionbulkdialog/decisionbulkdialog.component';
import { AuthdetailsComponent } from './member/UM/authdetails/authdetails.component';
import { AuthdynamicComponent } from './member/UM/authdynamic/authdynamic.component';
import { ProviderSearchComponent } from './Provider/provider-search/provider-search.component';
import { UmauthnotesComponent } from './member/UM/umauthnotes/umauthnotes.component';
import { UmauthdocumentsComponent } from './member/UM/umauthdocuments/umauthdocuments.component';
import { UmauthactivityComponent } from './member/UM/umauthactivity/umauthactivity.component';
import { ValidationErrorDialogComponent } from './member/validation-error-dialog/validation-error-dialog.component';
import { MdreviewComponent } from './member/UM/mdreview/mdreview.component';
import { SmartauthcheckComponent } from './member/UM/smartauthcheck/smartauthcheck.component';
import { ConfirmationDialogComponent } from './member/UM/confirmation-dialog/confirmation-dialog.component';

import { ConfigurationComponent } from './admin/configuration/configuration.component';
import { UsermanagementComponent } from './admin/usermanagement/usermanagement.component';
import { RolemanagementComponent } from './admin/rolemanagement/rolemanagement.component';
import { ProfilemanagementComponent } from './admin/profilemanagement/profilemanagement.component';
import { AppfeaturesetupComponent } from './admin/appfeaturesetup/appfeaturesetup.component';
import { PermissionManagerComponent } from 'src/app/admin/appfeaturesetup/permission-manager/permission-manager.component';
import { WorkgroupComponent } from './admin/workgroup/workgroup.component';
import { WorkbasketComponent } from './admin/workbasket/workbasket.component';
import { UserDefinedCustomFieldsComponent } from './admin/userdefinedcustomfields/userdefinedcustomfields.component';
import { TemplatebuilderComponent } from './admin/templatebuilder/templatebuilder/templatebuilder.component';
import { TemplatebuilderpropertiesComponent } from './admin/templatebuilder/templatebuilderproperties/templatebuilderproperties.component';


import { UmdocumenttypeComponent } from './admin/UM/umdocumenttype/umdocumenttype.component';
import { UmactivitytypeComponent } from './admin/UM/umactivitytype/umactivitytype.component';
import { SettingsDialogComponent } from './admin/UM/settings-dialog/settings-dialog.component';
import { DialogContentComponent } from './admin/UM/dialog-content/dialog-content.component';
import { UmclaimtypeComponent } from './admin/UM/umclaimtype/umclaimtype.component';
import { UmnotetypeComponent } from './admin/UM/umnotetype/umnotetype.component';
import { ExternallinksComponent } from './admin/UM/externallinks/externallinks.component';
import { UmactivitypriorityComponent } from './admin/UM/umactivitypriority/umactivitypriority.component';
import { UmadmissionlevelComponent } from './admin/UM/umadmissionlevel/umadmissionlevel.component';
import { UmadmissiontypeComponent } from './admin/UM/umadmissiontype/umadmissiontype.component';
import { UmadmitreasonComponent } from './admin/UM/umadmitreason/umadmitreason.component';
import { UmcertificationtypeComponent } from './admin/UM/umcertificationtype/umcertificationtype.component';
import { UmdenialtypeComponent } from './admin/UM/umdenialtype/umdenialtype.component';
import { UmdeterminationtypeComponent } from './admin/UM/umdeterminationtype/umdeterminationtype.component';
import { UmdischargetoComponent } from './admin/UM/umdischargeto/umdischargeto.component';
import { UmdischargetypeComponent } from './admin/UM/umdischargetype/umdischargetype.component';
import { UmmedicationfrequencyComponent } from './admin/UM/ummedicationfrequency/ummedicationfrequency.component';
import { UmnotificationtypeComponent } from './admin/UM/umnotificationtype/umnotificationtype.component';
import { UmoutofareaindicatorComponent } from './admin/UM/umoutofareaindicator/umoutofareaindicator.component';
import { UmplaceofserviceComponent } from './admin/UM/umplaceofservice/umplaceofservice.component';
import { UmprescriptionquantityComponent } from './admin/UM/umprescriptionquantity/umprescriptionquantity.component';
import { UmqualityindicatorComponent } from './admin/UM/umqualityindicator/umqualityindicator.component';
import { UmtransportationtriptypeComponent } from './admin/UM/umtransportationtriptype/umtransportationtriptype.component';
import { UmtreatmenttypeComponent } from './admin/UM/umtreatmenttype/umtreatmenttype.component';
import { UmunittypeComponent } from './admin/UM/umunittype/umunittype.component';
import { UmdecisionstatuscodeComponent } from './admin/UM/umdecisionstatuscode/umdecisionstatuscode.component';
import { UmdenialreasonComponent } from './admin/UM/umdenialreason/umdenialreason.component';
import { UmauthtemplateComponent } from './admin/UM/umauthtemplate/umauthtemplate.component';
import { UmauthstatusreasonComponent } from './admin/UM/umauthstatusreason/umauthstatusreason.component';
import { BretestComponent } from './admin/UM/bretest/bretest.component';
import { UmauthtemplateBuilderComponent } from './admin/UM/umauthtemplate-builder/umauthtemplate-builder.component';
import { UmauthtemplateFieldPropertiesComponent } from './admin/UM/umauthtemplate-field-properties/umauthtemplate-field-properties.component';
import { ValidationDialogComponent } from './admin/UM/validation-dialog/validation-dialog.component';

import { CmnotetypeComponent } from './admin/CM/cmnotetype/cmnotetype.component';
import { CmdocumenttypeComponent } from './admin/CM/cmdocumenttype/cmdocumenttype.component';
import { CmaddresstypeComponent } from './admin/CM/cmaddresstype/cmaddresstype.component';
import { CmadvancedirectivesComponent } from './admin/CM/cmadvancedirectives/cmadvancedirectives.component';
import { CmappointmenttypeComponent } from './admin/CM/cmappointmenttype/cmappointmenttype.component';
import { CmcauseofdeathComponent } from './admin/CM/cmcauseofdeath/cmcauseofdeath.component';
import { CmevacuationzoneComponent } from './admin/CM/cmevacuationzone/cmevacuationzone.component';
import { CmplaceofdeathComponent } from './admin/CM/cmplaceofdeath/cmplaceofdeath.component';
import { CmsexualorientationComponent } from './admin/CM/cmsexualorientation/cmsexualorientation.component';
import { CmconditionComponent } from './admin/CM/cmcondition/cmcondition.component';
import { CmproblemComponent } from './admin/CM/cmproblem/cmproblem.component';
import { CmgoalclassComponent } from './admin/CM/cmgoalclass/cmgoalclass.component';
import { CmgoalComponent } from './admin/CM/cmgoal/cmgoal.component';
import { CminterventionComponent } from './admin/CM/cmintervention/cmintervention.component';
import { CmcareplanmatrixComponent } from './admin/CM/cmcareplanmatrix/cmcareplanmatrix.component';
import { CmcareplanstatusComponent } from './admin/CM/cmcareplanstatus/cmcareplanstatus.component';
import { CmcareplandurationComponent } from './admin/CM/cmcareplanduration/cmcareplanduration.component';
import { CmbarriertypeComponent } from './admin/CM/cmbarriertype/cmbarriertype.component';
import { CmstrengthtypeComponent } from './admin/CM/cmstrengthtype/cmstrengthtype.component';
import { CmholidaysComponent } from './admin/CM/cmholidays/cmholidays.component';
import { CmmedicationfrequencyComponent } from './admin/CM/cmmedicationfrequency/cmmedicationfrequency.component';
import { CmmedicationrouteComponent } from './admin/CM/cmmedicationroute/cmmedicationroute.component';
import { CmmedicationdosageunitsComponent } from './admin/CM/cmmedicationdosageunits/cmmedicationdosageunits.component';
import { CmmedicationtypeComponent } from './admin/CM/cmmedicationtype/cmmedicationtype.component';
import { CmmedicationreconciliationComponent } from './admin/CM/cmmedicationreconciliation/cmmedicationreconciliation.component';
import { CmmedicationbarriertypeComponent } from './admin/CM/cmmedicationbarriertype/cmmedicationbarriertype.component';
import { CmclinicalindicatorsComponent } from './admin/CM/cmclinicalindicators/cmclinicalindicators.component';

import { AgnotetypeComponent } from './admin/AG/agnotetype/agnotetype.component';
import { AgdocumenttypeComponent } from './admin/AG/agdocumenttype/agdocumenttype.component';
import { CaseWizardModule } from './casewizard/casewizard/casewizard.module';
import { SharedUiModule } from './casewizard/casewizard/sharedui.module';
import { MembercasedetailsComponent } from './member/AG/components/membercasedetails/membercasedetails.component';

import { AgcomplaintcategoryComponent } from './admin/AG/agcomplaintcategory/agcomplaintcategory.component';
import { AgcomplaintclassComponent } from './admin/AG/agcomplaintclass/agcomplaintclass.component';
import { AgcomplaintcredentialsComponent } from './admin/AG/agcomplaintcredentials/agcomplaintcredentials.component';
import { AgcomplaintstatusreasonComponent } from './admin/AG/agcomplaintstatusreason/agcomplaintstatusreason.component';
import { AgcomplaintsubcategoryComponent } from './admin/AG/agcomplaintsubcategory/agcomplaintsubcategory.component';
import { AgcoordinatortypeComponent } from './admin/AG/agcoordinatortype/agcoordinatortype.component';
import { AgparticipantroleComponent } from './admin/AG/agparticipantrole/agparticipantrole.component';
import { AgparticipanttypeComponent } from './admin/AG/agparticipanttype/agparticipanttype.component';
import { AgqocinvestigationoutcomeComponent } from './admin/AG/agqocinvestigationoutcome/agqocinvestigationoutcome.component';
import { AgqocinvestigationreasonComponent } from './admin/AG/agqocinvestigationreason/agqocinvestigationreason.component';
import { AgqocscoreComponent } from './admin/AG/agqocscore/agqocscore.component';
import { AgresolutioncategoryComponent } from './admin/AG/agresolutioncategory/agresolutioncategory.component';
import { AgresolutionsubcategoryComponent } from './admin/AG/agresolutionsubcategory/agresolutionsubcategory.component';


import { UiDropdownComponent } from './shared/ui/uidropdown/uidropdown.component';
import { UiMultiCheckDropdownComponent } from './shared/ui/uimulticheckdropdown/uimulticheckdropdown.component';

const routes: Routes = [

];

@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    CounterComponent,
    FetchDataComponent,
    DashBoardComponent,
    MessagesComponent, HeaderComponent,
    FooterComponent,
    MemberDetailsComponent,
    MemberComponent,
    MycaseloadComponent,
    AssignedauthsComponent,
    RequestsComponent,
    MyactivitiesComponent,
    AssignedcomplaintsComponent,
    FaxesComponent,
    MemberAlertsComponent,
    MemberCareplanComponent,
    MemberCareteamComponent, MemberCaregiverComponent, MemberJourneyComponent, MemberSummaryaiComponent, MemberActivityComponent, MembersearchComponent,
    MemberDocumentsComponent,
    MemberEnrollmentComponent,
    MemberNotesComponent,
    MemberProgramComponent,
    MemberTasksummaryComponent,
    MemberInfoComponent, AuthorizationComponent, DecisiondetailsComponent, AuthdetailsComponent, AuthdynamicComponent, ProviderSearchComponent,
    UmauthnotesComponent, UmauthdocumentsComponent, UmauthactivityComponent, ValidationErrorDialogComponent, MdreviewComponent,
    NewDashBoardComponent, NewDashboard2Component, MdreviewdashboardComponent, SmartauthcheckComponent, ConfirmationDialogComponent,
    ConfigurationComponent, UsermanagementComponent, RolemanagementComponent, ProfilemanagementComponent, AppfeaturesetupComponent, PermissionManagerComponent,
    WorkgroupComponent, WorkbasketComponent, UserDefinedCustomFieldsComponent, TemplatebuilderComponent, TemplatebuilderpropertiesComponent,
    UmdocumenttypeComponent, SettingsDialogComponent, UmactivitytypeComponent, DecisionbulkdialogComponent, DialogContentComponent, UmnotetypeComponent, ExternallinksComponent,
    UmclaimtypeComponent, UmactivitypriorityComponent, UmadmissionlevelComponent, UmadmissiontypeComponent, UmadmitreasonComponent,
    UmcertificationtypeComponent, UmdenialtypeComponent, UmdeterminationtypeComponent, UmdischargetoComponent, UmdischargetypeComponent,
    UmmedicationfrequencyComponent, UmnotificationtypeComponent, UmoutofareaindicatorComponent, UmplaceofserviceComponent, UmprescriptionquantityComponent,
    UmqualityindicatorComponent, UmtransportationtriptypeComponent, UmtreatmenttypeComponent, UmunittypeComponent, UmdecisionstatuscodeComponent, UmdenialreasonComponent,
    UmauthtemplateComponent, BretestComponent, UmauthstatusreasonComponent, UmauthtemplateBuilderComponent, UmauthtemplateFieldPropertiesComponent, ValidationDialogComponent,
    CmnotetypeComponent, CmdocumenttypeComponent, AgnotetypeComponent, AgdocumenttypeComponent, CmaddresstypeComponent, CmadvancedirectivesComponent,
    CmappointmenttypeComponent, CmcauseofdeathComponent, CmevacuationzoneComponent, CmplaceofdeathComponent, CmsexualorientationComponent,
    CmconditionComponent, CmproblemComponent, CmgoalclassComponent, CmgoalComponent, CminterventionComponent, CmcareplanmatrixComponent,
    CmcareplanstatusComponent, CmcareplandurationComponent, CmbarriertypeComponent, CmstrengthtypeComponent, CmholidaysComponent, CmmedicationfrequencyComponent,
    CmmedicationrouteComponent, CmmedicationdosageunitsComponent, CmmedicationtypeComponent, CmmedicationreconciliationComponent, CmmedicationbarriertypeComponent,
    CmclinicalindicatorsComponent, AgcomplaintcategoryComponent, AgcomplaintclassComponent, AgcomplaintcredentialsComponent, AgcomplaintstatusreasonComponent,
    AgcomplaintsubcategoryComponent, AgcoordinatortypeComponent, AgparticipantroleComponent, AgparticipanttypeComponent,
    AgqocinvestigationoutcomeComponent, AgqocinvestigationreasonComponent, AgqocscoreComponent, AgresolutioncategoryComponent,
    AgresolutionsubcategoryComponent, MembercasedetailsComponent,

    UiDropdownComponent, UiMultiCheckDropdownComponent
  ],
  imports: [
    BrowserModule.withServerTransition({ appId: 'ng-cli-universal' }),
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule, AngularMaterialModule, SharedUiModule,
    RouterModule.forRoot([
      { path: '', component: LoginComponent, pathMatch: 'full' },
      { path: 'login', component: LoginComponent, pathMatch: 'full' },

      { path: 'counter', component: CounterComponent },
      { path: 'fetch-data', component: FetchDataComponent },
      { path: 'dashboard', component: DashBoardComponent },
      { path: 'header', component: HeaderComponent },
      { path: 'message', component: MessagesComponent },
      { path: 'footer', component: FooterComponent },
      {
        path: 'member-info/:id',
        component: MemberDetailsComponent,           // shell with sidebar
        children: [
          { path: '', pathMatch: 'full', component: MemberComponent, runGuardsAndResolvers: 'always' },        // tabs page
          { path: 'member-auth/:authNo', component: AuthorizationComponent, runGuardsAndResolvers: 'always' }, // full-page auth inside shell
          {
            path: 'case',
            loadChildren: () =>
              import('./casewizard/casewizard/casewizard.module').then(m => m.CaseWizardModule),
          },
        ]
      },
      { path: 'dash-mycase', component: MycaseloadComponent },
      { path: 'dash-assignauth', component: AssignedauthsComponent },
      { path: 'dash-requests', component: RequestsComponent },
      { path: 'dash-myactivities', component: MyactivitiesComponent },
      { path: 'dash-assigncomplaint', component: AssignedcomplaintsComponent },
      { path: 'dash-faxes', component: FaxesComponent },
      { path: 'dash-mdreview', component: MdreviewdashboardComponent },

      { path: 'member-alerts', component: MemberAlertsComponent },
      { path: 'member-careplan', component: MemberCareplanComponent },
      { path: 'member-careteam', component: MemberCareteamComponent },
      { path: 'member-caregiver', component: MemberCaregiverComponent },
      { path: 'member-document', component: MemberDocumentsComponent },
      { path: 'member-enrollment', component: MemberEnrollmentComponent },
      { path: 'member-notes', component: MemberNotesComponent },
      { path: 'member-program', component: MemberProgramComponent },
      { path: 'member-tasksummary', component: MemberTasksummaryComponent },
      { path: 'member-info', component: MemberInfoComponent },
      { path: 'member-auth', component: AuthorizationComponent },
      { path: 'member-auth/:authNo/:memberId', component: AuthorizationComponent },
      { path: 'member-decision/:id', component: DecisiondetailsComponent },
      { path: 'member-authdetails', component: AuthdetailsComponent },
      { path: 'member-um-validation', component: ValidationErrorDialogComponent },
      { path: 'member-decisionbulk', component: DecisionbulkdialogComponent },
      { path: 'member-mdreview', component: MdreviewComponent },
      { path: 'member-smartauthcheck', component: SmartauthcheckComponent },
      { path: 'member-journey', component: MemberJourneyComponent },
      { path: 'member-summaryai', component: MemberSummaryaiComponent },
      { path: 'member-activity', component: MemberActivityComponent },
      { path: 'member-search', component: MembersearchComponent },
      { path: 'member-case-details', component: MembercasedetailsComponent },

      { path: 'dash-newdash', component: NewDashBoardComponent },
      { path: 'dash-newdash2', component: NewDashboard2Component },
      { path: 'member-authdynamic', component: AuthdynamicComponent },
      { path: 'provider-search', component: ProviderSearchComponent },
      { path: 'member-authnotes', component: UmauthnotesComponent },
      { path: 'member-authdocs', component: UmauthdocumentsComponent },
      { path: 'member-authactivity', component: UmauthactivityComponent },
      { path: 'admin-config', component: ConfigurationComponent },
      { path: 'admin-user', component: UsermanagementComponent },
      { path: 'admin-role', component: RolemanagementComponent },
      { path: 'admin-profile', component: ProfilemanagementComponent },
      { path: 'admin-permission', component: PermissionManagerComponent },
      { path: 'admin-appfeature', component: AppfeaturesetupComponent },
      { path: 'admin-workgroup', component: WorkgroupComponent },
      { path: 'admin-workbasket', component: WorkbasketComponent },
      { path: 'admin-udcf', component: UserDefinedCustomFieldsComponent },
      { path: 'admin-templatebuilder', component: TemplatebuilderComponent },
      { path: 'admin-templatebuilderproperties', component: TemplatebuilderpropertiesComponent },

      { path: 'admin-umdocumenttype', component: UmdocumenttypeComponent },
      { path: 'admin-settingdialog', component: SettingsDialogComponent },
      { path: 'admin-umactivitytype', component: UmactivitytypeComponent },
      { path: 'admin-contentdialog', component: DialogContentComponent },
      { path: 'admin-umnotetype', component: UmnotetypeComponent },
      { path: 'admin-umclaimtype', component: UmclaimtypeComponent },
      { path: 'admin-umactivitypriority', component: UmactivitypriorityComponent },
      { path: 'admin-umadmissionlevel', component: UmadmissionlevelComponent },
      { path: 'admin-umadmissiontype', component: UmadmissiontypeComponent },
      { path: 'admin-umadmitreason', component: UmadmitreasonComponent },
      { path: 'admin-umcertificationtype', component: UmcertificationtypeComponent },
      { path: 'admin-umdenialtype', component: UmdenialtypeComponent },
      { path: 'admin-umdeterminationtype', component: UmdeterminationtypeComponent },
      { path: 'admin-umdischargeto', component: UmdischargetoComponent },
      { path: 'admin-umdischargetype', component: UmdischargetypeComponent },
      { path: 'admin-ummedicationfrequency', component: UmmedicationfrequencyComponent },
      { path: 'admin-umnotificationtype', component: UmnotificationtypeComponent },
      { path: 'admin-umoutofareaindicator', component: UmoutofareaindicatorComponent },
      { path: 'admin-umplaceofservice', component: UmplaceofserviceComponent },
      { path: 'admin-umprescriptionquantity', component: UmprescriptionquantityComponent },
      { path: 'admin-umqualityindicator', component: UmqualityindicatorComponent },
      { path: 'admin-umtransportationtriptype', component: UmtransportationtriptypeComponent },
      { path: 'admin-umtreatmenttype', component: UmtreatmenttypeComponent },
      { path: 'admin-umunittype', component: UmunittypeComponent },
      { path: 'admin-umdecisionstatuscode', component: UmdecisionstatuscodeComponent },
      { path: 'admin-umdenialreason', component: UmdenialreasonComponent },
      { path: 'admin-umauthtemplate', component: UmauthtemplateComponent },
      { path: 'admin-umauthstatusreason', component: UmauthstatusreasonComponent },
      { path: 'admin-umexternallink', component: ExternallinksComponent },
      { path: 'admin-umauthtemplatebuilder', component: UmauthtemplateBuilderComponent },
      { path: 'admin-umauthtemplateproperties', component: UmauthtemplateFieldPropertiesComponent },
      { path: 'admin-umvalidationdialog', component: ValidationDialogComponent },

      { path: 'admin-cmnotetype', component: CmnotetypeComponent },
      { path: 'admin-cmdocumenttype', component: CmdocumenttypeComponent },
      { path: 'admin-agnotetype', component: AgnotetypeComponent },
      { path: 'admin-agdocumenttype', component: AgdocumenttypeComponent },
      { path: 'admin-cmaddresstype', component: CmaddresstypeComponent },
      { path: 'admin-cmadvancedirectives', component: CmadvancedirectivesComponent },
      { path: 'admin-cmappointmenttype', component: CmappointmenttypeComponent },
      { path: 'admin-cmcauseofdeath', component: CmcauseofdeathComponent },
      { path: 'admin-cmevacuationzone', component: CmevacuationzoneComponent },
      { path: 'admin-cmplaceofdeath', component: CmplaceofdeathComponent },
      { path: 'admin-cmsexualorientation', component: CmsexualorientationComponent },
      { path: 'admin-cmcondition', component: CmconditionComponent },
      { path: 'admin-cmproblem', component: CmproblemComponent },
      { path: 'admin-cmgoalclass', component: CmgoalclassComponent },
      { path: 'admin-cmgoal', component: CmgoalComponent },
      { path: 'admin-cmintervention', component: CminterventionComponent },
      { path: 'admin-cmcareplanmatrix', component: CmcareplanmatrixComponent },
      { path: 'admin-cmcareplanstatus', component: CmcareplanstatusComponent },
      { path: 'admin-cmcareplanduration', component: CmcareplandurationComponent },
      { path: 'admin-cmbarriertype', component: CmbarriertypeComponent },
      { path: 'admin-cmstrengthtype', component: CmstrengthtypeComponent },
      { path: 'admin-cmholidays', component: CmholidaysComponent },
      { path: 'admin-cmmedicationfrequency', component: CmmedicationfrequencyComponent },
      { path: 'admin-cmmedicationroute', component: CmmedicationrouteComponent },
      { path: 'admin-cmmedicationdosageunits', component: CmmedicationdosageunitsComponent },
      { path: 'admin-cmmedicationtype', component: CmmedicationtypeComponent },
      { path: 'admin-cmmedicationreconciliation', component: CmmedicationreconciliationComponent },
      { path: 'admin-cmmedicationbarriertype', component: CmmedicationbarriertypeComponent },

      { path: 'admin-cmclinicalindicators', component: CmclinicalindicatorsComponent },
      { path: 'admin-agcomplaintcategory', component: AgcomplaintcategoryComponent },
      { path: 'admin-agcomplaintclass', component: AgcomplaintclassComponent },
      { path: 'admin-agcomplaintcredentials', component: AgcomplaintcredentialsComponent },
      { path: 'admin-agcomplaintstatusreason', component: AgcomplaintstatusreasonComponent },
      { path: 'admin-agcomplaintsubcategory', component: AgcomplaintsubcategoryComponent },
      { path: 'admin-agcoordinatortype', component: AgcoordinatortypeComponent },
      { path: 'admin-agparticipantrole', component: AgparticipantroleComponent },
      { path: 'admin-agparticipanttype', component: AgparticipanttypeComponent },
      { path: 'admin-agqocinvestigationoutcome', component: AgqocinvestigationoutcomeComponent },
      { path: 'admin-agqocinvestigationreason', component: AgqocinvestigationreasonComponent },
      { path: 'admin-agqocscore', component: AgqocscoreComponent },
      { path: 'admin-agresolutioncategory', component: AgresolutioncategoryComponent },
      { path: 'admin-agresolutionsubcategory', component: AgresolutionsubcategoryComponent },

      { path: 'admin-bre', component: BretestComponent },

      { path: 'ui-dropdown', component: UiDropdownComponent },
      { path: 'ui-multicheckdropdown', component: UiMultiCheckDropdownComponent },
      //{
      //  path: 'rulesengine',
      //  loadChildren: () =>
      //    import('src/app/admin/rulesengine/rulesengine.module').then(m => m.RulesEngineModule),
      //},
      {
        path: 'configuration',
        component: ConfigurationComponent,
        children: [
          {
            path: 'rulesengine',
            loadChildren: () =>
              import('src/app/admin/rulesengine/rulesengine.module').then(m => m.RulesEngineModule)
          }
        ]
      }


    ])
  ],
  providers: [SidenavService, DatePipe],
  bootstrap: [AppComponent],
  exports: []
})
export class AppModule { }

