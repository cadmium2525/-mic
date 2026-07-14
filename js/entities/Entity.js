// ============================================================
// Entity
// プレイヤー・敵・アイテム・商人に共通する最低限のプロパティ。
// ============================================================
export class Entity {
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.vx = 0;
    this.vy = 0;
    this.dead = false;
  }

  get centerX() { return this.x + this.width / 2; }
  get centerY() { return this.y + this.height / 2; }
}
