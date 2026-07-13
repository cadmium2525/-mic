// ============================================================
// sprites.js - 8x8ドット絵グリッドをCanvasに描画するユーティリティ
// 画像ファイルを使わず、コード内のグリッドデータから
// レトロ風ピクセルアートを生成する。
// ============================================================
window.Game = window.Game || {};

(function () {
  const PAL = {
    '.': null,
    'k': '#000000',
    '1': '#4caf50', // grass top
    '2': '#2e7d32', // grass dark edge
    '3': '#8b5a2b', // dirt
    '4': '#6e4420', // dirt dark
    '5': '#9a9a9a', // stone
    '6': '#5f5f5f', // stone dark
    '7': '#2b2b2b', // coal spot
    '8': '#e0c48a', // iron spot
    '9': '#5be2f2', // diamond spot
    'a': '#7a4c26', // wood bark
    'b': '#9a6a3c', // wood light
    'c': '#256029', // leaf dark
    'd': '#57b85c', // leaf light
    'e': '#c1453a', // brick red
    'f': '#812f24', // brick dark
    'g': '#ffd23d', // gold
    'h': '#ff8a3d', // lava
    'i': '#d94e00', // lava dark
    'j': '#e4423d', // mario red
    'l': '#2b5fd9', // mario blue
    'm': '#f2c18d', // skin
    'n': '#ffffff', // white
    'o': '#63c463', // slime
    'p': '#3d8b3d', // slime dark
    'q': '#b98a52', // dirt light / wood plank
    'r': '#c9c9c9', // stone light / cloud
    't': '#ffe27a', // torch flame
    'v': '#3a3a3a', // dark grey
    'w': '#a97a46', // ladder wood
    'x': '#7fc7ff', // ice/sky accent
    'y': '#264a1c', // dark green stem
    'z': '#1a1a1a', // near-black
  };

  function drawGrid(ctx, dx, dy, size, rows, flip) {
    const n = rows.length;
    const cell = size / n;
    for (let ry = 0; ry < n; ry++) {
      const row = rows[ry];
      for (let rx = 0; rx < n; rx++) {
        const ch = row[flip ? n - 1 - rx : rx];
        const col = PAL[ch];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(
          Math.round(dx + rx * cell),
          Math.round(dy + ry * cell),
          Math.ceil(cell) + 0.5,
          Math.ceil(cell) + 0.5
        );
      }
    }
  }

  // ---- 8x8 タイル用グリッド ----
  const G = {
    grass: [
      '11111111',
      '21112212',
      '11111111',
      '33433433',
      '43334334',
      '33433433',
      '43334433',
      '33433433',
    ],
    dirt: [
      '33433433',
      '43334334',
      '33433433',
      '43334433',
      '33433433',
      '43334334',
      '33433433',
      '43334433',
    ],
    stone: [
      '55655565',
      '65555656',
      '55565555',
      '56555655',
      '55655565',
      '65555656',
      '55565555',
      '56555655',
    ],
    coalOre: [
      '55655565',
      '65577656',
      '55577555',
      '56555655',
      '55655765',
      '65775656',
      '55577555',
      '56555655',
    ],
    ironOre: [
      '55655565',
      '65588656',
      '55588555',
      '56555655',
      '55655865',
      '65885656',
      '55588555',
      '56555655',
    ],
    diamondOre: [
      '55655565',
      '65599656',
      '55599555',
      '56555655',
      '55655965',
      '65995656',
      '55599555',
      '56555655',
    ],
    woodLog: [
      'aaaaaaaa',
      'ababbaba',
      'aaaaaaaa',
      'ababbaba',
      'aaaaaaaa',
      'ababbaba',
      'aaaaaaaa',
      'ababbaba',
    ],
    leaves: [
      '.cdcdc..',
      'cdcdcdc.',
      'dcdcdcdc',
      'cdcdcdcd',
      '.dcdcdc.',
      'cdcdcdc.',
      '.dcdcd..',
      '........',
    ],
    brick: [
      'eeeefeee',
      'eeeefeee',
      'ffffffff',
      'feeeefee',
      'feeeefee',
      'ffffffff',
      'eeeefeee',
      'eeeefeee',
    ],
    qblock: [
      'gggggggg',
      'g111111g',
      'g1g11g1g',
      'g11gg1gg', // this row purposely mangled slightly for a "?" look
      'g1g11g1g',
      'g111111g',
      'g1g11g1g',
      'gggggggg',
    ],
    qblockUsed: [
      'qqqqqqqq',
      'q444444q',
      'q444444q',
      'q444444q',
      'q444444q',
      'q444444q',
      'q444444q',
      'qqqqqqqq',
    ],
    platform: [
      'rrrrrrrr',
      'r666666r',
      'rrrrrrrr',
      '........',
      '........',
      '........',
      '........',
      '........',
    ],
    lava: [
      'hhihhihh',
      'ihhihhih',
      'hhihhhhi',
      'ihhhihhh',
      'hhihhihh',
      'ihhihhih',
      'hhihhhhi',
      'ihhhihhh',
    ],
    ladder: [
      'w....w..'.padEnd(8,'.'),
      'wwwwwwww',
      'w......w',
      'wwwwwwww',
      'w......w',
      'wwwwwwww',
      'w......w',
      'wwwwwwww',
    ],
    torch: [
      '...t....',
      '..ttt...',
      '...t....',
      '..zaz...',
      '..zaz...',
      '..zaz...',
      '.zzazz..',
      '........',
    ],
    bridge: [
      'qqqqqqqq',
      'q4q4q4q4',
      'qqqqqqqq',
      '4q4q4q4q',
      'qqqqqqqq',
      '........',
      '........',
      '........',
    ],
    flagpole: [
      '...v....',
      '..gvg...',
      '.ggvgg..',
      '..gvg...',
      '...v....',
      '...v....',
      '...v....',
      '...v....',
    ],
    cloud: [
      '..rrrr..',
      '.rrrrrr.',
      'rrrrrrrr',
      'rrrrrrrr',
      '........',
      '........',
      '........',
      '........',
    ],
  };

  // ---- キャラクター（16x16 相当だが8x8を2セット重ねる簡易版）----
  // プレイヤー: 右向き / 左向きは flip で対応
  const PLAYER_STAND = [
    '..jjjj..',
    '.jjjjjj.',
    '.mmmmm..',
    '.mnmnm..',
    '.mmmmm..',
    'jllljl..',
    'jlljlj..',
    '.kk.kk..',
  ];
  const PLAYER_WALK = [
    '..jjjj..',
    '.jjjjjj.',
    '.mmmmm..',
    '.mnmnm..',
    '.mmmmm..',
    'jlllj...',
    '.jlljlj.',
    'kk...kk.',
  ];
  const PLAYER_JUMP = [
    '..jjjj..',
    '.jjjjjj.',
    '.mmmmm..',
    '.mnmnm..',
    'jmmmmmj.',
    'jjlljlj.',
    '.jl.jl..',
    'kk...kk.',
  ];

  const WALKER = [
    '........',
    '.pppppp.',
    'pp7pp7pp',
    'pppppppp',
    'pppppppp',
    '.pppppp.',
    '.p.pp.p.',
    '.k.pp.k.',
  ];
  const SLIME = [
    '........',
    '..oooo..',
    '.oooooo.',
    'oopoopoo',
    'oooooooo',
    'oooooooo',
    '.oooooo.',
    '........',
  ];
  const BOSS = [
    'rr.rr.rr',
    'rrrrrrrr',
    'r6r66r6r',
    '66666666',
    '6r6666r6',
    '66666666',
    '6.6666.6',
    '6.6..6.6',
  ];

  const ICONS = {
    coin: [
      '..gggg..',
      '.gggggg.',
      'ggg88ggg',
      'gg8gg8gg',
      'gg8gg8gg',
      'ggg88ggg',
      '.gggggg.',
      '..gggg..',
    ],
    wood: [
      '........',
      '.bbbbbb.',
      'baaaaaab',
      'baaaaaab',
      'baaaaaab',
      'baaaaaab',
      '.bbbbbb.',
      '........',
    ],
    stick: [
      '.......a',
      '......ab',
      '.....ab.',
      '....ab..',
      '...ab...',
      '..ab....',
      '.ab.....',
      'a.......',
    ],
    stoneMat: [
      '........',
      '.556655.',
      '56555565',
      '65555556',
      '56555565',
      '.556655.',
      '........',
      '........',
    ],
    coal: [
      '........',
      '.777777.',
      '76666667',
      '76z66z67',
      '76666667',
      '.777777.',
      '........',
      '........',
    ],
    iron: [
      '........',
      '.888888.',
      '86999698',
      '86666668',
      '86999698',
      '.888888.',
      '........',
      '........',
    ],
    diamond: [
      '...99...',
      '..9999..',
      '.999999.',
      '99999999',
      '.999999.',
      '..9999..',
      '...99...',
      '........',
    ],
    pickaxeWood: [
      'bb......',
      'bbaaaaaa',
      '.bb.....',
      '..a.....',
      '..a.....',
      '..a.....',
      '.a......',
      'a.......',
    ],
    pickaxeStone: [
      '55......',
      '5566666.',
      '.55.....',
      '..a.....',
      '..a.....',
      '..a.....',
      '.a......',
      'a.......',
    ],
    pickaxeIron: [
      '88......',
      '8899999.',
      '.88.....',
      '..a.....',
      '..a.....',
      '..a.....',
      '.a......',
      'a.......',
    ],
    sword: [
      '...n....',
      '...n....',
      '...n....',
      '...n....',
      '..gng...',
      '...a....',
      '...a....',
      '...a....',
    ],
    swordDiamond: [
      '...9....',
      '...9....',
      '...9....',
      '...9....',
      '..g9g...',
      '...a....',
      '...a....',
      '...a....',
    ],
    dirtMat: [
      '........',
      '.334433.',
      '43334334',
      '33443334',
      '43334433',
      '.334433.',
      '........',
      '........',
    ],
    ladderIcon: G.ladder,
    torchIcon: G.torch,
    bridgeIcon: G.bridge,
  };

  window.Game.Sprites = {
    drawGrid, PAL, G, ICONS,
    player: { stand: PLAYER_STAND, walk: PLAYER_WALK, jump: PLAYER_JUMP },
    walker: WALKER,
    slime: SLIME,
    boss: BOSS,
  };
})();
