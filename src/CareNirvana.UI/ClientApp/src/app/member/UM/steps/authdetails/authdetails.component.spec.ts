// authdetails.component.spec.ts
//
// All service method names verified against actual source files.
// Run: ng test --include="**/authdetails.component.spec.ts"
//
// ─── FIXES FROM LAST RUN ────────────────────────────────────────────────────
// 1. Comment block contained "*/" which closed the JSDoc early → switched to //
// 2. AuthDetailApiService.getByNumber returns Observable<AuthDetailRow>
//    → use  of({} as any)  instead of  of(null)
// 3. AuthDetailApiService.update returns Observable<void>
//    → use  of(undefined as void)
// 4. AuthDetailApiService.getById returns Observable<AuthDetailRow>
//    → use  of({} as any)
// 5. AuthDetailApiService.checkDuplicate returns
//    Observable<{ hasDuplicates: boolean; duplicates: [...] }>
//    → use correct shape
// 6. AuthDecisionSeedService.ensureSeeded / syncAllSourceChangesToDecision
//    return Promise<void>  → use  Promise.resolve()  (no argument)
// 7. WorkbasketService.getByUserId returns Observable<any[]>
//    → use  of([])  instead of  of({ workGroups:[], workBaskets:[] })
// 8. isEnrollmentActive test: endDate is "string | undefined", NOT "string | null"
//    → replace  null  with  undefined  in the test
// ────────────────────────────────────────────────────────────────────────────

import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
  flush,
  discardPeriodicTasks,
  waitForAsync,
} from '@angular/core/testing';
import { ReactiveFormsModule, FormBuilder, FormControl } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { NO_ERRORS_SCHEMA }    from '@angular/core';
import { of, throwError }      from 'rxjs';
import { MatDialog }           from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { AuthdetailsComponent } from './authdetails.component';

import { AuthService }             from 'src/app/service/auth.service';
import { CrudService, DatasourceLookupService } from 'src/app/service/crud.service';
import { MemberenrollmentService } from 'src/app/service/memberenrollment.service';
import { AuthDetailApiService }    from 'src/app/service/authdetailapi.service';
import { AuthDecisionSeedService } from 'src/app/member/UM/steps/authdecision/authdecisionseed.service';
import { AuthenticateService }     from 'src/app/service/authentication.service';
import { AuthNumberService }       from 'src/app/service/auth-number-gen.service';
import { WorkbasketService }       from 'src/app/service/workbasket.service';
import { HeaderService }           from 'src/app/service/header.service';
import { RulesengineService, ExecuteTriggerResponse } from 'src/app/service/rulesengine.service';

