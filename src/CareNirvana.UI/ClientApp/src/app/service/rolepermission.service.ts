import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Module {
  moduleId: number;
  moduleName: string;
}

export interface FeatureGroup {
  featureGroupId: number;
  featureGroupName: string;
}

export interface Feature {
  featureId: number;
  featureName: string;
}

export interface Resource {
  featureResourceId: number;
  resourceId: number;
  resourceName: string;
  allowView: boolean;
  allowAdd: boolean;
  allowEdit: boolean;
  allowDelete: boolean;
  allowPrint: boolean;
  allowDownload: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class RolepermissionService {

  private baseUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/rolepermission'; // Change this to your deployed backend URL
  //private baseUrl = 'https://localhost:51346/api/rolepermission';

  constructor(private http: HttpClient) { }

  getModules(): Observable<{ moduleId: string, moduleName: string }[]> {
    return this.http.get<any[]>(`${this.baseUrl}/modules`).pipe(
      map(modules => (modules ?? []).map(m => ({
        moduleId: m.ModuleId.toString(),
        moduleName: m.ModuleName
      })))
    );
  }


  getFeatureGroups(moduleId: number): Observable<FeatureGroup[]> {
    return this.http.get<any[]>(`${this.baseUrl}/featuregroups/${moduleId}`).pipe(
      map(groups => (groups ?? []).map(g => ({
        featureGroupId: g.FeatureGroupId,
        featureGroupName: g.FeatureGroupName
      })))
    );
  }


  getFeatures(featureGroupId: number): Observable<Feature[]> {
    return this.http.get<any[]>(`${this.baseUrl}/features/${featureGroupId}`).pipe(
      map(features => (features ?? []).map(f => ({
        featureId: f.FeatureId,
        featureName: f.FeatureName
      })))
    );
  }


  getResources(featureId: number): Observable<Resource[]> {
    return this.http.get<any[]>(`${this.baseUrl}/resources/${featureId}`).pipe(
      map(resources => (resources ?? []).map(r => ({
        featureResourceId: r.FeatureResourceId,
        resourceId: r.ResourceId,
        resourceName: r.ResourceName,
        allowView: r.AllowView,
        allowAdd: r.AllowAdd,
        allowEdit: r.AllowEdit,
        allowDelete: r.AllowDelete,
        allowPrint: r.AllowPrint,
        allowDownload: r.AllowDownload
      })))
    );
  }

}
