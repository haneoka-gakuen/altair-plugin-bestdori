import {
  STORY_PROJECT_VERSION,
  cloneStoryValue,
  importedStoryId,
  type JsonObject,
  type StoryProject,
  type StoryProjectCommand,
} from "@haneoka/altair";
import {
  assertValidStoryProject,
  createStoryCommand,
  storyDiagnostic,
  type StoryImportResult,
} from "@haneoka/altair-plugin-adv";
import {
  convertBestdoriScenario,
  type BestdoriAdvCommand,
  type BestdoriScenarioContext,
  type BestdoriScenarioConversion,
} from "./bestdori-source/scenario.js";
import {
  resolveBestdoriServer,
  type BestdoriServer,
} from "./bestdori-source/transport.js";

export interface ImportBestdoriScenarioOptions {
  title?: string;
  sceneId?: string;
  sceneName?: string;
  /** Host release attached to the resulting editor project. */
  releaseServer?: string;
  provenance?: JsonObject;
  /** Bestdori's regional source, independent from the host release. */
  server?: BestdoriServer;
  /** UI/content locale used only when `server` is not explicitly selected. */
  locale?: string;
  voiceBundle?: string;
  proxify?: BestdoriScenarioContext["proxify"];
  resolveCostume?: BestdoriScenarioContext["resolveCostume"];
}

const sourceServer = (
  options: ImportBestdoriScenarioOptions,
): BestdoriServer =>
  resolveBestdoriServer({
    server: options.server,
    locale: options.locale,
  });

const jsonFields = (command: BestdoriAdvCommand): JsonObject => {
  const { command: _command, index: _index, ...fields } = command;
  return fields as JsonObject;
};

const projectFromConversion = (
  conversion: BestdoriScenarioConversion,
  options: ImportBestdoriScenarioOptions,
): StoryProject => {
  const story = conversion.story;
  const sceneId = options.sceneId || `bestdori:${story.storyId}`;
  const commands: StoryProjectCommand[] = story.commands.map(
    (raw, sourceIndex) => {
      const code =
        typeof raw.command === "number" &&
        Number.isSafeInteger(raw.command) &&
        raw.command >= 0
          ? raw.command
          : 0;
      const command = createStoryCommand(code, jsonFields(raw));
      const commandSource = conversion.commandSources[sourceIndex];
      command.id = importedStoryId("bestdori-scenario", sourceIndex);
      command.source = {
        format: "bestdori-scenario",
        raw: JSON.stringify(raw),
        ...(commandSource
          ? {
              command: commandSource.path,
              arguments: {
                ...(commandSource.snippetIndex === undefined
                  ? {}
                  : { snippetIndex: commandSource.snippetIndex }),
                ...(commandSource.actionType === undefined
                  ? {}
                  : { actionType: commandSource.actionType }),
                ...(commandSource.referenceIndex === undefined
                  ? {}
                  : { referenceIndex: commandSource.referenceIndex }),
                ...(commandSource.note === undefined
                  ? {}
                  : { note: commandSource.note }),
              },
            }
          : {}),
      };
      return command;
    },
  );
  const server = sourceServer(options);
  const project: StoryProject = {
    version: STORY_PROJECT_VERSION,
    meta: {
      title: options.title || story.storyId || "Bestdori scenario",
      ...(options.releaseServer
        ? { releaseServer: options.releaseServer }
        : {}),
      provenance: {
        format: "bestdori-scenario",
        scenarioSceneId: story.storyId,
        sourceServer: server,
        ...(options.provenance ?? {}),
      },
    },
    entrySceneId: sceneId,
    scenes: [
      {
        id: sceneId,
        name: options.sceneName || story.storyId || "Scenario",
        commands,
        extensions: {},
      },
    ],
    assets: cloneStoryValue(story.assets as unknown as JsonObject),
    runtime: cloneStoryValue(story.runtime as unknown as JsonObject),
    storyFields: { storyId: story.storyId },
    extensions: {
      source: {
        format: "bestdori-scenario",
        commandCount: commands.length,
        sourceServer: server,
        rawScenario: cloneStoryValue(
          conversion.sourceScenario as unknown as JsonObject,
        ),
      },
    },
  };
  assertValidStoryProject(project);
  return project;
};

const diagnosticFidelity = (
  code: string,
): "exact" | "approximate" | "unsupported" => {
  if (code.endsWith("Unsupported")) return "unsupported";
  if (
    code.endsWith("SourceViewerNoOp") ||
    code === "scenario.talkAttachedActionNoOp"
  ) {
    return "exact";
  }
  return "approximate";
};

const convert = (
  input: string | Uint8Array | unknown,
  options: ImportBestdoriScenarioOptions,
): BestdoriScenarioConversion => {
  const server = sourceServer(options);
  return convertBestdoriScenario(input, {
    server,
    voiceBundle: options.voiceBundle ?? "",
    proxify: options.proxify ?? ((path) => path),
    ...(options.resolveCostume
      ? { resolveCostume: options.resolveCostume }
      : {}),
  });
};

export const parseBestdoriScenario = (
  input: string | Uint8Array | unknown,
  options: ImportBestdoriScenarioOptions = {},
): StoryProject => projectFromConversion(convert(input, options), options);

export const importBestdoriScenario = (
  input: string | Uint8Array | unknown,
  options: ImportBestdoriScenarioOptions = {},
): StoryImportResult => {
  const conversion = convert(input, options);
  return {
    format: "bestdori-scenario",
    project: projectFromConversion(conversion, options),
    diagnostics: conversion.diagnostics.map((diagnostic) =>
      storyDiagnostic(
        diagnostic.severity,
        `bestdori.${diagnostic.code}`,
        diagnostic.path,
        diagnostic.message,
        diagnosticFidelity(diagnostic.code),
      ),
    ),
  };
};

/**
 * Source scenarios are read-only. Export therefore emits Altair's canonical
 * project JSON instead of pretending to round-trip the upstream asset.
 */
export const serializeBestdoriScenario = (project: StoryProject): string =>
  JSON.stringify(project, null, 2);
