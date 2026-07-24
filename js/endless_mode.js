// =====================================================
// endless_mode.js
// 「エンドレスモード」：ガッツファクトリーを一度クリアすると解禁される新コンテンツ。
// ・自由編成した4体チームから、バトルごとに3体を選んで連戦していく。
// ・ガッツファクトリーと異なり、勝利後の「レンタルモンスター交換」は無い
//   （選んだ4体をそのまま使い続け、負けるまで際限なく難易度が上がり続ける）。
// ・ランキングは無いが、現在の連勝数・自己ベストの最高連勝記録をアカウントに保存する。
// ・敵の生成・強さのスケーリングは、既存のガッツファクトリー用関数
//   （generateKinNejikiRentalMonster / generateKinNejikiOffer 等）をそのまま流用し、
//   セット数（＝バトルの周回数）を49戦（セット7＝モスト撃破）以降も上限なく増やし続けることで、
//   際限のない強さのスケーリングを実現している。
//
// 依存: database.js（MONSTER_TEMPLATES / SKILLS_DB / EQUIPMENT_DB / AURA_TYPES / KIN_NEJIKI_BOSSES等）、
//       kinnejiki.js（generateKinNejikiRentalMonster / generateKinNejikiOffer / getMoldUnlockCountForSet等）、
//       game_ranking.js（initFirebase / getMyPlayerId）、
//       masmon_battle.js（convertMasmonToBattleUnit / startMasmonBattleCommon）
// このファイルは上記より後に読み込むこと。
// =====================================================

// --- 編成中ビルダーの状態（デバッグモードのビルダーとは別に、エンドレス専用で保持する） ---
const ENDLESS_BUILDER_STATE = {
    speciesId: null,
    selectedSkills: [],
    aura: null,
    equip: null
};

// --- エンドレスモード本体の状態 ---
const ENDLESS_STATE = {
    team: [],              // 自由編成した4体（保存対象）
    bestStreak: 0,          // 自己ベストの最高連勝記録（保存対象）
    currentStreak: 0,       // 現在の連勝数（このセッション中のみ。アプリを閉じるとリセットされる）
    active: false,          // ラン進行中かどうか
    battleNumber: 1,        // 現在のバトル番号（1始まり・上限なし）
    selectedIdx: [],        // 今回のバトルに出す3体（teamの中でのインデックス）
    lastOpponentSpeciesIds: [], // 直前のバトルで出てきた敵の種族ID（次のバトルでの重複回避用）
    unlocked: false         // ガッツファクトリークリア済みでモード解禁されているか
};

// =====================================================
// 解禁判定（ガッツファクトリーの bestCleared フラグを流用）
// =====================================================
async function checkEndlessModeUnlockAndUpdateHomeButton() {
    const btn = document.getElementById('endless-mode-home-btn');
    if (!btn) return;
    try {
        const stats = (typeof fetchMyKinNejikiStats === 'function') ? await fetchMyKinNejikiStats() : null;
        ENDLESS_STATE.unlocked = !!(stats && stats.bestCleared);
    } catch (e) {
        ENDLESS_STATE.unlocked = false;
    }
    btn.classList.toggle('hidden', !ENDLESS_STATE.unlocked);
}

// =====================================================
// Firebase保存・読み込み（チーム編成・自己ベスト連勝記録）
// ランキングには公開しない専用ノード（endless_mode/{pid}）に保存する。
// =====================================================
async function saveEndlessTeamAndBest() {
    if (typeof initFirebase !== 'function' || !initFirebase()) {
        showToast('通信エラーのため保存できませんでした。');
        return;
    }
    try {
        const pid = getMyPlayerId();
        await firebaseDb.ref(`endless_mode/${pid}`).set({
            team: ENDLESS_STATE.team,
            bestStreak: ENDLESS_STATE.bestStreak,
            updatedAt: Date.now()
        });
    } catch (e) {
        console.error('[エンドレスモード] 保存エラー:', e);
        showToast('保存に失敗しました。通信状況をご確認ください。');
    }
}

