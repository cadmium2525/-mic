// =====================================================
// pvp_rental.js
// PvP（リアルタイム対戦）で使用するパーティを、ユーザー自身が技構成・装備を
// カスタマイズして保存した「編成プリセット」（js/pvp_preset.js で管理）から
// 選ぶための画面ロジック。
// 実際のマッチング・ターン同期は masmon_realtime.js / masmon_realtime_battle.js
// （既存のリアルタイム対戦エンジン）へそのまま引き継ぐ。
//
// 選出フロー（読み合い方式）：
//   1. タイトル→対戦形式（個人戦/団体戦）を選ぶ
//   2. 使用する編成プリセット（自分で作成した6体・最大6セットまで保存可）を選ぶ
//      （js/pvp_preset.js の画面。自分の候補は選んだ時点で既知だが、相手の候補は
//      マッチングが成立するまでわからない）
//   3. 愛言葉あり/なしを選んでマッチング開始。
//   4. マッチング成立後、PVP_PICK_STATE（本ファイル下部）にて
//      お互いの候補6体を初めて見せ合いながら、実際に出す規定数を選出する
//      （相手の最終選出は、お互い選出完了するまで伏せられる）
//
// ※ ガッツファクトリー（js/kinnejiki.js）は本ファイルの機能とは独立しており、
//   引き続きその場で抽選されるレンタルモンスターを使用する（変更なし）。
// =====================================================

const PVP_RENTAL_STATE = {
    battleType: 'team', // 'solo' | 'team'
    selectedPreset: null // マッチングに使用する編成プリセット（js/pvp_preset.js で選択・設定される）
};

// ちから特化型／かしこさ特化型の2系統を持つ種族（モッチー・モノリスなど、MONSTER_TEMPLATES上で
// dualStatType: true のもの）向けのステータス倍率。PvPプリセット編集画面でユーザーが選んだ型を、
// ガッツファクトリー等の「型」システム（MONSTER_MOLDSのstatMod）と同じ倍率で適用する。
const PVP_PRESET_DUAL_STAT_MOD = {
    pow: { pow: 1.25, int: 0.75 },
    int: { pow: 0.75, int: 1.25 }
};

// --- 編成プリセットの1モンスタースロット（speciesId/skills/equipId/statType）から実際の対戦用モンスターを生成 ---
function generatePvpMonsterFromPresetSlot(slot) {
    if (!slot || !slot.speciesId) return null;
    const tmpl = MONSTER_TEMPLATES[slot.speciesId];
    if (!tmpl) return null;

    // ちから型/かしこさ型のどちらかを選ぶ種族の場合、選択された型に応じてpow/intへ倍率をかける
    const statMod = (tmpl.dualStatType && PVP_PRESET_DUAL_STAT_MOD[slot.statType]) || null;
    const powMod = (statMod && statMod.pow) || 1;
    const intMod = (statMod && statMod.int) || 1;

    const variance = () => 0.95 + Math.random() * 0.1; // PvPは公平性重視で個体差を小さめに(±5%)
    const stats = {
        maxLife: Math.round(tmpl.stats.maxLife * variance()),
        pow: Math.round(tmpl.stats.pow * powMod * variance()),
        int: Math.round(tmpl.stats.int * intMod * variance()),
        hit: Math.round(tmpl.stats.hit * variance()),
        spd: Math.round(tmpl.stats.spd * variance()),
        def: Math.round(tmpl.stats.def * variance()),
        gutsSpeed: tmpl.stats.gutsSpeed
    };
    stats.life = stats.maxLife;

    const equipBase = slot.equipId ? EQUIPMENT_DB[slot.equipId] : null;
    const equipInstance = equipBase ? buildEquipmentInstanceFromBase(equipBase) : null;

    return {
        name: tmpl.name,
        monsterBaseName: tmpl.name,
        emoji: tmpl.emoji,
        speciesId: slot.speciesId,
        aura: getRandomAuraKey(), // 全モンスターに必ずオーラを付与する
        isAwakened: false,
        statusEffect: null,
        difficulty: 'pvp',
        stats: stats,
        skills: [...(slot.skills || [])],
        skillEnhancements: {},
        equip: equipInstance
    };
}

