// ============================================================
// Game
// アプリ全体のオーケストレーター。
// ロジック（更新）と描画（render）を明確に分離し、
// データ駆動（JSON）で読み込んだステージ／敵／アイテム／レシピを
// 各システムに橋渡しする役割を持つ。
// ============================================================
import { InputManager } from './InputManager.js';
import { Camera } from './Camera.js';
import { SaveManager } from './SaveManager.js';
import { loadAllData, STAGE_LIST } from './DataLoader.js';
import { preloadSprites, getSprite } from './AssetFactory.js';
import { stepPhysics, isOverlapping } from './Physics.js';

import { StageManager } from '../stage/StageManager.js';
import { Inventory } from '../systems/Inventory.js';
import { CraftingSystem } from '../systems/Crafting.js';
import { DialogueManager } from '../systems/DialogueManager.js';
import { UIManager } from '../ui/UIManager.js';

const VIEW_W = 384; // 内部解像度（16:9）。CSS側で画面いっぱいに拡大表示する
const VIEW_H = 216;

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.canvas.width = VIEW_W;
    this.canvas.height = VIEW_H;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.state = 'loading'; // loading / title / playing / cleared / worldclear / gameover
    this.paused = false;
    this.shownDialogues = new Set();
    this._lastTime = 0;
    this._actionLabelCache = '';
  }

  async init() {
    const data = await loadAllData();
    this.items = data.items;                    // { id: {name, sprite, ...} }
    this.recipes = new CraftingSystem(data.recipes);
    this.enemiesData = data.enemies;
    this.merchantsData = data.merchants;
    this.dialoguesData = data.dialogues;
    this.stagesData = data.stages;

    preloadSprites(2);

    const saved = SaveManager.load();
    this.inventory = new Inventory(saved || {});
    this.currentStageId = (saved && saved.currentStageId) || '1-1';

    this.input = new InputManager();
    this.ui = new UIManager(this);
    this.dialogueManager = new DialogueManager(this.dialoguesData, this.ui);

    this.camera = new Camera(VIEW_W, VIEW_H);

    this._loadStage(this.currentStageId, { showIntro: false });

    this.state = 'title';
    this.ui.showOverlay('Craft & Jump', 'スーパーマリオ x マインクラフト\nワールド1: 全4ステージ', 'スタート');

    requestAnimationFrame((t) => this._loop(t));
  }

  // ---- ステージ読み込み ----
  _loadStage(stageId, opts = {}) {
    const stageData = this.stagesData[stageId];
    this.stage = new StageManager(stageData, { enemies: this.enemiesData, merchants: this.merchantsData });
    this.player = this.stage.createPlayer();
    this.currentStageId = stageId;
    this.paused = false;

    if (opts.showIntro !== false && stageData.introDialogue && !this.shownDialogues.has(stageData.introDialogue)) {
      this.paused = true;
      this.shownDialogues.add(stageData.introDialogue);
      // 1フレーム後に開始（DOM構築待ち）
      setTimeout(() => this.dialogueManager.start(stageData.introDialogue, () => { this.paused = false; }), 50);
    }
  }

  // ---- オーバーレイのボタン（スタート／次へ／リトライ）----
  onOverlayButton() {
    if (this.state === 'title') {
      this.ui.hideOverlay();
      this.state = 'playing';
      // タイトル画面の裏で既に読み込み済みのステージへ、必要なら導入会話を出す
      const stageData = this.stagesData[this.currentStageId];
      if (stageData.introDialogue && !this.shownDialogues.has(stageData.introDialogue)) {
        this.paused = true;
        this.shownDialogues.add(stageData.introDialogue);
        this.dialogueManager.start(stageData.introDialogue, () => { this.paused = false; });
      }
      return;
    }

    if (this.state === 'cleared') {
      const idx = STAGE_LIST.findIndex(s => s.id === this.currentStageId);
      const next = STAGE_LIST[idx + 1];
      this.ui.hideOverlay();
      if (next) {
        this._loadStage(next.id);
        this.state = 'playing';
      } else {
        this.state = 'worldclear';
        this.ui.showOverlay('ワールド1 クリア！！', 'ここまで遊んでくれてありがとう\n（ワールド2以降は開発中です）', 'タイトルへ戻る');
      }
      return;
    }

    if (this.state === 'worldclear') {
      this._loadStage('1-1', { showIntro: false });
      this.shownDialogues.clear();
      this.state = 'title';
      this.ui.hideOverlay();
      this.ui.showOverlay('Craft & Jump', 'スーパーマリオ x マインクラフト\nワールド1: 全4ステージ', 'スタート');
      return;
    }

    if (this.state === 'gameover') {
      this._loadStage(this.currentStageId, { showIntro: false });
      this.ui.hideOverlay();
      this.state = 'playing';
      return;
    }
  }

  // ============================================================
  // メインループ
  // ============================================================
  _loop(timestamp) {
    const dt = Math.min((timestamp - this._lastTime) / 1000, 0.05) || 0;
    this._lastTime = timestamp;

    this.input.update();

    if (this.state === 'playing' && !this.paused) {
      this._update(dt);
    }

    this._render();
    requestAnimationFrame((t) => this._loop(t));
  }

  // ---- ロジック更新 ----
  _update(dt) {
    const { player, stage, input, inventory } = this;

    // 会話中はアクションボタンで進める
    if (this.dialogueManager.isActive) {
      if (input.actionPressed) this.dialogueManager.next();
      return;
    }

    player.handleMove(input, dt);
    stepPhysics(player, dt, stage.tileMap);

    // 谷底への落下判定（ミス扱いにして開始地点付近に戻す）
    if (player.y > stage.tileMap.pixelHeight + 60) {
      this._onPlayerHurtOrFall(true);
    }

    // コンテキストアクション（採掘／設置／会話／扉を開ける）の判定
    const context = this._resolveContextAction();
    this._updateActionLabel(context.label);
    if (input.actionPressed) this._executeContextAction(context);

    // 敵の更新と当たり判定
    for (const enemy of stage.enemies) {
      if (enemy.dead) continue;
      enemy.update(dt, stage.tileMap);
      if (isOverlapping(player, enemy)) this._resolveEnemyHit(enemy);
    }

    // アイテム拾得
    for (const item of stage.items) {
      if (item.collected) continue;
      if (isOverlapping(player, item)) {
        inventory.add(item.itemId, item.amount);
        item.collected = true;
      }
    }
    stage.items = stage.items.filter(i => !i.collected);

    this.ui.updateHud(player, inventory.coins);

    // ゴール判定（ボスがいる場合は倒すまでクリアにならない）
    if (stage.goal) {
      const goalBox = { x: stage.goal.x, y: stage.goal.y, width: stage.goal.w, height: stage.goal.h };
      const bossAlive = stage.enemies.some(e => e.isBoss && !e.dead);
      if (!bossAlive && isOverlapping(player, goalBox)) {
        this._onStageClear();
      }
    }
  }

  _resolveContextAction() {
    const { player, stage, inventory } = this;

    // 1. 近くに商人がいれば会話優先
    if (stage.merchant && isOverlapping(expand(player, 6), stage.merchant)) {
      return { type: 'talk_merchant', label: '会話' };
    }

    const { floor, body } = player.getTargetTiles(stage.tileMap);
    const floorDef = stage.tileMap.getTileDef(floor.tx, floor.ty);
    const bodyDef = stage.tileMap.getTileDef(body.tx, body.ty);

    // 2. 鍵の扉（どちらの高さにあってもよい）
    if (floorDef && floorDef.gate) return { type: 'open_gate', label: '扉を開く', tx: floor.tx, ty: floor.ty };
    if (bodyDef && bodyDef.gate) return { type: 'open_gate', label: '扉を開く', tx: body.tx, ty: body.ty };

    // 3. 採掘可能タイル（床優先、なければ胴体の高さ＝壁に埋まった鉱石）
    if (floorDef && floorDef.minable) return { type: 'mine', label: '採掘', tx: floor.tx, ty: floor.ty };
    if (bodyDef && bodyDef.minable) return { type: 'mine', label: '採掘', tx: body.tx, ty: body.ty };

    // 4. 何もない場所には設置できる（谷を渡る橋作りは足元の高さが基本）
    if (!floorDef) {
      if (inventory.has('footstep', 1)) return { type: 'place', item: 'footstep', tileChar: 'f', label: '足場設置', tx: floor.tx, ty: floor.ty };
      if (inventory.has('torch', 1)) return { type: 'place', item: 'torch', tileChar: 't', label: '松明設置', tx: floor.tx, ty: floor.ty };
    }
    if (!bodyDef) {
      if (inventory.has('footstep', 1)) return { type: 'place', item: 'footstep', tileChar: 'f', label: '足場設置', tx: body.tx, ty: body.ty };
      if (inventory.has('torch', 1)) return { type: 'place', item: 'torch', tileChar: 't', label: '松明設置', tx: body.tx, ty: body.ty };
    }

    return { type: 'none', label: '-' };
  }

  _updateActionLabel(label) {
    if (label !== this._actionLabelCache) {
      this.ui.setActionLabel(label);
      this._actionLabelCache = label;
    }
  }

  _executeContextAction(context) {
    const { stage, inventory } = this;
    switch (context.type) {
      case 'talk_merchant':
        this.ui.openMerchant(stage.merchant);
        break;
      case 'open_gate':
        if (inventory.hasTool('key')) {
          stage.tileMap.removeAt(context.tx, context.ty);
        }
        break;
      case 'mine': {
        const result = stage.tileMap.mineAt(context.tx, context.ty, inventory.hasTool('pickaxe'));
        if (result && result.drop) inventory.add(result.drop, result.amount);
        break;
      }
      case 'place': {
        const ok = stage.tileMap.placeAt(context.tx, context.ty, context.tileChar);
        if (ok) inventory.consume(context.item, 1);
        break;
      }
    }
  }

  _resolveEnemyHit(enemy) {
    const { player, inventory } = this;
    const stomping = player.vy > 0 && (player.y + player.height) - enemy.y < 10;
    if (stomping) {
      enemy.hp -= 1;
      player.bounce();
      if (enemy.hp <= 0) {
        enemy.dead = true;
        inventory.add('coin', enemy.scoreCoin || 0);
      }
    } else {
      this._onPlayerHurtOrFall(false);
    }
  }

  _onPlayerHurtOrFall(isFall) {
    const hurt = this.player.takeDamage();
    if (isFall) {
      // 落下死は開始地点付近まで戻す
      const start = this.stage.stageData.playerStart;
      this.player.x = start.x;
      this.player.y = start.y;
      this.player.vx = 0; this.player.vy = 0;
    }
    if (hurt && this.player.life <= 0) this._onGameOver();
  }

  _onStageClear() {
    this.state = 'cleared';
    SaveManager.save({
      ...this.inventory.serialize(),
      currentStageId: this.currentStageId,
    });
    const name = this.stage.stageData.name;
    this.ui.showOverlay('ステージクリア！', `${name}\n所持コイン: ${this.inventory.coins}`, '次へ');
  }

  _onGameOver() {
    this.state = 'gameover';
    this.ui.showOverlay('ゲームオーバー', 'もう一度挑戦しよう', 'リトライ');
  }

  // ============================================================
  // 描画
  // ============================================================
  _render() {
    const { ctx, stage, player, camera } = this;
    if (!stage) return;

    camera.follow(player, stage.widthPx, stage.heightPx);

    ctx.fillStyle = stage.stageData.background || '#7ec0ee';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.save();
    ctx.translate(-Math.round(camera.x), -Math.round(camera.y));

    this._drawTiles();
    this._drawGoalFlag();
    for (const item of stage.items) this._drawSprite(item.spriteName, item.x, item.y);
    if (stage.merchant) this._drawSprite('merchant', stage.merchant.x, stage.merchant.y);
    for (const enemy of stage.enemies) {
      if (enemy.dead) continue;
      this._drawSprite(enemy.spriteName, enemy.x, enemy.y, enemy.vx < 0);
    }
    this._drawPlayer();

    ctx.restore();

    if (stage.stageData.dark) this._drawDarkness();
  }

  _drawTiles() {
    const { ctx, stage, camera } = this;
    const tm = stage.tileMap;
    const ts = tm.tileSize;
    const txStart = Math.max(0, Math.floor(camera.x / ts) - 1);
    const txEnd = Math.min(tm.width - 1, Math.ceil((camera.x + VIEW_W) / ts) + 1);
    const tyStart = Math.max(0, Math.floor(camera.y / ts) - 1);
    const tyEnd = Math.min(tm.height - 1, Math.ceil((camera.y + VIEW_H) / ts) + 1);

    for (let ty = tyStart; ty <= tyEnd; ty++) {
      for (let tx = txStart; tx <= txEnd; tx++) {
        const def = tm.getTileDef(tx, ty);
        if (!def || !def.sprite) continue;
        const sprite = getSprite(def.sprite);
        if (sprite) ctx.drawImage(sprite, tx * ts, ty * ts, ts, ts);
      }
    }
  }

  _drawGoalFlag() {
    if (!this.stage.goal) return;
    this._drawSprite('goal_flag', this.stage.goal.x, this.stage.goal.y);
  }

  _drawSprite(name, x, y, flip = false) {
    const sprite = getSprite(name);
    if (!sprite) return;
    const { ctx } = this;
    const w = sprite.width, h = sprite.height;
    if (flip) {
      ctx.save();
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(sprite, x, y);
    }
  }

  _drawPlayer() {
    const p = this.player;
    // 無敵時間中は点滅させる
    if (p.invincibleTimer > 0 && Math.floor(p.invincibleTimer * 10) % 2 === 0) return;
    const walking = p.isWalking && Math.floor(p.walkAnimTimer * 6) % 2 === 0;
    const name = walking ? 'player_walk' : 'player_idle';
    this._drawSprite(name, p.x - 6, p.y - 8, p.facing < 0);
  }

  // 洞窟ステージ用の「暗闇」演出：プレイヤー周辺だけ丸く見える半透明の黒を被せる。
  // 近くに設置済みの松明（lightタイル）があれば、その分だけ明るく見えるようにする。
  _drawDarkness() {
    const { ctx, player, camera, stage } = this;
    const px = player.x - camera.x + player.width / 2;
    const py = player.y - camera.y + player.height / 2;

    let radius = 55; // 素の視界
    const tm = stage.tileMap;
    const { tx: ptx, ty: pty } = tm.toTileCoord(player.centerX, player.centerY);
    const searchRange = 5;
    for (let ty = pty - searchRange; ty <= pty + searchRange; ty++) {
      for (let tx = ptx - searchRange; tx <= ptx + searchRange; tx++) {
        const def = tm.getTileDef(tx, ty);
        if (def && def.light) { radius = 105; break; }
      }
    }

    ctx.save();
    const grad = ctx.createRadialGradient(px, py, radius * 0.35, px, py, radius);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.88)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.restore();
  }
}

function expand(box, margin) {
  return { x: box.x - margin, y: box.y - margin, width: box.width + margin * 2, height: box.height + margin * 2 };
}
