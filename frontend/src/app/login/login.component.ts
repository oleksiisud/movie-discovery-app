import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService } from '../core/services/supabase.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  mode: 'signin' | 'signup' = 'signin';
  email = '';
  password = '';
  loading = false;
  error = '';
  successMessage = '';

  async submit(): Promise<void> {
    if (!this.email || !this.password) return;
    this.loading = true;
    this.error = '';
    this.successMessage = '';

    try {
      if (this.mode === 'signin') {
        const { error } = await this.supabase.signInWithEmail(this.email, this.password);
        if (error) throw error;
        this.router.navigate(['/']);
      } else {
        const { error } = await this.supabase.signUpWithEmail(this.email, this.password);
        if (error) throw error;
        this.successMessage = 'Account created! Check your email to confirm, then sign in.';
        this.mode = 'signin';
        this.password = '';
      }
    } catch (err: any) {
      this.error = err?.message ?? 'Something went wrong. Please try again.';
      this.cdr.markForCheck();
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  switchMode(m: 'signin' | 'signup'): void {
    this.mode = m;
    this.error = '';
    this.successMessage = '';
  }
}
