// =====================================================
// myroom.js
// マイルーム画面（フェーズ4）
// ・家具：床の好きな場所に自由にドラッグ配置できる（ガチャの円盤石と同じドラッグ操作）。
//   配置後もタップすると操作パネルが出て、サイズ変更・回転・左右反転・再配置（再ドラッグ）・
//   撤去ができる。「同じ家具を何個まで置けるか」は所持数を基準に背景をまたいで共通でカウントする
//   （例：木の椅子を1個しか持っていなければ、AとBのどちらか片方にしか置けない）
// ・モンスター：手前の床エリアを自由に歩き回る（ランダム徘徊AI）。
//   家具と違い、モンスターは所持数を消費しない「観賞用の分身」として扱うため、
//   同じ組み合わせ（種族＋オーラ）を複数の背景に同時に配置できる
//   （例：モッチー(赤)を1体しか持っていなくても、AにもBにも置ける）
// ・所持データは player_inventory/{pid}/furniture, player_inventory/{pid}/monsters
//   （ガチャで既に書き込み済み）を読み込んで選択肢にする
// ・設置状態は player_myroom/{pid} に保存し、次回訪問時も復元する
//   { backgroundId,
//     placedFurniture: { bgId: { instanceKey: {furnitureId, xPct, yPct, scale, rotation, flipped} } },
//     placedMonsters: { bgId: { placementKey: {speciesId, auraKey} } } }
// =====================================================

// --- マイルームの背景一覧。背景ごとにモンスターの徘徊範囲・家具の配置可能範囲を個別に持つ ---
const MYROOM_BACKGROUNDS = {
    A: {
        id: 'A',
        name: '小屋',
        emoji: '🏠',
        file: 'images/myroom/マイルームA.png',
        wanderBounds: { xMin: 10, xMax: 90, yMin: 60, yMax: 88 },
        furnitureBounds: { xMin: 8, xMax: 92, yMin: 25, yMax: 90 },
        tokenSizePx: 84 // 小屋は奥行きが浅いぶん、モンスターを少し大きめに表示する
    },
    B: {
        id: 'B',
        name: 'ファーム',
        emoji: '🌾',
        file: 'images/myroom/マイルームB.png',
        wanderBounds: { xMin: 8, xMax: 92, yMin: 48, yMax: 90 },
        furnitureBounds: { xMin: 5, xMax: 95, yMin: 30, yMax: 92 },
        tokenSizePx: 76 // 少し大きめに調整
    }
};
const MYROOM_DEFAULT_BACKGROUND_ID = 'A';
const MYROOM_MAX_MONSTERS = 4;
const MYROOM_FURNITURE_BASE_SIZE_PX = 90; // scale:1のときの基準サイズ（正方形の当たり判定・表示枠）
const MYROOM_FURNITURE_SCALE_MIN = 0.5;
const MYROOM_FURNITURE_SCALE_MAX = 2.0;
const MYROOM_FURNITURE_SCALE_STEP = 0.15;
const MYROOM_FURNITURE_ROTATE_STEP = 45;

function getCurrentMyRoomBackground() {
    return MYROOM_BACKGROUNDS[MYROOM_STATE.backgroundId] || MYROOM_BACKGROUNDS[MYROOM_DEFAULT_BACKGROUND_ID];
}

const MYROOM_STATE = {
    backgroundId: MYROOM_DEFAULT_BACKGROUND_ID,
    placedFurniture: {},   // { bgId: { instanceKey -> { furnitureId, xPct, yPct, scale, rotation, flipped } } }
    placedMonsters: {},    // { bgId: { placementKey -> { speciesId, auraKey } } }
    ownedFurniture: [],    // [{id, count, name, emoji, image}]
    ownedMonsters: [],     // [{key, speciesId, auraKey, count, name, emoji}]
    wanderTimers: {},      // placementKey -> timeoutId
    walkSpriteAnimTimers: {}, // placementKey -> setIntervalId（○○_歩行.png系スプライトのコマ送り用）
    monsterTokenEls: {},   // placementKey -> DOM要素（反応演出の表示位置を探すために使う）
    activeFurnitureKey: null, // 現在操作パネルを開いている家具インスタンスのキー
    activeMonsterKey: null,   // 現在操作パネルを開いているモンスターの配置キー
    furnitureDragging: false,
    monsterSortMode: 'monclass', // 'monclass' | 'name' | 'count'
    furnitureSortMode: 'rarity'  // 'rarity' | 'name'
};

// --- 現在の背景IDに対応する配置済み家具・配置モンスターのオブジェクトを取得する（無ければ作る） ---
function getPlacedFurnitureForBg(bgId) {
    if (!MYROOM_STATE.placedFurniture[bgId]) MYROOM_STATE.placedFurniture[bgId] = {};
    return MYROOM_STATE.placedFurniture[bgId];
}
function getPlacedMonstersForBg(bgId) {
    if (!MYROOM_STATE.placedMonsters[bgId]) MYROOM_STATE.placedMonsters[bgId] = {};
    return MYROOM_STATE.placedMonsters[bgId];
}

// --- 指定した家具IDが、全背景を通じて合計何個「設置済み」になっているかを数える ---
// excludeBgId/excludeInstanceKey : 今まさに編集中のインスタンス自身は集計から除外する
function countFurnitureUsedAcrossBackgrounds(furnitureId, excludeBgId, excludeInstanceKey) {
    let count = 0;
    Object.keys(MYROOM_STATE.placedFurniture).forEach(bgId => {
        const instances = MYROOM_STATE.placedFurniture[bgId] || {};
        Object.keys(instances).forEach(instanceKey => {
            if (bgId === excludeBgId && instanceKey === excludeInstanceKey) return;
            if (instances[instanceKey].furnitureId === furnitureId) count++;
        });
    });
    return count;
}

// --- モンスターへの「エサ」の種類。モン類ごとに好みが分かれる（好物を与えると絆ポイントが多く貯まる） ---
const MYROOM_FOOD_TYPES = [
    { id: 'meat', emoji: '🍖', name: 'お肉', likedByClass: 'beast' },
    { id: 'fish', emoji: '🐟', name: 'お魚', likedByClass: 'monster' },
    { id: 'mineral', emoji: '💎', name: '鉱石', likedByClass: 'inorganic' },
    { id: 'herb', emoji: '🌿', name: '薬草', likedByClass: 'creation' },
    { id: 'honey', emoji: '🍯', name: '蜜', likedByClass: 'spirit' },
    { id: 'spice', emoji: '🌶️', name: '香辛料', likedByClass: 'demon' }
];
const MYROOM_BOND_PET_AMOUNT = 1;
const MYROOM_BOND_LIKED_FOOD_AMOUNT = 3;
const MYROOM_BOND_DISLIKED_FOOD_AMOUNT = 0;
const MYROOM_DAILY_PET_LIMIT = 5;
const MYROOM_DAILY_FEED_LIMIT = 3;

// --- 端末のローカル日付を「YYYY-MM-DD」文字列で返す（1日ごとの上限リセット判定用） ---
function getMyRoomTodayDateString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// --- 指定した組み合わせ（種族＋オーラ）の、今日の撫でる／エサ回数を取得する ---
async function fetchMyRoomDailyInteraction(bondKey) {
    const empty = { date: null, petCount: 0, feedCount: 0 };
    if (typeof initFirebase !== 'function' || !initFirebase()) return empty;
    try {
        const pid = getMyPlayerId();
        const snap = await firebaseDb.ref(`player_myroom/${pid}/dailyInteraction/${bondKey}`).once('value');
        const val = snap.val();
        if (!val || val.date !== getMyRoomTodayDateString()) return empty; // 日付が変わっていればリセット扱い
        return { date: val.date, petCount: val.petCount || 0, feedCount: val.feedCount || 0 };
    } catch (e) {
        console.error('[マイルーム] 本日の交流回数取得エラー:', e);
        return empty;
    }
}

// --- 「撫でる」または「エサ」を1回消費できるか判定し、できれば回数を+1して保存する ---
// type: 'pet' | 'feed'。上限に達している場合は success:false を返し、何も変更しない。
async function tryConsumeMyRoomInteraction(bondKey, type) {
    const current = await fetchMyRoomDailyInteraction(bondKey);
    const limit = type === 'pet' ? MYROOM_DAILY_PET_LIMIT : MYROOM_DAILY_FEED_LIMIT;
    const currentCount = type === 'pet' ? current.petCount : current.feedCount;
    if (currentCount >= limit) return { success: false, remaining: 0, limit };

    const next = {
        date: getMyRoomTodayDateString(),
        petCount: type === 'pet' ? current.petCount + 1 : current.petCount,
        feedCount: type === 'feed' ? current.feedCount + 1 : current.feedCount
    };
    if (typeof initFirebase === 'function' && initFirebase()) {
        try {
            const pid = getMyPlayerId();
            await firebaseDb.ref(`player_myroom/${pid}/dailyInteraction/${bondKey}`).set(next);
        } catch (e) {
            console.error('[マイルーム] 本日の交流回数保存エラー:', e);
        }
    }
    const usedCount = type === 'pet' ? next.petCount : next.feedCount;
    return { success: true, remaining: limit - usedCount, limit };
}

