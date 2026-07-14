// ============================================================
// Inventory
// 素材の所持数とコイン（通貨・ライフとは無関係）を管理する。
// ============================================================
export class Inventory {
  constructor(initial = {}) {
    this.materials = { ...initial.materials }; // { wood:0, stone:0, ... }
    this.coins = initial.coins || 0;
    this.tools = initial.tools || {};          // { pickaxe:true, key:true, ... }
  }

  add(itemId, amount = 1) {
    if (itemId === 'coin') { this.coins += amount; return; }
    this.materials[itemId] = (this.materials[itemId] || 0) + amount;
  }

  has(itemId, amount = 1) {
    if (itemId === 'coin') return this.coins >= amount;
    return (this.materials[itemId] || 0) >= amount;
  }

  consume(itemId, amount = 1) {
    if (!this.has(itemId, amount)) return false;
    if (itemId === 'coin') this.coins -= amount;
    else this.materials[itemId] -= amount;
    return true;
  }

  hasTool(toolId) { return !!this.tools[toolId]; }
  giveTool(toolId) { this.tools[toolId] = true; }

  serialize() {
    return { materials: { ...this.materials }, coins: this.coins, tools: { ...this.tools } };
  }
}
