import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./layout/app-shell/app-shell').then((module) => module.AppShell),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/discover/pages/discover-page/discover-page').then(
            (module) => module.DiscoverPage,
          ),
      },
      {
        path: 'movies/:id',
        loadComponent: () =>
          import('./features/movies/pages/movie-detail-page/movie-detail-page').then(
            (module) => module.MovieDetailPage,
          ),
      },
      {
        path: 'watchlist',
        loadComponent: () =>
          import('./features/watchlist/pages/watchlist-page/watchlist-page').then(
            (module) => module.WatchlistPage,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
