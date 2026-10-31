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

interface MoviePagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface MoviePage {
  movies: Movie[];
  pagination: MoviePagination;
}

type AdvancedSearchField =
  | 'title'
  | 'plot'
  | 'directors'
  | 'cast'
  | 'rated'
  | 'type'
  | 'yearMin'
  | 'yearMax'
  | 'runtimeMin'
  | 'runtimeMax'
  | 'imdbRatingMin'
  | 'imdbRatingMax'
  | 'metacriticMin'
  | 'metacriticMax';

type AdvancedSearchDraft = Record<AdvancedSearchField, string>;

interface AdvancedSearchFilters {
  title?: string;
  plot?: string;
  directors?: string;
  cast?: string;
  rated?: string;
  type?: string;
  yearMin?: number;
  yearMax?: number;
  runtimeMin?: number;
  runtimeMax?: number;
  imdbRatingMin?: number;
  imdbRatingMax?: number;
  metacriticMin?: number;
  metacriticMax?: number;
  sort?: 'title' | 'year' | 'runtime' | 'released' | 'metacritic' | 'imdbRating';
  order?: 'asc' | 'desc';
}

const allFilmsGenre = 'All films';
const moviesPerPage = 30;
const emptyAdvancedSearch: AdvancedSearchDraft = {
  title: '',
  plot: '',
  directors: '',
  cast: '',
  rated: '',
  type: '',
  yearMin: '',
  yearMax: '',
  runtimeMin: '',
  runtimeMax: '',
  imdbRatingMin: '',
  imdbRatingMax: '',
  metacriticMin: '',
  metacriticMax: '',
};
const movieSortOptions = [
  { value: 'year', label: 'Newest year' },
  { value: 'imdbRating', label: 'Top rated' },
  { value: 'title', label: 'Title' },
  { value: 'runtime', label: 'Runtime' },
  { value: 'released', label: 'Release date' },
  { value: 'metacritic', label: 'Metacritic score' },
] as const;
const emptyPagination: MoviePagination = {
  page: 1,
  limit: moviesPerPage,
  total: 0,
  pages: 0,
  hasNextPage: false,
  hasPrevPage: false,
};
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

