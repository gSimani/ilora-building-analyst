import { defineConfig } from "vite";

// The simulator is served by the MCP server itself in production (npm start).
// `npm run sim` runs Vite with hot reload and proxies /mcp and /api to it.
export default defineConfig({
  root: import.meta.dirname,
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { "/mcp": "http://127.0.0.1:8787", "/api": "http://127.0.0.1:8787" },
  },
});
