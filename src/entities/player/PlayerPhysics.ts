import { PLAYER_KINEMATICS } from '../../data/playerKinematics.data';
import {
  canStandingBodyFit,
  detectTouchingClimbWall,
  probeGroundSupport,
  solveHorizontalSubstep,
  solveVerticalSubstep,
  type ClimbableWallPx,
  type CollisionWorld,
  type OneWayPlatformPx,
  type SolidRectPx,
} from './SweptCollisionSolver';

export type { ClimbableWallPx, CollisionWorld, OneWayPlatformPx, SolidRectPx };

function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(target, current + maxDelta);
  if (current > target) return Math.max(target, current - maxDelta);
  return target;
}

/**
 * 120Hz 固定步长帧率无关主角物理组件（零 Phaser 依赖，支持无头确定性单测）。
 * 坐标系约定：(x, y) 为角色脚底中心点，匹配 hero_atlas pivot (0.5, 1.0)。
 */
export class PlayerPhysics {
  public x: number;
  public y: number;
  public prevX: number;
  public prevY: number;
  public vx = 0;
  public vy = 0;
  public facing: -1 | 1 = 1;

  public colliderWidth: number = PLAYER_KINEMATICS.STANDING_WIDTH_PX;
  public colliderHeight: number = PLAYER_KINEMATICS.STANDING_HEIGHT_PX;

  public isGrounded = false;
  public isOnOneWay = false;
  public touchingWallSide: -1 | 0 | 1 = 0;

  public coyoteTicks = 0;
  public airJumpsRemaining = 1;
  public maxAirJumps = 1;
  public oneWayIgnoreTicks = 0;
  public wallJumpLockTicks = 0;
  private lockedWallSide: -1 | 0 | 1 = 0;

  public constructor(spawnX = 0, spawnY = 0) {
    this.x = spawnX;
    this.y = spawnY;
    this.prevX = spawnX;
    this.prevY = spawnY;
  }

  public snapshotPreviousTransform(): void {
    this.prevX = this.x;
    this.prevY = this.y;
  }

  public setCompressedCollider(compressed: boolean): void {
    this.colliderHeight = compressed
      ? PLAYER_KINEMATICS.COMPRESSED_HEIGHT_PX
      : PLAYER_KINEMATICS.STANDING_HEIGHT_PX;
  }

  public canStandUp(world: CollisionWorld): boolean {
    return canStandingBodyFit(this, world);
  }

  public applyHorizontalRun(
    moveX: number,
    dtSec: number,
    maxSpeed: number = PLAYER_KINEMATICS.MAX_RUN_SPEED
  ): boolean {
    let triggeredTurnSnap = false;
    const dead = Math.abs(moveX) <= 0.04;

    if (this.isGrounded) {
      if (dead) {
        this.vx = approach(this.vx, 0, PLAYER_KINEMATICS.GROUND_DECEL * dtSec);
      } else {
        const targetVx = moveX * maxSpeed;
        const reversing = this.vx !== 0 && Math.sign(moveX) !== Math.sign(this.vx);
        const accel = reversing
          ? PLAYER_KINEMATICS.TURN_SNAP_ACCEL
          : PLAYER_KINEMATICS.GROUND_ACCEL;
        if (reversing && Math.abs(this.vx) >= 135) {
          triggeredTurnSnap = true;
        }
        this.vx = approach(this.vx, targetVx, accel * dtSec);
      }
    } else if (dead) {
      this.vx = approach(this.vx, 0, PLAYER_KINEMATICS.AIR_DECEL * dtSec);
    } else {
      this.vx = approach(this.vx, moveX * maxSpeed, PLAYER_KINEMATICS.AIR_ACCEL * dtSec);
    }

    if (Math.abs(moveX) > 0.08) {
      this.facing = moveX > 0 ? 1 : -1;
    }
    return triggeredTurnSnap;
  }

