import { Routes } from '@angular/router';
import { GraphComponent } from './graph/graph.component';
import { authGuard } from './core/auth.guard';
import { SearchComponent } from './search/search.component';

export const routes: Routes = [
  { path: '', component: GraphComponent },
  { path: 'classic', component: SearchComponent },
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
