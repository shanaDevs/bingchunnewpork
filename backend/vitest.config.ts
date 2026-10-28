import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/utils/phone.ts', 'src/controllers/authController.ts'],
      reporter: ['text', 'html'],
    },
  },
});
