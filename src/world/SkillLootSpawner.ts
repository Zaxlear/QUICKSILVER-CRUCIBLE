/**
 * 全 6 种主动技能局内掉落生成器、精英怪额外爆装与地面无用装备长按 [R] 熔解回收控制器
 * （src/world/SkillLootSpawner.ts，严格 <= 185 行）。
 */

import type Phaser from 'phaser';
import { DepthLayer, PALETTE_VOID_HEX, TILE_SIZE_PX } from '../core/Constants';
import type { DeterministicRng } from '../core/DeterministicRng';
import { EventBus } from '../core/EventBus';
import { NarrativeStore } from '../core/NarrativeSessionStore';
import { computeGearRecycleGold, ECONOMY_CONSTANTS } from '../data/economy.data';
import { SKILL_CATALOG, type RolledSkillInstance, type SkillId } from '../data/skills.data';
import { DEFAULT_STARTER_SKILLS, DEFAULT_STARTER_WEAPONS } from '../data/storage.data';
import type { WeaponId } from '../data/weapons.data';
import { rollDynamicGearTierAndGrade } from '../entities/player/ForgeGradeRoller';
import { formatWeaponQualityBadge, type PlayerInventory } from '../entities/player/PlayerInventory';
import type { CombatLootSpawner, FloorWeaponDrop } from './CombatLootSpawner';
import type { GeneratedBiomeDag } from './DagBiomeGenerator';
import type { IWorldDisplayRegistrar } from './ParallaxComposer';

export interface FloorSkillDrop {
  readonly id: string;
  readonly x: number;
  readonly baseY: number;
  readonly sprite: Phaser.GameObjects.Sprite | null;
  skill: RolledSkillInstance;
}

export class SkillLootSpawner {
  public readonly skillDrops: FloorSkillDrop[] = [];
  private readonly promptLabel: Phaser.GameObjects.Text | null;
  private bobSec = 0;
  private recycleHoldMs = 0;
  private recycleTargetId = '';
  private lastHintId = '';
  private dropSeq = 1;

  public constructor(
    private readonly scene: Phaser.Scene | null,
    private readonly registrar: IWorldDisplayRegistrar | null,
    dag: GeneratedBiomeDag,
    private readonly inventory: PlayerInventory,
    private readonly lootRng: DeterministicRng,
    private readonly weaponLoot: CombatLootSpawner | null,
    private readonly biomeDepth: 1 | 2 | 3 | 4
  ) {
    this.promptLabel = scene && registrar
      ? registrar.registerCrispOverlay(
          scene.add.text(0, 0, '', { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '10px', fontStyle: 'bold', color: '#3CE682', stroke: PALETTE_VOID_HEX, strokeThickness: 3 })
            .setOrigin(0.5, 1.0).setDepth(DepthLayer.CRISP_TELEGRAPH + 2).setVisible(false)
        )
      : null;
    this.populateSecretVaultGear(dag);
  }

  public spawnSkillDrop(id: string, x: number, baseY: number, skill: RolledSkillInstance): FloorSkillDrop {
    const def = SKILL_CATALOG[skill.skillId];
    const sprite = this.scene && this.registrar
      ? this.registrar.registerWorldLit(this.scene.add.sprite(x, baseY - 14, 'synergy_fx_atlas', def.worldFrame).setDepth(DepthLayer.LOOT).setPipeline('Light2D'))
      : null;
    const drop: FloorSkillDrop = { id, x, baseY, sprite, skill };
    this.skillDrops.push(drop);
    return drop;
  }

