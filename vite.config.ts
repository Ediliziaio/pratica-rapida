import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    // Port resolved in this order:
    //  1) PORT env var (used by harness to assign a free port)
    //  2) fallback to 8080 for local dev convenience
    port: process.env.PORT ? Number(process.env.PORT) : 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Esbuild minification — production-only optimization:
  // - `pure`: marca le call console.log / debug / info come prive di side
  //   effects → esbuild le rimuove via tree-shaking in build production.
  //   In dev restano (utili per diagnosi locale).
  // - Manteniamo console.warn e console.error per troubleshooting in prod
  //   (es. fix WhatsApp, debug auth) — sono diagnostici, non noise.
  esbuild: {
    pure: mode === "production" ? ["console.log", "console.debug", "console.info"] : [],
  },
  build: {
    // Code split per ridurre bundle size principale (era >500kb). Chunk
    // separati per dipendenze pesanti che cambiano raramente → meglio
    // cache browser + TTI iniziale più veloce.
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "lucide-react",
          ],
          "vendor-forms": ["react-hook-form", "@hookform/resolvers", "zod"],
          "vendor-date": ["date-fns"],
        },
        // Naming hash → cache invalidation deterministica + cache hit ottimale
        // su deploy successivi che non toccano un chunk.
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
    chunkSizeWarningLimit: 600,
    // CSS code split: ogni route lazy ha il suo file CSS → no flash di
    // styling non collegato + meno render-blocking sul first paint.
    cssCodeSplit: true,
    // Minify aggressive — usa esbuild (più veloce di terser, output simile)
    minify: "esbuild",
    // Source maps in production: utili per debug Sentry ma SOLO hidden
    // (no `//# sourceMappingURL=` nel bundle finale → no exposure).
    sourcemap: "hidden",
    // Asset inline limit: file < 4kb come data URL (riduce request count
    // per piccoli SVG/icons inline). Default 4096.
    assetsInlineLimit: 4096,
    // Target browser ES2020 — copre 95%+ browser moderni senza dover
    // polyfillare cose che gli installatori (Chrome/Safari recenti) hanno.
    target: "es2020",
    // Report compressed sizes in build log per visibilità performance.
    reportCompressedSize: true,
  },
}));
