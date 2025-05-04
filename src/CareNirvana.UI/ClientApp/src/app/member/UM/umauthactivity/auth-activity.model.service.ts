export interface AuthActivity {
  authActivityId?: number;
  authDetailId?: number;
  activityTypeId?: number;      // <-- New
  priorityId?: number;          // <-- New
  providerId?: number | null;   // <-- New
  referredTo?: number | null;   // <-- New
  scheduledDateTime?: string;
  dueDateTime?: string;
  comment?: string;
  statusId?: number;
  activeFlag?: boolean;
  createdBy?: number;
  createdOn?: Date;
  updatedBy?: number;
  updatedOn?: Date;
  deletedBy?: number;
  deletedOn?: Date;
  completedDate?: string;

  activityTypeLabel?: string;
  priorityLabel?: string;
}
