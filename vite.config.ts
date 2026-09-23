import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: "src/index.ts",
        assets: "src/assets.ts",
        provider: "src/provider.ts",
        "resource-browser": "src/resource-browser.ts",
        source: "src/source.ts",
      },
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    sourcemap: true,
    rollupOptions: {
      external: [
        "@haneoka/vega-protocol/coordinates",
        "@haneoka/altair",
        "@haneoka/altair/plugins",
        "@haneoka/altair-plugin-adv",
      ],
    },
  },
});