// --- 自己ベスト連勝記録だけを更新する（streakValueには「更新前」に確定した連勝数を渡すこと。
//     呼び出し側でENDLESS_STATE.currentStreakをリセットした後に呼ぶと0が保存されてしまうため注意） ---
async function saveEndlessBestStreakIfNeeded(streakValue) {
    if (typeof initFirebase !== 'function' || !initFirebase()) return;
    try {
        const pid = getMyPlayerId();
        await firebaseDb.ref(`endless_mode/${pid}`).transaction(current => {
            const best = Math.max((current && current.bestStreak) || 0, streakValue || 0);
            return {
                team: (current && current.team) || ENDLESS_STATE.team,
                bestStreak: best,
                updatedAt: Date.now()
            };
        });
    } catch (e) {
        console.error('[エンドレスモード] 自己ベスト保存エラー:', e);
    }
}

// --- アカウント画面・エンドレス画面表示用に、保存済みのチーム・自己ベストを取得する ---
async function fetchMyEndlessStats() {
    if (typeof initFirebase !== 'function' || !initFirebase()) return null;
    try {
        const pid = getMyPlayerId();
        const snap = await firebaseDb.ref(`endless_mode/${pid}`).once('value');
        const val = snap.val();
        return {
            team: (val && val.team) || [],
            bestStreak: (val && val.bestStreak) || 0
        };
    } catch (e) {
        console.error('[エンドレスモード] 自己記録取得エラー:', e);
        return null;
    }
}

// =====================================================
// エンドレスモード ホーム画面（連勝記録の確認・チーム編成・挑戦開始）
// =====================================================
async function openEndlessHomeScreen() {
    changeScreen('screen-endless-home');
    const container = document.getElementById('endless-home-content');
    if (container) container.innerHTML = `<p class="text-gray-500 text-xs">読み込み中…</p>`;

    const saved = await fetchMyEndlessStats();
    if (saved) {
        ENDLESS_STATE.team = saved.team || [];
        ENDLESS_STATE.bestStreak = saved.bestStreak || 0;
    }
    renderEndlessHomeScreen();
}

function renderEndlessHomeScreen() {
    const container = document.getElementById('endless-home-content');
    if (!container) return;

    const teamCount = ENDLESS_STATE.team.length;
    const teamListHtml = teamCount > 0
        ? ENDLESS_STATE.team.map(m => {
            const auraInfo = m.aura ? AURA_TYPES[m.aura] : null;
            return `<div class="flex items-center justify-between bg-[#150b07] rounded px-2 py-1.5 text-[10px]">
                <span>${m.emoji || ''} ${m.name} ${auraInfo ? auraInfo.emoji : ''}</span>
                <span class="text-gray-400">${(m.skills || []).length}技${m.equip ? ' / 🎒装備あり' : ''}</span>
            </div>`;
        }).join('')
        : `<p class="text-gray-500 text-[10px]">まだチームが編成されていません。</p>`;

    container.innerHTML = `
        <div class="bg-[#2a1b15] border border-purple-900/50 rounded-xl p-3 space-y-2">
            <div class="grid grid-cols-2 gap-2 text-center">
                <div class="bg-[#150b07] rounded-lg p-2">
                    <p class="text-gray-400 text-[10px]">現在の連勝数</p>
                    <p class="text-xl font-black text-purple-300">${ENDLESS_STATE.currentStreak}</p>
                </div>
                <div class="bg-[#150b07] rounded-lg p-2">
                    <p class="text-gray-400 text-[10px]">自己ベスト</p>
                    <p class="text-xl font-black text-amber-300">${ENDLESS_STATE.bestStreak}</p>
                </div>
            </div>
        </div>

        <div class="bg-[#2a1b15] border border-purple-900/50 rounded-xl p-3 space-y-2 mt-3">
            <div class="text-xs font-bold text-purple-300">🐾 現在のチーム（${teamCount}/4）</div>
            <div class="space-y-1">${teamListHtml}</div>
            <button onclick="openEndlessTeamBuilderScreen()"
                class="w-full py-2 bg-purple-800 hover:bg-purple-700 text-white text-xs font-bold rounded-lg active:scale-95 transition-all">✏️ チームを編成する</button>
        </div>

        <button onclick="startEndlessChallenge()"
            class="w-full py-3.5 mt-3 bg-gradient-to-r from-purple-600 to-fuchsia-700 hover:from-purple-500 hover:to-fuchsia-600 text-white font-black rounded-xl text-md shadow-lg transform active:scale-95 transition-all pixel-font border-b-4 border-fuchsia-900 flex items-center justify-center space-x-2 ${teamCount !== 4 ? 'opacity-40 pointer-events-none' : ''}">
            <i class="fa-solid fa-infinity"></i>
            <span>挑戦開始！</span>
        </button>
        ${teamCount !== 4 ? '<p class="text-[10px] text-gray-500 text-center mt-1">4体編成すると挑戦できます</p>' : ''}
    `;
}

