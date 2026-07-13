// ============================================================
// levels.js - ステージ生成システム。
// 地形定義(def)からタイルグリッドを組み立てる。
// 新しいワールドを追加する場合はこのファイルに
// buildLevel(def) 形式の定義を追加するだけでよい。
// ============================================================
window.Game = window.Game || {};

(function () {
  const T = () => Game.TILE; // lazy (tiles.js が先に読まれている前提)

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildLevel(def) {
    const TILE = Game.TILE;
    const H = def.height || 15;
    const W = def.width;
    const grid = [];
    for (let y = 0; y < H; y++) grid.push(new Array(W).fill(TILE.EMPTY));

    const groundRow = def.groundRow != null ? def.groundRow : 10;
    const rng = mulberry32(def.seed || 1);

    const inPit = (x) => (def.pits || []).find(p => x >= p.x1 && x <= p.x2);

    // 天井（洞窟テーマ）
    if (def.ceiling) {
      for (let x = 0; x < W; x++) {
        for (let y = 0; y < def.ceilingRows; y++) {
          grid[y][x] = TILE.STONE;
        }
      }
    }

    // 地面と地下
    for (let x = 0; x < W; x++) {
      const pit = inPit(x);
      if (pit) {
        if (pit.lava) grid[H - 1][x] = TILE.LAVA;
        continue;
      }
      grid[groundRow][x] = def.theme === 'cave' ? TILE.STONE : TILE.GRASS;
      for (let y = groundRow + 1; y < H; y++) {
        grid[y][x] = (y === groundRow + 1 && def.theme !== 'cave') ? TILE.DIRT : TILE.STONE;
      }
    }

    // 鉱石ゾーンの散布
    (def.oreZones || []).forEach(z => {
      for (let x = z.x1; x <= z.x2; x++) {
        if (inPit(x)) continue;
        for (let y = z.y1; y <= z.y2; y++) {
          if (y <= (def.ceiling ? def.ceilingRows - 1 : -1)) continue;
          if (y >= H) continue;
          if (grid[y][x] === TILE.STONE && rng() < z.density) {
            grid[y][x] = z.type;
          }
        }
      }
    });

    // 木（丸太＋葉）
    (def.trees || []).forEach(tx => {
      if (inPit(tx)) return;
      const baseY = groundRow - 1;
      const trunkH = 3;
      for (let i = 0; i < trunkH; i++) grid[baseY - i][tx] = TILE.WOOD;
      const topY = baseY - trunkH;
      [[-1, 0], [0, 0], [1, 0], [-1, -1], [0, -1], [1, -1], [0, -2]].forEach(([dx, dy]) => {
        const gx = tx + dx, gy = topY + dy;
        if (gx >= 0 && gx < W && gy >= 0 && grid[gy][gx] === TILE.EMPTY) grid[gy][gx] = TILE.LEAVES;
      });
    });

    // 浮遊足場・レンガ・はてなブロック列
    (def.platforms || []).forEach(pl => {
      for (let i = 0; i < pl.len; i++) {
        const x = pl.x + i;
        if (x < 0 || x >= W) continue;
        grid[pl.y][x] = pl.type;
      }
    });

    (def.qblocks || []).forEach(q => { grid[q.y][q.x] = TILE.QBLOCK; });

    // 溶岩床（穴以外に明示配置する場合）
    (def.lavaTiles || []).forEach(([x, y]) => { grid[y][x] = TILE.LAVA; });

    // ゴール（旗）
    const goalX = def.goalX;
    for (let y = groundRow - 5; y < groundRow; y++) grid[y][goalX] = TILE.FLAG;

    // ボス出現位置に台座
    if (def.bossX) {
      for (let x = def.bossX - 1; x <= def.bossX + 3; x++) {
        if (x < W) grid[groundRow][x] = TILE.BRICK;
      }
    }

    return {
      id: def.id,
      name: def.name,
      theme: def.theme,
      dark: !!def.dark,
      width: W,
      height: H,
      groundRow,
      grid,
      enemies: (def.enemies || []).map(e => ({ ...e })),
      coins: (def.coins || []).map(c => ({ x: c[0], y: c[1] })),
      playerStart: def.playerStart || { x: 2, y: groundRow - 3 },
      goalX,
      bossX: def.bossX || null,
      bgColor: def.bgColor,
    };
  }

  const TILE = Game.TILE;

  // ---------------------------------------------------------
  // 1-1 グラスプレインズ（チュートリアル）
  // ---------------------------------------------------------
  const def1_1 = {
    id: '1-1', name: 'グラスプレインズ', theme: 'overworld', bgColor: '#5c94fc',
    width: 90, groundRow: 10, seed: 11,
    pits: [{ x1: 22, x2: 24 }, { x1: 50, x2: 52 }, { x1: 68, x2: 70 }],
    trees: [8, 15, 34, 41, 60, 78],
    oreZones: [
      { x1: 18, x2: 46, y1: 12, y2: 13, type: TILE.COAL_ORE, density: 0.35 },
      { x1: 55, x2: 85, y1: 12, y2: 13, type: TILE.COAL_ORE, density: 0.25 },
    ],
    platforms: [
      { x: 27, y: 7, len: 3, type: TILE.BRICK },
      { x: 44, y: 8, len: 4, type: TILE.PLATFORM },
      { x: 63, y: 7, len: 3, type: TILE.BRICK },
    ],
    qblocks: [{ x: 28, y: 6 }, { x: 45, y: 7 }, { x: 64, y: 6 }],
    enemies: [
      { x: 18, type: 'walker', min: 16, max: 21 },
      { x: 38, type: 'walker', min: 36, max: 48 },
      { x: 57, type: 'slime', min: 55, max: 66 },
      { x: 75, type: 'walker', min: 73, max: 85 },
    ],
    coins: [[28, 5], [29, 5], [45, 6], [64, 5], [10, 9], [11, 9], [12, 9]],
    playerStart: { x: 2, y: 7 },
    goalX: 87,
  };

  // ---------------------------------------------------------
  // 1-2 クオリーヒルズ（採石場・鉱石多め）
  // ---------------------------------------------------------
  const def1_2 = {
    id: '1-2', name: 'クオリーヒルズ', theme: 'overworld', bgColor: '#5c94fc',
    width: 100, groundRow: 10, seed: 22,
    pits: [{ x1: 20, x2: 23 }, { x1: 40, x2: 43, lava: true }, { x1: 60, x2: 62 }, { x1: 80, x2: 84 }],
    trees: [5, 30, 66],
    oreZones: [
      { x1: 10, x2: 95, y1: 11, y2: 13, type: TILE.COAL_ORE, density: 0.2 },
      { x1: 25, x2: 95, y1: 12, y2: 13, type: TILE.IRON_ORE, density: 0.22 },
    ],
    platforms: [
      { x: 15, y: 8, len: 3, type: TILE.PLATFORM },
      { x: 33, y: 6, len: 3, type: TILE.BRICK },
      { x: 45, y: 8, len: 5, type: TILE.PLATFORM },
      { x: 63, y: 7, len: 3, type: TILE.PLATFORM },
      { x: 72, y: 5, len: 4, type: TILE.BRICK },
      { x: 86, y: 8, len: 4, type: TILE.PLATFORM },
    ],
    qblocks: [{ x: 34, y: 5 }, { x: 47, y: 7 }, { x: 73, y: 4 }],
    enemies: [
      { x: 14, type: 'slime', min: 12, max: 19 },
      { x: 30, type: 'walker', min: 26, max: 39 },
      { x: 50, type: 'walker', min: 45, max: 59 },
      { x: 65, type: 'slime', min: 63, max: 79 },
      { x: 88, type: 'walker', min: 85, max: 98 },
    ],
    coins: [[15, 7], [16, 7], [17, 7], [45, 7], [46, 7], [63, 6], [86, 7]],
    playerStart: { x: 2, y: 7 },
    goalX: 97,
  };

  // ---------------------------------------------------------
  // 1-3 アンダーグラウンドマイン（地下・鉄鉱石とラダー）
  // ---------------------------------------------------------
  const def1_3 = {
    id: '1-3', name: 'アンダーグラウンドマイン', theme: 'cave', bgColor: '#101018',
    width: 95, groundRow: 10, seed: 33,
    ceiling: true, ceilingRows: 2,
    pits: [{ x1: 25, x2: 28, lava: true }, { x1: 55, x2: 58, lava: true }, { x1: 75, x2: 77 }],
    oreZones: [
      { x1: 4, x2: 90, y1: 3, y2: 13, type: TILE.COAL_ORE, density: 0.16 },
      { x1: 20, x2: 90, y1: 4, y2: 13, type: TILE.IRON_ORE, density: 0.16 },
    ],
    platforms: [
      { x: 10, y: 7, len: 4, type: TILE.BRICK },
      { x: 30, y: 6, len: 3, type: TILE.PLATFORM },
      { x: 40, y: 8, len: 3, type: TILE.BRICK },
      { x: 60, y: 6, len: 4, type: TILE.PLATFORM },
      { x: 70, y: 4, len: 3, type: TILE.BRICK },
      { x: 82, y: 7, len: 5, type: TILE.PLATFORM },
    ],
    qblocks: [{ x: 11, y: 6 }, { x: 41, y: 7 }, { x: 71, y: 3 }],
    enemies: [
      { x: 12, type: 'walker', min: 9, max: 20 },
      { x: 34, type: 'slime', min: 30, max: 38 },
      { x: 48, type: 'walker', min: 44, max: 54 },
      { x: 63, type: 'walker', min: 60, max: 68 },
      { x: 80, type: 'slime', min: 78, max: 90 },
    ],
    coins: [[10, 6], [11, 6], [12, 6], [60, 5], [61, 5], [82, 6]],
    playerStart: { x: 2, y: 8 },
    goalX: 92,
    dark: true,
  };

  // ---------------------------------------------------------
  // 1-4 ディープキャバーン（ダイヤモンド洞窟 + ボス）
  // ---------------------------------------------------------
  const def1_4 = {
    id: '1-4', name: 'ディープキャバーン', theme: 'cave', bgColor: '#0a0a12',
    width: 90, groundRow: 10, seed: 44,
    ceiling: true, ceilingRows: 2,
    pits: [
      { x1: 18, x2: 21, lava: true },
      { x1: 34, x2: 38, lava: true },
      { x1: 52, x2: 54, lava: true },
      { x1: 65, x2: 68, lava: true },
    ],
    oreZones: [
      { x1: 4, x2: 78, y1: 3, y2: 13, type: TILE.COAL_ORE, density: 0.12 },
      { x1: 10, x2: 78, y1: 5, y2: 13, type: TILE.IRON_ORE, density: 0.18 },
      { x1: 20, x2: 78, y1: 9, y2: 13, type: TILE.DIAMOND_ORE, density: 0.1 },
    ],
    platforms: [
      { x: 10, y: 7, len: 3, type: TILE.BRICK },
      { x: 24, y: 6, len: 3, type: TILE.PLATFORM },
      { x: 40, y: 8, len: 3, type: TILE.BRICK },
      { x: 45, y: 5, len: 3, type: TILE.PLATFORM },
      { x: 58, y: 7, len: 3, type: TILE.PLATFORM },
      { x: 70, y: 6, len: 4, type: TILE.BRICK },
    ],
    qblocks: [{ x: 25, y: 5 }, { x: 46, y: 4 }],
    enemies: [
      { x: 12, type: 'walker', min: 9, max: 17 },
      { x: 28, type: 'slime', min: 25, max: 32 },
      { x: 42, type: 'walker', min: 40, max: 50 },
      { x: 60, type: 'slime', min: 57, max: 63 },
      { x: 72, type: 'walker', min: 70, max: 79 },
    ],
    coins: [[24, 5], [45, 4], [58, 6], [70, 5]],
    playerStart: { x: 2, y: 8 },
    goalX: 86,
    dark: true,
    bossX: 82,
  };

  Game.LevelDefs = [def1_1, def1_2, def1_3, def1_4];
  Game.Levels = Game.LevelDefs.map(buildLevel);
  Game.buildLevel = buildLevel;
})();
