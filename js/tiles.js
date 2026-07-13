// ============================================================
// tiles.js - タイル種別、当たり判定属性、採掘要求ツールの定義
// ============================================================
window.Game = window.Game || {};

(function () {
  const TILE = {
    EMPTY: 0,
    GRASS: 1,
    DIRT: 2,
    STONE: 3,
    COAL_ORE: 4,
    IRON_ORE: 5,
    DIAMOND_ORE: 6,
    WOOD: 7,
    LEAVES: 8,
    BRICK: 9,
    QBLOCK: 10,
    QBLOCK_USED: 11,
    PLATFORM: 12,
    LAVA: 13,
    FLAG: 14,
    LADDER: 15,
    TORCH: 16,
    BRIDGE: 17,
    CLOUD: 18,
  };

  // tool tiers: null(素手) < 'wood' < 'stone' < 'iron'
  const TOOL_RANK = { none: 0, wood: 1, stone: 2, iron: 3 };

  // 各タイルの属性テーブル
  const INFO = {};
  INFO[TILE.EMPTY]       = { solid: false };
  INFO[TILE.GRASS]       = { solid: true, breakable: true, requiredTool: 'none', drop: null, becomesOnBreak: TILE.EMPTY, sprite: 'grass' };
  INFO[TILE.DIRT]        = { solid: true, breakable: true, requiredTool: 'none', drop: null, becomesOnBreak: TILE.EMPTY, sprite: 'dirt' };
  INFO[TILE.STONE]       = { solid: true, breakable: true, requiredTool: 'wood', drop: 'stone', becomesOnBreak: TILE.EMPTY, sprite: 'stone' };
  INFO[TILE.COAL_ORE]    = { solid: true, breakable: true, requiredTool: 'wood', drop: 'coal', becomesOnBreak: TILE.EMPTY, sprite: 'coalOre' };
  INFO[TILE.IRON_ORE]    = { solid: true, breakable: true, requiredTool: 'stone', drop: 'iron', becomesOnBreak: TILE.EMPTY, sprite: 'ironOre' };
  INFO[TILE.DIAMOND_ORE] = { solid: true, breakable: true, requiredTool: 'iron', drop: 'diamond', becomesOnBreak: TILE.EMPTY, sprite: 'diamondOre' };
  INFO[TILE.WOOD]        = { solid: true, breakable: true, requiredTool: 'none', drop: 'wood', becomesOnBreak: TILE.EMPTY, sprite: 'woodLog' };
  INFO[TILE.LEAVES]      = { solid: false, breakable: true, requiredTool: 'none', drop: 'stick', becomesOnBreak: TILE.EMPTY, sprite: 'leaves', dropChance: 0.6 };
  INFO[TILE.BRICK]       = { solid: true, breakable: false, sprite: 'brick' };
  INFO[TILE.QBLOCK]      = { solid: true, breakable: false, isQuestion: true, sprite: 'qblock' };
  INFO[TILE.QBLOCK_USED] = { solid: true, breakable: false, sprite: 'qblockUsed' };
  INFO[TILE.PLATFORM]    = { solid: true, breakable: false, sprite: 'platform', thin: true };
  INFO[TILE.LAVA]        = { solid: false, hazard: true, sprite: 'lava' };
  INFO[TILE.FLAG]        = { solid: false, isGoal: true, sprite: 'flagpole' };
  INFO[TILE.LADDER]      = { solid: false, climbable: true, breakable: true, requiredTool: 'none', placeable: true, sprite: 'ladder' };
  INFO[TILE.TORCH]       = { solid: false, breakable: true, requiredTool: 'none', placeable: true, sprite: 'torch', light: true };
  INFO[TILE.BRIDGE]      = { solid: true, breakable: true, requiredTool: 'wood', placeable: true, sprite: 'bridge' };
  INFO[TILE.CLOUD]       = { solid: true, breakable: false, sprite: 'cloud', thin: true };

  function canBreak(tileType, toolTier) {
    const info = INFO[tileType];
    if (!info || !info.breakable) return false;
    const need = TOOL_RANK[info.requiredTool || 'none'];
    return TOOL_RANK[toolTier || 'none'] >= need;
  }

  function drawTile(ctx, tileType, px, py, size) {
    const info = INFO[tileType];
    if (!info || tileType === TILE.EMPTY) return;
    const grid = Game.Sprites.G[info.sprite];
    if (grid) Game.Sprites.drawGrid(ctx, px, py, size, grid, false);
  }

  window.Game.TILE = TILE;
  window.Game.TileInfo = INFO;
  window.Game.TOOL_RANK = TOOL_RANK;
  window.Game.canBreakTile = canBreak;
  window.Game.drawTile = drawTile;
})();
