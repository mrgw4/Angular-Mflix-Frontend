import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DiscoverPage } from './discover-page';

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
  ],
};

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function submit(form: HTMLFormElement): void {
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
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

    httpTesting
      .expectOne('/api/comments?movieId=movie-123')
      .flush({ data: [{ _id: 'comment-1', name: 'Alex', text: 'A lovely film.' }] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('A lovely film.');

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
    registration.flush({ message: 'User created successfully' }, { status: 201, statusText: 'Created' });
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
});
