const films = [
  {
    _id: 'arrival',
    title: 'Arrival',
    year: 2016,
    genres: ['Drama', 'Sci-Fi'],
    imdb: { rating: 7.9 },
    runtime: 116,
    fullplot: 'A linguist works to communicate with visitors from another world.',
    directors: ['Denis Villeneuve'],
    cast: ['Amy Adams'],
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
  },
  {
    _id: 'archive',
    title: 'Archive',
    year: 2020,
    genres: ['Mystery'],
    imdb: { rating: 7.2 },
    runtime: 109,
    plot: 'A mystery in a quiet town.',
    director: 'A. Director',
    cast: ['An Actor'],
  },
];

const pageTwoFilm = {
  _id: 'second-page',
  title: 'The Second Page',
  year: 2022,
  genres: ['Adventure'],
  imdb: { rating: 7.1 },
  runtime: 108,
  plot: 'A title from the second page.',
  director: 'A. Director',
  cast: ['An Actor'],
};

function installApiStubs(): void {
  cy.intercept('GET', '/api/movies/*', (request) => {
    const url = new URL(request.url);
    const movieId = url.pathname.split('/').pop();
    const movie = films.find((film) => film._id === movieId);
    request.reply({
      statusCode: movie ? 200 : 404,
      body: movie ?? { error: 'Movie not found' },
    });
  }).as('movieDetails');

  cy.intercept('GET', '/api/movies/genres', {
    body: { genres: ['Drama', 'Sci-Fi', 'Mystery'] },
  }).as('movieGenres');

  cy.intercept('GET', '/api/movies?*', (request) => {
    const url = new URL(request.url);
    const params = url.searchParams;
    const page = Number(params.get('page') ?? '1');
    if (page === 2 && !params.has('search') && !params.has('title') && !params.has('genres')) {
      request.reply({
        body: {
          data: [pageTwoFilm],
          pagination: {
            page,
            limit: 30,
            total: 31,
            pages: 2,
            hasNextPage: false,
            hasPrevPage: true,
          },
        },
      });
      return;
    }

    let results = [...films];
    const search = params.get('search')?.toLocaleLowerCase() ?? '';
    const title = params.get('title')?.toLocaleLowerCase() ?? '';
    const genres = params.get('genres')?.split(',') ?? [];
    if (search) {
      results = results.filter((film) =>
        [film.title, ...(film.directors ?? [film.director ?? ''])].some((value) =>
          value.toLocaleLowerCase().includes(search),
        ),
      );
    }
    if (title) {
      results = results.filter((film) => film.title.toLocaleLowerCase().includes(title));
    }
    if (genres.length > 0) {
      results = results.filter((film) => genres.every((genre) => film.genres.includes(genre)));
    }

    const filtered = search.length > 0 || title.length > 0 || genres.length > 0;
    const total = filtered ? results.length : 31;
    request.reply({
      body: {
        data: results,
        pagination: {
          page,
          limit: 30,
          total,
          pages: Math.ceil(total / 30),
          hasNextPage: page < Math.ceil(total / 30),
          hasPrevPage: page > 1,
        },
      },
    });
  }).as('movieList');

  cy.intercept('GET', '/api/comments*', {
    body: { data: [{ _id: 'comment-1', name: 'Alex', text: 'A lovely film.' }] },
  }).as('comments');
  cy.intercept('POST', '/api/comments', (request) => {
    request.reply({
      statusCode: 201,
      body: {
        comment: {
          _id: 'comment-2',
          name: request.body.name,
          text: request.body.text,
        },
      },
    });
  }).as('postComment');
  cy.intercept('POST', '/api/users', {
    statusCode: 201,
    body: { message: 'Created' },
  }).as('register');
  cy.intercept('POST', '/api/users/login', (request) => {
    if (request.body.password === 'wrong-password') {
      request.reply({ statusCode: 401, body: { error: 'Unauthorized' } });
      return;
    }
    request.reply({
      body: {
        token: 'test-token',
        user: { id: 'user-1', name: 'Jane Doe', email: 'jane@example.com' },
      },
    });
  }).as('login');
  cy.intercept('POST', '/api/users/logout', {
    body: { message: 'Logged out' },
  }).as('logout');
}

