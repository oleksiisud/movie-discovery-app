import { Routes } from '@angular/router';
import { SearchComponent } from './search/search.component';
import { authGuard } from './core/auth.guard';
import { TestComponent } from './test.component';

export const routes: Routes = [
  { path: '', component: SearchComponent },
  { path: 'test', component: TestComponent },
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
  { path: '**', redirectTo: '' },
];
