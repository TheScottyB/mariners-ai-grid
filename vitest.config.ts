import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    '__DEV__': true,
  },
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/services/__tests__/setup.ts'],
    server: {
      deps: {
        external: [/node_modules\/react-native/],
      }
    }
  },
});
