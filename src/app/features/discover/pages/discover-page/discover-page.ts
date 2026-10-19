import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map, type Subscription } from 'rxjs';
import { AuthApi, type AuthSession } from '../../../../core/auth-api';

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

interface MovieComment {
  id: string;
  name: string;
  text: string;
  date: string;
}

const genres = ['All films', 'Drama', 'Mystery', 'Comedy', 'Adventure', 'Thriller', 'Romance'];
const watchlistStorageKey = 'mosaic.watchlist.v1';
const authStorageKey = 'mosaic.auth.v1';

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

function normalizeComment(value: unknown, index: number): MovieComment {
  const comment = asRecord(value);
  return {
    id: asString(comment['_id'] ?? comment['id'], `comment-${index}`),
    name: asString(comment['name'], 'Movie fan'),
    text: asString(comment['text'] ?? comment['comment']),
    date: asString(comment['date'] ?? comment['createdAt']),
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

function unwrapComments(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  const record = asRecord(payload);
  for (const key of ['comments', 'results', 'data']) {
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

function isAuthSession(value: unknown): value is AuthSession {
  const session = asRecord(value);
  const user = asRecord(session['user']);
  return (
    typeof session['token'] === 'string' &&
    session['token'].length > 0 &&
    typeof user['id'] === 'string' &&
    typeof user['name'] === 'string' &&
    typeof user['email'] === 'string'
  );
}

function readSavedAuthSession(): AuthSession | null {
  try {
    const stored = window.localStorage.getItem(authStorageKey);
    if (!stored) {
      return null;
    }

    const session: unknown = JSON.parse(stored);
    return isAuthSession(session) ? session : null;
  } catch {
    return null;
  }
}

@Component({
  host: {
    '(document:keydown.escape)': 'closeOverlays()',
    '(document:click)': 'closeAccountMenuOnOutside($event)',
  },
  selector: 'app-discover-page',
  templateUrl: './discover-page.html',
})
export class DiscoverPage {
  private readonly http = inject(HttpClient);
  private readonly authApi = inject(AuthApi);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly savedMovieIds = signal(readSavedMovieIds());
  private commentsRequest?: Subscription;

  protected readonly genres = genres;
  protected readonly movies = signal<Movie[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal('');
  protected readonly search = signal('');
  protected readonly activeGenre = signal('All films');
  protected readonly sortByRating = signal(false);
  protected readonly showWatchlist = signal(false);
  protected readonly selectedMovie = signal<Movie | null>(null);
  protected readonly comments = signal<MovieComment[]>([]);
  protected readonly commentsLoading = signal(false);
  protected readonly commentLoading = signal(false);
  protected readonly commentName = signal('');
  protected readonly commentText = signal('');
  protected readonly commentError = signal('');
  protected readonly commentLoadError = signal('');
  protected readonly accountMenuOpen = signal(false);
  protected readonly authView = signal<'login' | 'register'>('login');
  protected readonly authSession = signal<AuthSession | null>(readSavedAuthSession());
  protected readonly authEmail = signal('');
  protected readonly authUsername = signal('');
  protected readonly authPassword = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly authError = signal('');
  protected readonly authSuccessMessage = signal('');
  protected readonly authLoading = signal(false);
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
    this.commentsRequest?.unsubscribe();
    this.selectedMovie.set(movie);
    this.comments.set([]);
    this.commentError.set('');
    this.commentLoadError.set('');
    this.commentsLoading.set(true);
    this.commentLoading.set(false);
    this.commentsRequest = this.http
      .get<unknown>('/api/comments', { params: { movieId: movie.id } })
      .pipe(
        map((payload) => unwrapComments(payload).map(normalizeComment)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (comments) => {
          if (this.selectedMovie()?.id === movie.id) {
            this.comments.set(comments);
          }
        },
        error: (error: unknown) => {
          if (this.selectedMovie()?.id === movie.id) {
            this.commentLoadError.set(
              error instanceof HttpErrorResponse
                ? `Request failed (${error.status}).`
                : 'Could not load comments.',
            );
            this.commentsLoading.set(false);
          }
        },
        complete: () => {
          if (this.selectedMovie()?.id === movie.id) {
            this.commentsLoading.set(false);
          }
        },
      });
  }

  protected submitComment(event: SubmitEvent): void {
    event.preventDefault();
    const movie = this.selectedMovie();
    const name = this.commentName().trim();
    const text = this.commentText().trim();
    if (!movie || !name || !text || this.commentLoading()) {
      return;
    }

    this.commentLoading.set(true);
    this.commentError.set('');
    this.http
      .post<unknown>('/api/comments', {
        movie_id: movie.id,
        name,
        text,
      })
      .pipe(
        map((payload) => {
          const record = asRecord(payload);
          return normalizeComment(record['comment'] ?? record, Date.now());
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (comment) => {
          if (this.selectedMovie()?.id === movie.id) {
            this.comments.update((current) => [comment, ...current]);
            this.commentText.set('');
          }
        },
        error: (error: unknown) => {
          if (this.selectedMovie()?.id === movie.id) {
            this.commentError.set(
              error instanceof HttpErrorResponse
                ? asString(asRecord(error.error)['error'], `Request failed (${error.status}).`)
                : 'Could not post your comment.',
            );
            this.commentLoading.set(false);
          }
        },
        complete: () => {
          if (this.selectedMovie()?.id === movie.id) {
            this.commentLoading.set(false);
          }
        },
      });
  }

  protected onCommentNameInput(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.commentName.set(event.target.value);
    }
  }

  protected onCommentTextInput(event: Event): void {
    if (event.target instanceof HTMLTextAreaElement) {
      this.commentText.set(event.target.value);
    }
  }

  protected commentDate(date: string): string {
    if (!date) {
      return 'Just now';
    }
    const timestamp = new Date(date);
    return Number.isNaN(timestamp.getTime()) ? 'Just now' : timestamp.toLocaleDateString();
  }

  protected closeMovie(): void {
    this.commentsRequest?.unsubscribe();
    this.selectedMovie.set(null);
  }

  protected closeOverlays(): void {
    this.closeMovie();
    this.accountMenuOpen.set(false);
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

  protected toggleAccountMenu(): void {
    this.accountMenuOpen.update((open) => !open);
    this.authError.set('');
  }

  protected closeAccountMenuOnOutside(event: MouseEvent): void {
    if (
      event.target instanceof Node &&
      !this.elementRef.nativeElement.querySelector('.account-menu')?.contains(event.target)
    ) {
      this.accountMenuOpen.set(false);
    }
  }

  protected onAuthInput(
    event: Event,
    field: 'email' | 'username' | 'password' | 'confirmPassword',
  ): void {
    if (!(event.target instanceof HTMLInputElement)) {
      return;
    }

    const value = event.target.value;
    if (field === 'email') {
      this.authEmail.set(value);
    } else if (field === 'username') {
      this.authUsername.set(value);
    } else if (field === 'password') {
      this.authPassword.set(value);
    } else {
      this.confirmPassword.set(value);
    }
  }

  protected switchAuthView(view: 'login' | 'register'): void {
    this.authView.set(view);
    this.authError.set('');
    this.authSuccessMessage.set('');
    this.authUsername.set('');
    this.authPassword.set('');
    this.confirmPassword.set('');
  }

  protected submitLogin(event: SubmitEvent): void {
    event.preventDefault();
    this.authLoading.set(true);
    this.authError.set('');
    this.authSuccessMessage.set('');
    this.authApi
      .login(this.authEmail().trim(), this.authPassword())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (session) => {
          this.authSession.set(session);
          this.authPassword.set('');
          this.confirmPassword.set('');
          this.accountMenuOpen.set(false);
          try {
            window.localStorage.setItem(authStorageKey, JSON.stringify(session));
          } catch {
            this.authError.set('You are signed in, but this browser could not save your session.');
            this.accountMenuOpen.set(true);
          }
        },
        error: (error: unknown) => {
          this.authError.set(error instanceof Error ? error.message : 'Could not sign in.');
          this.authLoading.set(false);
        },
        complete: () => this.authLoading.set(false),
      });
  }

  protected submitRegistration(event: SubmitEvent): void {
    event.preventDefault();
    this.authError.set('');
    this.authSuccessMessage.set('');
    const username = this.authUsername().trim();
    if (username.length < 4 || username.length > 25) {
      this.authError.set('Username must be between 4 and 25 characters.');
      return;
    }
    if (this.authPassword() !== this.confirmPassword()) {
      this.authError.set('Passwords do not match.');
      return;
    }

    this.authLoading.set(true);
    this.authApi
      .register(username, this.authEmail().trim(), this.authPassword())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.switchAuthView('login');
          this.authSuccessMessage.set('Account created successfully. Please log in.');
        },
        error: (error: unknown) => {
          this.authError.set(
            error instanceof Error ? error.message : 'Could not create your account.',
          );
          this.authLoading.set(false);
        },
        complete: () => this.authLoading.set(false),
      });
  }

  protected submitLogout(): void {
    const session = this.authSession();
    if (!session || this.authLoading()) {
      return;
    }

    this.authLoading.set(true);
    this.authError.set('');
    this.authApi
      .logout(session.token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: (error: unknown) => {
          this.finishLogout(
            `Signed out here, but the server could not end the session: ${
              error instanceof Error ? error.message : 'Request failed.'
            }`,
          );
        },
        complete: () => this.finishLogout(''),
      });
  }

  private finishLogout(message: string): void {
    this.authSession.set(null);
    try {
      window.localStorage.removeItem(authStorageKey);
    } catch {
      message = 'Signed out, but this browser could not clear the saved session.';
    }
    this.authError.set(message);
    this.authLoading.set(false);
  }
}
