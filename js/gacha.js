// =====================================================
// gacha.js
// 「祈りの神殿」ガチャ画面（フェーズ2）
// ・円盤石を指でドラッグし、中央やや下の台座（設置スポット）に配置すると演出開始
// ・演出：円盤石が最初はゆっくり回転→次第に高速回転→フラッシュ
//   （★3が1体でも含まれる場合は虹色フラッシュ）→結果発表
// ・排出：★1/★2＝家具（観賞用）、★3＝モンスター（観賞用・オーラ色違いあり）
// ・11連には★3確定の天井あり
// ・★3モンスターが被った場合は「モンスターのカケラ」が貯まり、後日カケラ交換所で
//   好きな★3モンスターと交換できる（交換所はフェーズ3の管理画面と合わせて実装予定）
// ※家具・モンスターの排出ラインナップは仮の内容です。今後の相談で差し替え予定。
// =====================================================

const GACHA_SINGLE_COST = 150;
const GACHA_ELEVEN_COST = 1500;

const GACHA_STATE = {
    pullCount: 1,     // 1 or 11
    dragging: false,
    animating: false, // true の間はドラッグ・モード切り替えを受け付けない
    pointerId: null,
    dragOffsetX: 0,
    dragOffsetY: 0
};

// --- 排出アイテムプール（仮） ---
// ★1/★2＝家具（観賞用・機能効果なし）、★3＝レンタルモンスター種族から抽選＋ランダムオーラ
// image: 専用イラストがある場合のパス（マイルームでの表示・図鑑等で使用。無ければemojiで代替表示）
const GACHA_FURNITURE_POOL = [
    { id: 'furniture_wood_chair', name: '木の椅子', emoji: '🪑', rarity: 1 },
    { id: 'furniture_lantern', name: '灯りのランタン', emoji: '🏮', rarity: 1 },
    { id: 'furniture_potted_plant', name: '観葉植物', emoji: '🪴', image: 'images/furniture/観葉植物.png', rarity: 1 },
    { id: 'furniture_bookshelf', name: '古びた本棚', emoji: '📚', rarity: 1 },
    { id: 'furniture_candle', name: '燭台', emoji: '🕯️', rarity: 1 },
    { id: 'furniture_rug', name: 'ふかふかのラグ', emoji: '🟫', rarity: 2 },
    { id: 'furniture_fountain', name: '小さな噴水', emoji: '⛲', image: 'images/furniture/小さな噴水.png', rarity: 2 },
    { id: 'furniture_treasure_chest', name: '装飾された宝箱', emoji: '🗝️', rarity: 2 },
    { id: 'furniture_windowlight', name: 'ステンドグラスの窓', emoji: '🪟', rarity: 2 },
    // --- マイルームB（ファーム）向けに追加した専用イラスト付きアイテム ---
    { id: 'furniture_hay_set', name: '牧草セット', emoji: '🌾', image: 'images/furniture/牧草セット.png', rarity: 1 },
    { id: 'furniture_crate_a', name: '木箱A', emoji: '📦', image: 'images/furniture/木箱A.png', rarity: 1 },
    { id: 'furniture_crate_b', name: '木箱B', emoji: '📦', image: 'images/furniture/木箱B.png', rarity: 1 },
    { id: 'furniture_feed_trough', name: '餌置き場', emoji: '🍖', image: 'images/furniture/餌置き場.png', rarity: 2 },
    { id: 'furniture_water_trough', name: '水のみ場', emoji: '💧', image: 'images/furniture/水のみ場.png', rarity: 2 },
    { id: 'furniture_barrel', name: '樽', emoji: '🛢️', image: 'images/furniture/樽.png', rarity: 1 },
    { id: 'furniture_water_bucket', name: '水の入った桶', emoji: '🪣', image: 'images/furniture/水の入った桶.png', rarity: 1 },
    { id: 'furniture_feed_sack', name: '餌', emoji: '🌾', image: 'images/furniture/餌.png', rarity: 1 },
    { id: 'furniture_scarecrow', name: 'かかし', emoji: '🎎', image: 'images/furniture/かかし.png', rarity: 2 },
    { id: 'furniture_hot_cauldron', name: 'お湯', emoji: '♨️', image: 'images/furniture/お湯.png', rarity: 2 },
    { id: 'furniture_signpost', name: '看板', emoji: '🪧', image: 'images/furniture/看板.png', rarity: 1 },
    // --- マイルームA（小屋）向けに追加した専用イラスト付きアイテム ---
    { id: 'furniture_stacked_crates', name: '積み上げた荷物', emoji: '📦', image: 'images/furniture/積み上げた荷物.png', rarity: 2 },
    { id: 'furniture_bulletin_board', name: '掲示板', emoji: '📋', image: 'images/furniture/掲示板.png', rarity: 2 },
    { id: 'furniture_straw_sack', name: '藁袋', emoji: '🌾', image: 'images/furniture/藁袋.png', rarity: 1 },
    { id: 'furniture_straw_rug', name: '藁のラグ', emoji: '🟨', image: 'images/furniture/藁のラグ.png', rarity: 1 },
    { id: 'furniture_indoor_feed_a', name: '屋内餌A', emoji: '🍬', image: 'images/furniture/屋内餌A.png', rarity: 1 },
    { id: 'furniture_indoor_feed_b', name: '屋内餌B', emoji: '🍬', image: 'images/furniture/屋内餌B.png', rarity: 1 },
    { id: 'furniture_hanging_plant', name: '吊るした植物', emoji: '🌿', image: 'images/furniture/吊るした植物.png', rarity: 1 },
];