function normalizeMoviePage(payload: unknown, requestedPage: number): MoviePage {
  const record = asRecord(payload);
  const rawPagination = record['pagination'];

  if (rawPagination === undefined) {
    if (Array.isArray(record['data'])) {
      throw new Error('The server returned an invalid movie list response.');
    }

    const movies = unwrapMovies(payload).map(normalizeMovie);
    const pages = movies.length > 0 ? 1 : 0;
    return {
      movies,
      pagination: {
        page: requestedPage,
        limit: moviesPerPage,
        total: movies.length,
        pages,
        hasNextPage: false,
        hasPrevPage: requestedPage > 1,
      },
    };
  }

  const pagination = asRecord(rawPagination);
  if (!Array.isArray(record['data'])) {
    throw new Error('The server returned an invalid movie list response.');
  }

  const { page, limit, total, pages, hasNextPage, hasPrevPage } = pagination;
  if (
    typeof page !== 'number' ||
    typeof limit !== 'number' ||
    typeof total !== 'number' ||
    typeof pages !== 'number' ||
    !Number.isInteger(page) ||
    !Number.isInteger(limit) ||
    !Number.isInteger(total) ||
    !Number.isInteger(pages) ||
    page < 1 ||
    limit < 1 ||
    total < 0 ||
    pages < 0 ||
    typeof hasNextPage !== 'boolean' ||
    typeof hasPrevPage !== 'boolean'
  ) {
    throw new Error('The server returned invalid movie pagination data.');
  }

  return {
    movies: record['data'].map(normalizeMovie),
    pagination: { page, limit, total, pages, hasNextPage, hasPrevPage },
  };
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
  private readonly failedPosterUrls = signal(new Set<string>());
  private commentsRequest?: Subscription;
  private moviesRequest?: Subscription;
  private searchTimeout?: number;

  protected readonly genres = signal<string[]>([]);
  protected readonly movieSortOptions = movieSortOptions;
  protected readonly visibleGenres = computed(() => {
    const searchTerm = this.genreSearch().trim().toLocaleLowerCase();
    return this.genres().filter((genre) => genre.toLocaleLowerCase().includes(searchTerm));
  });
  protected readonly genreOptions = computed(() => [allFilmsGenre, ...this.genres()]);
  protected readonly movies = signal<Movie[]>([]);
  protected readonly pagination = signal(emptyPagination);
  protected readonly currentPage = signal(1);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal('');
  protected readonly search = signal('');
  protected readonly genreSearch = signal('');
  protected readonly genresError = signal('');
  protected readonly activeGenres = signal<string[]>([]);
  protected readonly sortByRating = signal(false);
  protected readonly advancedSearchOpen = signal(false);
  protected readonly advancedSearchDraft = signal(emptyAdvancedSearch);
  protected readonly advancedFilters = signal<AdvancedSearchFilters>({});
  protected readonly advancedSearchError = signal('');
  protected readonly hasAdvancedFilters = computed(() =>
    Object.keys(this.advancedFilters()).some((key) => key !== 'sort' && key !== 'order'),
  );
  protected readonly selectedSort = computed(
    () => this.advancedFilters().sort ?? (this.sortByRating() ? 'imdbRating' : 'year'),
  );
  protected readonly selectedSortOrder = computed(
    () => this.advancedFilters().order ?? 'desc',
  );
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
    const watchlist = this.showWatchlist();
    const savedIds = this.savedMovieIds();

    return this.movies().filter((movie) => !watchlist || savedIds.includes(movie.id));
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.searchTimeout !== undefined) {
        window.clearTimeout(this.searchTimeout);
      }
    });
    effect(() => {
      try {
        window.localStorage.setItem(watchlistStorageKey, JSON.stringify(this.savedMovieIds()));
      } catch {
        return;
      }
    });
    this.loadGenres();
    this.loadMovies();
  }

  private loadGenres(): void {
    this.http
      .get<unknown>('/api/movies/genres')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (payload) => {
          const values = asRecord(payload)['genres'];
          if (
            !Array.isArray(values) ||
            !values.every((genre: unknown): genre is string => typeof genre === 'string')
          ) {
            this.genresError.set('The server returned an invalid genres response.');
            return;
          }

          this.genres.set(
            [...new Set(values.map((genre: string) => genre.trim()).filter(Boolean))].sort(
              (first, second) => first.localeCompare(second),
            ),
          );
          this.genresError.set('');
        },
        error: (error: unknown) => {
          this.genresError.set(
            error instanceof HttpErrorResponse
              ? `Could not load genres: Request failed (${error.status}).`
              : 'Could not load genres.',
          );
        },
      });
  }

  protected loadMovies(): void {
    if (this.searchTimeout !== undefined) {
      window.clearTimeout(this.searchTimeout);
      this.searchTimeout = undefined;
    }
    this.moviesRequest?.unsubscribe();
    this.isLoading.set(true);
    this.loadError.set('');
    this.movies.set([]);

    const selectedGenres = this.activeGenres();
    const page = this.currentPage();
    this.moviesRequest = this.http
      .get<unknown>('/api/movies', {
        params: {
          page: String(page),
          limit: String(moviesPerPage),
          sort: this.selectedSort(),
          order: this.selectedSortOrder(),
          ...(this.search().trim() ? { search: this.search().trim() } : {}),
          ...(selectedGenres.length > 0 ? { genres: selectedGenres.join(',') } : {}),
          ...this.advancedQueryParams(),
        },
      })
      .pipe(
        map((payload) => normalizeMoviePage(payload, page)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
          this.movies.set(result.movies);
          this.pagination.set(result.pagination);
          this.currentPage.set(result.pagination.page);
        },
        error: (error: unknown) => {
          this.isLoading.set(false);
          this.loadError.set(
            error instanceof HttpErrorResponse
              ? `Request failed (${error.status}).`
              : error instanceof Error
                ? error.message
                : 'Could not load films.',
          );
        },
        complete: () => this.isLoading.set(false),
      });
  }

  protected setSearch(value: string): void {
    this.search.set(value);
    if (this.searchTimeout !== undefined) {
      window.clearTimeout(this.searchTimeout);
    }
    this.searchTimeout = window.setTimeout(() => {
      this.searchTimeout = undefined;
      this.currentPage.set(1);
      this.loadMovies();
    }, 300);
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

  private advancedQueryParams(): Record<string, string> {
    const filters = this.advancedFilters();
    const params: Record<string, string> = {};
    for (const field of ['title', 'plot', 'directors', 'cast', 'rated', 'type'] as const) {
      const value = filters[field]?.trim();
      if (value) {
        params[field] = value;
      }
    }
    for (const field of [
      'yearMin',
      'yearMax',
      'runtimeMin',
      'runtimeMax',
      'imdbRatingMin',
      'imdbRatingMax',
      'metacriticMin',
      'metacriticMax',
    ] as const) {
      const value = filters[field];
      if (value !== undefined) {
        params[field] = String(value);
      }
    }
    return params;
  }

  protected updateAdvancedSearchField(field: AdvancedSearchField, value: string): void {
    this.advancedSearchDraft.update((draft) => ({ ...draft, [field]: value }));
    this.advancedSearchError.set('');
  }

  protected onAdvancedSearchInput(field: AdvancedSearchField, event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.updateAdvancedSearchField(field, event.target.value);
    }
  }

  protected submitAdvancedSearch(event: Event): void {
    event.preventDefault();
    const draft = this.advancedSearchDraft();
    const ranges = [
      ['yearMin', 'yearMax', 'Minimum year must be no greater than maximum year.'],
      ['runtimeMin', 'runtimeMax', 'Minimum runtime must be no greater than maximum runtime.'],
      [
        'imdbRatingMin',
        'imdbRatingMax',
        'Minimum IMDb rating must be no greater than maximum rating.',
      ],
      [
        'metacriticMin',
        'metacriticMax',
        'Minimum Metacritic score must be no greater than maximum score.',
      ],
    ] as const;
    for (const [minimumField, maximumField, message] of ranges) {
      const minimum = draft[minimumField];
      const maximum = draft[maximumField];
      if (minimum && maximum && Number(minimum) > Number(maximum)) {
        this.advancedSearchError.set(message);
        return;
      }
    }

    const filters: AdvancedSearchFilters = {
      sort: this.selectedSort(),
      order: this.selectedSortOrder(),
    };
    for (const field of ['title', 'plot', 'directors', 'cast', 'rated', 'type'] as const) {
      const value = draft[field].trim();
      if (value) {
        filters[field] = value;
      }
    }
    for (const field of [
      'yearMin',
      'yearMax',
      'runtimeMin',
      'runtimeMax',
      'imdbRatingMin',
      'imdbRatingMax',
      'metacriticMin',
      'metacriticMax',
    ] as const) {
      const value = draft[field];
      if (value !== '') {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) {
          this.advancedSearchError.set('Enter valid numbers for the range filters.');
          return;
        }
        filters[field] = numericValue;
      }
    }

    this.advancedSearchError.set('');
    this.advancedFilters.set(filters);
    this.currentPage.set(1);
    this.loadMovies();
  }

  protected clearAdvancedSearch(): void {
    this.advancedSearchDraft.set({ ...emptyAdvancedSearch });
    this.advancedSearchError.set('');
    this.advancedFilters.update((filters) => ({
      sort: filters.sort,
      order: filters.order,
    }));
    this.currentPage.set(1);
    this.loadMovies();
  }

  protected updateMovieSort(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) {
      return;
    }
    const value = event.target.value;
    const option = movieSortOptions.find((sortOption) => sortOption.value === value);
    if (!option) {
      return;
    }
    const sort = option.value;
    this.sortByRating.set(sort === 'imdbRating');
    this.advancedFilters.update((filters) => ({ ...filters, sort }));
    this.currentPage.set(1);
    this.loadMovies();
  }

  protected updateSortOrder(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) {
      return;
    }
    const value = event.target.value;
    if (value !== 'asc' && value !== 'desc') {
      return;
    }
    this.advancedFilters.update((filters) => ({ ...filters, order: value }));
    this.currentPage.set(1);
    this.loadMovies();
  }

  protected onGenreSearchInput(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.genreSearch.set(event.target.value);
    }
  }

  protected toggleGenre(genre: string): void {
    if (genre === allFilmsGenre) {
      this.activeGenres.set([]);
    } else {
      this.activeGenres.update((selected) =>
        selected.includes(genre)
          ? selected.filter((selectedGenre) => selectedGenre !== genre)
          : [...selected, genre],
      );
    }
    this.showWatchlist.set(false);
    this.currentPage.set(1);
    this.loadMovies();
  }

  protected goToPage(page: number): void {
    const pagination = this.pagination();
    if (this.isLoading() || page < 1 || page > pagination.pages) {
      return;
    }
    if (this.searchTimeout !== undefined) {
      window.clearTimeout(this.searchTimeout);
      this.searchTimeout = undefined;
      page = 1;
    }
    this.currentPage.set(page);
    this.loadMovies();
  }

  protected isGenreSelected(genre: string): boolean {
    return genre === allFilmsGenre
      ? this.activeGenres().length === 0
      : this.activeGenres().includes(genre);
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

  protected isPosterUnavailable(posterUrl: string): boolean {
    return this.failedPosterUrls().has(posterUrl);
  }

  protected onPosterError(event: Event): void {
    if (!(event.target instanceof HTMLImageElement)) {
      return;
    }
    const posterUrl = event.target.getAttribute('src');
    if (posterUrl) {
      this.failedPosterUrls.update((failedUrls) => new Set(failedUrls).add(posterUrl));
    }
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