  public applyThreeStageGravity(
    dtSec: number,
    maxFallVy: number = PLAYER_KINEMATICS.MAX_FALL_VY
  ): void {
    let g: number;
    if (this.vy < -PLAYER_KINEMATICS.APEX_VY_THRESHOLD) {
      g = PLAYER_KINEMATICS.GRAVITY_RISE;
    } else if (this.vy <= PLAYER_KINEMATICS.APEX_VY_THRESHOLD) {
      g = PLAYER_KINEMATICS.GRAVITY_APEX;
    } else {
      g = PLAYER_KINEMATICS.GRAVITY_FALL;
    }
    this.vy = Math.min(maxFallVy, this.vy + g * dtSec);
  }

  public triggerOneWayDropThrough(): boolean {
    if (!this.isGrounded || !this.isOnOneWay) return false;
    this.oneWayIgnoreTicks = PLAYER_KINEMATICS.ONE_WAY_DROP_IGNORE_TICKS;
    this.isGrounded = false;
    this.isOnOneWay = false;
    this.coyoteTicks = 0;
    this.y += 1.5;
    this.vy = Math.max(this.vy, 64);
    return true;
  }

  public lockSameWallReattach(wallSide: -1 | 1): void {
    this.lockedWallSide = wallSide;
    this.wallJumpLockTicks = PLAYER_KINEMATICS.WALL_JUMP_LOCK_TICKS;
    this.touchingWallSide = 0;
  }

  public integrateAndCollide(
    world: CollisionWorld,
    dtSec: number,
    clampGroundLedge = false
  ): void {
    const wasGrounded = this.isGrounded;
    if (this.oneWayIgnoreTicks > 0) this.oneWayIgnoreTicks -= 1;
    if (this.wallJumpLockTicks > 0) {
      this.wallJumpLockTicks -= 1;
      if (this.wallJumpLockTicks === 0) this.lockedWallSide = 0;
    }

    const totalDx = this.vx * dtSec;
    const totalDy = this.vy * dtSec;
    const maxAxisMove = Math.max(Math.abs(totalDx), Math.abs(totalDy));
    const subSteps = Math.max(
      1,
      Math.ceil(maxAxisMove / PLAYER_KINEMATICS.MAX_SWEPT_SUBSTEP_PX)
    );
    const stepDx = totalDx / subSteps;
    const stepDy = totalDy / subSteps;

    let landedGround = false;
    let landedOneWay = false;

    for (let s = 0; s < subSteps; s++) {
      solveHorizontalSubstep(this, world, stepDx, wasGrounded && clampGroundLedge);
      const hitFloor = solveVerticalSubstep(this, world, stepDy);
      if (hitFloor === 'solid') {
        landedGround = true;
        landedOneWay = false;
      } else if (hitFloor === 'oneway') {
        landedGround = true;
        landedOneWay = true;
      }
    }

    if (!landedGround && this.vy >= 0) {
      const probe = probeGroundSupport(this, world, 0.5);
      if (probe !== 'none') {
        landedGround = true;
        landedOneWay = probe === 'oneway';
      }
    }

    this.isGrounded = landedGround;
    this.isOnOneWay = landedGround && landedOneWay;

    if (this.isGrounded) {
      this.coyoteTicks = PLAYER_KINEMATICS.COYOTE_TICKS;
      this.airJumpsRemaining = this.maxAirJumps;
    } else if (wasGrounded) {
      this.coyoteTicks = Math.min(this.coyoteTicks, PLAYER_KINEMATICS.COYOTE_TICKS);
      if (this.coyoteTicks > 0) this.coyoteTicks -= 1;
    } else if (this.coyoteTicks > 0) {
      this.coyoteTicks -= 1;
    }

    this.touchingWallSide = detectTouchingClimbWall(
      this,
      world,
      this.isGrounded,
      this.wallJumpLockTicks,
      this.lockedWallSide
    );
  }
}