// --- 絆ポイント（種族＋オーラの組み合わせ単位で管理。床から外しても引き継がれる） ---
async function fetchMyRoomBond(bondKey) {
    if (typeof initFirebase !== 'function' || !initFirebase()) return 0;
    try {
        const pid = getMyPlayerId();
        const snap = await firebaseDb.ref(`player_myroom/${pid}/bonds/${bondKey}`).once('value');
        return snap.val() || 0;
    } catch (e) {
        console.error('[マイルーム] 絆ポイント取得エラー:', e);
        return 0;
    }
}

async function addMyRoomBond(bondKey, amount) {
    if (!amount || typeof initFirebase !== 'function' || !initFirebase()) return;
    try {
        const pid = getMyPlayerId();
        await firebaseDb.ref(`player_myroom/${pid}/bonds/${bondKey}`).transaction(current => Math.max(0, (current || 0) + amount));
    } catch (e) {
        console.error('[マイルーム] 絆ポイント更新エラー:', e);
    }
}

// =====================================================
// データ取得・保存
// =====================================================
async function fetchMyRoomData() {
    if (typeof initFirebase !== 'function' || !initFirebase()) return null;
    const pid = getMyPlayerId();
    try {
        const [furnitureSnap, monstersSnap, placementSnap] = await Promise.all([
            firebaseDb.ref(`player_inventory/${pid}/furniture`).once('value'),
            firebaseDb.ref(`player_inventory/${pid}/monsters`).once('value'),
            firebaseDb.ref(`player_myroom/${pid}`).once('value')
        ]);
        return {
            furnitureCounts: furnitureSnap.val() || {},
            monsterCounts: monstersSnap.val() || {},
            placement: placementSnap.val() || {}
        };
    } catch (e) {
        console.error('[マイルーム] データ取得エラー:', e);
        return null;
    }
}

async function saveMyRoomPlacement() {
    if (typeof initFirebase !== 'function' || !initFirebase()) return;
    const pid = getMyPlayerId();
    try {
        await firebaseDb.ref(`player_myroom/${pid}`).update({
            backgroundId: MYROOM_STATE.backgroundId,
            placedFurniture: MYROOM_STATE.placedFurniture,
            placedMonsters: MYROOM_STATE.placedMonsters
        });
    } catch (e) {
        console.error('[マイルーム] 設置状態の保存エラー:', e);
    }
}

function buildOwnedFurnitureList(furnitureCounts) {
    return Object.keys(furnitureCounts).map(id => {
        const def = (typeof GACHA_FURNITURE_POOL !== 'undefined') ? GACHA_FURNITURE_POOL.find(f => f.id === id) : null;
        return {
            id,
            count: furnitureCounts[id] || 0,
            name: def ? def.name : id,
            emoji: def ? def.emoji : '📦',
            image: def ? def.image : null
        };
    }).filter(f => f.count > 0);
}

function buildOwnedMonsterList(monsterCounts) {
    return Object.keys(monsterCounts).map(key => {
        const lastUnderscoreIdx = key.lastIndexOf('_');
        const speciesId = key.slice(0, lastUnderscoreIdx);
        const auraKey = key.slice(lastUnderscoreIdx + 1);
        const tmpl = (typeof MONSTER_TEMPLATES !== 'undefined') ? MONSTER_TEMPLATES[speciesId] : null;
        return {
            key, speciesId, auraKey,
            count: monsterCounts[key] || 0,
            name: tmpl ? tmpl.name : speciesId,
            emoji: tmpl ? tmpl.emoji : '❓'
        };
    }).filter(m => m.count > 0);
}

// =====================================================
// 画面遷移
// =====================================================
async function openMyRoomScreen() {
    changeScreen('screen-myroom');
    stopAllMyRoomWander();

    const data = await fetchMyRoomData();
    if (!data) return;

    MYROOM_STATE.ownedFurniture = buildOwnedFurnitureList(data.furnitureCounts);
    MYROOM_STATE.ownedMonsters = buildOwnedMonsterList(data.monsterCounts);
    MYROOM_STATE.backgroundId = (data.placement && data.placement.backgroundId) || MYROOM_DEFAULT_BACKGROUND_ID;
    MYROOM_STATE.placedFurniture = (data.placement && data.placement.placedFurniture) || {};
    MYROOM_STATE.placedMonsters = (data.placement && data.placement.placedMonsters) || {};

    applyMyRoomBackground();
    renderMyRoomFurnitureItems();
    renderMyRoomMonsterFloor();
    await checkMyRoomFirstVisitTicket();
    refreshMyRoomTicketBanner();
}

// --- 背景画像を差し替え、スロット・徘徊範囲もその背景専用の設定に切り替える ---
function applyMyRoomBackground() {
    const bg = getCurrentMyRoomBackground();
    const imgEl = document.getElementById('myroom-bg-image');
    if (imgEl) imgEl.src = bg.file;
}

function openMyRoomBackgroundPicker() {
    const modal = document.getElementById('myroom-background-picker-modal');
    const list = document.getElementById('myroom-background-picker-list');
    if (!modal || !list) return;

    list.innerHTML = Object.values(MYROOM_BACKGROUNDS).map(bg => `
        <button onclick="selectMyRoomBackground('${bg.id}')"
            class="relative rounded-xl overflow-hidden border-2 ${MYROOM_STATE.backgroundId === bg.id ? 'border-amber-400' : 'border-amber-900/50'} active:scale-[0.97] transition-all">
            <img src="${bg.file}" class="w-full h-28 object-cover" alt="${bg.name}">
            <span class="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] font-bold py-1 text-center">${bg.emoji} ${bg.name}</span>
            ${MYROOM_STATE.backgroundId === bg.id ? '<span class="absolute top-1 right-1 bg-amber-400 text-slate-900 text-[8px] font-black px-1.5 py-0.5 rounded-full">使用中</span>' : ''}
        </button>
    `).join('');

    modal.classList.remove('hidden');
}

function closeMyRoomBackgroundPicker() {
    const modal = document.getElementById('myroom-background-picker-modal');
    if (modal) modal.classList.add('hidden');
}

function selectMyRoomBackground(bgId) {
    if (!MYROOM_BACKGROUNDS[bgId] || MYROOM_STATE.backgroundId === bgId) {
        closeMyRoomBackgroundPicker();
        return;
    }
    MYROOM_STATE.backgroundId = bgId;
    applyMyRoomBackground();
    renderMyRoomFurnitureItems();
    renderMyRoomMonsterFloor();
    closeMyRoomBackgroundPicker();
    saveMyRoomPlacement();
    if (typeof showToast === 'function') showToast(`🖼️ 背景を「${MYROOM_BACKGROUNDS[bgId].name}」に切り替えました`);
}

// --- 初回アクセス判定：まだ一度も来たことがなければ、初回特典チケットを1枚付与する ---
async function checkMyRoomFirstVisitTicket() {
    if (typeof initFirebase !== 'function' || !initFirebase()) return;
    const pid = getMyPlayerId();
    try {
        const ref = firebaseDb.ref(`player_myroom/${pid}/hasVisitedBefore`);
        const snap = await ref.once('value');
        if (snap.val()) return; // 既に来訪済み
        await ref.set(true);
        await awardMyRoomTicket(1);
        if (typeof showToast === 'function') {
            showToast('🎉 マイルームへようこそ！初回特典チケットを1枚獲得しました！');
        }
    } catch (e) {
        console.error('[マイルーム] 初回訪問判定エラー:', e);
    }
}

async function refreshMyRoomTicketBanner() {
    const banner = document.getElementById('myroom-ticket-banner');
    const countEl = document.getElementById('myroom-ticket-count');
    if (!banner) return;
    const count = (typeof fetchMyRoomTicketCount === 'function') ? await fetchMyRoomTicketCount() : 0;
    if (countEl) countEl.textContent = count;
    banner.classList.toggle('hidden', count <= 0);
}

function closeMyRoomScreen() {
    stopAllMyRoomWander();
    changeScreen('screen-title');
}

// =====================================================
// 絆バフ：絆ポイントが貯まったモンスターは、ガッツファクトリー／エンドレスモードで
// 自分のパーティに編成された時だけ、ステータスが少し上昇する（味方専用のバフ）
// =====================================================
const MYROOM_BOND_BUFF_POINTS_PER_PERCENT = 20; // 20ポイントごとに+1%
const MYROOM_BOND_BUFF_MAX_PERCENT = 25;        // 上限+25%（絆500ポイントで到達）

// --- 現在の全ての絆ポイントをまとめて取得する（{speciesId_auraKey: points, ...}） ---
async function fetchAllMyRoomBonds() {
    if (typeof initFirebase !== 'function' || !initFirebase()) return {};
    try {
        const pid = getMyPlayerId();
        const snap = await firebaseDb.ref(`player_myroom/${pid}/bonds`).once('value');
        return snap.val() || {};
    } catch (e) {
        console.error('[マイルーム] 絆一覧取得エラー:', e);
        return {};
    }
}