function returnFromEndlessHome() {
    changeScreen('screen-title');
}

// =====================================================
// チーム編成画面（種族・オーラ・装備・技を自由に指定して最大4体まで編成する）
// =====================================================
function openEndlessTeamBuilderScreen() {
    changeScreen('screen-endless-team-builder');
    renderEndlessSpeciesOptions();
    renderEndlessAuraOptions();
    renderEndlessEquipOptions();
    renderEndlessSkillCheckboxes();
    renderEndlessBuilderTeamList();
}

function returnFromEndlessTeamBuilder() {
    changeScreen('screen-endless-home');
    renderEndlessHomeScreen();
}

function renderEndlessSpeciesOptions() {
    const selectEl = document.getElementById('endless-builder-species');
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">-- 種族を選択 --</option>';
    Object.keys(MONSTER_TEMPLATES).forEach(speciesId => {
        const tmpl = MONSTER_TEMPLATES[speciesId];
        if (!tmpl) return;
        const opt = document.createElement('option');
        opt.value = speciesId;
        opt.textContent = `${tmpl.emoji || ''} ${tmpl.name}`;
        selectEl.appendChild(opt);
    });
    selectEl.value = ENDLESS_BUILDER_STATE.speciesId || '';
}

function renderEndlessAuraOptions() {
    const selectEl = document.getElementById('endless-builder-aura');
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">（オーラなし）</option>';
    Object.values(AURA_TYPES).forEach(aura => {
        const opt = document.createElement('option');
        opt.value = aura.key;
        opt.textContent = `${aura.emoji} ${aura.name}`;
        selectEl.appendChild(opt);
    });
    selectEl.value = ENDLESS_BUILDER_STATE.aura || '';
}

function onEndlessAuraChange(auraKey) {
    ENDLESS_BUILDER_STATE.aura = auraKey || null;
}

// 装備セレクトは、ステータス装備・特殊効果装備の両方から自由に選べるようにする
// （デバッグツールの装備セレクトとは異なり、こちらは「4体を自由に組む」ための本来の編成画面のため）
function renderEndlessEquipOptions() {
    const selectEl = document.getElementById('endless-builder-equip');
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">（装備なし）</option>';

    const statGroup = document.createElement('optgroup');
    statGroup.label = '── ステータス装備 ──';
    const specialGroup = document.createElement('optgroup');
    specialGroup.label = '── 特殊効果装備 ──';

    Object.values(EQUIPMENT_DB).forEach(eq => {
        const opt = document.createElement('option');
        opt.value = eq.id;
        opt.textContent = `${eq.icon || ''} ${eq.name}`;
        (eq.type === 'special' ? specialGroup : statGroup).appendChild(opt);
    });
    if (statGroup.children.length > 0) selectEl.appendChild(statGroup);
    if (specialGroup.children.length > 0) selectEl.appendChild(specialGroup);

    selectEl.value = ENDLESS_BUILDER_STATE.equip ? ENDLESS_BUILDER_STATE.equip.equipId : '';
}

function onEndlessEquipChange(equipId) {
    const base = equipId ? EQUIPMENT_DB[equipId] : null;
    ENDLESS_BUILDER_STATE.equip = base ? buildEquipmentInstanceFromBase(base) : null;
}