// --- 家具アイテムのアイコンを描画する共通ヘルパー（専用イラストがあれば画像、無ければ絵文字で代替） ---
// マイルームでの配置表示・所持品一覧・各種ピッカー・ガチャ結果カードなど、家具を表示する箇所全てで共通利用する。
function renderFurnitureIcon(containerEl, furnitureDef, opts = {}) {
    if (!containerEl || !furnitureDef) return;
    containerEl.innerHTML = '';
    if (furnitureDef.image) {
        const img = document.createElement('img');
        img.src = furnitureDef.image;
        img.alt = furnitureDef.name;
        img.className = opts.imgClassName || 'w-full h-full object-contain';
        img.draggable = false;
        containerEl.appendChild(img);
    } else {
        containerEl.textContent = furnitureDef.emoji || '📦';
    }
}

// --- ★1〜★3の排出率（%） ---
const GACHA_RARITY_TABLE = [
    { rarity: 1, weight: 55 },
    { rarity: 2, weight: 40 },
    { rarity: 3, weight: 5 }
];

function rollGachaRarity() {
    const r = Math.random() * 100;
    let acc = 0;
    for (const row of GACHA_RARITY_TABLE) {
        acc += row.weight;
        if (r < acc) return row.rarity;
    }
    return 1;
}

function rollRandomGachaMonster() {
    const pool = KIN_NEJIKI_SPECIES_POOL;
    const speciesId = pool[Math.floor(Math.random() * pool.length)];
    const tmpl = MONSTER_TEMPLATES[speciesId];
    return {
        rarity: 3,
        kind: 'monster',
        speciesId,
        name: tmpl.name,
        emoji: tmpl.emoji,
        auraKey: getRandomAuraKey()
    };
}

function rollSingleGachaItem() {
    const rarity = rollGachaRarity();
    if (rarity === 3) return rollRandomGachaMonster();
    const pool = GACHA_FURNITURE_POOL.filter(f => f.rarity === rarity);
    const item = pool[Math.floor(Math.random() * pool.length)];
    return { rarity, kind: 'furniture', id: item.id, name: item.name, emoji: item.emoji };
}

// --- count回分の抽選結果を返す。count>=11の場合は★3確定の天井を適用する ---
function pickGachaResults(count) {
    const results = [];
    for (let i = 0; i < count; i++) results.push(rollSingleGachaItem());
    if (count >= 11 && !results.some(r => r.rarity === 3)) {
        const idx = Math.floor(Math.random() * results.length);
        results[idx] = rollRandomGachaMonster();
    }
    return results;
}

// --- 引いた結果をプレイヤーの所持データに反映する ---
// モンスターは種族+オーラの組み合わせ単位で所持数を管理し、既に持っている組み合わせが
// 再度出た場合は所持数を増やす代わりに「モンスターのカケラ」を1個付与する。
// 家具は重複してもそのまま所持数を積み増す（複数個設置できるようにするため）。
async function recordGachaResultOwnership(result) {
    if (typeof initFirebase !== 'function' || !initFirebase()) return { isNew: true };
    const pid = getMyPlayerId();
    let wasAlreadyOwned = false;
    try {
        if (result.kind === 'monster') {
            const key = `${result.speciesId}_${result.auraKey}`;
            const ref = firebaseDb.ref(`player_inventory/${pid}/monsters/${key}`);
            await ref.transaction(current => {
                wasAlreadyOwned = !!current;
                return (current || 0) + 1;
            });
            if (wasAlreadyOwned) {
                await awardMonsterKakera(1);
            }
        } else {
            const ref = firebaseDb.ref(`player_inventory/${pid}/furniture/${result.id}`);
            await ref.transaction(current => (current || 0) + 1);
        }
    } catch (e) {
        console.error('[ガチャ] 所持データ反映エラー:', e);
    }
    return { isNew: !wasAlreadyOwned };
}

