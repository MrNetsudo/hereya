'use strict';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['./tests/setup.js'],   // runs before framework — sets env vars
  collectCoverageFrom: ['src/**/*.js'],
  coverageThreshold: {
    global: { branches: 60, functions: 70, lines: 70, statements: 70 },
  },
  testTimeout: 10000,
  verbose: true,
};