  public trySpawnEliteBonusGear(x: number, floorY: number): FloorSkillDrop | FloorWeaponDrop | null {
    if (!this.lootRng.nextBool(ECONOMY_CONSTANTS.ELITE_EXTRA_GEAR_DROP_CHANCE)) return null;
    const { level, forgeGrade } = rollDynamicGearTierAndGrade(this.lootRng, NarrativeStore.forgeTiers, this.biomeDepth, NarrativeStore.maxCrucibleHeat, true);
    this.dropSeq += 1;
    if (this.lootRng.nextBool(0.5) || !this.weaponLoot) {
      const pool = NarrativeStore.unlockedSkills.length > 0 ? NarrativeStore.unlockedSkills : (DEFAULT_STARTER_SKILLS as readonly SkillId[]);
      const skl = this.inventory.loadout.rollSkillInstance(this.lootRng, this.lootRng.pick(pool), level, forgeGrade);
      this.registrar?.spawnLightFlash(x, floorY - 16, 0x3ce682, 165, 2.2, 220);
      return this.spawnSkillDrop(`skl_elite_${this.dropSeq}`, x, floorY, skl);
    }
    const pool = NarrativeStore.unlockedWeapons.length > 0 ? NarrativeStore.unlockedWeapons : (DEFAULT_STARTER_WEAPONS as readonly WeaponId[]);
    const wpn = this.inventory.rollWeaponInstance(this.lootRng, this.lootRng.pick(pool), level, forgeGrade);
    this.registrar?.spawnLightFlash(x, floorY - 16, 0x38bdf8, 165, 2.2, 220);
    return this.weaponLoot.spawnDynamicWeaponDrop(`wpn_elite_${this.dropSeq}`, x, floorY, wpn);
  }

  public swapSkillOnFloor(dropId: string, displaced: RolledSkillInstance): boolean {
    const found = this.skillDrops.find((s) => s.id === dropId);
    if (!found) return false;
    found.skill = displaced;
    found.sprite?.setFrame(SKILL_CATALOG[displaced.skillId].worldFrame);
    this.registrar?.spawnLightFlash(found.x, found.baseY - 14, 0x3ce682, 150, 2.2, 220);
    return true;
  }

  public recycleFloorLootById(lootId: string): { readonly goldEarned: number; readonly x: number; readonly y: number } | null {
    const highRecycle = (NarrativeStore.forgeTiers.recycle_lvl ?? 0) > 0;
    const sIdx = this.skillDrops.findIndex((s) => s.id === lootId);
    if (sIdx >= 0) {
      const target = this.skillDrops[sIdx]!;
      const goldEarned = computeGearRecycleGold('SKILL', target.skill.level, target.skill.forgeGrade, highRecycle);
      if (target.sprite && this.registrar) { this.registrar.unregister(target.sprite); target.sprite.destroy(); }
      this.skillDrops.splice(sIdx, 1);
      this.registrar?.spawnLightFlash(target.x, target.baseY - 14, 0xfbbf24, 160, 2.3, 210);
      EventBus.emit('audio:sfx_requested', { sfxId: 'sfx_ichor_pickup', worldX: target.x });
      return { goldEarned, x: target.x, y: target.baseY };
    }
    const removedWpn = this.weaponLoot?.removeWeaponDrop(lootId);
    if (removedWpn) {
      const goldEarned = computeGearRecycleGold('WEAPON', removedWpn.weapon.level, removedWpn.weapon.forgeGrade, highRecycle);
      this.registrar?.spawnLightFlash(removedWpn.x, removedWpn.baseY - 12, 0xfbbf24, 160, 2.3, 210);
      EventBus.emit('audio:sfx_requested', { sfxId: 'sfx_ichor_pickup', worldX: removedWpn.x });
      return { goldEarned, x: removedWpn.x, y: removedWpn.baseY };
    }
    return null;
  }

