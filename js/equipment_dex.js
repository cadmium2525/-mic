// =====================================================
// equipment_dex.js
// 「装備アイテム図鑑」：ガッツファクトリー／PvPレンタルで登場する全装備アイテムの
// 性能を一覧できる参照画面。EQUIPMENT_DB をそのままデータソースとして使う。
// バトルには関与しない、閲覧専用の画面。
// =====================================================

const EQUIPMENT_DEX_STATE = {
    filter: 'all' // 'all' | 'stat' | 'special'
};

const EQUIPMENT_DEX_FILTERS = [
    { key: 'all', label: 'すべて' },
    { key: 'stat', label: 'ステータス強化' },
    { key: 'special', label: '特殊効果' }
];

function openEquipmentDexScreen() {
    EQUIPMENT_DEX_STATE.filter = 'all';
    renderEquipmentDexTabs();
    renderEquipmentDexList();
    changeScreen('screen-equipment-dex');
}

function returnToTitleFromEquipmentDex() {
    changeScreen('screen-title');
}

// --- レア度（★の数）に応じた色クラス ---
function getEquipmentDexRarityColor(rarity) {
    const starCount = (rarity.match(/★/g) || []).length;
    if (starCount >= 3) return 'text-amber-400';
    if (starCount === 2) return 'text-gray-200';
    return 'text-orange-400';
}

// --- 装備1件（ベースデータ）の効果説明文を生成（個体差は範囲表記にする） ---
function getEquipmentDexEffectText(base) {
    if (base.type === 'stat') {
        const [min, max] = base.range;
        return `${getStatLabel(base.statKey)} +${min}〜${max} アップ`;
    }
    return base.desc || '';
}

// --- カテゴリ切替タブの描画 ---
function renderEquipmentDexTabs() {
    const container = document.getElementById('equipment-dex-tabs');
    if (!container) return;
    container.innerHTML = '';

    EQUIPMENT_DEX_FILTERS.forEach(f => {
        const btn = document.createElement('button');
        const isActive = EQUIPMENT_DEX_STATE.filter === f.key;
        btn.className = `flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
            isActive
                ? 'bg-amber-600 text-slate-900'
                : 'bg-[#1a120b] text-amber-300 border border-amber-900/50'
        }`;
        btn.textContent = f.label;
        btn.onclick = () => {
            EQUIPMENT_DEX_STATE.filter = f.key;
            renderEquipmentDexTabs();
            renderEquipmentDexList();
        };
        container.appendChild(btn);
    });
}

// --- 装備一覧の描画 ---
function renderEquipmentDexList() {
    const container = document.getElementById('equipment-dex-list-view');
    if (!container) return;
    container.innerHTML = '';

    const filter = EQUIPMENT_DEX_STATE.filter;
    const entries = Object.values(EQUIPMENT_DB)
        .filter(base => filter === 'all' || base.type === filter)
        // レア度が高い順・同レア度内では名前順に並べる
        .sort((a, b) => {
            const starDiff = (b.rarity.match(/★/g) || []).length - (a.rarity.match(/★/g) || []).length;
            if (starDiff !== 0) return starDiff;
            return a.name.localeCompare(b.name, 'ja');
        });

    if (entries.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 text-xs py-8">該当する装備アイテムはありません。</div>';
        return;
    }

    entries.forEach(base => {
        const rarityColor = getEquipmentDexRarityColor(base.rarity);
        const effectText = getEquipmentDexEffectText(base);

        const card = document.createElement('div');
        card.className = 'bg-[#2a1b15] border border-amber-900/50 rounded-xl p-2.5';
        card.innerHTML = `
            <div class="flex items-center gap-2">
                <div class="w-9 h-9 flex-shrink-0 flex items-center justify-center text-xl bg-[#1a120b] rounded-lg border border-amber-900/50">${base.icon || '⚙️'}</div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center flex-wrap gap-1">
                        <span class="text-xs font-bold text-amber-200">${base.name}</span>
                        <span class="text-[10px] ${rarityColor}">${base.rarity}</span>
                    </div>
                    <div class="flex items-center flex-wrap gap-1 mt-0.5">
                        <span class="text-[9px] px-1.5 py-0.5 rounded bg-[#1a120b] text-gray-400 border border-gray-700">${base.type === 'stat' ? 'ステータス強化' : '特殊効果'}</span>
                    </div>
                </div>
            </div>
            <div class="text-[9px] text-gray-300 mt-1.5 leading-relaxed">${effectText}</div>
        `;
        container.appendChild(card);
    });
}
