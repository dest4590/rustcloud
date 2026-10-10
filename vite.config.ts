import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { safeCssInject } from "./vite-safe-css.ts";

export default defineConfig({
  plugins: [vue(), safeCssInject()],
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "production",
    ),
  },
  build: {
    outDir: "dist",
    emptyOutDir: false,

    rollupOptions: {
      input: {
        inject: "src/inject.ts",
      },
      output: {
        entryFileNames: "[name].js",
        format: "iife",
      },
    },
  },
  clearScreen: false,
});