  public stepFixed(
    dtSec: number, px: number, py: number, interactJustPressed: boolean, recycleHeld: boolean,
    onInspectSkill: (drop: FloorSkillDrop) => void, onRecycledGold: (gold: number, wx: number, wy: number) => void
  ): void {
    this.bobSec += dtSec;
    const bob = Math.sin(this.bobSec * 3.6) * 2.5;
    let nearestSkill: FloorSkillDrop | null = null;
    let bestDist = 28;
    for (const s of this.skillDrops) {
      s.sprite?.setY(s.baseY - 14 + bob);
      const d = Math.hypot(px - s.x, py - s.baseY);
      if (d < bestDist) { bestDist = d; nearestSkill = s; }
    }
    const nearestWeapon = this.weaponLoot?.findNearestWeaponDrop(px, py, 28) ?? null;
    const candidateId = nearestSkill?.id ?? nearestWeapon?.id ?? '';
    if (candidateId !== this.lastHintId) {
      this.lastHintId = candidateId;
      const highRec = (NarrativeStore.forgeTiers.recycle_lvl ?? 0) > 0;
      const goldValue = nearestSkill
        ? computeGearRecycleGold('SKILL', nearestSkill.skill.level, nearestSkill.skill.forgeGrade, highRec)
        : nearestWeapon ? computeGearRecycleGold('WEAPON', nearestWeapon.weapon.level, nearestWeapon.weapon.forgeGrade, highRec) : 0;
      EventBus.emit('world:floor_recycle_hint', candidateId ? { lootId: candidateId, goldValue } : null);
    }

    if (candidateId && recycleHeld) {
      if (this.recycleTargetId !== candidateId) { this.recycleTargetId = candidateId; this.recycleHoldMs = 0; }
      this.recycleHoldMs += dtSec * 1000;
      if (this.recycleHoldMs >= ECONOMY_CONSTANTS.RECYCLE_HOLD_MS) {
        this.recycleHoldMs = 0;
        const out = this.recycleFloorLootById(candidateId);
        if (out) onRecycledGold(out.goldEarned, out.x, out.y);
        this.promptLabel?.setVisible(false);
        return;
      }
    } else {
      this.recycleHoldMs = 0;
      this.recycleTargetId = '';
    }

    if (nearestSkill) {
      const def = SKILL_CATALOG[nearestSkill.skill.skillId];
      const badge = formatWeaponQualityBadge(nearestSkill.skill.level, nearestSkill.skill.forgeGrade);
      const recVal = computeGearRecycleGold('SKILL', nearestSkill.skill.level, nearestSkill.skill.forgeGrade, (NarrativeStore.forgeTiers.recycle_lvl ?? 0) > 0);
      this.promptLabel?.setText(`[E] 换装 ${def.nameZh} ${badge} · [长按R] 回收 +${recVal}G`).setPosition(nearestSkill.x, nearestSkill.baseY - 32).setVisible(true);
      if (interactJustPressed) onInspectSkill(nearestSkill);
      return;
    }
    if (this.promptLabel?.visible) this.promptLabel.setVisible(false);
  }

  public destroy(): void {
    for (const s of this.skillDrops) if (s.sprite && this.registrar) { this.registrar.unregister(s.sprite); s.sprite.destroy(); }
    if (this.promptLabel && this.registrar) { this.registrar.unregister(this.promptLabel); this.promptLabel.destroy(); }
    this.skillDrops.length = 0;
  }

  private populateSecretVaultGear(dag: GeneratedBiomeDag): void {
    const skillPool = NarrativeStore.unlockedSkills.length > 0 ? NarrativeStore.unlockedSkills : (DEFAULT_STARTER_SKILLS as readonly SkillId[]);
    const wpnPool = NarrativeStore.unlockedWeapons.length > 0 ? NarrativeStore.unlockedWeapons : (DEFAULT_STARTER_WEAPONS as readonly WeaponId[]);
    for (const node of dag.nodes) {
      if (node.chunk.role !== 'RUNE_SECRET') continue;
      const ped = node.chunk.rewardPedestalTilePos;
      const gx = (node.worldTileX + (ped ? ped.tileX + 3 : 20)) * TILE_SIZE_PX + 8;
      const gy = (node.worldTileY + (ped ? ped.tileY + 1 : 26)) * TILE_SIZE_PX;
      const { level, forgeGrade } = rollDynamicGearTierAndGrade(this.lootRng, NarrativeStore.forgeTiers, this.biomeDepth, NarrativeStore.maxCrucibleHeat, true);
      if (this.lootRng.nextBool(0.5) || !this.weaponLoot) {
        this.spawnSkillDrop(`skl_secret_${node.nodeId}`, gx, gy, this.inventory.loadout.rollSkillInstance(this.lootRng, this.lootRng.pick(skillPool), level, forgeGrade));
      } else {
        this.weaponLoot.spawnDynamicWeaponDrop(`wpn_secret_${node.nodeId}`, gx, gy, this.inventory.rollWeaponInstance(this.lootRng, this.lootRng.pick(wpnPool), level, forgeGrade));
      }
    }
  }
}
