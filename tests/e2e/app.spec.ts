import { expect, test, type Page } from '@playwright/test';

async function mockApi(page: Page): Promise<void> {
  await page.route('**/api/movies*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    const selectedGenres = params.get('genres')?.split(',') ?? [];
    const pageNumber = Number(params.get('page') ?? '1');
    const search = params.get('search')?.toLowerCase() ?? '';
    const title = params.get('title')?.toLowerCase() ?? '';
    let movies = selectedGenres.includes('Sci-Fi')
      ? [
          {
            _id: 'backend-only-sci-fi',
            title: selectedGenres.includes('Drama')
              ? 'Backend-only drama science fiction'
              : 'Backend-only science fiction',
            year: 2023,
            genres: selectedGenres.includes('Drama') ? ['Drama', 'Sci-Fi'] : ['Sci-Fi'],
            imdb: { rating: 7.8 },
            runtime: 110,
            plot: 'A new result returned by the genre search.',
            director: 'A. Director',
            cast: ['An Actor'],
            posterUrl: '',
          },
        ]
      : [
          {
            _id: 'arrival',
            title: 'Arrival',
            year: 2016,
            genres: ['Drama', 'Sci-Fi'],
            imdb: { rating: 7.9 },
            runtime: 116,
            fullplot: 'A linguist works to communicate with visitors from another world.',
            director: 'Denis Villeneuve',
            cast: ['Amy Adams'],
            posterUrl: '',
          },
          {
            _id: 'moonlight',
            title: 'Moonlight',
            year: 2016,
            genres: ['Drama'],
            imdb: { rating: 7.4 },
            runtime: 111,
            plot: 'A young man finds his way through life.',
            director: 'Barry Jenkins',
            cast: ['Trevante Rhodes'],
            posterUrl: '',
          },
        ];

    if (search) {
      movies = movies.filter((movie) =>
        [movie.title, movie.director].some((value) => value.toLowerCase().includes(search)),
      );
    }
    if (title) {
      movies = movies.filter((movie) => movie.title.toLowerCase().includes(title));
    } else if (!search && pageNumber === 2 && selectedGenres.length === 0) {
      movies = [
        {
          _id: 'page-two',
          title: 'The Second Page',
          year: 2022,
          genres: ['Adventure'],
          imdb: { rating: 7.1 },
          runtime: 108,
          plot: 'A title from the second page.',
          director: 'A. Director',
          cast: ['An Actor'],
          posterUrl: '',
        },
      ];
    }

    const total = search || title || selectedGenres.length > 0 ? movies.length : 12000;
    const pages = Math.ceil(total / 30);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: movies,
        pagination: {
          page: pageNumber,
          limit: 30,
          total,
          pages,
          hasNextPage: pageNumber < pages,
          hasPrevPage: pageNumber > 1,
        },
      }),
    });
  });
  await page.route('**/api/movies/genres', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ genres: ['Drama', 'Sci-Fi'] }),
    }),
  );
  await page.route('**/api/comments*', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          comment: {
            _id: 'comment-2',
            name: 'Morgan',
            text: 'The ending stayed with me.',
          },
        }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [{ _id: 'comment-1', name: 'Alex', text: 'A lovely film.' }],
      }),
    });
  });
  await page.route('**/api/users/login', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'test-jwt',
        user: { id: 'user-1', name: 'Jane Doe', email: 'jane@example.com' },
      }),
    }),
  );
  await page.route('**/api/users/logout', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Logged out successfully' }),
    }),
  );
  await page.route('**/api/users', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'User created successfully' }),
    }),
  );
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test('keeps sorting controls compact and genre search icon correctly sized', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Arrival' })).toBeVisible();

  const genreIcon = await page.locator('.genre-search > svg').boundingBox();
  expect(genreIcon?.width).toBe(14);
  expect(genreIcon?.height).toBe(14);

  const controlGroup = page.locator('.catalog-control-actions');
  const controlGroupBox = await controlGroup.boundingBox();
  const directionBox = await page.getByLabel('Sort direction').boundingBox();
  expect(controlGroupBox?.height).toBeLessThanOrEqual(40);
  expect(controlGroupBox?.width).toBeLessThan(500);
  expect(directionBox?.width).toBeGreaterThan(110);

  await page.setViewportSize({ width: 375, height: 812 });
  const mobileControls = await controlGroup.boundingBox();
  expect(mobileControls).toBeTruthy();
  expect(mobileControls!.x + mobileControls!.width).toBeLessThanOrEqual(375);
  expect(await page.getByLabel('Sort direction').isVisible()).toBe(true);
});

