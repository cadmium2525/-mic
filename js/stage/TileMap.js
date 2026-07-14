// ============================================================
// TileMap
// ステージJSONの "tiles"（文字列の配列）と "legend"（文字→タイル定義）を
// 実際のグリッドデータに変換し、衝突判定・採掘・設置を提供する。
//
// タイル定義（legend）の例:
//   "#": { "type": "ground", "solid": true }
//   "R": { "type": "stone_ore", "solid": true, "minable": true, "drop": "stone" }
// ============================================================
export class TileMap {
  constructor(stageData) {
    this.tileSize = stageData.tileSize || 16;
    this.legend = stageData.legend;
    this.rows = stageData.tiles;
    this.height = this.rows.length;
    this.width = this.rows[0].length;

    // 文字グリッドを2次元配列（タイルID文字列 or null）に変換して保持
    // 実行時に採掘・設置で書き換えるため、元のJSONとは切り離した配列にする
    this.grid = this.rows.map(row => row.split(''));
  }

  get pixelWidth() { return this.width * this.tileSize; }
  get pixelHeight() { return this.height * this.tileSize; }

  // 座標(tx,ty)のタイル定義を取得。範囲外は「地面扱い」で落下防止する
  getTileDef(tx, ty) {
    // 左右の外側は見えない壁として扱い、ステージ外へ歩いて出るのを防ぐ。
    // 下方向は意図的に「素通り」させ、谷底に落ちたらミス扱いにできるようにする（Game側で判定）。
    if (tx < 0 || tx >= this.width) return { type: 'void_wall', solid: true };
    if (ty >= this.height || ty < 0) return null;
    const ch = this.grid[ty][tx];
    if (ch === '.' || ch === undefined) return null;
    return this.legend[ch] || null;
  }

  isSolidAt(tx, ty) {
    const def = this.getTileDef(tx, ty);
    return !!(def && def.solid);
  }

  // ピクセル座標→タイル座標
  toTileCoord(px, py) {
    return { tx: Math.floor(px / this.tileSize), ty: Math.floor(py / this.tileSize) };
  }

  // 採掘：対象タイルがminable指定なら削って素材ドロップ情報を返す
  mineAt(tx, ty, hasPickaxe) {
    const def = this.getTileDef(tx, ty);
    if (!def || !def.minable) return null;
    if (def.needsPickaxe && !hasPickaxe) return { blocked: true };
    this.grid[ty][tx] = '.';
    return { drop: def.drop, amount: def.dropAmount || 1 };
  }

  // 強制的にタイルを取り除く（鍵の扉を開ける等、条件付き破壊に使用）
  removeAt(tx, ty) {
    if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) return false;
    this.grid[ty][tx] = '.';
    return true;
  }

  // 設置：空セルに新しいタイル文字を書き込む（足場設置用）
  placeAt(tx, ty, tileChar) {
    if (tx < 0 || tx >= this.width || ty < 0 || ty >= this.height) return false;
    if (this.grid[ty][tx] !== '.') return false;
    this.grid[ty][tx] = tileChar;
    return true;
  }
}
