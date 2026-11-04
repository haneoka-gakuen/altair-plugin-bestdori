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
        sekai: "src/bestdori-source/sekai.ts",
        diagnostics: "src/bestdori-source/diagnostics.ts",
        input: "src/bestdori-source/input.ts",
        live2d: "src/bestdori-source/live2d.ts",
        resources: "src/bestdori-source/resources.ts",
        scenario: "src/bestdori-source/scenario.ts",
        scene: "src/bestdori-source/scene.ts",
        transport: "src/bestdori-source/transport.ts",
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