describe('Mosaic browser journeys', () => {
  beforeEach(() => installApiStubs());

  it('browses, paginates, searches, filters, and sorts the catalog', () => {
    cy.visit('/');
    cy.wait('@movieGenres');
    cy.wait('@movieList');
    cy.get('h1').should(($heading) => {
      expect($heading.text().replace(/\s/g, '')).to.include('Findyournextfavoritefilm');
    });
    cy.contains('.result-count', '31 FILMS').should('be.visible');

    cy.contains('button', 'Next').click();
    cy.wait('@movieList').its('request.url').should('include', 'page=2');
    cy.contains('h2', 'The Second Page').should('be.visible');

    cy.contains('button', 'Previous').click();
    cy.wait('@movieList');
    cy.get('.genre-pills').contains('button', 'Sci-Fi').click();
    cy.wait('@movieList').its('request.url').should('include', 'genres=Sci-Fi');
    cy.contains('button', 'Arrival').should('be.visible');

    cy.get('.genre-pills').contains('button', 'All films').click();
    cy.wait('@movieList');
    cy.get('[aria-label="Search movies"]').type('Moonlight');
    cy.wait('@movieList').its('request.url').should('include', 'search=Moonlight');
    cy.contains('button', 'Moonlight').should('be.visible');

    cy.get('[aria-label="Search movies"]').clear();
    cy.wait('@movieList');
    cy.contains('button', 'Advanced search').click();
    cy.get('[placeholder="Film title"]').type('Arrival');
    cy.contains('button', 'Apply filters').click();
    cy.wait('@movieList').its('request.url').should('include', 'title=Arrival');
    cy.get('[aria-label="Sort films"]').select('imdbRating');
    cy.wait('@movieList').its('request.url').should('include', 'sort=imdbRating');
    cy.contains('button', 'Clear filters').click();
    cy.wait('@movieList');
    cy.contains('h2', 'A little of everything').should('be.visible');
  });

  it('saves a film, opens its comments, and posts a comment', () => {
    cy.visit('/');
    cy.wait('@movieGenres');
    cy.wait('@movieList');
    cy.get('[aria-label="Add Arrival to watchlist"]').click();
    cy.contains('button', 'Watchlist 1').click();
    cy.wait('@movieDetails');
    cy.get('[aria-label="View Arrival"]').click();
    cy.wait('@comments');

    cy.get('[role="dialog"]').within(() => {
      cy.contains('A lovely film.').should('be.visible');
      cy.get('[aria-label="Your name"]').type('Morgan');
      cy.get('[aria-label="Your comment"]').type('The ending stayed with me.');
      cy.contains('button', 'Post comment').click();
      cy.wait('@postComment');
      cy.contains('The ending stayed with me.').should('be.visible');
    });

    cy.get('body').type('{esc}');
    cy.get('[role="dialog"]').should('not.exist');
  });

  it('validates registration, handles a rejected login, then signs in and out', () => {
    cy.visit('/');
    cy.wait('@movieGenres');
    cy.wait('@movieList');
    cy.get('[aria-label="Open login menu"]').click();
    cy.contains('button', 'Create one').click();

    cy.get('[autocomplete="username"]').type('Jane Doe');
    cy.get('[autocomplete="email"]').type('jane@example.com');
    cy.get('[autocomplete="new-password"]').first().type('correct-password');
    cy.get('[autocomplete="new-password"]').last().type('different-password');
    cy.contains('button', 'Create account').click();
    cy.get('[role="alert"]').should('contain.text', 'Passwords do not match.');

    cy.get('[autocomplete="new-password"]').last().clear().type('correct-password');
    cy.contains('button', 'Create account').click();
    cy.wait('@register');
    cy.get('[role="status"]').should(
      'contain.text',
      'Account created successfully. Please log in.',
    );

    cy.get('[autocomplete="email"]').clear().type('jane@example.com');
    cy.get('[autocomplete="current-password"]').type('wrong-password');
    cy.contains('button', 'Log in').click();
    cy.wait('@login');
    cy.get('[role="alert"]').should('contain.text', 'Invalid username or password.');

    cy.get('[autocomplete="current-password"]').clear().type('correct-password');
    cy.contains('button', 'Log in').click();
    cy.wait('@login');
    cy.get('[aria-label="Account menu for Jane Doe"]').should('be.visible').click();
    cy.contains('button', 'Log out').click();
    cy.wait('@logout');
    cy.get('[aria-label="Open login menu"]').should('be.visible');
  });
});
