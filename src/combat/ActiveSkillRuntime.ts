/**
 * 6 种主动炼金技能运行时总控器（src/combat/ActiveSkillRuntime.ts）：
 * 统一编排黑火油雾罐紫火区、发条锯刃捕兽夹、黄铜特斯拉哨塔（≤140px 电弧绊线）、
 * 液氮霜环、赤化沸血狂潮与哲学家水银护瓮力场。
 */

import { EventBus, type TypedEventBus } from '../core/EventBus';
import { ObjectPool } from '../core/ObjectPool';
import { SKILL_CATALOG, SKILL_CONSTANTS } from '../data/skills.data';
import type { CombatTargetView } from './CombatTypes';
import {
  PooledHazardZone,
  PooledSawTrap,
  stepHazardZonesAndTraps,
  stepTeslaTurretAndTether,
  type ActiveTeslaTurretState,
  type HazardZoneKind,
  type SkillRuntimeDamageHit,
} from './SkillConstructStepper';
import type { StatusEffectMachine } from './StatusEffectMachine';

export { PooledHazardZone, PooledSawTrap };
export type { ActiveTeslaTurretState, HazardZoneKind, SkillRuntimeDamageHit };

export class ActiveSkillRuntime {
  public readonly hazardZones: ObjectPool<PooledHazardZone>;
  public readonly sawTraps: ObjectPool<PooledSawTrap>;
  private readonly activeTrapOrder: PooledSawTrap[] = [];

  public readonly turret: ActiveTeslaTurretState = {
    active: false, x: 0, y: 0, hp: 0, maxHp: SKILL_CONSTANTS.TESLA_TURRET_MAX_HP,
    remainingSec: 0, fireAccumSec: 0, tetherTickAccumSec: 0, tetherLinkedToPlayer: false,
    statScale: 1, affixIds: [],
  };

  public crimsonTransfusionSec = 0;
  public crimsonStatScale = 1.0;
  public aegisUrnSec = 0;
  public aegisShieldHp = 0;
  public aegisStatScale = 1.0;
  private aegisAffixIds: readonly string[] = [];

