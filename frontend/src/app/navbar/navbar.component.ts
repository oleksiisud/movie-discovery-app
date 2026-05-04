import { Component, inject, HostListener } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { SupabaseService } from '../core/services/supabase.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, AsyncPipe],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css'],
})
export class NavbarComponent {
  readonly supabase = inject(SupabaseService);
  readonly router = inject(Router);
  readonly session$ = this.supabase.session$;
  isDropdownOpen = false;

  getUserInitials(): string {
    const email = this.supabase.currentUser?.email ?? '';
    if (!email) return '';
    return email.slice(0, 2).toUpperCase();
  }

  toggleDropdown(event: Event) {
    event.stopPropagation();
    if (this.supabase.currentUser) {
      this.isDropdownOpen = !this.isDropdownOpen;
    } else {
      this.isDropdownOpen = false;
      this.router.navigate(['/login']);
    }
  }

  @HostListener('document:click')
  onDocumentClick() {
    if (this.isDropdownOpen) {
      this.isDropdownOpen = false;
    }
  }

  async logout() {
    this.isDropdownOpen = false;
    await this.supabase.signOut();
    this.router.navigate(['/']);
  }
}
