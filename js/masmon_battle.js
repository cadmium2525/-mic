// =====================================================
// マスモンバトル（対人マスモンデータを用いたCPU対戦）機能
// フェーズ3: 個人戦（1vs1）＋ 団体戦（3vs3）＋ 対戦アイテム3種 対応
//
// 【行動順バトルエンジン】（js/turn_order.js と連携）
//   ・プレイヤーとCPUは「同時に」行動を選択する
//     （CPUはプレイヤーの選択内容を見ずに、ターン開始時点の状況だけで行動を決める。
//       結果として同時選択と全く同じ挙動になる）
//   ・行動順は 技優先度 → 移動速度（モンスター固有ステータス） → ランダム(同値時) の順で決定する
//   ・防御は技優先度に関わらず必ず先攻する
//   ・交代／アイテム使用は選択した瞬間に即座に解決される（既存仕様のまま）
//   ・後攻側は、先攻側の行動でガッツを削られた結果、実行時にガッツ不足で行動できないことがある
//   ・防御は技一覧の中の1コマンドとして選択する
//     （被ダメージ軽減のみ。ガッツ回復量の減少ペナルティは無い）
// =====================================================

// 現在アクティブなバトルの種別を管理 ('adventure' | 'masmon')
// screen-battle の攻撃終了/防御して終了ボタンはこのフラグを見て処理を振り分ける
let ACTIVE_BATTLE_MODE = 'adventure';

// マイマスモンを使用してのバトル（CPU対戦・リアルタイム対戦共通）は
// 通常の育成バトルよりダメージを大幅に抑える（通常の1/5）
const MASMON_BATTLE_DAMAGE_MULTIPLIER = 1 / 5;

// --- 対戦アイテムデータベース ---
const MASMON_ITEM_DB = {
    mango: { name: 'カララギマンゴー', emoji: '🥭', desc: 'ライフを少し回復する（最大ライフの25%）' },
    kuri: { name: 'クーリ栗', emoji: '🌰', desc: 'クリティカル率が上昇する（+25%・3ターン持続）' },
    toro: { name: 'トロカチン', emoji: '🧪', desc: 'ちから・かしこさが上昇するが、代償として最大ライフの30%のダメージを受ける' }
};

const MASMON_BATTLE_STATE = {
    mode: null,            // 'cpu_solo' | 'cpu_team'
    playerTeam: [],        // バトル用ユニット配列（soloは1体、teamは最大3体）
    enemyTeam: [],
    playerActiveIdx: 0,
    enemyActiveIdx: 0,
    playerMeta: [],        // 表示用：自分が使用したマスモンの登録情報（playerTeamと同じ並び）
    enemyMeta: [],         // 表示用：対戦相手のマスモンの登録情報
    playerItems: { mango: 0, kuri: 0, toro: 0 },
    enemyItems: { mango: 0, kuri: 0, toro: 0 },
    isBattleEnd: false,
    isPlayerTurnActive: true,
    turn: 1,
    isDefending: false,
    usedSkillsThisTurn: {},
    // --- 行動順バトルエンジン用：両者の「今ターンの行動」を一時保持する ---
    // { actionType: 'skill'|'defend'|'item'|'switch'|'none', skKey?, itemKey?, switchIdx?, reason? }
    pendingPlayerAction: null,
    pendingEnemyAction: null,
    battleResult: null,     // 'win' | 'lose'
    opponentOwnerName: '',
    // 「みがわり餅」で設置した身代わりの残り回数。ユニット単位ではなくチーム（陣営）単位で持続する
    // （モンスターを交換しても消えない）。0なら身代わり無し。
    playerSubstituteHits: 0,
    enemySubstituteHits: 0,
    playerItemsInitial: { mango: 0, kuri: 0, toro: 0 }, // 持ち込み時点の初期所持数（UI表示用）
    // 「ガッツファクトリー」レンタルバトル進行中のみ使用する追加情報（js/kinnejiki.js が読み書きする）
    // { inRun: true, set: 1〜7, battleIndex: 1〜7, isNejiki: bool, aiLevel: 1〜4 }
    kinNejiki: null
};

// --- 現在アクティブなユニットの取得 ---
function getPlayerActive() { return MASMON_BATTLE_STATE.playerTeam[MASMON_BATTLE_STATE.playerActiveIdx]; }
function getEnemyActive() { return MASMON_BATTLE_STATE.enemyTeam[MASMON_BATTLE_STATE.enemyActiveIdx]; }

// =====================================================
// バトル演出の「間」を制御する共通ヘルパー（テンポ改善）
// 「技名表示 → 命中/エフェクト → ダメージ表示 → 追加効果表示 → 少し待機 → 次ターン」
// という一連の流れを、ポケモンシリーズのバトル演出を目安に、間を空けて順番に見せる。
// =====================================================
const BATTLE_STEP_DELAY = {
    afterSkillName: 550,  // 技名表示の後
    afterHitEffect: 550,  // HIT/MISS/クリティカルの演出の後
    afterDamage: 650,     // ダメージ数値表示の後
    perExtraLog: 550,     // 追加効果（ガッツダウン・状態異常・ドレイン等）1件ごと
    beforeNextTurn: 500   // 全ての演出が終わってから次のターンに移るまでの間
};

// steps: [{ run: () => void, wait: ms }, ...] を順番に実行し、
// 全て終わったら onComplete を呼ぶ。演出のたびに毎回 setTimeout を書かずに済むようにする。
function runBattleStepSequence(steps, onComplete) {
    let i = 0;
    function next() {
        if (MASMON_BATTLE_STATE.isBattleEnd) return; // 演出中に決着がついていたら以降は止める
        if (i >= steps.length) {
            if (onComplete) onComplete();
            return;
        }
        const step = steps[i++];
        step.run();
        setTimeout(next, step.wait);
    }
    next();
}

// --- マスモン登録データをバトル用ユニットに変換 ---
// equippedItem: PvPでこのマスモンに装備させる装備インスタンス（未装備なら null/undefined）
function convertMasmonToBattleUnit(masmonData, equippedItem) {
    const equipBonus = getEquipmentStatBonuses(equippedItem);
    const auraBonus = getEquipmentAuraStatBonuses(equippedItem, masmonData.aura || null);
    return {
        name: masmonData.name,
        monsterBaseName: masmonData.monsterBaseName || masmonData.name,
        emoji: masmonData.emoji,
        aura: masmonData.aura || null,
        isAwakened: !!masmonData.isAwakened,
        guts: 50,
        critBonusTurns: 0,
        statusEffect: masmonData.statusEffect || null,   // 育成中に得た状態変化（根性/逆上/底力/闘魂/集中）
        isGyakujoActive: false,
        isSokojikaraFired: false,
        isSokojikaraActive: false,
        isShuchuActive: false,
        weakenTurns: 0,   // わらわら等で受ける「ちから・かしこさ低下」の残ターン
        confuseTurns: 0,  // サケビ声等で受ける「混乱」の残行動回数
        forceBoost: 0,    // オーロラゲート等で得る「次の技威力アップ」倍率
        shieldValue: 0,   // 九重神眼等で得るシールド（被ダメージ吸収）の残量
        shieldUsedThisBattle: false, // 九重神眼等の「バトル中1回限り」シールド技を使用済みか
        dodgeNextGuaranteed: false, // 陽炎等で得る「次の敵攻撃を確実に回避」フラグ
        permaForceBoostActive: false, // 天河天翔等で得る「今後のダメージ永続アップ」フラグ
        equippedItem: equippedItem || null,      // 装備している装備アイテムインスタンス（PvP専用）
        equipLifesaverUsed: false,               // 装備の特殊効果（残りライフ3割で1度だけ回復等）を使用済みか
        stats: {
            maxLife: masmonData.stats.maxLife + equipBonus.maxLife + auraBonus.maxLife,
            life: masmonData.stats.maxLife + equipBonus.maxLife + auraBonus.maxLife,
            pow: masmonData.stats.pow + equipBonus.pow + auraBonus.pow,
            int: masmonData.stats.int + equipBonus.int + auraBonus.int,
            hit: masmonData.stats.hit + equipBonus.hit + auraBonus.hit,
            spd: masmonData.stats.spd + equipBonus.spd + auraBonus.spd,
            def: masmonData.stats.def + equipBonus.def + auraBonus.def,
            gutsSpeed: masmonData.stats.gutsSpeed || 14,
            // 移動速度（行動順決定用。旧セーブデータには存在しない場合があるため種族名から補完する）
            moveSpeed: getMoveSpeedForMasmon(masmonData),
            moveSpeedRank: getMoveSpeedRankForMasmon(masmonData)
        },
        skills: [...(masmonData.skills || [])],
        skillEnhancements: JSON.parse(JSON.stringify(masmonData.skillEnhancements || {})) // 技の強化データ { skKey: { forceBonus, hitBonus, level } }
    };
}

// --- 技の強化データを反映した実効ステータス（force/hitRate）を取得 ---
function getMasmonEffectiveSkill(unit, skKey) {
    const sk = SKILLS_DB[skKey];
    if (!sk) return null;
    const enh = (unit.skillEnhancements && unit.skillEnhancements[skKey]) || { forceBonus: 0, hitBonus: 0 };
    return {
        ...sk,
        force: sk.force + (enh.forceBonus || 0),
        hitRate: sk.hitRate === 100 ? 100 : Math.min(99, sk.hitRate + (enh.hitBonus || 0))
    };
}

// -----------------------------------------------------
// アイテム持ち込み数からカウントオブジェクトを作成
// itemLoadout: ['mango','mango','kuri'] のような配列（最大3つ、'none'は無視）
// リアルタイムPvP（masmon_realtime.js の buildRealtimeMyPayload）からも共通で使用する。
// -----------------------------------------------------
function buildItemCounts(itemLoadout) {
    const counts = { mango: 0, kuri: 0, toro: 0 };
    (itemLoadout || []).forEach(key => {
        if (counts.hasOwnProperty(key)) counts[key]++;
    });
    return counts;
}

// --- 個人戦・団体戦共通の初期化処理 ---
function startMasmonBattleCommon(floorText) {
    MASMON_BATTLE_STATE.isBattleEnd = false;
    MASMON_BATTLE_STATE.turn = 1;
    MASMON_BATTLE_STATE.isDefending = false;
    MASMON_BATTLE_STATE.usedSkillsThisTurn = {};
    MASMON_BATTLE_STATE.battleResult = null;

    ACTIVE_BATTLE_MODE = 'masmon';

    // PvP（リアルタイム対戦）と同じ操作仕様にするため、育成中バトル用の
    // 「攻撃終了」「防御して終了」ボタンは非表示にする（防御は技一覧に統合）
    document.getElementById('battle-endturn-controls').classList.add('hidden');

    document.getElementById('battle-floor-indicator').textContent = floorText;
    document.getElementById('battle-turn-counter').textContent = MASMON_BATTLE_STATE.turn;

    const isTeam = MASMON_BATTLE_STATE.mode === 'cpu_team';
    document.getElementById('player-team-icons').classList.toggle('hidden', !isTeam);
    document.getElementById('enemy-team-icons').classList.toggle('hidden', !isTeam);
    renderTeamIcons();

    const p = getPlayerActive();
    const e = getEnemyActive();
    const enemyOwner = MASMON_BATTLE_STATE.enemyMeta[MASMON_BATTLE_STATE.enemyActiveIdx].ownerName || '相手ブリーダー';

    document.getElementById('enemy-name').textContent = e.name;
    renderMonsterVisual(document.getElementById('battle-enemy-icon'), e.visualName || e.monsterBaseName, e.emoji, e.isAwakened);
    document.getElementById('battle-enemy-type').textContent = e.name;
    renderAuraBadge('enemy-aura-badge', e.aura, e.monsterBaseName);
    renderStatusAilmentBadge('enemy-status-badge', e);

    renderMonsterVisual(document.getElementById('battle-player-icon'), p.monsterBaseName, p.emoji, p.isAwakened, true);
    document.getElementById('battle-player-name').textContent = p.name;
    renderAuraBadge('player-aura-badge', p.aura, p.monsterBaseName);
    renderStatusAilmentBadge('player-status-badge', p);

    const initialLogEntries = [`${enemyOwner}の【${e.name}】が立ちはだかった！`];
    if (isTeam) {
        initialLogEntries.push({
            text: `団体戦スタート！お互い${MASMON_BATTLE_STATE.playerTeam.length}体 vs ${MASMON_BATTLE_STATE.enemyTeam.length}体で戦う！`,
            cls: 'text-indigo-300'
        });
    }
    initBattleLog(initialLogEntries);

    updateMasmonBattleStatsUI();
    renderMasmonBattleSkills();
    renderBattleItems();
    changeScreen('screen-battle');

    startMasmonPlayerTurn(true);
}

