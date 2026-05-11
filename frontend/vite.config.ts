import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { reactRouterDevTools } from 'react-router-devtools';
import devtoolsJson from 'vite-plugin-devtools-json';

export default defineConfig(({ isSsrBuild }) => ({
  build: {
    rollupOptions: isSsrBuild
      ? {
        input: './server/app.ts',
      }
      : undefined,
    target: 'es2022',
  },
  // SQLite in WAL mode (read by the Activity tab via better-sqlite3) creates
  // -shm and -wal companion files alongside the .db. Without this ignore list
  // vite's HMR sees them mutate on every loader invocation and triggers a
  // page reload, which re-runs the loader, which re-touches the SHM — infinite
  // reload loop. Excluding *.db* keeps HMR sane.
  server: {
    watch: {
      ignored: ['**/*.db', '**/*.db-shm', '**/*.db-wal', '**/*.db-journal'],
    },
  },
  plugins: [
    tailwindcss(),
    devtoolsJson(),
    reactRouterDevTools(),
    reactRouter(),
    tsconfigPaths(),
  ],
}));
