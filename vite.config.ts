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
      },
    },
    chunkSizeWarningLimit: 600,
  },
}));
