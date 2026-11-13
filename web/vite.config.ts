import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [
    tailwindcss(),
    viteSingleFile({
      removeViteModuleLoader: true,
    }),
  ],
  build: {
    target: "es2022",
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    minify: "esbuild",
  },
});
