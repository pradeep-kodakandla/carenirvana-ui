import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-authdynamic',
  templateUrl: './authdynamic.component.html',
  styleUrls: ['./authdynamic.component.css']
})
export class AuthdynamicComponent implements OnInit {
  formData: any = {}; // Stores form data dynamically
  config: any; // JSON Configuration

  constructor() { }

  ngOnInit() {
    // Load JSON dynamically (API or local JSON)
    this.config = {
      authDetails: [
        { label: "Request Datetime", type: "datetime-local", id: "requestDatetime" },
        { label: "Expected Admission Datetime", type: "datetime-local", id: "expectedAdmissionDatetime" },
        { label: "Actual Admission Datetime", type: "datetime-local", id: "actualAdmissionDatetime" },
        { label: "Expected Dischare Datetime", type: "datetime-local", id: "expectedDischargeDatetime" },
        { label: "Number of Days", type: "number", id: "numberOfDays" },
        {
          label: "Admission Type",
          type: "select",
          id: "admissionType",
          options: ["Urgent", "Other"]
        }
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
      ]
    };

    // ✅ Initialize formData for each section with expanded = true (default open)
    for (let section in this.config) {
      this.formData[section] = { expanded: true, entries: [{}], primaryIndex: null };
    }
  }

  // ✅ Toggle section visibility
  toggleSection(section: string) {
    this.formData[section].expanded = !this.formData[section].expanded;
  }

  // ✅ Add a row **right below the clicked row**
  addEntry(section: string, index: number) {
    this.formData[section].entries.splice(index + 1, 0, {}); // Insert a new row right below
  }

  // ✅ Remove a row, ensuring at least one remains
  removeEntry(section: string, index: number) {
    if (this.formData[section].entries.length > 1) {
      this.formData[section].entries.splice(index, 1);
      if (this.formData[section].primaryIndex === index) {
        this.formData[section].primaryIndex = null; // Reset if removed row was selected as primary
      }
    }
  }

  // ✅ Set Primary Radio Button Selection
  setPrimary(section: string, index: number) {
    this.formData[section].primaryIndex = index;
  }

  // ✅ Save Form Data (Mock Save Example)
  saveData() {
    console.log("Form Data to Save:", JSON.stringify(this.formData, null, 2));
    alert("Form data saved successfully!");
  }
}
