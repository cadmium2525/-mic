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
        tokenSizePx: 56 // ちょうど良いサイズなので現状維持
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
    activeFurnitureKey: null, // 現在操作パネルを開いている家具インスタンスのキー
    furnitureDragging: false
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
function openMyRoomFurniturePicker() {
    const modal = document.getElementById('myroom-furniture-picker-modal');
    const list = document.getElementById('myroom-furniture-picker-list');
    if (!modal || !list) return;

    const bg = getCurrentMyRoomBackground();
    if (MYROOM_STATE.ownedFurniture.length === 0) {
        list.innerHTML = `<p class="text-gray-500 text-[11px] text-center py-6">まだ家具を持っていません。<br>祈りの神殿（ガチャ）で手に入れよう！</p>`;
    } else {
        list.innerHTML = MYROOM_STATE.ownedFurniture.map(f => {
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
        MYROOM_STATE.ownedFurniture.forEach(f => {
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

    modal.classList.remove('hidden');
}

function closeMyRoomFurnitureOptions() {
    const modal = document.getElementById('myroom-furniture-options-modal');
    if (modal) modal.classList.add('hidden');
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

    const token = document.createElement('div');
    token.className = 'myroom-monster-token absolute cursor-pointer pointer-events-auto';
    token.style.position = 'absolute'; // renderMonsterVisual側が「未設定ならrelativeにする」処理を持つため、先に明示しておく
    const tokenSize = bg.tokenSizePx || 56;
    token.style.width = `${tokenSize}px`;
    token.style.height = `${tokenSize}px`;
    token.style.left = `${startX}%`;
    token.style.top = `${startY}%`;
    token.style.transform = 'translate(-50%,-50%)';
    token.dataset.placementKey = placementKey;
    token.onclick = () => removeMyRoomMonster(placementKey);
    floor.appendChild(token);

    renderMonsterVisual(token, tmpl.name, tmpl.emoji, false, true, info.auraKey);
    startMyRoomMonsterWander(placementKey, token);
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

    MYROOM_STATE.wanderTimers[placementKey] = setTimeout(onArrive, duration);
}

function stopAllMyRoomWander() {
    Object.values(MYROOM_STATE.wanderTimers).forEach(timerId => clearTimeout(timerId));
    MYROOM_STATE.wanderTimers = {};
}

// --- モンスター配置ピッカー ---
function openMyRoomMonsterPicker() {
    const modal = document.getElementById('myroom-monster-picker-modal');
    const list = document.getElementById('myroom-monster-picker-list');
    const countLabel = document.getElementById('myroom-monster-count-label');
    const maxLabel = document.getElementById('myroom-monster-max-label');
    if (!modal || !list) return;

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
        list.innerHTML = MYROOM_STATE.ownedMonsters.map(m => `
            <button onclick="placeMyRoomMonster('${m.speciesId}', '${m.auraKey}')"
                class="w-full flex items-center gap-2 bg-[#1a120b] hover:bg-[#241b12] border border-emerald-900/50 rounded-lg px-2 py-2 text-left active:scale-[0.98] transition-all">
                <span class="text-xl">${m.emoji}</span>
                <span class="flex-1 text-xs text-amber-100 font-bold">${m.name}<span class="ml-1 text-[9px]" style="color:${(AURA_TYPES[m.auraKey] || {}).hex || '#fff'}">${(AURA_TYPES[m.auraKey] || {}).emoji || ''}</span></span>
                <span class="text-[10px] text-gray-400">×${m.count}</span>
            </button>
        `).join('');
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
    const bg = getCurrentMyRoomBackground();
    delete getPlacedMonstersForBg(bg.id)[placementKey];
    renderMyRoomMonsterFloor();
    saveMyRoomPlacement();
    if (typeof showToast === 'function') showToast('モンスターを床から外しました');
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
