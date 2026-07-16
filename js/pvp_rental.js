// =====================================================
// pvp_rental.js
// PvP（リアルタイム対戦）で使用するパーティを、保存済みマスモンではなく
// その場で生成するレンタルモンスターから選ぶための画面ロジック。
// 実際のマッチング・ターン同期は masmon_realtime.js / masmon_realtime_battle.js
// （既存のリアルタイム対戦エンジン）へそのまま引き継ぐ。
// =====================================================

const PVP_RENTAL_STATE = {
    battleType: 'team', // 'solo' | 'team'
    offer: [],
    selectedIdx: []
};

// --- PvP用レンタル装備抽選：段階を設けず、ノーマル〜特殊効果まで幅広くミックスする ---
function pvpRentalRollEquipment() {
    if (Math.random() < 0.2) return null; // 未装備の余地も残す
    if (Math.random() < 0.2) {
        const auraPool = Object.values(EQUIPMENT_DB).filter(e => e.type === 'auraStat2');
        if (auraPool.length > 0) return buildEquipmentInstanceFromBase(auraPool[Math.floor(Math.random() * auraPool.length)]);
    }
    const pool = Object.values(EQUIPMENT_DB).filter(e => e.type === 'stat' || e.type === 'special');
    if (pool.length === 0) return null;
    return buildEquipmentInstanceFromBase(pool[Math.floor(Math.random() * pool.length)]);
}

// --- PvP用レンタルモンスター1体を生成（ガッツファクトリーと同じ12種族プール・「型」データを使用） ---
// PvPレンタル対戦には「周回」の概念が無いため、型は常に全4種（型1〜4）から抽選する。
function generatePvpRentalMonster(speciesId) {
    const tmpl = MONSTER_TEMPLATES[speciesId];
    if (!tmpl) return null;

    const mold = (typeof pickMonsterMold === 'function') ? pickMonsterMold(speciesId, 4, null) : null;
    let chosenSkills, equipInstance;
    if (mold) {
        chosenSkills = mold.skills;
        equipInstance = mold.equip;
    } else {
        // 型データが無い（未定義の）種族向けフォールバック：従来通りのランダム抽選
        const skillPool = KIN_NEJIKI_SKILL_POOL[speciesId] || [];
        const shuffledSkills = [...skillPool].sort(() => Math.random() - 0.5);
        chosenSkills = shuffledSkills.slice(0, Math.min(4, shuffledSkills.length));
        equipInstance = pvpRentalRollEquipment();
    }

    const variance = () => 0.95 + Math.random() * 0.1; // PvPは公平性重視で個体差を小さめに(±5%)

    const stats = {
        maxLife: Math.round(tmpl.stats.maxLife * variance()),
        pow: Math.round(tmpl.stats.pow * variance()),
        int: Math.round(tmpl.stats.int * variance()),
        hit: Math.round(tmpl.stats.hit * variance()),
        spd: Math.round(tmpl.stats.spd * variance()),
        def: Math.round(tmpl.stats.def * variance()),
        gutsSpeed: tmpl.stats.gutsSpeed
    };
    stats.life = stats.maxLife;

    return {
        name: tmpl.name,
        monsterBaseName: tmpl.name,
        emoji: tmpl.emoji,
        speciesId: speciesId,
        aura: getRandomAuraKey(), // 全モンスターに必ずオーラを付与する
        isAwakened: false,
        statusEffect: null,
        difficulty: 'pvp',
        stats: stats,
        skills: chosenSkills,
        skillEnhancements: {},
        equip: equipInstance
    };
}

function generatePvpRentalOffer() {
    const shuffledSpecies = [...KIN_NEJIKI_SPECIES_POOL].sort(() => Math.random() - 0.5);
    return shuffledSpecies.slice(0, 6).map(sp => generatePvpRentalMonster(sp));
}

// --- タイトルから：PvP対戦のレンタルパーティ選出画面へ ---
function startPvpRentalEntry(battleType = 'team') {
    PVP_RENTAL_STATE.battleType = battleType;
    PVP_RENTAL_STATE.offer = generatePvpRentalOffer();
    PVP_RENTAL_STATE.selectedIdx = [];
    renderPvpRentalSelectScreen();
    changeScreen('screen-pvp-rental-select');
}

function switchPvpRentalBattleType(battleType) {
    if (PVP_RENTAL_STATE.battleType === battleType) return;
    PVP_RENTAL_STATE.battleType = battleType;
    PVP_RENTAL_STATE.selectedIdx = [];
    renderPvpRentalSelectScreen();
}

