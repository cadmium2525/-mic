// ============================================================
// ItemPickup
// ステージ上に配置された「拾える素材／コイン」。
// ============================================================
import { Entity } from './Entity.js';

export class ItemPickup extends Entity {
  constructor(x, y, def) {
    super(x, y, 10, 10);
    this.itemId = def.itemId;   // 'wood','stone','coin' など
    this.amount = def.amount || 1;
    this.spriteName = def.sprite || `item_${def.itemId}`;
    this.collected = false;
  }
}
