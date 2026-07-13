import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { Parser, type SatisfactorySave } from '@etothepii/satisfactory-file-parser';
import type { LevelSummary, SaveSummary, TypeCount } from '../src/shared/ipc-types';

/** Number of most-frequent object types to include in the summary. */
const TOP_TYPES_LIMIT = 25;

/**
 * Read a `.sav` file from disk, parse it with the Satisfactory file parser, and
 * reduce it to an IPC-friendly {@link SaveSummary}.
 *
 * The full parsed {@link SatisfactorySave} is returned alongside the summary so
 * later features (map rendering, calculator) can reuse it without re-parsing.
 */
export async function parseSaveFile(
  filePath: string,
): Promise<{ summary: SaveSummary; save: SatisfactorySave }> {
  const buffer = await readFile(filePath);
  // Hand the parser a standalone ArrayBuffer (Node Buffers can share a pool).
  const bytes = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );

  const started = performance.now();
  const save = Parser.ParseSave(basename(filePath), bytes, { throwErrors: true });
  const parseDurationMs = Math.round(performance.now() - started);

  const summary = summariseSave(save, filePath, buffer.byteLength, parseDurationMs);
  return { summary, save };
}

function summariseSave(
  save: SatisfactorySave,
  filePath: string,
  fileSizeBytes: number,
  parseDurationMs: number,
): SaveSummary {
  const header = save.header;
  const levels: LevelSummary[] = [];
  const typeCounts = new Map<string, number>();

  let totalObjectCount = 0;
  let totalEntityCount = 0;
  let totalComponentCount = 0;

  for (const levelName of Object.keys(save.levels)) {
    const level = save.levels[levelName];
    const objects = level.objects ?? [];
    let entityCount = 0;
    let componentCount = 0;

    for (const obj of objects) {
      // SaveEntity has type === 'SaveEntity'; components are the rest.
      if ((obj as { type?: string }).type === 'SaveEntity') {
        entityCount++;
      } else {
        componentCount++;
      }
      const typePath = obj.typePath || '(unknown)';
      typeCounts.set(typePath, (typeCounts.get(typePath) ?? 0) + 1);
    }

    totalObjectCount += objects.length;
    totalEntityCount += entityCount;
    totalComponentCount += componentCount;

    levels.push({
      name: levelName,
      objectCount: objects.length,
      collectableCount: level.collectables?.length ?? 0,
    });
  }

  const topTypes: TypeCount[] = [...typeCounts.entries()]
    .map(([typePath, count]) => ({ typePath, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_TYPES_LIMIT);

  return {
    filePath,
    fileName: basename(filePath),
    fileSizeBytes,

    saveName: header.saveName ?? save.name ?? '',
    sessionName: header.sessionName ?? '',
    mapName: header.mapName ?? '',
    buildVersion: header.buildVersion ?? 0,
    saveVersion: header.saveVersion ?? 0,
    saveHeaderType: header.saveHeaderType ?? 0,
    playDurationSeconds: header.playDurationSeconds ?? 0,
    saveDateTime: header.saveDateTime ?? '',
    isModded: Boolean(header.isModdedSave),
    creativeModeEnabled: Boolean(header.creativeModeEnabled),

    levelCount: levels.length,
    totalObjectCount,
    totalEntityCount,
    totalComponentCount,
    levels: levels.sort((a, b) => b.objectCount - a.objectCount),
    topTypes,

    parseDurationMs,
  };
}
