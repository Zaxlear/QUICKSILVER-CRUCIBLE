/**
 * 永恒锻炉圣所开局悬吊蒸馏管装备抽样器与交互挑选架
 * （src/world/StarterTubeSpawner.ts，严格 <= 180 行）。
 */

import type Phaser from 'phaser';
import { DepthLayer, PALETTE_VOID_HEX } from '../core/Constants';
import { DeterministicRng } from '../core/DeterministicRng';
import { NarrativeStore } from '../core/NarrativeSessionStore';
import { BLUEPRINT_BY_ID } from '../data/economy.data';
import { RNG_CHANNEL_HASH } from '../data/runes.data';
import { SKILL_CATALOG, type RolledSkillInstance, type SkillId } from '../data/skills.data';
import { DEFAULT_STARTER_SKILLS, DEFAULT_STARTER_WEAPONS } from '../data/storage.data';
import { WEAPON_CATALOG, type RolledWeaponInstance, type WeaponId } from '../data/weapons.data';
import { rollForgeGrade } from '../entities/player/ForgeGradeRoller';
import type { PlayerEntity } from '../entities/player/PlayerEntity';
import { formatWeaponQualityBadge } from '../entities/player/PlayerInventory';
import type { IWorldDisplayRegistrar } from './ParallaxComposer';

export interface StarterTubeOption {
  readonly id: string; readonly x: number; readonly y: number; readonly kind: 'WEAPON' | 'SKILL';
  weapon?: RolledWeaponInstance; skill?: RolledSkillInstance;
  readonly tubeSprite: Phaser.GameObjects.Sprite | null; readonly itemSprite: Phaser.GameObjects.Sprite | null;
}

export function equipFreshSanctumStarterKit(player: PlayerEntity, runSeed: number, inheritedGold = 0): DeterministicRng {
  const rng = new DeterministicRng(runSeed).fork(RNG_CHANNEL_HASH.LOOT_AND_AFFIX);
  const forgeTiers = NarrativeStore.forgeTiers;
  player.stats.resetForFreshSanctumRun(inheritedGold, forgeTiers.flask_charges);
  player.inventory.loadout.clearAllMutations();

  const wpnPool = NarrativeStore.unlockedWeapons.length > 0 ? NarrativeStore.unlockedWeapons : (DEFAULT_STARTER_WEAPONS as readonly WeaponId[]);
  const sklPool = NarrativeStore.unlockedSkills.length > 0 ? NarrativeStore.unlockedSkills : (DEFAULT_STARTER_SKILLS as readonly SkillId[]);
  const meleeCands = wpnPool.filter((id) => { const c = WEAPON_CATALOG[id].category; return c !== 'SHIELD' && c !== 'RANGED_BOW' && c !== 'RANGED_CROSSBOW'; });
  const offhandCands = wpnPool.filter((id) => { const c = WEAPON_CATALOG[id].category; return c === 'SHIELD' || c === 'RANGED_BOW' || c === 'RANGED_CROSSBOW' || c === 'THROWN_FLASK'; });

  const primId = rng.pick(meleeCands.length > 0 ? meleeCands : wpnPool);
  const secPool = (offhandCands.length > 0 ? offhandCands : wpnPool).filter((w) => w !== primId);
  const secId = rng.pick(secPool.length > 0 ? secPool : wpnPool);

  const g1 = rollForgeGrade(rng, forgeTiers, 1, NarrativeStore.maxCrucibleHeat);
  const g2 = rollForgeGrade(rng, forgeTiers, 1, NarrativeStore.maxCrucibleHeat);
  player.inventory.equipToSlot('primary', player.inventory.rollWeaponInstance(rng, primId, 'I', g1));
  player.inventory.equipToSlot('secondary', player.inventory.rollWeaponInstance(rng, secId, 'I', g2));

  const sk1Id = rng.pick(sklPool);
  const sk2Pool = sklPool.filter((s) => s !== sk1Id);
  const sk2Id = rng.pick(sk2Pool.length > 0 ? sk2Pool : sklPool);
  const sg1 = rollForgeGrade(rng, forgeTiers, 1, NarrativeStore.maxCrucibleHeat);
  const sg2 = rollForgeGrade(rng, forgeTiers, 1, NarrativeStore.maxCrucibleHeat);
  player.inventory.loadout.equipSkill('skill_1', player.inventory.loadout.rollSkillInstance(rng, sk1Id, 'I', sg1));
  player.inventory.loadout.equipSkill('skill_2', player.inventory.loadout.rollSkillInstance(rng, sk2Id, 'I', sg2));
  player.inventory.loadout.resetCooldowns();
  return rng;
}

