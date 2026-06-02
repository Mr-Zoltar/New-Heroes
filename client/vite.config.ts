import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    host: true,
  },
  // The shared package ships raw TypeScript; let Vite transform it through the
  // normal pipeline instead of trying to pre-bundle it as a dependency.
  optimizeDeps: {
    exclude: ["@new-heroes/shared"],
  },
});
