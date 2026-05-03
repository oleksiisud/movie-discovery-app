import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../core/supabase.service';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.css'],
})
export class AccountComponent {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);

  readonly session$ = this.supabase.session$;

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
}
