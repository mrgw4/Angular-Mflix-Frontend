import { expect, test, type Page } from '@playwright/test';

async function mockApi(page: Page): Promise<void> {
  await page.route('**/api/movies*', (route) => {
    const params = new URL(route.request().url()).searchParams;
    const selectedGenres = params.get('genres')?.split(',') ?? [];
    const pageNumber = Number(params.get('page') ?? '1');
    const search = params.get('search')?.toLowerCase() ?? '';
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
    } else if (pageNumber === 2 && selectedGenres.length === 0) {
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

    const total = search || selectedGenres.length > 0 ? movies.length : 12000;
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