// 種族セレクトが変更されたら、その種族が覚えられる技の候補（全種族共通のSKILLS_DB全体ではなく、
// その種族に本来割り当てられている技プール＝KIN_NEJIKI_SKILL_POOL）をチェックボックスで表示する
function onEndlessSpeciesChange() {
    const selectEl = document.getElementById('endless-builder-species');
    const skillsWrapEl = document.getElementById('endless-builder-skills');
    if (!selectEl || !skillsWrapEl) return;

    const speciesId = selectEl.value;
    ENDLESS_BUILDER_STATE.speciesId = speciesId || null;
    ENDLESS_BUILDER_STATE.selectedSkills = [];
    skillsWrapEl.innerHTML = '';
    if (!speciesId) return;

    const pool = KIN_NEJIKI_SKILL_POOL[speciesId] || [];
    pool.forEach(skKey => {
        const sk = SKILLS_DB[skKey];
        if (!sk) return;
        const label = document.createElement('label');
        label.className = 'flex items-center gap-1 text-[9px] text-gray-300 bg-[#1a120b] rounded px-1.5 py-1 cursor-pointer border border-transparent';
        label.innerHTML = `<input type="checkbox" value="${skKey}" class="accent-purple-500"><span>${sk.name}</span>`;
        const checkboxEl = label.querySelector('input');
        checkboxEl.addEventListener('change', () => onEndlessSkillCheckboxChange(skKey, checkboxEl));
        skillsWrapEl.appendChild(label);
    });
}

// 種族を選ぶ前・選び直した後などにチェックボックス欄を再描画するための入口
function renderEndlessSkillCheckboxes() {
    const skillsWrapEl = document.getElementById('endless-builder-skills');
    if (skillsWrapEl) skillsWrapEl.innerHTML = '';
    if (ENDLESS_BUILDER_STATE.speciesId) onEndlessSpeciesChange();
}

function onEndlessSkillCheckboxChange(skKey, checkboxEl) {
    const selected = ENDLESS_BUILDER_STATE.selectedSkills;
    const idx = selected.indexOf(skKey);
    if (checkboxEl.checked) {
        if (selected.length >= 4) {
            checkboxEl.checked = false;
            showToast('技は最大4つまで選択できます。');
            return;
        }
        if (idx === -1) selected.push(skKey);
    } else if (idx !== -1) {
        selected.splice(idx, 1);
    }
}

// 現在のビルダーの内容から、バトルエンジンに渡せるモンスターオブジェクトを組み立てる
function buildEndlessMonster() {
    if (!ENDLESS_BUILDER_STATE.speciesId) {
        showToast('先に種族を選択してください。');
        return null;
    }
    if (ENDLESS_BUILDER_STATE.selectedSkills.length === 0) {
        showToast('技を1つ以上選択してください。');
        return null;
    }
    const tmpl = MONSTER_TEMPLATES[ENDLESS_BUILDER_STATE.speciesId];
    if (!tmpl) return null;

    return {
        name: tmpl.name,
        monsterBaseName: tmpl.name,
        emoji: tmpl.emoji,
        speciesId: ENDLESS_BUILDER_STATE.speciesId,
        aura: ENDLESS_BUILDER_STATE.aura || null,
        isAwakened: false,
        statusEffect: null,
        difficulty: 'endless',
        stats: { ...tmpl.stats, life: tmpl.stats.maxLife },
        skills: [...ENDLESS_BUILDER_STATE.selectedSkills],
        skillEnhancements: {},
        equip: ENDLESS_BUILDER_STATE.equip || null,
        ownerName: (typeof GAME_STATE !== 'undefined' && GAME_STATE.playerName) ? GAME_STATE.playerName : 'ブリーダー'
    };
}

function addEndlessMonsterToTeam() {
    if (ENDLESS_STATE.team.length >= 4) {
        showToast('チームは4体までです。');
        return;
    }
    const mon = buildEndlessMonster();
    if (!mon) return;
    ENDLESS_STATE.team.push(mon);
    renderEndlessBuilderTeamList();
    saveEndlessTeamAndBest();
    showToast(`${mon.name}をチームに追加しました。`);
}