// -----------------------------------------------------
// 団体戦：チームアイコン表示
// -----------------------------------------------------
function renderTeamIcons() {
    if (MASMON_BATTLE_STATE.mode !== 'cpu_team') return;

    const renderSide = (containerId, team, activeIdx, isPartnerSide) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        team.forEach((unit, idx) => {
            const isFainted = unit.stats.life <= 0;
            const isActive = idx === activeIdx;
            const icon = document.createElement('div');
            icon.className = `w-8 h-8 flex items-center justify-center rounded-full text-base border-2 transition-all overflow-hidden ${
                isFainted ? 'grayscale opacity-30 border-gray-700 bg-black/40' :
                isActive ? 'border-amber-400 bg-amber-950/60 scale-110' : 'border-gray-600 bg-[#1a120b]'
            }`;
            if (isFainted) {
                icon.textContent = '💀';
            } else {
                renderMonsterVisual(icon, unit.visualName || unit.monsterBaseName, unit.emoji, unit.isAwakened, isPartnerSide);
                const statusText = getStatusAilmentBadgeText(unit);
                if (statusText) {
                    const badge = document.createElement('div');
                    badge.className = 'absolute -top-1 -right-1 text-[8px] leading-none bg-black/70 rounded px-0.5';
                    badge.textContent = statusText;
                    icon.style.position = 'relative';
                    icon.appendChild(badge);
                }
            }
            icon.title = unit.name;
            container.appendChild(icon);
        });
    };

    renderSide('player-team-icons', MASMON_BATTLE_STATE.playerTeam, MASMON_BATTLE_STATE.playerActiveIdx, true);
    renderSide('enemy-team-icons', MASMON_BATTLE_STATE.enemyTeam, MASMON_BATTLE_STATE.enemyActiveIdx, false);
}

// -----------------------------------------------------
// 戦闘不能判定＆チーム交代処理（旧仕様：自動で最初の生存マスモンに交代する）
// side: 'player' | 'enemy'
// 戻り値: true の場合はバトル終了（呼び出し元は以降の処理を中断すること）
//
// ※ 現在は「対戦アイテムの反動による自滅」「混乱の継続ダメージによる自滅」など、
//   プレイヤーの選択を挟む必要のない特殊ケースでのみ使用する。
//   通常の戦闘（技を当てて倒す・倒される）の交代処理は、下の handleFaintAndSwitch() を使うこと。
// -----------------------------------------------------
function checkFaintAndProceed(side) {
    const team = side === 'player' ? MASMON_BATTLE_STATE.playerTeam : MASMON_BATTLE_STATE.enemyTeam;
    const idx = side === 'player' ? MASMON_BATTLE_STATE.playerActiveIdx : MASMON_BATTLE_STATE.enemyActiveIdx;
    const unit = team[idx];

    if (unit.stats.life > 0) return false;

    addLog(`💥 ${unit.name} は戦闘不能になった！`);

    const nextIdx = team.findIndex(u => u.stats.life > 0);

    if (nextIdx === -1) {
        // チーム全滅 → バトル終了
        if (side === 'player') {
            handleMasmonBattleLose();
        } else {
            handleMasmonBattleWin();
        }
        return true;
    }

    if (side === 'player') {
        applyPlayerSwitch(nextIdx);
    } else {
        applyEnemySwitch(nextIdx);
    }
    return false;
}

// -----------------------------------------------------
// 戦闘不能判定＆交代処理（新仕様：通常の戦闘で使用する）
// side: 'player' | 'enemy'（今回チェックする側）
// onResolved({ battleEnded, turnShouldEnd }) を呼び出して結果を通知する（モーダル表示のため非同期になる場合がある）
//   - battleEnded: true → 勝敗が決した。呼び出し元は以降の処理を中断すること。
//   - turnShouldEnd: true → 戦闘不能による交代が発生したため、このターンはここで打ち切り、
//                    次のターンを最初からやり直す（ポケットモンスターのバトル仕様を踏襲）。
//                    呼び出し元は、残りの行動（このターンのもう片方の行動）を実行してはいけない。
//
// ① 自分（player側）のマスモンが戦闘不能になった場合 → 控えの中からどれを出すか選択させる（キャンセル不可）
// ② 相手（enemy側）のマスモンが戦闘不能になった場合 → CPUが自動で次のマスモンを繰り出した後、
//    「こちらも交代するか」を確認する。いずれの場合もターンは仕切り直しになる。
// -----------------------------------------------------
function handleFaintAndSwitch(side, onResolved) {
    const team = side === 'player' ? MASMON_BATTLE_STATE.playerTeam : MASMON_BATTLE_STATE.enemyTeam;
    const activeIdx = side === 'player' ? MASMON_BATTLE_STATE.playerActiveIdx : MASMON_BATTLE_STATE.enemyActiveIdx;
    const unit = team[activeIdx];

    if (!unit || unit.stats.life > 0) {
        onResolved({ battleEnded: false, turnShouldEnd: false });
        return;
    }

    addLog(`💥 ${unit.name} は戦闘不能になった！`);

    const candidates = team
        .map((u, idx) => ({ idx, unit: u }))
        .filter(({ idx, unit: u }) => idx !== activeIdx && u.stats.life > 0);

    if (candidates.length === 0) {
        // チーム全滅 → バトル終了
        if (side === 'player') {
            handleMasmonBattleLose();
        } else {
            handleMasmonBattleWin();
        }
        onResolved({ battleEnded: true, turnShouldEnd: false });
        return;
    }

    if (side === 'player') {
        // ① 控えの中からどれを出すか選ばせる（キャンセル不可）
        openForceSwitchModal(candidates, (chosenIdx) => {
            applyPlayerSwitch(chosenIdx);
            onResolved({ battleEnded: false, turnShouldEnd: true });
        });
    } else {
        // 相手側は自動で次のマスモンを繰り出す（既存仕様通り）
        applyEnemySwitch(candidates[0].idx);

        // ② こちらも交代するか確認する。ターンは必ず仕切り直しになる。
        const playerSwitchCandidates = getMasmonSwitchCandidates();
        if (playerSwitchCandidates.length === 0) {
            onResolved({ battleEnded: false, turnShouldEnd: true });
            return;
        }
        openPostVictorySwitchModal(playerSwitchCandidates, () => {
            onResolved({ battleEnded: false, turnShouldEnd: true });
        });
    }
}

// --- 自分側のマスモンを交代する（UI更新込み。実際の入れ替えのみを担当） ---
function applyPlayerSwitch(targetIdx) {
    const team = MASMON_BATTLE_STATE.playerTeam;
    const target = team[targetIdx];
    if (!target) return;

    MASMON_BATTLE_STATE.playerActiveIdx = targetIdx;
    MASMON_BATTLE_STATE.isDefending = false;

    addLog(`あなたは【${target.name}】を繰り出した！`);
    renderMonsterVisual(document.getElementById('battle-player-icon'), target.monsterBaseName, target.emoji, target.isAwakened, true);
    document.getElementById('battle-player-name').textContent = target.name;
    renderAuraBadge('player-aura-badge', target.aura, target.monsterBaseName);
    renderStatusAilmentBadge('player-status-badge', target);
    renderMasmonBattleSkills();

    renderTeamIcons();
    updateMasmonBattleStatsUI();
}

// --- 相手側のマスモンを交代する（UI更新込み） ---
function applyEnemySwitch(targetIdx) {
    const team = MASMON_BATTLE_STATE.enemyTeam;
    const target = team[targetIdx];
    if (!target) return;

    MASMON_BATTLE_STATE.enemyActiveIdx = targetIdx;

    const sideLabel = MASMON_BATTLE_STATE.opponentOwnerName || '相手';
    addLog(`${sideLabel}は【${target.name}】を繰り出した！`);
    document.getElementById('enemy-name').textContent = target.name;
    renderMonsterVisual(document.getElementById('battle-enemy-icon'), target.visualName || target.monsterBaseName, target.emoji, target.isAwakened);
    document.getElementById('battle-enemy-type').textContent = target.name;
    renderAuraBadge('enemy-aura-badge', target.aura, target.monsterBaseName);
    renderStatusAilmentBadge('enemy-status-badge', target);

    renderTeamIcons();
    updateMasmonBattleStatsUI();
}

// --- 交代候補ボタン用：オーラ・モン類バッジのHTMLを生成する ---
function buildSwitchCandidateBadgesHtml(unit) {
    const aura = AURA_TYPES[unit.aura];
    const monClassKey = getMonClassKeyForName(unit.monsterBaseName);
    const monClass = monClassKey ? MON_CLASS_TYPES[monClassKey] : null;

    const auraBadge = aura
        ? `<span class="px-1 py-0.5 rounded text-[8px] font-bold text-slate-900 ${aura.colorClass}">${aura.emoji}${aura.name}</span>`
        : '';
    const monClassBadge = monClass
        ? `<span class="px-1 py-0.5 rounded text-[8px] font-bold bg-slate-700 text-slate-200">${monClass.emoji}${monClass.name}</span>`
        : '';

    // 状態異常（マヒ⚡／混乱＝意味不明❔／出血🩸）は控えに戻っても引き継がれるため、
    // 交代先を選ぶ時点で分かるよう、オーラ・モン類バッジの右側に表示する
    const statusText = getStatusAilmentBadgeText(unit);
    const statusBadge = statusText
        ? `<span class="px-1 py-0.5 rounded text-[8px] font-bold bg-black/60 text-white tracking-tight">${statusText}</span>`
        : '';

    return `${auraBadge}${monClassBadge}${statusBadge}`;
}

// --- ① 強制交代モーダル（キャンセル不可：控えの中から必ず1体選ぶ） ---
function openForceSwitchModal(candidates, onSelect) {
    const modal = document.getElementById('force-switch-modal');
    const list = document.getElementById('force-switch-list');
    list.innerHTML = '';

    candidates.forEach(({ idx, unit }) => {
        const lifePct = Math.max(0, Math.floor((unit.stats.life / unit.stats.maxLife) * 100));
        const btn = document.createElement('button');
        btn.className = 'w-full text-left p-2 rounded border transition-all active:scale-95 flex flex-col gap-1 bg-emerald-950/40 border-emerald-700 text-emerald-200';
        btn.innerHTML = `
            <div class="flex justify-between items-center w-full">
                <span class="font-bold text-xs">${unit.name}</span>
                <span class="text-[9px] font-bold">HP ${unit.stats.life}/${unit.stats.maxLife} (${lifePct}%)</span>
            </div>
            <div class="flex gap-1">${buildSwitchCandidateBadgesHtml(unit)}</div>
        `;
        btn.onclick = () => {
            modal.classList.add('hidden');
            onSelect(idx);
        };
        list.appendChild(btn);
    });

    modal.classList.remove('hidden');
}

