import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

interface Movie {
  id: string;
  title: string;
  year: number;
  genres: string[];
  rating: number;
  runtime: number;
  plot: string;
  director: string;
  cast: string[];
  posterUrl: string;
}

const genres = ['All films', 'Drama', 'Mystery', 'Comedy', 'Adventure', 'Thriller', 'Romance'];
const watchlistStorageKey = 'mosaic.watchlist.v1';

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item)).filter(Boolean);
  }

  return typeof value === 'string'
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function normalizeMovie(value: unknown, index: number): Movie {
  const movie = asRecord(value);
  const imdb = asRecord(movie['imdb']);

  return {
    id: asString(movie['_id'] ?? movie['id'], `movie-${index}`),
    title: asString(movie['title'], 'Untitled film'),
    year: Number(movie['year']) || 0,
    genres: asStringArray(movie['genres'] ?? movie['genre']),
    rating: Number(imdb['rating'] ?? movie['rating'] ?? movie['vote_average']) || 0,
    runtime: Number(movie['runtime']) || 0,
    plot: asString(movie['fullplot'] ?? movie['plot'] ?? movie['overview']),
    director: asString(movie['director'] ?? asStringArray(movie['directors'])[0]),
    cast: asStringArray(movie['cast'] ?? movie['actors']),
    posterUrl: asString(
      movie['posterUrl'] ?? movie['poster_url'] ?? movie['poster'] ?? movie['image'],
    ),
  };
}

function unwrapMovies(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  const record = asRecord(payload);
  for (const key of ['movies', 'results', 'data']) {
    if (Array.isArray(record[key])) {
      return record[key];
    }
  }

  return [];
}

function readSavedMovieIds(): string[] {
  try {
    const stored = window.localStorage.getItem(watchlistStorageKey);
    if (!stored) {
      return [];
    }

    const savedIds: unknown = JSON.parse(stored);
    return Array.isArray(savedIds)
      ? savedIds.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}

@Component({
  host: {
    '(document:keydown.escape)': 'closeMovie()',
  },
  selector: 'app-discover-page',
  templateUrl: './discover-page.html',
})
export class DiscoverPage {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly savedMovieIds = signal(readSavedMovieIds());

  protected readonly genres = genres;
  protected readonly movies = signal<Movie[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal('');
  protected readonly search = signal('');
  protected readonly activeGenre = signal('All films');
  protected readonly sortByRating = signal(false);
  protected readonly showWatchlist = signal(false);
  protected readonly selectedMovie = signal<Movie | null>(null);
  protected readonly savedCount = computed(() => this.savedMovieIds().length);
  protected readonly featuredMovie = computed(() => this.movies()[0] ?? null);
  protected readonly filteredMovies = computed(() => {
    const term = this.search().trim().toLowerCase();
    const genre = this.activeGenre();
    const watchlist = this.showWatchlist();
    const savedIds = this.savedMovieIds();
    const sortByRating = this.sortByRating();

    return this.movies()
      .filter((movie) => {
        const matchesSearch =
          !term ||
          [movie.title, movie.director, ...movie.genres].some((value) =>
            value.toLowerCase().includes(term),
          );
        const matchesGenre = genre === 'All films' || movie.genres.includes(genre);
        const matchesWatchlist = !watchlist || savedIds.includes(movie.id);
        return matchesSearch && matchesGenre && matchesWatchlist;
      })
      .sort((first, second) =>
        sortByRating ? second.rating - first.rating : second.year - first.year,
      );
  });

  constructor() {
    effect(() => {
      try {
        window.localStorage.setItem(watchlistStorageKey, JSON.stringify(this.savedMovieIds()));
      } catch {
        return;
      }
    });
    this.loadMovies();
  }

  protected loadMovies(): void {
    this.isLoading.set(true);
    this.loadError.set('');

    this.http
      .get<unknown>('/api/movies', { params: { limit: '30' } })
      .pipe(
        map((payload) => unwrapMovies(payload).map(normalizeMovie)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (movies) => this.movies.set(movies),
        error: (error: unknown) => {
          this.isLoading.set(false);
          this.loadError.set(
            error instanceof HttpErrorResponse
              ? `Request failed (${error.status}).`
              : 'Could not load films.',
          );
        },
        complete: () => this.isLoading.set(false),
      });
  }

  protected setSearch(value: string): void {
    this.search.set(value);
  }

  protected onSearchInput(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.setSearch(event.target.value);
    }
  }

  protected showTopRated(): void {
    this.sortByRating.set(true);
    this.showWatchlist.set(false);
  }

  protected toggleSort(): void {
    this.sortByRating.update((enabled) => !enabled);
  }

  protected chooseGenre(genre: string): void {
    this.activeGenre.set(genre);
    this.showWatchlist.set(false);
  }

  protected toggleGenre(genre: string): void {
    this.activeGenre.set(this.activeGenre() === genre ? 'All films' : genre);
    this.showWatchlist.set(false);
  }

  protected toggleWatchlist(): void {
    this.showWatchlist.update((visible) => !visible);
  }

  protected toggleSaved(movieId: string): void {
    this.savedMovieIds.update((savedIds) =>
      savedIds.includes(movieId) ? savedIds.filter((id) => id !== movieId) : [...savedIds, movieId],
    );
  }

  protected openMovie(movie: Movie): void {
    this.selectedMovie.set(movie);
  }

  protected closeMovie(): void {
    this.selectedMovie.set(null);
  }

  protected closeOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeMovie();
    }
  }

  protected isSaved(movieId: string): boolean {
    return this.savedMovieIds().includes(movieId);
  }

  protected featuredBackground(movie: Movie): string {
    const image = movie.posterUrl ? `, url("${movie.posterUrl}")` : '';
    return `linear-gradient(90deg, rgba(18, 33, 29, .98) 0%, rgba(18, 33, 29, .88) 39%, rgba(18, 33, 29, .08) 100%)${image}`;
  }

  protected detailBackground(movie: Movie): string {
    return movie.posterUrl
      ? `linear-gradient(0deg, rgba(18, 25, 23, .97), rgba(18, 25, 23, .1)), url("${movie.posterUrl}")`
      : 'linear-gradient(0deg, rgba(18, 25, 23, .97), rgba(18, 25, 23, .1))';
  }
}
