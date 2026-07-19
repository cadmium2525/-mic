// =====================================================
// kinnejiki.js
// 「ガッツファクトリー」レンタルモンスターバトルモード
// ・育成モードを介さず、あらかじめ用意されたレンタルモンスターから
//   6体提示→3体選出でパーティを組み、7戦1セット×7セット＝49連勝を目指す
// ・1勝ごとに相手モンスター1体と手持ち1体を交換できる
// ・3セット目・7セット目のクリア後（＝各セットの7戦目）にレジェンドブリーダー・コルトが登場
// ・セットが進むほど相手のステータス・AIレベル・装備が強化される
// ・既存の masmon_battle.js の3vs3バトルエンジンをそのまま再利用する
//   （MASMON_BATTLE_STATE.kinNejiki フラグでガッツファクトリー実行中を識別）
// Firebase Realtime Database: kinnejiki_ranking/{playerId} = { name, bestWins, bestCleared, updatedAt }
// =====================================================

const KIN_NEJIKI_STATE = {
    active: false,
    set: 1,            // 1〜7
    battleInSet: 1,     // 1〜7（7戦目が各セットのボス戦）
    totalWins: 0,       // 0〜49
    playerParty: [],    // 選出した3体（レンタルモンスターオブジェクト）
    offer: [],          // 現在提示中の6体（パーティ選出画面用）
    selectedIdx: [],    // offer内で選択中のインデックス（最大3）
    pendingSwap: null,  // 直前の勝利で交換対象になる相手チーム情報
    // 「こちらが交換する前に相手のモンスターが決まる」仕様のため、次バトルの対戦相手は
    // 勝利直後（交換画面が開く前）の時点で先に生成し、ここに保持しておく。
    // { opponentTeam, floorLabel, isNejiki, aiLevel } または null
    nextBattlePrepared: null
};

// =====================================================
// 対戦相手ブリーダー名鑑（ボス戦を除く通常戦の相手に順番に割り当てる二つ名付きブリーダー）
// 通算バトル数（1〜49）に応じて、この配列を先頭からループしながら割り当てる。
// =====================================================
const KIN_NEJIKI_BREEDER_NAMES = [
    '白銀の騎士アルベルト',
    '飛燕のセシリア',
    '鉄腕ガルシア',
    '不敗のマキシム',
    'エリートブリーダークロウ',
    'ただのララ',
    '怪老ゲンジ',
    '幻惑のシルバ',
    '熱血ブリーダーダイゴ',
    'お嬢様カトリーヌ',
    'ミスターG',
    '迷子のトト',
    '神速のレオン',
    '冥府の門番ハデス',
    '大地の母エレーナ'
];

// --- 通算バトル数（1〜）からブリーダー名を1つ割り当てる（15名を順番にループ） ---
function getKinNejikiBreederName(totalBattleNumber) {
    const idx = (Math.max(1, totalBattleNumber) - 1) % KIN_NEJIKI_BREEDER_NAMES.length;
    return KIN_NEJIKI_BREEDER_NAMES[idx];
}

// =====================================================
// 途中セーブ（一時中断・再開専用。コンティニューとしては使えない）
// ・任意のタイミング（勝利後の交換画面）でセーブ可能
// ・再開後に敗北した場合は、そのセーブデータを削除する
// ・クリア（49勝達成）時も削除する
// =====================================================
const KIN_NEJIKI_SUSPEND_KEY = 'mfload_kinnejiki_suspend_v1';

function hasKinNejikiSuspendSave() {
    try {
        return !!localStorage.getItem(KIN_NEJIKI_SUSPEND_KEY);
    } catch (e) {
        return false;
    }
}

function saveKinNejikiSuspend() {
    if (!KIN_NEJIKI_STATE.active) {
        showToast('挑戦中のみ一時セーブできます。');
        return;
    }
    // 勝利後の交換画面から呼ばれた場合、この勝利分をまだカウンタ（battleInSet/set）へ
    // 反映していないことがあるので、その場合はここで先に反映してからセーブする。
    // （これをしないと再開時に直前に勝ったバトルをもう一度やり直すことになってしまう）
    if (KIN_NEJIKI_STATE.pendingSwap) {
        advanceKinNejikiCounters();
    }
    try {
        const payload = {
            set: KIN_NEJIKI_STATE.set,
            battleInSet: KIN_NEJIKI_STATE.battleInSet,
            totalWins: KIN_NEJIKI_STATE.totalWins,
            playerParty: KIN_NEJIKI_STATE.playerParty,
            savedAt: Date.now()
        };
        localStorage.setItem(KIN_NEJIKI_SUSPEND_KEY, JSON.stringify(payload));
        KIN_NEJIKI_STATE.active = false;
        showToast('一時セーブしました。タイトルに戻ります。');
        setTimeout(() => changeScreen('screen-title'), 800);
    } catch (e) {
        console.error('[ガッツファクトリー] 一時セーブエラー:', e);
        showToast('一時セーブに失敗しました。');
    }
}

function clearKinNejikiSuspendSave() {
    try {
        localStorage.removeItem(KIN_NEJIKI_SUSPEND_KEY);
    } catch (e) { /* ignore */ }
}

// タイトル→説明画面に入るタイミングで「続きから再開する」ボタンの表示を切り替える
function updateKinNejikiResumeButtonVisibility() {
    const btn = document.getElementById('kinnejiki-resume-btn');
    if (btn) btn.classList.toggle('hidden', !hasKinNejikiSuspendSave());
}

