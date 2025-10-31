import { ControlValueAccessor } from '@angular/forms';

export abstract class ValueAccessorBase<T> implements ControlValueAccessor {
  protected _value!: T;
  protected isDisabled = false;
  protected onChange: (v: T) => void = () => { };
  protected onTouched: () => void = () => { };

  writeValue(value: T): void { this._value = value as T; }
  registerOnChange(fn: (v: T) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.isDisabled = disabled; }
}
