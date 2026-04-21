import { Routes } from '@angular/router';
import { SearchComponent } from './search/search.component';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', component: SearchComponent },
  {
    path: 'account',
    loadComponent: () => import('./account/account.component').then(m => m.AccountComponent),
  },
  {
    path: 'watchlist',
    loadComponent: () => import('./watchlist/watchlist.component').then(m => m.WatchlistComponent),
    canActivate: [authGuard],
  },
  { path: '**', redirectTo: '' },
];