function resumeKinNejikiRun() {
    let saved = null;
    try {
        const raw = localStorage.getItem(KIN_NEJIKI_SUSPEND_KEY);
        if (raw) saved = JSON.parse(raw);
    } catch (e) {
        saved = null;
    }
    if (!saved) {
        showToast('一時セーブデータが見つかりませんでした。');
        return;
    }

    KIN_NEJIKI_STATE.active = true;
    KIN_NEJIKI_STATE.set = saved.set;
    KIN_NEJIKI_STATE.battleInSet = saved.battleInSet;
    KIN_NEJIKI_STATE.totalWins = saved.totalWins;
    KIN_NEJIKI_STATE.playerParty = saved.playerParty;
    KIN_NEJIKI_STATE.pendingSwap = null;

    showToast(`セーブデータから再開します（通算${saved.totalWins}勝・第${saved.set}セット）`);
    advanceToNextKinNejikiBattle();
}

// --- セット番号からAIレベル（1〜4）を算出 ---
function kinNejikiAiLevelForSet(setNumber) {
    if (setNumber <= 2) return 1;
    if (setNumber <= 4) return 2;
    if (setNumber <= 6) return 3;
    return 4; // 7セット目（最終ボス含む）
}

// --- セット番号に応じた装備の段階的抽選 ---
// セット1〜2：ノーマル産ステータス装備中心 / セット3〜5：ハード産＋一部特殊効果 / セット6〜7：特殊効果中心
// オーラ連動装備は全セット共通で一定確率で混在する
// excludeEquipIds: この配列に含まれる装備IDは抽選対象から除外する
//                  （除外しすぎて候補が0件になった場合は保険として除外を無視する）
function kinNejikiRollEquipmentForSet(setNumber, excludeEquipIds) {
    const excluded = excludeEquipIds || [];

    if (Math.random() < 0.15) {
        const auraPool = Object.values(EQUIPMENT_DB).filter(e => e.type === 'auraStat2' && !excluded.includes(e.id));
        if (auraPool.length > 0) return buildEquipmentInstanceFromBase(auraPool[Math.floor(Math.random() * auraPool.length)]);
    }

    // 装備なし（未装備）の余地も一定確率で残す
    if (Math.random() < 0.15) return null;

    let pool;
    if (setNumber <= 2) {
        pool = Object.values(EQUIPMENT_DB).filter(e => e.mode === 'normal' && e.type === 'stat');
    } else if (setNumber <= 5) {
        pool = (Math.random() < 0.3)
            ? Object.values(EQUIPMENT_DB).filter(e => e.type === 'special')
            : Object.values(EQUIPMENT_DB).filter(e => e.mode === 'hard' && e.type === 'stat');
    } else {
        pool = Object.values(EQUIPMENT_DB).filter(e => e.type === 'special');
    }
    if (!pool || pool.length === 0) {
        pool = Object.values(EQUIPMENT_DB).filter(e => e.type === 'stat');
    }

    let filteredPool = pool.filter(e => !excluded.includes(e.id));
    if (filteredPool.length === 0) filteredPool = pool; // 除外しすぎて候補が無くなった場合の保険

    const base = filteredPool[Math.floor(Math.random() * filteredPool.length)];
    return buildEquipmentInstanceFromBase(base);
}

// --- 指定種族のレンタルモンスターを1体生成する ---
// ・技構成＋装備：MONSTER_MOLDS に定義された「型」から、セット数（周回数）に応じて
//   解放された範囲でランダムに1つ選ぶ（型データが無い種族は従来通りランダム抽選にフォールバック）
// ・ステータス：種族ベース値に個体差(±8%)とセット進行によるスケールを掛ける
// excludeEquipIds: 生成する装備から除外したい装備IDの配列（同じ道具を持ったモンスター同士が
//                  対面しないようにするための調整。省略可）
function generateKinNejikiRentalMonster(speciesId, setNumber, excludeEquipIds) {
    const tmpl = MONSTER_TEMPLATES[speciesId];
    if (!tmpl) return null;

    const unlockedMoldCount = (typeof getMoldUnlockCountForSet === 'function') ? getMoldUnlockCountForSet(setNumber) : 1;
    const mold = (typeof pickMonsterMold === 'function') ? pickMonsterMold(speciesId, unlockedMoldCount, excludeEquipIds) : null;

    let chosenSkills, equipInstance;
    if (mold) {
        chosenSkills = mold.skills;
        equipInstance = mold.equip;
    } else {
        // 型データが無い（未定義の）種族向けフォールバック：従来通りのランダム抽選
        const skillPool = KIN_NEJIKI_SKILL_POOL[speciesId] || [];
        const shuffledSkills = [...skillPool].sort(() => Math.random() - 0.5);
        chosenSkills = shuffledSkills.slice(0, Math.min(4, shuffledSkills.length));
        equipInstance = kinNejikiRollEquipmentForSet(setNumber, excludeEquipIds);
    }

    const individualVariance = () => 0.92 + Math.random() * 0.16; // ±8%の個体差
    const setScale = 1 + (Math.max(0, setNumber - 1) * 0.06); // セットが進むごとに約6%ずつ強化

    const rawStats = {
        maxLife: Math.round(tmpl.stats.maxLife * individualVariance() * setScale),
        pow: Math.round(tmpl.stats.pow * individualVariance() * setScale),
        int: Math.round(tmpl.stats.int * individualVariance() * setScale),
        hit: Math.round(tmpl.stats.hit * individualVariance() * setScale),
        spd: Math.round(tmpl.stats.spd * individualVariance() * setScale),
        def: Math.round(tmpl.stats.def * individualVariance() * setScale),
        gutsSpeed: tmpl.stats.gutsSpeed
    };
    rawStats.life = rawStats.maxLife;

    return {
        name: tmpl.name,
        monsterBaseName: tmpl.name,
        emoji: tmpl.emoji,
        speciesId: speciesId,
        aura: getRandomAuraKey(), // 全モンスターに必ずオーラを付与する
        isAwakened: false,
        statusEffect: null,
        difficulty: 'kinnejiki',
        stats: rawStats,
        skills: chosenSkills,
        skillEnhancements: {},
        equip: equipInstance,
        ownerName: 'レンタルモンスター'
    };
}

