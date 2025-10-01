export interface PriorAuth {
  source?: { template?: string; confidence?: number };
  review?: { type?: 'Non-Urgent' | 'Urgent' | 'Routine' | 'Emergency' | 'Initial' | 'Renewal' | 'Extension' | 'Amendment' | string; details?: string };
  patient?: { name?: string; memberId?: string; dob?: string; phone?: string; gender?: string; groupNumber?: string; address?: string };
  subscriber?: { name?: string };
  providerRequesting?: {
    name?: string; npi?: string; specialty?: string; phone?: string; fax?: string;
    contactName?: string; contactPhone?: string; address?: string;
  };
  providerServicing?: {
    name?: string; npi?: string; specialty?: string; phone?: string; fax?: string; address?: string; facility?: string;
  };
  pcp?: { name?: string; phone?: string; fax?: string };
  services?: Array<{
    description?: string; code?: string; startDate?: string; endDate?: string;
    diagnosisDescription?: string; diagnosisCode?: string; placeOfService?: string;
  }>;
  therapy?: { type?: string[]; sessions?: string; duration?: string; frequency?: string; other?: string };
  dme?: { items?: string; duration?: string; title19?: string; mdSignedOrder?: 'Yes' | 'No' };
  homeHealth?: { visits?: string; duration?: string; frequency?: string; mdSignedOrder?: 'Yes' | 'No'; nursingAssessment?: 'Yes' | 'No' };
  setting?: { inpatient?: boolean; outpatient?: boolean; office?: boolean; observation?: boolean; home?: boolean; daySurgery?: boolean; other?: string };
  submission?: { issuerName?: string; phone?: string; fax?: string; date?: string; prevAuthNumber?: string };
  dx?: { codes?: string[]; description?: string };
  visits?: { number?: string; extensionDate?: string; referBackToPCP?: boolean };
  otherLiability?: string;
  notes?: string;
}