test('discovers films, filters, saves, and opens movie details', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /Find your next favorite film/ })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Arrival' })).toBeVisible();
  await expect(page.locator('.result-count')).toHaveText('12000 FILMS');
  await expect(page.getByRole('navigation', { name: 'Movie pages' })).toContainText('Page 1 of 400');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The Second Page' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Movie pages' })).toContainText('Page 2 of 400');
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Arrival' })).toBeVisible();

  const genrePills = page.locator('.genre-pills');
  await genrePills.getByRole('button', { name: 'Sci-Fi', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Backend-only science fiction' })).toBeVisible();
  await expect(page.locator('.movie-card')).toHaveCount(1);
  await genrePills.getByRole('button', { name: 'All films', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Arrival' })).toBeVisible();

  await genrePills.getByRole('button', { name: 'Drama', exact: true }).click();
  await expect(page.locator('.movie-card')).toHaveCount(2);
  await genrePills.getByRole('button', { name: 'Sci-Fi', exact: true }).click();
  await expect(page.locator('.movie-card')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Backend-only drama science fiction' })).toBeVisible();
  await genrePills.getByRole('button', { name: 'All films', exact: true }).click();
  await expect(page.locator('.movie-card')).toHaveCount(2);

  await page.getByRole('searchbox', { name: 'Search genres' }).fill('sci');
  await expect(page.getByRole('navigation', { name: 'Browse by genre' }).getByRole('button'))
    .toHaveCount(2);
  await expect(
    page.getByRole('navigation', { name: 'Browse by genre' }).getByRole('button', { name: 'Sci-Fi' }),
  ).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search genres' }).fill('');

  await page.getByRole('button', { name: 'Advanced search' }).click();
  await page.getByPlaceholder('Film title').fill('Arrival');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('heading', { name: 'Arrival' })).toBeVisible();
  await expect(page.locator('.movie-card')).toHaveCount(1);
  await expect(page.locator('.result-count')).toHaveText('1 FILMS');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('.movie-card')).toHaveCount(2);
  await expect(page.locator('.result-count')).toHaveText('12000 FILMS');

  await page.getByRole('searchbox', { name: 'Search movies' }).fill('Moonlight');
  await expect(page.locator('.movie-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Add Moonlight to watchlist' }).click();
  await page.getByRole('button', { name: 'Watchlist 1' }).click();
  await expect(page.locator('.movie-card')).toHaveCount(1);

  await page.getByRole('button', { name: 'Moonlight', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Moonlight' })).toBeVisible();
  await expect(page.getByText('A lovely film.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('posts a comment on a film', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'View Arrival' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('A lovely film.')).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Your name' }).fill('Morgan');
  await dialog.getByRole('textbox', { name: 'Your comment' }).fill('The ending stayed with me.');
  await dialog.getByRole('button', { name: 'Post comment' }).click();
  await expect(dialog.getByText('The ending stayed with me.')).toBeVisible();
});

test('validates advanced ranges and sends selected sort and filters to the backend', async ({ page }) => {
  const movieRequests: URL[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/movies') {
      movieRequests.push(url);
    }
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Advanced search' }).click();

  await page.getByRole('spinbutton', { name: 'Release year from' }).fill('2025');
  await page.getByRole('spinbutton', { name: 'Release year to' }).fill('2000');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Minimum year must be no greater than maximum year.',
  );
  expect(movieRequests).toHaveLength(1);

  await page.getByRole('spinbutton', { name: 'Release year from' }).fill('2000');
  await page.getByRole('spinbutton', { name: 'Release year to' }).fill('2025');
  await page.getByPlaceholder('Film title').fill('Arrival');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.locator('.result-count')).toHaveText('1 FILMS');
  await expect.poll(() => movieRequests.length).toBe(2);
  expect(movieRequests[1].searchParams.get('title')).toBe('Arrival');
  expect(movieRequests[1].searchParams.get('yearMin')).toBe('2000');
  expect(movieRequests[1].searchParams.get('yearMax')).toBe('2025');

  await page.getByRole('combobox', { name: 'Sort films' }).selectOption('imdbRating');
  await expect.poll(() => movieRequests.length).toBe(3);
  expect(movieRequests[2].searchParams.get('sort')).toBe('imdbRating');
  await page.getByRole('combobox', { name: 'Sort direction' }).selectOption('asc');
  await expect.poll(() => movieRequests.length).toBe(4);
  expect(movieRequests[3].searchParams.get('order')).toBe('asc');
});

test('shows a movie service error and recovers when the user retries', async ({ page }) => {
  let listRequests = 0;
  await page.route('**/api/movies*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/api/movies') {
      await route.fallback();
      return;
    }
    listRequests += 1;
    if (listRequests === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unavailable' }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            _id: 'recovered-movie',
            title: 'Recovered Movie',
            year: 2024,
            genres: ['Drama'],
            imdb: { rating: 7.5 },
          },
        ],
        pagination: {
          page: 1,
          limit: 30,
          total: 1,
          pages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      }),
    });
  });
  await page.goto('/');

  await expect(page.locator('.empty-state strong')).toHaveText('Could not load films');
  await expect(page.getByText('Request failed (503).')).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Recovered Movie' })).toBeVisible();
  await expect(page.locator('.result-count')).toHaveText('1 FILMS');
});

test('registers, signs in, and signs out', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open login menu' }).click();
  await page.getByRole('button', { name: /Create one/ }).click();

  const registration = page.locator('.account-form');
  await registration.locator('[autocomplete="username"]').fill('Jane Doe');
  await registration.locator('[autocomplete="email"]').fill('jane@example.com');
  const passwords = registration.locator('[autocomplete="new-password"]');
  await passwords.nth(0).fill('correct-password');
  await passwords.nth(1).fill('correct-password');
  await registration.getByRole('button', { name: 'Create account' }).click();
  await expect(
    page.getByRole('status').getByText('Account created successfully. Please log in.'),
  ).toBeVisible();

  const login = page.locator('.account-form');
  await login.locator('[autocomplete="email"]').fill('jane@example.com');
  await login.locator('[autocomplete="current-password"]').fill('correct-password');
  await login.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('button', { name: 'Account menu for Jane Doe' })).toBeVisible();

  await page.getByRole('button', { name: 'Account menu for Jane Doe' }).click();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('button', { name: 'Open login menu' })).toBeVisible();
});