// --- 12種族プールから重複なく指定数（既定6体）のレンタル候補を生成 ---
// excludeSpeciesIds: 抽選対象から除外したい種族IDの配列（同じモンスター同士が対面しないための調整。省略可）
// excludeEquipIds:   各個体の装備から除外したい装備IDの配列（省略可）
// count:             生成する体数（既定6）
function generateKinNejikiOffer(setNumber, excludeSpeciesIds, excludeEquipIds, count) {
    const n = count || 6;
    const excludeSpecies = excludeSpeciesIds || [];

    let candidatePool = KIN_NEJIKI_SPECIES_POOL.filter(sp => !excludeSpecies.includes(sp));
    if (candidatePool.length < n) candidatePool = KIN_NEJIKI_SPECIES_POOL.slice(); // 除外しすぎて足りない場合の保険

    const shuffledSpecies = [...candidatePool].sort(() => Math.random() - 0.5);
    const chosenSpecies = shuffledSpecies.slice(0, n);
    return chosenSpecies.map(sp => generateKinNejikiRentalMonster(sp, setNumber, excludeEquipIds));
}

// --- 対戦相手チーム（3体）を生成。ボス戦の場合は専用ボス＋帯同2体を返す ---
// excludeSpeciesIds / excludeEquipIds: 「同じモンスター・同じ装備同士が対面しない」仕様のための除外リスト（省略可）
function generateKinNejikiOpponentTeam(setNumber, isNejiki, excludeSpeciesIds, excludeEquipIds, totalBattleNumber) {
    const excludeSpecies = excludeSpeciesIds || [];
    const excludeEquip = excludeEquipIds || [];

    if (isNejiki) {
        const bossKey = (setNumber === 3) ? 'set3' : 'set7';
        const bossDef = KIN_NEJIKI_BOSSES[bossKey];
        const bossUnit = {
            name: bossDef.name,
            monsterBaseName: bossDef.templateId ? (MONSTER_TEMPLATES[bossDef.templateId] || {}).name || bossDef.name : bossDef.name,
            // 専用イラストが用意されているボスは、モン類判定用のmonsterBaseNameとは別に
            // 表示イラスト名を上書きする（例：set3ボスはゴーレム種だが「ゴビ.png」を使用する）
            visualName: (bossKey === 'set3') ? 'ゴビ' : null,
            emoji: bossDef.emoji,
            speciesId: bossDef.templateId,
            aura: getRandomAuraKey(),
            isAwakened: false,
            statusEffect: null,
            difficulty: 'kinnejiki',
            stats: { ...bossDef.statsBase, life: bossDef.statsBase.maxLife },
            skills: [...bossDef.skills],
            skillEnhancements: {},
            equip: kinNejikiRollEquipmentForSet(7, excludeEquip),
            ownerName: bossDef.title
        };
        const escorts = generateKinNejikiOffer(7, excludeSpecies, excludeEquip, 2);
        escorts.forEach(m => { if (m) m.ownerName = bossDef.title; });
        return [bossUnit, ...escorts.filter(Boolean)];
    }

    const breederName = getKinNejikiBreederName(totalBattleNumber || 1);
    const team = generateKinNejikiOffer(setNumber, excludeSpecies, excludeEquip, 3);
    team.forEach(m => { if (m) m.ownerName = breederName; });
    return team;
}

// =====================================================
// 敵AIロジック（アイテムは使わず、技選択と交代のみガッツファクトリー専用に判定する）
// =====================================================

// --- 敵の技選択（アイテムAI runEnemyItemAI とは別に、ガッツファクトリー戦のみ masmon_battle.js から呼ばれる） ---
function chooseKinNejikiEnemySkill(e, p, affordableSkills, aiLevel) {
    if (!affordableSkills || affordableSkills.length === 0) return null;

    if (aiLevel <= 1) {
        return affordableSkills[Math.floor(Math.random() * affordableSkills.length)].key;
    }

    // 簡易ダメージ見積り（乱数・クリティカル・装備効果等は考慮しない目安値）
    const dmgMultiplier = (typeof MASMON_BATTLE_DAMAGE_MULTIPLIER === 'number') ? MASMON_BATTLE_DAMAGE_MULTIPLIER : 0.2;
    const estimate = (skInfo) => {
        if (skInfo.type !== 'pow' && skInfo.type !== 'int') return 0;
        const atk = skInfo.type === 'pow' ? e.stats.pow : e.stats.int;
        const def = p.stats.def * 1.5;
        const raw = atk * skInfo.force - def * 0.35;
        return Math.max(1, raw) * dmgMultiplier;
    };
    const withEstimate = affordableSkills.map(s => ({ ...s, estDmg: estimate(s.info) }));

    // レベル4（ボス級）：確殺が狙えるなら最大火力、そうでなければ制圧（ガッツダウン／状態異常）を優先
    if (aiLevel >= 4) {
        const lethal = withEstimate.filter(s => s.estDmg >= p.stats.life);
        if (lethal.length > 0) {
            lethal.sort((a, b) => b.estDmg - a.estDmg);
            return lethal[0].key;
        }
        if (p.guts >= 55) {
            const control = withEstimate.filter(s => (s.info.gutsDown || 0) >= 20);
            if (control.length > 0) {
                control.sort((a, b) => (b.info.gutsDown || 0) - (a.info.gutsDown || 0));
                return control[0].key;
            }
        }
        withEstimate.sort((a, b) => b.estDmg - a.estDmg);
        return withEstimate[0].key;
    }

    // レベル3：確殺があれば最大火力、なければ上位技からランダム（読み合いの余地を残す）
    if (aiLevel >= 3) {
        const lethal = withEstimate.filter(s => s.estDmg >= p.stats.life);
        if (lethal.length > 0) {
            lethal.sort((a, b) => b.estDmg - a.estDmg);
            return lethal[0].key;
        }
        withEstimate.sort((a, b) => b.estDmg - a.estDmg);
        const top = withEstimate.slice(0, Math.min(2, withEstimate.length));
        return top[Math.floor(Math.random() * top.length)].key;
    }

    // レベル2：ガッツが十分溜まっていれば大技、そうでなければ低コスト技で手数を稼ぐ
    if (e.guts >= 70) {
        withEstimate.sort((a, b) => b.estDmg - a.estDmg);
        return withEstimate[0].key;
    }
    withEstimate.sort((a, b) => a.info.cost - b.info.cost);
    return withEstimate[0].key;
}

