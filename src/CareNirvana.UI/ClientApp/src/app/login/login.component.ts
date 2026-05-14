import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators, FormBuilder } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthenticateService } from 'src/app/service/authentication.service';
import * as CryptoJS from 'crypto-js';
import { firstValueFrom } from 'rxjs';

const secretKey = '0123456789ABCDEF';
const iv = CryptoJS.enc.Utf8.parse('encryptionIntVec');

interface LoginContext {
  ip: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
}

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent implements OnInit {
  login: FormGroup;
  hide = true;
  errorMessage: string = '';
  isSubmitting = false;

  constructor(
    private router: Router,
    private authService: AuthenticateService,
    private fb: FormBuilder,
    private http: HttpClient
  ) {
    this.login = new FormGroup({
      username: new FormControl(null, [Validators.required, Validators.minLength(6)]),
      password: new FormControl(null, [Validators.required, Validators.minLength(6)])
    });
  }

  ngOnInit(): void { }

  // Get public IP from a free service
  private async getIpAddress(): Promise<string | null> {
    try {
      const response = await firstValueFrom(
        this.http.get<{ ip: string }>('https://api.ipify.org?format=json')
      );
      return response?.ip ?? null;
    } catch (err) {
      console.warn('Could not fetch IP:', err);
      return null;
    }
  }

  // Get geolocation via browser API (requires user permission)
  private getLocation(): Promise<{ latitude: number; longitude: number; accuracy: number } | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        }),
        (err) => {
          console.warn('Geolocation denied or failed:', err.message);
          resolve(null); // don't block login if user denies
        },
        { timeout: 5000, enableHighAccuracy: false }
      );
    });
  }

  private async gatherContext(): Promise<LoginContext> {
    const [ip, location] = await Promise.all([
      this.getIpAddress(),
      this.getLocation()
    ]);
    return {
      ip,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      accuracy: location?.accuracy ?? null,
    };
  }

  async submit() {
    if (this.login.valid && !this.isSubmitting) {
      this.isSubmitting = true;
      this.errorMessage = '';

      const { username, password } = this.login.value;
      const encrypted = CryptoJS.AES.encrypt(password, CryptoJS.enc.Utf8.parse(secretKey), { iv: iv });
      const encryptedPassword = encrypted.toString();

      // Gather IP + location before sending
      const context = await this.gatherContext();

      this.authService.login(username, encryptedPassword, context).subscribe({
        next: (response) => {
          sessionStorage.setItem('loggedInUsername', response.userName);
          sessionStorage.setItem('loggedInUserid', response.userId.toString());
          sessionStorage.setItem('authToken', response.token);
          this.router.navigate(['dashboard']);
        },
        error: (err) => {
          console.error('Login failed:', err);
          this.isSubmitting = false;
          this.errorMessage = 'Invalid username or password';
        },
        complete: () => {
          this.isSubmitting = false;
        }
      });
    }
  }
}
