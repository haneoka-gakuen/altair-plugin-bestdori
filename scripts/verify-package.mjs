import { access, readFile, readdir } from "node:fs/promises";

const manifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
for (const path of [
  "dist/index.js",
  "dist/index.d.ts",
  "LICENSE",
  "README.md",
]) {
  await access(new URL(`../${path}`, import.meta.url));
}
if (manifest.name !== "@haneoka/altair-plugin-bestdori") {
  throw new Error("Unexpected package name");
}
if (manifest.altair?.pluginApi !== 2 || manifest.altair?.kind !== "format") {
  throw new Error("Altair plugin metadata is incomplete");
}
if (!manifest.altair.capabilities?.includes("assets")) {
  throw new Error("Altair resource-browser capability is not declared");
}
if (
  manifest.dependencies?.["@haneoka/bestdori"] ||
  manifest.devDependencies?.["@haneoka/bestdori"]
) {
  throw new Error("Package metadata still depends on Haneoka's Bestdori package");
}
const distFiles = await readdir(new URL("../dist/", import.meta.url));
if (distFiles.some((file) => file.includes("story-editor"))) {
  throw new Error("Published output still contains the removed host editor entry");
}
const distSource = (
  await Promise.all(
    distFiles
      .filter((file) => /\.(?:js|d\.ts)$/u.test(file))
      .map((file) => readFile(new URL(`../dist/${file}`, import.meta.url), "utf8")),
  )
).join("\n");
if (
  distSource.includes("@haneoka/bestdori") ||
  distSource.includes("our-notes/packages/bestdori")
) {
  throw new Error("Published output still depends on Haneoka's former Bestdori package");
}
for (const path of [
  "dist/source.js",
  "dist/source.d.ts",
  "dist/resource-browser.js",
  "dist/resource-browser.d.ts",
  "dist/provider.js",
  "dist/provider.d.ts",
]) {
  await access(new URL(`../${path}`, import.meta.url));
}
console.log(`Verified ${manifest.name}@${manifest.version}`);
