/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  rootDir: '.',
  testMatch: ['<rootDir>/*.e2e.ts'],
  testTimeout: 120000,
  maxWorkers: 1,
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  reporters: ['detox/runners/jest/reporter'],
  testEnvironment: 'detox/runners/jest/testEnvironment',
  verbose: true,
  transform: { '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true, tsconfig: { module: 'commonjs', target: 'ES2020', esModuleInterop: true, types: ['jest', 'node', 'detox'] } }] },
};
