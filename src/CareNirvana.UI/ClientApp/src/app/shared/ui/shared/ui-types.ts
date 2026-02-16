/**
 * ============================================================
 *  UI COMPONENT LIBRARY — SHARED TYPES & BASE
 *  Common interfaces, types, and abstract base for all controls
 * ============================================================
 */

/* ─── Shared Option interface (dropdown, listbox, radio, etc.) ─── */
export interface UiOption<T = any> {
  label: string;
  value: T;
  disabled?: boolean;
  group?: string;
  description?: string;
  icon?: string;
  /** Extra columns for multi-column dropdown */
  columns?: Record<string, string | number>;
}

/* ─── Validation message types ─── */
export type UiMessageType = 'error' | 'warning' | 'success' | 'hint';

export interface UiValidationMessage {
  type: UiMessageType;
  text: string;
}

/* ─── Control sizing ─── */
export type UiControlSize = 'sm' | 'md' | 'lg';

/* ─── Button variants ─── */
export type UiButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';

/* ─── Label mode ─── */
export type UiLabelMode = 'float' | 'static' | 'none';
