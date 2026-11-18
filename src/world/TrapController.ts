/**
 * 房间机关周期同步控制器（src/world/TrapController.ts）：
 * 全部精灵绑定 world_props_atlas + Light2D，预警标识渲染于无色差 TelegraphOverlayCam，
 * 同时支持玩家受击、浅酸池 0.6s 毒蚀与将敌方怪物击退撞入机关造成巨额环境伤害。
 */

import Phaser from 'phaser';
import type { CombatTargetView } from '../combat/CombatTypes';
import { DepthLayer, TILE_SIZE_PX } from '../core/Constants';
import { BIOME_01_SLAG_LIGHTING, LIGHT_ANCHOR_COLOR_PRESETS } from '../data/palette.data';
import { TRAP_BEHAVIOR_SPECS, type TrapKind } from '../data/runes.data';
import type { PlacedRoomNode } from './DoorSocketStitcher';
import type { IWorldDisplayRegistrar } from './ParallaxComposer';
import type { TrapSlotSpec } from './RoomChunkSchema';
import {
  computeTrapActiveHitbox,
  evaluateTrapPhase,
  type TrapCyclePhase,
  type TrapPhaseResult,
} from './TrapKinematics';

export { computeTrapActiveHitbox, evaluateTrapPhase };

interface RuntimeTrapInstance {
  readonly slot: TrapSlotSpec;
  readonly baseX: number;
  readonly baseY: number;
  readonly widthPx: number;
  readonly baseSprites: readonly Phaser.GameObjects.Sprite[];
  readonly activeSprites: readonly Phaser.GameObjects.Sprite[];
  readonly warnLabel: Phaser.GameObjects.Text | null;
  prevPhase: TrapCyclePhase;
  cooldownMs: number;
  shallowAcidTickMs: number;
  readonly enemyCooldowns: Map<string, number>;
}

