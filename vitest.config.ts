import { defineConfig, configDefaults } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  // ._* files are macOS metadata created on external drives
  test: { environment: 'node', exclude: [...configDefaults.exclude, '**/._*'] },
});
