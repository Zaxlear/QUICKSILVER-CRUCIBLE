/**
 * 房间与过渡走廊镜头边界计算及调试遥测组装器（src/scenes/BiomeRoomFraming.ts）。
 */

import Phaser from 'phaser';
import { TILE_SIZE_PX } from '../core/Constants';
import { EventBus } from '../core/EventBus';
import type { CameraRig, WorldCameraBounds } from '../render/CameraRig';
import type { ActiveCameraPostFXBundle } from '../render/pipelines/PipelineRegistry';
import type { GeneratedBiomeDag } from '../world/DagBiomeGenerator';
import type { PlacedRoomNode } from '../world/DoorSocketStitcher';
import type { TeleporterNetwork } from '../world/TeleporterNetwork';
import type { ShowcaseShaderController } from './ShowcaseShaderController';

export interface BiomeDagDebugTelemetry {
  readonly biomeId: string;
  readonly seed: number;
  readonly currentRoomId: string;
  readonly activatedSteleIds: readonly string[];
  readonly unlockedRunes: readonly string[];
  readonly nodes: readonly {
    readonly nodeId: string;
    readonly role: string;
    readonly chunkId: string;
    readonly centerPx: { readonly x: number; readonly y: number };
    readonly stelePx: { readonly x: number; readonly y: number } | null;
  }[];
}

export function computeRoomBoundsPx(node: PlacedRoomNode): WorldCameraBounds {
  return {
    minX: node.worldTileX * TILE_SIZE_PX,
    minY: node.worldTileY * TILE_SIZE_PX,
    maxX: (node.worldTileX + node.chunk.widthTiles) * TILE_SIZE_PX,
    maxY: (node.worldTileY + node.chunk.heightTiles) * TILE_SIZE_PX,
  };
}

export function stepRoomAndCorridorFraming(
  px: number,
  py: number,
  dag: GeneratedBiomeDag,
  cameraRig: CameraRig,
  teleporters: TeleporterNetwork,
  crossedBridges: Set<string>,
  onSafeCheckpoint: (x: number, y: number) => void
): boolean {
  const checkY = py - 8;
  for (const node of dag.nodes) {
    const b = computeRoomBoundsPx(node);
    if (px >= b.minX && px <= b.maxX && checkY >= b.minY && checkY <= b.maxY) {
      cameraRig.transitionWorldBounds(b, false);
      if (teleporters.markRoomEntered(node)) {
        onSafeCheckpoint(px, py);
        EventBus.emit('world:room_entered', {
          biomeId: dag.biomeId,
          roomId: node.nodeId,
          role: node.chunk.role,
        });
        return true;
      }
      return false;
    }
  }

  for (const br of dag.bridges) {
    const bx0 = br.worldTileX * TILE_SIZE_PX;
    const by0 = br.worldTileY * TILE_SIZE_PX;
    const bx1 = (br.worldTileX + br.widthTiles) * TILE_SIZE_PX;
    const by1 = (br.worldTileY + br.heightTiles) * TILE_SIZE_PX;
    if (px >= bx0 - 8 && px <= bx1 + 8 && checkY >= by0 - 8 && checkY <= by1 + 8) {
      const midY = (by0 + by1) * 0.5;
      const midX = (bx0 + bx1) * 0.5;
      cameraRig.transitionWorldBounds(
        br.direction === 'EAST' || br.direction === 'WEST'
          ? { minX: bx0 - 340, minY: midY - 240, maxX: bx1 + 340, maxY: midY + 240 }
          : { minX: midX - 360, minY: by0 - 240, maxX: midX + 360, maxY: by1 + 240 },
        false
      );
      if (!crossedBridges.has(br.bridgeId)) {
        crossedBridges.add(br.bridgeId);
        onSafeCheckpoint(br.checkpointWorldX, br.checkpointWorldY);
        EventBus.emit('world:checkpoint_reached', {
          roomId: br.toNodeId,
          checkpointId: br.bridgeId,
        });
      }
      break;
    }
  }
  return false;
}

export function stepTeleporterWarpFraming(
  dtSec: number,
  px: number,
  py: number,
  dag: GeneratedBiomeDag,
  teleporters: TeleporterNetwork,
  heroSprite: Phaser.GameObjects.Sprite,
  shaderCtrl: ShowcaseShaderController,
  cameraRig: CameraRig,
  postFx: ActiveCameraPostFXBundle,
  snapPlayerTo: (nx: number, ny: number) => void,
  onCheckpoint: (sx: number, sy: number) => void
): boolean {
  return teleporters.stepFixed(dtSec, px, py, (nodeId, wx, wy, t) => {
    heroSprite.setAlpha(t < 0.52 ? 0.2 : 1.0);
    shaderCtrl.setPlayerParryShield(t < 0.85);
    cameraRig.setFocus(wx, wy - 26);
    if (t >= 0.52) {
      snapPlayerTo(wx, wy);
      const node = dag.nodes.find((n) => n.nodeId === nodeId);
      if (node) {
        cameraRig.transitionWorldBounds(computeRoomBoundsPx(node), false);
        onCheckpoint(wx, wy);
      }
      if (t >= 0.96) {
        shaderCtrl.setPlayerParryShield(false);
        heroSprite.setAlpha(1.0);
        postFx.chromaticImpact.triggerPulse(0.32, wx, wy - 18, cameraRig.worldMainCam);
      }
    }
  });
}

export function buildBiomeDagDebugTelemetry(
  dag: GeneratedBiomeDag,
  currentRoomId: string,
  activatedSteleIds: readonly string[],
  unlockedRunes: readonly string[]
): BiomeDagDebugTelemetry {
  return {
    biomeId: dag.biomeId,
    seed: dag.seed,
    currentRoomId,
    activatedSteleIds,
    unlockedRunes,
    nodes: dag.nodes.map((n) => ({
      nodeId: n.nodeId,
      role: n.chunk.role,
      chunkId: n.chunk.chunkId,
      centerPx: {
        x: (n.worldTileX + n.chunk.widthTiles * 0.5) * TILE_SIZE_PX,
        y: (n.worldTileY + n.chunk.heightTiles - 4) * TILE_SIZE_PX,
      },
      stelePx: n.chunk.teleporterTilePos
        ? {
            x: (n.worldTileX + n.chunk.teleporterTilePos.tileX) * TILE_SIZE_PX + 8,
            y: (n.worldTileY + n.chunk.teleporterTilePos.tileY + 1) * TILE_SIZE_PX,
          }
        : null,
    })),
  };
}
