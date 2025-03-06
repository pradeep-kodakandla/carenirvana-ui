import { Injectable } from '@angular/core';

interface TemplateField {
  label: string;
  type: string;
  id: string;
  options?: string[];
}

type TemplateSection = TemplateField[] | Record<string, TemplateField[]>;

@Injectable({
  providedIn: 'root'
})
export class TemplateService {
  private masterTemplate: Record<string, TemplateSection> = {
    authDetails: [
      { label: "Request Dt", type: "datetime-local", id: "requestDatetime" },
      { label: "Expected Admission Datetime", type: "datetime-local", id: "expectedAdmissionDatetime" },
      { label: "Actual Admission Datetime", type: "datetime-local", id: "actualAdmissionDatetime" },
      { label: "Expected Dischare Datetime", type: "datetime-local", id: "expectedDischargeDatetime" },
      { label: "Number of Days", type: "number", id: "numberOfDays" },
      {
        label: "Admission Type",
        type: "select",
        id: "admissionType",
        options: ["Urgent", "Other"]
      },
      { label: "Transportation", type: "number", id: "customTransportation" },
      { label: "Transportation", type: "number", id: "customTransportation1" }
    ],
    providerDetails: [
      { label: "Provider Role", type: "text", id: "providerRole" },
      { label: "Provider Name", type: "text", id: "providerName" },
      { label: "Location", type: "text", id: "providerLocation" },
      { label: "Specialty", type: "text", id: "providerSpecialty" },
      { label: "Provider Id", type: "text", id: "providerId" },
      { label: "Phone", type: "text", id: "providerPhone" }
   ],
    diagnosisDetails: [
      { label: "ICD 10 Code", type: "text", id: "icd10Code" },
      { label: "ICD 10 Description", type: "text", id: "icd10Description" }
    ],
    serviceDetails: [
      { label: "Service Desc.", type: "text", id: "serviceDesc" },
      { label: "Service Code", type: "text", id: "serviceCode" },
      { label: "Modifier", type: "text", id: "modifier" },
      { label: "From Date", type: "datetime", id: "fromDate" },
      { label: "To Date", type: "datetime", id: "toDate" },
      { label: "Req.", type: "text", id: "serviceReq" },
      { label: "Appr.", type: "text", id: "serviceAppr" },
      { label: "Negotiated Rate", type: "text", id: "negotiatedRate" },
      { label: "Unit Type", type: "text", id: "unitType" },
      { label: "Request Provider", type: "text", id: "requestProvider" },
      { label: "Provider", type: "text", id: "serviceProvider" },
      { label: "Request Datetime", type: "datetime", id: "requestDatetime" }
    ],
    // ✅ New "Additional Details" Section with Multiple Subsections
    additionalDetails: {
      additionalInfo: [
        { label: "Date Indicator", type: "datetime-local", id: "dateIndicator" },
        { label: "Provider Name", type: "text", id: "providerName" },
        { label: "Member Name", type: "text", id: "memberName" }
      ],
      memberProviderInfo: [
        { label: "Member Verbal Notification Date", type: "datetime-local", id: "memberNotificationDate" },
        { label: "Provider Verbal Notification Date", type: "datetime-local", id: "providerNotificationDate" }
      ],
      icdInfo: [
        { label: "ICD 10 Code", type: "text", id: "icd10Code" },
        { label: "ICD 10 Description", type: "text", id: "icd10Description" }
      ],
      notes: [
        { label: "Additional Info Request Date", type: "datetime-local", id: "AddlInfoRequestDate" },
        { label: "Additional Info Received Date", type: "datetime-local", id: "AddlInfoReceivedDate" },
        { label: "Notes", type: "textarea", id: "text" }
      ]
    }
  };

  getMasterTemplate(): Record<string, TemplateSection> {
    return { ...this.masterTemplate };
  }

  saveTemplate(template: Record<string, TemplateSection>) {
    console.log('Saving template:', template);
    this.masterTemplate = { ...template };
  }
}