function getMyRoomBondBuffMultiplier(bondPoints) {
    const pct = Math.min(MYROOM_BOND_BUFF_MAX_PERCENT, Math.floor((bondPoints || 0) / MYROOM_BOND_BUFF_POINTS_PER_PERCENT));
    return 1 + pct / 100;
}

// --- パーティ（配列）内のモンスターに絆バフを適用する。既に適用済みのものはスキップする ---
// bondsMap: fetchAllMyRoomBonds() で取得したもの。呼び出し側で1回だけ取得して渡す想定。
function applyMyRoomBondBuffToParty(party, bondsMap) {
    (party || []).forEach(m => {
        if (!m || m.bondBuffApplied || !m.stats) return;
        const bondKey = `${m.speciesId}_${m.aura}`;
        const points = (bondsMap || {})[bondKey] || 0;
        if (points <= 0) { m.bondBuffApplied = true; return; }
        const mult = getMyRoomBondBuffMultiplier(points);
        m.stats.maxLife = Math.round(m.stats.maxLife * mult);
        m.stats.life = m.stats.maxLife;
        m.stats.pow = Math.round(m.stats.pow * mult);
        m.stats.int = Math.round(m.stats.int * mult);
        m.stats.hit = Math.round(m.stats.hit * mult);
        m.stats.spd = Math.round(m.stats.spd * mult);
        m.stats.def = Math.round(m.stats.def * mult);
        m.bondBuffApplied = true;
        m.bondBuffPct = Math.round((mult - 1) * 100);
    });
}

// =====================================================
// 家具（自由配置）
// ・ガチャの円盤石と同じ考え方：指でドラッグして好きな場所に配置
// ・配置後もタップすると操作パネルが開き、サイズ・向き・反転を調整、再配置（再ドラッグ）、撤去ができる
// =====================================================
function renderMyRoomFurnitureItems() {
    const container = document.getElementById('myroom-furniture-slots');
    if (!container) return;
    container.innerHTML = '';

    const bg = getCurrentMyRoomBackground();
    const instances = getPlacedFurnitureForBg(bg.id);
    Object.keys(instances).forEach(instanceKey => {
        spawnMyRoomFurnitureElement(instanceKey, instances[instanceKey], container);
    });
}

function getMyRoomFurnitureDef(furnitureId) {
    return (MYROOM_STATE.ownedFurniture.find(f => f.id === furnitureId))
        || (typeof GACHA_FURNITURE_POOL !== 'undefined' ? GACHA_FURNITURE_POOL.find(f => f.id === furnitureId) : null);
}

// --- transform文字列を組み立てる（中央寄せ＋回転＋拡大縮小＋左右反転をまとめて1つのtransformにする） ---
function buildMyRoomFurnitureTransform(instance) {
    const scale = instance.scale || 1;
    const flipX = instance.flipped ? -1 : 1;
    const rotation = instance.rotation || 0;
    return `translate(-50%,-50%) rotate(${rotation}deg) scale(${flipX * scale}, ${scale})`;
}

function spawnMyRoomFurnitureElement(instanceKey, instance, container) {
    const def = getMyRoomFurnitureDef(instance.furnitureId);
    if (!def) return;

    const el = document.createElement('div');
    el.className = 'myroom-furniture-item absolute cursor-pointer flex items-center justify-center text-6xl';
    el.style.position = 'absolute';
    el.style.width = `${MYROOM_FURNITURE_BASE_SIZE_PX}px`;
    el.style.height = `${MYROOM_FURNITURE_BASE_SIZE_PX}px`;
    el.style.left = `${instance.xPct}%`;
    el.style.top = `${instance.yPct}%`;
    el.style.transform = buildMyRoomFurnitureTransform(instance);
    el.style.touchAction = 'none';
    el.dataset.instanceKey = instanceKey;
    container.appendChild(el);

    renderFurnitureIcon(el, def, { imgClassName: 'w-full h-full object-contain pointer-events-none drop-shadow-lg' });

    setupMyRoomFurnitureDragHandlers(el, instanceKey);
}

// --- ドラッグ操作（Pointer Eventsでマウス・タッチ両対応。ガチャの円盤石ドラッグと同じ考え方） ---
function setupMyRoomFurnitureDragHandlers(el, instanceKey) {
    let pointerId = null;
    let startClientX = 0, startClientY = 0;
    let moved = false;
    const TAP_THRESHOLD_PX = 6;

    el.addEventListener('pointerdown', (e) => {
        pointerId = e.pointerId;
        startClientX = e.clientX;
        startClientY = e.clientY;
        moved = false;
        el.style.transition = 'none';
        el.style.zIndex = '50';
        el.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
    });

    el.addEventListener('pointermove', (e) => {
        if (e.pointerId !== pointerId) return;
        const dx = e.clientX - startClientX;
        const dy = e.clientY - startClientY;
        if (!moved && Math.hypot(dx, dy) < TAP_THRESHOLD_PX) return;
        moved = true;

        const container = document.getElementById('myroom-area');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        let xPct = ((e.clientX - rect.left) / rect.width) * 100;
        let yPct = ((e.clientY - rect.top) / rect.height) * 100;
        const bounds = getCurrentMyRoomBackground().furnitureBounds;
        xPct = Math.min(bounds.xMax, Math.max(bounds.xMin, xPct));
        yPct = Math.min(bounds.yMax, Math.max(bounds.yMin, yPct));
        el.style.left = `${xPct}%`;
        el.style.top = `${yPct}%`;
        e.preventDefault();
    });

    el.addEventListener('pointerup', (e) => {
        if (e.pointerId !== pointerId) return;
        pointerId = null;
        el.style.zIndex = '';
        el.style.transition = ''; // ドラッグ中に外していたtransitionを戻す（ボタン操作時のアニメーションのため）

        const bg = getCurrentMyRoomBackground();
        const instances = getPlacedFurnitureForBg(bg.id);
        const instance = instances[instanceKey];
        if (!instance) return;

        if (moved) {
            // ドラッグ操作：着地位置を%換算して保存する
            const container = document.getElementById('myroom-area');
            if (container) {
                const rect = container.getBoundingClientRect();
                let xPct = ((e.clientX - rect.left) / rect.width) * 100;
                let yPct = ((e.clientY - rect.top) / rect.height) * 100;
                const bounds = bg.furnitureBounds;
                xPct = Math.min(bounds.xMax, Math.max(bounds.xMin, xPct));
                yPct = Math.min(bounds.yMax, Math.max(bounds.yMin, yPct));
                instance.xPct = xPct;
                instance.yPct = yPct;
            }
            saveMyRoomPlacement();
        } else {
            // タップ操作：操作パネル（サイズ・回転・反転・撤去）を開く
            openMyRoomFurnitureOptions(instanceKey);
        }
    });

    el.addEventListener('pointercancel', () => { pointerId = null; el.style.zIndex = ''; });
}

// --- 家具ピッカー：所持している家具から新しく1つ配置する ---
function getSortedOwnedFurniture() {
    const list = [...MYROOM_STATE.ownedFurniture];
    if (MYROOM_STATE.furnitureSortMode === 'name') {
        list.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    } else {
        list.sort((a, b) => {
            const defA = typeof GACHA_FURNITURE_POOL !== 'undefined' ? GACHA_FURNITURE_POOL.find(f => f.id === a.id) : null;
            const defB = typeof GACHA_FURNITURE_POOL !== 'undefined' ? GACHA_FURNITURE_POOL.find(f => f.id === b.id) : null;
            const rA = defA ? defA.rarity : 0;
            const rB = defB ? defB.rarity : 0;
            if (rA !== rB) return rB - rA; // レア度が高い順
            return a.name.localeCompare(b.name, 'ja');
        });
    }
    return list;
}

function setMyRoomFurnitureSortMode(mode) {
    MYROOM_STATE.furnitureSortMode = mode;
    openMyRoomFurniturePicker();
}

