export interface CaseUnsavedChangesAwareService {
  caseHasUnsavedChanges(): boolean;
  canLeaveStep?(): Promise<boolean>;
}
