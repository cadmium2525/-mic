// ============================================================
// player.js - プレイヤーの移動・物理・採掘・インベントリ
// ============================================================
window.Game = window.Game || {};

(function () {
  const TILE_SIZE = 32;
  const MOVE_SPEED = 175;
  const JUMP_VELOCITY = -420;
  const GRAVITY = 1250;
  const CLIMB_SPEED = 110;

  class Player {
    constructor(x, y) {
      this.x = x; this.y = y;
      this.w = 24; this.h = 30;
      this.vx = 0; this.vy = 0;
      this.onGround = false;
      this.facing = 1;
      this.climbing = false;
      this.animTimer = 0;
      this.animFrame = 0;
      this.mineTimer = 0;
      this.placeTimer = 0;
      this.hurtTimer = 0;
      this.dead = false;
      this.coins = 0;
      this.lives = 3;
      this.hotbarIndex = 0; // 0=ladder 1=torch 2=bridge

      this.inventory = {
        materials: { wood: 0, stick: 0, stone: 0, coal: 0, iron: 0, diamond: 0 },
        pickaxeTier: 'none',
        swordTier: 'none',
        placeables: { ladder: 0, torch: 0, bridge: 0 },
      };
    }

    get toolTier() { return this.inventory.pickaxeTier; }

    addMaterial(key, n) {
      if (!key) return;
      this.inventory.materials[key] = (this.inventory.materials[key] || 0) + n;
    }

    rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

    tileAt(level, px, py) {
      const tx = Math.floor(px / TILE_SIZE);
      const ty = Math.floor(py / TILE_SIZE);
      if (ty < 0 || ty >= level.height || tx < 0 || tx >= level.width) return Game.TILE.BRICK;
      return level.grid[ty][tx];
    }

    isSolidAt(level, px, py) {
      const t = this.tileAt(level, px, py);
      const info = Game.TileInfo[t];
      return !!(info && info.solid);
    }

    update(dt, level, input) {
      if (this.dead) return;
      if (this.hurtTimer > 0) this.hurtTimer -= dt;
      if (this.mineTimer > 0) this.mineTimer -= dt;
      if (this.placeTimer > 0) this.placeTimer -= dt;

      // --- はしご判定 ---
      const centerX = this.x + this.w / 2;
      const midY = this.y + this.h / 2;
      const onLadder = this.tileAt(level, centerX, midY) === Game.TILE.LADDER;
      this.climbing = onLadder && (input.up || input.down || this.climbing);
      if (onLadder && (input.up || input.down)) this.climbing = true;
      if (!onLadder) this.climbing = false;

      // --- 横移動 ---
      if (input.left) { this.vx = -MOVE_SPEED; this.facing = -1; }
      else if (input.right) { this.vx = MOVE_SPEED; this.facing = 1; }
      else this.vx = 0;

      // --- ジャンプ / はしご移動 ---
      if (this.climbing) {
        this.vy = input.up ? -CLIMB_SPEED : input.down ? CLIMB_SPEED : 0;
      } else {
        this.vy += GRAVITY * dt;
        if (this.vy > 900) this.vy = 900;
        if (input.jumpPressed && this.onGround) {
          this.vy = JUMP_VELOCITY;
          this.onGround = false;
        }
      }

      // --- 横方向の衝突 ---
      let nx = this.x + this.vx * dt;
      if (this.vx !== 0) {
        const dirX = this.vx < 0 ? nx : nx + this.w;
        const top = this.y + 3;
        const bot = this.y + this.h - 3;
        if (this.isSolidAt(level, dirX, top) || this.isSolidAt(level, dirX, midY) || this.isSolidAt(level, dirX, bot)) {
          const tileCol = Math.floor(dirX / TILE_SIZE);
          nx = this.vx < 0 ? (tileCol + 1) * TILE_SIZE : tileCol * TILE_SIZE - this.w;
        }
      }
      this.x = Math.max(0, nx);

      // --- 縦方向の衝突 ---
      let ny = this.y + this.vy * dt;
      this.onGround = false;
      let hitCeilingTile = null;
      if (this.vy < 0) {
        const headY = ny;
        const lx = this.x + 3, rx = this.x + this.w - 3;
        const leftSolid = this.isSolidAt(level, lx, headY);
        const rightSolid = this.isSolidAt(level, rx, headY);
        if (leftSolid || rightSolid) {
          const hitX = leftSolid ? lx : rx;
          hitCeilingTile = { tx: Math.floor(hitX / TILE_SIZE), ty: Math.floor(headY / TILE_SIZE) };
          ny = Math.floor(headY / TILE_SIZE) * TILE_SIZE + TILE_SIZE;
          this.vy = 0;
        }
      } else if (this.vy >= 0) {
        const footY = ny + this.h;
        const lx = this.x + 3, rx = this.x + this.w - 3;
        const solidL = this.isSolidAt(level, lx, footY);
        const solidR = this.isSolidAt(level, rx, footY);
        if (solidL || solidR) {
          ny = Math.floor(footY / TILE_SIZE) * TILE_SIZE - this.h;
          this.vy = 0;
          this.onGround = true;
        }
      }
      this.y = ny;

      // 画面外/下に落下で死亡
      if (this.y > level.height * TILE_SIZE + 100) this.dead = true;

      // アニメーション
      if (Math.abs(this.vx) > 5 && this.onGround) {
        this.animTimer += dt;
        if (this.animTimer > 0.12) { this.animTimer = 0; this.animFrame = 1 - this.animFrame; }
      } else {
        this.animFrame = 0;
      }

      return { hitCeilingTile };
    }

    // 前方/足元のタイル座標を返す（採掘・設置共通）
    targetTile(level, input) {
      const cx = this.x + this.w / 2;
      const cy = this.y + this.h / 2;
      let tx, ty;
      if (input.down) {
        tx = Math.floor(cx / TILE_SIZE);
        ty = Math.floor((this.y + this.h + 4) / TILE_SIZE);
      } else if (input.up) {
        tx = Math.floor(cx / TILE_SIZE);
        ty = Math.floor((this.y - 4) / TILE_SIZE);
      } else {
        tx = Math.floor((cx + this.facing * (this.w / 2 + 6)) / TILE_SIZE);
        ty = Math.floor(cy / TILE_SIZE);
      }
      return { tx, ty };
    }

    takeDamage() {
      if (this.hurtTimer > 0 || this.dead) return;
      this.hurtTimer = 1.2;
      this.lives -= 1;
      if (this.lives <= 0) this.dead = true;
    }
  }

  window.Game.Player = Player;
  window.Game.PLAYER_CONST = { TILE_SIZE, MOVE_SPEED, JUMP_VELOCITY, GRAVITY };
})();