function openMyRoomFurniturePicker() {
    const modal = document.getElementById('myroom-furniture-picker-modal');
    const list = document.getElementById('myroom-furniture-picker-list');
    const sortSelect = document.getElementById('myroom-furniture-sort-select');
    if (!modal || !list) return;
    if (sortSelect) sortSelect.value = MYROOM_STATE.furnitureSortMode;

    const bg = getCurrentMyRoomBackground();
    if (MYROOM_STATE.ownedFurniture.length === 0) {
        list.innerHTML = `<p class="text-gray-500 text-[11px] text-center py-6">まだ家具を持っていません。<br>祈りの神殿（ガチャ）で手に入れよう！</p>`;
    } else {
        const sorted = getSortedOwnedFurniture();
        list.innerHTML = sorted.map(f => {
            const usedElsewhere = countFurnitureUsedAcrossBackgrounds(f.id, null, null);
            const remaining = f.count - usedElsewhere;
            const iconId = `myroom-furniture-picker-icon-${f.id}`;
            if (remaining <= 0) {
                return `
                    <div class="w-full flex items-center gap-2 bg-[#150b07] border border-gray-800 rounded-lg px-2 py-2 opacity-50">
                        <div id="${iconId}" class="w-8 h-8 flex-shrink-0 flex items-center justify-center text-xl grayscale"></div>
                        <span class="flex-1 text-xs text-gray-500 font-bold">${f.name}</span>
                        <span class="text-[9px] text-gray-600 font-bold">全て使用中</span>
                    </div>
                `;
            }
            return `
                <button onclick="addNewMyRoomFurnitureInstance('${f.id}')"
                    class="w-full flex items-center gap-2 bg-[#1a120b] hover:bg-[#241b12] border border-amber-900/50 rounded-lg px-2 py-2 text-left active:scale-[0.98] transition-all">
                    <div id="${iconId}" class="w-8 h-8 flex-shrink-0 flex items-center justify-center text-xl"></div>
                    <span class="flex-1 text-xs text-amber-100 font-bold">${f.name}</span>
                    <span class="text-[10px] text-gray-400">残り${remaining}／×${f.count}</span>
                </button>
            `;
        }).join('');

        // アイコン（画像 or 絵文字）を後から個別に描画する
        sorted.forEach(f => {
            const iconEl = document.getElementById(`myroom-furniture-picker-icon-${f.id}`);
            if (iconEl) renderFurnitureIcon(iconEl, f, { imgClassName: 'w-full h-full object-contain' });
        });
    }
    modal.classList.remove('hidden');
}

function closeMyRoomFurniturePicker() {
    const modal = document.getElementById('myroom-furniture-picker-modal');
    if (modal) modal.classList.add('hidden');
}

function addNewMyRoomFurnitureInstance(furnitureId) {
    const bg = getCurrentMyRoomBackground();
    const usedElsewhere = countFurnitureUsedAcrossBackgrounds(furnitureId, null, null);
    const owned = (MYROOM_STATE.ownedFurniture.find(f => f.id === furnitureId) || {}).count || 0;
    if (usedElsewhere >= owned) {
        if (typeof showToast === 'function') showToast('その家具は他の場所で使用中で、これ以上置けません');
        return;
    }

    const bounds = bg.furnitureBounds;
    const instanceKey = `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const instances = getPlacedFurnitureForBg(bg.id);
    instances[instanceKey] = {
        furnitureId,
        xPct: (bounds.xMin + bounds.xMax) / 2,
        yPct: (bounds.yMin + bounds.yMax) / 2,
        scale: 1,
        rotation: 0,
        flipped: false
    };
    renderMyRoomFurnitureItems();
    closeMyRoomFurniturePicker();
    saveMyRoomPlacement();
    if (typeof showToast === 'function') showToast('🪑 配置しました。ドラッグして好きな場所に動かせます');
}

// --- 家具の操作パネル（サイズ・回転・反転・撤去） ---
function openMyRoomFurnitureOptions(instanceKey) {
    MYROOM_STATE.activeFurnitureKey = instanceKey;
    const bg = getCurrentMyRoomBackground();
    const instance = getPlacedFurnitureForBg(bg.id)[instanceKey];
    if (!instance) return;
    const def = getMyRoomFurnitureDef(instance.furnitureId);

    const modal = document.getElementById('myroom-furniture-options-modal');
    const nameEl = document.getElementById('myroom-furniture-options-name');
    const iconEl = document.getElementById('myroom-furniture-options-icon');
    if (!modal) return;
    if (nameEl) nameEl.textContent = def ? def.name : '家具';
    if (iconEl) renderFurnitureIcon(iconEl, def, { imgClassName: 'w-full h-full object-contain' });

    // 調整中のアイテムを見失わないよう、手前に持ってきてハイライトする
    const el = document.querySelector(`.myroom-furniture-item[data-instance-key="${CSS.escape(instanceKey)}"]`);
    if (el) {
        el.style.zIndex = '45';
        el.classList.add('myroom-furniture-item-active');
    }

    modal.classList.remove('hidden');
}

function closeMyRoomFurnitureOptions() {
    const modal = document.getElementById('myroom-furniture-options-modal');
    if (modal) modal.classList.add('hidden');
    if (MYROOM_STATE.activeFurnitureKey) {
        const el = document.querySelector(`.myroom-furniture-item[data-instance-key="${CSS.escape(MYROOM_STATE.activeFurnitureKey)}"]`);
        if (el) {
            el.style.zIndex = '';
            el.classList.remove('myroom-furniture-item-active');
        }
    }
    MYROOM_STATE.activeFurnitureKey = null;
}

function adjustMyRoomFurnitureScale(delta) {
    const instance = getActiveMyRoomFurnitureInstance();
    if (!instance) return;
    const next = Math.round(((instance.scale || 1) + delta) * 100) / 100;
    instance.scale = Math.min(MYROOM_FURNITURE_SCALE_MAX, Math.max(MYROOM_FURNITURE_SCALE_MIN, next));
    applyActiveMyRoomFurnitureTransform();
}

function rotateMyRoomFurniture() {
    const instance = getActiveMyRoomFurnitureInstance();
    if (!instance) return;
    instance.rotation = ((instance.rotation || 0) + MYROOM_FURNITURE_ROTATE_STEP) % 360;
    applyActiveMyRoomFurnitureTransform();
}

function flipMyRoomFurniture() {
    const instance = getActiveMyRoomFurnitureInstance();
    if (!instance) return;
    instance.flipped = !instance.flipped;
    applyActiveMyRoomFurnitureTransform();
}

function getActiveMyRoomFurnitureInstance() {
    const key = MYROOM_STATE.activeFurnitureKey;
    if (!key) return null;
    const bg = getCurrentMyRoomBackground();
    return getPlacedFurnitureForBg(bg.id)[key] || null;
}

function applyActiveMyRoomFurnitureTransform() {
    const key = MYROOM_STATE.activeFurnitureKey;
    const instance = getActiveMyRoomFurnitureInstance();
    if (!key || !instance) return;
    const el = document.querySelector(`.myroom-furniture-item[data-instance-key="${CSS.escape(key)}"]`);
    if (el) el.style.transform = buildMyRoomFurnitureTransform(instance);
    saveMyRoomPlacement();
}

function removeMyRoomFurniture() {
    const key = MYROOM_STATE.activeFurnitureKey;
    if (!key) return;
    const bg = getCurrentMyRoomBackground();
    delete getPlacedFurnitureForBg(bg.id)[key];
    renderMyRoomFurnitureItems();
    closeMyRoomFurnitureOptions();
    saveMyRoomPlacement();
    if (typeof showToast === 'function') showToast('家具を撤去しました');
}

// =====================================================
// モンスター配置・徘徊
// =====================================================
function renderMyRoomMonsterFloor() {
    const floor = document.getElementById('myroom-monster-floor');
    if (!floor) return;
    stopAllMyRoomWander();
    floor.innerHTML = '';
    MYROOM_STATE.monsterTokenEls = {};

    const bg = getCurrentMyRoomBackground();
    const monstersForBg = getPlacedMonstersForBg(bg.id);
    Object.keys(monstersForBg).forEach(placementKey => {
        const info = monstersForBg[placementKey];
        if (!info) return;
        spawnMyRoomMonsterToken(placementKey, info, floor);
    });
}

function spawnMyRoomMonsterToken(placementKey, info, floor) {
    const tmpl = MONSTER_TEMPLATES[info.speciesId];
    if (!tmpl) return;

    const bg = getCurrentMyRoomBackground();
    const bounds = bg.wanderBounds;
    const startX = bounds.xMin + Math.random() * (bounds.xMax - bounds.xMin);
    const startY = bounds.yMin + Math.random() * (bounds.yMax - bounds.yMin);

    // ○○_歩行.png の専用スプライトを持つモンスターは、他のモンスターより一回り小さく
    // 作られている素材が多いため、表示サイズに倍率をかけて少し大きめに表示する
    const walkSpriteConfig = getMyRoomWalkSpriteConfig(tmpl);
    const baseTokenSize = bg.tokenSizePx || 56;
    const tokenSize = walkSpriteConfig ? Math.round(baseTokenSize * walkSpriteConfig.scale) : baseTokenSize;

    const token = document.createElement('div');
    token.className = 'myroom-monster-token absolute cursor-pointer pointer-events-auto';
    token.style.position = 'absolute'; // renderMonsterVisual側が「未設定ならrelativeにする」処理を持つため、先に明示しておく
    token.style.width = `${tokenSize}px`;
    token.style.height = `${tokenSize}px`;
    token.style.left = `${startX}%`;
    token.style.top = `${startY}%`;
    token.style.transform = 'translate(-50%,-50%)';
    token.dataset.placementKey = placementKey;
    token.onclick = () => openMyRoomMonsterOptions(placementKey);
    floor.appendChild(token);
    MYROOM_STATE.monsterTokenEls[placementKey] = token;
    updateMyRoomMonsterZIndex(token); // Y座標が低い（奥にいるように見える）ほど手前に表示する重なり順を反映

    if (walkSpriteConfig) {
        renderMyRoomWalkSprite(token, walkSpriteConfig, info.auraKey);
    } else {
        renderMonsterVisual(token, tmpl.name, tmpl.emoji, false, true, info.auraKey);
    }
    startMyRoomMonsterWander(placementKey, token);
}

// =====================================================
// マイルーム専用：モンスターごとの歩行スプライトシート
//   通常、マイルームのモンスターは静止画（renderMonsterVisual、バトル演出と共通）を
//   ただ左右に動かして表示しているが、「○○_歩行.png」という専用の歩行アニメーション素材が
//   用意されているモンスターだけは、そちらを優先して使う。
//   ※対象はマイルームでの表示のみ。バトル演出（renderMonsterVisual）は今まで通り
//     images/○○.png の静止画のままにする。
//   今後もモンスターを追加していく前提のため、モンスターごとの違い（画像パス・コマ割り・
//   静止ポーズにする位置・表示倍率）はすべてこの設定オブジェクトにまとめている。
//   ★新しいモンスターの歩行スプライトを追加する手順：
//     1. images/myroom/ に「○○_歩行.png」を配置する
//     2. 下のMYROOM_WALK_SPRITESに、そのモンスターのidをキーとしてエントリを追加する
// =====================================================
const MYROOM_WALK_SPRITES = {
    durahan: {
        id: 'durahan',
        image: 'images/myroom/デュラハン_歩行.png',
        cols: 5,
        rows: 5,
        // 静止時に不自然な「中途半端なポーズ」で止まらないよう、あらかじめ見た目の良いコマだけを
        // 静止ポーズ用として指定しておく（0始まりのフレーム番号）。
        // 指定：4列目1行目・1列目3行目・1列目4行目・3列目5行目（列・行はどちらも1始まり）
        idleFrames: [3, 10, 15, 22],
        // 他のモンスターに比べて素材が一回り小さいため、少し大きめに表示する
        scale: 1.3
    },
    zan: {
        id: 'zan',
        image: 'images/myroom/ザン_歩行.png',
        cols: 5,
        rows: 5,
        // 指定：1列目2行目（列・行はどちらも1始まり。0始まりのフレーム番号では5番）
        idleFrames: [5],
        scale: 1.3
    }
};

const MYROOM_WALK_SPRITE_FRAME_MS = 44; // 1コマの表示時間（25コマ構成で約1.1秒/周）

// --- 指定モンスターに専用の歩行スプライト設定があれば返す（無ければnull） ---
function getMyRoomWalkSpriteConfig(tmpl) {
    if (!tmpl) return null;
    return MYROOM_WALK_SPRITES[tmpl.id] || null;
}

// --- フレーム番号（0始まり）から background-position / mask-position の値を計算する ---
function getMyRoomWalkSpriteFramePosition(config, frameIndex) {
    const col = frameIndex % config.cols;
    const row = Math.floor(frameIndex / config.cols);
    const x = (col * 100) / (config.cols - 1);
    const y = (row * 100) / (config.rows - 1);
    return `${x}% ${y}%`;
}

// --- 指定したフレームを、トークン内のスプライト要素（＋オーラ着色オーバーレイ）に反映する ---
function setMyRoomWalkSpriteFrame(token, config, frameIndex) {
    const spriteEl = token.querySelector('.myroom-walk-sprite');
    if (!spriteEl) return; // 歩行スプライト対象のモンスターでなければ何もしない
    const tintEl = token.querySelector('.myroom-walk-sprite-tint');
    const pos = getMyRoomWalkSpriteFramePosition(config, frameIndex);
    spriteEl.style.backgroundPosition = pos;
    if (tintEl) {
        tintEl.style.maskPosition = pos;
        tintEl.style.webkitMaskPosition = pos;
    }
}

// --- モンスターの歩行スプライトシートを描画する ---
//   コマ送り自体はCSSアニメーションではなくJS側（setInterval）で1コマずつ進める。
//   これは、停止時に「必ず見た目の良い決まったコマで止める」ため
//   （CSSアニメーションをpauseするだけだと、途中の中途半端なコマで静止してしまう）。
function renderMyRoomWalkSprite(containerEl, config, auraKey) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    if (!containerEl.style.position) containerEl.style.position = 'relative';
    containerEl.style.isolation = 'isolate';
    containerEl.dataset.walkSpriteId = config.id; // 徘徊AI側からもこのidで設定を再取得できるようにしておく

    const encodedImagePath = encodeURI(config.image);
    const backgroundSize = `${config.cols * 100}% ${config.rows * 100}%`;

    const spriteEl = document.createElement('div');
    spriteEl.className = 'myroom-walk-sprite absolute inset-0 w-full h-full drop-shadow-lg';
    spriteEl.style.backgroundImage = `url("${encodedImagePath}")`;
    spriteEl.style.backgroundSize = backgroundSize;
    containerEl.appendChild(spriteEl);

    // 他のモンスター同様、オーラが設定されていれば同じマスク方式で色を重ねる
    const aura = auraKey ? AURA_TYPES[auraKey] : null;
    if (aura && aura.hex && MONSTER_VISUAL_AURA_TINT_STRENGTH > 0) {
        const tintEl = document.createElement('div');
        tintEl.className = 'myroom-walk-sprite-tint absolute inset-0 w-full h-full';
        tintEl.style.pointerEvents = 'none';
        tintEl.style.backgroundColor = aura.hex;
        tintEl.style.opacity = String(MONSTER_VISUAL_AURA_TINT_STRENGTH);
        tintEl.style.mixBlendMode = MONSTER_VISUAL_AURA_TINT_BLEND_MODE;
        tintEl.style.webkitMaskImage = `url("${encodedImagePath}")`;
        tintEl.style.maskImage = `url("${encodedImagePath}")`;
        tintEl.style.webkitMaskSize = backgroundSize;
        tintEl.style.maskSize = backgroundSize;
        containerEl.appendChild(tintEl);

        // mask-imageはブラウザ内部でCORSモードの通信を行うため、file://で直接開いている場合など
        // クロスオリジン扱いになる環境では読み込みに失敗し、マスクが効かないまま
        // 「着色した四角形がスプライト全体を覆ってしまう」壊れた見た目になることがある。
        // 読み込み失敗を検知したら着色オーバーレイごと取り除き、通常表示にフォールバックする。
        const maskLoadProbe = new Image();
        maskLoadProbe.crossOrigin = 'anonymous';
        maskLoadProbe.onerror = () => {
            if (tintEl.isConnected) tintEl.remove();
            console.warn(`[renderMyRoomWalkSprite] オーラ着色用マスクの読み込みに失敗したため、着色なしで表示します: ${config.image}（file:// で直接開いている場合は、ローカルサーバー経由での起動をお試しください）`);
        };
        maskLoadProbe.src = encodedImagePath;
    }

    // 初期状態（配置直後）も、指定した静止ポーズの中からランダムに1つ選んで表示する
    const idleFrame = config.idleFrames[Math.floor(Math.random() * config.idleFrames.length)];
    setMyRoomWalkSpriteFrame(containerEl, config, idleFrame);
}

