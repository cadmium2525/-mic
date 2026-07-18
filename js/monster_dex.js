// =====================================================
// monster_dex.js
// 「モンスター図鑑」：種族ごとの技の性能を一覧できる参照画面。
// ガッツファクトリー／PvPレンタルで使われる KIN_NEJIKI_SKILL_POOL（種族→技候補）を
// そのままデータソースとして使い、SKILLS_DB の各技の性能（ランク・命中率・GUTS消費など）を
// まとめて表示する。バトルには関与しない、閲覧専用の画面。
// =====================================================

function openMonsterDexScreen() {
    renderMonsterDexList();
    changeScreen('screen-monster-dex');
}

// 詳細ビューの「種族一覧に戻る」ボタンから呼ばれる（画面遷移はせず、同じ画面内でビューを切り替える）
function showMonsterDexList() {
    renderMonsterDexList();
}

function returnToTitleFromDex() {
    changeScreen('screen-title');
}

// 詳細ビューの「種族一覧に戻る」ボタンから呼ばれる
function showMonsterDexList() {
    renderMonsterDexList();
}

// --- 種族一覧（タップで詳細へ） ---
function renderMonsterDexList() {
    document.getElementById('monster-dex-list-view').classList.remove('hidden');
    document.getElementById('monster-dex-detail-view').classList.add('hidden');
    document.getElementById('monster-dex-detail-view').classList.remove('flex');

    const container = document.getElementById('monster-dex-list-view');
    container.innerHTML = '';

    KIN_NEJIKI_SPECIES_POOL.forEach(speciesId => {
        const tmpl = MONSTER_TEMPLATES[speciesId];
        if (!tmpl) return;

        const card = document.createElement('div');
        card.className = 'bg-[#2a1b15] border border-amber-900/50 rounded-xl p-2.5 flex items-center space-x-3 cursor-pointer active:scale-[0.98] transition-all';
        card.onclick = () => showMonsterDexDetail(speciesId);

        const monClassInfo = MON_CLASS_TYPES[tmpl.monClass] || null;
        const visualId = `monster-dex-list-visual-${speciesId}`;
        card.innerHTML = `
            <div id="${visualId}" class="w-12 h-12 flex-shrink-0 flex items-center justify-center text-2xl"></div>
            <div class="flex-1 min-w-0">
                <div class="text-xs font-bold text-amber-200 flex items-center gap-1">
                    <span>${tmpl.name}</span>
                    ${monClassInfo ? `<span class="text-[9px] bg-[#1a120b] text-amber-300 px-1.5 py-0.5 rounded">${monClassInfo.emoji} ${monClassInfo.name}</span>` : ''}
                </div>
                <div class="text-[9px] text-gray-400 leading-relaxed line-clamp-2">${tmpl.desc}</div>
            </div>
            <i class="fa-solid fa-chevron-right text-amber-700 text-xs flex-shrink-0"></i>
        `;
        container.appendChild(card);

        const visualEl = card.querySelector(`#${CSS.escape(visualId)}`);
        renderMonsterVisual(visualEl, tmpl.name, tmpl.emoji, false, true);
    });
}

// --- 技のランクに応じた色クラス（既存のバトル画面の配色に合わせる） ---
function getDexSkillRankColor(rank) {
    if (rank === 'S+') return 'text-rose-500 font-extrabold';
    if (rank === 'S') return 'text-red-600 font-extrabold';
    if (rank === 'A') return 'text-orange-500 font-bold';
    if (rank === 'B+') return 'text-amber-500 font-bold';
    if (rank === 'B') return 'text-yellow-600 font-bold';
    if (rank === 'C') return 'text-green-600 font-bold';
    if (rank === 'D') return 'text-cyan-600';
    if (rank === 'E') return 'text-blue-500';
    if (rank === 'F') return 'text-purple-500';
    return 'text-gray-400';
}

function getDexSkillTypeLabel(sk) {
    if (sk.type === 'pow') return '💥 ちから技';
    if (sk.type === 'int') return '🔮 かしこさ技';
    if (sk.type === 'heal') return '💖 回復技';
    if (sk.type && sk.type.startsWith('buff')) return '⭐ 補助技';
    return '⭐ 特殊技';
}

