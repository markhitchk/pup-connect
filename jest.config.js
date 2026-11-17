module.exports = {
  preset: '@react-native/jest-preset',
  testMatch: ['**/src/**/*.test.ts', '**/src/**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  transformIgnorePatterns: ['node_modules/(?!((jest-)?react-native|@react-native|react-native-url-polyfill)(/|$))'],
};