// --- トークンが歩行スプライトを使っている場合、歩行中だけコマ送りを再生する ---
//   walking=true  : 0→(全コマ数-1)→0…とコマ送りを繰り返す
//   walking=false : コマ送りを止め、指定済みの静止ポーズの中からランダムに1つを表示する
function setMyRoomWalkSpriteWalking(placementKey, token, walking) {
    const spriteEl = token.querySelector('.myroom-walk-sprite');
    if (!spriteEl) return; // 歩行スプライト対象のモンスターでなければ何もしない
    const config = MYROOM_WALK_SPRITES[token.dataset.walkSpriteId];
    if (!config) return;
    const frameCount = config.cols * config.rows;

    if (MYROOM_STATE.walkSpriteAnimTimers[placementKey]) {
        clearInterval(MYROOM_STATE.walkSpriteAnimTimers[placementKey]);
        delete MYROOM_STATE.walkSpriteAnimTimers[placementKey];
    }

    if (walking) {
        let frame = 0;
        setMyRoomWalkSpriteFrame(token, config, frame);
        MYROOM_STATE.walkSpriteAnimTimers[placementKey] = setInterval(() => {
            if (!token.isConnected) {
                clearInterval(MYROOM_STATE.walkSpriteAnimTimers[placementKey]);
                delete MYROOM_STATE.walkSpriteAnimTimers[placementKey];
                return;
            }
            frame = (frame + 1) % frameCount;
            setMyRoomWalkSpriteFrame(token, config, frame);
        }, MYROOM_WALK_SPRITE_FRAME_MS);
    } else {
        const idleFrame = config.idleFrames[Math.floor(Math.random() * config.idleFrames.length)];
        setMyRoomWalkSpriteFrame(token, config, idleFrame);
    }
}

// --- ランダム徘徊AI：一定の間隔で床の中のランダムな地点へゆっくり移動する ---
function startMyRoomMonsterWander(placementKey, token) {
    const scheduleNext = () => {
        const pauseMs = 1800 + Math.random() * 2800;
        MYROOM_STATE.wanderTimers[placementKey] = setTimeout(() => {
            wanderMyRoomMonsterStep(placementKey, token, scheduleNext);
        }, pauseMs);
    };
    scheduleNext();
}