  private readonly scratchHits: SkillRuntimeDamageHit[] = [];
  private readonly scratchTurretArcs: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];

  public constructor(
    private readonly statusMachine: StatusEffectMachine,
    private readonly bus: TypedEventBus = EventBus
  ) {
    this.hazardZones = new ObjectPool(() => new PooledHazardZone(), 16, 48);
    this.sawTraps = new ObjectPool(() => new PooledSawTrap(), 4, 8);
  }

  public spawnHazardZone(kind: HazardZoneKind, x: number, y: number, radiusPx: number, durationSec: number, statScale: number): PooledHazardZone {
    const z = this.hazardZones.acquire();
    z.kind = kind;
    z.x = x;
    z.y = y;
    z.radiusPx = radiusPx;
    z.remainingSec = durationSec;
    z.tickAccumSec = 0.45;
    z.statScale = statScale;
    return z;
  }

  /** #01 黑火油雾罐落地：112px 黑油 + 中心 2 层燃烧 -> 瞬间转化为炼金紫火池 */
  public detonateBlackFireOilFlask(x: number, y: number, statScale: number, affixIds: readonly string[], targets: readonly CombatTargetView[]): readonly SkillRuntimeDamageHit[] {
    this.scratchHits.length = 0;
    const rad = SKILL_CONSTANTS.VITRIOL_FLASK_RADIUS_PX;
    const directDmg = Math.max(1, Math.round(SKILL_CATALOG.skl_vitriol_flask.baseDamage * statScale));
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]!;
      if (t.isAlive && Math.hypot(t.x - x, t.y - t.height * 0.5 - y) <= rad) {
        this.statusMachine.apply(t.id, 'oiled', 1, statScale, { worldX: t.x, worldY: t.y - 18 });
        this.statusMachine.apply(t.id, 'ignited', 2, statScale, { worldX: t.x, worldY: t.y - 18 });
        this.scratchHits.push({ targetId: t.id, amount: directDmg, isCrit: true, worldX: t.x, worldY: t.y - 18 });
      }
    }
    this.spawnHazardZone('VIOLET_NAPALM_POOL', x, y, rad, SKILL_CONSTANTS.VITRIOL_FLASK_POOL_DURATION_SEC, statScale);
    this.bus.emit('combat:skill_deployed', { skillId: 'skl_vitriol_flask', worldX: x, worldY: y, affixIds, statScale });
    return this.scratchHits;
  }

  /** #02 发条锯刃捕兽夹（最多存续 2 枚） */
  public deploySawTrap(x: number, y: number, statScale: number, affixIds: readonly string[]): void {
    while (this.activeTrapOrder.length >= SKILL_CONSTANTS.SAW_TRAP_MAX_ACTIVE) {
      this.sawTraps.release(this.activeTrapOrder.shift()!);
    }
    const tr = this.sawTraps.acquire();
    tr.x = x;
    tr.y = y;
    tr.remainingSec = SKILL_CONSTANTS.SAW_TRAP_LIFETIME_SEC;
    tr.statScale = statScale;
    tr.affixIds = affixIds;
    this.activeTrapOrder.push(tr);
    this.bus.emit('combat:skill_deployed', { skillId: 'skl_clockwork_saw_trap', worldX: x, worldY: y, affixIds, statScale });
  }

  /** #03 黄铜特斯拉哨塔（320 HP，持续 18s，靠近 ≤140px 激活蓝色高压电弧绊线） */
  public deployTeslaTurret(x: number, y: number, statScale: number, affixIds: readonly string[]): void {
    if (this.turret.active) this.expireTurret();
    this.turret.active = true;
    this.turret.x = x;
    this.turret.y = y;
    this.turret.hp = SKILL_CONSTANTS.TESLA_TURRET_MAX_HP;
    this.turret.remainingSec = SKILL_CONSTANTS.TESLA_TURRET_DURATION_SEC;
    this.turret.fireAccumSec = 0.35;
    this.turret.tetherTickAccumSec = 0;
    this.turret.statScale = statScale;
    this.turret.affixIds = affixIds;
    this.bus.emit('combat:skill_deployed', { skillId: 'skl_tesla_coil_turret', worldX: x, worldY: y, affixIds, statScale });
  }

  /** #04 液氮水银霜环（128px 瞬发冰冻 3.5s + 破冰 +25% 额外脆性易伤） */
  public castCryoMercuryNova(x: number, y: number, statScale: number, affixIds: readonly string[], targets: readonly CombatTargetView[]): readonly SkillRuntimeDamageHit[] {
    this.scratchHits.length = 0;
    const dmg = Math.max(1, Math.round(SKILL_CATALOG.skl_cryo_mercury_nova.baseDamage * statScale));
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]!;
      if (t.isAlive && Math.hypot(t.x - x, t.y - t.height * 0.5 - y) <= SKILL_CONSTANTS.CRYO_NOVA_RADIUS_PX) {
        this.statusMachine.apply(t.id, 'frozen', 1, statScale, {
          worldX: t.x, worldY: t.y - 18,
          durationOverrideSec: SKILL_CONSTANTS.CRYO_NOVA_FREEZE_SEC,
          extraCryoBrittleRatio: SKILL_CONSTANTS.CRYO_NOVA_BRITTLE_BONUS_RATIO,
        });
        this.scratchHits.push({ targetId: t.id, amount: dmg, isCrit: false, worldX: t.x, worldY: t.y - 18 });
      }
    }
    this.statusMachine.clearTarget('player_vessel_09');
    this.bus.emit('combat:skill_deployed', { skillId: 'skl_cryo_mercury_nova', worldX: x, worldY: y, affixIds, statScale });
    return this.scratchHits;
  }

  /** #05 赤化沸血狂潮：6s 攻速 +35%、移速 +25%、攻击溅射血雾（击杀延 1s，封顶 10s） */
  public activateCrimsonTransfusion(x: number, y: number, statScale: number, affixIds: readonly string[]): void {
    this.crimsonTransfusionSec = SKILL_CONSTANTS.CRIMSON_TRANSFUSION_BASE_SEC;
    this.crimsonStatScale = statScale;
    this.bus.emit('combat:skill_deployed', { skillId: 'skl_crimson_transfusion', worldX: x, worldY: y, affixIds, statScale });
  }

  public extendCrimsonOnKill(): void {
    if (this.crimsonTransfusionSec > 0) {
      this.crimsonTransfusionSec = Math.min(SKILL_CONSTANTS.CRIMSON_TRANSFUSION_MAX_SEC, this.crimsonTransfusionSec + SKILL_CONSTANTS.CRIMSON_TRANSFUSION_KILL_EXTEND_SEC);
    }
  }

  /** #06 哲学家水银护瓮：展开 5s 35% MaxHP 折射力场，破盾或重按震飞 110px 造成 90 白化伤 */
  public activateAegisTonics(x: number, y: number, maxHp: number, statScale: number, affixIds: readonly string[]): void {
    this.aegisUrnSec = SKILL_CONSTANTS.AEGIS_TONICS_DURATION_SEC;
    this.aegisShieldHp = Math.max(15, Math.round(maxHp * SKILL_CONSTANTS.AEGIS_TONICS_SHIELD_MAX_HP_RATIO * (1 + (statScale - 1) * 0.25)));
    this.aegisStatScale = statScale;
    this.aegisAffixIds = affixIds;
    this.bus.emit('combat:skill_deployed', { skillId: 'skl_aegis_tonics', worldX: x, worldY: y, affixIds, statScale });
  }

  public absorbWithAegisShield(incomingDamage: number, worldX: number, worldY: number): { readonly remainingDamage: number; readonly shatteredBurstDmg: number } {
    if (this.aegisUrnSec <= 0 || this.aegisShieldHp <= 0) return { remainingDamage: incomingDamage, shatteredBurstDmg: 0 };
    if (incomingDamage < this.aegisShieldHp) {
      this.aegisShieldHp -= incomingDamage;
      return { remainingDamage: 0, shatteredBurstDmg: 0 };
    }
    const overflow = incomingDamage - this.aegisShieldHp;
    this.aegisShieldHp = 0;
    this.aegisUrnSec = 0;
    const burst = Math.max(1, Math.round(SKILL_CONSTANTS.AEGIS_TONICS_BURST_BASE_DMG * this.aegisStatScale));
    this.bus.emit('combat:skill_expired', { skillId: 'skl_aegis_tonics', worldX, worldY, affixIds: this.aegisAffixIds, statScale: this.aegisStatScale, baseDamage: 90 });
    return { remainingDamage: overflow, shatteredBurstDmg: burst };
  }

  public isNearAnyConstruct(px: number, py: number, maxDistPx = 180): boolean {
    if (this.turret.active && Math.hypot(px - this.turret.x, py - this.turret.y) <= maxDistPx) return true;
    return this.activeTrapOrder.some((tr) => Math.hypot(px - tr.x, py - tr.y) <= maxDistPx);
  }

  public isPointInConductiveZone(x: number, y: number): boolean {
    let found = false;
    this.hazardZones.forEachActive((z) => {
      if (Math.abs(x - z.x) <= z.radiusPx && Math.abs(y - z.y) <= 44) found = true;
    });
    return found;
  }

  public stepFixed(dtSec: number, playerX: number, playerY: number, targets: readonly CombatTargetView[]): {
    readonly hits: readonly SkillRuntimeDamageHit[];
    readonly turretArcs: ReadonlyArray<{ x0: number; y0: number; x1: number; y1: number }>;
  } {
    this.scratchHits.length = 0;
    this.scratchTurretArcs.length = 0;
    if (this.crimsonTransfusionSec > 0) this.crimsonTransfusionSec = Math.max(0, this.crimsonTransfusionSec - dtSec);
    if (this.aegisUrnSec > 0) {
      this.aegisUrnSec = Math.max(0, this.aegisUrnSec - dtSec);
      if (this.aegisUrnSec === 0) this.aegisShieldHp = 0;
    }
    stepHazardZonesAndTraps(dtSec, this.hazardZones, this.sawTraps, this.activeTrapOrder, targets, this.statusMachine, this.bus, this.scratchHits);
    if (this.turret.active) {
      stepTeslaTurretAndTether(dtSec, this.turret, playerX, playerY - 16, targets, this.statusMachine, () => this.expireTurret(), this.scratchHits, this.scratchTurretArcs);
    }
    return { hits: this.scratchHits, turretArcs: this.scratchTurretArcs };
  }

  public expireTurret(): void {
    if (!this.turret.active) return;
    this.turret.active = false;
    this.turret.tetherLinkedToPlayer = false;
    this.bus.emit('combat:skill_expired', {
      skillId: 'skl_tesla_coil_turret', worldX: this.turret.x, worldY: this.turret.y - 14,
      affixIds: this.turret.affixIds, statScale: this.turret.statScale, baseDamage: 26,
    });
  }

  public releaseAll(): void {
    this.hazardZones.releaseAll();
    this.sawTraps.releaseAll();
    this.activeTrapOrder.length = 0;
    this.turret.active = false;
    this.turret.tetherLinkedToPlayer = false;
    this.crimsonTransfusionSec = 0;
    this.aegisUrnSec = 0;
    this.aegisShieldHp = 0;
  }
}
