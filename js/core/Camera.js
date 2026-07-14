// ============================================================
// Camera
// プレイヤーを追従しつつ、ステージ端では止まるスクロールカメラ。
// ============================================================
export class Camera {
  constructor(viewW, viewH) {
    this.x = 0;
    this.y = 0;
    this.viewW = viewW;
    this.viewH = viewH;
  }

  follow(target, stageWidthPx, stageHeightPx) {
    // プレイヤーが画面中央より少し左寄りに来るように追従（横スクロール定番の見せ方）
    const desiredX = target.x - this.viewW * 0.4;
    const desiredY = target.y - this.viewH * 0.55;

    this.x = clamp(desiredX, 0, Math.max(0, stageWidthPx - this.viewW));
    this.y = clamp(desiredY, 0, Math.max(0, stageHeightPx - this.viewH));
  }
}

function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }
