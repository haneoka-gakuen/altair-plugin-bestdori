import { cloneStoryValue, type JsonObject } from "@haneoka/altair/model";
import type { StoryImportResult } from "@haneoka/altair-plugin-adv";
import { importBestdoriScenario, type ImportBestdoriScenarioOptions } from "./story-project.js";
import type { BestdoriScenarioBase, BestdoriScenarioSource } from "./bestdori-source/scenario.js";
import { isRecord, parseBestdoriJson, type BestdoriInput } from "./bestdori-source/input.js";
import type { BestdoriServer } from "./bestdori-source/transport.js";

export interface BestdoriCommunitySource {
  server?: number;
  voice?: string;
  background?: Record<string, unknown> | null;
  bgm?: Record<string, unknown> | null;
  actions: Record<string, unknown>[];
  [key: string]: unknown;
}
const record = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {};
const text = (value: unknown) => typeof value === "string" ? value : "";
const list = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.map(record) : [];
const sides = ["none", "left", "leftOver", "leftInside", "center", "right", "rightOver", "rightInside", "leftUnder", "leftInsideUnder", "centerUnder", "rightUnder", "rightInsideUnder"];
const effects = ["none", "blackIn", "blackOut", "whiteIn", "whiteOut", "shakeScreen", "shakeWindow", "changeBackground", "telop", "flashbackIn", "flashbackOut", "changeCardStill", "ambientColorNormal", "ambientColorEvening", "ambientColorNight", "playScenarioEffect", "stopScenarioEffect", "changeBackgroundStill"];
const servers: readonly BestdoriServer[] = ["jp", "en", "tw", "cn", "kr"];
function contentLocale(value: unknown, locale: string, key = ""): unknown {
  if (Array.isArray(value)) {
    if (["text", "targetTextNames", "name", "title", "label", "message"].includes(key) && value.length === 5 && value.every((part) => typeof part === "string")) return { [locale]: value[0] };
    return value.map((part) => contentLocale(part, locale, key));
  }
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([name, part]) => [name, contentLocale(part, locale, name)]));
  return value;
}
function externalCommunityAssets(source: BestdoriCommunitySource): { source: BestdoriCommunitySource; aliases: Map<string, string> } {
  const copy = cloneStoryValue(source as unknown as JsonObject) as unknown as BestdoriCommunitySource;
  const aliases = new Map<string, string>();
  const bind = (value: unknown) => {
    if (!isRecord(value) || value.type !== "custom" || !value.url) return;
    const url = new URL(String(value.url));
    const host = url.hostname.toLowerCase(), ip = host.split(".").map(Number);
    if (url.protocol !== "https:" || url.username || url.password || !host.includes(".") || /(?:^|\.)(?:localhost|local|internal)$/u.test(host) || host.includes(":") || ip.length === 4 && ip.every(Number.isInteger) && (ip[0] === 0 || ip[0] === 10 || ip[0] === 127 || ip[0]! >= 224 || ip[0] === 169 && ip[1] === 254 || ip[0] === 172 && ip[1]! >= 16 && ip[1]! <= 31 || ip[0] === 192 && ip[1] === 168)) throw new TypeError("Invalid Bestdori community asset URL");
    let hash = 0xcbf29ce484222325n;
    for (const byte of new TextEncoder().encode(url.href)) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
    const alias = `/assets/community/${hash.toString(16)}`;
    if (aliases.has(alias) && aliases.get(alias) !== url.href) throw new TypeError("Conflicting Bestdori community assets");
    aliases.set(alias, url.href);
    value.url = alias;
  };
  bind(copy.background); bind(copy.bgm);
  for (const action of copy.actions) { bind(action.background); bind(action.bgm); bind(action.se); }
  return { source: copy, aliases };
}