// --- 敵の自動交代判定（AIレベル3以上のみ、decideMasmonEnemyAction冒頭から呼ばれる） ---
function maybeExecuteKinNejikiEnemySwitch() {
    if (MASMON_BATTLE_STATE.mode !== 'cpu_team') return false;
    const team = MASMON_BATTLE_STATE.enemyTeam;
    const idx = MASMON_BATTLE_STATE.enemyActiveIdx;
    const active = team[idx];
    if (!active || active.stats.life <= 0) return false;

    const lifeRatio = active.stats.life / active.stats.maxLife;
    if (lifeRatio > 0.3) return false; // 3割より多く残っている間は交代を検討しない

    const candidates = team
        .map((unit, i) => ({ i, unit }))
        .filter(({ i, unit }) => i !== idx && unit.stats.life > 0);
    if (candidates.length === 0) return false;

    // 温存判断が外れることもある（毎回必ず交代すると読みやすくなりすぎるため）
    if (Math.random() > 0.8) return false;

    candidates.sort((a, b) => b.unit.stats.life - a.unit.stats.life);
    const chosen = candidates[0];

    clearBattleStatModifiersOnSwitch(active);
    MASMON_BATTLE_STATE.enemyActiveIdx = chosen.i;
    const ownerLabel = MASMON_BATTLE_STATE.opponentOwnerName || '相手';
    addLog(`💦 ${active.name} は苦しい状況と判断し、${ownerLabel}は【${chosen.unit.name}】に交代した！`);
    showEffect('🔄 相手交代！ 🔄');

    const newUnit = chosen.unit;
    const enemyMetaOwner = (MASMON_BATTLE_STATE.enemyMeta[chosen.i] || {}).ownerName || '相手ブリーダー';
    document.getElementById('enemy-name').textContent = `${newUnit.name}（${enemyMetaOwner}）`;
    renderMonsterVisual(document.getElementById('battle-enemy-icon'), newUnit.visualName || newUnit.monsterBaseName, newUnit.emoji, newUnit.isAwakened);
    document.getElementById('battle-enemy-type').textContent = newUnit.name;
    renderAuraBadge('enemy-aura-badge', newUnit.aura, newUnit.monsterBaseName);
    return true;
}

// =====================================================
// 画面遷移・進行制御
// =====================================================

// --- タイトルから「ガッツファクトリー」の説明画面へ ---
function startKinNejikiEntry() {
    updateKinNejikiResumeButtonVisibility();
    changeScreen('screen-kinnejiki-title');
}

// --- ランを開始し、最初の6体提示を生成 ---
function beginKinNejikiRun() {
    clearKinNejikiSuspendSave(); // 新規に挑戦を始める場合、古い一時セーブは破棄する
    KIN_NEJIKI_STATE.active = true;
    KIN_NEJIKI_STATE.set = 1;
    KIN_NEJIKI_STATE.battleInSet = 1;
    KIN_NEJIKI_STATE.totalWins = 0;
    KIN_NEJIKI_STATE.playerParty = [];
    KIN_NEJIKI_STATE.selectedIdx = [];
    KIN_NEJIKI_STATE.pendingSwap = null;
    KIN_NEJIKI_STATE.nextBattlePrepared = null;
    KIN_NEJIKI_STATE.offer = generateKinNejikiOffer(1);
    renderKinNejikiSelectScreen();
    changeScreen('screen-kinnejiki-select');
}

// --- パーティ選出画面（6体提示→タップで最大3体選択）の描画 ---
function renderKinNejikiSelectScreen() {
    const container = document.getElementById('kinnejiki-offer-container');
    if (!container) return;
    container.innerHTML = '';

    KIN_NEJIKI_STATE.offer.forEach((m, idx) => {
        if (!m) return;
        const isSelected = KIN_NEJIKI_STATE.selectedIdx.includes(idx);
        const card = document.createElement('div');
        card.className = `bg-[#2a1b15] border rounded-xl p-2.5 cursor-pointer active:scale-[0.98] transition-all ${isSelected ? 'border-amber-400 shadow-[0_0_6px_2px_rgba(251,191,36,0.4)]' : 'border-amber-900/50'}`;
        card.onclick = () => toggleKinNejikiSelect(idx);

        const skillNames = m.skills.map(sk => (SKILLS_DB[sk] ? SKILLS_DB[sk].name : sk)).join('、');
        const equipText = m.equip ? getEquipmentDisplayName(m.equip) : '未装備';
        const aura = AURA_TYPES[m.aura];
        const monClassKey = getMonClassKeyForName(m.monsterBaseName);
        const monClassInfo = monClassKey ? MON_CLASS_TYPES[monClassKey] : null;
        const auraBadge = aura ? `<span class="ml-1 px-1 py-0.5 rounded text-[8px] font-bold text-slate-900 ${aura.colorClass}">${aura.emoji}${monClassInfo ? monClassInfo.emoji : ''}</span>` : '';

        const iconWrap = document.createElement('div');
        iconWrap.className = 'w-10 h-10 flex items-center justify-center text-2xl flex-shrink-0 bg-[#1a120b] rounded-full border border-amber-900/40 overflow-hidden';
        renderMonsterVisual(iconWrap, m.visualName || m.monsterBaseName, m.emoji, false, true);

        card.innerHTML = `
            <div class="flex items-center space-x-2">
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold text-amber-200">${m.name} ${auraBadge} ${isSelected ? '✅' : ''}</div>
                    <div class="text-[9px] text-gray-400 mt-0.5">HP${m.stats.maxLife} / ちから${m.stats.pow} / かしこさ${m.stats.int} / 命中${m.stats.hit} / 回避${m.stats.spd} / 丈夫さ${m.stats.def}</div>
                    <div class="text-[9px] text-gray-500 mt-0.5">技: ${skillNames}</div>
                    <div class="text-[9px] text-purple-300 mt-0.5">装備: ${equipText}</div>
                </div>
            </div>
        `;
        card.querySelector('.flex.items-center').prepend(iconWrap);
        container.appendChild(card);
    });

    const confirmBtn = document.getElementById('kinnejiki-confirm-party-btn');
    if (confirmBtn) {
        const count = KIN_NEJIKI_STATE.selectedIdx.length;
        confirmBtn.disabled = count !== 3;
        confirmBtn.textContent = count === 3 ? 'このパーティで挑戦開始！' : `パーティを選択中 (${count}/3)`;
        confirmBtn.classList.toggle('opacity-50', count !== 3);
    }
}

