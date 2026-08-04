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
// emitsLight: 灯り系の家具。マイルームの時間帯演出で、夕方・夜になると自動的に光る。
const GACHA_FURNITURE_POOL = [
    { id: 'furniture_wood_chair', name: '木の椅子', emoji: '🪑', rarity: 1 },
    { id: 'furniture_lantern', name: '灯りのランタン', emoji: '🏮', image: 'images/furniture/ランタン.png', rarity: 1, emitsLight: true },
    { id: 'furniture_potted_plant', name: '観葉植物', emoji: '🪴', image: 'images/furniture/観葉植物.png', rarity: 1 },
    { id: 'furniture_bookshelf', name: '古びた本棚', emoji: '📚', rarity: 1 },
    { id: 'furniture_candle', name: '燭台', emoji: '🕯️', image: 'images/furniture/燭台A.png', rarity: 1, emitsLight: true },
    { id: 'furniture_rug', name: 'ふかふかのラグ', emoji: '🟫', rarity: 2 },
    { id: 'furniture_fountain', name: '小さな噴水', emoji: '⛲', image: 'images/furniture/小さな噴水.png', rarity: 2 },
    { id: 'furniture_treasure_chest', name: '装飾された宝箱', emoji: '🗝️', image: 'images/furniture/宝箱.png', rarity: 2 },
    { id: 'furniture_windowlight', name: '丸窓', emoji: '🪟', image: 'images/furniture/窓.png', rarity: 2, emitsLight: true },
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
    { id: 'furniture_candelabra', name: '大燭台', emoji: '🕯️', image: 'images/furniture/燭台B.png', rarity: 2, emitsLight: true },
    { id: 'furniture_chair_with_lantern', name: '椅子とランタン', emoji: '🪑', image: 'images/furniture/木の椅子と明かり.png', rarity: 2, emitsLight: true },
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

// --- ★3モンスター：ピックアップ（PU）中のモンスター一覧 ---
// 通常の24種（KIN_NEJIKI_SPECIES_POOL、オーラは4色ランダム）とは別枠で、
// 期間限定でオーラ固定・排出率アップの対象になっているモンスターをここに追加していく。
// weight: 通常24種を「1種あたり重み1」とした場合の相対的な重み（大きいほど出やすい）。
const GACHA_PU_MONSTERS = [
    { speciesId: 'iblis', auraKey: 'black', weight: 2, label: 'PU' } // イブリース（黒オーラ固定）ピックアップ中
];

// =====================================================
// アンロック制モンスター（イブリース等）
// 通常の24種（KIN_NEJIKI_SPECIES_POOL）と異なり、実際にガチャで入手して初めて
// ガッツファクトリー／PvP／エンドレスモードで使用できるようになる特別な種族。
// 未所持のプレイヤーの手元では選択候補に出現しない。
// =====================================================
const GACHA_UNLOCKABLE_SPECIES = [
    { speciesId: 'iblis', auraKey: 'black' }
];

// 所持済みのアンロック種族ID一覧のキャッシュ（起動時・ガチャ後に更新される）
let GACHA_OWNED_UNLOCKABLE_SPECIES_IDS = [];

// --- 所持中のアンロック種族一覧をFirebaseから取得してキャッシュを更新する ---
async function refreshOwnedUnlockableSpecies() {
    if (typeof initFirebase !== 'function' || !initFirebase()) return;
    try {
        const pid = getMyPlayerId();
        const snap = await firebaseDb.ref(`player_inventory/${pid}/monsters`).once('value');
        const monsterCounts = snap.val() || {};
        GACHA_OWNED_UNLOCKABLE_SPECIES_IDS = GACHA_UNLOCKABLE_SPECIES
            .filter(entry => (monsterCounts[`${entry.speciesId}_${entry.auraKey}`] || 0) > 0)
            .map(entry => entry.speciesId);
    } catch (e) {
        console.error('[ガチャ] アンロック種族の所持確認エラー:', e);
    }
}

// --- プレイヤーが実際に使用できる種族プール（通常24種＋所持済みのアンロック種族）を返す ---
// ガッツファクトリー・PvP・エンドレスモードで「プレイヤー自身が使う」モンスターの候補生成にのみ使う。
// 敵（CPU）側の生成には引き続きKIN_NEJIKI_SPECIES_POOLをそのまま使う（イブリース等は出現しない）。
function getPlayableKinNejikiSpeciesPool() {
    return GACHA_OWNED_UNLOCKABLE_SPECIES_IDS.length
        ? KIN_NEJIKI_SPECIES_POOL.concat(GACHA_OWNED_UNLOCKABLE_SPECIES_IDS)
        : KIN_NEJIKI_SPECIES_POOL;
}

function rollRandomGachaMonster() {
    const normalPool = KIN_NEJIKI_SPECIES_POOL;
    const puTotalWeight = GACHA_PU_MONSTERS.reduce((sum, m) => sum + m.weight, 0);
    const totalWeight = normalPool.length + puTotalWeight;

    let r = Math.random() * totalWeight;
    for (const puMon of GACHA_PU_MONSTERS) {
        if (r < puMon.weight) {
            const tmpl = MONSTER_TEMPLATES[puMon.speciesId];
            return { rarity: 3, kind: 'monster', speciesId: puMon.speciesId, name: tmpl.name, emoji: tmpl.emoji, auraKey: puMon.auraKey, isPickup: true };
        }
        r -= puMon.weight;
    }

    const idx = Math.min(normalPool.length - 1, Math.floor(r));
    const speciesId = normalPool[idx];
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

// =====================================================
// 排出率確認モーダル
// =====================================================
function openGachaRateModal() {
    const body = document.getElementById('gacha-rate-modal-body');
    if (body) {
        const normalPool = KIN_NEJIKI_SPECIES_POOL;
        const puTotalWeight = GACHA_PU_MONSTERS.reduce((sum, m) => sum + m.weight, 0);
        const totalWeight = normalPool.length + puTotalWeight;
        const rarity3Rate = GACHA_RARITY_TABLE.find(r => r.rarity === 3).weight;

        const puRowsHtml = GACHA_PU_MONSTERS.map(m => {
            const tmpl = MONSTER_TEMPLATES[m.speciesId];
            const aura = AURA_TYPES[m.auraKey];
            const shareWithinR3 = (m.weight / totalWeight) * 100;
            const overallRate = (rarity3Rate * shareWithinR3 / 100);
            return `
                <div class="flex items-center justify-between bg-amber-900/20 border border-amber-700/50 rounded-lg px-2 py-1.5">
                    <span class="font-bold text-amber-200">${m.label ? `✨${m.label} ` : ''}${tmpl.emoji} ${tmpl.name}（${aura.emoji}${aura.name}固定）</span>
                    <span class="text-amber-300 font-black">${overallRate.toFixed(3)}%</span>
                </div>`;
        }).join('');

        const normalShareWithinR3 = (1 / totalWeight) * 100;
        const normalOverallRate = (rarity3Rate * normalShareWithinR3 / 100);

        body.innerHTML = `
            <div>
                <p class="text-amber-300 font-bold mb-1">■ レアリティ別排出率</p>
                <div class="space-y-1">
                    ${GACHA_RARITY_TABLE.map(r => `
                        <div class="flex items-center justify-between">
                            <span>${GACHA_RARITY_LABEL[r.rarity]}${r.rarity === 3 ? '（モンスター確定）' : '（家具）'}</span>
                            <span class="font-bold text-white">${r.weight}%</span>
                        </div>`).join('')}
                </div>
            </div>
            <div>
                <p class="text-amber-300 font-bold mb-1">■ ★3の内訳（モンスター）</p>
                <div class="space-y-1">
                    ${puRowsHtml}
                    <div class="flex items-center justify-between bg-[#1a120b] rounded-lg px-2 py-1.5">
                        <span>上記以外の24種（各種・オーラ4色ランダム）</span>
                        <span class="text-white font-bold">各${normalOverallRate.toFixed(3)}%</span>
                    </div>
                </div>
            </div>
            <p class="text-gray-500 text-[9px]">※★3内で被った場合は「モンスターのカケラ」を獲得できます。11連には★3確定の天井があります。</p>
        `;
    }
    const modal = document.getElementById('gacha-rate-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeGachaRateModal() {
    const modal = document.getElementById('gacha-rate-modal');
    if (modal) modal.classList.add('hidden');
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

    // 今回のガチャでアンロック制モンスター（イブリース等）を新規入手した場合、
    // 即座にガッツファクトリー等で使用できるようキャッシュを更新しておく
    const unlockedNewSpecies = results.some(r => r.kind === 'monster' && r.isNew &&
        GACHA_UNLOCKABLE_SPECIES.some(u => u.speciesId === r.speciesId && u.auraKey === r.auraKey));
    if (unlockedNewSpecies && typeof refreshOwnedUnlockableSpecies === 'function') {
        await refreshOwnedUnlockableSpecies();
    }

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
            if (r.isPickup) {
                badgeHtml = '<span class="text-[8px] font-black text-amber-300">✨PU</span> ' + badgeHtml;
            }
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

// =====================================================
// カケラ交換所
// ・★3モンスターがガチャで被ったときに貯まる「モンスターのカケラ」を使い、
//   好きな★3モンスター（種族＋オーラの組み合わせ）1体と交換できる。
// ・被りの受け皿として機能させるため、交換で手に入れたモンスターも通常のガチャ排出と
//   まったく同じ扱い（player_inventory/{pid}/monsters に所持数として加算）にする。
// ・既に持っている組み合わせを敢えて選ぶこともできる（所持数が増えるだけでカケラは還らない）。
// =====================================================
const KAKERA_EXCHANGE_COST = 5; // ★3モンスター1体と交換するのに必要なカケラ数

function openKakeraExchangeModal() {
    const modal = document.getElementById('kakera-exchange-modal');
    if (!modal) return;

    const costEl = document.getElementById('kakera-exchange-cost');
    if (costEl) costEl.textContent = String(KAKERA_EXCHANGE_COST);

    const speciesSelect = document.getElementById('kakera-exchange-species-select');
    if (speciesSelect && typeof KIN_NEJIKI_SPECIES_POOL !== 'undefined') {
        speciesSelect.innerHTML = KIN_NEJIKI_SPECIES_POOL.map(speciesId => {
            const tmpl = MONSTER_TEMPLATES[speciesId];
            return `<option value="${speciesId}">${tmpl ? tmpl.emoji + ' ' + tmpl.name : speciesId}</option>`;
        }).join('');
    }

    const auraSelect = document.getElementById('kakera-exchange-aura-select');
    if (auraSelect && typeof AURA_TYPES !== 'undefined') {
        // 白はモスト専用の特別オーラなので、交換所の選択肢からは除外する（exclusive:true）
        auraSelect.innerHTML = Object.keys(AURA_TYPES)
            .filter(auraKey => !AURA_TYPES[auraKey].exclusive)
            .map(auraKey => {
                const aura = AURA_TYPES[auraKey];
                return `<option value="${auraKey}">${aura.emoji} ${aura.name}</option>`;
            }).join('');
    }

    modal.classList.remove('hidden');
    refreshKakeraExchangeBalance();
}

function closeKakeraExchangeModal() {
    const modal = document.getElementById('kakera-exchange-modal');
    if (modal) modal.classList.add('hidden');
}

// --- 交換所内のカケラ所持数表示を更新し、足りているかどうかでボタンの有効・無効も切り替える ---
async function refreshKakeraExchangeBalance() {
    const balanceEl = document.getElementById('kakera-exchange-balance');
    const btn = document.getElementById('kakera-exchange-submit-btn');
    if (balanceEl) balanceEl.textContent = '…';
    const balance = (typeof fetchMyMonsterKakera === 'function') ? await fetchMyMonsterKakera() : 0;
    if (balanceEl) balanceEl.textContent = balance.toLocaleString();
    if (btn) {
        const enough = balance >= KAKERA_EXCHANGE_COST;
        btn.disabled = !enough;
        btn.classList.toggle('opacity-40', !enough);
        btn.textContent = enough
            ? `カケラ${KAKERA_EXCHANGE_COST}個で交換する`
            : `カケラが足りません（あと${KAKERA_EXCHANGE_COST - balance}個）`;
    }
    return balance;
}

async function redeemKakeraExchange() {
    const speciesSelect = document.getElementById('kakera-exchange-species-select');
    const auraSelect = document.getElementById('kakera-exchange-aura-select');
    const speciesId = speciesSelect ? speciesSelect.value : null;
    const auraKey = auraSelect ? auraSelect.value : null;
    if (!speciesId || !auraKey) return;

    const tmpl = (typeof MONSTER_TEMPLATES !== 'undefined') ? MONSTER_TEMPLATES[speciesId] : null;
    const aura = (typeof AURA_TYPES !== 'undefined') ? AURA_TYPES[auraKey] : null;
    const label = `${aura ? aura.emoji : ''}${tmpl ? tmpl.name : speciesId}`;

    const btn = document.getElementById('kakera-exchange-submit-btn');
    if (btn) btn.disabled = true; // 連打による二重交換を防ぐ

    // 先にカケラを消費し、成功した場合のみモンスターを付与する
    // （逆の順番にすると、途中で失敗したときにカケラを払わずにモンスターだけ得られてしまう）
    const spend = (typeof spendMonsterKakera === 'function')
        ? await spendMonsterKakera(KAKERA_EXCHANGE_COST)
        : { success: false };
    if (!spend.success) {
        if (typeof showToast === 'function') showToast('🔁 カケラが足りません');
        refreshKakeraExchangeBalance();
        return;
    }

    let granted = false;
    if (typeof initFirebase === 'function' && initFirebase()) {
        try {
            const pid = getMyPlayerId();
            await firebaseDb.ref(`player_inventory/${pid}/monsters/${speciesId}_${auraKey}`)
                .transaction(current => (current || 0) + 1);
            granted = true;
        } catch (e) {
            console.error('[カケラ交換所] モンスター付与エラー:', e);
        }
    }

    if (!granted) {
        // 付与に失敗した場合は、支払ったカケラを払い戻してから知らせる（カケラだけ失う事故を防ぐ）
        if (typeof awardMonsterKakera === 'function') await awardMonsterKakera(KAKERA_EXCHANGE_COST);
        if (typeof showToast === 'function') showToast('⚠️ 交換に失敗しました。通信状況を確認してもう一度お試しください（カケラは返却されました）');
        refreshKakeraExchangeBalance();
        return;
    }

    if (typeof showToast === 'function') showToast(`🎁 ${label}を仲間にしました！マイルームに配置できます`);
    refreshKakeraExchangeBalance();
}
