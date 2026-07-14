// ============================================================
// Player
// 移動・ジャンプ・敵踏みつけ・採掘・ブロック設置を担当する。
// 実際の入力解釈はGame側で行い、Playerはそれを受けて状態を更新する。
// ============================================================
import { Entity } from './Entity.js';

const MOVE_SPEED = 90;   // px/s
const JUMP_SPEED = 230;  // px/s（負方向へ）
const MINE_RANGE = 20;   // 採掘/設置の届く距離(px)

export class Player extends Entity {
  constructor(x, y) {
    super(x, y, 12, 16);
    this.facing = 1; // 1:右 -1:左
    this.onGround = false;
    this.life = 3;
    this.maxLife = 3;
    this.invincibleTimer = 0;
    this.walkAnimTimer = 0;
    this.isWalking = false;
  }

  handleMove(input, dt) {
    let vx = 0;
    if (input.left) { vx -= MOVE_SPEED; this.facing = -1; }
    if (input.right) { vx += MOVE_SPEED; this.facing = 1; }
    this.vx = vx;
    this.isWalking = vx !== 0;

    if (input.jumpPressed && this.onGround) {
      this.vy = -JUMP_SPEED;
      this.onGround = false;
    }

    if (this.invincibleTimer > 0) this.invincibleTimer -= dt;
    if (this.isWalking) this.walkAnimTimer += dt;
  }

  // 採掘・設置の対象となるタイル座標を返す。
  // 「足元と同じ高さ」（floor＝床の採掘・橋渡し用）と
  // 「胴体の高さ」（body＝通路の壁に埋まった鉱石用）の2候補を返し、
  // 呼び出し側（Game._resolveContextAction）で状況に応じて使い分ける。
  getTargetTiles(tileMap) {
    const targetX = this.centerX + this.facing * MINE_RANGE;
    const floor = tileMap.toTileCoord(targetX, this.y + this.height + 2);
    const body = tileMap.toTileCoord(targetX, this.centerY);
    return { floor, body };
  }

  takeDamage() {
    if (this.invincibleTimer > 0) return false;
    this.life -= 1;
    this.invincibleTimer = 1.2;
    this.vy = -140;
    return true;
  }

  bounce() {
    this.vy = -160; // 敵を踏んだ時の跳ね返り
  }
}
