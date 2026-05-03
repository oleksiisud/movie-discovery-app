import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from './supabase.service';

export const authGuard: CanActivateFn = async () => {
  const platformId = inject(PLATFORM_ID);
  // Allow SSR to pass through; auth is checked client-side
  if (!isPlatformBrowser(platformId)) return true;

  const supabase = inject(SupabaseService);
  const router = inject(Router);

  await supabase.sessionReady;
  return supabase.currentUser ? true : router.createUrlTree(['/login']);
};
