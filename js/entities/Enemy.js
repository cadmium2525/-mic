// ============================================================
// Enemy
// data/enemies.json のパラメータに従って生成される汎用敵クラス。
// 現状のAIは「左右パトロールし、壁・崖で反転する」というシンプルなもの。
// ============================================================
import { Entity } from './Entity.js';

export class Enemy extends Entity {
  constructor(x, y, def) {
    super(x, y, def.width || 14, def.height || 14);
    this.type = def.type;
    this.spriteName = def.sprite;
    this.speed = def.speed || 20;
    this.hp = def.hp || 1;
    this.scoreCoin = def.dropCoin || 0;
    this.flies = !!def.flies; // 飛行タイプは重力を無視する（コウモリ等）
    this.vx = this.speed;
    this.dead = false;
  }

  update(dt, tileMap) {
    if (this.dead) return;

    if (!this.flies) {
      // 進行方向の1つ先の地面があるか＆壁がないかを見て、崖端・壁で反転する
      const ts = tileMap.tileSize;
      const dir = this.vx > 0 ? 1 : -1;
      const footX = dir > 0 ? this.x + this.width + 1 : this.x - 1;
      const footY = this.y + this.height + 1;
      const wallX = dir > 0 ? this.x + this.width + 1 : this.x - 1;

      const { tx: footTx, ty: footTy } = tileMap.toTileCoord(footX, footY);
      const groundAhead = tileMap.isSolidAt(footTx, footTy);
      const { tx: wallTx, ty: wallTy } = tileMap.toTileCoord(wallX, this.centerY);
      const wallAhead = tileMap.isSolidAt(wallTx, wallTy);

      if (!groundAhead || wallAhead) {
        this.vx *= -1;
      }
    } else {
      // 飛行タイプはふわふわ上下しながら左右に移動する
      this.y += Math.sin(Date.now() / 300 + this.x) * 0.4;
    }
  }
}
