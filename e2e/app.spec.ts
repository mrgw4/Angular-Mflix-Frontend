import { expect, test } from '@playwright/test';

test('loads the MFlix application shell', async ({ page }) => {
  await page.route('**/api/movies*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        movies: [
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
        ],
      }),
    }),
  );

  await page.goto('/');

  await expect(page.getByRole('heading', { name: /Find your next favorite film/ })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Arrival' })).toBeVisible();

  await page.getByRole('searchbox', { name: 'Search movies' }).fill('Moonlight');
  await expect(page.locator('.movie-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Add Moonlight to watchlist' }).click();
  await page.getByRole('button', { name: 'Watchlist 1' }).click();
  await expect(page.locator('.movie-card')).toHaveCount(1);

  await page.getByRole('button', { name: 'Moonlight', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Moonlight' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
