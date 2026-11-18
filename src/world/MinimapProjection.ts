/**
 * 小地图只读拓扑快照构建纯函数（src/world/MinimapProjection.ts）。
 * 零 Phaser 依赖，供 TeleporterNetwork 与无头单测共享调用。
 */

import { NarrativeStore } from '../core/NarrativeSessionStore';
import {
  BIOME_DAG_CONFIGS,
  type MinimapSnapshotPayload,
  type RuneId,
  type WorldBannerNotice,
} from '../data/runes.data';
import type { GeneratedBiomeDag } from './DagBiomeGenerator';

export function composeMinimapSnapshot(params: {
  readonly dag: GeneratedBiomeDag;
  readonly currentRoomId: string;
  readonly expanded: boolean;
  readonly isWarping: boolean;
  readonly visitedNodeIds: ReadonlySet<string>;
  readonly steleStates: ReadonlyMap<string, boolean>;
  readonly unlockedRunes: readonly RuneId[];
  readonly banner: WorldBannerNotice | null;
  readonly interactPrompt: string | null;
}): MinimapSnapshotPayload {
  const {
    dag,
    currentRoomId,
    expanded,
    isWarping,
    visitedNodeIds,
    steleStates,
    unlockedRunes,
    banner,
    interactPrompt,
  } = params;
  const cfg = BIOME_DAG_CONFIGS[dag.biomeId];

  return {
    biomeId: dag.biomeId,
    biomeNameZh: cfg.nameZh,
    runSeed: dag.seed,
    currentRoomId,
    expanded,
    isWarping,
    unlockedRunes,
    banner,
    interactPrompt,
    collectedSeals: NarrativeStore.collectedSeals,
    crucibleHeat: NarrativeStore.maxCrucibleHeat,
    nodes: dag.nodes.map((n) => ({
      nodeId: n.nodeId,
      role: n.chunk.role,
      worldTileX: n.worldTileX,
      worldTileY: n.worldTileY,
      widthTiles: n.chunk.widthTiles,
      heightTiles: n.chunk.heightTiles,
      isMainSpine: n.isMainSpine,
      visited: visitedNodeIds.has(n.nodeId),
      hasTeleporter: steleStates.has(n.nodeId),
      teleporterActive: steleStates.get(n.nodeId) === true,
    })),
    bridges: dag.bridges.map((b) => ({
      bridgeId: b.bridgeId,
      fromNodeId: b.fromNodeId,
      toNodeId: b.toNodeId,
      worldTileX: b.worldTileX,
      worldTileY: b.worldTileY,
      widthTiles: b.widthTiles,
      heightTiles: b.heightTiles,
      requiredRune: b.requiredRune,
    })),
  };
}