export class StarterTubeSpawner {
  public readonly options: StarterTubeOption[] = [];
  private readonly promptLabel: Phaser.GameObjects.Text | null;
  private bobSec = 0;

  public constructor(
    private readonly scene: Phaser.Scene | null,
    private readonly registrar: IWorldDisplayRegistrar | null,
    private readonly player: PlayerEntity,
    starterRng: DeterministicRng,
    floorY: number
  ) {
    this.promptLabel = scene && registrar
      ? registrar.registerCrispOverlay(
          scene.add.text(0, 0, '', { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '10px', fontStyle: 'bold', color: '#38BDF8', stroke: PALETTE_VOID_HEX, strokeThickness: 3 })
            .setOrigin(0.5, 1.0).setDepth(DepthLayer.CRISP_TELEGRAPH + 2).setVisible(false)
        )
      : null;
    this.buildSuspensionTubes(starterRng, floorY);
  }

  public stepFixed(
    dtSec: number, px: number, py: number, interactPressed: boolean,
    onInspectWeapon: (id: string, wpn: RolledWeaponInstance) => void,
    onInspectSkill: (id: string, skl: RolledSkillInstance) => void
  ): void {
    this.bobSec += dtSec;
    const bob = Math.sin(this.bobSec * 3.2) * 2;
    let nearest: StarterTubeOption | null = null;
    let bestDist = 30;
    for (const opt of this.options) {
      opt.itemSprite?.setY(opt.y - 24 + bob);
      const d = Math.hypot(px - opt.x, py - opt.y);
      if (d < bestDist) { bestDist = d; nearest = opt; }
    }
    if (!nearest) { if (this.promptLabel?.visible) this.promptLabel.setVisible(false); return; }
    if (nearest.kind === 'WEAPON' && nearest.weapon) {
      const def = WEAPON_CATALOG[nearest.weapon.weaponId];
      this.promptLabel?.setText(`[E] 悬吊管换装 ${def.nameZh} ${formatWeaponQualityBadge(nearest.weapon.level, nearest.weapon.forgeGrade)}`).setPosition(nearest.x, nearest.y - 58).setVisible(true);
      if (interactPressed) onInspectWeapon(nearest.id, nearest.weapon);
    } else if (nearest.kind === 'SKILL' && nearest.skill) {
      const def = SKILL_CATALOG[nearest.skill.skillId];
      this.promptLabel?.setText(`[E] 悬吊管换装 ${def.nameZh} ${formatWeaponQualityBadge(nearest.skill.level, nearest.skill.forgeGrade)}`).setPosition(nearest.x, nearest.y - 58).setVisible(true);
      if (interactPressed) onInspectSkill(nearest.id, nearest.skill);
    }
  }

  public swapTubeWeapon(optionId: string, displaced: RolledWeaponInstance): void {
    const opt = this.options.find((o) => o.id === optionId && o.kind === 'WEAPON');
    if (!opt) return;
    opt.weapon = displaced;
    const def = WEAPON_CATALOG[displaced.weaponId];
    opt.itemSprite?.setTexture(def.worldAtlas, def.worldFrame);
  }

  public swapTubeSkill(optionId: string, displaced: RolledSkillInstance): void {
    const opt = this.options.find((o) => o.id === optionId && o.kind === 'SKILL');
    if (!opt) return;
    opt.skill = displaced;
    opt.itemSprite?.setFrame(SKILL_CATALOG[displaced.skillId].worldFrame);
  }

