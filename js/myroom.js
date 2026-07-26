// =====================================================
// myroom.js
// マイルーム画面（フェーズ4）
// ・家具：背景画像内の固定スロットにタップで設置。背景ごとに独立したスロット構成を持つが、
//   「同じ家具を何個まで置けるか」は所持数を基準に背景をまたいで共通でカウントする
//   （例：木の椅子を1個しか持っていなければ、AとBのどちらか片方にしか置けない）
// ・モンスター：手前の床エリアを自由に歩き回る（ランダム徘徊AI）。
//   家具と違い、モンスターは所持数を消費しない「観賞用の分身」として扱うため、
//   同じ組み合わせ（種族＋オーラ）を複数の背景に同時に配置できる
//   （例：モッチー(赤)を1体しか持っていなくても、AにもBにも置ける）
// ・所持データは player_inventory/{pid}/furniture, player_inventory/{pid}/monsters
//   （ガチャで既に書き込み済み）を読み込んで選択肢にする
// ・設置状態は player_myroom/{pid} に保存し、次回訪問時も復元する
//   { backgroundId, furnitureSlots: { bgId: { slotId: furnitureId } },
//     placedMonsters: { bgId: { placementKey: {speciesId, auraKey} } } }
// =====================================================

// --- マイルームの背景一覧。背景ごとに家具スロットの座標・モンスターの徘徊範囲を個別に持つ ---
// （背景によって棚の位置や地面の形が違うため、スロット座標も背景ごとに変える必要がある）
const MYROOM_BACKGROUNDS = {
    A: {
        id: 'A',
        name: '小屋',
        emoji: '🏠',
        file: 'images/myroom/マイルームA.png',
        furnitureSlots: [
            { id: 'left_shelf', xPct: 23, yPct: 33, label: '左の棚' },
            { id: 'right_shelf', xPct: 78, yPct: 34, label: '右の棚' },
            { id: 'floor_crate', xPct: 82, yPct: 49, label: '床のクレート' }
        ],
        wanderBounds: { xMin: 10, xMax: 90, yMin: 60, yMax: 88 },
        tokenSizePx: 84 // 小屋は奥行きが浅いぶん、モンスターを少し大きめに表示する
    },
    B: {
        id: 'B',
        name: 'ファーム',
        emoji: '🌾',
        file: 'images/myroom/マイルームB.png',
        furnitureSlots: [
            { id: 'left_fence', xPct: 14, yPct: 79, label: '左手前の柵' },
            { id: 'right_fence', xPct: 86, yPct: 79, label: '右手前の柵' },
            { id: 'center_ground', xPct: 50, yPct: 66, label: '中央の地面' }
        ],
        wanderBounds: { xMin: 8, xMax: 92, yMin: 48, yMax: 90 },
        tokenSizePx: 56 // ちょうど良いサイズなので現状維持
    }
};
const MYROOM_DEFAULT_BACKGROUND_ID = 'A';
const MYROOM_MAX_MONSTERS = 4;

function getCurrentMyRoomBackground() {
    return MYROOM_BACKGROUNDS[MYROOM_STATE.backgroundId] || MYROOM_BACKGROUNDS[MYROOM_DEFAULT_BACKGROUND_ID];
}

const MYROOM_STATE = {
    backgroundId: MYROOM_DEFAULT_BACKGROUND_ID,
    furnitureSlots: {},    // { bgId: { slotId -> furnitureId } }
    placedMonsters: {},    // { bgId: { placementKey -> { speciesId, auraKey } } }
    ownedFurniture: [],    // [{id, count, name, emoji}]
    ownedMonsters: [],     // [{key, speciesId, auraKey, count, name, emoji}]
    wanderTimers: {},      // placementKey -> timeoutId
    activeSlotId: null     // 現在ピッカーで選択中の家具スロットID
};

