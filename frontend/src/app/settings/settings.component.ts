import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../core/services/supabase.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly cdr = inject(ChangeDetectorRef);

  username = '';
  newPassword = '';
  confirmPassword = '';

  loading = false;
  message = '';
  error = '';
  isEditingName = false;
  selectedFile: File | null = null;
  avatarPreview: string | null = null;

  get user() {
    return this.supabase.currentUser;
  }

  get isGoogleLinked(): boolean {
    return this.user?.app_metadata?.['provider'] === 'google' ||
      this.user?.identities?.some(id => id.provider === 'google') || false;
  }

  ngOnInit(): void {
    this.username = this.user?.user_metadata?.['display_name'] || '';
    const avatarPath = this.user?.user_metadata?.['avatar_url'];
    if (avatarPath) {
      this.avatarPreview = this.supabase.getPublicUrl(avatarPath);
    }
  }

  getUserInitials(): string {
    if (this.username) {
      return this.username.slice(0, 2).toUpperCase();
    }
    const email = this.user?.email ?? '';
    return email.slice(0, 2).toUpperCase();
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      const reader = new FileReader();
      reader.onload = () => {
        this.avatarPreview = reader.result as string;
        this.cdr.markForCheck();
      };
      reader.readAsDataURL(file);
    }
  }

  async removeAvatar(): Promise<void> {
    this.loading = true;
    this.message = '';
    this.error = '';

    try {
      const { error } = await this.supabase.updateUser({
        data: {
          avatar_url: null
        }
      });

      if (error) throw error;
      
      this.avatarPreview = null;
      this.selectedFile = null;
      this.message = 'Avatar removed successfully!';
    } catch (err: any) {
      this.error = err.message || 'Failed to remove avatar.';
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  async updateProfile(): Promise<void> {
    if (this.username.includes(' ')) {
      this.error = 'Display name cannot contain spaces.';
      return;
    }

    this.loading = true;
    this.message = '';
    this.error = '';

    try {
      // Check uniqueness if name changed
      if (this.username !== this.user?.user_metadata?.['display_name']) {
        const isUnique = await this.supabase.isDisplayNameUnique(this.username);
        if (!isUnique) {
          this.error = 'This display name is already taken.';
          this.loading = false;
          this.cdr.markForCheck();
          return;
        }
      }

      let avatarUrl = this.user?.user_metadata?.['avatar_url'];

      if (this.selectedFile) {
        avatarUrl = await this.supabase.uploadAvatar(this.selectedFile);
      }

      const { error } = await this.supabase.updateUser({
        data: {
          display_name: this.username,
          avatar_url: avatarUrl
        }
      });

      if (error) throw error;
      this.message = 'Profile updated successfully!';
      this.isEditingName = false;
      this.selectedFile = null;
    } catch (err: any) {
      this.error = err.message || 'Failed to update profile.';
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  async updatePassword(): Promise<void> {
    if (this.newPassword !== this.confirmPassword) {
      this.error = 'Passwords do not match.';
      return;
    }

    this.loading = true;
    this.message = '';
    this.error = '';
    try {
      const { error } = await this.supabase.updateUser({
        password: this.newPassword
      });
      if (error) throw error;
      this.message = 'Password updated successfully!';
      this.newPassword = '';
      this.confirmPassword = '';
    } catch (err: any) {
      this.error = err.message || 'Failed to update password.';
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  async linkGoogle(): Promise<void> {
    try {
      await this.supabase.signInWithGoogle();
    } catch (err: any) {
      this.error = err.message || 'Failed to link Google account.';
      this.cdr.markForCheck();
    }
  }
}
