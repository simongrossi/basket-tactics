import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.{test,spec}.{ts,tsx}'],
    // Origine non-opaque + polyfill Web Storage : vitest 4 + jsdom 29
    // n'exposent pas window.localStorage. Cf. vitest.setup.ts.
    environmentOptions: {
      jsdom: { url: 'http://localhost/' },
    },
    setupFiles: ['./vitest.setup.ts'],
  },
});
