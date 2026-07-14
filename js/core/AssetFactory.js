// ============================================================
// AssetFactory
// 外部画像ファイルを使わず、ピクセルデータ（文字グリッド）から
// オフスクリーンCanvasに「自作ドット絵」を焼き込むためのユーティリティ。
// 一度描画したスプライトはキャッシュして使い回す。
//
// パターン定義: 1文字 = 1ピクセル。 "." は透明。
// 例:
//   [".rr.",
//    "rrrr",
//    "rr.r",
//    ".rr."]
//   colors: { r: "#c0392b" }
// ============================================================
const cache = new Map();

export function buildSprite(name, pattern, colors, scale = 1) {
  const key = name;
  if (cache.has(key)) return cache.get(key);

  const h = pattern.length;
  const w = pattern[0].length;
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = pattern[y][x];
      if (ch === '.' || ch === ' ') continue;
      ctx.fillStyle = colors[ch] || '#ff00ff';
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }

  cache.set(key, canvas);
  return canvas;
}

// ============================================================
// 各スプライトのピクセルパターン定義
// 保守性のため、キャラクター/タイル/アイテムをここに集約する。
// ============================================================

export const SPRITES = {
  player_idle: {
    pattern: [
      '..hhhh..',
      '.hhhhhh.',
      '.hsssss.',
      '.hsbsbs.',
      '.hsssss.',
      '..cccc..',
      '.ccjjcc.',
      '.cc..cc.',
    ],
    colors: { h: '#5a3b22', s: '#ffd7ab', b: '#2b2b2b', c: '#2255aa', j: '#e04b3c' },
  },
  player_walk: {
    pattern: [
      '..hhhh..',
      '.hhhhhh.',
      '.hsssss.',
      '.hsbsbs.',
      '.hsssss.',
      '..cccc..',
      '.cc.ccc.',
      'cc...ccc',
    ],
    colors: { h: '#5a3b22', s: '#ffd7ab', b: '#2b2b2b', c: '#2255aa', j: '#e04b3c' },
  },
  enemy_slime: {
    pattern: [
      '........',
      '.gggggg.',
      'gggggggg',
      'gg.gg.gg',
      'gggggggg',
      'gggggggg',
      '.gg..gg.',
    ],
    colors: { g: '#3fae4e' },
  },
  enemy_bat: {
    pattern: [
      'w......w',
      'ww....ww',
      '.w.gg.w.',
      '..gggg..',
      '..gbgb..',
      '..gggg..',
    ],
    colors: { w: '#4b3663', g: '#7a5ca0', b: '#1a1a1a' },
  },
  merchant: {
    pattern: [
      '..hhh...',
      '.hhhhh..',
      '.hsssh..',
      '.hsbsb..',
      '.hsssh..',
      '..ppp...',
      '.ppppp..',
      '.pp.pp..',
    ],
    colors: { h: '#3b2a1a', s: '#e8b98a', b: '#1a1a1a', p: '#7d3fae' },
  },
  tile_ground: {
    pattern: [
      'gggggggg',
      'ddgddgdd',
      'dddddddd',
      'dddddddd',
      'dddddddd',
      'dddddddd',
      'dddddddd',
      'dddddddd',
    ],
    colors: { g: '#5fae3f', d: '#7a5230' },
  },
  tile_brick: {
    pattern: [
      'rrrrrrrr',
      'r.r.r.r.',
      'rrrrrrrr',
      '.r.r.r.r',
      'rrrrrrrr',
      'r.r.r.r.',
      'rrrrrrrr',
      '.r.r.r.r',
    ],
    colors: { r: '#a85b3f' },
  },
  tile_stone: {
    pattern: [
      'ssssssss',
      'ssdssdss',
      'ssssssss',
      'sdsssdss',
      'ssssssss',
      'ssdssdss',
      'ssssssss',
      'sdsssdss',
    ],
    colors: { s: '#8a8a8f', d: '#666669' },
  },
  tile_ore_coal: {
    pattern: [
      'ssssssss',
      'ssbssbss',
      'ssssssss',
      'sbsssbss',
      'ssssssss',
      'ssbssbss',
      'ssssssss',
      'sbsssbss',
    ],
    colors: { s: '#8a8a8f', b: '#1a1a1a' },
  },
  tile_ore_iron: {
    pattern: [
      'ssssssss',
      'ssossoss',
      'ssssssss',
      'sosssoss',
      'ssssssss',
      'ssossoss',
      'ssssssss',
      'sosssoss',
    ],
    colors: { s: '#8a8a8f', o: '#c98a4b' },
  },
  tile_footstep: {
    pattern: [
      'wwwwwwww',
      'w......w',
      '........',
      '........',
      '........',
      '........',
      '........',
      'wwwwwwww',
    ],
    colors: { w: '#c8a26a' },
  },
  tile_torch: {
    pattern: [
      '...ff...',
      '..ffff..',
      '..fyyf..',
      '...yy...',
      '...ww...',
      '...ww...',
      '..wwww..',
      '........',
    ],
    colors: { f: '#e0602a', y: '#ffd23f', w: '#5a3b22' },
  },
  item_wood: {
    pattern: [
      '........',
      '.wwwwww.',
      'wwwwwwww',
      'wwwwwwww',
      '.wwwwww.',
      '........',
    ],
    colors: { w: '#8a5a2e' },
  },
  item_stone: {
    pattern: [
      '........',
      '.ssssss.',
      'ssssssss',
      'ssssssss',
      '.ssssss.',
      '........',
    ],
    colors: { s: '#8a8a8f' },
  },
  item_coal: {
    pattern: [
      '........',
      '.kkkkkk.',
      'kkkkkkkk',
      'kkkkkkkk',
      '.kkkkkk.',
      '........',
    ],
    colors: { k: '#232323' },
  },
  item_iron: {
    pattern: [
      '........',
      '.oooooo.',
      'oooooooo',
      'oooooooo',
      '.oooooo.',
      '........',
    ],
    colors: { o: '#c98a4b' },
  },
  item_mushroom: {
    pattern: [
      '..rrrr..',
      '.rrrrrr.',
      'rrwrrwrr',
      '..wwww..',
      '..wwww..',
    ],
    colors: { r: '#c0392b', w: '#f4e3c1' },
  },
  item_gunpowder: {
    pattern: [
      '........',
      '.gggggg.',
      'gg.gg.gg',
      'gggggggg',
      '.gggggg.',
    ],
    colors: { g: '#4a4a52' },
  },
  item_key_shard: {
    pattern: [
      '..yy....',
      '.yyyy...',
      '..yy.yy.',
      '.....yy.',
      '..yy.yy.',
    ],
    colors: { y: '#f2c14e' },
  },
  item_key: {
    pattern: [
      '.yy.....',
      'y..y....',
      '.yy.yyy.',
      '....y.y.',
      '....yyy.',
    ],
    colors: { y: '#f2c14e' },
  },
  coin: {
    pattern: [
      '.yyyy.',
      'yyyyyy',
      'yyoyyy',
      'yyyyyy',
      '.yyyy.',
    ],
    colors: { y: '#ffd23f', o: '#c98a1f' },
  },
  goal_flag: {
    pattern: [
      'w.......',
      'wrrrr...',
      'wrrrr...',
      'wrrrr...',
      'w.......',
      'w.......',
      'w.......',
      'wwwwwwww',
    ],
    colors: { w: '#c8c8c8', r: '#e0463c' },
  },
  boss_golem: {
    pattern: [
      '..oooooo..',
      '.oooooooo.',
      'oorroorroo',
      'oooooooooo',
      '.oo.oo.oo.',
      '.oo.oo.oo.',
      '.oo.oo.oo.',
    ],
    colors: { o: '#6b6b6b', r: '#e03b3b' },
  },
};

// 事前に全スプライトをビルドしてキャンバスキャッシュに載せておく
export function preloadSprites(scale = 2) {
  for (const [name, def] of Object.entries(SPRITES)) {
    buildSprite(name, def.pattern, def.colors, scale);
  }
}

export function getSprite(name) {
  return cache.get(name);
}
