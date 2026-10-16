# MFlix Angular Frontend

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.0.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

Unit tests use Jasmine with Karma:

```bash
ng test
```

## Running end-to-end tests

Browser tests use Playwright. Install Chromium once with:

```bash
npx playwright install chromium
```

Run browser tests with:

```bash
npm run test:e2e
```

## Backend API

The frontend uses relative `/api` URLs. During development, `proxy.conf.json` forwards API and `/health` requests to the backend at `http://localhost:5000`, matching the backend's default `PORT`. Keep MongoDB credentials and database access in the backend, never in this browser application. Production hosting must also route `/api` and `/health` to the backend.

## Angular structure

The application is organized around screens and route-owned features:

```text
src/app/
	core/       app-wide API clients, services, guards, and models
	layout/     app shell and global navigation
	features/   route-owned screens and feature components
		discover/
		movies/
		watchlist/
	shared/     reusable presentational components, pipes, and directives
```

Keep screen coordination in feature pages, move reusable UI into `shared`, and keep backend communication in focused services under `core`.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
