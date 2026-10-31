import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DiscoverPage } from '../../../src/app/features/discover/pages/discover-page/discover-page';

const movieResponse = {
  data: [
    {
      _id: 'movie-123',
      title: 'The Quiet Between',
      year: 2025,
      genres: ['Drama', 'Mystery'],
      imdb: { rating: 8.7 },
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
    httpTesting.expectOne('/api/movies?limit=30').flush(movieResponse);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpTesting.verify();
    window.localStorage.clear();
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
    const logout = httpTesting.expectOne('/api/users/logout');
    expect(logout.request.headers.get('Authorization')).toBe('Bearer test-jwt');
    logout.flush({ message: 'Logged out successfully' });
    fixture.detectChanges();
    expect(window.localStorage.getItem('mosaic.auth.v1')).toBeNull();
  });

  it('searches by title and director, filters by genre, and shows the new catalog controls', () => {
    expect(movieTitles(fixture)).toEqual(['The Quiet Between', 'Moonlight', 'Arrival']);

    setInputValue(
      fixture.nativeElement.querySelector('[aria-label="Search movies"]') as HTMLInputElement,
      '  barry jenkins  ',
    );
    fixture.detectChanges();
    expect(movieTitles(fixture)).toEqual(['Moonlight']);

    setInputValue(
      fixture.nativeElement.querySelector('[aria-label="Search movies"]') as HTMLInputElement,
      '',
    );
    fixture.detectChanges();
    (
      Array.from(
        fixture.nativeElement.querySelectorAll('.genre-pill') as NodeListOf<HTMLButtonElement>,
      ).find((button) => button.textContent?.trim() === 'Drama') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(movieTitles(fixture)).toEqual(['The Quiet Between', 'Moonlight']);

    (
      Array.from(
        fixture.nativeElement.querySelectorAll('.genre-pill') as NodeListOf<HTMLButtonElement>,
      ).find((button) => button.textContent?.trim() === 'All films') as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    const mysteryGenre = Array.from(
      fixture.nativeElement.querySelectorAll('.genre-link') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.trim() === 'Mystery') as HTMLButtonElement;
    mysteryGenre.click();
    fixture.detectChanges();
    expect(movieTitles(fixture)).toEqual(['The Quiet Between']);
    mysteryGenre.click();
    fixture.detectChanges();
    expect(movieTitles(fixture).length).toBe(3);

    expect(
      fixture.nativeElement.querySelector('.side-nav')?.textContent,
    ).not.toContain('Top rated');
    expect(
      fixture.nativeElement.querySelector('[aria-label="Search genres"]')?.disabled,
    ).toBeTrue();
    expect(
      fixture.nativeElement.querySelector('.advanced-search-toggle')?.disabled,
    ).toBeTrue();
    expect(
      fixture.nativeElement.querySelector('[aria-label="Sort films"]')?.disabled,
    ).toBeTrue();
    expect(
      fixture.nativeElement.querySelector('[aria-label="Sort direction"]')?.disabled,
    ).toBeTrue();
    expect(
      fixture.nativeElement.querySelectorAll('.pagination-controls .page-button:disabled').length,
    ).toBe(2);
  });

  it('persists saved films and filters the catalog to the watchlist', () => {
    const saveButton = fixture.nativeElement.querySelector(
      'button[aria-label="Add Moonlight to watchlist"]',
    ) as HTMLButtonElement;
    saveButton.click();
    fixture.detectChanges();

    expect(window.localStorage.getItem('mosaic.watchlist.v1')).toBe('["movie-456"]');
    expect(
      (fixture.nativeElement.querySelector('.nav-count') as HTMLElement).textContent?.trim(),
    ).toBe('1');

    (
      Array.from(
        fixture.nativeElement.querySelectorAll('.side-nav button') as NodeListOf<HTMLButtonElement>,
      ).find((button) => button.textContent?.includes('Watchlist')) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(movieTitles(fixture)).toEqual(['Moonlight']);
    (
      fixture.nativeElement.querySelector(
        'button[aria-label="Remove Moonlight from watchlist"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(window.localStorage.getItem('mosaic.watchlist.v1')).toBe('[]');
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
    window.localStorage.setItem('mosaic.auth.v1', '{invalid json');

    fixture.destroy();
    fixture = TestBed.createComponent(DiscoverPage);
    fixture.detectChanges();
    httpTesting.expectOne('/api/movies?limit=30').flush(movieResponse);
    fixture.detectChanges();

    expect(movieTitles(fixture).length).toBe(3);
    expect(
      (fixture.nativeElement.querySelector('.nav-count') as HTMLElement).textContent?.trim(),
    ).toBe('1');
    expect(fixture.nativeElement.textContent).toContain('Movie lover');
    expect(window.localStorage.getItem('mosaic.watchlist.v1')).toBe('["movie-456"]');
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
    httpTesting.expectOne('/api/movies?limit=30').flush(movieResponse);
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
    httpTesting.expectOne('/api/movies?limit=30').flush(movieResponse);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Movie lover');
  });

  it('normalizes legacy movie payloads and shows the empty catalog state', () => {
    fixture.destroy();
    fixture = TestBed.createComponent(DiscoverPage);
    fixture.detectChanges();
    httpTesting.expectOne('/api/movies?limit=30').flush([
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
    httpTesting.expectOne('/api/movies?limit=30').flush({});
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No films found');
  });

  it('shows movie loading errors and retries the catalog request', () => {
    fixture.destroy();
    fixture = TestBed.createComponent(DiscoverPage);
    fixture.detectChanges();
    httpTesting
      .expectOne('/api/movies?limit=30')
      .flush({ error: 'Unavailable' }, { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Request failed (503).');

    (fixture.nativeElement.querySelector('.empty-state .sort-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    httpTesting.expectOne('/api/movies?limit=30').flush({ movies: [] });
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
    httpTesting
      .expectOne('/api/users/logout')
      .flush({ error: 'Logout unavailable' }, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();

    expect(window.localStorage.getItem('mosaic.auth.v1')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      'Signed out here, but the server could not end the session: Logout unavailable',
    );
  });
});