function wanderMyRoomMonsterStep(placementKey, token, onArrive) {
    if (!token.isConnected) return; // 画面を離れて既に消えている場合は何もしない
    const bounds = getCurrentMyRoomBackground().wanderBounds;
    const currentX = parseFloat(token.style.left) || 50;
    const currentY = parseFloat(token.style.top) || 70;
    const targetX = bounds.xMin + Math.random() * (bounds.xMax - bounds.xMin);
    const targetY = bounds.yMin + Math.random() * (bounds.yMax - bounds.yMin);
    const movingRight = targetX >= currentX;
    const dist = Math.hypot(targetX - currentX, targetY - currentY);
    const duration = Math.max(1000, dist * 60);

    token.style.transform = `translate(-50%,-50%) scaleX(${movingRight ? 1 : -1})`;
    token.style.transition = `left ${duration}ms linear, top ${duration}ms linear`;
    token.style.left = `${targetX}%`;
    token.style.top = `${targetY}%`;

    // 移動中も含めて、Y座標が低い（奥にいるように見える）ほど手前に表示されるよう重なり順を追従させる
    animateMyRoomMonsterZIndex(token, duration);

    // 移動している間だけ歩行スプライトのコマ送りを再生し、目的地に着いたら指定の静止ポーズで止める
    setMyRoomWalkSpriteWalking(placementKey, token, true);
    MYROOM_STATE.wanderTimers[placementKey] = setTimeout(() => {
        setMyRoomWalkSpriteWalking(placementKey, token, false);
        onArrive();
    }, duration);
}

// --- モンスターの重なり順（z-index）を、その時点の画面上のY座標から算出して反映する ---
//   Y座標が低い（画面の上の方にいる）モンスターほど手前に表示されるようにする。
//   getBoundingClientRectで実際の描画位置を見ているため、CSSトランジションで移動している
//   途中（style.top自体はもう目的地の値になっている）でも、今まさに見えている位置を基準にできる。
function updateMyRoomMonsterZIndex(token) {
    if (!token || !token.isConnected) return;
    const floor = token.parentElement;
    if (!floor) return;
    const floorRect = floor.getBoundingClientRect();
    if (floorRect.height <= 0) return;
    const tokenRect = token.getBoundingClientRect();
    const centerY = tokenRect.top + tokenRect.height / 2 - floorRect.top;
    const yPct = (centerY / floorRect.height) * 100;
    token.style.zIndex = String(Math.round((100 - yPct) * 100));
}

// --- 移動アニメーションの間、requestAnimationFrameで重なり順を継続的に更新し続ける ---
function animateMyRoomMonsterZIndex(token, durationMs) {
    const startedAt = performance.now();
    const tick = (now) => {
        if (!token.isConnected) return;
        updateMyRoomMonsterZIndex(token);
        if (now - startedAt < durationMs) {
            requestAnimationFrame(tick);
        }
    };
    requestAnimationFrame(tick);
}

function stopAllMyRoomWander() {
    Object.values(MYROOM_STATE.walkSpriteAnimTimers).forEach(timerId => clearInterval(timerId));
    MYROOM_STATE.walkSpriteAnimTimers = {};
    Object.values(MYROOM_STATE.wanderTimers).forEach(timerId => clearTimeout(timerId));
    MYROOM_STATE.wanderTimers = {};
}

// --- モンスター配置ピッカー ---
const MYROOM_MONCLASS_ORDER = ['beast', 'monster', 'inorganic', 'creation', 'spirit', 'demon'];

function getSortedOwnedMonsters() {
    const list = [...MYROOM_STATE.ownedMonsters];
    const mode = MYROOM_STATE.monsterSortMode;
    if (mode === 'name') {
        list.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    } else if (mode === 'count') {
        list.sort((a, b) => b.count - a.count);
    } else {
        // モン類順：モン類のグループごとにまとめ、グループ内は名前順にする
        list.sort((a, b) => {
            const idxA = MYROOM_MONCLASS_ORDER.indexOf(getMonClassKeyForName(a.name));
            const idxB = MYROOM_MONCLASS_ORDER.indexOf(getMonClassKeyForName(b.name));
            if (idxA !== idxB) return idxA - idxB;
            return a.name.localeCompare(b.name, 'ja');
        });
    }
    return list;
}

function setMyRoomMonsterSortMode(mode) {
    MYROOM_STATE.monsterSortMode = mode;
    openMyRoomMonsterPicker();
}

function openMyRoomMonsterPicker() {
    const modal = document.getElementById('myroom-monster-picker-modal');
    const list = document.getElementById('myroom-monster-picker-list');
    const countLabel = document.getElementById('myroom-monster-count-label');
    const maxLabel = document.getElementById('myroom-monster-max-label');
    const sortSelect = document.getElementById('myroom-monster-sort-select');
    if (!modal || !list) return;
    if (sortSelect) sortSelect.value = MYROOM_STATE.monsterSortMode;

    const bg = getCurrentMyRoomBackground();
    const placedCount = Object.keys(getPlacedMonstersForBg(bg.id)).length;
    if (countLabel) countLabel.textContent = placedCount;
    if (maxLabel) maxLabel.textContent = MYROOM_MAX_MONSTERS;

    if (MYROOM_STATE.ownedMonsters.length === 0) {
        list.innerHTML = `<p class="text-gray-500 text-[11px] text-center py-6">まだモンスターを持っていません。<br>祈りの神殿（ガチャ）で★3を手に入れよう！</p>`;
    } else if (placedCount >= MYROOM_MAX_MONSTERS) {
        list.innerHTML = `<p class="text-amber-400 text-[11px] text-center py-6">床にはこれ以上配置できません。<br>先に誰かを床から外してください。</p>`;
    } else {
        // モンスターは所持数を消費しない観賞用の分身なので、他の背景に置いていても
        // ここではその点は気にせず、持っているものは全部選択肢に出す
        const sorted = getSortedOwnedMonsters();
        list.innerHTML = sorted.map(m => {
            const monClass = MON_CLASS_TYPES[getMonClassKeyForName(m.name)];
            return `
            <button onclick="placeMyRoomMonster('${m.speciesId}', '${m.auraKey}')"
                class="w-full flex items-center gap-2 bg-[#1a120b] hover:bg-[#241b12] border border-emerald-900/50 rounded-lg px-2 py-2 text-left active:scale-[0.98] transition-all">
                <span class="text-xl">${m.emoji}</span>
                <span class="flex-1 text-xs text-amber-100 font-bold">${m.name}<span class="ml-1 text-[9px]" style="color:${(AURA_TYPES[m.auraKey] || {}).hex || '#fff'}">${(AURA_TYPES[m.auraKey] || {}).emoji || ''}</span>${monClass ? ` <span class="text-[9px] text-gray-500">${monClass.emoji}${monClass.name}</span>` : ''}</span>
                <span class="text-[10px] text-gray-400">×${m.count}</span>
            </button>
        `;
        }).join('');
    }
    modal.classList.remove('hidden');
}

function closeMyRoomMonsterPicker() {
    const modal = document.getElementById('myroom-monster-picker-modal');
    if (modal) modal.classList.add('hidden');
}

function placeMyRoomMonster(speciesId, auraKey) {
    const bg = getCurrentMyRoomBackground();
    const monstersForBg = getPlacedMonstersForBg(bg.id);
    const placedCount = Object.keys(monstersForBg).length;
    if (placedCount >= MYROOM_MAX_MONSTERS) return;
    const placementKey = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    monstersForBg[placementKey] = { speciesId, auraKey };
    renderMyRoomMonsterFloor();
    closeMyRoomMonsterPicker();
    saveMyRoomPlacement();
    if (typeof showToast === 'function') showToast('🐾 モンスターを床に配置しました');
}

function removeMyRoomMonster(placementKey) {
    if (MYROOM_STATE.wanderTimers[placementKey]) {
        clearTimeout(MYROOM_STATE.wanderTimers[placementKey]);
        delete MYROOM_STATE.wanderTimers[placementKey];
    }
    delete MYROOM_STATE.monsterTokenEls[placementKey];
    const bg = getCurrentMyRoomBackground();
    delete getPlacedMonstersForBg(bg.id)[placementKey];
    renderMyRoomMonsterFloor();
    saveMyRoomPlacement();
    if (typeof showToast === 'function') showToast('モンスターを床から外しました');
}

// =====================================================
// モンスターの操作パネル（撫でる・エサをあげる・絆ポイント・撤去）
// =====================================================
function getActiveMyRoomMonsterInfo() {
    const key = MYROOM_STATE.activeMonsterKey;
    if (!key) return null;
    const bg = getCurrentMyRoomBackground();
    const info = getPlacedMonstersForBg(bg.id)[key];
    return info ? { key, info } : null;
}