function removeEndlessMonsterFromTeam(idx) {
    ENDLESS_STATE.team.splice(idx, 1);
    renderEndlessBuilderTeamList();
    saveEndlessTeamAndBest();
}

function renderEndlessBuilderTeamList() {
    const el = document.getElementById('endless-builder-team-list');
    if (!el) return;
    el.innerHTML = '';
    ENDLESS_STATE.team.forEach((m, idx) => {
        const auraInfo = m.aura ? AURA_TYPES[m.aura] : null;
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between bg-[#1a120b] rounded-lg px-2 py-1.5 text-[10px]';
        row.innerHTML = `
            <div class="min-w-0">
                <div class="font-bold text-white truncate">${m.emoji || ''} ${m.name} ${auraInfo ? auraInfo.emoji : ''}</div>
                <div class="text-gray-400 truncate">${buildSkillListWithAuraText(m.skills || [])}</div>
                <div class="text-sky-300 truncate">${m.equip ? ('🎒 ' + getEquipmentDisplayName(m.equip)) : '（装備なし）'}</div>
            </div>
            <button onclick="removeEndlessMonsterFromTeam(${idx})" class="flex-shrink-0 ml-2 text-red-400 hover:text-red-300 text-xs px-2 py-1">✕</button>
        `;
        el.appendChild(row);
    });
}

// =====================================================
// 挑戦開始・3/4体選択画面
// =====================================================
function startEndlessChallenge() {
    if (ENDLESS_STATE.team.length !== 4) {
        showToast('4体編成してから挑戦してください。');
        return;
    }
    ENDLESS_STATE.active = true;
    ENDLESS_STATE.battleNumber = 1;
    ENDLESS_STATE.currentStreak = 0;
    ENDLESS_STATE.selectedIdx = [];
    ENDLESS_STATE.lastOpponentSpeciesIds = [];
    changeScreen('screen-endless-select');
    renderEndlessSelectScreen();
}

function renderEndlessSelectScreen() {
    const container = document.getElementById('endless-select-container');
    if (!container) return;
    container.innerHTML = '';

    ENDLESS_STATE.team.forEach((m, idx) => {
        if (!m) return;
        const isSelected = ENDLESS_STATE.selectedIdx.includes(idx);
        const card = document.createElement('div');
        card.className = `bg-[#2a1b15] border rounded-xl p-2.5 cursor-pointer active:scale-[0.98] transition-all ${isSelected ? 'border-purple-400 shadow-[0_0_6px_2px_rgba(192,132,252,0.4)]' : 'border-purple-900/50'}`;

        const skillNames = buildSkillListWithAuraText(m.skills || []);
        const equipText = m.equip ? getEquipmentDisplayName(m.equip) : '未装備';
        const aura = m.aura ? AURA_TYPES[m.aura] : null;
        const monClassKey = getMonClassKeyForName(m.monsterBaseName);
        const monClassInfo = monClassKey ? MON_CLASS_TYPES[monClassKey] : null;
        const auraBadge = aura ? `<span class="ml-1 px-1 py-0.5 rounded text-[8px] font-bold text-slate-900 ${aura.colorClass}">${aura.emoji}${monClassInfo ? monClassInfo.emoji : ''}</span>` : '';

        const iconWrap = document.createElement('div');
        iconWrap.className = 'w-10 h-10 flex items-center justify-center text-2xl flex-shrink-0 bg-[#1a120b] rounded-full border border-purple-900/40 overflow-hidden';
        renderMonsterVisual(iconWrap, m.monsterBaseName, m.emoji, false, true, m.aura);

        card.innerHTML = `
            <div class="flex items-center space-x-2">
                <div class="flex-1 min-w-0">
                    <div class="text-xs font-bold text-purple-200">${m.name} ${auraBadge} ${isSelected ? '✅' : ''}</div>
                    <div class="text-[9px] text-gray-400 mt-0.5">HP${m.stats.maxLife} / ちから${m.stats.pow} / かしこさ${m.stats.int} / 命中${m.stats.hit} / 回避${m.stats.spd} / 丈夫さ${m.stats.def}</div>
                    <div class="text-[9px] text-gray-500 mt-0.5">技: ${skillNames}</div>
                    <div class="text-[9px] text-sky-300 mt-0.5">装備: ${equipText}</div>
                </div>
            </div>
        `;
        card.querySelector('.flex.items-center').prepend(iconWrap);
        container.appendChild(card);
        // タップ＝選択トグル、長押し＝詳細モーダル表示（既存のガッツファクトリー用ヘルパーをそのまま流用）
        if (typeof attachKinNejikiCardInteractions === 'function') {
            attachKinNejikiCardInteractions(card, m, () => toggleEndlessSelect(idx));
        } else {
            card.onclick = () => toggleEndlessSelect(idx);
        }
    });

    const confirmBtn = document.getElementById('endless-confirm-party-btn');
    if (confirmBtn) {
        const count = ENDLESS_STATE.selectedIdx.length;
        confirmBtn.disabled = count !== 3;
        confirmBtn.textContent = count === 3 ? 'このパーティで挑む！' : `パーティを選択中 (${count}/3)`;
        confirmBtn.classList.toggle('opacity-50', count !== 3);
    }

    const headerEl = document.getElementById('endless-select-header');
    if (headerEl) {
        headerEl.textContent = `通算${ENDLESS_STATE.battleNumber}戦目・現在${ENDLESS_STATE.currentStreak}連勝`;
    }
}

function toggleEndlessSelect(idx) {
    const pos = ENDLESS_STATE.selectedIdx.indexOf(idx);
    if (pos >= 0) {
        ENDLESS_STATE.selectedIdx.splice(pos, 1);
    } else {
        if (ENDLESS_STATE.selectedIdx.length >= 3) {
            showToast('バトルに出すのは3体までです。');
            return;
        }
        ENDLESS_STATE.selectedIdx.push(idx);
    }
    renderEndlessSelectScreen();
}

// 挑戦を中断してホームへ戻る（ラン自体は終了扱いにする。連勝数は0にリセットされる）
function abandonEndlessChallenge() {
    if (!confirm('挑戦を中断してホームに戻りますか？現在の連勝数は0にリセットされます。')) return;
    ENDLESS_STATE.active = false;
    ENDLESS_STATE.battleNumber = 1;
    ENDLESS_STATE.currentStreak = 0;
    ENDLESS_STATE.selectedIdx = [];
    ENDLESS_STATE.lastOpponentSpeciesIds = [];
    changeScreen('screen-endless-home');
    renderEndlessHomeScreen();
}

// =====================================================
// 対戦相手生成
// ・cycleNumber（＝ガッツファクトリーの「セット」に相当）は49戦（7周目）を超えても上限なく増え続ける。
// ・battleInCycle===7が7戦目＝ボス戦。1〜7周目はガッツファクトリーと全く同じ配置
//   （3周目・7周目の7戦目のみボス、他の周の7戦目はボス無し）。
// ・8周目以降は毎周7戦目が必ずボスになり、セット3型（ゴビ/ポリトカ）とセット7型（モスト）を交互に繰り返す。
// ・強さ（ステータス）はcycleNumberに比例して上限なく上昇し続ける（型解禁は7周目時点で全解禁のまま維持）。
// =====================================================
function generateEndlessOpponentTeam(battleNumber, excludeSpeciesIds) {
    const cycleNumber = Math.ceil(battleNumber / 7);
    const battleInCycle = ((battleNumber - 1) % 7) + 1;
    const isBossBattle = battleInCycle === 7 && (cycleNumber <= 7 ? (cycleNumber === 3 || cycleNumber === 7) : true);
    const excludeSpecies = excludeSpeciesIds || [];

    if (isBossBattle) {
        const bossStyle = (cycleNumber <= 7)
            ? (cycleNumber === 3 ? 'set3' : 'set7')
            : (cycleNumber % 2 === 0 ? 'set3' : 'set7');

        const bossKey = (bossStyle === 'set3')
            ? (Math.random() < 0.5 ? 'set3' : 'set3_alt')
            : 'set7';
        const bossDef = KIN_NEJIKI_BOSSES[bossKey];
        const bossHomeCycle = (bossStyle === 'set3') ? 3 : 7;
        // ボスの固定ステータス（statsBase）は本来スケールしないため、周回数に応じて独自に拡大する。
        // 初登場（3周目 or 7周目）時点で1.0倍＝従来通りの強さ、以降は周回を重ねるほど上限なく強くなる。
        const bossScale = cycleNumber / bossHomeCycle;

        const bossSkills = (bossDef.molds && bossDef.molds.length > 0)
            ? bossDef.molds[Math.floor(Math.random() * bossDef.molds.length)]
            : bossDef.skills;

        const scaledStats = {};
        Object.keys(bossDef.statsBase).forEach(key => {
            scaledStats[key] = (key === 'gutsSpeed')
                ? bossDef.statsBase[key] // ガッツ速度（行動テンポ）はスケール対象外
                : Math.max(1, Math.round(bossDef.statsBase[key] * bossScale));
        });
        scaledStats.life = scaledStats.maxLife;

        const bossUnit = {
            name: bossDef.name,
            shortName: bossDef.shortName || null,
            monsterBaseName: bossDef.templateId ? (MONSTER_TEMPLATES[bossDef.templateId] || {}).name || bossDef.name : bossDef.name,
            visualName: (bossKey === 'set3') ? 'ゴビ' : (bossKey === 'set3_alt') ? 'ポリトカ' : 'モスト',
            emoji: bossDef.emoji,
            speciesId: bossDef.templateId,
            aura: bossDef.aura || getRandomAuraKey(),
            isAwakened: false,
            statusEffect: null,
            difficulty: 'endless',
            stats: scaledStats,
            skills: [...bossSkills],
            skillEnhancements: {},
            equip: kinNejikiRollEquipmentForSet(7, [], true),
            ownerName: bossDef.title
        };
        // 帯同2体：直前バトルの敵3体の種族のみ除外する（自チームの4体との重複は問わない仕様のため除外しない）
        const escorts = generateKinNejikiOffer(cycleNumber, excludeSpecies, [], 2, true);
        escorts.forEach(m => { if (m) m.ownerName = bossDef.title; });
        return { team: [bossUnit, ...escorts.filter(Boolean)], isBoss: true, bossStyle, cycleNumber, battleInCycle };
    }

    const breederName = getKinNejikiBreederName(battleNumber);
    const team = generateKinNejikiOffer(cycleNumber, excludeSpecies, [], 3, true);
    team.forEach(m => { if (m) m.ownerName = breederName; });
    return { team, isBoss: false, bossStyle: null, cycleNumber, battleInCycle };
}

// =====================================================
// バトル起動・終了処理
// =====================================================
function confirmEndlessParty() {
    if (ENDLESS_STATE.selectedIdx.length !== 3) return;
    const chosenParty = ENDLESS_STATE.selectedIdx.map(idx => JSON.parse(JSON.stringify(ENDLESS_STATE.team[idx])));
    const gen = generateEndlessOpponentTeam(ENDLESS_STATE.battleNumber, ENDLESS_STATE.lastOpponentSpeciesIds);
    const aiLevel = kinNejikiAiLevelForSet(gen.cycleNumber);
    const floorLabel = gen.isBoss
        ? `♾️ ${gen.cycleNumber}周目・ボス戦（通算${ENDLESS_STATE.battleNumber}戦目）`
        : `♾️ ${gen.cycleNumber}周目 ${gen.battleInCycle}戦目（通算${ENDLESS_STATE.battleNumber}戦目）`;
    launchEndlessBattleEngine(chosenParty, gen.team, floorLabel, gen.isBoss, gen.bossStyle, aiLevel);
}

function launchEndlessBattleEngine(playerParty, opponentTeamRaw, floorText, isBoss, bossStyle, aiLevel) {
    MASMON_BATTLE_STATE.mode = 'cpu_team';
    MASMON_BATTLE_STATE.isDebugBattle = false;
    MASMON_BATTLE_STATE.playerTeam = playerParty.map(m => convertMasmonToBattleUnit(m, m.equip || null));
    MASMON_BATTLE_STATE.enemyTeam = opponentTeamRaw.map(m => convertMasmonToBattleUnit(m, m.equip || null));
    MASMON_BATTLE_STATE.playerMeta = [...playerParty];
    MASMON_BATTLE_STATE.enemyMeta = [...opponentTeamRaw];
    MASMON_BATTLE_STATE.playerActiveIdx = 0;
    MASMON_BATTLE_STATE.enemyActiveIdx = 0;
    // エンドレスモードもガッツファクトリー同様、対戦アイテムの持ち込みは無し
    MASMON_BATTLE_STATE.playerItems = { mango: 0, kuri: 0, toro: 0 };
    MASMON_BATTLE_STATE.playerItemsInitial = { ...MASMON_BATTLE_STATE.playerItems };
    MASMON_BATTLE_STATE.enemyItems = { mango: 0, kuri: 0, toro: 0 };
    MASMON_BATTLE_STATE.opponentOwnerName = (opponentTeamRaw[0] || {}).ownerName || '挑戦者';
    MASMON_BATTLE_STATE.playerSubstituteHits = 0;
    MASMON_BATTLE_STATE.enemySubstituteHits = 0;
    MASMON_BATTLE_STATE.playerFieldStealthRock = false;
    MASMON_BATTLE_STATE.enemyFieldStealthRock = false;
    // BGM判定専用（audio.jsのresolveBattleTrackが参照）：ボス戦かどうか・セット3型／セット7型のいずれかで
    // 通常ボス曲('boss')か最終決戦曲('finalboss')かが決まる。inRunは必ずfalseにし、
    // kinNejikiHandleBattleEnd（本編ガッツファクトリー用の勝敗処理）に誤って処理が渡らないようにする。
    MASMON_BATTLE_STATE.kinNejiki = {
        inRun: false,
        set: bossStyle === 'set7' ? 7 : 3,
        isNejiki: !!isBoss
    };
    MASMON_BATTLE_STATE.endless = {
        inRun: true,
        isBoss: !!isBoss,
        aiLevel,
        aiPersonality: pickKinNejikiAiPersonality()
    };
    startMasmonBattleCommon(floorText);
}

// --- バトル終了後の分岐（masmon_battle.js の handleMasmonBattleWin/Lose から呼ばれる） ---
async function endlessHandleBattleEnd(isWin) {
    if (!isWin) {
        await endlessFinishRun();
        return;
    }

    ENDLESS_STATE.currentStreak++;
    ENDLESS_STATE.lastOpponentSpeciesIds = (MASMON_BATTLE_STATE.enemyMeta || []).map(m => m && m.speciesId).filter(Boolean);
    ENDLESS_STATE.battleNumber++;
    ENDLESS_STATE.selectedIdx = [];
    if (ENDLESS_STATE.currentStreak > ENDLESS_STATE.bestStreak) {
        ENDLESS_STATE.bestStreak = ENDLESS_STATE.currentStreak;
        saveEndlessBestStreakIfNeeded(ENDLESS_STATE.currentStreak);
    }
    changeScreen('screen-endless-select');
    renderEndlessSelectScreen();
}

// --- 敗北時：ランを終了し、自己ベストを確定保存してホームへ戻る ---
async function endlessFinishRun() {
    const finalStreak = ENDLESS_STATE.currentStreak;
    ENDLESS_STATE.active = false;
    ENDLESS_STATE.battleNumber = 1;
    ENDLESS_STATE.currentStreak = 0;
    ENDLESS_STATE.selectedIdx = [];
    ENDLESS_STATE.lastOpponentSpeciesIds = [];
    MASMON_BATTLE_STATE.endless = null;

    if (finalStreak > ENDLESS_STATE.bestStreak) ENDLESS_STATE.bestStreak = finalStreak;
    await saveEndlessBestStreakIfNeeded(finalStreak);

    showToast(`💀 ${finalStreak}連勝でストップ！（自己ベスト：${ENDLESS_STATE.bestStreak}連勝）`);
    changeScreen('screen-endless-home');
    renderEndlessHomeScreen();
}
