import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { SupabaseService } from '../core/supabase.service';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [FormsModule, RouterLink, AsyncPipe],
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.css'],
})
export class AccountComponent {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly session$ = this.supabase.session$;

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

  async signOut(): Promise<void> {
    await this.supabase.signOut();
    this.router.navigate(['/']);
  }

  getUserInitials(): string {
    const email = this.supabase.currentUser?.email ?? '';
    if (!email) return '?';
    return email.slice(0, 2).toUpperCase();
  }

  getUserEmail(): string {
    return this.supabase.currentUser?.email ?? '';
  }

  switchMode(m: 'signin' | 'signup'): void {
    this.mode = m;
    this.error = '';
    this.successMessage = '';
  }
}
