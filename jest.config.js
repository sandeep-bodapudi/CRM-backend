/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/tests/api'],
  // env.ts runs first and refuses any non-local database.
  setupFiles: ['<rootDir>/tests/api/env.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/api/setup.ts'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@rrh-ems/shared$': '<rootDir>/packages/shared/src/index.ts',
    '^@/(.*)$': '<rootDir>/apps/api/src/$1'
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json'
      }
    ]
  },
  verbose: true,
  testTimeout: 10000,
  detectOpenHandles: true,
  forceExit: true
};
