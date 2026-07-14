// ============================================================
// main.js
// アプリのブートストラップ。Canvasを取得してGameを起動するだけの薄い層。
// ============================================================
import { Game } from './core/Game.js';

window.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('game-canvas');
  const game = new Game(canvas);
  window.__GAME__ = game; // デバッグ・検証用（開発者コンソールから状態を確認できる）
  window.__GAME__ = game; // デバッグ用に参照を公開（開発者ツールから状態確認できるように）
  try {
    await game.init();
  } catch (err) {
    console.error(err);
    document.body.innerHTML = `<div style="color:#fff;padding:20px;font-family:sans-serif;">
      読み込みに失敗しました。GitHub Pages等のサーバー経由で開いているか確認してください。<br>
      (file:// では fetch が使えないためローカルサーバーが必要です)<br>
      <pre style="white-space:pre-wrap;">${err.message}</pre>
    </div>`;
  }
});
