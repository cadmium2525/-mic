// ============================================================
// UIManager
// スマホ操作を前提としたDOM UI（クラフト／インベントリ／商人／会話／
// オーバーレイ画面）の表示更新を一括管理する。
// キャンバス外のHTML要素を扱うことで、複雑なUIも実装しやすくする。
// ============================================================
export class UIManager {
  constructor(game) {
    this.game = game;
    this.panelCraft = document.getElementById('panel-craft');
    this.panelInventory = document.getElementById('panel-inventory');
    this.panelMerchant = document.getElementById('panel-merchant');
    this.dialogueBox = document.getElementById('dialogue-box');
    this.overlay = document.getElementById('overlay-screen');
    this.actionBtn = document.getElementById('btn-action');
    this.coinCountEl = document.getElementById('coin-count');
    this.lifeEl = document.getElementById('hud-life');

    document.getElementById('btn-craft').addEventListener('click', () => this.toggleCraft());
    document.getElementById('btn-inventory').addEventListener('click', () => this.toggleInventory());
    document.querySelectorAll('.panel-close').forEach(btn => {
      btn.addEventListener('click', () => this.closePanel(btn.dataset.close));
    });
    document.getElementById('dialogue-next').addEventListener('click', () => this.game.dialogueManager.next());
    document.getElementById('overlay-btn').addEventListener('click', () => this.game.onOverlayButton());
  }

  // ---- 開閉系 ----
  toggleCraft() {
    const opening = this.panelCraft.classList.contains('hidden');
    this.closeAllPanels();
    if (opening) { this.renderCraftList(); this.panelCraft.classList.remove('hidden'); this.game.paused = true; }
    else this.game.paused = false;
  }

  toggleInventory() {
    const opening = this.panelInventory.classList.contains('hidden');
    this.closeAllPanels();
    if (opening) { this.renderInventoryList(); this.panelInventory.classList.remove('hidden'); this.game.paused = true; }
    else this.game.paused = false;
  }

  openMerchant(merchant) {
    this.closeAllPanels();
    this.renderMerchantList(merchant);
    this.panelMerchant.classList.remove('hidden');
    this.game.paused = true;
  }

  closePanel(id) {
    document.getElementById(id).classList.add('hidden');
    this.game.paused = false;
  }

  closeAllPanels() {
    this.panelCraft.classList.add('hidden');
    this.panelInventory.classList.add('hidden');
    this.panelMerchant.classList.add('hidden');
  }

  // ---- HUD ----
  updateHud(player, coins) {
    this.coinCountEl.textContent = coins;
    this.lifeEl.textContent = '❤️'.repeat(Math.max(0, player.life));
  }

  // 状況に応じて右下アクションボタンのラベルを変える（採掘／設置／会話）
  setActionLabel(label) {
    this.actionBtn.textContent = label;
  }

  // ---- クラフトパネル ----
  renderCraftList() {
    const { recipes, inventory } = this.game;
    const list = document.getElementById('craft-list');
    list.innerHTML = '';
    for (const r of recipes.recipes) {
      const row = document.createElement('div');
      row.className = 'item-row';
      const inputsText = r.inputs.map(i => `${this.itemName(i.item)}x${i.amount}`).join(' + ');
      const canCraft = recipes.canCraft(r.id, inventory);
      row.innerHTML = `
        <div class="name">${r.name}<br><small>${inputsText}</small></div>
        <button ${canCraft ? '' : 'disabled'}>作る</button>
      `;
      row.querySelector('button').addEventListener('click', () => {
        const result = recipes.craft(r.id, inventory);
        if (result.ok) this.renderCraftList();
      });
      list.appendChild(row);
    }
  }

  // ---- インベントリパネル ----
  renderInventoryList() {
    const { inventory } = this.game;
    const list = document.getElementById('inventory-list');
    list.innerHTML = '';
    const entries = Object.entries(inventory.materials).filter(([, v]) => v > 0);
    if (entries.length === 0) {
      list.innerHTML = '<div class="item-row"><div class="name">素材はまだ持っていない</div></div>';
    }
    for (const [id, amount] of entries) {
      const row = document.createElement('div');
      row.className = 'item-row';
      row.innerHTML = `<div class="name">${this.itemName(id)}</div><div>${amount}</div>`;
      list.appendChild(row);
    }
    const toolNames = Object.keys(inventory.tools).filter(t => inventory.tools[t]);
    if (toolNames.length) {
      const row = document.createElement('div');
      row.className = 'item-row';
      row.innerHTML = `<div class="name">道具</div><div>${toolNames.map(t => this.itemName(t)).join(', ')}</div>`;
      list.appendChild(row);
    }
  }

  // ---- 商人パネル ----
  renderMerchantList(merchant) {
    const { inventory } = this.game;
    const list = document.getElementById('merchant-list');
    list.innerHTML = '';
    for (const offer of merchant.stock) {
      const row = document.createElement('div');
      row.className = 'item-row';
      row.innerHTML = `
        <div class="name">${this.itemName(offer.itemId)} x${offer.amount}</div>
        <button>💰${offer.price}</button>
      `;
      row.querySelector('button').addEventListener('click', () => {
        if (inventory.consume('coin', offer.price)) {
          inventory.add(offer.itemId, offer.amount);
          this.renderMerchantList(merchant);
          this.updateHud(this.game.player, inventory.coins);
        }
      });
      list.appendChild(row);
    }
  }

  // アイテムIDから日本語名を解決する（data/items.json の name フィールドを参照）
  itemName(itemId) {
    const def = this.game.items[itemId];
    return def ? def.name : itemId;
  }

  // ---- 会話 ----
  showDialogue() { this.dialogueBox.classList.remove('hidden'); this.game.paused = true; }
  hideDialogue() { this.dialogueBox.classList.add('hidden'); this.game.paused = false; }
  setDialogueText(speaker, text) {
    document.getElementById('dialogue-name').textContent = speaker;
    document.getElementById('dialogue-text').textContent = text;
  }

  // ---- オーバーレイ（タイトル・クリア・ゲームオーバー） ----
  showOverlay(title, sub, buttonLabel) {
    document.getElementById('overlay-title').textContent = title;
    document.getElementById('overlay-sub').textContent = sub;
    document.getElementById('overlay-btn').textContent = buttonLabel;
    this.overlay.classList.remove('hidden');
  }
  hideOverlay() { this.overlay.classList.add('hidden'); }
}