  public spawnTrialDrop(x: number, floorY: number, rng: DeterministicRng, blueprintId: string): void {
    const spec = BLUEPRINT_BY_ID[blueprintId];
    if (!spec || (spec.category !== 'WEAPON' && spec.category !== 'SKILL')) return;
    if (spec.category === 'WEAPON') {
      const wpn = this.player.inventory.rollWeaponInstance(rng, spec.blueprintId as WeaponId, 'I', 'PLUS');
      const wDef = WEAPON_CATALOG[wpn.weaponId];
      const itemSprite = this.scene && this.registrar ? this.registrar.registerWorldLit(this.scene.add.sprite(x, floorY - 24, wDef.worldAtlas, wDef.worldFrame).setDepth(DepthLayer.LOOT).setPipeline('Light2D')) : null;
      this.options.push({ id: `trial_wpn_${this.options.length}`, x, y: floorY, kind: 'WEAPON', weapon: wpn, tubeSprite: null, itemSprite });
    } else {
      const skl = this.player.inventory.loadout.rollSkillInstance(rng, spec.blueprintId as SkillId, 'I', 'PLUS');
      const itemSprite = this.scene && this.registrar ? this.registrar.registerWorldLit(this.scene.add.sprite(x, floorY - 24, 'synergy_fx_atlas', SKILL_CATALOG[skl.skillId].worldFrame).setDepth(DepthLayer.LOOT).setPipeline('Light2D')) : null;
      this.options.push({ id: `trial_skl_${this.options.length}`, x, y: floorY, kind: 'SKILL', skill: skl, tubeSprite: null, itemSprite });
    }
  }

  public destroy(): void {
    for (const opt of this.options) {
      if (opt.tubeSprite && this.registrar) { this.registrar.unregister(opt.tubeSprite); opt.tubeSprite.destroy(); }
      if (opt.itemSprite && this.registrar) { this.registrar.unregister(opt.itemSprite); opt.itemSprite.destroy(); }
    }
    if (this.promptLabel && this.registrar) { this.registrar.unregister(this.promptLabel); this.promptLabel.destroy(); }
    this.options.length = 0;
  }

  private buildSuspensionTubes(rng: DeterministicRng, floorY: number): void {
    const count = (NarrativeStore.forgeTiers.starter_tubes_lvl ?? 0) > 0 ? 3 : 2;
    const wpnPool = NarrativeStore.unlockedWeapons.length > 0 ? NarrativeStore.unlockedWeapons : (DEFAULT_STARTER_WEAPONS as readonly WeaponId[]);
    const sklPool = NarrativeStore.unlockedSkills.length > 0 ? NarrativeStore.unlockedSkills : (DEFAULT_STARTER_SKILLS as readonly SkillId[]);

    for (let i = 0; i < count; i++) {
      const tx = 552 + i * 32;
      const grade = rollForgeGrade(rng, NarrativeStore.forgeTiers, 1, NarrativeStore.maxCrucibleHeat);
      const tubeSprite = this.scene && this.registrar
        ? this.registrar.registerWorldLit(this.scene.add.sprite(tx, floorY, 'world_props_atlas', 'entrance_vessel_tube').setOrigin(0.5, 1.0).setDepth(DepthLayer.PROPS_BACK + 1).setPipeline('Light2D'))
        : null;
      if (i < count - 1) {
        const wpn = this.player.inventory.rollWeaponInstance(rng, rng.pick(wpnPool), 'I', grade);
        const wDef = WEAPON_CATALOG[wpn.weaponId];
        const itemSprite = this.scene && this.registrar
          ? this.registrar.registerWorldLit(this.scene.add.sprite(tx, floorY - 24, wDef.worldAtlas, wDef.worldFrame).setDepth(DepthLayer.LOOT).setPipeline('Light2D'))
          : null;
        this.options.push({ id: `tube_wpn_${i}`, x: tx, y: floorY, kind: 'WEAPON', weapon: wpn, tubeSprite, itemSprite });
      } else {
        const skl = this.player.inventory.loadout.rollSkillInstance(rng, rng.pick(sklPool), 'I', grade);
        const itemSprite = this.scene && this.registrar
          ? this.registrar.registerWorldLit(this.scene.add.sprite(tx, floorY - 24, 'synergy_fx_atlas', SKILL_CATALOG[skl.skillId].worldFrame).setDepth(DepthLayer.LOOT).setPipeline('Light2D'))
          : null;
        this.options.push({ id: `tube_skl_${i}`, x: tx, y: floorY, kind: 'SKILL', skill: skl, tubeSprite, itemSprite });
      }
    }
  }
}