// --- 種族詳細（ベースステータス＋技候補一覧） ---
function showMonsterDexDetail(speciesId) {
    const tmpl = MONSTER_TEMPLATES[speciesId];
    if (!tmpl) return;

    document.getElementById('monster-dex-list-view').classList.add('hidden');
    document.getElementById('monster-dex-detail-view').classList.remove('hidden');
    document.getElementById('monster-dex-detail-view').classList.add('flex');

    document.getElementById('monster-dex-detail-name').textContent = tmpl.name;
    const monClassInfo = MON_CLASS_TYPES[tmpl.monClass] || null;
    if (monClassInfo) {
        const beatsInfo = MON_CLASS_TYPES[monClassInfo.beats];
        document.getElementById('monster-dex-detail-desc').textContent =
            `【モン類：${monClassInfo.emoji}${monClassInfo.name}（${beatsInfo.name}に有利：与ダメージ×1.5・被ダメージ×0.75）】\n${tmpl.desc}`;
    } else {
        document.getElementById('monster-dex-detail-desc').textContent = tmpl.desc;
    }
    renderMonsterVisual(document.getElementById('monster-dex-detail-visual'), tmpl.name, tmpl.emoji, false, true);

    const s = tmpl.stats;
    document.getElementById('monster-dex-detail-stats').innerHTML = `
        <div class="bg-[#1a120b] rounded px-1.5 py-1">HP: <span class="font-bold text-emerald-400">${s.maxLife}</span></div>
        <div class="bg-[#1a120b] rounded px-1.5 py-1">ちから: <span class="font-bold text-red-400">${s.pow}</span></div>
        <div class="bg-[#1a120b] rounded px-1.5 py-1">かしこさ: <span class="font-bold text-purple-400">${s.int}</span></div>
        <div class="bg-[#1a120b] rounded px-1.5 py-1">命中: <span class="font-bold text-yellow-400">${s.hit}</span></div>
        <div class="bg-[#1a120b] rounded px-1.5 py-1">回避: <span class="font-bold text-sky-400">${s.spd}</span></div>
        <div class="bg-[#1a120b] rounded px-1.5 py-1">丈夫さ: <span class="font-bold text-orange-400">${s.def}</span></div>
    `;

    const skillPool = KIN_NEJIKI_SKILL_POOL[speciesId] || [];
    const skillsContainer = document.getElementById('monster-dex-detail-skills');
    skillsContainer.innerHTML = '';

    if (skillPool.length === 0) {
        skillsContainer.innerHTML = '<div class="text-center text-gray-500 text-xs py-8">このモンスターの技データはありません。</div>';
        return;
    }

    const note = document.createElement('p');
    note.className = 'text-[9px] text-gray-500 mb-1';
    note.textContent = `バトルではこの中からランダムで最大4つの技を覚えて登場します（全${skillPool.length}種）`;
    skillsContainer.appendChild(note);

    skillPool.forEach(skKey => {
        const sk = SKILLS_DB[skKey];
        if (!sk) return;
        const rank = getDamageRank(sk.force, sk.type);
        const rankColor = getDexSkillRankColor(rank);
        const typeLabel = getDexSkillTypeLabel(sk);
        const hitDisplay = sk.hitRate === 100 ? '必中' : `${sk.hitRate}%`;

        const card = document.createElement('div');
        card.className = 'bg-[#2a1b15] border border-amber-900/50 rounded-xl p-2.5';
        card.innerHTML = `
            <div class="flex justify-between items-center">
                <span class="text-xs font-bold text-amber-200">${sk.name}</span>
                <span class="text-[10px] ${rankColor} bg-[#1a120b] px-1.5 py-0.5 rounded">ランク:${rank}</span>
            </div>
            <div class="flex flex-wrap justify-between items-center text-[9px] text-gray-400 mt-1 gap-y-0.5">
                <span>${typeLabel}</span>
                <span>GUTS消費:${sk.cost} / 命中:${hitDisplay} / 相手GUTS-${sk.gutsDown || 0}</span>
            </div>
            <div class="text-[9px] text-gray-500 mt-1 leading-relaxed">${sk.desc}</div>
        `;
        skillsContainer.appendChild(card);
    });
}
