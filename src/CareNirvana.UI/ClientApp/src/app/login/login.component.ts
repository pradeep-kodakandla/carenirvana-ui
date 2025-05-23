import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthenticateService } from 'src/app/service/authentication.service';
import * as CryptoJS from 'crypto-js';


const secretKey = '0123456789ABCDEF'; // Must be kept secret!
const iv = CryptoJS.enc.Utf8.parse('encryptionIntVec'); // 16-byte IV


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

  constructor(private router: Router, private authService: AuthenticateService) {
    this.login = new FormGroup({
      username: new FormControl(null, [Validators.required, Validators.minLength(6)]),
      password: new FormControl(null, [Validators.required, Validators.minLength(6)])
    });
  }


  ngOnInit(): void { }

  submit() {
    if (this.login.valid && !this.isSubmitting) {
      this.isSubmitting = true;
      this.errorMessage = '';

      const { username, password } = this.login.value;
      const encrypted = CryptoJS.AES.encrypt(password, CryptoJS.enc.Utf8.parse(secretKey), { iv: iv });
      const encryptedPassword = encrypted.toString();

      this.authService.login(username, encryptedPassword).subscribe({
        next: (response) => {
          sessionStorage.setItem('loggedInUsername', username);
          this.router.navigate(['dash-board']);
        },
        error: (err) => {
          console.error('Login failed:', err);
          this.errorMessage = 'Invalid username or password';
        },
        complete: () => {
          this.isSubmitting = false;
        }
      });
    }
  }

}
