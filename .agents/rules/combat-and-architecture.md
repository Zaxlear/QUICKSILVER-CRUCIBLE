---
trigger: always_on
description: Enforces strict decoupling, <=250 lines per TypeScript file, 120Hz frame-rate independent physics, node-based player/enemy FSMs, strongly-typed EventBus communication, zero-GC object pooling, and DAG RoomChunk level generation across all gameplay code.
---

# 战斗系统、物理步进与反耦合代码架构铁律

当创建、修改或审查 `src/` 与 `tests/` 下的任何游戏逻辑代码时，必须严格遵守以下七条硬性架构规范：

---

## 1. 单文件 250 行体积硬顶与模块依赖单向流

1. **行数红线**：所有逻辑源码文件（`src/**/*.ts`, `src/**/*.tsx`，不含纯静态数据文件 `src/data/*.data.ts`）物理行数**严格 ≤ 250 行**。禁止通过压缩多条语句到同一行或删除必要类型声明来规避检查。
2. **单向分层依赖（严禁循环引用）**：
   - `src/data/` → 不依赖任何运行时模块（纯常量与类型）。
   - `src/core/` → 仅依赖 `src/data/`。
   - `src/combat/`、`src/world/`、`src/input/` → 依赖 `src/core/` 与 `src/data/`，严禁反向 import `src/scenes/` 或 `src/ui/`。
   - `src/ui/`（Preact 层）→ **严禁直接持有或修改 `Phaser.Scene` / `PlayerEntity` 实例引用**！UI 层只能订阅 `EventBus` 只读快照事件，并通过 `EventBus.emit('ui:command:*', payload)` 下发交互意图。

---

## 2. 120Hz 固定步长帧率无关物理（Frame-Rate Independence）

1. **严禁裸帧位移计算**：禁止在任何地方编写 `sprite.x += speed` 或直接把未钳制的 `delta` 代入二次重力积分（会导致 60Hz 与 120Hz 屏幕最大跳跃高度不一致）。
2. **统一物理单位**：
   - 所有速度单位统一为 **逻辑像素/秒（`px/s`）**；
   - 所有加速度与重力单位统一为 **逻辑像素/秒²（`px/s²`）**；
   - 所有动作窗口（土狼时间、跳跃缓冲、无敌帧、招架帧、攻击前摇/判定/取消帧）统一以 **毫秒（`ms`）或 `120Hz` 逻辑帧（`1 tick = 8.3333ms`）** 定义，在 `ClockController` 的 `fixedSimStep(FIXED_STEP_SEC)` 内部步进。
3. **穿墙防护（Anti-Tunneling）**：高速位移实体（翻滚突进、弩箭投射物、Boss 冲锋）单步位移若超过瓦片尺寸的一半（`> 8px`），必须执行射线步进（Swept AABB / Raycast Sub-stepping）碰撞检测。

---

## 3. 节点化有限状态机（Node-Based FSM）强制规范

1. **主角 10 状态独立文件制**：`src/entities/player/states/` 必须将以下 10 个状态分别实现为独立类文件，统一实现 `IPlayerState` 接口：
   - `IdleState.ts`、`RunState.ts`、`JumpState.ts`、`DoubleJumpState.ts`、`WallSlideState.ts`、`DodgeRollState.ts`、`ParryState.ts`、`AttackComboState.ts`、`HurtState.ts`、`DeadState.ts`。
2. **标准状态生命周期契约**：
   ```typescript
   export interface IPlayerState {
     readonly id: PlayerStateId;
     enter(ctx: PlayerContext, prevState: PlayerStateId): void;
     fixedUpdate(ctx: PlayerContext, dtSec: number): PlayerStateId | null;
     exit(ctx: PlayerContext, nextState: PlayerStateId): void;
     canTransitionTo(target: PlayerStateId, ctx: PlayerContext): boolean;
   }
   ```
3. **输入取消优先级守卫（Cancel Hierarchy）**：
   - `DeadState` > `HurtState`（无霸体且非无敌帧时）> `ParryState` / `DodgeRollState`（处于攻击可取消窗口 `cancelWindowStartMs` 后可立即打断 `AttackComboState`）> `AttackComboState` > `JumpState` / `DoubleJumpState` > `RunState` > `IdleState`。
   - 严禁在 `AttackComboState` 外部散落硬编码连招计时器；动画帧事件仅负责渲染对齐，**攻击判定盒（Hitbox）激活与关闭必须由 `FIXED_STEP_SEC` 逻辑帧计数器驱动**，防止掉帧吞判定。

---

## 4. 强类型全局事件总线（Strongly-Typed EventBus）词条解耦

1. **禁止硬编码联动判断**：严禁在 `Weapon` 或 `BaseEnemy` 内部手写诸如 `if (player.hasMutation('mut_x') && weapon.hasAffix('affix_oil'))` 的耦合分支。
2. **全量事件契约声明**：`src/core/EventBus.ts` 必须通过 TypeScript `GameEventMap` 接口严格约束所有事件名与载荷类型（严禁 `any` 或无类型字符串事件）：
   - 战斗事件：`combat:attack_started`、`combat:hit_landed`、`combat:crit_triggered`、`combat:parry_succeeded`、`combat:dodge_evaded`、`combat:enemy_killed`
   - 元素状态事件：`status:applied`、`status:stacked`、`status:reaction_triggered`、`status:expired`
   - 跑图与存档事件：`world:room_entered`、`world:checkpoint_reached`、`save:conflict_detected`、`audio:combat_intensity_changed`
3. `AffixSynergyEngine.ts` 与所有 `Mutation` 处理器一律作为无状态/轻量订阅者挂载于 `EventBus`，在自身销毁或切换关卡时必须调用对应的 `off()` 释放监听器，严防内存泄漏。

---

## 5. 战斗热路径零 GC 与泛型对象池（ObjectPool）铁律

在关卡战斗运行期（`fixedSimStep` 与 `renderInterpolate` 执行栈内），**严禁触发垃圾回收尖峰（GC Spike）**：
1. **强制池化对象清单**：所有投射物（`Projectile`）、攻击判定盒（`Hitbox`）、受击飘字（`DamageNumber`）、水银血珠/火花粒子簇、翻滚残影精灵（`GhostSprite`）与掉落灵液球，必须在场景 `create()` 阶段通过 `ObjectPool<T>` 预分配（默认初始容量 `32 ~ 128`），回收时调用 `reset()` 隐藏并休眠物理体，严禁频繁调用 `new` 与 `.destroy()`。
2. **禁止热路径临时分配**：在 `fixedUpdate` 中严禁使用 `Phaser.Math.Vector2` 每次新建实例或对大数组频繁 `.filter().map()`；必须复用预分配的静态工作向量（Scratch Vectors）与定长环形缓冲区。

---

## 6. 手工房间切片（RoomChunk）与确定性拓扑铁律

1. **绝对禁止纯噪点生成地形**：严禁使用 Perlin Noise、Simplex Noise 或未经验证的随机网格生成平台。
2. **门锚点与跳跃包络硬校验**：所有关卡必须由 `src/world/DagBiomeGenerator.ts` 从手工设计的 `RoomChunk` JSON 库中按 `DeterministicRng` 抽取，并通过 `DoorSocket` 精确对齐拼接。相邻平台水平间距与垂直落差必须严格处于主角基础一段跳/二段跳包络线之内（需要特定探索符文的隐藏支路必须在 `DoorSocket.requiredRune` 中显式标记）。