function toggleKinNejikiSelect(idx) {
    const pos = KIN_NEJIKI_STATE.selectedIdx.indexOf(idx);
    if (pos >= 0) {
        KIN_NEJIKI_STATE.selectedIdx.splice(pos, 1);
    } else {
        if (KIN_NEJIKI_STATE.selectedIdx.length >= 3) {
            showToast('パーティは3体までです。');
            return;
        }
        KIN_NEJIKI_STATE.selectedIdx.push(idx);
    }
    renderKinNejikiSelectScreen();
}

function confirmKinNejikiParty() {
    if (KIN_NEJIKI_STATE.selectedIdx.length !== 3) return;
    KIN_NEJIKI_STATE.playerParty = KIN_NEJIKI_STATE.selectedIdx.map(idx => JSON.parse(JSON.stringify(KIN_NEJIKI_STATE.offer[idx])));
    advanceToNextKinNejikiBattle();
}

// --- 次バトルの set / battleInSet / ボス戦判定を、カウンタを実際に進めずに先読みする ---
function peekNextKinNejikiBattleMeta() {
    let nextSet = KIN_NEJIKI_STATE.set;
    let nextBattleInSet = KIN_NEJIKI_STATE.battleInSet;
    if (nextBattleInSet >= 7) {
        nextBattleInSet = 1;
        nextSet++;
    } else {
        nextBattleInSet++;
    }
    const isNejiki = nextBattleInSet === 7 && (nextSet === 3 || nextSet === 7);
    return { set: nextSet, battleInSet: nextBattleInSet, isNejiki };
}

// --- 「同じモンスター・同じ装備同士が対面しない」ための除外リストを組み立てる ---
// own: 現在の手持ちパーティ（交換前）／opponent: 直前に戦った（今まさに倒した）相手チーム
function buildKinNejikiExclusions(ownParty, opponentParty) {
    const ownSpecies = (ownParty || []).map(m => m && m.speciesId).filter(Boolean);
    const oppSpecies = (opponentParty || []).map(m => m && m.speciesId).filter(Boolean);
    const ownEquip = (ownParty || []).map(m => m && m.equip && m.equip.equipId).filter(Boolean);
    const oppEquip = (opponentParty || []).map(m => m && m.equip && m.equip.equipId).filter(Boolean);
    return {
        species: [...new Set([...ownSpecies, ...oppSpecies])],
        equip: [...new Set([...ownEquip, ...oppEquip])]
    };
}

// --- 指定した set/battleInSet/isNejiki に対応するバトル情報一式（相手チーム・表示ラベル等）を組み立てる ---
function buildKinNejikiBattlePackage(set, battleInSet, isNejiki, excludeSpecies, excludeEquip) {
    const aiLevel = kinNejikiAiLevelForSet(set);
    const totalBattleNumber = (set - 1) * 7 + battleInSet;
    const opponentTeam = generateKinNejikiOpponentTeam(set, isNejiki, excludeSpecies, excludeEquip, totalBattleNumber);
    const floorLabel = isNejiki
        ? `⚔️ 第${set}セット・ボス戦（通算${totalBattleNumber}戦目）`
        : `⚔️ 第${set}セット ${battleInSet}戦目（通算${totalBattleNumber}戦目）`;
    return { opponentTeam, floorLabel, isNejiki, aiLevel };
}

// --- 次のバトル（現在の set / battleInSet に対応する相手）を組み立てて開始 ---
// 通常は kinNejikiHandleBattleEnd で事前生成された nextBattlePrepared をそのまま使う。
// （初戦や、一時セーブからの再開など事前生成が無い場合のみ、その場で生成する）
function advanceToNextKinNejikiBattle() {
    if (KIN_NEJIKI_STATE.nextBattlePrepared) {
        const prepared = KIN_NEJIKI_STATE.nextBattlePrepared;
        KIN_NEJIKI_STATE.nextBattlePrepared = null;
        startKinNejikiBattleEngine(prepared.opponentTeam, prepared.floorLabel, prepared.isNejiki, prepared.aiLevel);
        return;
    }

    // 事前生成が無い場合の保険：現在の手持ちパーティの種族・装備だけを除外して生成する
    // （直前の対戦相手の情報は無いため、その分の除外はできない）
    const set = KIN_NEJIKI_STATE.set;
    const battleInSet = KIN_NEJIKI_STATE.battleInSet;
    const isNejiki = battleInSet === 7 && (set === 3 || set === 7);
    const exclusions = buildKinNejikiExclusions(KIN_NEJIKI_STATE.playerParty, null);
    const battlePackage = buildKinNejikiBattlePackage(set, battleInSet, isNejiki, exclusions.species, exclusions.equip);

    startKinNejikiBattleEngine(battlePackage.opponentTeam, battlePackage.floorLabel, battlePackage.isNejiki, battlePackage.aiLevel);
}

