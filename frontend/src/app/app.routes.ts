import { Routes } from '@angular/router';
import { GraphComponent } from './search/graph.component';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', component: GraphComponent },
  { path: 'test', loadComponent: () => import('./test.component').then(m => m.TestComponent) },
  {
    path: 'login',
    loadComponent: () => import('./login/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'account',
    loadComponent: () => import('./account/account.component').then(m => m.AccountComponent),
    canActivate: [authGuard],
  },
  {
    path: 'watchlist',
    loadComponent: () => import('./watchlist/watchlist.component').then(m => m.WatchlistComponent),
    canActivate: [authGuard],
  },
  {
    path: 'settings',
    loadComponent: () => import('./settings/settings.component').then(m => m.SettingsComponent),
    canActivate: [authGuard],
  },
  { path: '**', redirectTo: '' },
];
