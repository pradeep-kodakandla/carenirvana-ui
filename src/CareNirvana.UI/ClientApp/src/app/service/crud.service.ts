import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, forkJoin } from 'rxjs';
import { map, catchError, shareReplay, tap } from 'rxjs/operators';

export interface UiSmartOption { value: any; label: string; }

@Injectable({
  providedIn: 'root'
})


export class CrudService {
  private baseUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/configadmin'; // Change this to your deployed backend URL
  //private baseUrl = 'https://localhost:7201/api/configadmin';
  constructor(private http: HttpClient) { }

  getData(module: string, section?: string | null): Observable<any[]> {
    const httpOptions = {
      headers: new HttpHeaders({
        'Content-Type': 'application/json'
      })
    };

    const url = section ? `${this.baseUrl}/${module}/${section}` : `${this.baseUrl}/${module}`;

    return this.http.get<any>(url, httpOptions).pipe(
      map(response => {
        // console.log('API Response:', response);
        const items = Array.isArray(response) ? response : response.data || [];
        return items.filter((item: any) => item?.deletedOn == null);
      })
    );
  }

  getModuleData(module: string, section?: string | null): Observable<any> {
    const httpOptions = {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    };

    const hasSection = section != null && String(section).trim() !== '';
    const url = hasSection
      ? `${this.baseUrl}/${module}/${String(section).trim()}`
      : `${this.baseUrl}/${module}`;

    return this.http.get<any>(url, httpOptions).pipe(
      map((response) => {
        // ✅ If section not provided => return master JSON exactly as server returns it
        if (!hasSection) return response;

        // ✅ If section provided => return filtered list (your old behavior)
        const items = Array.isArray(response) ? response : (response?.data ?? response);
        const arr = Array.isArray(items) ? items : [];
        return arr.filter((item: any) => item?.deletedOn == null);
      })
    );
  }

  addData(module: string, section: string, entry: any): Observable<any> {
    entry.createdBy = 'current_user'; // Replace with actual user
    entry.createdOn = new Date().toISOString();
    return this.http.post<any>(`${this.baseUrl}/${module}/${section}`, entry);
  }


  updateData(module: string, section: string, id: number, entry: any): Observable<any> {
    entry.updatedBy = 'current_user'; // Replace with actual user
    entry.updatedOn = new Date().toISOString();

    return this.http.put<any>(`${this.baseUrl}/${module}/${section}/${id}`, entry);
  }

  deleteData(module: string, section: string, id: number, deletedBy: string): Observable<any> {
    const deletedOn = new Date().toISOString();
    return this.http.patch<any>(`${this.baseUrl}/${module}/${section}/${id}`, { deletedBy, deletedOn });
  }
}

@Injectable({ providedIn: 'root' })
export class DatasourceLookupService {
  private moduleCache = new Map<string, Observable<any>>();
  private optionsCache = new Map<string, UiSmartOption[] | null>();

  constructor(private crudService: CrudService) { }


  private getModuleMaster(module: string): Observable<any> {
    if (!this.moduleCache.has(module)) {
      console.log(`[dsLookup] Fetching master data for module: ${module}`);

      const req$ = this.crudService.getModuleData(module, null).pipe(
        tap((data) => {
          // helpful: show top-level keys (if it's an object)
          if (data && typeof data === 'object' && !Array.isArray(data)) {
            console.log(`[dsLookup] Top-level keys for ${module}:`, Object.keys(data).slice(0, 50));
          }
        }),
        catchError((err) => {
          console.error(`[dsLookup] Master data ERROR for ${module}:`, err);
          return of(null);
        }),
        shareReplay({ bufferSize: 1, refCount: false })
      );

      this.moduleCache.set(module, req$);
    }

    return this.moduleCache.get(module)!;
  }

  private getRowsFromMaster(master: any, datasource: string): any[] | null {
    if (!master || !datasource) return null;

    const ds = datasource.trim();
    const keysToTry = [
      ds,
      ds.toLowerCase(),
      ds.toUpperCase(),
      this.toCamelCase(ds),
      this.toPascalCase(ds),
      this.toSnakeCase(ds),
      this.toSnakeCase(ds).toUpperCase()
    ];

    for (const k of keysToTry) {
      const v = master?.[k];
      if (Array.isArray(v)) return v;
    }

    for (const k of keysToTry) {
      const v = master?.data?.[k];
      if (Array.isArray(v)) return v;
    }

    if (Array.isArray(master)) {
      for (const k of keysToTry) {
        const hit = master.find((x: any) =>
          String(x?.key ?? x?.name ?? x?.datasource ?? '').toLowerCase() === k.toLowerCase()
        );
        const arr = hit?.value ?? hit?.items ?? hit?.rows ?? hit?.data;
        if (Array.isArray(arr)) return arr;
      }
    }

    return null;
  }

  getRowsWithFallback(datasource: string, moduleOrder: string[] = ['AG', 'Admin', 'Provider', 'UM', 'CM']): Observable<any[] | null> {
    const ds = (datasource ?? '').trim();
    if (!ds) return of(null);

    return forkJoin(
      moduleOrder.reduce((acc, m) => {
        acc[m] = this.getModuleMaster(m);
        return acc;
      }, {} as Record<string, Observable<any>>)
    ).pipe(
      map((masters) => {
        for (const m of moduleOrder) {
          const rows = this.getRowsFromMaster(masters[m], ds);
          if (rows && rows.length) return rows;
        }
        return null;
      })
    );
  }

  getOptionsWithFallback(
    datasource: string,
    mapRowToOption: (r: any) => UiSmartOption,
    moduleOrder: string[] = ['AG', 'Admin', 'Provider']
  ): Observable<UiSmartOption[] | null> {

    const ds = (datasource ?? '').trim();
    if (!ds) return of(null);

    const cacheKey = `${moduleOrder.join('>')}|${ds.toLowerCase()}`;
    if (this.optionsCache.has(cacheKey)) return of(this.optionsCache.get(cacheKey)!);

    return this.getRowsWithFallback(ds, moduleOrder).pipe(
      map((rows) => {
        const opts = rows?.length ? rows.map(mapRowToOption) : null;
        this.optionsCache.set(cacheKey, opts);
        return opts;
      })
    );
  }

  private toCamelCase(s: string): string {
    const p = s.replace(/[_\s-]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''));
    return p.charAt(0).toLowerCase() + p.slice(1);
  }
  private toPascalCase(s: string): string {
    const c = this.toCamelCase(s);
    return c.charAt(0).toUpperCase() + c.slice(1);
  }
  private toSnakeCase(s: string): string {
    const c = this.toCamelCase(s);
    return c.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
  }
}
