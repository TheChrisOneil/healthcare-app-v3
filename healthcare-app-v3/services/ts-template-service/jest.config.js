/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  preset: 'ts-jest',
  testEnvironment: "node",
  testMatch: ['**/tests/**/*.test.ts'], 
  moduleFileExtensions: ['ts', 'js'],
  transform: {
    '^.+\\.ts?$': 'ts-jest',
  },
  moduleNameMapper: {
    "^shared-interfaces/(.*)$": "../../../../shared-interfaces/src/$1",
  },
  verbose: true,
  collectCoverage: true,
  coverageDirectory: 'coverage',
};