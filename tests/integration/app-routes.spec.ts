import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../src/app/app.routes';

describe('Application routes', () => {
  let harness: RouterTestingHarness;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)],
    }).compileComponents();

    harness = await RouterTestingHarness.create();
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  async function navigateToDiscover(path: string): Promise<void> {
    await harness.navigateByUrl(path);
    httpTesting.expectOne('/api/movies/genres').flush({ genres: [] });
    httpTesting
      .expectOne((request) => request.url === '/api/movies')
      .flush({
        data: [],
        pagination: {
          page: 1,
          limit: 30,
          total: 0,
          pages: 0,
          hasNextPage: false,
          hasPrevPage: false,
        },
      });
    harness.fixture.detectChanges();
  }

  it('renders the discover page inside the application shell', async () => {
    await navigateToDiscover('/');

    expect(harness.fixture.nativeElement.textContent).toContain('Find your nextfavorite film');
    expect(
      harness.fixture.nativeElement.querySelector('[aria-label="Main navigation"]'),
    ).toBeTruthy();
  });

  it('loads the movie detail route inside the application shell', async () => {
    await harness.navigateByUrl('/movies/movie-123');

    expect(harness.fixture.nativeElement.textContent).toContain(
      'Movie details are ready for implementation.',
    );
    httpTesting.expectNone('/api/movies');
  });

  it('loads the watchlist route inside the application shell', async () => {
    await harness.navigateByUrl('/watchlist');

    expect(harness.fixture.nativeElement.textContent).toContain(
      'Your watchlist is ready for implementation.',
    );
    httpTesting.expectNone('/api/movies');
  });

  it('redirects unknown routes to discover', async () => {
    await navigateToDiscover('/not-a-route');

    expect(harness.fixture.nativeElement.textContent).toContain('Find your nextfavorite film');
  });
});
