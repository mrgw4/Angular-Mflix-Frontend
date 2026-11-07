import { HttpClient, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { DiscoverPage } from '../../../src/app/features/discover/pages/discover-page/discover-page';
import { AuthApi, type AuthSession } from '../../../src/app/core/auth-api';

const movieResponse = {
  data: [
    {
      _id: 'movie-123',
      title: 'The Quiet Between',
      year: 2025,
      genres: ['Drama', 'Mystery'],
      imdb: { rating: 8.7 },
      tomatoes: {
        viewer: { meter: 91, rating: 4.4, numReviews: 25000 },
        critic: { meter: 88, rating: 7.5, numReviews: 120 },
      },
      fullplot: 'A story from the backend.',
      directors: ['Mara Ellison'],
      cast: ['Nina Park'],
      poster: '',
    },
    {
      _id: 'movie-456',
      title: 'Moonlight',
      year: 2016,
      genres: ['Drama'],
      imdb: { rating: 7.4 },
      plot: 'A young man finds his way through life.',
      director: 'Barry Jenkins',
      cast: ['Trevante Rhodes'],
      posterUrl: 'https://example.test/moonlight.jpg',
    },
    {
      _id: 'movie-789',
      title: 'Arrival',
      year: 2016,
      genres: ['Thriller', 'Adventure'],
      imdb: { rating: 9.1 },
      overview: 'A linguist works to communicate with visitors from another world.',
      directors: ['Denis Villeneuve'],
      actors: 'Amy Adams, Jeremy Renner',
      poster_url: 'https://example.test/arrival.jpg',
    },
  ],
  pagination: {
    page: 1,
    limit: 30,
    total: 10001,
    pages: 334,
    hasNextPage: true,
    hasPrevPage: false,
  },
};

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function submit(form: HTMLFormElement): void {
  form.requestSubmit();
}

function movieTitles(fixture: ComponentFixture<DiscoverPage>): string[] {
  return Array.from(
    fixture.nativeElement.querySelectorAll('.movie-title') as NodeListOf<HTMLButtonElement>,
  ).map((button) => button.textContent?.trim() ?? '');
}

function flushGenresRequest(httpTesting: HttpTestingController): void {
  httpTesting.expectOne('/api/movies/genres').flush({
    genres: ['Mystery', 'Drama', 'Sci-Fi', 'Drama'],
  });
}

function flushMoviesRequest(
  httpTesting: HttpTestingController,
  response: object | unknown[] = movieResponse,
  genres: string[] = [],
  page = 1,
  search: string | null = null,
  sort = 'year',
  order = 'desc',
  queryParams: Record<string, string> = {},
): void {
  const request = httpTesting.expectOne(
    (candidate) =>
      candidate.url === '/api/movies' &&
      candidate.params.get('page') === String(page) &&
      candidate.params.get('limit') === '30' &&
      candidate.params.get('sort') === sort &&
      candidate.params.get('order') === order &&
      candidate.params.get('genres') === (genres.length > 0 ? genres.join(',') : null) &&
      candidate.params.get('search') === search &&
      Object.entries(queryParams).every(([key, value]) => candidate.params.get(key) === value),
  );
  if (!Array.isArray(response)) {
    const payload = response as Record<string, unknown>;
    const data = payload['data'];
    if (Array.isArray(data) && !('pagination' in payload)) {
      request.flush({
        ...payload,
        pagination: {
          page,
          limit: 30,
          total: data.length,
          pages: data.length > 0 ? 1 : 0,
          hasNextPage: false,
          hasPrevPage: page > 1,
        },
      });
      return;
    }
  }
  request.flush(response);
}

describe('DiscoverPage', () => {
  let fixture: ComponentFixture<DiscoverPage>;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    window.localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [DiscoverPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DiscoverPage);
    fixture.detectChanges();
    flushGenresRequest(httpTesting);
    flushMoviesRequest(httpTesting);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpTesting.verify();
    window.localStorage.clear();
  });

  it('shows the neutral poster placeholder when an image fails to load', () => {
    const poster = fixture.nativeElement.querySelector(
      'img[alt="Moonlight film still"]',
    ) as HTMLImageElement;
    poster.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('img[alt="Moonlight film still"]')).toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        '[role="img"][aria-label="Moonlight poster unavailable"]',
      ),
    ).toBeTruthy();
  });

  it('uses poster images in featured and detail backgrounds when available', () => {
    const movies = fixture.componentInstance['movies']();
    expect(movies[1].posterUrl).toContain('moonlight.jpg');
    expect(fixture.componentInstance['featuredBackground'](movies[1])).toContain(
      'url("https://example.test/moonlight.jpg")',
    );
    expect(fixture.componentInstance['detailBackground'](movies[1])).toContain(
      'url("https://example.test/moonlight.jpg")',
    );
    expect(fixture.componentInstance['featuredBackground'](movies[0])).not.toContain('url(');
    expect(fixture.componentInstance['detailBackground'](movies[0])).not.toContain('url(');
  });

  it('shows Rotten Tomatoes audience and critic details for a film', () => {
    const movieButton = fixture.nativeElement.querySelector(
      '.movie-title',
    ) as HTMLButtonElement;
    movieButton.click();
    httpTesting.expectOne(
      (request) =>
        request.url === '/api/comments' && request.params.get('movieId') === 'movie-123',
    ).flush({ comments: [] });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.tomatoes-score')?.textContent?.trim()).toBe(
      'RT 91%',
    );
    const detailText = fixture.nativeElement.querySelector('.film-facts')?.textContent ?? '';
    expect(detailText).toContain('91%');
    expect(detailText).toContain('4.4/5 · 25,000 ratings');
    expect(detailText).toContain('88% · 120 reviews');
    expect(detailText).toContain('7.5/10');
  });

  it('loads and posts comments from the film details dialog', () => {
    const viewButton = fixture.nativeElement.querySelector(
      'button[aria-label="View The Quiet Between"]',
    ) as HTMLButtonElement;
    viewButton.click();
    fixture.detectChanges();

    httpTesting.expectOne('/api/comments?movieId=movie-123').flush({
      data: [
        null,
        { _id: 'comment-1', name: 'Alex', text: 'A lovely film.' },
        {
          id: 'comment-legacy',
          name: null,
          comment: 'Loved the visuals.',
          date: 'not-a-date',
        },
        {
          id: 'comment-dated',
          name: 'Sam',
          text: 'A timeless story.',
          date: '2025-01-02T00:00:00.000Z',
        },
      ],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('A lovely film.');
    expect(fixture.nativeElement.textContent).toContain('Loved the visuals.');
    expect(fixture.nativeElement.textContent).toContain(
      new Date('2025-01-02T00:00:00.000Z').toLocaleDateString(),
    );

    setInputValue(
      fixture.nativeElement.querySelector('[aria-label="Your name"]') as HTMLInputElement,
      'Morgan',
    );
    setInputValue(
      fixture.nativeElement.querySelector('[aria-label="Your comment"]') as HTMLTextAreaElement,
      'The ending stayed with me.',
    );
    fixture.detectChanges();
    submit(fixture.nativeElement.querySelector('.comment-form') as HTMLFormElement);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.comment-submit')?.textContent).toContain(
      'Posting...',
    );

    const post = httpTesting.expectOne('/api/comments');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({
      movie_id: 'movie-123',
      name: 'Morgan',
      text: 'The ending stayed with me.',
    });
    post.flush({
      comment: {
        _id: 'comment-2',
        name: 'Morgan',
        text: 'The ending stayed with me.',
      },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('The ending stayed with me.');
  });

  it('registers, logs in, persists the session, and logs out', () => {
    const accountButton = fixture.nativeElement.querySelector(
      'button[aria-label="Open login menu"]',
    ) as HTMLButtonElement;
    accountButton.click();
    fixture.detectChanges();
    const accountSwitches = fixture.nativeElement.querySelectorAll(
      '.account-switch',
    ) as NodeListOf<HTMLButtonElement>;
    const createAccount = Array.from(accountSwitches).find((button) =>
      button.textContent?.includes('Create one'),
    ) as HTMLButtonElement;
    createAccount.click();
    fixture.detectChanges();

    setInputValue(
      fixture.nativeElement.querySelector('[autocomplete="username"]') as HTMLInputElement,
      'Jane Doe',
    );
    setInputValue(
      fixture.nativeElement.querySelector('[autocomplete="email"]') as HTMLInputElement,
      'jane@example.com',
    );
    const passwordInputs = fixture.nativeElement.querySelectorAll(
      'input[autocomplete="new-password"]',
    ) as NodeListOf<HTMLInputElement>;
    setInputValue(passwordInputs[0], 'correct-password');
    setInputValue(passwordInputs[1], 'correct-password');
    fixture.detectChanges();
    submit(fixture.nativeElement.querySelector('.account-form') as HTMLFormElement);

    const registration = httpTesting.expectOne('/api/users');
    expect(registration.request.body).toEqual({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'correct-password',
    });
    registration.flush(
      { message: 'User created successfully' },
      { status: 201, statusText: 'Created' },
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'Account created successfully. Please log in.',
    );

    setInputValue(
      fixture.nativeElement.querySelector('[autocomplete="current-password"]') as HTMLInputElement,
      'correct-password',
    );
    fixture.detectChanges();
    submit(fixture.nativeElement.querySelector('.account-form') as HTMLFormElement);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.account-action')?.textContent).toContain(
      'Signing in…',
    );

    const login = httpTesting.expectOne('/api/users/login');
    expect(login.request.body).toEqual({
      email: 'jane@example.com',
      password: 'correct-password',
    });
    login.flush({
      token: 'test-jwt',
      user: { id: 'user-1', name: 'Jane Doe', email: 'jane@example.com' },
    });
    fixture.detectChanges();
    expect(window.localStorage.getItem('mosaic.auth.v1')).toContain('test-jwt');
    (
      fixture.nativeElement.querySelector(
        'button[aria-label="Account menu for Jane Doe"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    const logoutButton = fixture.nativeElement.querySelector(
      '.account-dropdown .account-action',
    ) as HTMLButtonElement;
    logoutButton.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.account-action')?.textContent).toContain(
      'Signing out…',
    );
    const logout = httpTesting.expectOne('/api/users/logout');
    expect(logout.request.headers.get('Authorization')).toBe('Bearer test-jwt');
    logout.flush({ message: 'Logged out successfully' });
    fixture.detectChanges();
    expect(window.localStorage.getItem('mosaic.auth.v1')).toBeNull();
  });

  it('searches movies, filters by multiple backend genres, and searches available genres', () => {
    expect(movieTitles(fixture)).toEqual(['The Quiet Between', 'Moonlight', 'Arrival']);

    jasmine.clock().install();
    try {
      setInputValue(
        fixture.nativeElement.querySelector('[aria-label="Search movies"]') as HTMLInputElement,
        '  barry jenkins  ',
      );
      fixture.detectChanges();
      jasmine.clock().tick(300);
      fixture.detectChanges();
      flushMoviesRequest(
        httpTesting,
        {
          data: [movieResponse.data[1]],
          pagination: {
            page: 1,
            limit: 30,
            total: 1,
            pages: 1,
            hasNextPage: false,
            hasPrevPage: false,
          },
        },
        [],
        1,
        'barry jenkins',
      );
      fixture.detectChanges();
      expect(movieTitles(fixture)).toEqual(['Moonlight']);

      setInputValue(
        fixture.nativeElement.querySelector('[aria-label="Search movies"]') as HTMLInputElement,
        '',
      );
      fixture.detectChanges();
      jasmine.clock().tick(300);
      fixture.detectChanges();
      flushMoviesRequest(httpTesting, movieResponse);
      fixture.detectChanges();
    } finally {
      jasmine.clock().uninstall();
    }

    const genrePill = (name: string): HTMLButtonElement =>
      Array.from(
        fixture.nativeElement.querySelectorAll('.genre-pill') as NodeListOf<HTMLButtonElement>,
      ).find((button) => button.textContent?.trim() === name) as HTMLButtonElement;

    genrePill('Drama').click();
    fixture.detectChanges();
    flushMoviesRequest(
      httpTesting,
      {
        data: movieResponse.data.filter((movie) => movie.genres.includes('Drama')),
      },
      ['Drama'],
    );
    fixture.detectChanges();
    expect(movieTitles(fixture)).toEqual(['The Quiet Between', 'Moonlight']);

    genrePill('Mystery').click();
    fixture.detectChanges();
    flushMoviesRequest(
      httpTesting,
      {
        data: [
          {
            _id: 'backend-only',
            title: 'Backend-only mystery',
            year: 2024,
            genres: ['Drama', 'Mystery'],
            imdb: { rating: 8.2 },
          },
        ],
      },
      ['Drama', 'Mystery'],
    );
    fixture.detectChanges();
    expect(movieTitles(fixture)).toEqual(['Backend-only mystery']);
    expect(genrePill('Drama').getAttribute('aria-pressed')).toBe('true');
    expect(genrePill('Mystery').getAttribute('aria-pressed')).toBe('true');

    genrePill('All films').click();
    fixture.detectChanges();
    flushMoviesRequest(httpTesting);
    fixture.detectChanges();
    expect(movieTitles(fixture)).toEqual(['The Quiet Between', 'Moonlight', 'Arrival']);

    genrePill('Sci-Fi').click();
    fixture.detectChanges();
    flushMoviesRequest(
      httpTesting,
      {
        data: [
          {
            _id: 'backend-only-sci-fi',
            title: 'Backend-only science fiction',
            year: 2023,
            genres: ['Sci-Fi'],
            imdb: { rating: 7.8 },
          },
        ],
      },
      ['Sci-Fi'],
    );
    fixture.detectChanges();
    expect(movieTitles(fixture)).toEqual(['Backend-only science fiction']);

    setInputValue(
      fixture.nativeElement.querySelector('[aria-label="Search genres"]') as HTMLInputElement,
      'sci',
    );
    fixture.detectChanges();
    const sidebarGenres = Array.from(
      fixture.nativeElement.querySelectorAll('.genre-nav .genre-link') as NodeListOf<HTMLButtonElement>,
    ).map((button) => button.textContent?.trim());
    expect(sidebarGenres).toEqual(['All films', 'Sci-Fi']);
    expect(genrePill('Sci-Fi')).toBeTruthy();

    const mysteryGenre = Array.from(
      fixture.nativeElement.querySelectorAll('.genre-link') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.trim() === 'Mystery') as HTMLButtonElement;
    expect(mysteryGenre).toBeUndefined();

    expect(
      fixture.nativeElement.querySelector('.side-nav')?.textContent,
    ).not.toContain('Top rated');
    expect(
      fixture.nativeElement.querySelector('.advanced-search-toggle')?.disabled,
    ).toBeFalse();
    expect(
      fixture.nativeElement.querySelector('[aria-label="Sort films"]')?.disabled,
    ).toBeFalse();
    expect(
      fixture.nativeElement.querySelector('[aria-label="Sort direction"]')?.disabled,
    ).toBeFalse();
  });

  it('applies advanced text and numeric filters to backend requests and clears them', () => {
    (
      fixture.nativeElement.querySelector('.advanced-search-toggle') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    const sortFilms = fixture.nativeElement.querySelector(
      '[aria-label="Sort films"]',
    ) as HTMLSelectElement;
    sortFilms.value = 'imdbRating';
    sortFilms.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    flushMoviesRequest(httpTesting, movieResponse, [], 1, null, 'imdbRating');
    fixture.detectChanges();

    sortFilms.value = 'tomatoesMeter';
    sortFilms.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    flushMoviesRequest(httpTesting, movieResponse, [], 1, null, 'tomatoesMeter');
    fixture.detectChanges();

    sortFilms.value = 'tomatoesRating';
    sortFilms.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    flushMoviesRequest(httpTesting, movieResponse, [], 1, null, 'tomatoesRating');
    fixture.detectChanges();

    sortFilms.value = 'imdbRating';
    sortFilms.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    flushMoviesRequest(httpTesting, movieResponse, [], 1, null, 'imdbRating');
    fixture.detectChanges();

    const sortDirection = fixture.nativeElement.querySelector(
      '[aria-label="Sort direction"]',
    ) as HTMLSelectElement;
    sortDirection.value = 'asc';
    sortDirection.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    flushMoviesRequest(httpTesting, movieResponse, [], 1, null, 'imdbRating', 'asc');
    fixture.detectChanges();

    setInputValue(
      fixture.nativeElement.querySelector('[placeholder="Film title"]') as HTMLInputElement,
      '  Arrival  ',
    );
    setInputValue(
      fixture.nativeElement.querySelector('[aria-label="Release year from"]') as HTMLInputElement,
      '2000',
    );
    setInputValue(
      fixture.nativeElement.querySelector('[aria-label="Maximum runtime"]') as HTMLInputElement,
      '150',
    );
    setInputValue(
      fixture.nativeElement.querySelector('[aria-label="Minimum IMDb rating"]') as HTMLInputElement,
      '7.5',
    );
    setInputValue(
      fixture.nativeElement.querySelector('[aria-label="Minimum Metacritic score"]') as HTMLInputElement,
      '50',
    );
    setInputValue(
      fixture.nativeElement.querySelector(
        '[aria-label="Minimum Rotten Tomatoes audience score"]',
      ) as HTMLInputElement,
      '80',
    );
    setInputValue(
      fixture.nativeElement.querySelector(
        '[aria-label="Maximum Rotten Tomatoes audience rating"]',
      ) as HTMLInputElement,
      '4.5',
    );
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('.advanced-search-submit') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    flushMoviesRequest(
      httpTesting,
      {
        data: [movieResponse.data[2]],
        pagination: {
          page: 1,
          limit: 30,
          total: 1,
          pages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      },
      [],
      1,
      null,
      'imdbRating',
      'asc',
      {
        title: 'Arrival',
        yearMin: '2000',
        runtimeMax: '150',
        imdbRatingMin: '7.5',
        metacriticMin: '50',
        tomatoesMeterMin: '80',
        tomatoesRatingMax: '4.5',
      },
    );
    fixture.detectChanges();

    expect(movieTitles(fixture)).toEqual(['Arrival']);
    expect(fixture.nativeElement.textContent).toContain('Advanced filters applied');
    expect(fixture.nativeElement.querySelector('.result-count')?.textContent?.trim()).toBe(
      '1 FILMS',
    );

    (
      fixture.nativeElement.querySelector('.advanced-search-clear') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    flushMoviesRequest(httpTesting, movieResponse, [], 1, null, 'imdbRating', 'asc');
    fixture.detectChanges();
    expect(movieTitles(fixture)).toEqual(['The Quiet Between', 'Moonlight', 'Arrival']);
    expect(fixture.nativeElement.textContent).not.toContain('Advanced filters applied');
  });

  it('validates advanced numeric ranges before sending a request', () => {
    (
      fixture.nativeElement.querySelector('.advanced-search-toggle') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    setInputValue(
      fixture.nativeElement.querySelector('[aria-label="Release year from"]') as HTMLInputElement,
      '2025',
    );
    setInputValue(
      fixture.nativeElement.querySelector('[aria-label="Release year to"]') as HTMLInputElement,
      '2000',
    );
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('.advanced-search-submit') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.advanced-search-error')?.textContent).toContain(
      'Minimum year must be no greater than maximum year.',
    );
    httpTesting.expectNone((request) => request.url === '/api/movies');

    const component = fixture.componentInstance;
    const draft = component['advancedSearchDraft']();
    component['advancedSearchDraft'].set({
      ...draft,
      yearMin: '',
      yearMax: '',
      runtimeMin: '200',
      runtimeMax: '100',
    });
    component['submitAdvancedSearch'](new Event('submit'));
    expect(component['advancedSearchError']()).toBe(
      'Minimum runtime must be no greater than maximum runtime.',
    );

    component['advancedSearchDraft'].update((current) => ({
      ...current,
      runtimeMin: '',
      runtimeMax: '',
      imdbRatingMin: '9',
      imdbRatingMax: '4',
    }));
    component['submitAdvancedSearch'](new Event('submit'));
    expect(component['advancedSearchError']()).toBe(
      'Minimum IMDb rating must be no greater than maximum rating.',
    );

    component['advancedSearchDraft'].update((current) => ({
      ...current,
      imdbRatingMin: '',
      imdbRatingMax: '',
      metacriticMin: '80',
      metacriticMax: '20',
    }));
    component['submitAdvancedSearch'](new Event('submit'));
    expect(component['advancedSearchError']()).toBe(
      'Minimum Metacritic score must be no greater than maximum score.',
    );

    component['advancedSearchDraft'].update((current) => ({
      ...current,
      metacriticMin: '',
      metacriticMax: '',
      tomatoesMeterMin: '90',
      tomatoesMeterMax: '80',
    }));
    component['submitAdvancedSearch'](new Event('submit'));
    expect(component['advancedSearchError']()).toBe(
      'Minimum Rotten Tomatoes audience score must be no greater than maximum score.',
    );

    component['advancedSearchDraft'].update((current) => ({
      ...current,
      tomatoesMeterMin: '',
      tomatoesMeterMax: '',
      tomatoesRatingMin: '4.5',
      tomatoesRatingMax: '4',
    }));
    component['submitAdvancedSearch'](new Event('submit'));
    expect(component['advancedSearchError']()).toBe(
      'Minimum Rotten Tomatoes audience rating must be no greater than maximum rating.',
    );

    component['advancedSearchDraft'].update((current) => ({
      ...current,
      tomatoesRatingMin: '',
      tomatoesRatingMax: '',
      yearMin: 'not-a-number',
    }));
    component['submitAdvancedSearch'](new Event('submit'));
    expect(component['advancedSearchError']()).toBe('Enter valid numbers for the range filters.');
    httpTesting.expectNone((request) => request.url === '/api/movies');
  });

  it('uses backend pagination metadata to navigate pages and show the total film count', () => {
    expect(fixture.nativeElement.querySelector('.result-count')?.textContent?.trim()).toBe(
      '10001 FILMS',
    );
    expect(fixture.nativeElement.querySelector('.pagination-controls')?.textContent).toContain(
      'Page 1 of 334',
    );
    const previous = fixture.nativeElement.querySelector(
      '.pagination-controls .page-button',
    ) as HTMLButtonElement;
    const next = fixture.nativeElement.querySelectorAll(
      '.pagination-controls .page-button',
    )[1] as HTMLButtonElement;
    expect(previous.disabled).toBeTrue();
    expect(next.disabled).toBeFalse();

    next.click();
    fixture.detectChanges();
    flushMoviesRequest(
      httpTesting,
      {
        data: [
          {
            _id: 'page-two-movie',
            title: 'A Film on Page Two',
            year: 2024,
            genres: ['Drama'],
            imdb: { rating: 8.1 },
          },
        ],
        pagination: {
          page: 2,
          limit: 30,
          total: 10001,
          pages: 334,
          hasNextPage: true,
          hasPrevPage: true,
        },
      },
      [],
      2,
    );
    fixture.detectChanges();
    expect(movieTitles(fixture)).toEqual(['A Film on Page Two']);
    expect(fixture.nativeElement.querySelector('.pagination-controls')?.textContent).toContain(
      'Page 2 of 334',
    );
    expect(
      (fixture.nativeElement.querySelector('.pagination-controls .page-button') as HTMLButtonElement)
        .disabled,
    ).toBeFalse();
    expect(
      (fixture.nativeElement.querySelectorAll(
        '.pagination-controls .page-button',
      )[1] as HTMLButtonElement).disabled,
    ).toBeFalse();

    (
      fixture.nativeElement.querySelector(
        '.pagination-controls .page-button',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    flushMoviesRequest(httpTesting, movieResponse);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pagination-controls')?.textContent).toContain(
      'Page 1 of 334',
    );
  });

  it('rejects invalid pages and restarts a pending search from page one', () => {
    fixture.componentInstance['goToPage'](0);
    fixture.componentInstance['goToPage'](335);
    httpTesting.expectNone((request) => request.url === '/api/movies');

    jasmine.clock().install();
    try {
      setInputValue(
        fixture.nativeElement.querySelector('[aria-label="Search movies"]') as HTMLInputElement,
        'Arr',
      );
      fixture.detectChanges();
      setInputValue(
        fixture.nativeElement.querySelector('[aria-label="Search movies"]') as HTMLInputElement,
        'Arrival',
      );
      fixture.detectChanges();
      fixture.componentInstance['loadMovies']();
      fixture.detectChanges();
      flushMoviesRequest(httpTesting, movieResponse, [], 1, 'Arrival');
      fixture.detectChanges();

      setInputValue(
        fixture.nativeElement.querySelector('[aria-label="Search movies"]') as HTMLInputElement,
        'Arrival now',
      );
      fixture.detectChanges();
      (
        fixture.nativeElement.querySelectorAll(
          '.pagination-controls .page-button',
        )[1] as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      flushMoviesRequest(httpTesting, movieResponse, [], 1, 'Arrival now');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.pagination-controls')?.textContent).toContain(
        'Page 1 of 334',
      );
    } finally {
      jasmine.clock().uninstall();
    }
  });

  it('ignores invalid sort events and allows deselecting a genre', () => {
    fixture.componentInstance['updateMovieSort'](new Event('change'));
    fixture.componentInstance['updateSortOrder'](new Event('change'));
    const sort = fixture.nativeElement.querySelector(
      '[aria-label="Sort films"]',
    ) as HTMLSelectElement;
    sort.value = 'not-a-sort';
    sort.dispatchEvent(new Event('change', { bubbles: true }));
    const order = fixture.nativeElement.querySelector(
      '[aria-label="Sort direction"]',
    ) as HTMLSelectElement;
    order.value = 'sideways';
    order.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    httpTesting.expectNone((request) => request.url === '/api/movies');

    const drama = Array.from(
      fixture.nativeElement.querySelectorAll('.genre-pill') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.trim() === 'Drama') as HTMLButtonElement;
    drama.click();
    fixture.detectChanges();
    flushMoviesRequest(httpTesting, movieResponse, ['Drama']);
    fixture.detectChanges();
    drama.click();
    fixture.detectChanges();
    flushMoviesRequest(httpTesting, movieResponse);
    fixture.detectChanges();
    expect(
      (Array.from(
        fixture.nativeElement.querySelectorAll('.genre-pill') as NodeListOf<HTMLButtonElement>,
      ).find((button) => button.textContent?.trim() === 'Drama') as HTMLButtonElement).getAttribute(
        'aria-pressed',
      ),
    ).toBe('false');
  });

  it('reports a movie response that is missing pagination metadata', () => {
    (
      Array.from(
        fixture.nativeElement.querySelectorAll('.genre-pill') as NodeListOf<HTMLButtonElement>,
      ).find((button) => button.textContent?.trim() === 'All films') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    httpTesting.expectOne((request) => request.url === '/api/movies').flush({
      data: movieResponse.data,
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'The server returned an invalid movie list response.',
    );
    expect(fixture.nativeElement.querySelector('.pagination-controls')).toBeNull();
  });

  it('reports malformed pagination metadata instead of rendering invalid page controls', () => {
    (
      Array.from(
        fixture.nativeElement.querySelectorAll('.genre-pill') as NodeListOf<HTMLButtonElement>,
      ).find((button) => button.textContent?.trim() === 'All films') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    httpTesting.expectOne((request) => request.url === '/api/movies').flush({
      data: movieResponse.data,
      pagination: {
        ...movieResponse.pagination,
        pages: '334',
      },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'The server returned invalid movie pagination data.',
    );
    expect(fixture.nativeElement.querySelector('.pagination-controls')).toBeNull();
  });

  it('shows an error when the backend returns an invalid genre list', () => {
    fixture.destroy();
    fixture = TestBed.createComponent(DiscoverPage);
    fixture.detectChanges();
    httpTesting.expectOne('/api/movies/genres').flush({ genres: ['Drama', 42] });
    flushMoviesRequest(httpTesting);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'The server returned an invalid genres response.',
    );
  });

  it('shows the request status when loading genres fails', () => {
    fixture.destroy();
    fixture = TestBed.createComponent(DiscoverPage);
    fixture.detectChanges();
    httpTesting
      .expectOne('/api/movies/genres')
      .flush({ error: 'Unavailable' }, { status: 503, statusText: 'Service Unavailable' });
    flushMoviesRequest(httpTesting);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Could not load genres: Request failed (503).',
    );
  });

  it('persists saved films and loads them into the watchlist', () => {
    const saveButton = fixture.nativeElement.querySelector(
      'button[aria-label="Add Moonlight to watchlist"]',
    ) as HTMLButtonElement;
    saveButton.click();
    fixture.detectChanges();

    expect(window.localStorage.getItem('mosaic.watchlist.v1.guest')).toBe('["movie-456"]');
    expect(
      (fixture.nativeElement.querySelector('.nav-count') as HTMLElement).textContent?.trim(),
    ).toBe('1');

    (
      Array.from(
        fixture.nativeElement.querySelectorAll('.side-nav button') as NodeListOf<HTMLButtonElement>,
      ).find((button) => button.textContent?.includes('Watchlist')) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    httpTesting.expectOne('/api/movies/movie-456').flush(movieResponse.data[1]);
    fixture.detectChanges();
    expect(movieTitles(fixture)).toEqual(['Moonlight']);
    (
      fixture.nativeElement.querySelector(
        'button[aria-label="Remove Moonlight from watchlist"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(window.localStorage.getItem('mosaic.watchlist.v1.guest')).toBe('[]');
  });

  it('searches all saved movies locally without leaving watchlist mode', async () => {
    window.localStorage.setItem(
      'mosaic.watchlist.v1.guest',
      JSON.stringify(['movie-456', 'movie-789']),
    );
    fixture.destroy();
    fixture = TestBed.createComponent(DiscoverPage);
    fixture.detectChanges();
    flushGenresRequest(httpTesting);
    flushMoviesRequest(httpTesting);
    fixture.detectChanges();

    (
      fixture.nativeElement.querySelector('.side-nav button') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    httpTesting.expectOne('/api/movies/movie-456').flush(movieResponse.data[1]);
    httpTesting.expectOne('/api/movies/movie-789').flush(movieResponse.data[2]);
    fixture.detectChanges();
    expect(movieTitles(fixture)).toEqual(['Moonlight', 'Arrival']);

    setInputValue(
      fixture.nativeElement.querySelector('[aria-label="Search movies"]') as HTMLInputElement,
      'Villeneuve',
    );
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    fixture.detectChanges();

    expect(movieTitles(fixture)).toEqual(['Arrival']);
    expect(
      fixture.nativeElement.querySelector('.catalog-heading h2')?.textContent,
    ).toContain('Your watchlist');
  });

  it('applies search, genre, advanced filters, and sorting to saved films', () => {
    const savedMovies = [
      {
        _id: 'quiet',
        title: 'Quiet Story',
        year: 2020,
        genres: ['Drama'],
        imdb: { rating: 8 },
        runtime: 100,
        fullplot: 'A quiet tale.',
        plot: 'A family story.',
        directors: ['Mara Ellison'],
        cast: ['Nina Park'],
        rated: 'PG',
        type: 'movie',
        metacritic: 80,
        tomatoes: {
          viewer: { meter: 94, rating: 4.6, numReviews: 1000 },
          critic: { meter: 90, rating: 8, numReviews: 500 },
        },
        released: '2020-01-01',
      },
      {
        _id: 'other',
        title: 'Other Worlds',
        year: 2010,
        genres: ['Sci-Fi'],
        imdb: { rating: 7 },
        runtime: 90,
        plot: 'A space journey.',
        director: 'Alex Smith',
        cast: ['Sam Lee'],
        rated: 'PG-13',
        type: 'series',
        metacritic: null,
        tomatoes: {
          viewer: { meter: 70, rating: 3.8, numReviews: 200 },
          critic: { meter: 65, rating: 6, numReviews: 100 },
        },
        released: '2010-01-01',
      },
    ];
    window.localStorage.setItem(
      'mosaic.watchlist.v1.guest',
      JSON.stringify(['quiet', 'other']),
    );
    fixture.destroy();
    fixture = TestBed.createComponent(DiscoverPage);
    fixture.detectChanges();
    flushGenresRequest(httpTesting);
    flushMoviesRequest(httpTesting);
    fixture.detectChanges();
    fixture.componentInstance['showWatchlist'].set(true);
    fixture.componentInstance['loadMovies']();
    httpTesting.expectOne('/api/movies/quiet').flush(savedMovies[0]);
    httpTesting.expectOne('/api/movies/other').flush(savedMovies[1]);
    fixture.detectChanges();

    const applyFilters = (filters: Record<string, string | number> = {}): string[] => {
      fixture.componentInstance['advancedFilters'].set(filters);
      fixture.componentInstance['search'].set('');
      fixture.componentInstance['activeGenres'].set([]);
      fixture.componentInstance['loadMovies']();
      fixture.detectChanges();
      return movieTitles(fixture);
    };

    fixture.componentInstance['search'].set('Mara Ellison');
    fixture.componentInstance['loadMovies']();
    fixture.detectChanges();
    expect(movieTitles(fixture)).toEqual(['Quiet Story']);
    fixture.componentInstance['search'].set('not in the watchlist');
    fixture.componentInstance['loadMovies']();
    fixture.detectChanges();
    expect(movieTitles(fixture)).toEqual([]);
    fixture.componentInstance['search'].set('');

    fixture.componentInstance['activeGenres'].set(['Sci-Fi']);
    fixture.componentInstance['loadMovies']();
    fixture.detectChanges();
    expect(movieTitles(fixture)).toEqual(['Other Worlds']);

    expect(applyFilters({ title: 'quiet' })).toEqual(['Quiet Story']);
    expect(applyFilters({ title: 'missing' })).toEqual([]);
    expect(applyFilters({ plot: 'family story' })).toEqual(['Quiet Story']);
    expect(applyFilters({ plot: 'missing' })).toEqual([]);
    expect(applyFilters({ directors: 'Mara Ellison' })).toEqual(['Quiet Story']);
    expect(applyFilters({ directors: 'Missing Director' })).toEqual([]);
    expect(applyFilters({ cast: 'Nina Park' })).toEqual(['Quiet Story']);
    expect(applyFilters({ cast: 'Missing Actor' })).toEqual([]);
    expect(applyFilters({ rated: 'PG' })).toEqual(['Quiet Story']);
    expect(applyFilters({ rated: 'R' })).toEqual([]);
    expect(applyFilters({ type: 'movie' })).toEqual(['Quiet Story']);
    expect(applyFilters({ type: 'documentary' })).toEqual([]);
    expect(applyFilters({ yearMin: 2010, yearMax: 2020 })).toEqual([
      'Quiet Story',
      'Other Worlds',
    ]);
    expect(applyFilters({ runtimeMin: 95 })).toEqual(['Quiet Story']);
    expect(applyFilters({ runtimeMax: 95 })).toEqual(['Other Worlds']);
    expect(applyFilters({ imdbRatingMin: 8 })).toEqual(['Quiet Story']);
    expect(applyFilters({ imdbRatingMax: 7 })).toEqual(['Other Worlds']);
    expect(applyFilters({ metacriticMin: 1 })).toEqual(['Quiet Story']);
    expect(applyFilters({ tomatoesMeterMin: 90 })).toEqual(['Quiet Story']);
    expect(applyFilters({ tomatoesMeterMax: 80 })).toEqual(['Other Worlds']);
    expect(applyFilters({ tomatoesRatingMin: 4 })).toEqual(['Quiet Story']);
    expect(applyFilters({ tomatoesRatingMax: 4 })).toEqual(['Other Worlds']);

    for (const sort of [
      'title',
      'year',
      'runtime',
      'released',
      'metacritic',
      'imdbRating',
      'tomatoesMeter',
      'tomatoesRating',
    ] as const) {
      expect(applyFilters({ sort, order: 'asc' }).length).toBe(2);
      expect(applyFilters({ sort, order: 'desc' }).length).toBe(2);
    }
    expect(applyFilters({ sort: 'tomatoesMeter', order: 'asc' })).toEqual([
      'Other Worlds',
      'Quiet Story',
    ]);
    expect(applyFilters({ sort: 'tomatoesMeter', order: 'desc' })).toEqual([
      'Quiet Story',
      'Other Worlds',
    ]);
    expect(applyFilters({ sort: 'tomatoesRating', order: 'asc' })).toEqual([
      'Other Worlds',
      'Quiet Story',
    ]);
    expect(applyFilters({ sort: 'tomatoesRating', order: 'desc' })).toEqual([
      'Quiet Story',
      'Other Worlds',
    ]);
    fixture.componentInstance['sortByRating'].set(true);
    expect(applyFilters().length).toBe(2);
  });

  it('shows an empty state for an empty watchlist', () => {
    (
      fixture.nativeElement.querySelector('.side-nav button') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Your watchlist is empty');
    expect(fixture.nativeElement.textContent).toContain('Try changing or clearing your filters.');
    httpTesting.expectNone((request) => request.url.startsWith('/api/movies/'));
  });

  it('reports a saved movie detail request failure in the watchlist', () => {
    window.localStorage.setItem('mosaic.watchlist.v1.guest', JSON.stringify(['missing-movie']));
    fixture.destroy();
    fixture = TestBed.createComponent(DiscoverPage);
    fixture.detectChanges();
    flushGenresRequest(httpTesting);
    flushMoviesRequest(httpTesting);
    fixture.detectChanges();

    (
      fixture.nativeElement.querySelector('.side-nav button') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    httpTesting
      .expectOne('/api/movies/missing-movie')
      .flush({ error: 'Unavailable' }, { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Request failed (503).');
    expect(fixture.nativeElement.textContent).toContain('Could not load films');
  });

  it('returns to the catalog from watchlist mode', () => {
    fixture.componentInstance['showWatchlist'].set(true);
    fixture.componentInstance['showDiscover']();
    fixture.detectChanges();
    flushMoviesRequest(httpTesting);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.side-nav a')?.classList).toContain('active');
    expect(fixture.nativeElement.querySelector('.side-nav button')?.classList).not.toContain(
      'active',
    );
    expect(fixture.nativeElement.querySelector('.catalog-heading h2')?.textContent).toContain(
      'A little of everything',
    );
  });

  it('switches between guest and user-specific watchlists on login and logout', () => {
    window.localStorage.setItem('mosaic.watchlist.v1.guest', JSON.stringify(['movie-456']));
    window.localStorage.setItem(
      'mosaic.watchlist.v1.user.user-1',
      JSON.stringify(['movie-123', 'movie-789']),
    );
    fixture.destroy();
    fixture = TestBed.createComponent(DiscoverPage);
    fixture.detectChanges();
    flushGenresRequest(httpTesting);
    flushMoviesRequest(httpTesting);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement.querySelector('.nav-count') as HTMLElement).textContent?.trim(),
    ).toBe('1');

    (
      fixture.nativeElement.querySelector(
        'button[aria-label="Open login menu"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    setInputValue(
      fixture.nativeElement.querySelector('[autocomplete="email"]') as HTMLInputElement,
      'jane@example.com',
    );
    setInputValue(
      fixture.nativeElement.querySelector('[autocomplete="current-password"]') as HTMLInputElement,
      'correct-password',
    );
    submit(fixture.nativeElement.querySelector('.account-form') as HTMLFormElement);
    httpTesting.expectOne('/api/users/login').flush({
      token: 'test-token',
      user: { id: 'user-1', name: 'Jane Doe', email: 'jane@example.com' },
    });
    fixture.detectChanges();
    expect(
      (fixture.nativeElement.querySelector('.nav-count') as HTMLElement).textContent?.trim(),
    ).toBe('2');
    expect(window.localStorage.getItem('mosaic.watchlist.v1.user.user-1')).toBe(
      '["movie-123","movie-789"]',
    );

    (
      fixture.nativeElement.querySelector(
        'button[aria-label="Account menu for Jane Doe"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    (
      Array.from(
        fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
      ).find((button) => button.textContent?.includes('Log out')) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    httpTesting.expectOne('/api/users/logout').flush({});
    fixture.detectChanges();
    expect(
      (fixture.nativeElement.querySelector('.nav-count') as HTMLElement).textContent?.trim(),
    ).toBe('1');
  });

  it('displays comment loading errors and allows the dialog to be closed by its backdrop', () => {
    (
      fixture.nativeElement.querySelector(
        'button[aria-label="View The Quiet Between"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    httpTesting
      .expectOne('/api/comments?movieId=movie-123')
      .flush({ error: 'Unavailable' }, { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Request failed (503).');

    const backdrop = fixture.nativeElement.querySelector('.dialog-backdrop') as HTMLDivElement;
    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows comment submission errors and clears them after a successful retry', () => {
    (
      fixture.nativeElement.querySelector(
        'button[aria-label="View The Quiet Between"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    httpTesting.expectOne('/api/comments?movieId=movie-123').flush({ comments: [] });
    fixture.detectChanges();

    setInputValue(
      fixture.nativeElement.querySelector('[aria-label="Your name"]') as HTMLInputElement,
      'Morgan',
    );
    setInputValue(
      fixture.nativeElement.querySelector('[aria-label="Your comment"]') as HTMLTextAreaElement,
      'A thoughtful comment.',
    );
    fixture.detectChanges();
    submit(fixture.nativeElement.querySelector('.comment-form') as HTMLFormElement);
    httpTesting
      .expectOne('/api/comments')
      .flush({ error: 'Comments are closed.' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Comments are closed.');

    submit(fixture.nativeElement.querySelector('.comment-form') as HTMLFormElement);
    httpTesting
      .expectOne('/api/comments')
      .flush({ _id: 'comment-2', name: 'Morgan', text: 'A thoughtful comment.' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Comments are closed.');
    expect(fixture.nativeElement.textContent).toContain('A thoughtful comment.');
  });

  it('ignores invalid comment events and guards against duplicate or unauthenticated actions', () => {
    fixture.componentInstance['onCommentNameInput'](new Event('input'));
    fixture.componentInstance['onAuthInput'](new Event('input'), 'email');
    fixture.componentInstance['onPosterError'](new Event('error'));
    fixture.componentInstance['submitLogout']();
    fixture.componentInstance['submitComment'](new SubmitEvent('submit'));
    httpTesting.expectNone('/api/comments');
    httpTesting.expectNone('/api/users/logout');

    (
      fixture.nativeElement.querySelector(
        'button[aria-label="View The Quiet Between"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    httpTesting.expectOne('/api/comments?movieId=movie-123').flush([]);
    fixture.detectChanges();
    const form = fixture.nativeElement.querySelector('.comment-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    httpTesting.expectNone('/api/comments');

    setInputValue(
      fixture.nativeElement.querySelector('[aria-label="Your name"]') as HTMLInputElement,
      'Morgan',
    );
    fixture.detectChanges();
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    httpTesting.expectNone('/api/comments');

    setInputValue(
      fixture.nativeElement.querySelector('[aria-label="Your comment"]') as HTMLTextAreaElement,
      'A comment that should be submitted once.',
    );
    fixture.detectChanges();
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const post = httpTesting.expectOne('/api/comments');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    httpTesting.expectNone('/api/comments');
    post.flush({ comment: { _id: 'comment-once', name: 'Morgan', text: 'Submitted once.' } });
    fixture.detectChanges();
  });

  it('rejects mismatched registration passwords and reports login errors', () => {
    (
      fixture.nativeElement.querySelector(
        'button[aria-label="Open login menu"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    (
      Array.from(
        fixture.nativeElement.querySelectorAll('.account-switch') as NodeListOf<HTMLButtonElement>,
      ).find((button) => button.textContent?.includes('Create one')) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    setInputValue(
      fixture.nativeElement.querySelector('[autocomplete="username"]') as HTMLInputElement,
      'Jay',
    );
    fixture.nativeElement
      .querySelector('.account-form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'Username must be between 4 and 25 characters.',
    );

    setInputValue(
      fixture.nativeElement.querySelector('[autocomplete="username"]') as HTMLInputElement,
      'Jane Doe',
    );
    setInputValue(
      fixture.nativeElement.querySelector('[autocomplete="email"]') as HTMLInputElement,
      'jane@example.com',
    );
    const registrationPasswords = fixture.nativeElement.querySelectorAll(
      '[autocomplete="new-password"]',
    ) as NodeListOf<HTMLInputElement>;
    setInputValue(registrationPasswords[0], 'first-password');
    setInputValue(registrationPasswords[1], 'different-password');
    fixture.detectChanges();
    submit(fixture.nativeElement.querySelector('.account-form') as HTMLFormElement);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Passwords do not match.');
    httpTesting.expectNone('/api/users');

    (fixture.nativeElement.querySelector('.account-switch') as HTMLButtonElement).click();
    fixture.detectChanges();
    setInputValue(
      fixture.nativeElement.querySelector('[autocomplete="email"]') as HTMLInputElement,
      'jane@example.com',
    );
    setInputValue(
      fixture.nativeElement.querySelector('[autocomplete="current-password"]') as HTMLInputElement,
      'wrong-password',
    );
    fixture.detectChanges();
    submit(fixture.nativeElement.querySelector('.account-form') as HTMLFormElement);
    httpTesting
      .expectOne('/api/users/login')
      .flush({ error: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Invalid username or password.');
  });

  it('restores valid saved movies and ignores invalid saved account data', () => {
    window.localStorage.setItem('mosaic.watchlist.v1', JSON.stringify(['movie-456', 3]));
    window.localStorage.removeItem('mosaic.watchlist.v1.guest');
    window.localStorage.setItem('mosaic.auth.v1', '{invalid json');

    fixture.destroy();
    fixture = TestBed.createComponent(DiscoverPage);
    fixture.detectChanges();
    flushGenresRequest(httpTesting);
    flushMoviesRequest(httpTesting);
    fixture.detectChanges();

    expect(movieTitles(fixture).length).toBe(3);
    expect(
      (fixture.nativeElement.querySelector('.nav-count') as HTMLElement).textContent?.trim(),
    ).toBe('1');
    expect(fixture.nativeElement.textContent).toContain('Movie lover');
    expect(window.localStorage.getItem('mosaic.watchlist.v1.guest')).toBe('["movie-456"]');
  });

  it('restores valid saved account sessions and rejects incomplete sessions', () => {
    window.localStorage.setItem(
      'mosaic.auth.v1',
      JSON.stringify({
        token: 'saved-token',
        user: { id: 'user-1', name: 'Jane Doe', email: 'jane@example.com' },
      }),
    );
    window.localStorage.setItem('mosaic.watchlist.v1', '{}');

    fixture.destroy();
    fixture = TestBed.createComponent(DiscoverPage);
    fixture.detectChanges();
    flushGenresRequest(httpTesting);
    flushMoviesRequest(httpTesting);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Jane Doe');
    expect(fixture.nativeElement.textContent).toContain('jane@example.com');
    expect(
      (fixture.nativeElement.querySelector('.nav-count') as HTMLElement).textContent?.trim(),
    ).toBe('0');

    fixture.destroy();
    window.localStorage.setItem('mosaic.auth.v1', JSON.stringify({ token: 'missing-user' }));
    fixture = TestBed.createComponent(DiscoverPage);
    fixture.detectChanges();
    flushGenresRequest(httpTesting);
    flushMoviesRequest(httpTesting);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Movie lover');
  });

  it('normalizes legacy movie payloads and shows the empty catalog state', () => {
    fixture.destroy();
    fixture = TestBed.createComponent(DiscoverPage);
    fixture.detectChanges();
    flushGenresRequest(httpTesting);
    flushMoviesRequest(httpTesting, [
      null,
      {
        id: 'legacy',
        title: 'Legacy film',
        genre: 'Drama, Mystery',
        vote_average: 6.5,
        overview: 'A classic.',
        directors: ['A. Director'],
        actors: 'First Actor, Second Actor',
        image: 'https://example.test/legacy.jpg',
      },
    ]);
    fixture.detectChanges();

    expect(movieTitles(fixture)).toEqual(['Untitled film', 'Legacy film']);
    expect(fixture.nativeElement.querySelector('img[alt="Legacy film film still"]')).toBeTruthy();

    fixture.destroy();
    fixture = TestBed.createComponent(DiscoverPage);
    fixture.detectChanges();
    flushGenresRequest(httpTesting);
    flushMoviesRequest(httpTesting, {});
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No films found');
  });

  it('shows movie loading errors and retries the catalog request', () => {
    fixture.destroy();
    fixture = TestBed.createComponent(DiscoverPage);
    fixture.detectChanges();
    flushGenresRequest(httpTesting);
    const failedRequest = httpTesting.expectOne(
      (candidate) => candidate.url === '/api/movies' && candidate.params.get('genres') === null,
    );
    failedRequest.flush(
      { error: 'Unavailable' },
      { status: 503, statusText: 'Service Unavailable' },
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Request failed (503).');

    (fixture.nativeElement.querySelector('.empty-state .sort-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    flushMoviesRequest(httpTesting, { movies: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No films found');
  });

  it('closes the account menu when clicking outside and closes all overlays on Escape', () => {
    (
      fixture.nativeElement.querySelector(
        'button[aria-label="Open login menu"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.account-dropdown')).toBeTruthy();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.account-dropdown')).toBeNull();

    (
      fixture.nativeElement.querySelector(
        'button[aria-label="View The Quiet Between"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    httpTesting.expectOne('/api/comments?movieId=movie-123').flush([]);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector(
        'button[aria-label="Open login menu"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.account-dropdown')).toBeNull();
  });

  it('clears local sign-in state when the server rejects logout', () => {
    (
      fixture.nativeElement.querySelector(
        'button[aria-label="Open login menu"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    setInputValue(
      fixture.nativeElement.querySelector('[autocomplete="email"]') as HTMLInputElement,
      'jane@example.com',
    );
    setInputValue(
      fixture.nativeElement.querySelector('[autocomplete="current-password"]') as HTMLInputElement,
      'correct-password',
    );
    fixture.detectChanges();
    submit(fixture.nativeElement.querySelector('.account-form') as HTMLFormElement);

    httpTesting.expectOne('/api/users/login').flush({
      token: 'test-jwt',
      user: { id: 'user-1', name: 'Jane Doe', email: 'jane@example.com' },
    });
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector(
        'button[aria-label="Account menu for Jane Doe"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.account-action') as HTMLButtonElement).click();
    fixture.componentInstance['submitLogout']();
    httpTesting.expectOne('/api/users/logout').flush(
      { error: 'Logout unavailable' },
      { status: 503, statusText: 'Unavailable' },
    );
    fixture.detectChanges();

    expect(window.localStorage.getItem('mosaic.auth.v1')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      'Signed out here, but the server could not end the session: Logout unavailable',
    );
  });

  it('renders detail fallbacks and the transient comments loading state', () => {
    fixture.destroy();
    fixture = TestBed.createComponent(DiscoverPage);
    fixture.detectChanges();
    flushGenresRequest(httpTesting);
    flushMoviesRequest(httpTesting, {
      data: [{ _id: 'sparse', title: 'Sparse film' }],
      pagination: {
        page: 1,
        limit: 30,
        total: 1,
        pages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
    });
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.feature-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Loading comments...');
    expect(fixture.nativeElement.textContent).toContain('Feature film');
    expect(fixture.nativeElement.textContent).toContain('No synopsis is available for this film yet.');
    expect(fixture.nativeElement.textContent).toContain('Not listed');

    httpTesting.expectOne('/api/comments?movieId=sparse').flush([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Be the first to leave a thought.');

    (fixture.nativeElement.querySelector('.movie-title') as HTMLButtonElement).click();
    fixture.detectChanges();
    httpTesting.expectOne('/api/comments?movieId=sparse').flush([]);
    fixture.detectChanges();

    (
      fixture.nativeElement.querySelector('[aria-label="Close film details"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('reports plain errors from movie and comment requests', () => {
    const http = TestBed.inject(HttpClient);
    const movie = fixture.componentInstance['movies']()[0];
    const get = spyOn(http, 'get').and.returnValue(
      throwError(() => 'unexpected movie transport failure'),
    );

    fixture.componentInstance['loadMovies']();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Could not load films.');

    get.and.returnValue(throwError(() => 'unexpected comments transport failure'));
    fixture.componentInstance['openMovie'](movie);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Could not load comments.');

    spyOn(http, 'post').and.returnValue(
      throwError(() => 'unexpected comment submission failure'),
    );
    fixture.componentInstance['commentName'].set('Morgan');
    fixture.componentInstance['commentText'].set('A useful thought.');
    fixture.componentInstance['submitComment'](new SubmitEvent('submit'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Could not post your comment.');
  });

  it('covers registration loading and non-Error registration failures', () => {
    const authApi = TestBed.inject(AuthApi);
    const registrationResponse = new Subject<void>();
    spyOn(authApi, 'register').and.returnValue(registrationResponse);
    (
      fixture.nativeElement.querySelector('button[aria-label="Open login menu"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    (
      Array.from(
        fixture.nativeElement.querySelectorAll('.account-switch') as NodeListOf<HTMLButtonElement>,
      ).find((button) => button.textContent?.includes('Create one')) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    setInputValue(
      fixture.nativeElement.querySelector('[autocomplete="username"]') as HTMLInputElement,
      'Morgan Lee',
    );
    setInputValue(
      fixture.nativeElement.querySelector('[autocomplete="email"]') as HTMLInputElement,
      'morgan@example.com',
    );
    const passwords = fixture.nativeElement.querySelectorAll(
      '[autocomplete="new-password"]',
    ) as NodeListOf<HTMLInputElement>;
    setInputValue(passwords[0], 'correct-password');
    setInputValue(passwords[1], 'correct-password');
    submit(fixture.nativeElement.querySelector('.account-form') as HTMLFormElement);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Creating account…');
    registrationResponse.error('registration failed');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Could not create your account.');
  });

  it('handles session storage failures without hiding the signed-in session', () => {
    const authApi = TestBed.inject(AuthApi);
    const session: AuthSession = {
      token: 'test-token',
      user: { id: 'user-storage', name: 'Storage User', email: 'storage@example.com' },
    };
    spyOn(authApi, 'login').and.returnValue(of(session));
    const originalSetItem = window.localStorage.setItem.bind(window.localStorage);
    spyOn(window.localStorage, 'setItem').and.callFake((key, value) => {
      if (key === 'mosaic.auth.v1') {
        throw new Error('Storage disabled');
      }
      originalSetItem(key, value);
    });

    (
      fixture.nativeElement.querySelector('button[aria-label="Open login menu"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    setInputValue(
      fixture.nativeElement.querySelector('[autocomplete="email"]') as HTMLInputElement,
      'storage@example.com',
    );
    setInputValue(
      fixture.nativeElement.querySelector('[autocomplete="current-password"]') as HTMLInputElement,
      'correct-password',
    );
    submit(fixture.nativeElement.querySelector('.account-form') as HTMLFormElement);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'You are signed in, but this browser could not save your session.',
    );
    expect(fixture.nativeElement.textContent).toContain('Storage User');
    expect(fixture.nativeElement.querySelector('.account-dropdown')).toBeTruthy();
  });

  it('reloads the selected account watchlist when signing in from watchlist mode', () => {
    const authApi = TestBed.inject(AuthApi);
    const session: AuthSession = {
      token: 'test-token',
      user: { id: 'watchlist-user', name: 'Watchlist User', email: 'list@example.com' },
    };
    spyOn(authApi, 'login').and.returnValue(of(session));
    fixture.componentInstance['showWatchlist'].set(true);

    fixture.componentInstance['submitLogin'](new SubmitEvent('submit'));
    fixture.detectChanges();

    expect(fixture.componentInstance['authSession']()?.user.id).toBe('watchlist-user');
    expect(fixture.componentInstance['currentPage']()).toBe(1);
    expect(fixture.componentInstance['movies']()).toEqual([]);
    expect(fixture.componentInstance['isLoading']()).toBeFalse();
  });

  it('uses the generic auth errors and clears local state when logout fails', () => {
    const authApi = TestBed.inject(AuthApi);
    const session: AuthSession = {
      token: 'test-token',
      user: { id: 'user-plain-error', name: 'Plain Error', email: 'plain@example.com' },
    };
    const login = spyOn(authApi, 'login').and.returnValue(
      throwError(() => 'login failed'),
    );

    (
      fixture.nativeElement.querySelector('button[aria-label="Open login menu"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    setInputValue(
      fixture.nativeElement.querySelector('[autocomplete="email"]') as HTMLInputElement,
      'plain@example.com',
    );
    setInputValue(
      fixture.nativeElement.querySelector('[autocomplete="current-password"]') as HTMLInputElement,
      'correct-password',
    );
    submit(fixture.nativeElement.querySelector('.account-form') as HTMLFormElement);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Could not sign in.');

    login.and.returnValue(of(session));
    setInputValue(
      fixture.nativeElement.querySelector('[autocomplete="current-password"]') as HTMLInputElement,
      'correct-password',
    );
    submit(fixture.nativeElement.querySelector('.account-form') as HTMLFormElement);
    fixture.detectChanges();
    expect(fixture.componentInstance['authSession']()?.user.name).toBe('Plain Error');

    fixture.componentInstance['showWatchlist'].set(true);
    spyOn(authApi, 'logout').and.returnValue(throwError(() => 'logout failed'));
    spyOn(window.localStorage, 'removeItem').and.throwError('Storage disabled');
    fixture.componentInstance['submitLogout']();
    fixture.detectChanges();

    expect(fixture.componentInstance['authSession']()).toBeNull();
    expect(fixture.componentInstance['authError']()).toContain(
      'Signed out, but this browser could not clear the saved session.',
    );
  });
});
