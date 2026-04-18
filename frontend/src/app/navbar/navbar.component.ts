import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { SupabaseService } from '../core/supabase.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, AsyncPipe],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css'],
})
export class NavbarComponent {
  readonly supabase = inject(SupabaseService);
  readonly session$ = this.supabase.session$;

  getUserInitials(): string {
    const email = this.supabase.currentUser?.email ?? '';
    if (!email) return '';
    return email.slice(0, 2).toUpperCase();
  }
}