// --- 編成プリセット（6体分のスロット）から、マッチングで使用する候補6体を生成する ---
function generatePvpPresetOffer(preset) {
    if (!preset || !Array.isArray(preset.monsters)) return null;
    const offer = preset.monsters.map(slot => generatePvpMonsterFromPresetSlot(slot));
    if (offer.some(m => !m)) return null; // 未設定のスロットが残っている場合は無効
    return offer;
}

// --- タイトルから：PvP対戦の対戦形式選択画面へ ---
function startPvpRentalEntry(battleType = 'team') {
    PVP_RENTAL_STATE.battleType = battleType;
    PVP_RENTAL_STATE.selectedPreset = null;
    renderPvpRentalSelectScreen();
    changeScreen('screen-pvp-rental-select');
}

// --- 対戦形式を選んだあと：使用する編成プリセットを選ぶ画面へ（js/pvp_preset.js） ---
function goToPvpPresetSelectFromEntry() {
    openPvpPresetManageScreen(true);
}

function switchPvpRentalBattleType(battleType) {
    if (PVP_RENTAL_STATE.battleType === battleType) return;
    PVP_RENTAL_STATE.battleType = battleType;
    renderPvpRentalSelectScreen();
}

// --- 候補モンスター1体分のカードを描画する共通ヘルパー ---
// clickable/selected を切り替えられるようにし、この画面（プレビューのみ）と
// マッチング後の選出フェーズ（enterPvpPickPhase以下）の両方から使い回す。
function renderPvpMonsterOfferCard(m, opts) {
    opts = opts || {};
    const isSelected = !!opts.selected;
    const clickable = !!opts.clickable;

    const skillNames = m.skills.map(sk => (SKILLS_DB[sk] ? SKILLS_DB[sk].name : sk)).join('、');
    const equipText = m.equip ? getEquipmentDisplayName(m.equip) : '未装備';
    const aura = AURA_TYPES[m.aura];
    const monClassKey = getMonClassKeyForName(m.monsterBaseName);
    const monClassInfo = monClassKey ? MON_CLASS_TYPES[monClassKey] : null;
    const auraBadge = aura ? `<span class="ml-1 px-1 py-0.5 rounded text-[8px] font-bold text-slate-900 ${aura.colorClass}">${aura.emoji}${monClassInfo ? monClassInfo.emoji : ''}</span>` : '';

    const card = document.createElement('div');
    card.className = `bg-[#16202b] border rounded-xl p-2.5 transition-all ${clickable ? 'cursor-pointer active:scale-[0.98]' : ''} ${isSelected ? 'border-sky-400 shadow-[0_0_6px_2px_rgba(56,189,248,0.4)]' : 'border-sky-900/50'}`;
    if (clickable && typeof opts.onClick === 'function') card.onclick = opts.onClick;

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
    return card;
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
}

// --- 対戦形式・編成プリセットが確定した状態でマッチング画面（合言葉/ランダム）へ進む ---
function proceedToRealtimeMatchingFromRental() {
    showRealtimeKeywordScreen([], PVP_RENTAL_STATE.battleType);
}

// マッチング画面のキャンセル・退出・対戦相手切断等から戻ってきた際の共通の戻り先。
// マスモン一覧は廃止したため、対戦形式選択（候補プレビュー）画面へ戻す。
function returnToPvpEntry() {
    startPvpRentalEntry(PVP_RENTAL_STATE.battleType || 'team');
}

// =====================================================
// マッチング成立後：モンスター選出フェーズ（読み合い要素）
//
// マッチングが成立すると、双方が持つ「候補6体」がお互いに公開される。
// ここではその候補を見せ合いながら、実際に対戦に出す規定数
// （個人戦1体／団体戦3体）を選出する。
// 相手が実際にどの6体を選んだかは、お互いの選出が完了するまで伏せられる
// （＝相手の候補プールは見えるが最終選出は見えない状態で選ぶ、読み合いのための仕組み）。
// =====================================================

const PVP_PICK_STATE = {
    active: false,
    needCount: 3,
    myOffer: [],
    oppOffer: [],
    oppName: 'ブリーダー',
    selectedIdx: [],
    myConfirmed: false,
    oppConfirmed: false,
    listener: null
};

