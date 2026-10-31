import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, throwError, type Observable } from 'rxjs';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function requestError(error: unknown, unauthorizedMessage?: string): Error {
  if (!(error instanceof HttpErrorResponse)) {
    return error instanceof Error ? error : new Error('The server returned an invalid response.');
  }

  if (error.status === 401 && unauthorizedMessage) {
    return new Error(unauthorizedMessage);
  }

  const message = asRecord(error.error)['error'];
  return new Error(
    typeof message === 'string' ? message : `Request failed (${error.status}).`,
  );
}

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);
  private readonly usersEndpoint = '/api/users';

  login(email: string, password: string): Observable<AuthSession> {
    return this.http
      .post<unknown>(`${this.usersEndpoint}/login`, { email, password })
      .pipe(
        map((payload) => {
          const record = asRecord(payload);
          const user = asRecord(record['user']);
          if (
            typeof record['token'] !== 'string' ||
            !record['token'] ||
            typeof user['id'] !== 'string' ||
            typeof user['name'] !== 'string' ||
            typeof user['email'] !== 'string'
          ) {
            throw new Error('The server returned an invalid login response.');
          }

          return {
            token: record['token'],
            user: {
              id: user['id'],
              name: user['name'],
              email: user['email'],
            },
          };
        }),
        catchError((error: unknown) =>
          throwError(() => requestError(error, 'Invalid username or password.')),
        ),
      );
  }

  register(name: string, email: string, password: string): Observable<void> {
    return this.http
      .post<unknown>(this.usersEndpoint, { name, email, password })
      .pipe(
        map(() => undefined),
        catchError((error: unknown) => throwError(() => requestError(error))),
      );
  }

  logout(token: string): Observable<void> {
    return this.http
      .post<unknown>(
        `${this.usersEndpoint}/logout`,
        {},
        { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) },
      )
      .pipe(
        map(() => undefined),
        catchError((error: unknown) => throwError(() => requestError(error))),
      );
  }
}