async function openMyRoomMonsterOptions(placementKey) {
    MYROOM_STATE.activeMonsterKey = placementKey;
    const active = getActiveMyRoomMonsterInfo();
    if (!active) return;
    const tmpl = MONSTER_TEMPLATES[active.info.speciesId];
    if (!tmpl) return;

    const modal = document.getElementById('myroom-monster-options-modal');
    const iconEl = document.getElementById('myroom-monster-options-icon');
    const nameEl = document.getElementById('myroom-monster-options-name');
    const foodList = document.getElementById('myroom-monster-options-food-list');
    if (!modal) return;

    if (iconEl) {
        iconEl.style.position = 'relative';
        renderMonsterVisual(iconEl, tmpl.name, tmpl.emoji, false, true, active.info.auraKey);
    }
    const aura = AURA_TYPES[active.info.auraKey] || {};
    if (nameEl) nameEl.innerHTML = `${tmpl.name} <span class="text-[11px]">${aura.emoji || ''}</span>`;
    if (foodList) {
        foodList.innerHTML = MYROOM_FOOD_TYPES.map(f => `
            <button onclick="feedMyRoomMonster('${f.id}')" class="py-2 bg-[#1a120b] hover:bg-[#241b12] border border-emerald-900/50 rounded-lg text-lg active:scale-95 transition-all" title="${f.name}">
                ${f.emoji}
            </button>
        `).join('');
    }

    modal.classList.remove('hidden');
    refreshMyRoomMonsterOptionsBondDisplay();
    refreshMyRoomMonsterOptionsDailyCounts(`${active.info.speciesId}_${active.info.auraKey}`);
}

async function refreshMyRoomMonsterOptionsDailyCounts(bondKey) {
    const el = document.getElementById('myroom-monster-options-daily-counts');
    if (!el) return;
    el.textContent = '…';
    const current = await fetchMyRoomDailyInteraction(bondKey);
    el.textContent = `本日の残り　撫でる:${MYROOM_DAILY_PET_LIMIT - current.petCount}/${MYROOM_DAILY_PET_LIMIT}　エサ:${MYROOM_DAILY_FEED_LIMIT - current.feedCount}/${MYROOM_DAILY_FEED_LIMIT}`;
}

function closeMyRoomMonsterOptions() {
    const modal = document.getElementById('myroom-monster-options-modal');
    if (modal) modal.classList.add('hidden');
    MYROOM_STATE.activeMonsterKey = null;
}

async function refreshMyRoomMonsterOptionsBondDisplay() {
    const active = getActiveMyRoomMonsterInfo();
    const bondEl = document.getElementById('myroom-monster-options-bond');
    if (!active || !bondEl) return;
    const bondKey = `${active.info.speciesId}_${active.info.auraKey}`;
    bondEl.textContent = '…';
    const points = await fetchMyRoomBond(bondKey);
    bondEl.textContent = points.toLocaleString();
}

async function petMyRoomMonster() {
    const active = getActiveMyRoomMonsterInfo();
    if (!active) return;
    const bondKey = `${active.info.speciesId}_${active.info.auraKey}`;

    const result = await tryConsumeMyRoomInteraction(bondKey, 'pet');
    if (!result.success) {
        if (typeof showToast === 'function') showToast(`今日はもう十分に撫でました（1日${MYROOM_DAILY_PET_LIMIT}回まで）。また明日！`);
        return;
    }

    await addMyRoomBond(bondKey, MYROOM_BOND_PET_AMOUNT);
    const key = active.key;
    closeMyRoomMonsterOptions();

    // 対象モンスターを静止させ、頭を撫でるモーション→ハートの順で演出してから徘徊を再開する
    const token = pauseMyRoomMonsterForInteraction(key);
    if (token) {
        await playMyRoomPetMotion(token);
        showMyRoomMonsterReaction(key, '🥰💕');
        resumeMyRoomMonsterWander(key);
    } else {
        showMyRoomMonsterReaction(key, '🥰💕');
    }
    if (typeof showToast === 'function') showToast(`なでなで♪ 絆+${MYROOM_BOND_PET_AMOUNT}（本日あと${result.remaining}回）`);
}

async function feedMyRoomMonster(foodId) {
    const active = getActiveMyRoomMonsterInfo();
    if (!active) return;
    const bondKey = `${active.info.speciesId}_${active.info.auraKey}`;

    const result = await tryConsumeMyRoomInteraction(bondKey, 'feed');
    if (!result.success) {
        if (typeof showToast === 'function') showToast(`今日はもうお腹いっぱいみたい（1日${MYROOM_DAILY_FEED_LIMIT}回まで）。また明日！`);
        return;
    }

    const tmpl = MONSTER_TEMPLATES[active.info.speciesId];
    const classKey = tmpl && typeof getMonClassKeyForName === 'function' ? getMonClassKeyForName(tmpl.name) : null;
    const food = MYROOM_FOOD_TYPES.find(f => f.id === foodId);
    const liked = !!(food && classKey && food.likedByClass === classKey);
    const amount = liked ? MYROOM_BOND_LIKED_FOOD_AMOUNT : MYROOM_BOND_DISLIKED_FOOD_AMOUNT;

    await addMyRoomBond(bondKey, amount);
    const key = active.key;
    closeMyRoomMonsterOptions();

    // 対象モンスターを静止させ、目の前にエサを出す→少しずつ食べる→感情表現の順で演出してから徘徊を再開する
    const token = pauseMyRoomMonsterForInteraction(key);
    if (token) {
        await playMyRoomFeedMotion(token, food ? food.emoji : '🍽️');
        showMyRoomMonsterReaction(key, liked ? '😋💕' : '😒💢');
        resumeMyRoomMonsterWander(key);
    } else {
        showMyRoomMonsterReaction(key, liked ? '😋💕' : '😒💢');
    }
    if (typeof showToast === 'function') {
        showToast(liked
            ? `🍽️ 大喜びで食べた！絆+${MYROOM_BOND_LIKED_FOOD_AMOUNT}（本日あと${result.remaining}回）`
            : `🍽️ あまり好きな味じゃなかったみたい…（本日あと${result.remaining}回）`);
    }
}

// --- なでる／エサをあげる等のインタラクション演出のため、対象モンスターの徘徊を一時停止する ---
//   移動アニメーションの途中であっても、今まさに見えている位置でピタッと静止させてから
//   演出を開始する（急に位置が飛んだように見えないようにするため）。
//   トークンが見つからない場合（背景を切り替えた直後など）はnullを返す。
function pauseMyRoomMonsterForInteraction(placementKey) {
    const token = MYROOM_STATE.monsterTokenEls[placementKey];
    if (!token || !token.isConnected) return null;

    // 徘徊の次の一歩・次の移動タイマーを止める
    if (MYROOM_STATE.wanderTimers[placementKey]) {
        clearTimeout(MYROOM_STATE.wanderTimers[placementKey]);
        delete MYROOM_STATE.wanderTimers[placementKey];
    }

    // 移動アニメーションの途中なら、今の見た目の位置でそのまま静止させる
    const floor = token.parentElement;
    if (floor) {
        const floorRect = floor.getBoundingClientRect();
        const tokenRect = token.getBoundingClientRect();
        if (floorRect.width > 0 && floorRect.height > 0) {
            const centerX = tokenRect.left + tokenRect.width / 2 - floorRect.left;
            const centerY = tokenRect.top + tokenRect.height / 2 - floorRect.top;
            const xPct = (centerX / floorRect.width) * 100;
            const yPct = (centerY / floorRect.height) * 100;
            token.style.transition = 'none';
            void token.offsetWidth; // 上のtransition解除を確実に反映させてから位置を固定する
            token.style.left = `${xPct}%`;
            token.style.top = `${yPct}%`;
        }
    }
    updateMyRoomMonsterZIndex(token); // 静止させた位置に合わせて重なり順も更新しておく

    // 歩行スプライトを使うモンスターは、指定の静止ポーズに切り替える
    setMyRoomWalkSpriteWalking(placementKey, token, false);

    return token;
}

// --- インタラクション演出が終わったら、徘徊を再開する ---
function resumeMyRoomMonsterWander(placementKey) {
    const token = MYROOM_STATE.monsterTokenEls[placementKey];
    if (!token || !token.isConnected) return;
    startMyRoomMonsterWander(placementKey, token);
}

// --- 頭を手のひらで撫でるモーション（手を左右に小さく揺らす）を再生する。完了したらresolveするPromiseを返す ---
function playMyRoomPetMotion(token) {
    return new Promise(resolve => {
        const handEl = document.createElement('div');
        handEl.textContent = '🖐️';
        handEl.style.cssText = 'position:absolute; left:50%; top:6%; font-size:1.5rem; pointer-events:none; z-index:21; text-shadow:0 2px 4px rgba(0,0,0,0.5);';
        token.appendChild(handEl);

        const duration = 900;
        try {
            const anim = handEl.animate([
                { transform: 'translate(-70%,-60%) rotate(-18deg)', offset: 0 },
                { transform: 'translate(-30%,-70%) rotate(-4deg)', offset: 0.25 },
                { transform: 'translate(-70%,-60%) rotate(-18deg)', offset: 0.5 },
                { transform: 'translate(-30%,-70%) rotate(-4deg)', offset: 0.75 },
                { transform: 'translate(-70%,-60%) rotate(-18deg)', offset: 1 }
            ], { duration, easing: 'ease-in-out' });
            anim.onfinish = () => { handEl.remove(); resolve(); };
        } catch (e) {
            setTimeout(() => { handEl.remove(); resolve(); }, duration);
        }
    });
}

