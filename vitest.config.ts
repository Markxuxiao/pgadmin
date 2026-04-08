import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/types/**', 'src/app.ts']
    },
    alias: {
      bcrypt: '/Users/xuxiao/conductor/workspaces/pgadmin/provo/tests/__mocks__/bcrypt.js'
    }
  }
});
