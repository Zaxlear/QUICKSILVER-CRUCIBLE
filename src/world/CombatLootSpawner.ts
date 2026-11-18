/**
 * 关卡地面掉落武器、12 武器演武陈列架、三系卷轴祭坛与「变异永恒锻炉祭坛」生成器
 * （src/world/CombatLootSpawner.ts）。
 */

import Phaser from 'phaser';
import { DepthLayer, PALETTE_VOID_HEX, TILE_SIZE_PX } from '../core/Constants';
import type { DeterministicRng } from '../core/DeterministicRng';
import {
  ALL_WEAPON_IDS,
  WEAPON_CATALOG,
  type RolledWeaponInstance,
  type WeaponId,
} from '../data/weapons.data';
import { formatWeaponQualityBadge, type PlayerInventory } from '../entities/player/PlayerInventory';
import type { GeneratedBiomeDag } from './DagBiomeGenerator';
import type { IWorldDisplayRegistrar } from './ParallaxComposer';

export interface FloorWeaponDrop {
  readonly id: string;
  readonly x: number;
  readonly baseY: number;
  readonly sprite: Phaser.GameObjects.Sprite;
  weapon: RolledWeaponInstance;
}

export interface ScrollAltarDrop {
  readonly id: string;
  readonly x: number;
  readonly baseY: number;
  readonly sprite: Phaser.GameObjects.Sprite;
  consumed: boolean;
}

export interface ForgeCrucibleStation {
  readonly id: string;
  readonly x: number;
  readonly baseY: number;
  readonly sprite: Phaser.GameObjects.Sprite;
}

