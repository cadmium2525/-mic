// ============================================================
// Physics
// 単純な軸並行境界ボックス(AABB)とタイルマップの衝突解決。
// X軸・Y軸を分離して解決することで斜め衝突のすり抜けを防ぐ定番手法。
// ============================================================
export const GRAVITY = 720;       // px/s^2
export const MAX_FALL_SPEED = 480; // px/s

export function stepPhysics(entity, dt, tileMap) {
  // 重力
  entity.vy += GRAVITY * dt;
  if (entity.vy > MAX_FALL_SPEED) entity.vy = MAX_FALL_SPEED;

  entity.onGround = false;

  // ---- X方向移動＆衝突 ----
  entity.x += entity.vx * dt;
  resolveAxis(entity, tileMap, 'x');

  // ---- Y方向移動＆衝突 ----
  entity.y += entity.vy * dt;
  resolveAxis(entity, tileMap, 'y');
}

function resolveAxis(entity, tileMap, axis) {
  const ts = tileMap.tileSize;
  const left = entity.x;
  const right = entity.x + entity.width;
  const top = entity.y;
  const bottom = entity.y + entity.height;

  const txMin = Math.floor(left / ts);
  const txMax = Math.floor((right - 0.01) / ts);
  const tyMin = Math.floor(top / ts);
  const tyMax = Math.floor((bottom - 0.01) / ts);

  for (let ty = tyMin; ty <= tyMax; ty++) {
    for (let tx = txMin; tx <= txMax; tx++) {
      if (!tileMap.isSolidAt(tx, ty)) continue;
      const tileLeft = tx * ts, tileTop = ty * ts, tileRight = tileLeft + ts, tileBottom = tileTop + ts;

      if (axis === 'x') {
        if (entity.vx > 0) entity.x = tileLeft - entity.width;
        else if (entity.vx < 0) entity.x = tileRight;
        entity.vx = 0;
      } else {
        if (entity.vy > 0) { entity.y = tileTop - entity.height; entity.onGround = true; }
        else if (entity.vy < 0) { entity.y = tileBottom; }
        entity.vy = 0;
      }
    }
  }
}

// 単純な矩形同士のあたり判定（敵・アイテム・商人との接触判定に使用）
export function isOverlapping(a, b) {
  return a.x < b.x + b.width &&
         a.x + a.width > b.x &&
         a.y < b.y + b.height &&
         a.y + a.height > b.y;
}
