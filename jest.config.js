// Runs the TypeScript layer (src/index.ts) in node. `react-native` is replaced by test/react-native-mock.ts, so neither
// React Native nor a simulator is needed:  npm i -D jest ts-jest @types/jest typescript && npx jest
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  moduleNameMapper: { '^react-native$': '<rootDir>/test/react-native-mock.ts' },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true, tsconfig: { module: 'commonjs', moduleResolution: 'node', target: 'ES2020', esModuleInterop: true, strict: true, types: ['jest', 'node'] } }],
  },
};
