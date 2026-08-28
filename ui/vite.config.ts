import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: 'ui/operations',
  plugins: [viteSingleFile()],
  build: {
    outDir: '../../dist/ui/operations',
    emptyOutDir: true,
    target: 'es2022',
  },
});
