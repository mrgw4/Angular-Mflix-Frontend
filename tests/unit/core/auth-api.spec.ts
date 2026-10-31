import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from '../../../src/app/core/auth-api';

describe('AuthApi', () => {
  let api: AuthApi;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(AuthApi);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('sends login credentials and returns a validated session', async () => {
    const result = firstValueFrom(api.login('jane@example.com', 'correct-password'));
    const request = httpTesting.expectOne('/api/users/login');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      email: 'jane@example.com',
      password: 'correct-password',
    });
    request.flush({
      token: 'test-token',
      user: { id: 'user-1', name: 'Jane Doe', email: 'jane@example.com' },
    });

    await expectAsync(result).toBeResolvedTo({
      token: 'test-token',
      user: { id: 'user-1', name: 'Jane Doe', email: 'jane@example.com' },
    });
  });

  it('rejects malformed login responses', async () => {
    const result = firstValueFrom(api.login('jane@example.com', 'password'));
    httpTesting.expectOne('/api/users/login').flush({ token: '', user: null });

    await expectAsync(result).toBeRejectedWithError(
      'The server returned an invalid login response.',
    );
  });

  it('maps unauthorized login responses to a useful message', async () => {
    const result = firstValueFrom(api.login('jane@example.com', 'wrong-password'));
    httpTesting
      .expectOne('/api/users/login')
      .flush({ error: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    await expectAsync(result).toBeRejectedWithError('Invalid username or password.');
  });

  it('returns server error messages for failed registration requests', async () => {
    const result = firstValueFrom(api.register('Jane Doe', 'jane@example.com', 'password'));
    const request = httpTesting.expectOne('/api/users');
    expect(request.request.body).toEqual({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'password',
    });
    request.flush(
      { error: 'That email is already registered.' },
      {
        status: 409,
        statusText: 'Conflict',
      },
    );

    await expectAsync(result).toBeRejectedWithError('That email is already registered.');
  });

  it('ends a session and surfaces logout failures', async () => {
    const logoutResult = firstValueFrom(api.logout('test-token'));
    const logoutRequest = httpTesting.expectOne('/api/users/logout');
    expect(logoutRequest.request.method).toBe('POST');
    logoutRequest.flush({ message: 'Logged out' });
    await expectAsync(logoutResult).toBeResolvedTo(undefined);

    const failedResult = firstValueFrom(api.logout('test-token'));
    httpTesting
      .expectOne('/api/users/logout')
      .flush({}, { status: 500, statusText: 'Server Error' });
    await expectAsync(failedResult).toBeRejectedWithError('Request failed (500).');
  });
});