export class TrapController {
  private readonly instances: RuntimeTrapInstance[] = [];
  private simTimeMs = 0;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly registrar: IWorldDisplayRegistrar,
    nodes: readonly PlacedRoomNode[]
  ) {
    for (const node of nodes) {
      for (const slot of node.chunk.trapSlots) this.spawnTrapInstance(node, slot);
    }
  }

  public stepFixed(
    dtSec: number,
    playerBody: { readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly isInvulnerable?: boolean },
    onHazardContact: (kind: TrapKind, damageRatio: number, knockDirX: -1 | 1) => void,
    enemies?: readonly CombatTargetView[],
    onEnemyTrapHit?: (enemyId: string, kind: TrapKind, flatDamage: number, impactX: number, impactY: number) => void,
    onShallowAcidPoisonPlayer?: () => void
  ): void {
    const dtMs = dtSec * 1000;
    this.simTimeMs += dtMs;
    const bit = (Math.floor(this.simTimeMs / 90) & 1) as 0 | 1;
    const pLeft = playerBody.x - playerBody.w * 0.5;
    const pRight = playerBody.x + playerBody.w * 0.5;
    const pTop = playerBody.y - playerBody.h;
    const pBot = playerBody.y;

    for (const inst of this.instances) {
      if (inst.cooldownMs > 0) inst.cooldownMs = Math.max(0, inst.cooldownMs - dtMs);
      if (inst.shallowAcidTickMs > 0) inst.shallowAcidTickMs = Math.max(0, inst.shallowAcidTickMs - dtMs);
      for (const [eid, cd] of inst.enemyCooldowns) {
        if (cd <= dtMs) inst.enemyCooldowns.delete(eid);
        else inst.enemyCooldowns.set(eid, cd - dtMs);
      }

      const st = evaluateTrapPhase(inst.slot, this.simTimeMs);
      const spec = TRAP_BEHAVIOR_SPECS[inst.slot.trapType];

      if (st.phase === 'ACTIVE' && inst.prevPhase !== 'ACTIVE') {
        const preset = LIGHT_ANCHOR_COLOR_PRESETS[spec.lightPreset];
        this.registrar.spawnLightFlash(inst.baseX + inst.widthPx * 0.5, inst.baseY - 28, preset.colorNum, 145, 2.0, 240);
      }
      inst.prevPhase = st.phase;

      if (inst.warnLabel) {
        const show = st.phase === 'WARNING';
        inst.warnLabel.setVisible(show);
        if (show) inst.warnLabel.setAlpha(bit === 0 ? 1.0 : 0.45);
      }
      this.syncTrapVisuals(inst, st, bit);

      // 浅酸池常驻毒蚀判定（每 0.6s 叠毒，翻滚无敌帧可无伤滚过）
      if (
        inst.slot.trapType === 'ACID_GEYSER' &&
        !playerBody.isInvulnerable &&
        inst.shallowAcidTickMs <= 0 &&
        pRight > inst.baseX &&
        pLeft < inst.baseX + inst.widthPx &&
        Math.abs(pBot - inst.baseY) <= 10
      ) {
        inst.shallowAcidTickMs = 600;
        onShallowAcidPoisonPlayer?.();
      }

      if (st.phase === 'ACTIVE') {
        const box = computeTrapActiveHitbox(inst.slot, inst.baseX, inst.baseY, inst.widthPx, st);
        if (inst.cooldownMs <= 0 && !(pRight <= box.x0 || pLeft >= box.x1 || pBot <= box.y0 || pTop >= box.y1)) {
          inst.cooldownMs = 520;
          const mid = (box.x0 + box.x1) * 0.5;
          onHazardContact(inst.slot.trapType, spec.playerMaxHpRatioDamage, playerBody.x < mid ? -1 : 1);
        }
        if (enemies && onEnemyTrapHit) {
          for (let e = 0; e < enemies.length; e++) {
            const en = enemies[e]!;
            if (!en.isAlive || inst.enemyCooldowns.has(en.id)) continue;
            const eL = en.x - en.width * 0.5;
            const eR = en.x + en.width * 0.5;
            if (!(eR <= box.x0 || eL >= box.x1 || en.y <= box.y0 || en.y - en.height >= box.y1)) {
              inst.enemyCooldowns.set(en.id, 650);
              onEnemyTrapHit(en.id, inst.slot.trapType, spec.enemyFlatDamage, en.x, en.y - en.height * 0.5);
            }
          }
        }
      }
    }
  }

  public destroy(): void {
    for (const inst of this.instances) {
      for (const s of [...inst.baseSprites, ...inst.activeSprites]) {
        this.registrar.unregister(s);
        s.destroy();
      }
      if (inst.warnLabel) {
        this.registrar.unregister(inst.warnLabel);
        inst.warnLabel.destroy();
      }
    }
    this.instances.length = 0;
  }

  private spawnTrapInstance(node: PlacedRoomNode, slot: TrapSlotSpec): void {
    const baseX = (node.worldTileX + slot.tileX) * TILE_SIZE_PX;
    const baseY = (node.worldTileY + slot.tileY + 1) * TILE_SIZE_PX;
    const widthPx = Math.max(1, slot.widthTiles) * TILE_SIZE_PX;
    const baseSprites: Phaser.GameObjects.Sprite[] = [];
    const activeSprites: Phaser.GameObjects.Sprite[] = [];
    const mk = (x: number, y: number, f: string): Phaser.GameObjects.Sprite =>
      this.registrar.registerWorldLit(
        this.scene.add.sprite(x, y, 'world_props_atlas', f).setDepth(DepthLayer.TRAPS).setPipeline('Light2D')
      );
    const cx = baseX + widthPx * 0.5;

    if (slot.trapType === 'SPIKE_BED') {
      for (let i = 0; i < slot.widthTiles; i++) baseSprites.push(mk(baseX + i * 16 + 8, baseY, 'spike_bed_strip'));
    } else if (slot.trapType === 'ACID_GEYSER') {
      for (let i = 0; i < slot.widthTiles; i++) {
        baseSprites.push(mk(baseX + i * 16 + 8, baseY, 'acid_pool_base'));
        if (i % 2 === 0) activeSprites.push(mk(baseX + i * 16 + 12, baseY, 'acid_geyser_jet_0').setVisible(false));
      }
    } else if (slot.trapType === 'FLAME_NOZZLE') {
      baseSprites.push(mk(cx, baseY, 'flame_nozzle_housing'));
      activeSprites.push(mk(cx, baseY - 4, 'flame_jet_0').setVisible(false));
    } else if (slot.trapType === 'PENDULUM_BLADE') {
      baseSprites.push(mk(cx, baseY - 56, 'pendulum_pivot'));
      activeSprites.push(mk(cx, baseY - 64, 'pendulum_crescent_blade').setOrigin(0.5, 0.04));
    } else {
      baseSprites.push(mk(cx, baseY, 'voltaic_node'), mk(cx, baseY - 56, 'voltaic_node'));
      activeSprites.push(mk(cx, baseY - 4, 'voltaic_arc_beam_0').setVisible(false));
    }

    const hasWarn = slot.trapType === 'ACID_GEYSER' || slot.trapType === 'FLAME_NOZZLE' || slot.trapType === 'VOLTAIC_ARC_GATE';
    const warnColor = slot.trapType === 'ACID_GEYSER' ? '#3CE682' : slot.trapType === 'FLAME_NOZZLE' ? '#FF5E2B' : '#38BDF8';
    const warnLabel = hasWarn
      ? this.registrar.registerCrispOverlay(
          this.scene.add
            .text(cx, baseY - 26, '[!]', {
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '11px',
              fontStyle: 'bold',
              color: warnColor,
              stroke: BIOME_01_SLAG_LIGHTING.backdropHex,
              strokeThickness: 3,
            })
            .setOrigin(0.5, 0.5)
            .setDepth(DepthLayer.CRISP_TELEGRAPH)
            .setVisible(false)
        )
      : null;

    this.instances.push({
      slot, baseX, baseY, widthPx, baseSprites, activeSprites, warnLabel,
      prevPhase: 'DORMANT', cooldownMs: 0, shallowAcidTickMs: 0, enemyCooldowns: new Map(),
    });
  }

  private syncTrapVisuals(inst: RuntimeTrapInstance, st: TrapPhaseResult, bit: 0 | 1): void {
    const k = inst.slot.trapType;
    if (k === 'ACID_GEYSER') {
      for (const sp of inst.activeSprites) {
        if (st.phase === 'WARNING') sp.setFrame(`acid_bubble_warn_${bit}`).setScale(1, 1).setVisible(true);
        else if (st.phase === 'ACTIVE') sp.setFrame(`acid_geyser_jet_${bit}`).setScale(1, 1.65).setVisible(true);
        else sp.setVisible(false);
      }
    } else if (k === 'FLAME_NOZZLE') {
      inst.activeSprites[0]?.setFrame(`flame_jet_${bit}`).setVisible(st.phase === 'ACTIVE');
    } else if (k === 'PENDULUM_BLADE') {
      inst.activeSprites[0]?.setRotation(st.pendulumAngleRad);
    } else if (k === 'VOLTAIC_ARC_GATE') {
      inst.activeSprites[0]?.setFrame(`voltaic_arc_beam_${bit}`).setVisible(st.phase === 'ACTIVE');
    }
  }
}
