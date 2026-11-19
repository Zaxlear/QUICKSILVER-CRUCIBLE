import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  validateRoomChunkTemplate,
  verifyChunkInternalReachability,
  type RoomChunkTemplate,
} from '../../src/world/RoomChunkSchema';

function computeNormalizedGeometryHash(chunk: RoomChunkTemplate): string {
  const normalized = {
    w: chunk.widthTiles,
    h: chunk.heightTiles,
    solid: [...chunk.solidRects].sort(
      (a, b) => a.tileY - b.tileY || a.tileX - b.tileX || a.widthTiles - b.widthTiles || a.heightTiles - b.heightTiles
    ),
    oneWay: [...chunk.oneWayPlatforms].sort(
      (a, b) => a.tileY - b.tileY || a.tileX - b.tileX || a.widthTiles - b.widthTiles
    ),
    climb: [...chunk.climbableWalls].sort(
      (a, b) => a.tileX - b.tileX || a.topTileY - b.topTileY || a.heightTiles - b.heightTiles
    ),
    brk: [...chunk.breakableSlagFloors].sort(
      (a, b) => a.tileY - b.tileY || a.tileX - b.tileX || a.widthTiles - b.widthTiles
    ),
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

describe('Beta 1.0.2 Gate 3 — 55-Chunk Stereoscopic Geometry Uniqueness & Biome Motif Audit', () => {
  const dir = path.resolve(process.cwd(), 'public/assets/tilemaps/chunks');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as {
    readonly chunks: readonly string[];
  };
  const allChunks: readonly RoomChunkTemplate[] = manifest.chunks.map((id) =>
    validateRoomChunkTemplate(JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')))
  );

  it('guarantees 0 duplicate geometry hashes across all 55 chunks and purges misnamed apex_*_sluice/_cistern files', () => {
    expect(allChunks).toHaveLength(55);

    // Disk hygiene: no orphaned JSON files left behind in public/assets/tilemaps/chunks
    const diskJsonIds = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json') && f !== 'index.json')
      .map((f) => f.replace(/\.json$/, ''))
      .sort();
    expect(diskJsonIds).toEqual([...manifest.chunks].sort());

    // Naming audit: zero apex_*_sluice or apex_*_cistern misnamed leftovers
    const apexIds = manifest.chunks.filter((id) => id.startsWith('apex_'));
    expect(apexIds).toHaveLength(14);
    for (const id of apexIds) {
      expect(id).not.toContain('_sluice');
      expect(id).not.toContain('_cistern');
    }
    expect(apexIds).toContain('apex_combat_01_astrolabe_bridge');
    expect(apexIds).toContain('apex_combat_03_mercury_cascade');
    expect(apexIds).toContain('apex_combat_04_solar_nave');

    // Biome III Clockwork Ossuary vertical tower motif: heightTiles expanded into 34 ~ 38 range
    const ossuaryCombats = allChunks.filter(
      (c) => c.biomePool.includes('biome_03_clockwork_ossuary') && c.role === 'COMBAT'
    );
    expect(ossuaryCombats).toHaveLength(6);
    for (const oc of ossuaryCombats) {
      expect(oc.heightTiles).toBeGreaterThanOrEqual(34);
      expect(oc.heightTiles).toBeLessThanOrEqual(38);
    }

    // Strict 0 duplicate geometry signatures across ALL 55 chunks!
    const seenByHash = new Map<string, string>();
    let duplicateCount = 0;
    for (const chunk of allChunks) {
      expect(verifyChunkInternalReachability(chunk)).toEqual({ ok: true });
      const hash = computeNormalizedGeometryHash(chunk);
      if (seenByHash.has(hash)) duplicateCount += 1;
      else seenByHash.set(hash, chunk.chunkId);
    }
    expect(duplicateCount).toBe(0);
    expect(seenByHash.size).toBe(55);
  });
});