function resetPvpPickState() {
    PVP_PICK_STATE.active = false;
    PVP_PICK_STATE.needCount = 3;
    PVP_PICK_STATE.myOffer = [];
    PVP_PICK_STATE.oppOffer = [];
    PVP_PICK_STATE.oppName = 'ブリーダー';
    PVP_PICK_STATE.selectedIdx = [];
    PVP_PICK_STATE.myConfirmed = false;
    PVP_PICK_STATE.oppConfirmed = false;
}

// --- マッチング成立時に masmon_realtime.js の enterRealtimeMatchedScreen から呼ばれる ---
function enterPvpPickPhase(roomData) {
    const oppSlot = realtimeMySlot === 'player1' ? 'player2' : 'player1';
    const myData = roomData[realtimeMySlot];
    const oppData = roomData[oppSlot];

    resetPvpPickState();
    PVP_PICK_STATE.active = true;
    PVP_PICK_STATE.needCount = (roomData.battleType === 'team') ? 3 : 1;
    PVP_PICK_STATE.myOffer = myData.offer || [];
    PVP_PICK_STATE.oppOffer = oppData.offer || [];
    PVP_PICK_STATE.oppName = oppData.name || 'ブリーダー';
    PVP_PICK_STATE.myConfirmed = !!myData.selectedTeam;
    PVP_PICK_STATE.oppConfirmed = !!oppData.selectedTeam;

    const randomBadge = document.getElementById('pvp-pick-random-badge');
    if (randomBadge) randomBadge.classList.toggle('hidden', !realtimeIsRandomMatch);

    renderPvpPickScreen();
    changeScreen('screen-masmon-realtime-matched');
    attachPvpPickListener();
}

function attachPvpPickListener() {
    detachPvpPickListener();
    if (!realtimeRoomRef) return;
    PVP_PICK_STATE.listener = realtimeRoomRef.on('value', snap => {
        const data = snap.val();
        if (!data) {
            // 対戦相手が退出してルームが消えた場合
            detachPvpPickListener();
            stopRealtimeHeartbeat();
            resetRealtimeRoomState();
            resetPvpPickState();
            showToast('対戦相手が退出したため、マッチングを終了しました。');
            returnToPvpEntry();
            return;
        }

        const oppSlot = realtimeMySlot === 'player1' ? 'player2' : 'player1';
        const myData = data[realtimeMySlot];
        const oppData = data[oppSlot];
        if (!myData || !oppData) return;

        const wasOppConfirmed = PVP_PICK_STATE.oppConfirmed;
        PVP_PICK_STATE.myConfirmed = !!myData.selectedTeam;
        PVP_PICK_STATE.oppConfirmed = !!oppData.selectedTeam;
        if (PVP_PICK_STATE.oppConfirmed !== wasOppConfirmed) updatePvpPickWaitingUi();

        if (PVP_PICK_STATE.myConfirmed && PVP_PICK_STATE.oppConfirmed) {
            detachPvpPickListener();
            PVP_PICK_STATE.active = false;
            if (typeof beginRealtimeBattle === 'function') beginRealtimeBattle();
        }
    });
}

function detachPvpPickListener() {
    if (realtimeRoomRef && PVP_PICK_STATE.listener) {
        realtimeRoomRef.off('value', PVP_PICK_STATE.listener);
    }
    PVP_PICK_STATE.listener = null;
}

function renderPvpPickScreen() {
    const oppNameEl = document.getElementById('pvp-pick-opponent-name');
    if (oppNameEl) oppNameEl.textContent = PVP_PICK_STATE.oppName;

    const myContainer = document.getElementById('pvp-pick-my-offer-container');
    if (myContainer) {
        myContainer.innerHTML = '';
        PVP_PICK_STATE.myOffer.forEach((m, idx) => {
            if (!m) return;
            const selected = PVP_PICK_STATE.selectedIdx.includes(idx);
            myContainer.appendChild(renderPvpMonsterOfferCard(m, {
                selected,
                clickable: !PVP_PICK_STATE.myConfirmed,
                onClick: () => togglePvpPickSelect(idx)
            }));
        });
    }

    const oppContainer = document.getElementById('pvp-pick-opp-offer-container');
    if (oppContainer) {
        oppContainer.innerHTML = '';
        PVP_PICK_STATE.oppOffer.forEach(m => {
            if (!m) return;
            oppContainer.appendChild(renderPvpMonsterOfferCard(m, { clickable: false, selected: false }));
        });
    }

    updatePvpPickConfirmButton();
    updatePvpPickWaitingUi();
}