export function isBestdoriCommunitySource(value: unknown): boolean {
  const post = isRecord(value) && isRecord(value.post) ? value.post : record(value);
  if (post.storySource !== undefined) return typeof post.storySource === "string" || isRecord(post.storySource);
  return Array.isArray(post.actions) && ("server" in post || "background" in post || "voice" in post);
}
export function parseBestdoriCommunitySource(input: BestdoriInput): { source: BestdoriCommunitySource; metadata: Record<string, unknown> } {
  const raw = parseBestdoriJson(input);
  const post = isRecord(raw) && isRecord(raw.post) ? raw.post : record(raw);
  const source = post.storySource === undefined ? post : typeof post.storySource === "string" ? parseBestdoriJson(post.storySource) : post.storySource;
  if (!isRecord(source) || !Array.isArray(source.actions) || source.actions.some((action) => !isRecord(action) || typeof action.type !== "string")) throw new TypeError("Invalid Bestdori community story");
  if (source.server !== undefined && (!Number.isInteger(source.server) || Number(source.server) < 0 || Number(source.server) >= servers.length)) throw new TypeError("Invalid Bestdori community server");
  const { storySource: _, storyScenario: __, ...metadata } = post;
  return { source: cloneStoryValue(source as unknown as JsonObject) as unknown as BestdoriCommunitySource, metadata: post.storySource === undefined ? {} : metadata };
}
function background(value: unknown): { bundle: string; file: string } {
  const asset = record(value);
  return asset.type === "custom" ? { bundle: "BESTDORI##URL", file: text(asset.url) } : { bundle: text(asset.bundle), file: text(asset.file) };
}
function music(value: unknown): string {
  const asset = record(value);
  return asset.type === "custom" ? `BESTDORI##URL:${text(asset.url)}` : text(asset.file);
}
function sound(value: unknown): { bundle: string; file: string } {
  const asset = record(value);
  return asset.type === "common" ? { bundle: "", file: text(asset.se) } : background(asset);
}
/** Community actions lower into the same scenario contract as Bestdori's own editor. */
export function bestdoriCommunityScenario(source: BestdoriCommunitySource): BestdoriScenarioSource {
  const initial = background(source.background);
  const scenario: BestdoriScenarioBase = { firstBackgroundBundleName: initial.bundle, firstBackground: initial.file, firstBgm: music(source.bgm), snippets: [], appearCharacters: [], talkData: [], layoutData: [], specialEffectData: [], soundData: [], selectableData: [] };
  const costumes = new Set<string>();
  for (const [index, action] of source.actions.entries()) {
    const type = text(action.type);
    let referenceIndex: number;
    const addCostume = () => {
      const characterId = Number(action.character), costumeType = text(action.costume), key = `${characterId}:${costumeType}`;
      if (characterId && costumeType && !costumes.has(key)) { costumes.add(key); scenario.appearCharacters!.push({ characterId, costumeType }); }
    };
    switch (type) {
      case "talk":
        referenceIndex = scenario.talkData!.length;
        scenario.talkData!.push({ talkCharacters: (Array.isArray(action.characters) ? action.characters : []).map((id) => ({ characterId: Number(id) })), windowDisplayName: text(action.name), body: text(action.body), whenFinishCloseWindow: action.close ? 1 : 0, motions: list(action.motions).map((motion) => ({ characterId: Number(motion.character), motionName: text(motion.motion), expressionName: text(motion.expression), timingSyncValue: Number(motion.delay ?? 0) })), voices: list(action.voices).map((voice) => ({ characterId: Number(voice.character), voiceId: text(voice.voice), ...(typeof voice.volume === "number" ? { volume: voice.volume } : {}) })) });
        break;
      case "layout":
      case "motion": {
        referenceIndex = scenario.layoutData!.length;
        const layoutType = text(action.layoutType);
        if (type === "layout" && !["none", "move", "appear", "hide", "shakeX", "shakeY"].includes(layoutType)) throw new TypeError(`Unsupported Bestdori layout: ${layoutType}`);
        scenario.layoutData!.push({ characterId: Number(action.character), costumeType: text(action.costume), motionName: text(action.motion), expressionName: text(action.expression), ...(type === "layout" ? { type: ["none", "move", "appear", "hide", "shakeX", "shakeY"].indexOf(layoutType), sideFrom: sides.indexOf(text(action.sideFrom) || "none"), sideTo: sides.indexOf(text(action.sideTo) || "none"), sideFromOffsetX: Number(action.sideFromOffsetX ?? 0), sideToOffsetX: Number(action.sideToOffsetX ?? 0), ...(typeof action.depthType === "number" ? { depthType: action.depthType } : {}), ...(typeof action.moveSpeedType === "number" ? { moveSpeedType: action.moveSpeedType } : {}) } : {}) });
        addCostume();
        break;
      }
      case "effect": {
        referenceIndex = scenario.specialEffectData!.length;
        const effectType = text(action.effectType), code = effects.indexOf(effectType);
        if (code < 0) throw new TypeError(`Unsupported Bestdori effect: ${effectType}`);
        const bg = background(action.background);
        const fields = effectType === "changeBackground" ? { stringVal: bg.bundle, stringValSub: bg.file } : effectType === "changeCardStill" ? { stringVal: text(action.bundle), stringValSub: text(action.file) } : effectType === "telop" ? { stringVal: text(action.text) } : {};
        scenario.specialEffectData!.push({ ...record(action.fields), effectType: code, ...(typeof action.duration === "number" ? { duration: action.duration } : {}), ...fields });
        break;
      }
      case "sound": {
        referenceIndex = scenario.soundData!.length;
        const se = sound(action.se);
        scenario.soundData!.push({ bgm: music(action.bgm), se: se.file, seBundleName: se.bundle });
        break;
      }
      case "selectable":
        referenceIndex = scenario.selectableData!.length;
        scenario.selectableData!.push({ selectables: list(action.selectables).map((value) => ({ text: text(value.text), index: Number(value.index) })) });
        break;
      default: throw new TypeError(`Unsupported Bestdori community action: ${type} (${index + 1})`);
    }
    scenario.snippets!.push({ actionType: ["none", "talk", "layout", "input", "motion", "selectable", "effect", "sound"].indexOf(type), referenceIndex, delay: Number(action.delay ?? 0), progressType: action.wait ? 1 : 0 });
  }
  return { Base: scenario };
}
export function importBestdoriCommunityStory(input: BestdoriInput, options: ImportBestdoriScenarioOptions = {}): StoryImportResult {
  const { source, metadata } = parseBestdoriCommunitySource(input);
  const external = externalCommunityAssets(source);
  const scenario = bestdoriCommunityScenario(external.source);
  const result = importBestdoriScenario(scenario, { ...options, proxify: (path) => external.aliases.get(path) ?? options.proxify?.(path) ?? path, title: options.title ?? (text(metadata.title) || "Bestdori"), sceneName: options.sceneName ?? (text(metadata.title) || "Bestdori"), server: options.server ?? servers[source.server ?? 0]!, voiceBundle: options.voiceBundle ?? source.voice ?? "" });
  const customSlots = new Set(scenario.Base.appearCharacters!.filter((actor) => Number(actor.costumeType?.match(/^\d+/u)?.[0]) !== actor.characterId).map((actor) => `chara_${actor.characterId}`));
  const cleanSlotPortrait = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(cleanSlotPortrait); return; }
    if (!isRecord(value)) return;
    const externalSource = external.aliases.get(text(value.sourcePath));
    if (externalSource) {
      value.sourcePath = externalSource;
      if (text(value.resourceRef).startsWith("bg:")) { delete value.sourceAspectRatio; delete value.stageRef; }
    }
    if (customSlots.has(text(value.target)) || (typeof value.characterId === "number" && customSlots.has(`chara_${value.characterId}`))) delete value.faceImage;
    Object.values(value).forEach(cleanSlotPortrait);
  };
  cleanSlotPortrait(result.project.assets);
  for (const scene of result.project.scenes) for (const command of scene.commands) cleanSlotPortrait(command.fields);
  if (options.locale) {
    result.project.meta.locale = options.locale;
    for (const scene of result.project.scenes) for (const command of scene.commands) command.fields = contentLocale(command.fields, options.locale) as JsonObject;
  }
  result.project.extensions.bestdoriCommunity = { version: 1, source: cloneStoryValue(source as unknown as JsonObject), metadata: cloneStoryValue(metadata as JsonObject) };
  result.project.meta.provenance = { ...result.project.meta.provenance, sourceKind: "bestdori-community" };
  return result;
}