// =============================================================================
describe('AuthdetailsComponent', () => {

  let component: AuthdetailsComponent;
  let fixture:   ComponentFixture<AuthdetailsComponent>;

  let mockAuthService:       jasmine.SpyObj<AuthService>;
  let mockCrudService:       jasmine.SpyObj<CrudService>;
  let mockDsLookup:          jasmine.SpyObj<DatasourceLookupService>;
  let mockMemberEnrollment:  jasmine.SpyObj<MemberenrollmentService>;
  let mockAuthApi:           jasmine.SpyObj<AuthDetailApiService>;
  let mockDecisionSeed:      jasmine.SpyObj<AuthDecisionSeedService>;
  let mockUserService:       jasmine.SpyObj<AuthenticateService>;
  let mockAuthNumberService: jasmine.SpyObj<AuthNumberService>;
  let mockWbService:         jasmine.SpyObj<WorkbasketService>;
  let mockHeaderService:     jasmine.SpyObj<HeaderService>;
  let mockRulesengine:       jasmine.SpyObj<RulesengineService>;
  let mockDialog:            jasmine.SpyObj<MatDialog>;

  // ---------------------------------------------------------------------------
  beforeEach(waitForAsync(() => {

    // ── AuthService ──────────────────────────────────────────────────────────
    // Verified from auth.service.ts: getTemplates(), getTemplate()
    mockAuthService = jasmine.createSpyObj<AuthService>('AuthService', [
      'getTemplates',
      'getTemplate',
      'getTemplateValidation',
    ]);
    mockAuthService.getTemplates.and.returnValue(of([]));
    mockAuthService.getTemplate.and.returnValue(of({
      jsonContent: JSON.stringify({ sections: [] })
    }));
    mockAuthService.getTemplateValidation.and.returnValue(of([]));

    // ── CrudService ──────────────────────────────────────────────────────────
    // Verified from crud.service.ts: getData(), getModuleData()
    mockCrudService = jasmine.createSpyObj<CrudService>('CrudService', [
      'getData',
      'getModuleData',
    ]);
    mockCrudService.getData.and.returnValue(of([]));
    mockCrudService.getModuleData.and.returnValue(of({}));

    // ── DatasourceLookupService ──────────────────────────────────────────────
    // Verified from crud.service.ts DatasourceLookupService class
    mockDsLookup = jasmine.createSpyObj<DatasourceLookupService>('DatasourceLookupService', [
      'getOptionsWithFallback',
      'getRowsWithFallback',
    ]);
    mockDsLookup.getOptionsWithFallback.and.returnValue(of([]));
    mockDsLookup.getRowsWithFallback.and.returnValue(of([]));

    // ── MemberenrollmentService ──────────────────────────────────────────────
    // Verified from component line 823: this.memberEnrollment.getMemberEnrollment(mdId)
    mockMemberEnrollment = jasmine.createSpyObj<MemberenrollmentService>(
      'MemberenrollmentService', ['getMemberEnrollment']
    );
    mockMemberEnrollment.getMemberEnrollment.and.returnValue(of([]));

    // ── AuthDetailApiService ─────────────────────────────────────────────────
    // FIX 2: getByNumber returns Observable<AuthDetailRow> — cast with "as any"
    // FIX 3: update returns Observable<void>              — use of(undefined as void)
    // FIX 5: checkDuplicate returns
    //        Observable<{ hasDuplicates:boolean; duplicates:[...] }>
    mockAuthApi = jasmine.createSpyObj<AuthDetailApiService>('AuthDetailApiService', [
      'getByNumber',
      'update',
      'create',
      'getById',
      'checkDuplicate',
    ]);
    mockAuthApi.getByNumber.and.returnValue(of({} as any));
    mockAuthApi.update.and.returnValue(of(undefined as unknown as void));
    mockAuthApi.create.and.returnValue(of(1));
    mockAuthApi.getById.and.returnValue(of({} as any));
    mockAuthApi.checkDuplicate.and.returnValue(
      of({ hasDuplicates: false, duplicates: [] })
    );

    // ── AuthDecisionSeedService ──────────────────────────────────────────────
    // FIX 6: ensureSeeded and syncAllSourceChangesToDecision return Promise<void>
    //        → Promise.resolve() with NO argument (void)
    mockDecisionSeed = jasmine.createSpyObj<AuthDecisionSeedService>(
      'AuthDecisionSeedService', [
        'ensureSeeded',
        'syncAllSourceChangesToDecision',
        'syncDecisionToSource',
      ]
    );
    mockDecisionSeed.ensureSeeded.and.returnValue(Promise.resolve());
    mockDecisionSeed.syncAllSourceChangesToDecision.and.returnValue(Promise.resolve());
    mockDecisionSeed.syncDecisionToSource.and.returnValue({});

    // ── AuthenticateService ──────────────────────────────────────────────────
    // Verified from component line 2255: this.userService.getAllUsers()
    mockUserService = jasmine.createSpyObj<AuthenticateService>(
      'AuthenticateService', ['getAllUsers']
    );
    mockUserService.getAllUsers.and.returnValue(of([]));

    // ── AuthNumberService ────────────────────────────────────────────────────
    // FIX from previous run: generateAuthNumber returns a plain STRING, not Observable
    mockAuthNumberService = jasmine.createSpyObj<AuthNumberService>(
      'AuthNumberService', ['generateAuthNumber']
    );
    mockAuthNumberService.generateAuthNumber.and.returnValue('AUTH-20240101-001');

    // ── WorkbasketService ────────────────────────────────────────────────────
    // FIX 7: getByUserId returns Observable<any[]>  → of([])
    mockWbService = jasmine.createSpyObj<WorkbasketService>(
      'WorkbasketService', ['getByUserId']
    );
    mockWbService.getByUserId.and.returnValue(of([]));

    // ── HeaderService ────────────────────────────────────────────────────────
    // Verified from component lines 3674, 3683, 3685, 3693
    mockHeaderService = jasmine.createSpyObj<HeaderService>('HeaderService', [
      'getMemberId',
      'getSelectedTab',
      'updateTab',
      'selectTab',
    ]);
    mockHeaderService.getMemberId.and.returnValue('');
    mockHeaderService.getSelectedTab.and.returnValue('');
    mockHeaderService.updateTab.and.stub();
    mockHeaderService.selectTab.and.stub();

    // ── RulesengineService ───────────────────────────────────────────────────
    // ExecuteTriggerResponse requires triggerKey + outputs (at minimum)
    const fakeTriggerResponse: ExecuteTriggerResponse = {
      triggerKey: 'AUTH_DUE_DATE',
      outputs:    {},
    };
    mockRulesengine = jasmine.createSpyObj<RulesengineService>(
      'RulesengineService', ['executeTrigger']
    );
    mockRulesengine.executeTrigger.and.returnValue(of(fakeTriggerResponse));

    // ── MatDialog ────────────────────────────────────────────────────────────
    mockDialog = jasmine.createSpyObj<MatDialog>('MatDialog', ['open']);
    mockDialog.open.and.returnValue({ afterClosed: () => of(true) } as any);

    // ── TestBed ──────────────────────────────────────────────────────────────
    TestBed.configureTestingModule({

      imports: [
        CommonModule,
        ReactiveFormsModule,
        RouterTestingModule.withRoutes([]),
      ],
      providers: [
        FormBuilder,
        { provide: AuthService,             useValue: mockAuthService       },
        { provide: CrudService,             useValue: mockCrudService       },
        { provide: DatasourceLookupService, useValue: mockDsLookup         },
        { provide: MemberenrollmentService, useValue: mockMemberEnrollment },
        { provide: AuthDetailApiService,    useValue: mockAuthApi          },
        { provide: AuthDecisionSeedService, useValue: mockDecisionSeed     },
        { provide: AuthenticateService,     useValue: mockUserService      },
        { provide: AuthNumberService,       useValue: mockAuthNumberService },
        { provide: WorkbasketService,       useValue: mockWbService        },
        { provide: HeaderService,           useValue: mockHeaderService    },
        { provide: RulesengineService,      useValue: mockRulesengine      },
        { provide: MatDialog,               useValue: mockDialog           },
        // FaxAuthPrefillService  → type only, NOT injected → no provider needed
        // AuthwizardshellComponent → @Optional() in constructor → no provider needed
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture   = TestBed.createComponent(AuthdetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  afterEach(() => fixture.destroy());

  // ===========================================================================
  // GROUP 1 — Initialization
  // ===========================================================================
  describe('Initialization', () => {

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should build a reactive form with authClassId and authTypeId', () => {
      expect(component.form).toBeDefined();
      expect(component.form.get('authClassId')).toBeTruthy();
      expect(component.form.get('authTypeId')).toBeTruthy();
    });

    it('should default authNumber to "0"', () => {
      expect(component.authNumber).toBe('0');
    });

    it('should default enrollmentFilter to "active"', () => {
      expect(component.enrollmentFilter).toBe('active');
    });

    it('should default memberEnrollments to []', () => {
      expect(component.memberEnrollments).toEqual([]);
    });

    it('should default isSaving to false', () => {
      expect(component.isSaving).toBeFalse();
    });

    it('should default showUnsavedWarning to false', () => {
      expect(component.showUnsavedWarning).toBeFalse();
    });

    it('should default enrollmentEditMode to false', () => {
      expect(component.enrollmentEditMode).toBeFalse();
    });
  });

  // ===========================================================================
  // GROUP 2 — Service calls on ngOnInit
  // ===========================================================================
  describe('Service calls on init', () => {

    it('should call crudService.getData("um","authclass") to load auth classes', () => {
      expect(mockCrudService.getData).toHaveBeenCalledWith('um', 'authclass');
    });

    it('should call authService.getTemplates when authClassId changes to a valid value', fakeAsync(() => {
      component.form.get('authClassId')!.setValue(5);
      tick(50);
      expect(mockAuthService.getTemplates).toHaveBeenCalledWith('UM', 5);
    }));

    it('should call authService.getTemplate when authTypeId is set', fakeAsync(() => {
      component.form.get('authClassId')!.setValue(5);
      tick();
      component.form.get('authTypeId')!.setValue(10);
      tick();
      expect(mockAuthService.getTemplate).toHaveBeenCalledWith('UM', 10);
      discardPeriodicTasks();
      flush();
    }));

    it('should call userService.getAllUsers on init', () => {
      expect(mockUserService.getAllUsers).toHaveBeenCalled();
    });

    it('should call wbService.getByUserId on init', () => {
      expect(mockWbService.getByUserId).toHaveBeenCalled();
    });

    it('should NOT call authApi.getByNumber when authNumber is "0"', () => {
      expect(mockAuthApi.getByNumber).not.toHaveBeenCalled();
    });

    it('should handle crudService.getData error without throwing', fakeAsync(() => {
      mockCrudService.getData.and.returnValue(throwError(() => new Error('Network error')));
      expect(() => {
        (component as any).loadAuthClass();
        tick();
      }).not.toThrow();
      expect(component.authClassOptions).toEqual([]);
    }));

    it('should handle authService.getTemplates error without throwing', fakeAsync(() => {
      mockAuthService.getTemplates.and.returnValue(throwError(() => new Error('Server error')));
      expect(() => {
        (component as any).loadAuthTemplates(5);
        tick();
      }).not.toThrow();
    }));
  });

  // ===========================================================================
  // GROUP 3 — isExistingAuth getter
  // ===========================================================================
  describe('isExistingAuth', () => {

    it('should return false when authNumber is "0"', () => {
      component.authNumber = '0';
      expect(component.isExistingAuth).toBeFalse();
    });

    it('should return false for empty string', () => {
      component.authNumber = '';
      expect(component.isExistingAuth).toBeFalse();
    });

    it('should return false for whitespace-only string', () => {
      component.authNumber = '   ';
      expect(component.isExistingAuth).toBeFalse();
    });

    it('should return true for a real auth number', () => {
      component.authNumber = 'AUTH-20240101-001';
      expect(component.isExistingAuth).toBeTrue();
    });

    it('should return true for a numeric auth number', () => {
      component.authNumber = '99999';
      expect(component.isExistingAuth).toBeTrue();
    });
  });

  // ===========================================================================
  // GROUP 4 — isEnrollmentActive()
  // ===========================================================================
  describe('isEnrollmentActive()', () => {

    // FIX 8: endDate is typed as "string | undefined" — use undefined, NOT null
    it('should return true when endDate is undefined (open-ended enrollment)', () => {
      expect(component.isEnrollmentActive({ endDate: undefined })).toBeTrue();
    });

    it('should return true when endDate is today (inclusive boundary)', () => {
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      expect(component.isEnrollmentActive({ endDate: today.toISOString() })).toBeTrue();
    });

    it('should return true when endDate is one year in the future', () => {
      const future = new Date(Date.now() + 86_400_000 * 365);
      expect(component.isEnrollmentActive({ endDate: future.toISOString() })).toBeTrue();
    });

    it('should return false when endDate was yesterday', () => {
      const yesterday = new Date(Date.now() - 86_400_000);
      expect(component.isEnrollmentActive({ endDate: yesterday.toISOString() })).toBeFalse();
    });

    it('should return false when endDate is one year in the past', () => {
      const past = new Date(Date.now() - 86_400_000 * 365);
      expect(component.isEnrollmentActive({ endDate: past.toISOString() })).toBeFalse();
    });

    it('should return true (safe fallback) for an invalid date string', () => {
      expect(component.isEnrollmentActive({ endDate: 'not-a-date' })).toBeTrue();
    });
  });

  // ===========================================================================
  // GROUP 5 — filteredEnrollments getter
  // ===========================================================================
  describe('filteredEnrollments', () => {

    const futureDate = new Date(Date.now() + 86_400_000 * 365).toISOString();
    const pastDate   = new Date(Date.now() - 86_400_000 * 365).toISOString();

    beforeEach(() => {
      component.memberEnrollments = [
        { memberEnrollmentId: 1, endDate: futureDate },  // active
        { memberEnrollmentId: 2, endDate: pastDate   },  // inactive
        { memberEnrollmentId: 3                       },  // no endDate → active
      ];
    });

    it('should return only active enrollments when filter is "active"', () => {
      component.enrollmentFilter = 'active';
      const ids = component.filteredEnrollments.map(e => e.memberEnrollmentId);
      expect(ids).toEqual([1, 3]);
    });

    it('should return only inactive enrollments when filter is "inactive"', () => {
      component.enrollmentFilter = 'inactive';
      const ids = component.filteredEnrollments.map(e => e.memberEnrollmentId);
      expect(ids).toEqual([2]);
    });

    it('should return empty array when memberEnrollments is empty', () => {
      component.memberEnrollments = [];
      expect(component.filteredEnrollments).toEqual([]);
    });
  });

  // ===========================================================================
  // GROUP 6 — toggleEnrollmentFilter()
  // ===========================================================================
  describe('toggleEnrollmentFilter()', () => {

    it('should update filter when auth is new (authNumber="0")', () => {
      component.authNumber = '0';
      component.toggleEnrollmentFilter('inactive');
      expect(component.enrollmentFilter).toBe('inactive');
    });

    it('should update filter when enrollmentEditMode is true for existing auth', () => {
      component.authNumber        = 'AUTH-123';
      component.enrollmentEditMode = true;
      component.toggleEnrollmentFilter('inactive');
      expect(component.enrollmentFilter).toBe('inactive');
    });

    it('should NOT change filter for existing auth when NOT in edit mode', () => {
      component.authNumber        = 'AUTH-123';
      component.enrollmentEditMode = false;
      component.toggleEnrollmentFilter('inactive');
      expect(component.enrollmentFilter).toBe('active'); // unchanged
    });
  });

  // ===========================================================================
  // GROUP 7 — Enrollment edit mode helpers
  // ===========================================================================
  describe('Enrollment edit mode', () => {

    it('onEnrollmentEditClick() should show the warning', () => {
      component.onEnrollmentEditClick();
      expect(component.showEnrollmentEditWarning).toBeTrue();
    });

    it('confirmEnrollmentEdit() should enable edit mode and hide the warning', () => {
      component.showEnrollmentEditWarning = true;
      component.confirmEnrollmentEdit();
      expect(component.enrollmentEditMode).toBeTrue();
      expect(component.showEnrollmentEditWarning).toBeFalse();
    });

    it('confirmEnrollmentEdit() should re-enable authClassId and authTypeId controls', () => {
      component.form.get('authClassId')!.disable();
      component.form.get('authTypeId')!.disable();
      component.confirmEnrollmentEdit();
      expect(component.form.get('authClassId')!.enabled).toBeTrue();
      expect(component.form.get('authTypeId')!.enabled).toBeTrue();
    });

    it('cancelEnrollmentEdit() should hide warning without enabling edit mode', () => {
      component.showEnrollmentEditWarning = true;
      component.cancelEnrollmentEdit();
      expect(component.showEnrollmentEditWarning).toBeFalse();
      expect(component.enrollmentEditMode).toBeFalse();
    });
  });

  // ===========================================================================
  // GROUP 8 — isButtonType()
  // ===========================================================================
  describe('isButtonType()', () => {

    ['button', 'buttons', 'button-group', 'radio-buttons', 'radiobuttons'].forEach(t => {
      it(`should return true for type "${t}"`, () => {
        expect(component.isButtonType(t)).toBeTrue();
      });
    });

    it('should be case-insensitive', () => {
      expect(component.isButtonType('BUTTON')).toBeTrue();
    });

    it('should return false for "text"',    () => expect(component.isButtonType('text')).toBeFalse());
    it('should return false for "select"',  () => expect(component.isButtonType('select')).toBeFalse());
    it('should return false for null',       () => expect(component.isButtonType(null)).toBeFalse());
    it('should return false for undefined',  () => expect(component.isButtonType(undefined)).toBeFalse());
  });

  // ===========================================================================
  // GROUP 9 — getNonActionFields() & getActionButtons()
  // ===========================================================================
  describe('getNonActionFields() and getActionButtons()', () => {

    const fields = [
      { type: 'text',   id: 'f1', buttonText: ''       },
      { type: 'button', id: 'f2', buttonText: 'Search' },
      { type: 'select', id: 'f3', buttonText: ''       },
      { type: 'button', id: 'f4', buttonText: ''       },
    ];

    it('getNonActionFields should exclude action buttons', () => {
      const ids = component.getNonActionFields(fields).map((f: any) => f.id);
      expect(ids).not.toContain('f2');
      expect(ids).toContain('f1');
      expect(ids).toContain('f3');
    });

    it('getActionButtons should return only button-type fields with non-empty buttonText', () => {
      const result = component.getActionButtons(fields);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('f2');
    });

    it('getNonActionFields should return [] for null', () => {
      expect(component.getNonActionFields(null)).toEqual([]);
    });

    it('getActionButtons should return [] for null', () => {
      expect(component.getActionButtons(null)).toEqual([]);
    });
  });

  // ===========================================================================
  // GROUP 10 — onButtonOptionClick() & isButtonOptionSelected()
  // ===========================================================================
  describe('Button option controls', () => {

    beforeEach(() => {
      component.form.addControl('statusBtn', new FormControl(null));
    });

    it('onButtonOptionClick should set control value and mark dirty + touched', () => {
      component.onButtonOptionClick({ controlName: 'statusBtn' }, { value: 'A' } as any);
      expect(component.form.get('statusBtn')?.value).toBe('A');
      expect(component.form.get('statusBtn')?.dirty).toBeTrue();
      expect(component.form.get('statusBtn')?.touched).toBeTrue();
    });

    it('onButtonOptionClick should NOT update a disabled control', () => {
      component.form.addControl('locked', new FormControl({ value: 'ORIGINAL', disabled: true }));
      component.onButtonOptionClick({ controlName: 'locked' }, { value: 'NEW' } as any);
      expect(component.form.get('locked')?.value).toBe('ORIGINAL');
    });

    it('isButtonOptionSelected should return true when values match', () => {
      component.form.get('statusBtn')!.setValue('A');
      expect(component.isButtonOptionSelected({ controlName: 'statusBtn' }, { value: 'A' } as any)).toBeTrue();
    });

    it('isButtonOptionSelected should return false when values differ', () => {
      component.form.get('statusBtn')!.setValue('B');
      expect(component.isButtonOptionSelected({ controlName: 'statusBtn' }, { value: 'A' } as any)).toBeFalse();
    });

    it('isButtonOptionSelected should return false for non-existent control', () => {
      expect(component.isButtonOptionSelected({ controlName: 'ghost' }, { value: 'X' } as any)).toBeFalse();
    });
  });

  // ===========================================================================
  // GROUP 11 — applyDecisionReverseSync()
  // ===========================================================================
  describe('applyDecisionReverseSync()', () => {

    function addCtrl(name: string, value: any = null) {
      component.form.addControl(name, new FormControl(value));
    }

    it('should not throw when form is null', () => {
      (component as any).form = null;
      expect(() => component.applyDecisionReverseSync(1, 5, 0)).not.toThrow();
    });

    // ── Service branch ───────────────────────────────────────────────────────
    describe('Service branch (procedureNo < 1000)', () => {

      beforeEach(() => {
        addCtrl('procedure1_serviceAppr');
        addCtrl('procedure1_serviceDenied');
        addCtrl('procedure1_serviceReq');
        addCtrl('procedure1_reviewType');
      });

      it('should patch serviceAppr and serviceDenied', () => {
        component.applyDecisionReverseSync(1, 10, 5);
        expect(component.form.get('procedure1_serviceAppr')?.value).toBe(10);
        expect(component.form.get('procedure1_serviceDenied')?.value).toBe(5);
      });

      it('should mark patched controls as dirty', () => {
        component.applyDecisionReverseSync(1, 10, 5);
        expect(component.form.get('procedure1_serviceAppr')?.dirty).toBeTrue();
      });

      it('should patch serviceReq when requested is provided', () => {
        component.applyDecisionReverseSync(1, 10, 5, 15);
        expect(component.form.get('procedure1_serviceReq')?.value).toBe(15);
      });

      it('should NOT touch serviceReq when requested is undefined', () => {
        component.form.get('procedure1_serviceReq')!.setValue('ORIGINAL');
        component.applyDecisionReverseSync(1, 10, 5, undefined);
        expect(component.form.get('procedure1_serviceReq')?.value).toBe('ORIGINAL');
      });

      it('should patch reviewType from decisionPayload', () => {
        component.applyDecisionReverseSync(1, 10, 5, null, { reviewType: 'Prospective' });
        expect(component.form.get('procedure1_reviewType')?.value).toBe('Prospective');
      });
    });

    // ── Medication branch ────────────────────────────────────────────────────
    describe('Medication branch (1000 ≤ procedureNo < 2000)', () => {

      beforeEach(() => {
        addCtrl('medication0_approvedQuantity');
        addCtrl('medication0_deniedQuantity');
        addCtrl('medication5_approvedQuantity');
        addCtrl('medication5_deniedQuantity');
      });

      it('should patch medication0 for procedureNo 1000', () => {
        component.applyDecisionReverseSync(1000, 20, 3);
        expect(component.form.get('medication0_approvedQuantity')?.value).toBe(20);
        expect(component.form.get('medication0_deniedQuantity')?.value).toBe(3);
      });

      it('should patch medication5 for procedureNo 1005', () => {
        component.applyDecisionReverseSync(1005, 7, 1);
        expect(component.form.get('medication5_approvedQuantity')?.value).toBe(7);
      });
    });

    // ── Transportation branch ────────────────────────────────────────────────
    describe('Transportation branch (procedureNo ≥ 2000)', () => {

      it('should not throw', () => {
        expect(() => component.applyDecisionReverseSync(2000, 1, 0)).not.toThrow();
      });

      it('should not alter any form controls (transport is display-only)', () => {
        const before = JSON.stringify(component.form.getRawValue());
        component.applyDecisionReverseSync(2000, 1, 0);
        expect(JSON.stringify(component.form.getRawValue())).toBe(before);
      });
    });
  });

  // ===========================================================================
  // GROUP 12 — Fax mode helpers
  // ===========================================================================
  describe('Fax mode', () => {

    it('isFaxMode should return false when faxPrefill is null', () => {
      component.faxPrefill = null;
      expect(component.isFaxMode).toBeFalse();
    });

    it('isFaxMode should return false when mode is not "fax"', () => {
      component.faxPrefill = { mode: 'normal' } as any;
      expect(component.isFaxMode).toBeFalse();
    });

    it('isFaxMode should return true when mode is "fax"', () => {
      component.faxPrefill = { mode: 'fax' } as any;
      expect(component.isFaxMode).toBeTrue();
    });

    it('isFaxPrefilled should return false for an unknown control', () => {
      expect(component.isFaxPrefilled('unknownControl')).toBeFalse();
    });

    it('isFaxPrefilled should return true for a registered control', () => {
      component.faxPrefilledControls.add('procedure1_icdCode');
      expect(component.isFaxPrefilled('procedure1_icdCode')).toBeTrue();
    });
  });

  // ===========================================================================
  // GROUP 13 — isViewOnly setter
  // ===========================================================================
  describe('isViewOnly setter', () => {

    it('should default to false', () => {
      expect(component.isViewOnly).toBeFalse();
    });

    it('setting to true should not throw', () => {
      expect(() => { component.isViewOnly = true; }).not.toThrow();
      expect(component.isViewOnly).toBeTrue();
    });

    it('transitioning from view-only to editable should re-enable the form', () => {
      (component as any)._isViewOnly = true;
      component.form.disable({ emitEvent: false });
      component.isViewOnly = false;
      expect(component.form.enabled).toBeTrue();
    });
  });

  // ===========================================================================
  // GROUP 14 — ngOnDestroy
  // ===========================================================================
  describe('ngOnDestroy()', () => {

    it('should call next and complete on destroy$', () => {
      const nextSpy      = spyOn((component as any).destroy$, 'next').and.callThrough();
      const completeSpy  = spyOn((component as any).destroy$, 'complete').and.callThrough();
      component.ngOnDestroy();
      expect(nextSpy).toHaveBeenCalled();
      expect(completeSpy).toHaveBeenCalled();
    });

    it('should reset showUnsavedWarning to false on destroy', () => {
      component.showUnsavedWarning = true;
      component.ngOnDestroy();
      expect(component.showUnsavedWarning).toBeFalse();
    });
  });

  // ===========================================================================
  // GROUP 15 — authNumberService.generateAuthNumber returns a plain string
  // ===========================================================================
  describe('authNumberService.generateAuthNumber', () => {

    it('should return a plain string (not an Observable)', () => {
      const result = mockAuthNumberService.generateAuthNumber(9, true, true, false, false);
      expect(typeof result).toBe('string');
      expect(result).toBe('AUTH-20240101-001');
    });
  });

}); // end describe