// --- 現在の背景IDに対応する家具スロット・配置モンスターのオブジェクトを取得する（無ければ作る） ---
function getFurnitureSlotsForBg(bgId) {
    if (!MYROOM_STATE.furnitureSlots[bgId]) MYROOM_STATE.furnitureSlots[bgId] = {};
    return MYROOM_STATE.furnitureSlots[bgId];
}
function getPlacedMonstersForBg(bgId) {
    if (!MYROOM_STATE.placedMonsters[bgId]) MYROOM_STATE.placedMonsters[bgId] = {};
    return MYROOM_STATE.placedMonsters[bgId];
}

// --- 指定した家具IDが、全背景を通じて合計何個「設置済み」になっているかを数える ---
// excludeBgId/excludeSlotId : 今まさに編集中のスロット自身は集計から除外する
// （そうしないと「今この場所に置いてある家具」自身が原因で自分自身を選べなくなってしまう）
function countFurnitureUsedAcrossBackgrounds(furnitureId, excludeBgId, excludeSlotId) {
    let count = 0;
    Object.keys(MYROOM_STATE.furnitureSlots).forEach(bgId => {
        const slots = MYROOM_STATE.furnitureSlots[bgId] || {};
        Object.keys(slots).forEach(slotId => {
            if (bgId === excludeBgId && slotId === excludeSlotId) return;
            if (slots[slotId] === furnitureId) count++;
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
            furnitureSlots: MYROOM_STATE.furnitureSlots,
            placedMonsters: MYROOM_STATE.placedMonsters
        });
    } catch (e) {
        console.error('[マイルーム] 設置状態の保存エラー:', e);
    }
}

function buildOwnedFurnitureList(furnitureCounts) {
    return Object.keys(furnitureCounts).map(id => {
        const def = (typeof GACHA_FURNITURE_POOL !== 'undefined') ? GACHA_FURNITURE_POOL.find(f => f.id === id) : null;
        return { id, count: furnitureCounts[id] || 0, name: def ? def.name : id, emoji: def ? def.emoji : '📦' };
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
    MYROOM_STATE.furnitureSlots = (data.placement && data.placement.furnitureSlots) || {};
    MYROOM_STATE.placedMonsters = (data.placement && data.placement.placedMonsters) || {};

    applyMyRoomBackground();
    renderMyRoomFurnitureSlots();
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
    renderMyRoomFurnitureSlots();
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
// 家具スロット
// =====================================================
function renderMyRoomFurnitureSlots() {
    const container = document.getElementById('myroom-furniture-slots');
    if (!container) return;
    container.innerHTML = '';

    const bg = getCurrentMyRoomBackground();
    const slotsForBg = getFurnitureSlotsForBg(bg.id);
    bg.furnitureSlots.forEach(slot => {
        const furnitureId = slotsForBg[slot.id];
        const def = furnitureId ? MYROOM_STATE.ownedFurniture.find(f => f.id === furnitureId) : null;

        const marker = document.createElement('div');
        marker.className = 'myroom-slot-marker absolute flex items-center justify-center cursor-pointer';
        marker.style.left = `${slot.xPct}%`;
        marker.style.top = `${slot.yPct}%`;
        marker.style.transform = 'translate(-50%,-50%)';
        marker.onclick = () => openMyRoomFurniturePicker(slot.id);

        if (def) {
            marker.innerHTML = `<span class="myroom-slot-icon">${def.emoji}</span>`;
        } else {
            marker.innerHTML = `<span class="myroom-slot-empty-hint">＋</span>`;
        }
        container.appendChild(marker);
    });
}

function openMyRoomFurniturePicker(slotId) {
    MYROOM_STATE.activeSlotId = slotId;
    const bg = getCurrentMyRoomBackground();
    const slot = bg.furnitureSlots.find(s => s.id === slotId);
    const modal = document.getElementById('myroom-furniture-picker-modal');
    const title = document.getElementById('myroom-furniture-picker-title');
    const list = document.getElementById('myroom-furniture-picker-list');
    if (!modal || !list) return;
    if (title) title.textContent = `🪑 ${slot ? slot.label : '家具'}に置くものを選ぶ`;

    const currentFurnitureId = getFurnitureSlotsForBg(bg.id)[slotId];
    let html = '';
    if (currentFurnitureId) {
        html += `
            <button onclick="placeMyRoomFurniture(null)" class="w-full py-2 bg-[#1a120b] hover:bg-[#241b12] text-red-300 text-xs font-bold rounded-lg border border-red-900/70 active:scale-95 transition-all mb-2">
                ✕ ここを空にする
            </button>
        `;
    }
    if (MYROOM_STATE.ownedFurniture.length === 0) {
        html += `<p class="text-gray-500 text-[11px] text-center py-6">まだ家具を持っていません。<br>祈りの神殿（ガチャ）で手に入れよう！</p>`;
    } else {
        html += MYROOM_STATE.ownedFurniture.map(f => {
            const isCurrent = currentFurnitureId === f.id;
            const usedElsewhere = countFurnitureUsedAcrossBackgrounds(f.id, bg.id, slotId);
            const remaining = f.count - usedElsewhere;
            const isAvailable = isCurrent || remaining > 0;
            if (!isAvailable) {
                return `
                    <div class="w-full flex items-center gap-2 bg-[#150b07] border border-gray-800 rounded-lg px-2 py-2 opacity-50">
                        <span class="text-xl grayscale">${f.emoji}</span>
                        <span class="flex-1 text-xs text-gray-500 font-bold">${f.name}</span>
                        <span class="text-[9px] text-gray-600 font-bold">他の場所で使用中</span>
                    </div>
                `;
            }
            return `
                <button onclick="placeMyRoomFurniture('${f.id}')"
                    class="w-full flex items-center gap-2 bg-[#1a120b] hover:bg-[#241b12] border ${isCurrent ? 'border-amber-400' : 'border-amber-900/50'} rounded-lg px-2 py-2 text-left active:scale-[0.98] transition-all">
                    <span class="text-xl">${f.emoji}</span>
                    <span class="flex-1 text-xs text-amber-100 font-bold">${f.name}</span>
                    <span class="text-[10px] text-gray-400">残り${remaining}／×${f.count}</span>
                </button>
            `;
        }).join('');
    }
    list.innerHTML = html;
    modal.classList.remove('hidden');
}

function closeMyRoomFurniturePicker() {
    const modal = document.getElementById('myroom-furniture-picker-modal');
    if (modal) modal.classList.add('hidden');
    MYROOM_STATE.activeSlotId = null;
}

function placeMyRoomFurniture(furnitureId) {
    const slotId = MYROOM_STATE.activeSlotId;
    if (!slotId) return;
    const bg = getCurrentMyRoomBackground();
    const slotsForBg = getFurnitureSlotsForBg(bg.id);

    if (furnitureId) {
        // 念のため、選択操作の間に他で使い切られていないか最終確認する
        const usedElsewhere = countFurnitureUsedAcrossBackgrounds(furnitureId, bg.id, slotId);
        const owned = (MYROOM_STATE.ownedFurniture.find(f => f.id === furnitureId) || {}).count || 0;
        if (usedElsewhere >= owned) {
            if (typeof showToast === 'function') showToast('その家具は他の場所で使用中で、これ以上置けません');
            return;
        }
        slotsForBg[slotId] = furnitureId;
    } else {
        delete slotsForBg[slotId];
    }
    renderMyRoomFurnitureSlots();
    closeMyRoomFurniturePicker();
    saveMyRoomPlacement();
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
        : MYROOM_STATE.ownedFurniture.map(f => `
            <div class="flex items-center gap-2 bg-[#1a120b] rounded-lg px-2 py-1.5">
                <span class="text-lg">${f.emoji}</span>
                <span class="flex-1 text-xs text-amber-100 font-bold">${f.name}</span>
                <span class="text-[10px] text-gray-400">×${f.count}</span>
            </div>
        `).join('');

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