function togglePvpPickSelect(idx) {
    if (PVP_PICK_STATE.myConfirmed) return;
    const needCount = PVP_PICK_STATE.needCount;
    const pos = PVP_PICK_STATE.selectedIdx.indexOf(idx);
    if (pos >= 0) {
        PVP_PICK_STATE.selectedIdx.splice(pos, 1);
    } else {
        if (PVP_PICK_STATE.selectedIdx.length >= needCount) {
            showToast(needCount === 1 ? '個人戦は1体のみ選択できます。' : 'パーティは3体までです。');
            return;
        }
        PVP_PICK_STATE.selectedIdx.push(idx);
    }
    renderPvpPickScreen();
}

function updatePvpPickConfirmButton() {
    const btn = document.getElementById('pvp-pick-confirm-btn');
    if (!btn) return;
    const needCount = PVP_PICK_STATE.needCount;
    const count = PVP_PICK_STATE.selectedIdx.length;
    if (PVP_PICK_STATE.myConfirmed) {
        btn.disabled = true;
        btn.textContent = '選出完了（相手の選出を待っています…）';
        btn.classList.add('opacity-50');
    } else {
        btn.disabled = count !== needCount;
        btn.textContent = count === needCount ? 'この選出で対戦へ進む' : `モンスターを選択中 (${count}/${needCount})`;
        btn.classList.toggle('opacity-50', count !== needCount);
    }
}

function updatePvpPickWaitingUi() {
    const note = document.getElementById('pvp-pick-status-note');
    if (!note) return;
    if (PVP_PICK_STATE.myConfirmed && !PVP_PICK_STATE.oppConfirmed) {
        note.textContent = `${PVP_PICK_STATE.oppName} の選出を待っています…`;
    } else if (PVP_PICK_STATE.myConfirmed && PVP_PICK_STATE.oppConfirmed) {
        note.textContent = 'お互いの選出が完了しました。まもなく対戦が始まります…';
    } else if (!PVP_PICK_STATE.myConfirmed && PVP_PICK_STATE.oppConfirmed) {
        note.textContent = `${PVP_PICK_STATE.oppName} は選出を完了しています。あなたの選出をお待ちください。`;
    } else {
        note.textContent = '相手の候補も見えています。どちらを選ぶか読み合いましょう。';
    }
}

// --- 選出を確定してFirebaseへ書き込む（相手からは「選出済みかどうか」のみ見え、内容は伏せられる） ---
async function confirmPvpPick() {
    const needCount = PVP_PICK_STATE.needCount;
    if (PVP_PICK_STATE.myConfirmed || PVP_PICK_STATE.selectedIdx.length !== needCount) return;
    if (!realtimeRoomRef || !realtimeMySlot) {
        showToast('マッチング情報が見つかりません。');
        return;
    }

    const team = PVP_PICK_STATE.selectedIdx.map(idx => JSON.parse(JSON.stringify(PVP_PICK_STATE.myOffer[idx])));

    PVP_PICK_STATE.myConfirmed = true;
    updatePvpPickConfirmButton();
    updatePvpPickWaitingUi();

    try {
        await realtimeRoomRef.child(realtimeMySlot).child('selectedTeam').set(team);
    } catch (e) {
        console.error('[Firebase] PvP選出確定エラー:', e);
        showToast('選出の送信に失敗しました。もう一度お試しください。');
        PVP_PICK_STATE.myConfirmed = false;
        renderPvpPickScreen();
    }
}

// --- 選出フェーズから退出する ---
function cancelPvpPickPhase() {
    detachPvpPickListener();
    resetPvpPickState();
    leaveRealtimeRoom();
}
