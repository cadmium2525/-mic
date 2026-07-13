// ============================================================
// crafting.js - 素材・レシピ・クラフトUIロジック
// ============================================================
window.Game = window.Game || {};

(function () {
  const MATERIALS = [
    { key: 'wood', label: '木材', icon: 'wood' },
    { key: 'stick', label: '木の枝', icon: 'stick' },
    { key: 'stone', label: '石', icon: 'stoneMat' },
    { key: 'coal', label: '石炭', icon: 'coal' },
    { key: 'iron', label: '鉄', icon: 'iron' },
    { key: 'diamond', label: 'ダイヤモンド', icon: 'diamond' },
  ];

  const TOOL_RANK = { none: 0, wood: 1, stone: 2, iron: 3 };

  const RECIPES = [
    { id: 'pickaxeWood', key: '1', name: '木のツルハシ', type: 'tool', tier: 'wood',
      cost: { wood: 2, stick: 1 }, icon: 'pickaxeWood',
      desc: '石・石炭が採掘できる' },
    { id: 'swordWood', key: '2', name: '木の剣', type: 'sword', tier: 'wood',
      cost: { wood: 1, stick: 2 }, icon: 'sword',
      desc: '敵を踏まずに倒せる' },
    { id: 'pickaxeStone', key: '3', name: '石のツルハシ', type: 'tool', tier: 'stone',
      cost: { stone: 3, stick: 1 }, icon: 'pickaxeStone',
      desc: '鉄鉱石が採掘できる', requireToolTier: 'wood' },
    { id: 'pickaxeIron', key: '4', name: '鉄のツルハシ', type: 'tool', tier: 'iron',
      cost: { iron: 3, stick: 1 }, icon: 'pickaxeIron',
      desc: 'ダイヤモンドが採掘できる', requireToolTier: 'stone' },
    { id: 'ladder', key: '5', name: 'ラダー ×3', type: 'placeable', item: 'ladder', give: 3,
      cost: { wood: 2 }, icon: 'ladderIcon',
      desc: '設置してよじ登れる' },
    { id: 'torch', key: '6', name: 'たいまつ ×3', type: 'placeable', item: 'torch', give: 3,
      cost: { coal: 1, stick: 1 }, icon: 'torchIcon',
      desc: '暗闇を照らす' },
    { id: 'bridge', key: '7', name: '足場ブロック ×3', type: 'placeable', item: 'bridge', give: 3,
      cost: { stone: 2 }, icon: 'bridgeIcon',
      desc: '穴や溶岩をふさげる' },
    { id: 'swordDiamond', key: '8', name: 'ダイヤの剣', type: 'sword', tier: 'diamond',
      cost: { diamond: 2, stick: 1 }, icon: 'sword',
      desc: 'ボスを一撃で倒せる！', requireToolTier: 'stone' },
  ];

  function canAfford(state, cost) {
    return Object.keys(cost).every(k => (state.materials[k] || 0) >= cost[k]);
  }

  function meetsRequirement(state, recipe) {
    if (recipe.type === 'tool' && TOOL_RANK[recipe.tier] <= TOOL_RANK[state.pickaxeTier]) return false; // already owned or lower
    if (recipe.type === 'sword' && recipe.tier === 'diamond' && state.swordTier === 'diamond') return false;
    if (recipe.type === 'sword' && recipe.tier === 'wood' && state.swordTier !== 'none') return false;
    if (recipe.requireToolTier && TOOL_RANK[state.pickaxeTier] < TOOL_RANK[recipe.requireToolTier]) return false;
    return true;
  }

  function canCraft(state, recipe) {
    return meetsRequirement(state, recipe) && canAfford(state, recipe.cost);
  }

  function craft(state, recipeId) {
    const recipe = RECIPES.find(r => r.id === recipeId);
    if (!recipe || !canCraft(state, recipe)) return false;
    Object.keys(recipe.cost).forEach(k => { state.materials[k] -= recipe.cost[k]; });
    if (recipe.type === 'tool') state.pickaxeTier = recipe.tier;
    if (recipe.type === 'sword') state.swordTier = recipe.tier;
    if (recipe.type === 'placeable') state.placeables[recipe.item] += recipe.give;
    return true;
  }

  function materialLabel(key) {
    const m = MATERIALS.find(m => m.key === key);
    return m ? m.label : key;
  }

  function renderMaterials(state) {
    const row = document.getElementById('materials-row');
    row.innerHTML = MATERIALS.map(m =>
      `<div class="mat-chip">${m.label}: <span>${state.materials[m.key] || 0}</span></div>`
    ).join('');
  }

  function renderRecipes(state, onCraft) {
    const list = document.getElementById('recipe-list');
    list.innerHTML = '';
    RECIPES.forEach(r => {
      const requirementOk = meetsRequirement(state, r);
      const afford = canAfford(state, r.cost);
      const ok = requirementOk && afford;
      const div = document.createElement('div');
      div.className = 'recipe' + (ok ? '' : ' disabled');
      const costStr = Object.keys(r.cost).map(k => `${materialLabel(k)}×${r.cost[k]}`).join(' ');
      let statusNote = '';
      if (!requirementOk) statusNote = '（習得済み or 前提未達）';
      div.innerHTML = `
        <div>
          <div class="r-name">${r.name}</div>
          <div class="r-cost">${costStr} ${statusNote}</div>
          <div class="r-cost">${r.desc}</div>
        </div>
        <div class="r-key">${r.key}</div>`;
      if (ok) div.addEventListener('click', () => onCraft(r.id));
      list.appendChild(div);
    });
  }

  window.Game.Crafting = {
    MATERIALS, RECIPES, canCraft, craft, renderMaterials, renderRecipes, materialLabel,
  };
})();