// --- モンスターの目の前にエサを出し、少しずつ食べて無くなっていく様子（3段階）を再生する。完了したらresolveするPromiseを返す ---
function playMyRoomFeedMotion(token, foodEmoji) {
    return new Promise(resolve => {
        const foodEl = document.createElement('div');
        foodEl.textContent = foodEmoji;
        foodEl.style.cssText = 'position:absolute; left:78%; top:62%; transform:translate(-50%,-50%) scale(0); font-size:1.4rem; pointer-events:none; z-index:21; text-shadow:0 2px 4px rgba(0,0,0,0.5);';
        token.appendChild(foodEl);

        // 0:登場 → 1:一口目 → 2:二口目 → 3:三口目（消える）
        const bites = [1, 0.7, 0.4, 0];
        const stepDuration = 260;
        let i = 0;

        const showBite = () => {
            if (i >= bites.length) {
                foodEl.remove();
                resolve();
                return;
            }
            const scale = bites[i];
            const opacity = scale > 0 ? 1 : 0;
            try {
                const anim = foodEl.animate([
                    { transform: `translate(-50%,-50%) scale(${i === 0 ? 0 : bites[i - 1]})`, opacity: 1 },
                    { transform: `translate(-50%,-50%) scale(${scale})`, opacity }
                ], { duration: stepDuration, easing: 'ease-in', fill: 'forwards' });
                anim.onfinish = () => {
                    i++;
                    setTimeout(showBite, i === 1 ? 220 : 0); // 登場後は少し「間」を置いてから食べ始める
                };
            } catch (e) {
                foodEl.style.transform = `translate(-50%,-50%) scale(${scale})`;
                foodEl.style.opacity = String(opacity);
                i++;
                setTimeout(showBite, stepDuration);
            }
        };
        showBite();
    });
}

function removeActiveMyRoomMonster() {
    const key = MYROOM_STATE.activeMonsterKey;
    if (!key) return;
    closeMyRoomMonsterOptions();
    removeMyRoomMonster(key);
}

// --- モンスターの頭上に反応の絵文字をふわっと表示する ---
function showMyRoomMonsterReaction(placementKey, emojiText) {
    const token = MYROOM_STATE.monsterTokenEls[placementKey];
    if (!token || !token.isConnected) return;
    const reaction = document.createElement('div');
    reaction.textContent = emojiText;
    reaction.style.cssText = 'position:absolute; left:50%; top:-10px; transform:translate(-50%,0); font-size:1.4rem; pointer-events:none; z-index:20; text-shadow:0 2px 4px rgba(0,0,0,0.5);';
    token.appendChild(reaction);
    try {
        const anim = reaction.animate([
            { transform: 'translate(-50%,0) scale(0.6)', opacity: 0 },
            { transform: 'translate(-50%,-16px) scale(1.15)', opacity: 1, offset: 0.35 },
            { transform: 'translate(-50%,-34px) scale(1)', opacity: 0 }
        ], { duration: 1100, easing: 'ease-out' });
        anim.onfinish = () => reaction.remove();
        setTimeout(() => reaction.remove(), 1300);
    } catch (e) {
        setTimeout(() => reaction.remove(), 1000);
    }
}

// =====================================================
// 所持品一覧モーダル（読み取り専用）
// =====================================================
function openMyRoomInventoryModal() {
    const modal = document.getElementById('myroom-inventory-modal');
    const furnitureList = document.getElementById('myroom-inventory-furniture-list');
    const monsterList = document.getElementById('myroom-inventory-monster-list');
    if (!modal || !furnitureList || !monsterList) return;

    furnitureList.innerHTML = MYROOM_STATE.ownedFurniture.length === 0
        ? `<p class="text-gray-500 text-[10px]">まだ持っていません</p>`
        : MYROOM_STATE.ownedFurniture.map((f, i) => `
            <div class="flex items-center gap-2 bg-[#1a120b] rounded-lg px-2 py-1.5">
                <div id="myroom-inventory-furniture-icon-${i}" class="w-7 h-7 flex-shrink-0 flex items-center justify-center text-lg"></div>
                <span class="flex-1 text-xs text-amber-100 font-bold">${f.name}</span>
                <span class="text-[10px] text-gray-400">×${f.count}</span>
            </div>
        `).join('');
    MYROOM_STATE.ownedFurniture.forEach((f, i) => {
        const iconEl = document.getElementById(`myroom-inventory-furniture-icon-${i}`);
        if (iconEl) renderFurnitureIcon(iconEl, f, { imgClassName: 'w-full h-full object-contain' });
    });

    monsterList.innerHTML = MYROOM_STATE.ownedMonsters.length === 0
        ? `<p class="text-gray-500 text-[10px]">まだ持っていません</p>`
        : MYROOM_STATE.ownedMonsters.map(m => {
            const aura = AURA_TYPES[m.auraKey] || {};
            return `
                <div class="flex items-center gap-2 bg-[#1a120b] rounded-lg px-2 py-1.5">
                    <span class="text-lg">${m.emoji}</span>
                    <span class="flex-1 text-xs text-amber-100 font-bold">${m.name} <span class="text-[10px]">${aura.emoji || ''}</span></span>
                    <span class="text-[10px] text-gray-400">×${m.count}</span>
                </div>
            `;
        }).join('');

    modal.classList.remove('hidden');
}

function closeMyRoomInventoryModal() {
    const modal = document.getElementById('myroom-inventory-modal');
    if (modal) modal.classList.add('hidden');
}

// =====================================================
// 初回特典チケット交換モーダル
// =====================================================
function openMyRoomTicketModal() {
    const modal = document.getElementById('myroom-ticket-modal');
    if (!modal) return;

    const furnitureSelect = document.getElementById('myroom-ticket-furniture-select');
    if (furnitureSelect && typeof GACHA_FURNITURE_POOL !== 'undefined') {
        furnitureSelect.innerHTML = GACHA_FURNITURE_POOL.map(f =>
            `<option value="${f.id}">${f.emoji} ${f.name}</option>`
        ).join('');
    }

    const speciesSelect = document.getElementById('myroom-ticket-species-select');
    if (speciesSelect && typeof KIN_NEJIKI_SPECIES_POOL !== 'undefined') {
        speciesSelect.innerHTML = KIN_NEJIKI_SPECIES_POOL.map(speciesId => {
            const tmpl = MONSTER_TEMPLATES[speciesId];
            return `<option value="${speciesId}">${tmpl ? tmpl.emoji + ' ' + tmpl.name : speciesId}</option>`;
        }).join('');
    }

    const auraSelect = document.getElementById('myroom-ticket-aura-select');
    if (auraSelect && typeof AURA_TYPES !== 'undefined') {
        auraSelect.innerHTML = Object.keys(AURA_TYPES).map(auraKey => {
            const aura = AURA_TYPES[auraKey];
            return `<option value="${auraKey}">${aura.emoji} ${aura.name}</option>`;
        }).join('');
    }

    modal.classList.remove('hidden');
}

function closeMyRoomTicketModal() {
    const modal = document.getElementById('myroom-ticket-modal');
    if (modal) modal.classList.add('hidden');
}

async function redeemMyRoomTicket() {
    const furnitureSelect = document.getElementById('myroom-ticket-furniture-select');
    const speciesSelect = document.getElementById('myroom-ticket-species-select');
    const auraSelect = document.getElementById('myroom-ticket-aura-select');
    const furnitureId = furnitureSelect ? furnitureSelect.value : null;
    const speciesId = speciesSelect ? speciesSelect.value : null;
    const auraKey = auraSelect ? auraSelect.value : null;
    if (!furnitureId || !speciesId || !auraKey) return;

    const spend = await spendMyRoomTicket();
    if (!spend.success) {
        if (typeof showToast === 'function') showToast('🎫 使えるチケットがありません');
        closeMyRoomTicketModal();
        refreshMyRoomTicketBanner();
        return;
    }

    if (typeof initFirebase === 'function' && initFirebase()) {
        try {
            const pid = getMyPlayerId();
            await Promise.all([
                firebaseDb.ref(`player_inventory/${pid}/furniture/${furnitureId}`).transaction(current => (current || 0) + 1),
                firebaseDb.ref(`player_inventory/${pid}/monsters/${speciesId}_${auraKey}`).transaction(current => (current || 0) + 1)
            ]);
        } catch (e) {
            console.error('[マイルーム] チケット交換の反映エラー:', e);
        }
    }

    closeMyRoomTicketModal();
    refreshMyRoomTicketBanner();
    if (typeof showToast === 'function') showToast('🎁 家具とモンスターを受け取りました！');

    // 所持品リスト・スロット選択肢を最新化する
    const data = await fetchMyRoomData();
    if (data) {
        MYROOM_STATE.ownedFurniture = buildOwnedFurnitureList(data.furnitureCounts);
        MYROOM_STATE.ownedMonsters = buildOwnedMonsterList(data.monsterCounts);
    }
}
