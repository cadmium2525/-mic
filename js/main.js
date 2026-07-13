// ============================================================
// main.js - 画面状態(タイトル/プレイ/ポーズ/クラフト/クリア/ゲームオーバー)
// の管理とUIイベントの配線
// ============================================================
(function () {
  const $ = (id) => document.getElementById(id);

  const canvas = $('game-canvas');
  const engine = new Game.Engine(canvas);

  const overlays = {
    title: $('overlay-title'),
    howto: $('overlay-howto'),
    craft: $('overlay-craft'),
    pause: $('overlay-pause'),
    clear: $('overlay-clear'),
    gameover: $('overlay-gameover'),
  };
  function hideAllOverlays() { Object.values(overlays).forEach(o => o.classList.add('hidden')); }
  function show(name) { overlays[name].classList.remove('hidden'); }
  function hide(name) { overlays[name].classList.add('hidden'); }

  let uiState = 'title'; // title | playing | craft | pause | clear | gameover

  const TOOL_LABEL = { none: '手', wood: '木のツルハシ', stone: '石のツルハシ', iron: '鉄のツルハシ' };
  const SWORD_LABEL = { none: 'なし', wood: '木の剣', diamond: 'ダイヤの剣' };
  const EQUIP_LABEL = { hand: '✋素手', pickaxe: '⛏ツルハシ', sword: '⚔剣' };

  function updateHud() {
    const p = engine.player;
    if (!p) return;
    $('hud-world').textContent = engine.level ? engine.level.id : '-';
    $('hud-coin').textContent = p.coins;
    $('hud-life').textContent = p.lives;
    $('hud-tool').textContent = TOOL_LABEL[p.inventory.pickaxeTier];
    $('hud-sword').textContent = SWORD_LABEL[p.inventory.swordTier];
    $('hud-equip').textContent = EQUIP_LABEL[p.equipped];
    $('count-ladder').textContent = p.inventory.placeables.ladder;
    $('count-torch').textContent = p.inventory.placeables.torch;
    $('count-bridge').textContent = p.inventory.placeables.bridge;
    updateHotbarUI();
    if (uiState === 'craft') {
      Game.Crafting.renderMaterials(p.inventory);
      Game.Crafting.renderRecipes(p.inventory, onCraft);
    }
  }

  function updateHotbarUI() {
    const p = engine.player;
    if (!p) return;
    // 装備スロット(素手/ツルハシ/剣): 所持していないものは薄く無効化表示
    document.querySelectorAll('.equip-slot').forEach((el) => {
      const kind = el.dataset.equip;
      const owned = p.canEquip(kind);
      el.classList.toggle('active', p.equipped === kind);
      el.classList.toggle('locked', !owned);
    });
    // 設置スロット(ラダー/たいまつ/足場ブロック)
    document.querySelectorAll('.place-slot').forEach((el, i) => {
      el.classList.toggle('active', p.hotbarIndex === i);
    });
  }

  function onCraft(id) {
    const p = engine.player;
    if (!p) return;
    const wasPickaxe = p.inventory.pickaxeTier;
    const wasSword = p.inventory.swordTier;
    const ok = Game.Crafting.craft(p.inventory, id);
    if (ok) {
      // クラフトした道具は自動的に手に持つ
      if (p.inventory.pickaxeTier !== wasPickaxe) p.setEquip('pickaxe');
      else if (p.inventory.swordTier !== wasSword) p.setEquip('sword');
    }
    updateHud();
  }

  function setEquip(kind) {
    const p = engine.player;
    if (!p) return;
    p.setEquip(kind);
    updateHud();
  }
  function cycleEquip() {
    const p = engine.player;
    if (!p) return;
    p.cycleEquip();
    updateHud();
  }

  // ---- エンジンからのイベント ----
  engine.on('hud', updateHud);
  engine.on('hotbar', (idx) => {
    if (uiState !== 'playing') return;
    engine.player.hotbarIndex = idx;
    updateHotbarUI();
  });
  engine.on('clear', (idx) => {
    uiState = 'clear';
    const lvl = Game.Levels[idx];
    const isLast = idx >= Game.Levels.length - 1;
    $('clear-title').textContent = isLast ? 'WORLD 1 CLEAR!' : 'STAGE CLEAR!';
    $('clear-text').textContent = isLast
      ? `おめでとう！ワールド1(1-1〜1-4)をクリアしました。コイン: ${engine.player.coins} 枚。ワールド2以降は近日追加予定です。`
      : `${lvl.name}(${lvl.id}) をクリア！ 次のステージへ進みます。`;
    $('btn-next').textContent = isLast ? 'タイトルへ' : '次のステージへ';
    hideAllOverlays();
    show('clear');
  });
  engine.on('gameover', () => {
    uiState = 'gameover';
    hideAllOverlays();
    show('gameover');
  });

  // ---- タイトル画面 ----
  $('btn-start').addEventListener('click', () => {
    hideAllOverlays();
    uiState = 'playing';
    engine.loadLevel(0);
    engine.start();
  });
  $('btn-howto').addEventListener('click', () => { hide('title'); show('howto'); });
  $('btn-back').addEventListener('click', () => { hide('howto'); show('title'); });

  // ---- ポーズ ----
  $('btn-resume').addEventListener('click', () => resumeFromPause());
  $('btn-retry').addEventListener('click', () => {
    hideAllOverlays();
    uiState = 'playing';
    engine.loadLevel(engine.levelIndex, engine.player.inventory);
    engine.running = true;
  });
  function resumeFromPause() {
    hide('pause');
    uiState = 'playing';
    engine.running = true;
  }

  // ---- クリア ----
  $('btn-next').addEventListener('click', () => {
    const isLast = engine.levelIndex >= Game.Levels.length - 1;
    hideAllOverlays();
    if (isLast) {
      uiState = 'title';
      show('title');
      return;
    }
    uiState = 'playing';
    engine.loadLevel(engine.levelIndex + 1, engine.player.inventory);
    engine.start();
  });

  // ---- ゲームオーバー ----
  $('btn-gameover-retry').addEventListener('click', () => {
    hideAllOverlays();
    uiState = 'playing';
    engine.loadLevel(0);
    engine.start();
  });

  // ---- ホットバー クリック選択 ----
  document.querySelectorAll('.equip-slot').forEach((el) => {
    el.addEventListener('click', () => {
      if (uiState !== 'playing') return;
      setEquip(el.dataset.equip);
    });
  });
  document.querySelectorAll('.place-slot').forEach((el, i) => {
    el.addEventListener('click', () => {
      if (uiState !== 'playing' || !engine.player) return;
      engine.player.hotbarIndex = i;
      updateHotbarUI();
    });
  });

  // ---- ポーズ / クラフト切り替え（キーボードとタッチ共通ロジック） ----
  function toggleCraft() {
    if (uiState === 'playing') {
      uiState = 'craft';
      engine.running = false;
      updateHud();
      show('craft');
    } else if (uiState === 'craft') {
      hide('craft');
      uiState = 'playing';
      engine.running = true;
    }
  }
  function togglePause() {
    if (uiState === 'playing') {
      uiState = 'pause';
      engine.running = false;
      show('pause');
    } else if (uiState === 'pause') {
      resumeFromPause();
    } else if (uiState === 'craft') {
      hide('craft');
      uiState = 'playing';
      engine.running = true;
    }
  }
  $('btn-quick-craft').addEventListener('click', toggleCraft);
  $('btn-quick-pause').addEventListener('click', togglePause);

  // ---- タッチ操作パッド ----
  function bindHold(el, onDown, onUp) {
    if (!el) return;
    const start = (e) => { e.preventDefault(); onDown(); el.classList.add('pressed'); };
    const end = (e) => { if (e) e.preventDefault(); onUp(); el.classList.remove('pressed'); };
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointerleave', end);
    el.addEventListener('pointercancel', end);
  }
  bindHold($('tc-left'), () => { engine.input.left = true; }, () => { engine.input.left = false; });
  bindHold($('tc-right'), () => { engine.input.right = true; }, () => { engine.input.right = false; });
  bindHold($('tc-up'), () => { engine.input.up = true; }, () => { engine.input.up = false; });
  bindHold($('tc-down'), () => { engine.input.down = true; }, () => { engine.input.down = false; });
  bindHold($('tc-mine'), () => { engine.input.mine = true; }, () => { engine.input.mine = false; });
  bindHold($('tc-place'), () => { engine.input.place = true; }, () => { engine.input.place = false; });
  bindHold($('tc-jump'),
    () => { if (!engine.input.jumpHeld) engine.input.jumpPressed = true; engine.input.jumpHeld = true; },
    () => { engine.input.jumpHeld = false; }
  );

  // ---- 画面回転の案内バナー（一度閉じたら再表示しない） ----
  const ROTATE_KEY = 'mariocraft_rotate_dismissed';
  const rotateHint = $('rotate-hint');
  try {
    if (!localStorage.getItem(ROTATE_KEY)) rotateHint.classList.add('show');
  } catch (e) { rotateHint.classList.add('show'); }
  $('btn-dismiss-rotate').addEventListener('click', () => {
    rotateHint.classList.remove('show');
    try { localStorage.setItem(ROTATE_KEY, '1'); } catch (e) { /* noop */ }
  });

  // ---- クラフトメニュー & ポーズ & 装備切替のキー操作 ----
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyC') {
      toggleCraft();
    } else if (e.code === 'Escape' || e.code === 'KeyP') {
      togglePause();
    } else if (e.code === 'KeyQ' || e.code === 'KeyV') {
      if (uiState === 'playing') cycleEquip();
    } else if (uiState === 'craft' && /^Digit[1-9]$/.test(e.code)) {
      const idx = parseInt(e.code.replace('Digit', ''), 10) - 1;
      const recipe = Game.Crafting.RECIPES[idx];
      if (recipe) onCraft(recipe.id);
    }
  });

  // ---- PWA: Service Worker登録（オフライン対応・ホーム画面追加を強化） ----
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* オフライン非対応でも通常プレイは可能 */ });
    });
  }

  // 初期HUD描画のためダミー状態を用意
  updateHud();
})();