// --- 既存の masmon_battle.js エンジン（3vs3対応）へ状態をセットしてバトル画面へ ---
// バトル開始前に「対戦相手ブリーダーと対峙する」演出画面を挟み、ボタンタップで実際のバトルへ進む。
let KIN_NEJIKI_PENDING_BATTLE = null; // { opponentTeamRaw, floorText, isNejiki, aiLevel }

function startKinNejikiBattleEngine(opponentTeamRaw, floorText, isNejiki, aiLevel) {
    KIN_NEJIKI_PENDING_BATTLE = { opponentTeamRaw, floorText, isNejiki, aiLevel };
    const breederName = (opponentTeamRaw[0] || {}).ownerName || 'レンタル使い';
    showKinNejikiEncounterScreen(breederName, isNejiki);
}

// --- 「○○が勝負を仕掛けてきた！」演出画面を表示する ---
function showKinNejikiEncounterScreen(breederName, isNejiki) {
    const msgEl = document.getElementById('kinnejiki-encounter-message');
    if (msgEl) msgEl.textContent = `${breederName}が勝負を仕掛けてきた！`;
    const iconEl = document.getElementById('kinnejiki-encounter-icon');
    if (iconEl) iconEl.textContent = isNejiki ? '👑' : '🥊';
    changeScreen('screen-kinnejiki-encounter');
}

// --- 演出画面の「バトル開始！」ボタンから呼ばれ、保留していたバトルを実際に開始する ---
function confirmKinNejikiEncounter() {
    if (!KIN_NEJIKI_PENDING_BATTLE) return;
    const { opponentTeamRaw, floorText, isNejiki, aiLevel } = KIN_NEJIKI_PENDING_BATTLE;
    KIN_NEJIKI_PENDING_BATTLE = null;
    launchKinNejikiBattleEngine(opponentTeamRaw, floorText, isNejiki, aiLevel);
}

function launchKinNejikiBattleEngine(opponentTeamRaw, floorText, isNejiki, aiLevel) {
    MASMON_BATTLE_STATE.mode = 'cpu_team';
    MASMON_BATTLE_STATE.playerTeam = KIN_NEJIKI_STATE.playerParty.map(m => convertMasmonToBattleUnit(m, m.equip || null));
    MASMON_BATTLE_STATE.enemyTeam = opponentTeamRaw.map(m => convertMasmonToBattleUnit(m, m.equip || null));
    MASMON_BATTLE_STATE.playerMeta = [...KIN_NEJIKI_STATE.playerParty];
    MASMON_BATTLE_STATE.enemyMeta = [...opponentTeamRaw];
    MASMON_BATTLE_STATE.playerActiveIdx = 0;
    MASMON_BATTLE_STATE.enemyActiveIdx = 0;
    // ガッツファクトリーはレンタル制のため対戦アイテムの持ち込みは無し
    MASMON_BATTLE_STATE.playerItems = { mango: 0, kuri: 0, toro: 0 };
    MASMON_BATTLE_STATE.playerItemsInitial = { ...MASMON_BATTLE_STATE.playerItems };
    MASMON_BATTLE_STATE.enemyItems = { mango: 0, kuri: 0, toro: 0 };
    MASMON_BATTLE_STATE.opponentOwnerName = (opponentTeamRaw[0] || {}).ownerName || 'レンタル使い';
    MASMON_BATTLE_STATE.kinNejiki = {
        inRun: true,
        set: KIN_NEJIKI_STATE.set,
        battleIndex: KIN_NEJIKI_STATE.battleInSet,
        isNejiki: !!isNejiki,
        aiLevel: aiLevel
    };

    startMasmonBattleCommon(floorText);
}

// --- バトル終了後の分岐（masmon_battle.js の handleMasmonBattleWin/Lose から呼ばれる） ---
function kinNejikiHandleBattleEnd(isWin) {
    if (!isWin) {
        kinNejikiFinishRun(false);
        return;
    }

    KIN_NEJIKI_STATE.totalWins++;
    const defeatedTeam = [...MASMON_BATTLE_STATE.enemyMeta];
    KIN_NEJIKI_STATE.pendingSwap = {
        defeatedTeam,
        wasNejiki: !!(MASMON_BATTLE_STATE.kinNejiki && MASMON_BATTLE_STATE.kinNejiki.isNejiki)
    };

    if (KIN_NEJIKI_STATE.totalWins >= 49) {
        kinNejikiFinishRun(true);
        return;
    }

    // 「こちらが交換する前に相手のモンスターが決まる」仕様のため、次バトルの対戦相手は
    // 交換画面（手持ち変更）が開く前＝このタイミングで確定させる。
    // 除外対象：現在の手持ち（交換前のパーティ）＋今まさに倒した相手チーム、それぞれの種族と装備。
    const next = peekNextKinNejikiBattleMeta();
    const exclusions = buildKinNejikiExclusions(KIN_NEJIKI_STATE.playerParty, defeatedTeam);
    KIN_NEJIKI_STATE.nextBattlePrepared = buildKinNejikiBattlePackage(
        next.set, next.battleInSet, next.isNejiki, exclusions.species, exclusions.equip
    );

    renderKinNejikiSwapScreen();
    changeScreen('screen-kinnejiki-swap');
}

// =====================================================
// 勝利後の交換画面（1勝ごとに相手モンスター1体と手持ち1体を交換できる）
// =====================================================
let kinNejikiSwapMineIdx = null;
let kinNejikiSwapTheirsIdx = null;

