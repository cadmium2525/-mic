// =====================================================
// debug_mode.js
// テスト専用の隠しデバッグモード。
// ・通常のプレイ導線（タイトル画面のボタン等）からは一切リンクしていない。
// ・画面最下部の小さなフッター文言（#secret-debug-trigger）を素早く7回タップした
//   時だけ開く「隠しコマンド」形式のため、プレイヤーが偶然開いてしまう心配はない。
// ・できること：
//    1. 自分側のテストモンスターを、種族・技構成を完全に自由に選んで編成する
//    2. 対戦相手を「コルトのゴビ」「コルトのモスト」（本編のボス）にワンタップで設定、
//       または相手側も自由に種族・技を指定して編成する
//    3. 既存の masmon_battle.js の3vs3バトルエンジンでそのまま模擬戦できる
//       （本編のガッツファクトリーの周回・ランキングには一切影響しない）
//    4. 全BGMをワンタップで試聴・停止できる
//
// 依存: database.js（MONSTER_TEMPLATES / SKILLS_DB / KIN_NEJIKI_SKILL_POOL / KIN_NEJIKI_BOSSES）、
//       game_core.js（changeScreen / showToast）、
//       masmon_battle.js（convertMasmonToBattleUnit / startMasmonBattleCommon）、
//       kinnejiki.js（generateKinNejikiOpponentTeam / pickKinNejikiAiPersonality）
// このファイルは上記より後、audio.js より前に読み込むこと。
// =====================================================

const DEBUG_UNLOCK_STORAGE_KEY = 'mfload_debug_unlocked_v1';
const DEBUG_TAP_TARGET_COUNT = 7;
const DEBUG_TAP_WINDOW_MS = 2500;

// 編成中パーティ・ビルダーの状態
const DEBUG_STATE = {
    playerTeam: [],
    opponentTeam: [],
    opponentIsBossSet: null, // ボスプリセット選択時は 3 or 7、自由編成時は null
    builder: {
        player: { speciesId: null, selectedSkills: [] },
        opponent: { speciesId: null, selectedSkills: [] }
    }
};

// ボス専用モンスター（コルトのゴビ／コルトのモスト）を種族セレクトに混ぜて選べるようにするための
// 疑似種族キー。KIN_NEJIKI_BOSSES のキー（set3/set7）と対応させる。
const DEBUG_BOSS_SPECIES_KEY_PREFIX = '__boss_';
function isDebugBossSpeciesKey(speciesKey) {
    return typeof speciesKey === 'string' && speciesKey.startsWith(DEBUG_BOSS_SPECIES_KEY_PREFIX);
}
function getDebugBossDefFromSpeciesKey(speciesKey) {
    const bossKey = speciesKey.slice(DEBUG_BOSS_SPECIES_KEY_PREFIX.length); // 'set3' or 'set7'
    return { bossKey, bossDef: KIN_NEJIKI_BOSSES[bossKey] };
}
// ボスの専用イラスト名（renderKinNejikiBreederVisual等と同じ対応関係）
const DEBUG_BOSS_VISUAL_NAME = { set3: 'ゴビ', set7: 'モスト' };


(function setupSecretDebugTrigger() {
    let tapCount = 0;
    let resetTimer = null;

    function handleTap() {
        tapCount++;
        if (resetTimer) clearTimeout(resetTimer);
        resetTimer = setTimeout(() => { tapCount = 0; }, DEBUG_TAP_WINDOW_MS);

        if (tapCount >= DEBUG_TAP_TARGET_COUNT) {
            tapCount = 0;
            clearTimeout(resetTimer);
            try { localStorage.setItem(DEBUG_UNLOCK_STORAGE_KEY, '1'); } catch (e) { /* ignore */ }
            openDebugScreen();
        }
    }

    window.addEventListener('load', () => {
        const el = document.getElementById('secret-debug-trigger');
        if (el) el.addEventListener('click', handleTap);
    });
})();

// -----------------------------------------------------
// 画面の開閉
// -----------------------------------------------------
function openDebugScreen() {
    renderDebugSpeciesOptionsInto(document.getElementById('debug-player-species'));
    renderDebugSpeciesOptionsInto(document.getElementById('debug-opponent-species'));
    renderDebugTeamLists();
    changeScreen('screen-debug');
}

function returnToTitleFromDebug() {
    changeScreen('screen-title');
}

// -----------------------------------------------------
// 種族セレクトボックスの選択肢を描画（自分側・相手側で共通）
// -----------------------------------------------------
function renderDebugSpeciesOptionsInto(selectEl) {
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

    // ガッツファクトリーの専属ボス（コルトのゴビ／コルトのモスト）も種族と同列で選べるようにする
    const bossGroup = document.createElement('optgroup');
    bossGroup.label = '── 専属ボス ──';
    Object.keys(KIN_NEJIKI_BOSSES).forEach(bossKey => {
        const bossDef = KIN_NEJIKI_BOSSES[bossKey];
        const opt = document.createElement('option');
        opt.value = DEBUG_BOSS_SPECIES_KEY_PREFIX + bossKey;
        opt.textContent = `${bossDef.emoji || ''} ${bossDef.name}（ボス）`;
        bossGroup.appendChild(opt);
    });
    selectEl.appendChild(bossGroup);
}