// =====================================================
// 画面遷移・モード切り替え
// =====================================================
function openGachaScreen() {
    setGachaPullMode(GACHA_STATE.pullCount || 1);
    resetGachaAltar();
    if (typeof refreshDiamondBalanceDisplays === 'function') refreshDiamondBalanceDisplays();
    changeScreen('screen-gacha');
    setupGachaDiscDragHandlers();
}

function closeGachaScreen() {
    changeScreen('screen-title');
}

function setGachaPullMode(count) {
    if (GACHA_STATE.animating) return;
    GACHA_STATE.pullCount = count;
    const btn1 = document.getElementById('gacha-mode-btn-1');
    const btn11 = document.getElementById('gacha-mode-btn-11');
    if (btn1) btn1.classList.toggle('active', count === 1);
    if (btn11) btn11.classList.toggle('active', count === 11);
}

// --- 円盤石・演出オーバーレイを初期状態に戻す ---
function resetGachaAltar() {
    const disc = document.getElementById('gacha-disc');
    const flash = document.getElementById('gacha-flash-overlay');
    const reveal = document.getElementById('gacha-reveal-panel');
    const instruction = document.getElementById('gacha-instruction-text');
    if (disc) {
        disc.style.transition = '';
        disc.style.left = '50%';
        disc.style.top = '89%';
        disc.style.width = '24%';
        disc.style.transform = 'translate(-50%,-50%)';
        disc.style.filter = '';
        disc.classList.remove('gacha-disc-goldglow', 'gacha-disc-rainbowglow');
    }
    if (flash) {
        flash.className = 'absolute inset-0 pointer-events-none opacity-0 z-30';
    }
    if (reveal) {
        reveal.classList.add('hidden');
        reveal.classList.remove('flex');
    }
    if (instruction) instruction.classList.remove('hidden');
    GACHA_STATE.animating = false;
}

function closeGachaReveal() {
    resetGachaAltar();
    if (typeof refreshDiamondBalanceDisplays === 'function') refreshDiamondBalanceDisplays();
}

// =====================================================
// ドラッグ操作（Pointer Eventsでマウス・タッチ両対応）
// =====================================================
let gachaDragHandlersAttached = false;
function setupGachaDiscDragHandlers() {
    if (gachaDragHandlersAttached) return;
    gachaDragHandlersAttached = true;
    const disc = document.getElementById('gacha-disc');
    if (!disc) return;

    disc.addEventListener('pointerdown', onGachaDiscPointerDown);
    disc.addEventListener('pointermove', onGachaDiscPointerMove);
    disc.addEventListener('pointerup', onGachaDiscPointerUp);
    disc.addEventListener('pointercancel', onGachaDiscPointerUp);
}

function onGachaDiscPointerDown(e) {
    if (GACHA_STATE.animating) return;
    const disc = e.currentTarget;
    const rect = disc.getBoundingClientRect();
    GACHA_STATE.dragging = true;
    GACHA_STATE.pointerId = e.pointerId;
    GACHA_STATE.dragOffsetX = e.clientX - (rect.left + rect.width / 2);
    GACHA_STATE.dragOffsetY = e.clientY - (rect.top + rect.height / 2);
    disc.style.transition = 'none';
    disc.style.cursor = 'grabbing';
    disc.setPointerCapture(e.pointerId);
    e.preventDefault();
}