export class CombatLootSpawner {
  public readonly weaponDrops: FloorWeaponDrop[] = [];
  public readonly scrollDrops: ScrollAltarDrop[] = [];
  public readonly forgeStations: ForgeCrucibleStation[] = [];
  private readonly promptLabel: Phaser.GameObjects.Text;
  private bobClockSec = 0;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly registrar: IWorldDisplayRegistrar,
    dag: GeneratedBiomeDag,
    inventory: PlayerInventory,
    lootRng: DeterministicRng
  ) {
    this.promptLabel = registrar.registerCrispOverlay(
      scene.add
        .text(0, 0, '', {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '10px',
          fontStyle: 'bold',
          color: '#38BDF8',
          stroke: PALETTE_VOID_HEX,
          strokeThickness: 3,
        })
        .setOrigin(0.5, 1.0)
        .setDepth(DepthLayer.CRISP_TELEGRAPH + 2)
        .setVisible(false)
    );
    this.populateInitialDrops(dag, inventory, lootRng);
  }

  public stepFixed(
    dtSec: number,
    px: number,
    py: number,
    interactJustPressed: boolean,
    onInspectWeapon: (drop: FloorWeaponDrop) => void,
    onInspectScroll: (scroll: ScrollAltarDrop) => void,
    onOpenMutationForge?: () => void
  ): void {
    this.bobClockSec += dtSec;
    const bobOffset = Math.sin(this.bobClockSec * 3.4) * 2.5;
    const altarParity = (Math.floor(this.bobClockSec * 4) & 1) as 0 | 1;

    for (const w of this.weaponDrops) w.sprite.setY(w.baseY - 12 + bobOffset);
    for (const s of this.scrollDrops) if (!s.consumed) s.sprite.setY(s.baseY - 14 - bobOffset);
    for (const f of this.forgeStations) f.sprite.setFrame(`forge_crucible_altar_${altarParity}`);

    for (const f of this.forgeStations) {
      if (Math.hypot(px - f.x, py - f.baseY) < 32) {
        this.promptLabel
          .setText('[E/V] 开启 变异构筑与永恒锻炉')
          .setColor('#A855F7')
          .setPosition(f.x, f.baseY - 52)
          .setVisible(true);
        if (interactJustPressed) onOpenMutationForge?.();
        return;
      }
    }

    let bestWeapon: FloorWeaponDrop | null = null;
    let bestDist = 28;
    for (const w of this.weaponDrops) {
      const d = Math.hypot(px - w.x, py - w.baseY);
      if (d < bestDist) {
        bestDist = d;
        bestWeapon = w;
      }
    }

    if (bestWeapon) {
      const def = WEAPON_CATALOG[bestWeapon.weapon.weaponId];
      const badge = formatWeaponQualityBadge(bestWeapon.weapon.level, bestWeapon.weapon.forgeGrade);
      this.promptLabel
        .setText(`[E/ACT] 检视 ${def.nameZh} ${badge}`)
        .setColor('#38BDF8')
        .setPosition(bestWeapon.x, bestWeapon.baseY - 30)
        .setVisible(true);
      if (interactJustPressed) onInspectWeapon(bestWeapon);
      return;
    }

    for (const s of this.scrollDrops) {
      if (!s.consumed && Math.hypot(px - s.x, py - s.baseY) < 30) {
        this.promptLabel
          .setText('[E/ACT] 汲取 炼金三系卷轴')
          .setColor('#FBBF24')
          .setPosition(s.x, s.baseY - 34)
          .setVisible(true);
        if (interactJustPressed) onInspectScroll(s);
        return;
      }
    }

    this.promptLabel.setVisible(false);
  }

  public swapWeaponOnFloor(dropId: string, displacedWeapon: RolledWeaponInstance): boolean {
    const found = this.weaponDrops.find((d) => d.id === dropId);
    if (!found) return false;
    found.weapon = displacedWeapon;
    const def = WEAPON_CATALOG[displacedWeapon.weaponId];
    found.sprite.setTexture(def.worldAtlas, def.worldFrame);
    this.registrar.spawnLightFlash(found.x, found.baseY - 12, 0x38bdf8, 150, 2.2, 220);
    return true;
  }

  public consumeScrollDrop(scrollId: string): boolean {
    const found = this.scrollDrops.find((s) => s.id === scrollId && !s.consumed);
    if (!found) return false;
    found.consumed = true;
    found.sprite.setVisible(false);
    this.registrar.spawnLightFlash(found.x, found.baseY - 16, 0xfbbf24, 210, 2.6, 320);
    return true;
  }

  public destroy(): void {
    for (const w of this.weaponDrops) { this.registrar.unregister(w.sprite); w.sprite.destroy(); }
    for (const s of this.scrollDrops) { this.registrar.unregister(s.sprite); s.sprite.destroy(); }
    for (const f of this.forgeStations) { this.registrar.unregister(f.sprite); f.sprite.destroy(); }
    this.registrar.unregister(this.promptLabel);
    this.promptLabel.destroy();
    this.weaponDrops.length = 0;
    this.scrollDrops.length = 0;
    this.forgeStations.length = 0;
  }

  private populateInitialDrops(dag: GeneratedBiomeDag, inventory: PlayerInventory, lootRng: DeterministicRng): void {
    const startNode = dag.nodes[0]!;
    const floorY = (startNode.worldTileY + 26) * TILE_SIZE_PX;
    const baseEntranceX = (startNode.worldTileX + 4) * TILE_SIZE_PX;

    const showcaseIds: readonly WeaponId[] = [
      'wpn_mirror_aegis',
      'wpn_cinnabar_twinblades',
      'wpn_crucible_maul',
      'wpn_pendulum_halberd',
      'wpn_clockwork_repeater',
      'wpn_vitriol_thrower',
    ];
    showcaseIds.forEach((wid, idx) => {
      const wx = baseEntranceX + idx * 20;
      const rolled = inventory.rollWeaponInstance(lootRng, wid, idx === 0 ? 'III' : 'II', idx === 0 ? 'S' : 'PLUS');
      this.spawnWeaponEntity(`loot_ent_${idx}`, wx, floorY, rolled);
    });

    this.spawnScrollEntity('scroll_ent_0', (startNode.worldTileX + 14.5) * TILE_SIZE_PX, floorY);
    this.spawnForgeStation('forge_ent_0', (startNode.worldTileX + 17) * TILE_SIZE_PX, floorY);

    for (let i = 1; i < dag.nodes.length; i++) {
      const node = dag.nodes[i]!;
      if (node.chunk.role === 'EXIT') {
        this.spawnForgeStation(
          `forge_exit_${node.nodeId}`,
          (node.worldTileX + 18) * TILE_SIZE_PX,
          (node.worldTileY + 26) * TILE_SIZE_PX
        );
      }
      const ped = node.chunk.rewardPedestalTilePos;
      if (ped) {
        const px = (node.worldTileX + ped.tileX) * TILE_SIZE_PX + 8;
        const py = (node.worldTileY + ped.tileY + 1) * TILE_SIZE_PX;
        if (node.chunk.role === 'SHOP') {
          const wpn = inventory.rollWeaponInstance(lootRng, lootRng.pick(ALL_WEAPON_IDS), 'III', 'S');
          this.spawnWeaponEntity(`loot_shop_${node.nodeId}`, px, py, wpn);
        } else {
          this.spawnScrollEntity(`scroll_room_${node.nodeId}`, px, py);
        }
      }
    }
  }

  private spawnWeaponEntity(id: string, x: number, baseY: number, weapon: RolledWeaponInstance): void {
    const def = WEAPON_CATALOG[weapon.weaponId];
    const sprite = this.registrar.registerWorldLit(
      this.scene.add.sprite(x, baseY - 12, def.worldAtlas, def.worldFrame).setDepth(DepthLayer.LOOT).setPipeline('Light2D')
    );
    this.weaponDrops.push({ id, x, baseY, sprite, weapon });
  }

  private spawnScrollEntity(id: string, x: number, baseY: number): void {
    const sprite = this.registrar.registerWorldLit(
      this.scene.add.sprite(x, baseY - 14, 'weapons_fx_atlas', 'scroll_tri_pickup').setDepth(DepthLayer.LOOT).setPipeline('Light2D')
    );
    this.scrollDrops.push({ id, x, baseY, sprite, consumed: false });
  }

  private spawnForgeStation(id: string, x: number, baseY: number): void {
    const sprite = this.registrar.registerWorldLit(
      this.scene.add.sprite(x, baseY - 26, 'synergy_fx_atlas', 'forge_crucible_altar_0').setDepth(DepthLayer.LOOT).setPipeline('Light2D')
    );
    this.registrar.registerAmbientLight({ id: `light_${id}`, x, y: baseY - 28, preset: 'MERCURY_SILVER', radiusPx: 155, flickerAmplitude: 0.08 });
    this.forgeStations.push({ id, x, baseY, sprite });
  }
}
