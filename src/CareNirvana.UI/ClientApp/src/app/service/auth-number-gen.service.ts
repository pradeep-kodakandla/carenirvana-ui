import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AuthNumberService {

  private digits = '0123456789';
  private upperCase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  private lowerCase = 'abcdefghijklmnopqrstuvwxyz';
  private symbols = '!@#$%^&*()_+-=[]{}|;:",.<>?';

  constructor() { }

  /**
   * Generates a random auth number based on the given parameters.
   * @param length Number of characters in the auth number
   * @param includeDigits Include digits (0-9)
   * @param includeUpper Include uppercase letters (A-Z)
   * @param includeLower Include lowercase letters (a-z)
   * @param includeSymbols Include special symbols
   * @returns Generated Auth Number
   */
  generateAuthNumber(length: number, includeDigits = true, includeUpper = false, includeLower = false, includeSymbols = false): string {
    let charPool = '';
    if (includeDigits) charPool += this.digits;
    if (includeUpper) charPool += this.upperCase;
    if (includeLower) charPool += this.lowerCase;
    if (includeSymbols) charPool += this.symbols;

    if (!charPool) {
      throw new Error('At least one character type must be selected.');
    }

    return this.getRandomString(charPool, length);
  }

  private getRandomString(charPool: string, length: number): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charPool.length);
      result += charPool[randomIndex];
    }
    return result;
  }
}
