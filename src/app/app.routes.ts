import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
    title: 'Dashboard',
  },
  {
    path: 'map',
    loadComponent: () => import('./features/map/map').then((m) => m.MapView),
    title: 'Karte',
  },
  {
    path: 'calculator',
    loadComponent: () => import('./features/calculator/calculator').then((m) => m.Calculator),
    title: 'Calculator',
  },
  {
    path: 'updates',
    loadComponent: () => import('./features/updates/updates').then((m) => m.UpdatesPage),
    title: 'Updates',
  },
  { path: '**', redirectTo: '' },
];
