// ============================================================
// Merchant
// ワールドごとに配置される商人。data/merchants.json の
// merchantId に紐づく品揃え（ランダム選出済み）を持つ。
// ============================================================
import { Entity } from './Entity.js';

export class Merchant extends Entity {
  constructor(x, y, merchantId, stock) {
    super(x, y, 14, 16);
    this.merchantId = merchantId;
    this.stock = stock; // [{itemId, price, amount}, ...]
  }
}
