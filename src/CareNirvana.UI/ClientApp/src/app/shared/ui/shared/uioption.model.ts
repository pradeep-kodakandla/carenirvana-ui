export interface UiOption<T = any> {
  value: T;
  label: string;
  disabled?: boolean;
  meta?: Record<string, unknown>;
}
