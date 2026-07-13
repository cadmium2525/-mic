// ============================================================
// entities.js - 敵キャラクターの状態とAI
// ============================================================
window.Game = window.Game || {};

(function () {
  const TILE_SIZE = 32;

  class Enemy {
    constructor(def) {
      this.type = def.type;
      this.x = def.x * TILE_SIZE;
      this.y = (def.y != null ? def.y : 0) * TILE_SIZE;
      this.spawnY = this.y;
      this.minX = (def.min != null ? def.min : def.x - 3) * TILE_SIZE;
      this.maxX = (def.max != null ? def.max : def.x + 3) * TILE_SIZE;
      this.w = this.type === 'boss' ? 56 : 28;
      this.h = this.type === 'boss' ? 56 : 26;
      this.vx = this.type === 'slime' ? 0 : -60;
      this.vy = 0;
      this.dir = -1;
      this.alive = true;
      this.hp = this.type === 'boss' ? 3 : 1;
      this.hurtTimer = 0;
      this.hopTimer = Math.random() * 60;
      this.onGround = false;
      this.deathTimer = 0;
    }

    get speed() {
      if (this.type === 'boss') return 30;
      if (this.type === 'slime') return 40;
      return 55;
    }

    update(dt, level, solidAt) {
      if (!this.alive) {
        this.deathTimer += dt;
        return;
      }
      if (this.hurtTimer > 0) this.hurtTimer -= dt;

      if (this.type === 'slime') {
        this.hopTimer -= dt * 1000;
        if (this.onGround && this.hopTimer <= 0) {
          this.vy = -260;
          this.vx = this.dir * this.speed;
          this.hopTimer = 900 + Math.random() * 500;
        }
        if (this.onGround) this.vx *= 0.9;
      } else {
        this.vx = this.dir * this.speed;
      }

      // 重力
      this.vy += 900 * dt;
      if (this.vy > 700) this.vy = 700;

      // 横移動 + 壁判定
      let nx = this.x + this.vx * dt;
      if (this.vx !== 0) {
        const feetY = this.y + this.h - 2;
        const checkX = this.vx < 0 ? nx : nx + this.w;
        if (solidAt(checkX, this.y + 4) || solidAt(checkX, feetY)) {
          this.dir *= -1;
          nx = this.x;
        }
      }
      this.x = nx;

      // 縦移動
      let ny = this.y + this.vy * dt;
      this.onGround = false;
      if (this.vy >= 0) {
        const feetY = ny + this.h;
        if (solidAt(this.x + 4, feetY) || solidAt(this.x + this.w - 4, feetY)) {
          ny = Math.floor(feetY / TILE_SIZE) * TILE_SIZE - this.h;
          this.vy = 0;
          this.onGround = true;
        }
      }
      this.y = ny;

      // パトロール範囲の折り返し（歩行タイプのみ・スライムは範囲のみ）
      if (this.x < this.minX) { this.x = this.minX; this.dir = 1; }
      if (this.x + this.w > this.maxX) { this.x = this.maxX - this.w; this.dir = -1; }

      // 崖端で反転（歩行タイプ）
      if (this.type === 'walker' && this.onGround) {
        const aheadX = this.dir < 0 ? this.x - 2 : this.x + this.w + 2;
        if (!solidAt(aheadX, this.y + this.h + 4)) this.dir *= -1;
      }
    }

    hit(instaKill) {
      this.hp -= instaKill ? this.hp : 1;
      this.hurtTimer = 0.3;
      if (this.hp <= 0) {
        this.alive = false;
        this.deathTimer = 0;
      }
    }

    rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  }

  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  window.Game.Enemy = Enemy;
  window.Game.overlapRect = overlap;
})();