function onGachaDiscPointerMove(e) {
    if (!GACHA_STATE.dragging || e.pointerId !== GACHA_STATE.pointerId) return;
    const disc = e.currentTarget;
    const container = document.getElementById('gacha-altar-area');
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const targetX = e.clientX - GACHA_STATE.dragOffsetX - containerRect.left;
    const targetY = e.clientY - GACHA_STATE.dragOffsetY - containerRect.top;
    disc.style.left = `${targetX}px`;
    disc.style.top = `${targetY}px`;
    disc.style.transform = 'translate(-50%,-50%)';

    // 台座に近づいたらハイライトする
    const socket = document.getElementById('gacha-socket');
    if (socket) {
        const socketRect = socket.getBoundingClientRect();
        const socketCenterX = socketRect.left + socketRect.width / 2;
        const socketCenterY = socketRect.top + socketRect.height / 2;
        const dist = Math.hypot(e.clientX - socketCenterX, e.clientY - socketCenterY);
        socket.classList.toggle('gacha-socket-near', dist < socketRect.width * 0.55);
    }
    e.preventDefault();
}

function onGachaDiscPointerUp(e) {
    if (!GACHA_STATE.dragging || e.pointerId !== GACHA_STATE.pointerId) return;
    GACHA_STATE.dragging = false;
    const disc = e.currentTarget;
    disc.style.cursor = 'grab';
    const socket = document.getElementById('gacha-socket');
    if (socket) socket.classList.remove('gacha-socket-near');

    const container = document.getElementById('gacha-altar-area');
    if (!container || !socket) { snapGachaDiscBack(disc); return; }

    const discRect = disc.getBoundingClientRect();
    const discCenterX = discRect.left + discRect.width / 2;
    const discCenterY = discRect.top + discRect.height / 2;
    const socketRect = socket.getBoundingClientRect();
    const socketCenterX = socketRect.left + socketRect.width / 2;
    const socketCenterY = socketRect.top + socketRect.height / 2;
    const dist = Math.hypot(discCenterX - socketCenterX, discCenterY - socketCenterY);

    if (dist < socketRect.width * 0.55) {
        snapGachaDiscToSocket(disc, container, socket);
    } else {
        snapGachaDiscBack(disc);
    }
}

// --- 台座の外に離した場合：元の位置へふわっと戻す ---
function snapGachaDiscBack(disc) {
    disc.style.transition = 'left 0.35s ease-out, top 0.35s ease-out';
    disc.style.left = '50%';
    disc.style.top = '89%';
}

// --- 台座に配置成功：中央にスナップしてからガチャ実行フローを開始する ---
function snapGachaDiscToSocket(disc, container, socket) {
    const containerRect = container.getBoundingClientRect();
    const socketRect = socket.getBoundingClientRect();
    const socketCenterXPct = ((socketRect.left + socketRect.width / 2 - containerRect.left) / containerRect.width) * 100;
    const socketCenterYPct = ((socketRect.top + socketRect.height / 2 - containerRect.top) / containerRect.height) * 100;

    disc.style.transition = 'left 0.2s ease-out, top 0.2s ease-out';
    disc.style.left = `${socketCenterXPct}%`;
    disc.style.top = `${socketCenterYPct}%`;
    if (typeof AudioManager !== 'undefined' && AudioManager.playSE) AudioManager.playSE('gacha_place');

    startGachaPullFlow(disc);
}

// =====================================================
// ガチャ実行フロー：課金判定→抽選→回転演出→フラッシュ→結果発表
// =====================================================
async function startGachaPullFlow(disc) {
    if (GACHA_STATE.animating) return;
    GACHA_STATE.animating = true;

    const count = GACHA_STATE.pullCount || 1;
    const cost = count >= 11 ? GACHA_ELEVEN_COST : GACHA_SINGLE_COST;

    const instruction = document.getElementById('gacha-instruction-text');
    if (instruction) instruction.classList.add('hidden');

    const spend = await spendDiamonds(cost);
    if (!spend.success) {
        if (typeof showToast === 'function') showToast('💎 ダイヤが足りません…');
        setTimeout(() => snapGachaDiscBack(disc), 50);
        GACHA_STATE.animating = false;
        if (instruction) instruction.classList.remove('hidden');
        return;
    }
    if (typeof refreshDiamondBalanceDisplays === 'function') refreshDiamondBalanceDisplays();

    const results = pickGachaResults(count);
    const hasStarThree = results.some(r => r.rarity === 3);

    await playGachaSpinAnimation(disc, hasStarThree);
    await Promise.all(results.map(r => recordGachaResultOwnership(r).then(info => { r.isNew = info.isNew; })));
    renderGachaRevealPanel(results);
}

