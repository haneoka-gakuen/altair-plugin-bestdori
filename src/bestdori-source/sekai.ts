import { convertBestdoriScenario, type BestdoriScenarioBase, type BestdoriScenarioContext } from "./scenario.js";
import { parseBestdoriJson, type BestdoriInput } from "./input.js";
import { BestdoriFormatError } from "./diagnostics.js";
type Obj = Record<string, unknown>;
const lowerFirst = (key: string) => key.charAt(0).toLowerCase() + key.slice(1);
const camel = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(camel)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [lowerFirst(key), camel(entry)]))
      : value;

/** Keeps a Sekai Character2dId clear of BanG Dream's character ids, which the converter gives icons. */
export const SEKAI_CHARACTER_ID_BASE = 1_000_000;
const character = (value: unknown): { characterId?: number } =>
  Number(value) > 0 ? { characterId: SEKAI_CHARACTER_ID_BASE + Number(value) } : {};

/**
 * The game's scenario asset is the same structure the Bestdori converter
 * reads, with capitalised keys, `Character2dId`/`FacialName` in place of
 * `characterId`/`expressionName`, and its own asset layout.
 */
export const sekaiScenarioBase = (
  source: Obj,
  effects: ReadonlyMap<string, string> = new Map(),
  voices?: ReadonlySet<string>,
  asset: (path: string) => string = (path) => path,
): BestdoriScenarioBase => {
  const rows = (key: string) => (camel(source[key] ?? []) as Obj[]) ?? [];
  const background = (name: unknown) => asset(`scenario/background/${String(name)}/${String(name)}.webp`);
  const bgm = (name: unknown) =>
    name ? `BESTDORI##URL:${asset(`sound/scenario/bgm/${String(name)}/${String(name)}.mp3`)}` : "";
  return {
    scenarioSceneId: String(source.ScenarioId),
    firstBgm: bgm(source.FirstBgm),
    ...(source.FirstBackground
      ? { firstBackground: background(source.FirstBackground), firstBackgroundBundleName: "BESTDORI##URL" }
      : {}),
    appearCharacters: rows("AppearCharacters").map((entry) => ({
      ...character(entry.character2dId),
      costumeType: String(entry.costumeType ?? ""),
    })),
    layoutData: rows("LayoutData").map((layout) => ({
      type: Number(layout.type),
      ...character(layout.character2dId),
      costumeType: String(layout.costumeType ?? ""),
      motionName: String(layout.motionName ?? ""),
      expressionName: String(layout.facialName ?? ""),
      sideFrom: Number(layout.sideFrom),
      sideFromOffsetX: Number(layout.sideFromOffsetX),
      sideTo: Number(layout.sideTo),
      sideToOffsetX: Number(layout.sideToOffsetX),
      depthType: Number(layout.depthType),
      moveSpeedType: Number(layout.moveSpeedType),
    })),
    snippets: rows("Snippets").map((snippet) => ({
      actionType: Number(snippet.action),
      progressType: Number(snippet.progressBehavior),
      referenceIndex: Number(snippet.referenceIndex),
      delay: Number(snippet.delay),
    })),
    talkData: rows("TalkData").map((talk) => ({
      talkCharacters: ((talk.talkCharacters as Obj[]) ?? []).map((entry) => ({
        ...character(entry.character2dId),
      })),
      windowDisplayName: String(talk.windowDisplayName ?? ""),
      body: String(talk.body ?? ""),
      lipSyncMode: Number(talk.lipSync),
      motions: ((talk.motions as Obj[]) ?? []).map((motion) => ({
        ...character(motion.character2dId),
        motionName: String(motion.motionName ?? ""),
        expressionName: String(motion.facialName ?? ""),
        timingSyncValue: Number(motion.timingSyncValue),
      })),
      voices: ((talk.voices as Obj[]) ?? [])
        .filter((voice) => !voices || voices.has(`${String(voice.voiceId)}.mp3`))
        .map((voice) => ({
          ...character(voice.character2dId),
          voiceId: String(voice.voiceId),
          volume: Number(voice.volume),
        })),
      whenFinishCloseWindow: Number(talk.whenFinishCloseWindow),
    })),
    soundData: rows("SoundData").map((sound) => {
      const effect = effects.get(String(sound.se));
      return {
        bgm: bgm(sound.bgm),
        volume: Number(sound.volume),
        ...(effect ? { se: asset(effect), seBundleName: "BESTDORI##URL" } : {}),
      };
    }),
    specialEffectData: rows("SpecialEffectData").map((effect) =>
      effect.effectType === 7
        ? { effectType: 7, stringVal: "BESTDORI##URL", stringValSub: background(effect.stringVal) }
        : {
            effectType: Number(effect.effectType),
            stringVal: String(effect.stringVal ?? ""),
            duration: Number(effect.duration),
          },
    ),
  };
};

export function convertSekaiScenario(
  input: BestdoriInput,
  context: BestdoriScenarioContext,
  options: {
    effects?: ReadonlyMap<string, string>;
    voices?: ReadonlySet<string>;
    asset?: (path: string) => string;
  } = {},
) {
  const source = parseBestdoriJson(input) as Obj;
  if (!source || typeof source !== "object" || !Array.isArray(source.Snippets))
    throw new BestdoriFormatError("sekai.scenario", "$", "Invalid Project SEKAI scenario");
  return {
    ...convertBestdoriScenario(
      { Base: sekaiScenarioBase(source, options.effects, options.voices, options.asset) },
      context,
    ),
    sourceScenario: source,
  };
}