// --- ② 敵撃破後の交代確認モーダル（はい/いいえ → はいの場合は交代先選択へ） ---
function openPostVictorySwitchModal(candidates, onDone) {
    const modal = document.getElementById('post-victory-switch-modal');
    const confirmPhase = document.getElementById('post-victory-confirm-phase');
    const selectPhase = document.getElementById('post-victory-select-phase');
    const list = document.getElementById('post-victory-select-list');

    confirmPhase.classList.remove('hidden');
    selectPhase.classList.add('hidden');

    const closeAndFinish = () => {
        modal.classList.add('hidden');
        onDone();
    };

    document.getElementById('post-victory-switch-yes').onclick = () => {
        list.innerHTML = '';
        candidates.forEach(({ idx, unit }) => {
            const lifePct = Math.max(0, Math.floor((unit.stats.life / unit.stats.maxLife) * 100));
            const btn = document.createElement('button');
            btn.className = 'w-full text-left p-2 rounded border transition-all active:scale-95 flex flex-col gap-1 bg-emerald-950/40 border-emerald-700 text-emerald-200';
            btn.innerHTML = `
                <div class="flex justify-between items-center w-full">
                    <span class="font-bold text-xs">${unit.name}</span>
                    <span class="text-[9px] font-bold">HP ${unit.stats.life}/${unit.stats.maxLife} (${lifePct}%)</span>
                </div>
                <div class="flex gap-1">${buildSwitchCandidateBadgesHtml(unit)}</div>
            `;
            btn.onclick = () => {
                applyPlayerSwitch(idx);
                closeAndFinish();
            };
            list.appendChild(btn);
        });
        confirmPhase.classList.add('hidden');
        selectPhase.classList.remove('hidden');
    };

    document.getElementById('post-victory-switch-no').onclick = () => {
        closeAndFinish();
    };

    document.getElementById('post-victory-select-back').onclick = () => {
        confirmPhase.classList.remove('hidden');
        selectPhase.classList.add('hidden');
    };

    modal.classList.remove('hidden');
}

// -----------------------------------------------------
// バトル進行（行動順バトルエンジン）
//
// 新仕様のターンの流れ：
//   1. ターン開始処理（両者同時にガッツ回復・状態異常ティック）
//   2. プレイヤーが行動を選択 → submitMasmonPlayerAction()
//   3. その時点でCPUも「ターン開始時点の状況」だけを見て行動を決定する
//      （プレイヤーの選択内容そのものは見ないため、実質的に同時選択と同じ結果になる）
//   4. TurnOrderResolver で行動順（優先度→速度→ランダム）を決定
//   5. 先攻の行動を実行 → 後攻の行動を実行（実行直前にガッツを再チェック）
//   6. ターン終了 → 1へ戻る
// -----------------------------------------------------
function startMasmonPlayerTurn(isFirstTurn = false) {
    hideBattleLog();
    MASMON_BATTLE_STATE.isPlayerTurnActive = true;
    MASMON_BATTLE_STATE.usedSkillsThisTurn = {};
    MASMON_BATTLE_STATE.pendingPlayerAction = null;
    MASMON_BATTLE_STATE.pendingEnemyAction = null;

    document.getElementById('player-defense-shield').classList.add('hidden');

    const p = getPlayerActive();
    const e = getEnemyActive();

    if (p.critBonusTurns > 0) {
        p.critBonusTurns--;
        if (p.critBonusTurns === 0) addLog(`${p.name} のクリティカル率上昇効果が切れた。`);
    }
    if (e && e.critBonusTurns > 0) {
        e.critBonusTurns--;
    }

    if (!isFirstTurn) {
        // --- ターン開始時点で、両者同時にガッツが回復する ---
        let recovery = 30;
        if (p.isGyakujoActive) {
            recovery = Math.floor(recovery * 1.2);
        }
        if (p.statusEffect === "闘魂" && e && e.guts > 70) {
            recovery = Math.floor(recovery * 1.5);
        }
        recovery += getEquipmentGutsRecoveryBonus(p);
        if (p.gutsRecoveryDownNext > 0) {
            recovery = Math.max(0, recovery - p.gutsRecoveryDownNext);
            p.gutsRecoveryDownNext = 0;
        }
        addLog(`--- ターン ${MASMON_BATTLE_STATE.turn} ---`);
        p.guts = Math.min(100, p.guts + recovery);
        addLog(`${p.name} のガッツが ${recovery} 回復した！(現在: ${Math.floor(p.guts)})`);

        if (e) {
            let enemyRecovery = 30;
            if (e.isGyakujoActive) {
                enemyRecovery = Math.floor(enemyRecovery * 1.2);
            }
            if (e.statusEffect === "闘魂" && p.guts > 70) {
                enemyRecovery = Math.floor(enemyRecovery * 1.5);
            }
            enemyRecovery += getEquipmentGutsRecoveryBonus(e);
            if (e.gutsRecoveryDownNext > 0) {
                enemyRecovery = Math.max(0, enemyRecovery - e.gutsRecoveryDownNext);
                e.gutsRecoveryDownNext = 0;
            }
            e.guts = Math.min(100, e.guts + enemyRecovery);
            addLog(`${e.name} のガッツが ${enemyRecovery} 回復した！(現在: ${Math.floor(e.guts)})`);
        }
        showEffect('⚔️ TURN START ⚔️');
    } else {
        addLog(`--- バトル開始 (初期GUTS: 50) ---`);
    }

    MASMON_BATTLE_STATE.isDefending = false;
    updateMasmonBattleStatsUI();

    // マヒ／混乱（意味不明）／出血の残ターン消化と行動失敗判定（プレイヤー側）
    const confusionResult = tickStatusTurnsAndCheckConfusion(p);
    if (confusionResult.dotDamage > 0) {
        p.stats.life = Math.max(0, p.stats.life - confusionResult.dotDamage);
        addLog(`🩸 ${p.name} は出血ダメージで ${confusionResult.dotDamage} のダメージを受けた！(現在: ${Math.floor(p.stats.life)})`);
        updateMasmonBattleStatsUI();
        handleFaintAndSwitch('player', (result) => {
            if (result.battleEnded) return;
            finishMasmonPlayerTurnSetup(confusionResult);
        });
        return;
    }

    finishMasmonPlayerTurnSetup(confusionResult);
}

// --- startMasmonPlayerTurn() の後半部分（自分の戦闘不能チェック後に必ず通る処理） ---
function finishMasmonPlayerTurnSetup(confusionResult) {
    if (confusionResult.confused) {
        // マヒ／意味不明／怯み中は技を選択できないため、「行動不能」の行動として即座に確定させる
        toggleMasmonSkillButtons(false);
        submitMasmonPlayerAction({ actionType: 'none', reason: confusionResult.failReason });
        return;
    }

    toggleMasmonSkillButtons(true);
    renderBattleItems();
}

function toggleMasmonSkillButtons(enable) {
    const container = document.getElementById('battle-skills-container');
    const p = getPlayerActive();
    const gutsVal = Math.floor(p.guts);
    const skillBtnPrefix = 'skill-btn-';

    container.querySelectorAll('button').forEach(btn => {
        if (!enable) {
            btn.classList.add('opacity-40', 'pointer-events-none');
            return;
        }
        // 有効化する場合でも、ガッツが足りない技ボタンは無効のままにする
        // （そうしないと「ガッツ不足で使えない技」がターン開始時に強制的に光ったままになってしまうため）
        if (btn.id && btn.id.startsWith(skillBtnPrefix)) {
            const skKey = btn.id.slice(skillBtnPrefix.length);
            const sk = SKILLS_DB[skKey];
            if (sk && gutsVal < sk.cost) {
                btn.classList.add('opacity-40', 'pointer-events-none');
                return;
            }
        }
        btn.classList.remove('pointer-events-none', 'opacity-40');
    });
    const itemContainer = document.getElementById('battle-items-container');
    itemContainer.querySelectorAll('button').forEach(btn => {
        if (enable) {
            if (!btn.dataset.depleted) btn.classList.remove('pointer-events-none', 'opacity-40');
        } else {
            btn.classList.add('opacity-40', 'pointer-events-none');
        }
    });
}

function checkAndActivateShuchu(unit) {
    if (unit && unit.statusEffect === "集中" && unit.guts > 90 && !unit.isShuchuActive) {
        unit.isShuchuActive = true;
        addLog(`🎯 ${unit.name} に集中が発動！次の技の命中率 1.5 倍、ダメージが 1.2 倍に上昇！`);
    }
}

// --- ダメージを受けた側の「根性」「底力」発動判定 ---
function checkMasmonDefenseStatusTriggers(defender) {
    const isPlayerSide = defender === getPlayerActive();
    const displayElId = isPlayerSide ? 'player-status-effect-display' : 'enemy-status-effect-display';
    if (defender.stats.life === 0 && defender.statusEffect === "根性") {
        if (Math.random() < 0.50) {
            defender.stats.life = 1;
            addLog(`✨ 根性が発動！ ${defender.name} は力尽きず、ライフ 1 で耐え抜いた！`);
            triggerMasmonTemporaryStatusEffect("根性", displayElId);
        }
    }
    if (defender.statusEffect === "底力" && !defender.isSokojikaraFired) {
        if (defender.stats.life > 0 && defender.stats.life < defender.stats.maxLife * 0.3) {
            defender.isSokojikaraFired = true;
            defender.isSokojikaraActive = true;
            addLog(`💪 底力が発動！窮地に陥ったことで、次の技のダメージが 1.5 倍に上昇！`);
            updateMasmonStatusEffectUI();
        }
    }
}

// --- ガッツを奪われた側の「逆上」発動判定 ---
function checkMasmonGyakujoTrigger(defender) {
    if (defender.statusEffect === "逆上" && !defender.isGyakujoActive) {
        if (Math.random() < 0.65) {
            defender.isGyakujoActive = true;
            addLog(`💢 逆上が発動！ ${defender.name} の怒りが頂点に達し、ガッツ回復速度と与えるガッツダウン量が 1.2 倍に上昇！`);
            updateMasmonStatusEffectUI();
        }
    }
}

// -----------------------------------------------------
// 状態変化表示UI（育成中のバトルと同じ見た目・仕様で表示する）
// 味方（player-status-effect-display）・相手（enemy-status-effect-display）の
// 両方について、それぞれの状態変化を表示する。
// -----------------------------------------------------
function updateMasmonStatusEffectUI() {
    const p = getPlayerActive();
    const e = getEnemyActive();
    if (!p || !e) return;

    const renderSide = (elId, unit, opponent) => {
        const el = document.getElementById(elId);
        if (!el) return;

        let showText = "";
        if (unit.isGyakujoActive) {
            showText = "逆上";
        } else if (unit.isSokojikaraActive) {
            showText = "底力";
        } else if (unit.statusEffect === "闘魂" && opponent && opponent.guts > 70) {
            showText = "闘魂";
        } else if (unit.isShuchuActive) {
            showText = "集中";
        }

        if (showText) {
            el.textContent = showText;
            el.classList.remove('hidden');
        } else {
            if (!el.dataset.temporaryActive) {
                el.classList.add('hidden');
            }
        }
    };

    renderSide('player-status-effect-display', p, e);
    renderSide('enemy-status-effect-display', e, p);
}

