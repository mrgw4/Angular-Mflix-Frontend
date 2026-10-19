# MFlix Angular Frontend

Angular 22 frontend for the MFlix API.

## Run locally

The app loads movies, comments, and account data from the backend. For the full experience, start MongoDB and the backend before starting Angular.

1. In a terminal, go to the backend project, install its dependencies, and configure its `.env` with your MongoDB connection and JWT secret. See the backend README for the required settings.

   ```bash
   cd "D:\Portfolio Code\Example-Blog-Backend-NodeJS-"
   npm install
   npm run dev
   ```

   The backend listens on `http://localhost:5000` by default.

2. In a second terminal, go to this Angular project directory and install the frontend dependencies:

   ```bash
   cd "D:\Portfolio Code\Angular-Mflix-Frontend"
   npm install
   ```

3. Start the Angular development server:

   ```bash
   npm start
   ```

4. Open [http://localhost:4200](http://localhost:4200) in your browser.

The Angular development proxy forwards `/api` and `/health` requests to `http://localhost:5000`, so no frontend API URL configuration is needed for local development. Keep MongoDB credentials and `.env` files in the backend; do not put them in this frontend. If the backend or MongoDB is not running, Angular can still start, but API-backed features such as the movie catalog, comments, and account actions will not work.

To stop either server, press `Ctrl+C` in its terminal. Frontend changes are picked up automatically by the development server.

## Other commands

Build the production app:

```bash
npm run build
```

Run unit tests:

```bash
npm test
```

Run browser tests (install Chromium once if needed):

```bash
npx playwright install chromium
npm run test:e2e
```

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
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

## Movie discovery features

The discovery page includes catalog search, genre filters, rating/year sorting, movie details, and a watchlist persisted in this browser's local storage. Film details load comments from `GET /api/comments?movieId=<id>` and submit comments to `POST /api/comments`; comment requests do not attach the account bearer token, so the backend's comment authorization rules apply. The account menu supports registration, login, and logout through `POST /api/users`, `POST /api/users/login`, and `POST /api/users/logout`; the authenticated session is stored in this browser's local storage. Watchlists and account sessions are not shared across browsers or devices.

The development proxy routes `/api` requests to `http://localhost:5000`. For production, route the same API paths to the backend and enable CORS for the frontend origin when they are hosted separately.

The discovery page's Jasmine spec covers comment loading/posting and the registration, login, session persistence, and logout flows.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
