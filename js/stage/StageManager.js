// ============================================================
// StageManager
// 1つのステージJSONを読み込み、TileMapと各種エンティティを構築する。
// 「JSONを追加するだけで新ステージ／新ワールドを増やせる」ことを目指す設計。
// ============================================================
import { TileMap } from './TileMap.js';
import { Player } from '../entities/Player.js';
import { Enemy } from '../entities/Enemy.js';
import { ItemPickup } from '../entities/Item.js';
import { Merchant } from '../entities/Merchant.js';

export class StageManager {
  constructor(stageData, gameData) {
    this.stageData = stageData;
    this.gameData = gameData; // { items, recipes, enemies, merchants, dialogues }
    this.tileMap = new TileMap(stageData);

    this.enemies = (stageData.enemies || []).map(e => {
      const def = gameData.enemies.find(d => d.type === e.type) || {};
      return new Enemy(e.x, e.y, def);
    });

    // ボスが定義されていれば、通常敵と同じ配列に「isBoss」フラグ付きで追加する。
    // こうすることでゴール判定（ボスを倒すまでクリア不可）が単純な共通ロジックで済む。
    if (stageData.boss) {
      const b = stageData.boss;
      const bossEnemy = new Enemy(b.x, b.y, {
        type: b.type, sprite: b.sprite, width: b.width, height: b.height,
        speed: b.speed, hp: b.hp, dropCoin: b.dropCoin || 5,
      });
      bossEnemy.isBoss = true;
      bossEnemy.name = b.name;
      this.enemies.push(bossEnemy);
    }

    this.items = (stageData.items || []).map(i => new ItemPickup(i.x, i.y, i));

    this.merchant = null;
    if (stageData.merchant) {
      const merchDef = gameData.merchants[stageData.merchant.id];
      const stock = pickRandomStock(merchDef);
      this.merchant = new Merchant(stageData.merchant.x, stageData.merchant.y, stageData.merchant.id, stock);
    }

    this.goal = stageData.goal || null;
    this.bossGate = stageData.bossGate || null; // { x,y,w,h, requiresTool }
    this.bossGateOpen = false;
    this.boss = stageData.boss ? { ...stageData.boss, hp: stageData.boss.hp, dead: false } : null;

    this.cleared = false;
  }

  createPlayer() {
    const p = this.stageData.playerStart;
    return new Player(p.x, p.y);
  }

  get widthPx() { return this.tileMap.pixelWidth; }
  get heightPx() { return this.tileMap.pixelHeight; }
}

// 商人の販売品リストから、定義された個数だけランダムに選出する
function pickRandomStock(merchDef) {
  if (!merchDef) return [];
  const pool = [...merchDef.pool];
  const count = Math.min(merchDef.slotCount || 3, pool.length);
  const chosen = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(idx, 1)[0]);
  }
  return chosen;
}