// --- 円盤石の回転演出：最初はゆっくり→次第に高速回転→フラッシュ ---
function playGachaSpinAnimation(disc, hasStarThree) {
    return new Promise(resolve => {
        disc.classList.add(hasStarThree ? 'gacha-disc-rainbowglow' : 'gacha-disc-goldglow');
        if (typeof AudioManager !== 'undefined' && AudioManager.playSE) AudioManager.playSE('gacha_spin_start');
        const spinDuration = 2200;
        const totalDeg = 1080 + Math.floor(Math.random() * 360);
        let anim = null;
        try {
            anim = disc.animate([
                { transform: 'translate(-50%,-50%) rotate(0deg) scale(1)' },
                { transform: `translate(-50%,-50%) rotate(${totalDeg}deg) scale(1.08)` }
            ], {
                duration: spinDuration,
                easing: 'cubic-bezier(0.55, 0.02, 0.85, 0.85)', // 最初ゆっくり→終盤にかけて加速するイージング
                fill: 'forwards'
            });
        } catch (e) { /* Web Animations API 非対応環境ではスピンなしでフラッシュへ進む */ }

        const proceedToFlash = () => {
            playGachaFlash(hasStarThree).then(resolve);
        };
        if (anim) anim.onfinish = proceedToFlash;
        else setTimeout(proceedToFlash, spinDuration);
    });
}

// --- フラッシュ演出（★3を含む場合は虹色） ---
function playGachaFlash(hasStarThree) {
    return new Promise(resolve => {
        const flash = document.getElementById('gacha-flash-overlay');
        if (!flash) { resolve(); return; }
        flash.className = `absolute inset-0 pointer-events-none z-30 ${hasStarThree ? 'gacha-flash-rainbow' : 'gacha-flash-normal'}`;
        if (typeof AudioManager !== 'undefined' && AudioManager.playSE) {
            AudioManager.playSE(hasStarThree ? 'gacha_flash_rare' : 'gacha_flash');
        }
        const flashDuration = hasStarThree ? 1100 : 600;
        setTimeout(() => {
            flash.className = 'absolute inset-0 pointer-events-none opacity-0 z-30';
            resolve();
        }, flashDuration);
    });
}

// =====================================================
// 結果発表パネルの描画
// =====================================================
const GACHA_RARITY_LABEL = { 1: '★1', 2: '★2', 3: '★3' };
const GACHA_RARITY_BORDER = { 1: 'border-gray-500', 2: 'border-sky-400', 3: 'border-fuchsia-400' };

function renderGachaRevealPanel(results) {
    const panel = document.getElementById('gacha-reveal-panel');
    const grid = document.getElementById('gacha-reveal-grid');
    if (!panel || !grid) return;

    grid.innerHTML = '';
    results.forEach((r, i) => {
        const card = document.createElement('div');
        card.className = `bg-[#1a120b] border-2 ${GACHA_RARITY_BORDER[r.rarity]} rounded-xl p-2 flex flex-col items-center text-center gacha-reveal-card`;
        card.style.animationDelay = `${i * 70}ms`;

        const visualId = `gacha-reveal-visual-${i}`;
        let badgeHtml = '';
        if (r.kind === 'monster') {
            badgeHtml = r.isNew
                ? '<span class="text-[8px] font-black text-emerald-300">NEW!</span>'
                : '<span class="text-[8px] font-black text-fuchsia-300">🔁 カケラ+1</span>';
        }

        card.innerHTML = `
            <span class="text-[9px] font-black ${r.rarity === 3 ? 'text-fuchsia-300' : r.rarity === 2 ? 'text-sky-300' : 'text-gray-400'}">${GACHA_RARITY_LABEL[r.rarity]}</span>
            <div id="${visualId}" class="w-12 h-12 flex items-center justify-center text-3xl my-1"></div>
            <span class="text-[9px] text-amber-100 font-bold leading-tight">${r.name}</span>
            ${badgeHtml}
        `;
        grid.appendChild(card);

        const visualEl = card.querySelector(`#${CSS.escape(visualId)}`);
        if (r.kind === 'monster' && typeof renderMonsterVisual === 'function') {
            renderMonsterVisual(visualEl, r.name, r.emoji, false, true, r.auraKey);
        } else if (visualEl) {
            const def = GACHA_FURNITURE_POOL.find(f => f.id === r.id);
            renderFurnitureIcon(visualEl, def || r, { imgClassName: 'w-full h-full object-contain drop-shadow' });
        }
    });

    panel.classList.remove('hidden');
    panel.classList.add('flex');
}
