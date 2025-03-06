import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { FormBuilder, FormGroup } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';

@Component({
  selector: 'app-provider-search',

  templateUrl: './provider-search.component.html',
  styleUrl: './provider-search.component.css'
})
export class ProviderSearchComponent {
  // Track which tab is selected if you want to switch programmatically
  selectedTabIndex = 0;

  // PCP search form
  pcpSearchForm: FormGroup;
  // Provider search form (similar structure to PCP)
  providerSearchForm: FormGroup;

  // Data sources for each table
  pcpDataSource = new MatTableDataSource<any>([]);
  providerDataSource = new MatTableDataSource<any>([]);

  // Columns to display in tables
  displayedColumns: string[] = ['select', 'providerName', 'providerLocation', 'providerSpeciality', 'providerId', 'providerPhone'];

  // Array to hold selected providers (for both PCP and Provider tabs)
  selectedProviders: any[] = [];

  constructor(
    public dialogRef: MatDialogRef<ProviderSearchComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private fb: FormBuilder
  ) {
    // Initialize the PCP form
    this.pcpSearchForm = this.fb.group({
      providerRole: [''],
      providerId: [''],
      providerName: [''],
      providerLocation: [''],
      providerSpeciality: ['']
    });

    // Initialize the Provider form
    this.providerSearchForm = this.fb.group({
      providerRole: [''],
      providerId: [''],
      providerName: [''],
      providerLocation: [''],
      providerSpeciality: ['']
    });
  }

  // --- PCP Tab Search ---
  onSearchPCP(): void {
    // Normally, you'd call a service to fetch data based on form values.
    // For demo, we mock data:
    const mockData = [
      { providerName: 'John Doe', providerLocation: 'New York', providerSpeciality: 'Cardiology', providerId: '101', providerPhone: '555-1010' },
      { providerName: 'Jane Smith', providerLocation: 'Boston', providerSpeciality: 'Dermatology', providerId: '102', providerPhone: '555-1020' },
    ];
    this.pcpDataSource.data = mockData;
  }

  // --- Provider Tab Search ---
  onSearchProvider(): void {
    // Similarly, fetch data via a service. Here, just mock again:
    const mockData = [
      { providerName: 'Michael Brown', providerLocation: 'Chicago', providerSpeciality: 'Neurology', providerId: '201', providerPhone: '555-2010' },
      { providerName: 'Lisa Taylor', providerLocation: 'San Francisco', providerSpeciality: 'Orthopedics', providerId: '202', providerPhone: '555-2020' },
    ];
    this.providerDataSource.data = mockData;
  }

  // Handle checkbox selection in the table
  onSelectProvider(provider: any, isChecked: boolean): void {
    if (isChecked) {
      this.selectedProviders.push(provider);
    } else {
      const index = this.selectedProviders.findIndex(p => p.providerId === provider.providerId);
      if (index > -1) {
        this.selectedProviders.splice(index, 1);
      }
    }
  }

  // "Load" button -> close dialog and return selected providers
  onLoad(): void {
    this.dialogRef.close(this.selectedProviders);
  }

  // "Cancel" button -> just close the dialog
  onCancel(): void {
    this.dialogRef.close();
  }

  // "Add New" form logic can be handled similarly in the third tab
  onAddNewProvider(): void {
    // You could have a separate form for "Add New" and push new provider into data
    // For example:
    // this.selectedProviders.push(newProviderFromForm);
  }
}