// 根性などの一時的な状態変化の点滅表示（育成中のバトルと同じ演出）
// elId: 表示先要素（味方='player-status-effect-display' / 相手='enemy-status-effect-display'）
function triggerMasmonTemporaryStatusEffect(effectName, elId = 'player-status-effect-display') {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = effectName;
    el.classList.remove('hidden');
    el.dataset.temporaryActive = "true";
    setTimeout(() => {
        delete el.dataset.temporaryActive;
        updateMasmonStatusEffectUI();
    }, 2500);
}

function updateMasmonBattleStatsUI() {
    const p = getPlayerActive();
    const e = getEnemyActive();

    // マヒ／混乱／出血は技命中時やターン経過時にいつでも変化しうるため、
    // 交代のタイミングだけでなく、ステータス更新のたびに毎回バッジを再描画する
    // （こうしないと、実際には状態異常になっていても名前横のバッジに反映されないままになる）
    renderStatusAilmentBadge('player-status-badge', p);
    renderStatusAilmentBadge('enemy-status-badge', e);

    checkAndActivateShuchu(p);
    checkAndActivateShuchu(e);

    document.getElementById('player-hp-text').textContent = `${p.stats.life}/${p.stats.maxLife}`;
    document.getElementById('player-hp-bar').style.width = `${(p.stats.life / p.stats.maxLife) * 100}%`;

    document.getElementById('enemy-hp-text').textContent = `HP: ${e.stats.life}/${e.stats.maxLife}`;
    document.getElementById('enemy-hp-bar').style.width = `${(e.stats.life / e.stats.maxLife) * 100}%`;

    document.getElementById('enemy-guts-text').textContent = Math.floor(e.guts);
    document.getElementById('enemy-guts-bar').style.width = `${e.guts}%`;

    const gutsVal = Math.floor(p.guts);
    document.getElementById('guts-number').textContent = gutsVal;
    document.getElementById('guts-progress-bar').style.width = `${gutsVal}%`;

    p.skills.forEach(skKey => {
        const btn = document.getElementById(`skill-btn-${skKey}`);
        if (!btn) return;
        const sk = SKILLS_DB[skKey];
        if (!sk) return;
        if (!MASMON_BATTLE_STATE.isPlayerTurnActive || gutsVal < sk.cost) {
            btn.classList.add('opacity-40', 'pointer-events-none');
        } else {
            btn.classList.remove('opacity-40', 'pointer-events-none');
        }
        const hitSpan = btn.querySelector('.hit-rate-text');
        if (hitSpan && sk.type !== 'heal' && !sk.type.startsWith('buff')) {
            const effSk = getMasmonEffectiveSkill(p, skKey);
            if (effSk.hitRate === 100) {
                hitSpan.textContent = `命中:必中`;
            } else {
                const mods = getGutsModifiers(gutsVal);
                let actualHit = Math.max(10, Math.min(99, (effSk.hitRate + mods.hitMod) + (p.stats.hit - e.stats.spd) * 0.5));
                if (p.isShuchuActive) actualHit = Math.min(99, actualHit * 1.5);
                hitSpan.textContent = `命中:${Math.round(actualHit)}%`;
            }
        }
    });

    const baseGutsRecovery = 30 + getEquipmentGutsRecoveryBonus(p);
    document.getElementById('turn-guts-notice').textContent = `💡 あなたのガッツ回復力: +${baseGutsRecovery} / ターン`;

    updateMasmonStatusEffectUI();

    renderTeamIcons();
}

function renderMasmonBattleSkills() {
    const container = document.getElementById('battle-skills-container');
    container.innerHTML = '';

    const p = getPlayerActive();
    const e = getEnemyActive();
    const gutsValForHit = Math.floor(p.guts);
    const gutsModsForHit = getGutsModifiers(gutsValForHit);
    p.skills.forEach(skKey => {
        const sk = getMasmonEffectiveSkill(p, skKey);
        if (!sk) return;
        const btn = document.createElement('button');
        btn.id = `skill-btn-${skKey}`;

        const style = getSkillStyle(sk);
        const rank = getDamageRank(sk.force, sk.type);
        let rankColor = 'text-gray-400';
        if (rank === 'S') rankColor = 'text-red-600 font-extrabold';
        else if (rank === 'A') rankColor = 'text-orange-500 font-bold';
        else if (rank === 'B') rankColor = 'text-yellow-600 font-bold';
        else if (rank === 'C') rankColor = 'text-green-600 font-bold';
        else if (rank === 'D') rankColor = 'text-cyan-600';
        else if (rank === 'E') rankColor = 'text-blue-500';
        else if (rank === 'F') rankColor = 'text-purple-500';

        // 技強化状態の判定（マスモン登録時に保存された強化データを反映。育成中のバトルと同じ表記にする）
        const enh = p.skillEnhancements && p.skillEnhancements[skKey];
        const isEnhanced = enh && enh.level > 0;
        const enhBorderClass = isEnhanced ? 'border-purple-400 shadow-[0_0_6px_2px_rgba(168,85,247,0.4)]' : style.borderClass;
        const enhBgClass = isEnhanced ? 'bg-[#1e0f3a] hover:bg-[#2a1558]' : style.bgClass;

        btn.className = `text-left p-2 rounded border transition-all active:scale-95 flex flex-col justify-between ${enhBgClass} ${enhBorderClass} ${style.textClass}`;
        btn.onclick = () => executeMasmonPlayerSkill(skKey);

        // 技の長押し／右クリックで詳細モーダルを表示（育成中のバトルと同じ操作）
        let longPressTimer;
        btn.ontouchstart = () => {
            longPressTimer = setTimeout(() => {
                openMasmonSkillModal(skKey);
            }, 500);
        };
        btn.ontouchend = () => clearTimeout(longPressTimer);
        btn.onmousedown = (ev) => {
            if (ev.button === 2) {
                openMasmonSkillModal(skKey);
            } else {
                longPressTimer = setTimeout(() => {
                    openMasmonSkillModal(skKey);
                }, 500);
            }
        };
        btn.onmouseup = () => clearTimeout(longPressTimer);
        btn.oncontextmenu = (ev) => ev.preventDefault();

        let typeIcon = '💥';
        if (sk.type === 'int') typeIcon = '🔮';
        if (sk.type.startsWith('buff')) typeIcon = '⭐';
        if (sk.type === 'heal') typeIcon = '💖';
        if (sk.type === 'substitute') typeIcon = '🌸';

        const enhBadge = isEnhanced
            ? `<span class="text-[8px] bg-purple-900 text-purple-200 px-1 py-0.5 rounded font-bold ml-1">⚔️Lv.${enh.level}</span>`
            : '';

        let hitRateDisplay;
        if (sk.type === 'heal' || sk.type.startsWith('buff')) {
            hitRateDisplay = `<span class="text-emerald-700 text-[9px] font-bold">必中</span>`;
        } else if (sk.hitRate === 100) {
            hitRateDisplay = `<span class="${style.textIntensity} text-[9px] font-bold font-mono hit-rate-text">命中:必中</span>`;
        } else {
            let actualHitForIcon = Math.max(10, Math.min(99, (sk.hitRate + gutsModsForHit.hitMod) + (p.stats.hit - e.stats.spd) * 0.5));
            if (p.isShuchuActive) actualHitForIcon = Math.min(99, actualHitForIcon * 1.5);
            hitRateDisplay = `<span class="${style.textIntensity} text-[9px] font-bold font-mono hit-rate-text">命中:${Math.round(actualHitForIcon)}%</span>`;
        }

        btn.innerHTML = `
            <div class="flex justify-between items-center w-full">
                <span class="font-bold text-xs">${sk.name} ${typeIcon}${enhBadge} <span class="ml-1 text-[10px] ${rankColor} bg-[#1a120b]/10 px-1 py-0.2 rounded">ランク:${rank}</span></span>
                <span class="text-[9px] font-bold">G:${sk.cost}</span>
            </div>
            <div class="flex justify-between items-center mt-0.5 w-full">
                <div class="text-[8px] opacity-85 line-clamp-1 flex-1">GUTS-DOWN:${sk.gutsDown || 0}</div>
                <div class="ml-1 shrink-0">${hitRateDisplay}</div>
            </div>
        `;
        container.appendChild(btn);
    });

    // --- 防御コマンド（技一覧に統合。被ダメ軽減のみ、ガッツ回復量の減は無し＝PvP仕様） ---
    const defendBtn = document.createElement('button');
    defendBtn.className = `text-left p-2 rounded border transition-all active:scale-95 flex flex-col justify-between bg-blue-950/40 border-blue-700 text-blue-200`;
    defendBtn.onclick = () => executeMasmonDefend();
    defendBtn.innerHTML = `
        <div class="flex justify-between items-center w-full">
            <span class="font-bold text-xs">🛡️ 防御 <span class="ml-1 text-[10px] text-blue-300 bg-[#1a120b]/10 px-1 py-0.2 rounded">被ダメ半減</span></span>
            <span class="text-[9px] font-bold">G:0</span>
        </div>
        <div class="flex justify-between items-center mt-0.5 w-full">
            <div class="text-[8px] opacity-85 line-clamp-1 flex-1">次の相手の攻撃ダメージを半減（ガッツ回復ペナルティ無し）</div>
        </div>
    `;
    container.appendChild(defendBtn);

    // --- 交代コマンド（団体戦のみ。ライフが残っている控えのマスモンと入れ替える。1ターン消費） ---
    const switchCandidates = getMasmonSwitchCandidates();
    if (switchCandidates.length > 0) {
        const switchBtn = document.createElement('button');
        switchBtn.className = `text-left p-2 rounded border transition-all active:scale-95 flex flex-col justify-between bg-emerald-950/40 border-emerald-700 text-emerald-200`;
        switchBtn.onclick = () => openMasmonSwitchMenu();
        switchBtn.innerHTML = `
            <div class="flex justify-between items-center w-full">
                <span class="font-bold text-xs">🔄 交代 <span class="ml-1 text-[10px] text-emerald-300 bg-[#1a120b]/10 px-1 py-0.2 rounded">1ターン消費</span></span>
                <span class="text-[9px] font-bold">G:0</span>
            </div>
            <div class="flex justify-between items-center mt-0.5 w-full">
                <div class="text-[8px] opacity-85 line-clamp-1 flex-1">控えのマスモンと交代する（ライフが残っている仲間のみ）</div>
            </div>
        `;
        container.appendChild(switchBtn);
    }
}

// --- 交代候補（団体戦・現在の場に出ていない、ライフが残っている控えのマスモン）の取得 ---
function getMasmonSwitchCandidates() {
    if (MASMON_BATTLE_STATE.mode !== 'cpu_team') return [];
    return MASMON_BATTLE_STATE.playerTeam
        .map((unit, idx) => ({ idx, unit }))
        .filter(({ idx, unit }) => idx !== MASMON_BATTLE_STATE.playerActiveIdx && unit.stats.life > 0);
}

