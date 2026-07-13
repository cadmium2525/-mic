// ============================================================
// engine.js - メインループ、入力、描画、当たり判定の統合
// ============================================================
window.Game = window.Game || {};

(function () {
  const TILE_SIZE = 32;
  const VIEW_COLS = 25;
  const VIEW_ROWS = 15;

  class Engine {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = false;
      this.running = false;
      this.levelIndex = 0;
      this.level = null;
      this.player = null;
      this.enemies = [];
      this.coins = [];
      this.boss = null;
      this.camX = 0;
      this.time = 0;
      this.input = { left: false, right: false, up: false, down: false, jumpHeld: false, jumpPressed: false, mine: false, place: false };
      this.lastTs = 0;
      this.callbacks = {}; // onClear, onGameOver, onCoinChange, onHudChange
      this.persistentInventory = null; // ステージをまたいで引き継ぐ

      this._bindInput();
    }

    on(name, fn) { this.callbacks[name] = fn; }
    emit(name, ...args) { if (this.callbacks[name]) this.callbacks[name](...args); }

    _bindInput() {
      const keyMap = {
        ArrowLeft: 'left', KeyA: 'left',
        ArrowRight: 'right', KeyD: 'right',
        ArrowUp: 'up', KeyW: 'up', Space: 'jump',
        ArrowDown: 'down', KeyS: 'down',
        KeyX: 'mine', KeyZ: 'place',
      };
      window.addEventListener('keydown', (e) => {
        const k = keyMap[e.code];
        if (!k) return;
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
        if (k === 'jump') { if (!this.input.jumpHeld) this.input.jumpPressed = true; this.input.jumpHeld = true; }
        else this.input[k] = true;
        if (e.code === 'Digit1') this.emit('hotbar', 0);
        if (e.code === 'Digit2') this.emit('hotbar', 1);
        if (e.code === 'Digit3') this.emit('hotbar', 2);
      });
      window.addEventListener('keyup', (e) => {
        const k = keyMap[e.code];
        if (!k) return;
        if (k === 'jump') this.input.jumpHeld = false;
        else this.input[k] = false;
      });
    }

    loadLevel(idx, carryInventory) {
      this.levelIndex = idx;
      const def = Game.Levels[idx];
      // グリッドはミュータブルなので毎回複製（採掘で破壊されるため）
      const grid = def.grid.map(row => row.slice());
      this.level = { ...def, grid };
      this.player = new Game.Player(this.level.playerStart.x * TILE_SIZE, this.level.playerStart.y * TILE_SIZE);
      if (carryInventory) this.player.inventory = carryInventory;
      this.enemies = this.level.enemies.map(e => new Game.Enemy(e));
      this.coins = this.level.coins.map(c => ({ x: c.x, y: c.y, taken: false }));
      this.boss = this.level.bossX ? new Game.Enemy({ type: 'boss', x: this.level.bossX, y: this.level.groundRow - 2, min: this.level.bossX - 6, max: this.level.width - 2 }) : null;
      this.camX = 0;
      this.stageClearedFlag = false;
      this.emit('hud');
    }

    solidAt(px, py) {
      const tx = Math.floor(px / TILE_SIZE), ty = Math.floor(py / TILE_SIZE);
      if (ty < 0 || ty >= this.level.height || tx < 0 || tx >= this.level.width) return true;
      const info = Game.TileInfo[this.level.grid[ty][tx]];
      return !!(info && info.solid);
    }

    start() {
      this.running = true;
      this.lastTs = performance.now();
      requestAnimationFrame(this._loop.bind(this));
    }

    _loop(ts) {
      const dt = Math.min((ts - this.lastTs) / 1000, 0.033);
      this.lastTs = ts;
      if (this.running) {
        this.update(dt);
        this.render();
      }
      requestAnimationFrame(this._loop.bind(this));
    }

    update(dt) {
      if (!this.player || this.player.dead) return;
      this.time += dt;
      const { hitCeilingTile } = this.player.update(dt, this.level, this.input);
      this.input.jumpPressed = false;

      if (hitCeilingTile) this._handleCeilingHit(hitCeilingTile);

      // 敵の更新
      const allEnemies = this.boss ? [...this.enemies, this.boss] : this.enemies;
      allEnemies.forEach(en => en.update(dt, this.level, (x, y) => this.solidAt(x, y)));

      // プレイヤー vs 敵
      this._resolveEnemyCollisions(allEnemies);

      // コイン取得
      this.coins.forEach(c => {
        if (c.taken) return;
        const cr = { x: c.x * TILE_SIZE + 4, y: c.y * TILE_SIZE + 4, w: 20, h: 20 };
        if (Game.overlapRect(this.player.rect(), cr)) {
          c.taken = true; this.player.coins += 1; this.emit('hud');
        }
      });

      // 溶岩
      const pc = this.player.rect();
      const centerTile = this.player.tileAt(this.level, pc.x + pc.w / 2, pc.y + pc.h / 2);
      if (Game.TileInfo[centerTile] && Game.TileInfo[centerTile].hazard) {
        this.player.takeDamage();
        this.player.vy = -300;
      }

      // 採掘 / 設置
      if (this.input.mine && this.player.mineTimer <= 0) this._tryMine();
      if (this.input.place && this.player.placeTimer <= 0) this._tryPlace();

      // ゴール判定
      const goalTile = this.player.tileAt(this.level, pc.x + pc.w / 2, pc.y + pc.h / 2);
      if (Game.TileInfo[goalTile] && Game.TileInfo[goalTile].isGoal && !this.stageClearedFlag) {
        if (!this.boss || !this.boss.alive) {
          this.stageClearedFlag = true;
          this.running = false;
          this.emit('clear', this.levelIndex);
        }
      }

      // カメラ追従
      const targetCam = pc.x - VIEW_COLS * TILE_SIZE / 2;
      const maxCam = this.level.width * TILE_SIZE - VIEW_COLS * TILE_SIZE;
      this.camX = Math.max(0, Math.min(targetCam, Math.max(0, maxCam)));

      if (this.player.dead) this.emit('gameover');
    }

    _handleCeilingHit(tileRef) {
      const { tx, ty } = tileRef;
      if (ty < 0 || ty >= this.level.height) return;
      const t = this.level.grid[ty][tx];
      if (t === Game.TILE.QBLOCK) {
        this.level.grid[ty][tx] = Game.TILE.QBLOCK_USED;
        // ランダムでコインかアイテム素材
        if (Math.random() < 0.5) { this.player.coins += 1; }
        else {
          const pool = ['wood', 'stick', 'stone', 'coal'];
          this.player.addMaterial(pool[Math.floor(Math.random() * pool.length)], 1);
        }
        this.emit('hud');
        this.emit('popup', { x: tx * TILE_SIZE, y: ty * TILE_SIZE });
      }
    }

    _resolveEnemyCollisions(allEnemies) {
      const pr = this.player.rect();
      allEnemies.forEach(en => {
        if (!en.alive) return;
        const er = en.rect();
        if (!Game.overlapRect(pr, er)) return;
        const stomping = this.player.vy > 40 && (pr.y + pr.h) - er.y < 16;
        if (stomping) {
          en.hit(en.type === 'boss' && this.player.inventory.swordTier === 'diamond');
          this.player.vy = -300;
          if (!en.alive) { this.player.coins += en.type === 'boss' ? 10 : 2; this.emit('hud'); }
        } else if (this.player.hurtTimer <= 0) {
          this.player.takeDamage();
          this.player.vx = this.player.facing * -150;
          this.player.vy = -200;
          this.emit('hud');
        }
      });
    }

    _facingBox() {
      const p = this.player;
      const w = 20, h = 20;
      const cx = p.x + p.w / 2 + p.facing * (p.w / 2 + 10) - w / 2;
      const cy = p.y + p.h / 2 - h / 2;
      return { x: cx, y: cy, w, h };
    }

    _tryMine() {
      this.player.mineTimer = 0.22;
      const { tx, ty } = this.player.targetTile(this.level, this.input);
      // 剣で攻撃（正面に敵がいれば優先）
      if (this.player.inventory.swordTier !== 'none') {
        const box = this._facingBox();
        const allEnemies = this.boss ? [...this.enemies, this.boss] : this.enemies;
        const target = allEnemies.find(en => en.alive && Game.overlapRect(box, en.rect()));
        if (target) {
          target.hit(target.type === 'boss' && this.player.inventory.swordTier === 'diamond');
          if (!target.alive) { this.player.coins += target.type === 'boss' ? 10 : 2; this.emit('hud'); }
          return;
        }
      }
      if (ty < 0 || ty >= this.level.height || tx < 0 || tx >= this.level.width) return;
      const t = this.level.grid[ty][tx];
      const info = Game.TileInfo[t];
      if (!info || !info.breakable) return;
      if (!Game.canBreakTile(t, this.player.toolTier)) {
        this.emit('popup', { x: tx * TILE_SIZE, y: ty * TILE_SIZE, fail: true });
        return;
      }
      if (info.dropChance != null && Math.random() > info.dropChance) {
        this.level.grid[ty][tx] = info.becomesOnBreak != null ? info.becomesOnBreak : Game.TILE.EMPTY;
        return;
      }
      this.level.grid[ty][tx] = info.becomesOnBreak != null ? info.becomesOnBreak : Game.TILE.EMPTY;
      if (info.placeable) {
        // 設置物を回収
        const map = { [Game.TILE.LADDER]: 'ladder', [Game.TILE.TORCH]: 'torch', [Game.TILE.BRIDGE]: 'bridge' };
        const key = map[t];
        if (key) this.player.inventory.placeables[key] += 1;
      } else if (info.drop) {
        this.player.addMaterial(info.drop, 1);
      }
      this.emit('hud');
    }

    _tryPlace() {
      this.player.placeTimer = 0.22;
      const items = ['ladder', 'torch', 'bridge'];
      const key = items[this.player.hotbarIndex];
      if (!key || this.player.inventory.placeables[key] <= 0) return;
      const { tx, ty } = this.player.targetTile(this.level, this.input);
      if (ty < 0 || ty >= this.level.height || tx < 0 || tx >= this.level.width) return;
      if (this.level.grid[ty][tx] !== Game.TILE.EMPTY) return;
      const tileMap = { ladder: Game.TILE.LADDER, torch: Game.TILE.TORCH, bridge: Game.TILE.BRIDGE };
      this.level.grid[ty][tx] = tileMap[key];
      this.player.inventory.placeables[key] -= 1;
      this.emit('hud');
    }

    // ---------------- 描画 ----------------
    render() {
      const ctx = this.ctx;
      const lvl = this.level;
      ctx.fillStyle = lvl.bgColor || '#5c94fc';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      const startCol = Math.floor(this.camX / TILE_SIZE);
      const endCol = Math.min(lvl.width, startCol + VIEW_COLS + 2);
      const offsetX = -(this.camX % TILE_SIZE);

      // 背景の雲/装飾（オーバーワールドのみ簡易パララックス）
      if (lvl.theme === 'overworld') {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        for (let i = 0; i < 6; i++) {
          const cx = ((i * 260 - this.camX * 0.3) % 1400 + 1400) % 1400 - 100;
          ctx.fillRect(cx, 40 + (i % 3) * 30, 70, 22);
        }
      }

      for (let ty = 0; ty < lvl.height; ty++) {
        for (let tx = startCol; tx < endCol; tx++) {
          const t = lvl.grid[ty][tx];
          if (t === Game.TILE.EMPTY) continue;
          const px = (tx - startCol) * TILE_SIZE + offsetX;
          const py = ty * TILE_SIZE;
          Game.drawTile(ctx, t, px, py, TILE_SIZE);
        }
      }

      // コイン
      this.coins.forEach(c => {
        if (c.taken) return;
        const px = c.x * TILE_SIZE - this.camX;
        if (px < -32 || px > this.canvas.width + 32) return;
        Game.Sprites.drawGrid(ctx, px, c.y * TILE_SIZE, TILE_SIZE, Game.Sprites.ICONS.coin, false);
      });

      // 敵
      const allEnemies = this.boss ? [...this.enemies, this.boss] : this.enemies;
      allEnemies.forEach(en => {
        const px = en.x - this.camX;
        if (px < -60 || px > this.canvas.width + 60) return;
        if (!en.alive && en.deathTimer > 0.4) return;
        ctx.save();
        if (!en.alive) ctx.globalAlpha = Math.max(0, 1 - en.deathTimer * 2.5);
        const grid = en.type === 'boss' ? Game.Sprites.boss : en.type === 'slime' ? Game.Sprites.slime : Game.Sprites.walker;
        Game.Sprites.drawGrid(ctx, px, en.y, en.h, grid, en.dir > 0);
        ctx.restore();
      });

      // プレイヤー
      this._renderPlayer(ctx);

      // 暗闇エフェクト（洞窟ステージ）
      if (lvl.dark) this._renderDarkness(ctx, startCol, offsetX);

      // 死亡時の暗転
      if (this.player.dead) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      }
    }

    _renderPlayer(ctx) {
      const p = this.player;
      const px = p.x - this.camX;
      if (p.hurtTimer > 0 && Math.floor(this.time * 12) % 2 === 0) return; // 点滅
      const frames = Game.Sprites.player;
      const grid = !p.onGround && !p.climbing ? frames.jump : (Math.abs(p.vx) > 5 ? (p.animFrame ? frames.walk : frames.stand) : frames.stand);
      Game.Sprites.drawGrid(ctx, px, p.y, 36, grid, p.facing < 0);
    }

    _renderDarkness(ctx, startCol, offsetX) {
      const lvl = this.level;
      const px = this.player.x - this.camX + this.player.w / 2;
      const py = this.player.y + this.player.h / 2;

      const off = document.createElement('canvas');
      off.width = this.canvas.width; off.height = this.canvas.height;
      const octx = off.getContext('2d');
      octx.fillStyle = 'rgba(3,3,10,0.93)';
      octx.fillRect(0, 0, off.width, off.height);
      octx.globalCompositeOperation = 'destination-out';

      const lights = [{ x: px, y: py, r: 130 }];
      for (let ty = 0; ty < lvl.height; ty++) {
        for (let tx = startCol; tx < startCol + VIEW_COLS + 2 && tx < lvl.width; tx++) {
          if (lvl.grid[ty][tx] === Game.TILE.TORCH) {
            lights.push({ x: (tx - startCol) * TILE_SIZE + offsetX + 16, y: ty * TILE_SIZE + 16, r: 150 });
          }
          if (lvl.grid[ty][tx] === Game.TILE.LAVA) {
            lights.push({ x: (tx - startCol) * TILE_SIZE + offsetX + 16, y: ty * TILE_SIZE + 16, r: 70 });
          }
        }
      }
      lights.forEach(l => {
        const grad = octx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        octx.fillStyle = grad;
        octx.beginPath();
        octx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
        octx.fill();
      });
      ctx.drawImage(off, 0, 0);
    }
  }

  window.Game.Engine = Engine;
  window.Game.VIEW = { TILE_SIZE, VIEW_COLS, VIEW_ROWS };
})();