function renderPvpRentalSelectScreen() {
    const soloBtn = document.getElementById('pvp-rental-tab-solo');
    const teamBtn = document.getElementById('pvp-rental-tab-team');
    if (soloBtn && teamBtn) {
        const activeCls = 'flex-1 py-2 text-xs font-bold rounded-lg border transition-all bg-sky-900 border-sky-600 text-sky-300';
        const inactiveCls = 'flex-1 py-2 text-xs font-bold rounded-lg border transition-all bg-[#2a1b15] border-sky-950 text-gray-400';
        soloBtn.className = PVP_RENTAL_STATE.battleType === 'solo' ? activeCls : inactiveCls;
        teamBtn.className = PVP_RENTAL_STATE.battleType === 'team' ? activeCls : inactiveCls;
    }

    const needCount = PVP_RENTAL_STATE.battleType === 'solo' ? 1 : 3;

    const container = document.getElementById('pvp-rental-offer-container');
    if (container) {
        container.innerHTML = '';
        PVP_RENTAL_STATE.offer.forEach((m, idx) => {
            if (!m) return;
            const isSelected = PVP_RENTAL_STATE.selectedIdx.includes(idx);
            const card = document.createElement('div');
            card.className = `bg-[#16202b] border rounded-xl p-2.5 cursor-pointer active:scale-[0.98] transition-all ${isSelected ? 'border-sky-400 shadow-[0_0_6px_2px_rgba(56,189,248,0.4)]' : 'border-sky-900/50'}`;
            card.onclick = () => togglePvpRentalSelect(idx, needCount);

            const skillNames = m.skills.map(sk => (SKILLS_DB[sk] ? SKILLS_DB[sk].name : sk)).join('、');
            const equipText = m.equip ? getEquipmentDisplayName(m.equip) : '未装備';
            const aura = AURA_TYPES[m.aura];
            const auraBadge = aura ? `<span class="ml-1 px-1 py-0.5 rounded text-[8px] font-bold text-slate-900 ${aura.colorClass}">${aura.emoji}${aura.name}</span>` : '';

            const iconWrap = document.createElement('div');
            iconWrap.className = 'w-10 h-10 flex items-center justify-center text-2xl flex-shrink-0 bg-[#0a0f1a] rounded-full border border-sky-900/40 overflow-hidden';
            renderMonsterVisual(iconWrap, m.monsterBaseName, m.emoji, false, true);

            card.innerHTML = `
                <div class="flex items-center space-x-2">
                    <div class="flex-1 min-w-0">
                        <div class="text-xs font-bold text-sky-200">${m.name} ${auraBadge} ${isSelected ? '✅' : ''}</div>
                        <div class="text-[9px] text-gray-400 mt-0.5">HP${m.stats.maxLife} / ちから${m.stats.pow} / かしこさ${m.stats.int} / 命中${m.stats.hit} / 回避${m.stats.spd} / 丈夫さ${m.stats.def}</div>
                        <div class="text-[9px] text-gray-500 mt-0.5">技: ${skillNames}</div>
                        <div class="text-[9px] text-purple-300 mt-0.5">装備: ${equipText}</div>
                    </div>
                </div>
            `;
            card.querySelector('.flex.items-center').prepend(iconWrap);
            container.appendChild(card);
        });
    }

    const confirmBtn = document.getElementById('pvp-rental-confirm-btn');
    if (confirmBtn) {
        const count = PVP_RENTAL_STATE.selectedIdx.length;
        confirmBtn.disabled = count !== needCount;
        confirmBtn.textContent = count === needCount ? '合言葉入力へ進む' : `パーティを選択中 (${count}/${needCount})`;
        confirmBtn.classList.toggle('opacity-50', count !== needCount);
    }
}

function togglePvpRentalSelect(idx, needCount) {
    const pos = PVP_RENTAL_STATE.selectedIdx.indexOf(idx);
    if (pos >= 0) {
        PVP_RENTAL_STATE.selectedIdx.splice(pos, 1);
    } else {
        if (PVP_RENTAL_STATE.selectedIdx.length >= needCount) {
            showToast(needCount === 1 ? '個人戦は1体のみ選択できます。' : 'パーティは3体までです。');
            return;
        }
        PVP_RENTAL_STATE.selectedIdx.push(idx);
    }
    renderPvpRentalSelectScreen();
}

function confirmPvpRentalParty() {
    const needCount = PVP_RENTAL_STATE.battleType === 'solo' ? 1 : 3;
    if (PVP_RENTAL_STATE.selectedIdx.length !== needCount) return;
    const team = PVP_RENTAL_STATE.selectedIdx.map(idx => JSON.parse(JSON.stringify(PVP_RENTAL_STATE.offer[idx])));
    showRealtimeKeywordScreen(team, [], PVP_RENTAL_STATE.battleType);
}

// マッチング画面のキャンセル・退出・対戦相手切断等から戻ってきた際の共通の戻り先。
// マスモン一覧は廃止したため、パーティを選び直すところへ戻す。
function returnToPvpEntry() {
    startPvpRentalEntry(PVP_RENTAL_STATE.battleType || 'team');
}
