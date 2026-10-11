/**
 * Compilazione di EneaSubito: separata da quella dell'altro marchio.
 *
 * Non e' una raffinatezza. Con una compilazione sola, la pagina servita
 * portava in fisso un canonical verso l'altro sito, e la cartella public/
 * ci avrebbe infilato dentro guide, contratti e logo che con questo marchio
 * non c'entrano niente. Qui: pagina propria, cartella propria, e nel
 * pacchetto finisce solo il codice di queste pagine.
 *
 *   bun run build:eneasubito   →   dist-eneasubito/
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { rename } from "fs/promises";

const USCITA = "dist-eneasubito";

export default defineConfig({
  plugins: [
    react(),
    {
      // Vite emette il file col nome dell'ingresso; un sito statico deve
      // servire index.html, quindi lo rinominiamo a compilazione finita.
      name: "eneasubito-rinomina-indice",
      closeBundle: async () => {
        await rename(
          path.resolve(__dirname, USCITA, "index.eneasubito.html"),
          path.resolve(__dirname, USCITA, "index.html"),
        );
      },
    },
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  // La public/ condivisa contiene materiale dell'altro marchio: qui si usa
  // la propria, con il suo robots.txt e il reindirizzamento per le pagine
  // interne (senza, /verifica darebbe 404 a ogni ricarica).
  publicDir: path.resolve(__dirname, "public-eneasubito"),
  esbuild: {
    pure: ["console.log", "console.debug", "console.info"],
  },
  build: {
    outDir: USCITA,
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "index.eneasubito.html"),
      output: {
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
    target: "es2020",
    minify: "esbuild",
    cssCodeSplit: true,
    sourcemap: false,
    reportCompressedSize: true,
  },
});
