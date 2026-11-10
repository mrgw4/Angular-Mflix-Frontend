import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://127.0.0.1:4300',
    specPattern: 'tests/cypress/**/*.cy.ts',
    supportFile: false,
  },
});
