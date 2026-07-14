// ============================================================
// InputManager
// キーボード（PC）とタッチボタン（スマホ）の入力を一本化し、
// ゲーム側からは this.state を見るだけで済むようにする。
// ============================================================
export class InputManager {
  constructor() {
    this.state = {
      left: false,
      right: false,
      jump: false,      // ジャンプボタン押下中
      jumpPressed: false, // このフレームで押した瞬間か（可変ジャンプ用ではなく単発判定用）
      action: false,    // 採掘/設置/会話などコンテキストアクション押下中
      actionPressed: false,
    };

    this._jumpWasDown = false;
    this._actionWasDown = false;

    this._bindKeyboard();
    this._bindTouchButton('btn-left', 'left');
    this._bindTouchButton('btn-right', 'right');
    this._bindTouchButton('btn-jump', 'jump');
    this._bindTouchButton('btn-action', 'action');
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => this._setKey(e.code, true));
    window.addEventListener('keyup', (e) => this._setKey(e.code, false));
  }

  _setKey(code, down) {
    switch (code) {
      case 'ArrowLeft':
      case 'KeyA': this.state.left = down; break;
      case 'ArrowRight':
      case 'KeyD': this.state.right = down; break;
      case 'Space':
      case 'ArrowUp':
      case 'KeyW': this.state.jump = down; break;
      case 'KeyE':
      case 'KeyF': this.state.action = down; break;
    }
  }

  _bindTouchButton(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    const down = (ev) => { ev.preventDefault(); this.state[key] = true; el.classList.add('pressed'); };
    const up = (ev) => { ev.preventDefault(); this.state[key] = false; el.classList.remove('pressed'); };
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
    // PC上でもクリックでテストできるようにする
    el.addEventListener('mousedown', down);
    window.addEventListener('mouseup', up);
  }

  // 毎フレーム最後に呼び出し、「押した瞬間」フラグを更新する
  update() {
    this.state.jumpPressed = this.state.jump && !this._jumpWasDown;
    this.state.actionPressed = this.state.action && !this._actionWasDown;
    this._jumpWasDown = this.state.jump;
    this._actionWasDown = this.state.action;
  }
}
