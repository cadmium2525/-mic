// ============================================================
// SaveManager
// localStorageを使ったセーブ／ロード。
// 保存対象：所持コイン、インベントリ、クリア済みステージ、現在のステージID
// ============================================================
const SAVE_KEY = 'craft_jump_save_v1';

export class SaveManager {
  static save(data) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('セーブに失敗しました', e);
      return false;
    }
  }

  static load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('セーブデータの読み込みに失敗しました', e);
      return null;
    }
  }

  static clear() {
    localStorage.removeItem(SAVE_KEY);
  }
}