// 種族セレクトが変更されたら、その種族の技候補チェックボックス一覧を描画する
function onDebugSpeciesChange(side) {
    const selectEl = document.getElementById(side === 'player' ? 'debug-player-species' : 'debug-opponent-species');
    const skillsWrapEl = document.getElementById(side === 'player' ? 'debug-player-skills' : 'debug-opponent-skills');
    if (!selectEl || !skillsWrapEl) return;

    const speciesId = selectEl.value;
    DEBUG_STATE.builder[side].speciesId = speciesId || null;
    DEBUG_STATE.builder[side].selectedSkills = [];
    skillsWrapEl.innerHTML = '';
    if (!speciesId) return;

    const pool = isDebugBossSpeciesKey(speciesId)
        ? (getDebugBossDefFromSpeciesKey(speciesId).bossDef || {}).skills || []
        : (KIN_NEJIKI_SKILL_POOL[speciesId] || []);
    pool.forEach(skKey => {
        const sk = SKILLS_DB[skKey];
        if (!sk) return;
        const label = document.createElement('label');
        label.className = 'flex items-center gap-1 text-[9px] text-gray-300 bg-[#1a120b] rounded px-1.5 py-1 cursor-pointer border border-transparent';
        label.innerHTML = `<input type="checkbox" value="${skKey}" class="accent-amber-500"><span>${sk.name}</span>`;
        const checkboxEl = label.querySelector('input');
        checkboxEl.addEventListener('change', () => onDebugSkillCheckboxChange(side, skKey, checkboxEl));
        skillsWrapEl.appendChild(label);
    });
}