// --- 交代先選択メニューを技一覧エリアに一時的に表示する ---
function openMasmonSwitchMenu() {
    if (MASMON_BATTLE_STATE.isBattleEnd || !MASMON_BATTLE_STATE.isPlayerTurnActive) return;
    const candidates = getMasmonSwitchCandidates();
    if (candidates.length === 0) return;

    const container = document.getElementById('battle-skills-container');
    container.innerHTML = '';

    candidates.forEach(({ idx, unit }) => {
        const lifePct = Math.max(0, Math.floor((unit.stats.life / unit.stats.maxLife) * 100));
        const btn = document.createElement('button');
        btn.className = `text-left p-2 rounded border transition-all active:scale-95 flex flex-col justify-between bg-emerald-950/40 border-emerald-700 text-emerald-200`;
        btn.onclick = () => executeMasmonSwitch(idx);
        btn.innerHTML = `
            <div class="flex justify-between items-center w-full">
                <span class="font-bold text-xs">${unit.name}</span>
                <span class="text-[9px] font-bold">HP ${unit.stats.life}/${unit.stats.maxLife} (${lifePct}%)</span>
            </div>
            <div class="flex gap-1 mt-1">${buildSwitchCandidateBadgesHtml(unit)}</div>
        `;
        container.appendChild(btn);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = `text-left p-2 rounded border transition-all active:scale-95 flex items-center justify-center bg-[#1a120b] border-gray-600 text-gray-300 col-span-2`;
    cancelBtn.onclick = () => renderMasmonBattleSkills();
    cancelBtn.innerHTML = `<span class="font-bold text-xs">↩️ もどる</span>`;
    container.appendChild(cancelBtn);
}

// --- 交代実行（1ターン消費。ライフが残っている控えのマスモンと入れ替えて相手ターンへ移る） ---
function executeMasmonSwitch(targetIdx) {
    if (MASMON_BATTLE_STATE.isBattleEnd || !MASMON_BATTLE_STATE.isPlayerTurnActive) return;
    const team = MASMON_BATTLE_STATE.playerTeam;
    const target = team[targetIdx];
    if (!target || target.stats.life <= 0 || targetIdx === MASMON_BATTLE_STATE.playerActiveIdx) return;

    beginActionLog();

    const prev = getPlayerActive();
    clearBattleStatModifiersOnSwitch(prev);
    MASMON_BATTLE_STATE.playerActiveIdx = targetIdx;
    MASMON_BATTLE_STATE.isDefending = false;

    addLog(`${prev.name} を引っ込め、【${target.name}】を繰り出した！`);
    showEffect('🔄 交代！ 🔄');

    renderMonsterVisual(document.getElementById('battle-player-icon'), target.monsterBaseName, target.emoji, target.isAwakened, true);
    document.getElementById('battle-player-name').textContent = target.name;
    renderAuraBadge('player-aura-badge', target.aura, target.monsterBaseName);
    renderStatusAilmentBadge('player-status-badge', target);
    renderTeamIcons();
    updateMasmonBattleStatsUI();
    renderMasmonBattleSkills();

    // 交代は行動順に関わらず必ず先に処理される（既存仕様のまま）。
    // 交代自体はここで既に完了しているので、行動順エンジンには「済み」の行動として渡す。
    submitMasmonPlayerAction({ actionType: 'switch', alreadyResolved: true });
}

// -----------------------------------------------------
// 技詳細モーダル（マスモンバトル用：育成中のバトルと同じ見た目のモーダルを、
// マスモンバトルの現在のユニット／強化データに合わせて表示する）
// -----------------------------------------------------
function openMasmonSkillModal(skKey) {
    const p = getPlayerActive();
    const e = getEnemyActive();
    if (!p) return;
    const sk = getMasmonEffectiveSkill(p, skKey);
    if (!sk) return;

    const currentGuts = Math.floor(p.guts);
    const mods = getGutsModifiers(currentGuts);

    document.getElementById('modal-skill-name').textContent = sk.name;
    document.getElementById('modal-skill-cost').textContent = sk.cost;
    document.getElementById('modal-skill-rank').textContent = getDamageRank(sk.force, sk.type);
    document.getElementById('modal-skill-gutsdown').textContent = sk.gutsDown || 0;
    document.getElementById('modal-skill-desc').textContent = sk.desc || "説明はありません。";
    document.getElementById('modal-current-guts').textContent = currentGuts;

    if (sk.type === 'heal' || sk.type.startsWith('buff') || sk.type === 'substitute') {
        document.getElementById('modal-guts-dmg-scale').textContent = "なし (補助)";
        document.getElementById('modal-guts-hit-rate').textContent = "必中";
    } else {
        document.getElementById('modal-guts-dmg-scale').textContent = mods.dmgMod.toFixed(2) + "倍";

        if (sk.hitRate === 100) {
            document.getElementById('modal-guts-hit-rate').textContent = "必中 🎯";
        } else if (e) {
            let actualHit = Math.max(10, Math.min(99, (sk.hitRate + mods.hitMod) + (p.stats.hit - e.stats.spd) * 0.5));
            if (p.isShuchuActive) actualHit = Math.min(99, actualHit * 1.5);
            document.getElementById('modal-guts-hit-rate').textContent = Math.round(actualHit) + "%";
        } else {
            const actualHit = Math.max(10, Math.min(99, sk.hitRate + mods.hitMod));
            document.getElementById('modal-guts-hit-rate').textContent = Math.round(actualHit) + "%";
        }
    }

    let typeStr = "ちから技";
    if (sk.type === 'int') typeStr = "かしこさ技";
    if (sk.type === 'heal') typeStr = "回復技";
    if (sk.type.startsWith('buff')) typeStr = "補助技";
    if (sk.type === 'substitute') typeStr = "身代わり技";
    document.getElementById('modal-skill-type').textContent = typeStr;

    document.getElementById('skill-modal').classList.remove('hidden');
}

// -----------------------------------------------------
// 対戦アイテムバー表示
// -----------------------------------------------------
function renderBattleItems() {
    const container = document.getElementById('battle-items-container');
    const counts = MASMON_BATTLE_STATE.playerItems || { mango: 0, kuri: 0, toro: 0 };
    const initial = MASMON_BATTLE_STATE.playerItemsInitial || { mango: 0, kuri: 0, toro: 0 };
    const broughtKeys = Object.keys(MASMON_ITEM_DB).filter(key => (initial[key] || 0) > 0);

    container.innerHTML = '';
    container.classList.toggle('hidden', broughtKeys.length === 0);
    if (broughtKeys.length === 0) return;

    broughtKeys.forEach(key => {
        const item = MASMON_ITEM_DB[key];
        const remaining = counts[key] || 0;
        const btn = document.createElement('button');
        btn.className = 'p-1.5 rounded border text-[9px] font-bold flex flex-col items-center bg-emerald-950/40 border-emerald-800 text-emerald-200 transition-all active:scale-95';
        btn.title = item.desc;
        btn.innerHTML = `<span class="text-base leading-none">${item.emoji}</span><span class="mt-0.5 leading-tight">${item.name}</span><span class="text-emerald-400">×${remaining}</span>`;
        if (remaining <= 0 || !MASMON_BATTLE_STATE.isPlayerTurnActive) {
            btn.classList.add('opacity-40', 'pointer-events-none');
            btn.dataset.depleted = remaining <= 0 ? '1' : '';
        }
        btn.onclick = () => useMasmonItem(key);
        container.appendChild(btn);
    });
}

function useMasmonItem(itemKey) {
    if (MASMON_BATTLE_STATE.isBattleEnd || !MASMON_BATTLE_STATE.isPlayerTurnActive) return;
    const counts = MASMON_BATTLE_STATE.playerItems;
    if (!counts || !counts[itemKey] || counts[itemKey] <= 0) return;

    beginActionLog();

    counts[itemKey]--;
    const p = getPlayerActive();
    const item = MASMON_ITEM_DB[itemKey];

    if (itemKey === 'mango') {
        const heal = Math.floor(p.stats.maxLife * 0.25);
        p.stats.life = Math.min(p.stats.maxLife, p.stats.life + heal);
        addLog(`🥭 ${p.name} は【${item.name}】を使った！ライフが ${heal} 回復した！`);
        showEffect('🥭 回復! 🥭');
    } else if (itemKey === 'kuri') {
        p.critBonusTurns = 3;
        addLog(`🌰 ${p.name} は【${item.name}】を使った！3ターンの間クリティカル率が上昇する！`);
        showEffect('🌰 会心UP! 🌰');
    } else if (itemKey === 'toro') {
        p.stats.pow += 20;
        p.stats.int += 20;
        const selfDmg = Math.floor(p.stats.maxLife * 0.3);
        p.stats.life = Math.max(0, p.stats.life - selfDmg);
        addLog(`🧪 ${p.name} は【${item.name}】を使った！ちから・かしこさが上昇したが、反動で ${selfDmg} のダメージを受けた！`);
        showEffect('🧪 パワーUP! 🧪');
    }

    updateMasmonBattleStatsUI();
    renderBattleItems();

    if (itemKey === 'toro') {
        handleFaintAndSwitch('player', (result) => {
            if (result.battleEnded) return;
            // アイテム使用は行動順に関わらず必ず先に処理される（既存仕様のまま）。
            // 効果自体はここで既に完了しているので、行動順エンジンには「済み」の行動として渡す。
            submitMasmonPlayerAction({ actionType: 'item', alreadyResolved: true });
        });
        return;
    }

    // アイテム使用は行動順に関わらず必ず先に処理される（既存仕様のまま）。
    // 効果自体はここで既に完了しているので、行動順エンジンには「済み」の行動として渡す。
    submitMasmonPlayerAction({ actionType: 'item', alreadyResolved: true });
}

// =====================================================
// バトル演出用UI設定（プレイヤー側／敵側で異なるDOM要素・エフェクト文言をまとめたもの）
// 攻撃系の処理そのものは buildAttackSkillSteps() 側で共通化し、
// 表示に関わる部分だけをこのテーブルで吸収する。
// =====================================================
const SIDE_UI = {
    player: {
        spriteContainer: 'battle-player-sprite-container',
        spriteAnim: 'translate-x-6',
        oppSpriteContainer: 'battle-enemy-sprite-container',
        oppSpriteAnim: 'shake',
        dmgPopup: 'enemy-dmg-popup',
        hitEffect: '💥 HIT! 💥',
        critEffect: '💥 CRITICAL!! 💥',
        missEffect: '💨 MISS 💨',
        buffEffect: '💪 ちからUP! 💪',
        healEffect: '💚 ライフ回復! 💚'
    },
    enemy: {
        spriteContainer: 'battle-enemy-sprite-container',
        spriteAnim: '-translate-x-6',
        oppSpriteContainer: 'battle-player-sprite-container',
        oppSpriteAnim: 'shake',
        dmgPopup: 'player-dmg-popup',
        hitEffect: '⚡ 被弾!! ⚡',
        critEffect: '⚡ 会心の一撃!! ⚡',
        missEffect: '💨 回避!! 💨',
        buffEffect: '💪 相手の攻撃UP! 💪',
        healEffect: '💚 相手回復! 💚'
    }
};

// --- プレイヤーの行動選択（技） ---
// 技の実行そのものはここでは行わず、「今ターンの行動」として確定させるだけにする。
// 実際の効果計算・演出は、行動順が決まった後 executeMasmonSideAction() で行う。
function executeMasmonPlayerSkill(skKey) {
    if (MASMON_BATTLE_STATE.isBattleEnd || !MASMON_BATTLE_STATE.isPlayerTurnActive) return;

    const rawSk = SKILLS_DB[skKey];
    if (!rawSk) return;

    const p = getPlayerActive();
    const sk = getMasmonEffectiveSkill(p, skKey);
    if (p.guts < sk.cost) return; // ターン開始時点のガッツを基準に使用可否を判定する

    beginActionLog();
    submitMasmonPlayerAction({ actionType: 'skill', skKey: skKey });
}

// --- ターン終了ボタンのモード振り分けルーター ---
// （育成中バトルからのみ呼び出される。マスモンCPU戦・PvPではこのボタン自体が非表示）
function handleEndTurnClick(defendMode) {
    if (ACTIVE_BATTLE_MODE === 'adventure') {
        endPlayerTurn(defendMode);
    }
}

// --- 防御コマンド（技一覧内から選択。被ダメ半減のみで、ガッツ回復ペナルティは無い） ---
// 防御は行動順に関わらず必ず技より先攻する（技優先度の階層で保証している）。
function executeMasmonDefend() {
    if (MASMON_BATTLE_STATE.isBattleEnd || !MASMON_BATTLE_STATE.isPlayerTurnActive) return;
    beginActionLog();
    submitMasmonPlayerAction({ actionType: 'defend' });
}

// --- 敵CPUのアイテム使用AI（シンプルな条件判定） ---
function runEnemyItemAI() {
    const e = getEnemyActive();
    const counts = MASMON_BATTLE_STATE.enemyItems;
    if (!counts) return;

    const lifeRatio = e.stats.life / e.stats.maxLife;

    if (lifeRatio <= 0.35 && counts.mango > 0) {
        counts.mango--;
        const heal = Math.floor(e.stats.maxLife * 0.25);
        e.stats.life = Math.min(e.stats.maxLife, e.stats.life + heal);
        addLog(`🥭 ${e.name} は【${MASMON_ITEM_DB.mango.name}】を使った！ライフが ${heal} 回復した！`);
        return;
    }

    if (e.critBonusTurns <= 0 && counts.kuri > 0 && Math.random() < 0.4) {
        counts.kuri--;
        e.critBonusTurns = 3;
        addLog(`🌰 ${e.name} は【${MASMON_ITEM_DB.kuri.name}】を使った！クリティカル率が上昇した！`);
        return;
    }

    if (counts.toro > 0 && lifeRatio > 0.6 && Math.random() < 0.35) {
        counts.toro--;
        e.stats.pow += 20;
        e.stats.int += 20;
        const selfDmg = Math.floor(e.stats.maxLife * 0.3);
        e.stats.life = Math.max(0, e.stats.life - selfDmg);
        addLog(`🧪 ${e.name} は【${MASMON_ITEM_DB.toro.name}】を使った！ちから・かしこさが上昇したが、反動でダメージを受けた！`);
    }
}

// =====================================================
// 行動順バトルエンジン 本体
// =====================================================

// --- ユニット＋行動 から、TurnOrderResolver に渡す行動情報オブジェクトを作る ---
function buildTurnActionDescriptor(unit, action) {
    if (!unit || unit.stats.life <= 0) {
        return createTurnAction('none', 0, unit ? getEffectiveMoveSpeed(unit) : 0);
    }
    const speed = getEffectiveMoveSpeed(unit);
    if (!action || action.actionType === 'none') {
        return createTurnAction('none', 0, speed);
    }
    if (action.actionType === 'switch') return createTurnAction('switchOut', 0, speed);
    if (action.actionType === 'item') return createTurnAction('item', 0, speed);
    if (action.actionType === 'defend') return createTurnAction('defend', 0, speed);
    if (action.actionType === 'skill') {
        const sk = SKILLS_DB[action.skKey];
        return createTurnAction('skill', (sk && sk.priority) || 0, speed);
    }
    return createTurnAction('none', 0, speed);
}

// --- CPU（対戦相手）の「今ターンの行動」を決定する ---
// プレイヤーが何を選んだかは一切参照しない（ターン開始時点の状況だけで決める）ため、
// 結果として「両者が同時に行動を選択した」場合と全く同じ挙動になる。
function decideMasmonEnemyAction() {
    // 「ガッツファクトリー」AIレベル3以上：状況が不利な場合、行動前に控えのモンスターへ自動交代する
    if (MASMON_BATTLE_STATE.kinNejiki && (MASMON_BATTLE_STATE.kinNejiki.aiLevel || 1) >= 3 && typeof maybeExecuteKinNejikiEnemySwitch === 'function') {
        const switched = maybeExecuteKinNejikiEnemySwitch();
        if (switched) {
            renderTeamIcons();
            updateMasmonBattleStatsUI();
        }
    }

    let e = getEnemyActive();
    if (!e || e.stats.life <= 0) return { actionType: 'none' };

    runEnemyItemAI();
    updateMasmonBattleStatsUI();

    // アイテムの反動（トロカチン）で自滅した場合
    if (checkFaintAndProceed('enemy')) {
        return { actionType: 'none', battleEnded: true };
    }
    e = getEnemyActive();
    if (!e || e.stats.life <= 0) return { actionType: 'none' };

    // マヒ／混乱（意味不明）／出血の残ターン消化と行動失敗判定（敵側）
    const enemyConfusionResult = tickStatusTurnsAndCheckConfusion(e);
    if (enemyConfusionResult.dotDamage > 0) {
        e.stats.life = Math.max(0, e.stats.life - enemyConfusionResult.dotDamage);
        addLog(`🩸 ${e.name} は出血ダメージで ${enemyConfusionResult.dotDamage} のダメージを受けた！(現在: ${Math.floor(e.stats.life)})`);
        updateMasmonBattleStatsUI();
        if (checkFaintAndProceed('enemy')) {
            return { actionType: 'none', battleEnded: true };
        }
    }
    e = getEnemyActive();
    if (!e || e.stats.life <= 0) return { actionType: 'none' };
    if (enemyConfusionResult.confused) {
        return { actionType: 'none', reason: enemyConfusionResult.failReason };
    }

    const p = getPlayerActive();
    const affordableSkills = e.skills
        .map(skKey => ({ key: skKey, info: getMasmonEffectiveSkill(e, skKey) }))
        .filter(skObj => skObj.info && e.guts >= skObj.info.cost);

    if (affordableSkills.length === 0) {
        return { actionType: 'none', reason: 'noguts' };
    }

    // 「ガッツファクトリー」レンタルバトル中はAIレベルに応じた判断ロジックを使用し、
    // それ以外（従来のマスモンCPU戦）は従来通り「最もガッツ消費が大きい技」を選ぶ簡易AIのままとする。
    // ※ AIはここで「自分が先攻になるか後攻になるか」を考慮したい場合、
    //    chooseKinNejikiEnemySkill 側で MASMON_BATTLE_STATE の速度比較結果を参照する形で拡張できる。
    const skKey = (MASMON_BATTLE_STATE.kinNejiki && typeof chooseKinNejikiEnemySkill === 'function')
        ? chooseKinNejikiEnemySkill(e, p, affordableSkills, MASMON_BATTLE_STATE.kinNejiki.aiLevel || 1)
        : affordableSkills.slice().sort((a, b) => b.info.cost - a.info.cost)[0].key;

    return { actionType: 'skill', skKey: skKey };
}

// --- プレイヤーの行動が確定した際に呼ばれる共通の入り口 ---
// switch/item は既に効果を適用済みの状態で { alreadyResolved: true } として渡ってくる。
function submitMasmonPlayerAction(action) {
    if (MASMON_BATTLE_STATE.isBattleEnd) return;

    MASMON_BATTLE_STATE.isPlayerTurnActive = false;
    toggleMasmonSkillButtons(false);
    MASMON_BATTLE_STATE.pendingPlayerAction = action;

    MASMON_BATTLE_STATE.pendingEnemyAction = decideMasmonEnemyAction();
    if (MASMON_BATTLE_STATE.isBattleEnd) return; // CPU側の処理中にバトルが終了した場合（自滅等）

    setTimeout(() => resolveMasmonTurn(), 500);
}

// --- 双方の行動が確定した後、行動順を決定して実行を開始する ---
function resolveMasmonTurn() {
    if (MASMON_BATTLE_STATE.isBattleEnd) return;

    const p = getPlayerActive();
    const e = getEnemyActive();
    const playerAction = MASMON_BATTLE_STATE.pendingPlayerAction || { actionType: 'none' };
    const enemyAction = MASMON_BATTLE_STATE.pendingEnemyAction || { actionType: 'none' };

    const pDesc = buildTurnActionDescriptor(p, playerAction);
    const eDesc = buildTurnActionDescriptor(e, enemyAction);

    // ---- 行動順決定（独立モジュール js/turn_order.js に委譲） ----
    const result = TurnOrderResolver.resolve(pDesc, eDesc);
    const order = result.order.map(tag => (tag === 'A') ? 'player' : 'enemy');

    // 交代／アイテムのように既に処理済みの行動は自明に先攻となるため、案内ログは出さない
    const isTrivialFirst = (pDesc.actionType === 'switchOut' || pDesc.actionType === 'item');
    if (pDesc.actionType !== 'none' && eDesc.actionType !== 'none' && !isTrivialFirst) {
        const firstName = (order[0] === 'player') ? p.name : e.name;
        addLog(`⚡ ${firstName} が先に行動する！`);
    }

    runMasmonActionInOrder(order, 0);
}

// --- 決定された行動順に沿って、1体ずつ順番に行動を実行していく ---
function runMasmonActionInOrder(order, idx) {
    if (MASMON_BATTLE_STATE.isBattleEnd) return;
    if (idx >= order.length) {
        finishMasmonTurn();
        return;
    }

    const side = order[idx];
    const unit = (side === 'player') ? getPlayerActive() : getEnemyActive();
    const opponent = (side === 'player') ? getEnemyActive() : getPlayerActive();
    const action = (side === 'player') ? MASMON_BATTLE_STATE.pendingPlayerAction : MASMON_BATTLE_STATE.pendingEnemyAction;

    // 先攻の行動で既に戦闘不能になっている場合は行動をスキップする
    if (!unit || unit.stats.life <= 0) {
        runMasmonActionInOrder(order, idx + 1);
        return;
    }

    if (side === 'enemy' && action && (action.actionType === 'skill' || action.actionType === 'none')) {
        addLog(`--- ${unit.name} のターン ---`);
        showEffect('⚠️ ENEMY TURN ⚠️');
    }

    executeMasmonSideAction(side, unit, opponent, action, () => {
        if (MASMON_BATTLE_STATE.isBattleEnd) return;
        const opponentSide = (side === 'player') ? 'enemy' : 'player';

        // 相手が戦闘不能になったかチェック（① 自分側なら選択交代 / ② 相手側なら自動交代＋こちらの交代確認）
        handleFaintAndSwitch(opponentSide, (r1) => {
            if (r1.battleEnded) return; // 勝敗判定済み
            if (r1.turnShouldEnd) {
                // 交代が発生した場合、このターンの残りの行動（後攻側の行動）は実行せず、
                // ターンを仕切り直す（ポケットモンスターのバトル仕様を踏襲）
                setTimeout(() => finishMasmonTurn(), BATTLE_STEP_DELAY.beforeNextTurn);
                return;
            }

            // 自分自身が反動等で戦闘不能になったかチェック
            handleFaintAndSwitch(side, (r2) => {
                if (r2.battleEnded) return;
                if (r2.turnShouldEnd) {
                    setTimeout(() => finishMasmonTurn(), BATTLE_STEP_DELAY.beforeNextTurn);
                    return;
                }
                setTimeout(() => runMasmonActionInOrder(order, idx + 1), BATTLE_STEP_DELAY.beforeNextTurn);
            });
        });
    });
}

// --- 両者の行動が終わったらターンを進める ---
function finishMasmonTurn() {
    if (MASMON_BATTLE_STATE.isBattleEnd) return;
    MASMON_BATTLE_STATE.turn++;
    document.getElementById('battle-turn-counter').textContent = MASMON_BATTLE_STATE.turn;
    startMasmonPlayerTurn(false);
}

// --- 1体分の行動を実際に実行する（技効果計算・演出・ガッツ消費など） ---
// 実行「直前」に改めてガッツを再チェックする点がポイント：
// 先攻の攻撃でガッツを削られた結果、後攻がガッツ不足で技を出せなかった、というケースが発生する。
function executeMasmonSideAction(side, unit, opponent, action, onComplete) {
    if (!action || action.actionType === 'none') {
        let msg = null;
        let effect = '💨 NO ACTION 💨';
        if (action && action.reason === 'confuse') {
            msg = `❔ ${unit.name} は意味不明で、行動できなかった！`;
            effect = '❔ 意味不明... ❔';
        } else if (action && action.reason === 'paralyze') {
            msg = `⚡ ${unit.name} はマヒして、行動できなかった！`;
            effect = '⚡ マヒ... ⚡';
        } else if (action && action.reason === 'flinch') {
            msg = `😨 ${unit.name} は怯んでしまい、行動できなかった！`;
            effect = '😨 怯み... 😨';
        } else if (action && action.reason === 'noguts') {
            msg = (side === 'enemy')
                ? `しかし ${unit.name} はガッツが著しく不足しており、何も行動できない！`
                : `💦 ${unit.name} はガッツが足りず、何も行動できなかった！`;
        }
        if (msg) {
            addLog(msg);
            showEffect(effect);
        }
        setTimeout(onComplete, BATTLE_STEP_DELAY.afterHitEffect);
        return;
    }

    // 交代／アイテムは選択した瞬間に効果を適用済み（既存仕様のまま）。行動順上は「済み」として扱う。
    if (action.actionType === 'switch' || action.actionType === 'item') {
        onComplete();
        return;
    }

    if (action.actionType === 'defend') {
        MASMON_BATTLE_STATE.isDefending = true;
        document.getElementById('player-defense-shield').classList.remove('hidden');
        addLog(`${unit.name} は身を守るため防御の構えを取った！（被ダメ半減／ガッツ回復ペナルティ無し）`);
        showEffect('🛡️ DEFENSE 🛡️');
        updateMasmonBattleStatsUI();
        setTimeout(onComplete, BATTLE_STEP_DELAY.afterHitEffect);
        return;
    }

    if (action.actionType === 'skill') {
        const rawSk = SKILLS_DB[action.skKey];
        if (!rawSk) { onComplete(); return; }
        const sk = getMasmonEffectiveSkill(unit, action.skKey);

        // ★ ここが新仕様の要：実行直前のガッツで再判定する
        if (unit.guts < sk.cost) {
            addLog(`💦 ${unit.name} はガッツが足りず、【${sk.name}】を繰り出せなかった！`);
            showEffect('💨 NO ACTION 💨');
            setTimeout(onComplete, BATTLE_STEP_DELAY.afterHitEffect);
            return;
        }

        unit.guts -= sk.cost;
        updateMasmonBattleStatsUI();

        const steps = [];
        buildSkillNameStep(steps, side, unit, sk);

        if (sk.type === 'pow' || sk.type === 'int') {
            buildAttackSkillSteps(steps, side, unit, opponent, sk);
        } else if (sk.type === 'buff_pow') {
            buildBuffPowSteps(steps, side, unit, sk);
        } else if (sk.type === 'heal') {
            buildHealSteps(steps, side, unit);
        } else if (sk.type === 'substitute') {
            buildSubstituteSteps(steps, side, unit);
        }

        runBattleStepSequence(steps, () => {
            updateMasmonBattleStatsUI();
            onComplete();
        });
        return;
    }

    onComplete();
}

// --- 技名表示ステップ（技発動時の自己強化効果もここで解決する） ---
function buildSkillNameStep(steps, side, unit, sk) {
    const cfg = SIDE_UI[side];
    steps.push({
        run: () => {
            addLog(`${unit.name} の 【${sk.name}】！`);
            animateSprite(cfg.spriteContainer, cfg.spriteAnim);
            applySkillOnUseEffect(unit, sk).forEach(msg => addLog(msg));
        },
        wait: BATTLE_STEP_DELAY.afterSkillName
    });
}

// --- 攻撃技（ちから／かしこさ技）のダメージ計算・演出ステップ ---
// プレイヤー側・敵側で完全に共通のロジック。
// 既存仕様との互換性維持のため、以下の非対称な仕様だけは side によって残している：
//   ・ガッツによる命中/威力補正（getGutsModifiers）はプレイヤー側にのみ適用される
//   ・最低保証ダメージはプレイヤー側10、敵側8
//   ・「防御」コマンドによる被ダメージ半減は、現状プレイヤーのみが選択できる
function buildAttackSkillSteps(steps, side, attacker, defender, sk) {
    const cfg = SIDE_UI[side];
    const useGutsMods = (side === 'player');
    const mods = getGutsModifiers(attacker.guts);

    const isCertain = sk.hitRate === 100;
    let hitChance = isCertain
        ? 100
        : Math.max(10, Math.min(99, (sk.hitRate + (useGutsMods ? mods.hitMod : 0)) + (attacker.stats.hit - defender.stats.spd) * 0.5 - getBlindHitPenalty(attacker)));
    if (attacker.isShuchuActive && !isCertain) {
        hitChance = Math.min(99, hitChance * 1.5);
    }

    let isHit;
    let isGuaranteedDodge = false;
    if (defender.dodgeNextGuaranteed) {
        isHit = false;
        isGuaranteedDodge = true;
        defender.dodgeNextGuaranteed = false;
    } else {
        isHit = isCertain || (Math.random() * 100 < hitChance);
    }

    // 次技威力アップ（オーロラゲート等）の消費は命中判定に関わらず技を撃った時点で消費する
    const usedForce = consumeForceBoost(attacker, sk.force);

    // みがわり餅で設置された身代わりが残っている場合、攻撃はダメージ・ガッツダウン・追加効果一切なしで防がれる
    const defenderSubKey = side === 'player' ? 'enemySubstituteHits' : 'playerSubstituteHits';
    if (isHit && MASMON_BATTLE_STATE[defenderSubKey] > 0) {
        MASMON_BATTLE_STATE[defenderSubKey] -= 1;
        const remaining = MASMON_BATTLE_STATE[defenderSubKey];
        steps.push({
            run: () => {
                showEffect('🌸 身代わり！');
                addLog(`🌸 桜餅の身代わりが${defender.name}の代わりに攻撃を受けた！（身代わりの残り回数: ${remaining}）`);
            },
            wait: BATTLE_STEP_DELAY.afterHitEffect
        });
        return;
    }

    if (isHit) {
        const isPow = sk.type === 'pow';
        const attackerStat = getBuffedAttackStat(attacker, getWeakenedStat(attacker, isPow ? attacker.stats.pow : attacker.stats.int)) * getEquipmentLowLifeAtkMultiplier(attacker);
        // 丈夫さ強化：ダメージ計算で使用する丈夫さは1.5倍して扱う（地震・テイルブレード等の防御崩し状態を反映）
        const defenderStat = getDefDownStat(defender, getBuffedDefenseStat(defender, defender.stats.def)) * 1.5;
        const statCap = Math.max(30, defenderStat * 2.5);
        let effectiveAttacker = attackerStat;
        if (attackerStat > statCap) {
            effectiveAttacker = statCap + (attackerStat - statCap) * 0.2;
        }

        const defenderGutsDefenseMod = getGutsDefenseModifier(defender.guts);
        let rawDmg = ((effectiveAttacker * usedForce) * (useGutsMods ? mods.dmgMod : 1)) - (defenderStat * 0.35);
        const floorVal = (side === 'player') ? 10 : 8;
        let damage = Math.floor(Math.max(floorVal, (rawDmg * (0.9 + Math.random() * 0.2)) * defenderGutsDefenseMod));

        let extraDmgMsg = "";
        if (attacker.isSokojikaraActive) {
            damage = Math.floor(damage * 1.5);
            extraDmgMsg += " (底力×1.5)";
        }
        if (attacker.isShuchuActive) {
            damage = Math.floor(damage * 1.2);
            extraDmgMsg += " (集中×1.2)";
        }
        if (attacker.permaForceBoostActive) {
            damage = Math.floor(damage * 1.2);
            extraDmgMsg += " (天河天翔×1.2)";
        }
        if (isAuraAdvantageous(attacker.aura, defender.aura)) {
            damage = Math.floor(damage * 2);
            extraDmgMsg += ` (オーラ相性${AURA_TYPES[attacker.aura].emoji}→${AURA_TYPES[defender.aura].emoji}×2)`;
        } else if (isAuraAdvantageous(defender.aura, attacker.aura)) {
            damage = Math.floor(damage * 0.5);
            extraDmgMsg += ` (オーラ相性${AURA_TYPES[defender.aura].emoji}→${AURA_TYPES[attacker.aura].emoji}被ダメージ半減)`;
        }
        const monClassMod = getMonClassDamageMultiplier(attacker.monsterBaseName, defender.monsterBaseName);
        if (monClassMod !== 1.0) {
            damage = Math.floor(damage * monClassMod);
            extraDmgMsg += monClassMod > 1.0 ? ` (モン類相性有利×${monClassMod})` : ` (モン類相性不利×${monClassMod})`;
        }

        const critChance = 0.10 + (attacker.critBonusTurns > 0 ? 0.25 : 0) + getEquipmentCritBonus(attacker) + getSkillCritBonus(sk);
        let isCrit = Math.random() < critChance;
        if (isCrit) {
            damage = Math.floor(damage * 1.5);
        }

        // 防御コマンドによる被ダメージ半減（既存仕様通り、現状は「敵の攻撃をプレイヤーが防御する」場合のみ）
        if (side === 'enemy' && MASMON_BATTLE_STATE.isDefending) {
            damage = Math.floor(damage / 2);
        }

        damage = Math.max(1, Math.floor(damage * MASMON_BATTLE_DAMAGE_MULTIPLIER));

        // 九重神眼等のシールドによる被ダメージ吸収
        const shieldResult = applyShieldAbsorption(defender, damage);
        damage = shieldResult.finalDamage;

        steps.push({
            run: () => {
                showEffect(isCrit ? cfg.critEffect : cfg.hitEffect);
                animateSprite(cfg.oppSpriteContainer, cfg.oppSpriteAnim);
            },
            wait: BATTLE_STEP_DELAY.afterHitEffect
        });

        steps.push({
            run: () => {
                if (isCrit) {
                    addLog(side === 'player'
                        ? `★クリティカルヒット！ ${defender.name} に ${damage} ダメージ！${extraDmgMsg}`
                        : `★相手のクリティカル！ ${defender.name} は ${damage} ダメージを受けた！${extraDmgMsg}`);
                } else {
                    addLog(side === 'player'
                        ? `${defender.name} に ${damage} ダメージ！${extraDmgMsg}`
                        : `${defender.name} は ${damage} ダメージを受けた！${extraDmgMsg}`);
                }
                if (side === 'enemy' && MASMON_BATTLE_STATE.isDefending) {
                    addLog(`【防御効果】攻撃を盾で受け流し、ダメージを半減した！`);
                }
                if (shieldResult.absorbed > 0) {
                    addLog(`🛡️ ${defender.name} のシールドが ${shieldResult.absorbed} のダメージを吸収した！(シールド残量: ${defender.shieldValue})`);
                }
                defender.stats.life = Math.max(0, defender.stats.life - damage);
                updateMasmonBattleStatsUI();
                showDamagePopup(cfg.dmgPopup, damage, isCrit);
                checkMasmonDefenseStatusTriggers(defender);
                const lifesaverLog = checkAndApplyEquipmentLifesaverEffect(defender);
                if (lifesaverLog) addLog(lifesaverLog);
            },
            wait: BATTLE_STEP_DELAY.afterDamage
        });

        let finalGutsDown = sk.gutsDown || 0;
        if (attacker.isGyakujoActive && finalGutsDown > 0) {
            finalGutsDown = Math.floor(finalGutsDown * 1.2);
        }
        if (finalGutsDown > 0) {
            steps.push({
                run: () => {
                    // 丈夫さ強化：丈夫さが高いほど受けるガッツダウン量を軽減する
                    // 装備の「被ガッツダウンカット」効果もあわせて軽減する
                    const mitigatedGutsDown = Math.floor(finalGutsDown * getGutsDownMitigation(defender.stats.def) * (1 - getEquipmentGutsDownCutRate(defender)));
                    const actualGutsDown = Math.min(defender.guts, mitigatedGutsDown);
                    defender.guts = Math.max(0, defender.guts - actualGutsDown);
                    addLog(side === 'player'
                        ? `さらに！相手のガッツを ${actualGutsDown} 奪い取った！${attacker.isGyakujoActive ? " (逆上×1.2)" : ""} (現在: ${Math.floor(defender.guts)})`
                        : `さらに！ ${defender.name} のガッツが ${actualGutsDown} 奪われた！(現在: ${Math.floor(defender.guts)})`);
                    // ゲルの「マナドレイン」等：奪ったガッツ分だけ自身のガッツを回復する
                    const gutsDrain = getGutsDrainAmount(sk, actualGutsDown);
                    if (gutsDrain > 0) {
                        attacker.guts = Math.min(100, attacker.guts + gutsDrain);
                        addLog(`🔮 ${attacker.name} は奪ったガッツを吸収し、自身のガッツが ${gutsDrain} 回復した！(現在: ${Math.floor(attacker.guts)})`);
                    }
                    updateMasmonBattleStatsUI();
                    checkMasmonGyakujoTrigger(defender);
                },
                wait: BATTLE_STEP_DELAY.perExtraLog
            });
        }

        // モノリスの技等が持つ追加効果（衰弱／混乱付与／次技威力アップ／継続ダメージ等）は
        // 命中確定時点の状態を使って計算しておき、表示だけを1件ずつ後で行う
        const onHitMsgs = applySkillOnHitEffect(attacker, defender, sk);
        onHitMsgs.forEach(msg => {
            steps.push({ run: () => addLog(msg), wait: BATTLE_STEP_DELAY.perExtraLog });
        });

        // プラントの「ドレイン」等：与えたダメージの一部を自身のライフに変換
        const drainHeal = getDrainHealAmount(sk, damage);
        if (drainHeal > 0) {
            steps.push({
                run: () => {
                    attacker.stats.life = Math.min(attacker.stats.maxLife, attacker.stats.life + drainHeal);
                    addLog(`🌿 ${attacker.name} は相手の生命力を吸収し、ライフが ${drainHeal} 回復した！(現在: ${Math.floor(attacker.stats.life)})`);
                    updateMasmonBattleStatsUI();
                },
                wait: BATTLE_STEP_DELAY.perExtraLog
            });
        }

        attacker.isSokojikaraActive = false;
        attacker.isShuchuActive = false;
    } else {
        steps.push({
            run: () => {
                if (isGuaranteedDodge) {
                    addLog(`🌫️ ${defender.name} は陽炎の効果で攻撃を確実に回避した！`);
                } else {
                    addLog(side === 'player' ? 'しかし、攻撃はかわされた！' : `しかし ${defender.name} は身軽にかわした！`);
                }
                showEffect(cfg.missEffect);
                showDamagePopup(cfg.dmgPopup, 'MISS', false);
            },
            wait: BATTLE_STEP_DELAY.afterHitEffect
        });
    }
}

// --- 補助技（ちからアップ）の演出ステップ ---
// sk.useEffect を持つ技（桜の舞など）は applySkillOnUseEffect 側で既に効果を適用済みのため、
// ここでは旧仕様の「ちから固定+15」を重複適用しない。
function buildBuffPowSteps(steps, side, unit, sk) {
    if (sk && sk.useEffect) return;
    const cfg = SIDE_UI[side];
    steps.push({
        run: () => {
            unit.stats.pow += 15;
            addLog(side === 'player' ? `${unit.name} の闘志がみなぎる！ちからが15アップした！` : `${unit.name} は気合を入れて攻撃力を上げた！`);
            showEffect(cfg.buffEffect);
            updateMasmonBattleStatsUI();
        },
        wait: BATTLE_STEP_DELAY.afterHitEffect
    });
}

// --- みがわり餅：チーム（陣営）側に持続する身代わりを設置する演出ステップ ---
// モンスターを交換しても効果が残るよう、ユニットではなく MASMON_BATTLE_STATE 側に回数を持たせる。
function buildSubstituteSteps(steps, side, unit) {
    const cfg = SIDE_UI[side];
    const stateKey = side === 'player' ? 'playerSubstituteHits' : 'enemySubstituteHits';
    steps.push({
        run: () => {
            const already = MASMON_BATTLE_STATE[stateKey] > 0;
            MASMON_BATTLE_STATE[stateKey] = 2;
            addLog(already
                ? `🌸 ${unit.name} は新しい桜餅を設置し直した！（身代わりの残り回数が2回に更新された）`
                : `🌸 ${unit.name} は自身と同じ大きさの桜餅を設置した！（次の攻撃を2回まで防ぐ。モンスターを交換しても場に残り続ける）`);
            showEffect(cfg.buffEffect);
            updateMasmonBattleStatsUI();
        },
        wait: BATTLE_STEP_DELAY.afterHitEffect
    });
}

// --- 回復技の演出ステップ ---
function buildHealSteps(steps, side, unit) {
    const cfg = SIDE_UI[side];
    steps.push({
        run: () => {
            const healAmount = Math.floor(unit.stats.maxLife * 0.35);
            unit.stats.life = Math.min(unit.stats.maxLife, unit.stats.life + healAmount);
            addLog(`${unit.name} は癒された！ライフが ${healAmount} 回復！`);
            showEffect(cfg.healEffect);
            updateMasmonBattleStatsUI();
        },
        wait: BATTLE_STEP_DELAY.afterHitEffect
    });
}


// -----------------------------------------------------
// バトル終了処理
// -----------------------------------------------------
function handleMasmonBattleWin() {
    if (MASMON_BATTLE_STATE.isBattleEnd) return;
    MASMON_BATTLE_STATE.isBattleEnd = true;
    MASMON_BATTLE_STATE.battleResult = 'win';
    const isTeam = MASMON_BATTLE_STATE.mode === 'cpu_team';
    addLog(isTeam ? `🎉 勝利！ 相手チームを全滅させた！` : `🎉 勝利！ ${MASMON_BATTLE_STATE.enemyTeam[0].name} を倒した！`);
    showEffect('🏆 WIN!! 🏆');
    if (MASMON_BATTLE_STATE.kinNejiki && MASMON_BATTLE_STATE.kinNejiki.inRun && typeof kinNejikiHandleBattleEnd === 'function') {
        setTimeout(() => kinNejikiHandleBattleEnd(true), 1500);
        return;
    }
    setTimeout(() => showMasmonBattleResult(true), 1500);
}

function handleMasmonBattleLose() {
    if (MASMON_BATTLE_STATE.isBattleEnd) return;
    MASMON_BATTLE_STATE.isBattleEnd = true;
    MASMON_BATTLE_STATE.battleResult = 'lose';
    const isTeam = MASMON_BATTLE_STATE.mode === 'cpu_team';
    addLog(isTeam ? `💀 敗北… あなたのチームは全滅してしまった…` : `💀 敗北… ${MASMON_BATTLE_STATE.playerTeam[0].name} は倒れてしまった…`);
    showEffect('💀 LOSE... 💀');
    if (MASMON_BATTLE_STATE.kinNejiki && MASMON_BATTLE_STATE.kinNejiki.inRun && typeof kinNejikiHandleBattleEnd === 'function') {
        setTimeout(() => kinNejikiHandleBattleEnd(false), 1500);
        return;
    }
    setTimeout(() => showMasmonBattleResult(false), 1500);
}

function showMasmonBattleResult(isWin) {
    ACTIVE_BATTLE_MODE = 'adventure'; // モードを元に戻す
    // 育成中バトル用の「攻撃終了」「防御して終了」ボタンを再表示しておく
    document.getElementById('battle-endturn-controls').classList.remove('hidden');

    // マスモン団体戦専用のUI（チームアイコン・持ち込みアイテム欄）を確実に隠し、
    // 中身もクリアしておく（次に育成中バトルへ入った時に残留表示されるのを防ぐ）
    const playerTeamIconsEl = document.getElementById('player-team-icons');
    const enemyTeamIconsEl = document.getElementById('enemy-team-icons');
    const battleItemsEl = document.getElementById('battle-items-container');
    playerTeamIconsEl.classList.add('hidden');
    playerTeamIconsEl.innerHTML = '';
    enemyTeamIconsEl.classList.add('hidden');
    enemyTeamIconsEl.innerHTML = '';
    battleItemsEl.classList.add('hidden');
    battleItemsEl.innerHTML = '';

    const badge = document.getElementById('masmon-result-badge');
    const title = document.getElementById('masmon-result-title');
    const subtitle = document.getElementById('masmon-result-subtitle');
    const detail = document.getElementById('masmon-result-detail');

    const isTeam = MASMON_BATTLE_STATE.mode === 'cpu_team';
    const myNames = MASMON_BATTLE_STATE.playerMeta.map(m => m.name).join('、');
    const enemyNames = MASMON_BATTLE_STATE.enemyMeta.map(m => m.name).join('、');
    const enemyOwner = MASMON_BATTLE_STATE.opponentOwnerName || '相手ブリーダー';

    if (isWin) {
        badge.textContent = '🏆';
        title.textContent = 'VICTORY!';
        title.className = 'text-2xl font-black text-amber-500 pixel-font';
        subtitle.textContent = isTeam
            ? `【${myNames}】のチームが【${enemyOwner}】のチームを打ち破った！`
            : `【${myNames}】が【${enemyOwner}】の【${enemyNames}】を倒した！`;
    } else {
        badge.textContent = '💀';
        title.textContent = 'DEFEAT...';
        title.className = 'text-2xl font-black text-red-500 pixel-font';
        subtitle.textContent = isTeam
            ? `【${myNames}】のチームは【${enemyOwner}】のチームに敗れた…`
            : `【${myNames}】は【${enemyOwner}】の【${enemyNames}】に敗れた…`;
    }

    const survivedCount = (isWin ? MASMON_BATTLE_STATE.playerTeam : MASMON_BATTLE_STATE.enemyTeam).filter(u => u.stats.life > 0).length;

    detail.innerHTML = `
        <div class="text-xs text-purple-300 font-bold border-b border-purple-800 pb-1 mb-1">対戦結果</div>
        <div class="flex justify-between text-xs"><span class="text-gray-400">あなたの${isTeam ? 'チーム' : 'マスモン'}:</span><span class="text-white font-bold">${myNames}</span></div>
        <div class="flex justify-between text-xs"><span class="text-gray-400">対戦相手:</span><span class="text-white font-bold">${enemyOwner} の ${enemyNames}</span></div>
        ${isTeam ? `<div class="flex justify-between text-xs"><span class="text-gray-400">生存数:</span><span class="text-white font-bold">${survivedCount}/${(isWin ? MASMON_BATTLE_STATE.playerTeam : MASMON_BATTLE_STATE.enemyTeam).length}</span></div>` : ''}
        <div class="flex justify-between text-xs"><span class="text-gray-400">経過ターン数:</span><span class="text-white font-bold">${MASMON_BATTLE_STATE.turn}</span></div>
    `;

    if (typeof AudioManager !== 'undefined') AudioManager.playBGM(isWin ? 'victory' : 'defeat');
    changeScreen('screen-masmon-battle-result');
}

// PvP対戦結果画面（screen-masmon-battle-result）の「戻る」ボタンから呼ばれる。
// マスモン一覧は廃止したため、タイトル画面へ戻る。
function returnFromPvpBattleResult() {
    changeScreen('screen-title');
}
