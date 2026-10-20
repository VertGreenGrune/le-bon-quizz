import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Several files share (and wipe) the same TEST_DATABASE_URL database.
    fileParallelism: false,
  },
});
