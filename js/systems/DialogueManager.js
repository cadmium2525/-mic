// ============================================================
// DialogueManager
// data/dialogues.json に定義された会話イベントを1行ずつ再生する。
//
// 定義例:
// "1-2_torch_tutorial": {
//   "speaker": "案内人",
//   "lines": ["ここは暗いね…", "松明を作れば周りが見えるようになるよ"]
// }
// ============================================================
export class DialogueManager {
  constructor(dialogues, ui) {
    this.dialogues = dialogues;
    this.ui = ui;
    this.active = null;
    this.lineIndex = 0;
    this.onComplete = null;
  }

  start(dialogueId, onComplete = null) {
    const data = this.dialogues[dialogueId];
    if (!data) return;
    this.active = data;
    this.lineIndex = 0;
    this.onComplete = onComplete;
    this._render();
    this.ui.showDialogue();
  }

  next() {
    if (!this.active) return;
    this.lineIndex++;
    if (this.lineIndex >= this.active.lines.length) {
      this.active = null;
      this.ui.hideDialogue();
      if (this.onComplete) this.onComplete();
      return;
    }
    this._render();
  }

  get isActive() { return !!this.active; }

  _render() {
    this.ui.setDialogueText(this.active.speaker, this.active.lines[this.lineIndex]);
  }
}