// 技チェックボックスの選択（最大4つまで）
function onDebugSkillCheckboxChange(side, skKey, checkboxEl) {
    const selected = DEBUG_STATE.builder[side].selectedSkills;
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

// -----------------------------------------------------
// ビルダーの現在の選択内容から、バトルエンジンに渡せるモンスターオブジェクトを組み立てる
// （generateKinNejikiRentalMonster が返すオブジェクトと同じ形にする）
// -----------------------------------------------------
function buildDebugMonster(side) {
    const builder = DEBUG_STATE.builder[side];
    if (!builder.speciesId) {
        showToast('先に種族を選択してください。');
        return null;
    }

    const ownerName = side === 'player' ? (GAME_STATE.playerName || 'ブリーダー') : 'デバッグ対戦相手';

    // --- 専属ボス（コルトのゴビ／コルトのモスト）が選択された場合 ---
    if (isDebugBossSpeciesKey(builder.speciesId)) {
        const { bossKey, bossDef } = getDebugBossDefFromSpeciesKey(builder.speciesId);
        if (!bossDef) return null;

        const skills = builder.selectedSkills.length > 0
            ? [...builder.selectedSkills]
            : (bossDef.skills || []).slice(0, 4); // 未選択時は既定4技を自動採用

        return {
            name: bossDef.name,
            monsterBaseName: bossDef.templateId ? (MONSTER_TEMPLATES[bossDef.templateId] || {}).name || bossDef.name : bossDef.name,
            visualName: DEBUG_BOSS_VISUAL_NAME[bossKey] || null,
            emoji: bossDef.emoji,
            speciesId: bossDef.templateId,
            aura: null,
            isAwakened: false,
            statusEffect: null,
            difficulty: 'debug',
            stats: { ...bossDef.statsBase, life: bossDef.statsBase.maxLife },
            skills,
            skillEnhancements: {},
            equip: null,
            ownerName
        };
    }

    // --- 通常種族の場合 ---
    const tmpl = MONSTER_TEMPLATES[builder.speciesId];
    if (!tmpl) return null;

    const skills = builder.selectedSkills.length > 0
        ? [...builder.selectedSkills]
        : (KIN_NEJIKI_SKILL_POOL[builder.speciesId] || []).slice(0, 4); // 未選択時は既定4技を自動採用

    return {
        name: tmpl.name,
        monsterBaseName: tmpl.name,
        emoji: tmpl.emoji,
        speciesId: builder.speciesId,
        aura: null,
        isAwakened: false,
        statusEffect: null,
        difficulty: 'debug',
        stats: { ...tmpl.stats, life: tmpl.stats.maxLife },
        skills,
        skillEnhancements: {},
        equip: null,
        ownerName
    };
}

function addDebugMonsterToTeam(side) {
    const team = side === 'player' ? DEBUG_STATE.playerTeam : DEBUG_STATE.opponentTeam;
    if (team.length >= 3) {
        showToast('パーティは3体までです。');
        return;
    }
    const mon = buildDebugMonster(side);
    if (!mon) return;
    team.push(mon);
    if (side === 'opponent') DEBUG_STATE.opponentIsBossSet = null; // 自由編成に切り替わったのでボス扱いを解除
    renderDebugTeamLists();
}

function removeDebugMonsterFromTeam(side, idx) {
    const team = side === 'player' ? DEBUG_STATE.playerTeam : DEBUG_STATE.opponentTeam;
    team.splice(idx, 1);
    if (side === 'opponent') DEBUG_STATE.opponentIsBossSet = null;
    renderDebugTeamLists();
}

function renderDebugTeamLists() {
    renderDebugTeamListInto('debug-player-team-list', DEBUG_STATE.playerTeam, 'player');
    renderDebugTeamListInto('debug-opponent-team-list', DEBUG_STATE.opponentTeam, 'opponent');
}

function renderDebugTeamListInto(containerId, team, side) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    if (team.length === 0) {
        el.innerHTML = '<div class="text-[9px] text-gray-500">（まだ未選出）</div>';
        return;
    }
    team.forEach((m, idx) => {
        const skillNames = (m.skills || []).map(sk => (SKILLS_DB[sk] ? SKILLS_DB[sk].name : sk)).join('、');
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between bg-[#1a120b] rounded px-2 py-1 text-[9px] gap-2';
        row.innerHTML = `
            <div class="min-w-0">
                <div class="text-amber-200 font-bold">${m.name}</div>
                <div class="text-gray-500 truncate">${skillNames}</div>
            </div>
            <button class="text-red-400 font-bold px-2 flex-shrink-0">✕</button>
        `;
        row.querySelector('button').addEventListener('click', () => removeDebugMonsterFromTeam(side, idx));
        el.appendChild(row);
    });
}

// -----------------------------------------------------
// ボスプリセット（本編と全く同じ生成ロジックを再利用：ボス本体＋帯同2体）
// -----------------------------------------------------
function setDebugOpponentToBoss(setNumber) {
    const team = generateKinNejikiOpponentTeam(setNumber, true, [], [], setNumber === 7 ? 43 : 15).filter(Boolean);
    DEBUG_STATE.opponentTeam = team;
    DEBUG_STATE.opponentIsBossSet = setNumber;
    renderDebugTeamLists();
    showToast(setNumber === 7 ? '相手を「コルトのモスト」チームに設定しました。' : '相手を「コルトのゴビ」チームに設定しました。');
}

// -----------------------------------------------------
// バトル開始（既存の masmon_battle.js エンジンをそのまま流用する）
// kinNejiki.inRun は必ず false にし、本編の周回・ランキング・タスクキル判定には
// 一切影響を与えないようにする。
// -----------------------------------------------------
function launchDebugBattle() {
    if (DEBUG_STATE.playerTeam.length === 0) {
        showToast('自分側のパーティを1体以上編成してください。');
        return;
    }
    if (DEBUG_STATE.opponentTeam.length === 0) {
        showToast('対戦相手を1体以上編成してください。');
        return;
    }

    const bossSet = DEBUG_STATE.opponentIsBossSet;
    const isBoss = !!bossSet;

    MASMON_BATTLE_STATE.mode = 'cpu_team';
    MASMON_BATTLE_STATE.playerTeam = DEBUG_STATE.playerTeam.map(m => convertMasmonToBattleUnit(m, m.equip || null));
    MASMON_BATTLE_STATE.enemyTeam = DEBUG_STATE.opponentTeam.map(m => convertMasmonToBattleUnit(m, m.equip || null));
    MASMON_BATTLE_STATE.playerMeta = [...DEBUG_STATE.playerTeam];
    MASMON_BATTLE_STATE.enemyMeta = [...DEBUG_STATE.opponentTeam];
    MASMON_BATTLE_STATE.playerActiveIdx = 0;
    MASMON_BATTLE_STATE.enemyActiveIdx = 0;
    MASMON_BATTLE_STATE.playerItems = { mango: 0, kuri: 0, toro: 0 };
    MASMON_BATTLE_STATE.playerItemsInitial = { ...MASMON_BATTLE_STATE.playerItems };
    MASMON_BATTLE_STATE.enemyItems = { mango: 0, kuri: 0, toro: 0 };
    MASMON_BATTLE_STATE.opponentOwnerName = (DEBUG_STATE.opponentTeam[0] || {}).ownerName || 'デバッグ対戦相手';
    MASMON_BATTLE_STATE.playerSubstituteHits = 0;
    MASMON_BATTLE_STATE.enemySubstituteHits = 0;
    MASMON_BATTLE_STATE.playerFieldStealthRock = false;
    MASMON_BATTLE_STATE.enemyFieldStealthRock = false;
    MASMON_BATTLE_STATE.kinNejiki = {
        inRun: false, // ← 本編の周回進行・ランキング・タスクキル判定には一切関与させない
        set: bossSet || 1,
        battleIndex: 1,
        isNejiki: isBoss, // trueにするとボス戦用BGM（boss/finalboss）が自動再生される
        aiLevel: isBoss ? (bossSet === 7 ? 4 : 3) : 2,
        aiPersonality: (typeof pickKinNejikiAiPersonality === 'function') ? pickKinNejikiAiPersonality() : 'balanced'
    };

    const floorText = isBoss
        ? (bossSet === 7 ? '🛠️ DEBUG: vs コルトのモスト' : '🛠️ DEBUG: vs コルトのゴビ')
        : '🛠️ DEBUG BATTLE';

    startMasmonBattleCommon(floorText);
}