function renderKinNejikiSwapScreen() {
    kinNejikiSwapMineIdx = null;
    kinNejikiSwapTheirsIdx = null;
    const selectStep = document.getElementById('kinnejiki-swap-step-select');
    const nextStep = document.getElementById('kinnejiki-swap-step-next');
    if (selectStep) { selectStep.classList.remove('hidden'); selectStep.style.display = 'flex'; }
    if (nextStep) { nextStep.classList.add('hidden'); nextStep.style.display = 'none'; }
    renderKinNejikiSwapLists();
}

function renderKinNejikiSwapLists() {
    const mineContainer = document.getElementById('kinnejiki-swap-mine-container');
    const theirsContainer = document.getElementById('kinnejiki-swap-theirs-container');
    if (!mineContainer || !theirsContainer) return;

    const renderList = (container, list, selectedIdx, onClick, keyPrefix) => {
        container.innerHTML = '';
        list.forEach((m, idx) => {
            if (!m) return;
            const isSelected = idx === selectedIdx;
            const card = document.createElement('div');
            card.className = `bg-[#2a1b15] border rounded-xl p-2 cursor-pointer active:scale-[0.98] transition-all flex items-center space-x-2 ${isSelected ? 'border-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.4)]' : 'border-amber-900/50'}`;
            card.onclick = () => onClick(idx);
            const skillNames = (m.skills || []).map(sk => (SKILLS_DB[sk] ? SKILLS_DB[sk].name : sk)).join('、');
            const visualId = `kinnejiki-swap-visual-${keyPrefix}-${idx}`;

            const auraInfo = m.aura ? AURA_TYPES[m.aura] : null;
            const monClassKeySwap = getMonClassKeyForName(m.monsterBaseName);
            const monClassInfoSwap = monClassKeySwap ? MON_CLASS_TYPES[monClassKeySwap] : null;
            const auraText = (auraInfo ? auraInfo.emoji : '') + (monClassInfoSwap ? monClassInfoSwap.emoji : '');

            const equipText = m.equip
                ? `${(EQUIPMENT_DB[m.equip.equipId] || {}).icon || '⚙️'} ${getEquipmentDisplayName(m.equip)}（${getEquipmentDisplayDesc(m.equip)}）`
                : '装備なし';

            card.innerHTML = `
                <div id="${visualId}" class="flex-shrink-0 w-12 h-12 flex items-center justify-center text-2xl"></div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between">
                        <div class="text-xs font-bold text-amber-200">${m.name}</div>
                        <div class="text-[8px] text-purple-300 font-bold flex-shrink-0 ml-1">${auraText}</div>
                    </div>
                    <div class="text-[9px] text-gray-400 mt-0.5">HP${m.stats.maxLife} / ちから${m.stats.pow} / かしこさ${m.stats.int} / 命中${m.stats.hit} / 回避${m.stats.spd} / 丈夫さ${m.stats.def}</div>
                    <div class="text-[9px] text-gray-500 mt-0.5">技: ${skillNames}</div>
                    <div class="text-[9px] text-sky-300 mt-0.5 leading-relaxed">🎽 ${equipText}</div>
                </div>
            `;
            container.appendChild(card);
            const visualEl = card.querySelector(`#${CSS.escape(visualId)}`);
            renderMonsterVisual(visualEl, m.visualName || m.monsterBaseName || m.name, m.emoji, !!m.isAwakened, keyPrefix === 'mine');
        });
    };

    renderList(mineContainer, KIN_NEJIKI_STATE.playerParty, kinNejikiSwapMineIdx, (idx) => { kinNejikiSwapMineIdx = idx; renderKinNejikiSwapLists(); }, 'mine');
    renderList(theirsContainer, KIN_NEJIKI_STATE.pendingSwap.defeatedTeam, kinNejikiSwapTheirsIdx, (idx) => { kinNejikiSwapTheirsIdx = idx; renderKinNejikiSwapLists(); }, 'theirs');

    const btn = document.getElementById('kinnejiki-confirm-swap-btn');
    if (btn) btn.disabled = (kinNejikiSwapMineIdx === null || kinNejikiSwapTheirsIdx === null);
}

function confirmKinNejikiSwap() {
    if (kinNejikiSwapMineIdx === null || kinNejikiSwapTheirsIdx === null) return;
    const theirs = KIN_NEJIKI_STATE.pendingSwap.defeatedTeam[kinNejikiSwapTheirsIdx];
    const cloned = JSON.parse(JSON.stringify(theirs));
    cloned.stats.life = cloned.stats.maxLife; // 交換直後は全回復した状態で仲間になる
    cloned.ownerName = 'あなた';
    KIN_NEJIKI_STATE.playerParty[kinNejikiSwapMineIdx] = cloned;
    showToast(`【${cloned.name}】を仲間に迎え入れた！`);
    showKinNejikiSwapNextStep();
}

function skipKinNejikiSwap() {
    showKinNejikiSwapNextStep();
}

// --- 交換する/しないを決めた後、「次のバトルへ進む」か「セーブして終了する」かを選ぶ画面に切り替える ---
function showKinNejikiSwapNextStep() {
    const selectStep = document.getElementById('kinnejiki-swap-step-select');
    const nextStep = document.getElementById('kinnejiki-swap-step-next');
    if (selectStep) { selectStep.classList.add('hidden'); selectStep.style.display = 'none'; }
    if (nextStep) { nextStep.classList.remove('hidden'); nextStep.style.display = 'flex'; }
}

// --- 手持ちの全回復と、セット・バトル数カウンタの進行をまとめて行う ---
// 「次のバトルへ進む」時だけでなく、「セーブして終了する」時にもこの勝利分を必ず反映させる
// （反映せずにセーブすると、再開時に直前に勝ったバトルをもう一度戦うことになってしまうため）
function advanceKinNejikiCounters() {
    KIN_NEJIKI_STATE.playerParty.forEach(m => { m.stats.life = m.stats.maxLife; });
    KIN_NEJIKI_STATE.pendingSwap = null;

    if (KIN_NEJIKI_STATE.battleInSet >= 7) {
        KIN_NEJIKI_STATE.battleInSet = 1;
        KIN_NEJIKI_STATE.set++;
    } else {
        KIN_NEJIKI_STATE.battleInSet++;
    }
}

function proceedAfterKinNejikiSwap() {
    advanceKinNejikiCounters();
    advanceToNextKinNejikiBattle();
}

// =====================================================
// ラン終了・ランキング
// =====================================================
function kinNejikiFinishRun(cleared) {
    KIN_NEJIKI_STATE.active = false;
    clearKinNejikiSuspendSave(); // 敗北時・クリア時のいずれも一時セーブは削除する（コンティニュー用途ではないため）
    const finalWins = KIN_NEJIKI_STATE.totalWins;
    saveKinNejikiRanking(finalWins, cleared);
    renderKinNejikiResultScreen(finalWins, cleared);
    changeScreen('screen-kinnejiki-result');
}

async function saveKinNejikiRanking(wins, cleared) {
    if (typeof initFirebase !== 'function' || !initFirebase()) return;
    const pid = getMyPlayerId();
    const name = (typeof GAME_STATE !== 'undefined' && GAME_STATE.playerName) ? GAME_STATE.playerName : 'ブリーダー';
    try {
        const ref = firebaseDb.ref(`kinnejiki_ranking/${pid}`);
        const snap = await ref.once('value');
        const current = snap.val();
        const best = current ? (current.bestWins || 0) : 0;
        if (!current || wins > best) {
            await ref.set({
                name,
                bestWins: Math.max(wins, best),
                bestCleared: !!(cleared || (current && current.bestCleared)),
                updatedAt: Date.now()
            });
        }
    } catch (e) {
        console.error('[ガッツファクトリー] ランキング保存エラー:', e);
    }
}

async function fetchKinNejikiRanking(limit = 100) {
    if (typeof initFirebase !== 'function' || !initFirebase()) return [];
    try {
        const snap = await firebaseDb.ref('kinnejiki_ranking').orderByChild('bestWins').limitToLast(limit).once('value');
        const list = [];
        snap.forEach(child => list.push({ id: child.key, ...child.val() }));
        list.sort((a, b) => (b.bestWins || 0) - (a.bestWins || 0));
        return list;
    } catch (e) {
        console.error('[ガッツファクトリー] ランキング取得エラー:', e);
        return [];
    }
}

function renderKinNejikiResultScreen(wins, cleared) {
    const badge = document.getElementById('kinnejiki-result-badge');
    const title = document.getElementById('kinnejiki-result-title');
    const detail = document.getElementById('kinnejiki-result-detail');
    if (!badge || !title || !detail) return;

    if (cleared) {
        badge.textContent = '👑';
        title.textContent = 'ガッツファクトリー制覇！';
        title.className = 'text-2xl font-black text-amber-400 pixel-font';
    } else {
        badge.textContent = '🏳️';
        title.textContent = 'CHALLENGE OVER';
        title.className = 'text-2xl font-black text-gray-300 pixel-font';
    }

    const setsCleared = Math.floor(wins / 7);
    detail.innerHTML = `
        <div class="text-xs text-purple-300 font-bold border-b border-purple-800 pb-1 mb-1">挑戦結果</div>
        <div class="flex justify-between text-xs"><span class="text-gray-400">通算勝利数:</span><span class="text-white font-bold">${wins} / 49</span></div>
        <div class="flex justify-between text-xs"><span class="text-gray-400">突破セット数:</span><span class="text-white font-bold">${setsCleared} / 7</span></div>
    `;
}

async function showKinNejikiRankingScreen() {
    changeScreen('screen-kinnejiki-ranking');
    const listEl = document.getElementById('kinnejiki-ranking-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="text-center text-gray-500 text-xs py-8">読み込み中...</div>';

    if (typeof initFirebase !== 'function' || !initFirebase()) {
        listEl.innerHTML = '<div class="text-center text-gray-500 text-xs py-8 leading-relaxed">Firebase未設定のため<br>ランキングを表示できません。</div>';
        return;
    }

    const ranking = await fetchKinNejikiRanking(100);
    if (ranking.length === 0) {
        listEl.innerHTML = '<div class="text-center text-gray-500 text-xs py-8">まだ挑戦記録がありません。</div>';
        return;
    }
    const myId = getMyPlayerId();
    const rankIcons = ['\u{1F947}', '\u{1F948}', '\u{1F949}'];
    listEl.innerHTML = ranking.map((entry, i) => {
        const rankIcon = rankIcons[i] !== undefined ? rankIcons[i] : ((i + 1) + '位');
        const isMe = entry.id === myId;
        const safeName = (entry.name || 'ブリーダー').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `
            <div class="bg-[#2a1b15] border ${isMe ? 'border-amber-500' : 'border-amber-900/50'} rounded-xl p-2.5 flex items-center space-x-2">
                <div class="text-sm w-9 text-center flex-shrink-0 font-bold">${rankIcon}</div>
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold ${isMe ? 'text-amber-300' : 'text-white'} truncate">${safeName}${isMe ? '（あなた）' : ''}</div>
                </div>
                <div class="text-right flex-shrink-0">
                    <div class="text-sm font-black text-amber-400 pixel-font">${entry.bestWins || 0}勝${entry.bestCleared ? ' 👑' : ''}</div>
                </div>
            </div>
        `;
    }).join('');
}

function returnToTitleFromKinNejiki() {
    changeScreen('screen-title');
}
