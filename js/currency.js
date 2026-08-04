// =====================================================
// currency.js
// 「ダイヤ」通貨システム（ガチャ・マイルーム構想のフェーズ1）
// ・獲得源：ガッツファクトリーの勝利数（ゲームオーバー or クリア時にまとめて付与）
//   セットが進むほど1勝あたりの獲得量が増える（set1:5 → set2:15 → set3:25 …と、
//   セットごとに+10ずつ。式：5 + 10 * (セット番号 - 1)）
// ・保存先：Firebase Realtime Database の player_currency/{playerId}
//   ・diamonds     : ダイヤ残高
//   ・monsterKakera: ★3モンスターが被った際に貯まる「モンスターのカケラ」
//                    （ガチャ実装＝フェーズ2で使用。既定数貯まると好きな★3モンスターと交換できる）
// =====================================================

// --- セット番号→1勝あたりのダイヤ獲得量 ---
function getKinNejikiDiamondRateForSet(setNumber) {
    return 5 + 10 * (Math.max(1, setNumber) - 1);
}

// --- 通算勝利数（0〜49）から、そのランで獲得したダイヤの合計を計算する ---
// セットごとにレートが変わるため、7戦単位で区切りながら合算する
// （例：10勝でゲームオーバーの場合 → set1の7勝(5×7=35) + set2の3勝(15×3=45) = 80ダイヤ）
function computeKinNejikiDiamondsForWins(totalWins) {
    let remaining = Math.max(0, Math.min(49, totalWins || 0));
    let total = 0;
    let setNumber = 1;
    while (remaining > 0 && setNumber <= 7) {
        const winsInThisSet = Math.min(7, remaining);
        total += winsInThisSet * getKinNejikiDiamondRateForSet(setNumber);
        remaining -= winsInThisSet;
        setNumber++;
    }
    return total;
}

// --- ダイヤ残高に加算する（Firebaseのtransactionで安全に加算） ---
async function awardDiamonds(amount) {
    if (!amount || amount <= 0) return null;
    if (typeof initFirebase !== 'function' || !initFirebase()) return null;
    try {
        const pid = getMyPlayerId();
        const ref = firebaseDb.ref(`player_currency/${pid}/diamonds`);
        const result = await ref.transaction(current => (current || 0) + amount);
        return result && result.committed ? result.snapshot.val() : null;
    } catch (e) {
        console.error('[ダイヤ] 加算エラー:', e);
        return null;
    }
}

// --- 現在のダイヤ残高を取得する ---
async function fetchMyDiamondBalance() {
    if (typeof initFirebase !== 'function' || !initFirebase()) return 0;
    try {
        const pid = getMyPlayerId();
        const snap = await firebaseDb.ref(`player_currency/${pid}/diamonds`).once('value');
        return snap.val() || 0;
    } catch (e) {
        console.error('[ダイヤ] 残高取得エラー:', e);
        return 0;
    }
}

// --- ダイヤ残高から指定額を消費する（残高不足ならsuccess:falseを返し、何も変更しない） ---
async function spendDiamonds(amount) {
    if (!amount || amount <= 0) return { success: false, balance: null };
    if (typeof initFirebase !== 'function' || !initFirebase()) return { success: false, balance: null };
    let insufficientFunds = false;
    try {
        const pid = getMyPlayerId();
        const ref = firebaseDb.ref(`player_currency/${pid}/diamonds`);
        const result = await ref.transaction(current => {
            const balance = current || 0;
            if (balance < amount) {
                insufficientFunds = true;
                return balance; // 残高不足：変更しない
            }
            insufficientFunds = false;
            return balance - amount;
        });
        const finalBalance = (result && result.snapshot) ? result.snapshot.val() : null;
        return { success: !insufficientFunds, balance: finalBalance };
    } catch (e) {
        console.error('[ダイヤ] 消費エラー:', e);
        return { success: false, balance: null };
    }
}

// --- 「モンスターのカケラ」（★3モンスター重複時に貯まる交換用ポイント）関連 ---
async function awardMonsterKakera(amount) {
    if (!amount || amount <= 0) return null;
    if (typeof initFirebase !== 'function' || !initFirebase()) return null;
    try {
        const pid = getMyPlayerId();
        const ref = firebaseDb.ref(`player_currency/${pid}/monsterKakera`);
        const result = await ref.transaction(current => (current || 0) + amount);
        return result && result.committed ? result.snapshot.val() : null;
    } catch (e) {
        console.error('[モンスターのカケラ] 加算エラー:', e);
        return null;
    }
}

async function fetchMyMonsterKakera() {
    if (typeof initFirebase !== 'function' || !initFirebase()) return 0;
    try {
        const pid = getMyPlayerId();
        const snap = await firebaseDb.ref(`player_currency/${pid}/monsterKakera`).once('value');
        return snap.val() || 0;
    } catch (e) {
        console.error('[モンスターのカケラ] 取得エラー:', e);
        return 0;
    }
}

// --- カケラを指定個数消費する（不足していればsuccess:falseを返し、何も変更しない） ---
// ダイヤと同じくtransactionで判定・減算を1回の操作にまとめ、二重消費が起きないようにする。
async function spendMonsterKakera(amount) {
    if (!amount || amount <= 0) return { success: false, balance: null };
    if (typeof initFirebase !== 'function' || !initFirebase()) return { success: false, balance: null };
    let insufficient = false;
    try {
        const pid = getMyPlayerId();
        const ref = firebaseDb.ref(`player_currency/${pid}/monsterKakera`);
        const result = await ref.transaction(current => {
            const balance = current || 0;
            if (balance < amount) {
                insufficient = true;
                return balance; // 不足：変更しない
            }
            insufficient = false;
            return balance - amount;
        });
        const finalBalance = (result && result.snapshot) ? result.snapshot.val() : null;
        return { success: !insufficient, balance: finalBalance };
    } catch (e) {
        console.error('[モンスターのカケラ] 消費エラー:', e);
        return { success: false, balance: null };
    }
}

// --- マイルーム初回来訪特典チケット（好きな家具1つ・好きなモンスター1体と交換できる） ---
async function awardMyRoomTicket(amount) {
    if (!amount || amount <= 0) return null;
    if (typeof initFirebase !== 'function' || !initFirebase()) return null;
    try {
        const pid = getMyPlayerId();
        const ref = firebaseDb.ref(`player_currency/${pid}/myroomTicket`);
        const result = await ref.transaction(current => (current || 0) + amount);
        return result && result.committed ? result.snapshot.val() : null;
    } catch (e) {
        console.error('[マイルームチケット] 加算エラー:', e);
        return null;
    }
}

async function fetchMyRoomTicketCount() {
    if (typeof initFirebase !== 'function' || !initFirebase()) return 0;
    try {
        const pid = getMyPlayerId();
        const snap = await firebaseDb.ref(`player_currency/${pid}/myroomTicket`).once('value');
        return snap.val() || 0;
    } catch (e) {
        console.error('[マイルームチケット] 取得エラー:', e);
        return 0;
    }
}

// --- チケットを1枚消費する（残数が無い場合はsuccess:falseを返す） ---
async function spendMyRoomTicket() {
    if (typeof initFirebase !== 'function' || !initFirebase()) return { success: false };
    let insufficientTickets = false;
    try {
        const pid = getMyPlayerId();
        const ref = firebaseDb.ref(`player_currency/${pid}/myroomTicket`);
        const result = await ref.transaction(current => {
            const count = current || 0;
            if (count < 1) { insufficientTickets = true; return count; }
            insufficientTickets = false;
            return count - 1;
        });
        return { success: !insufficientTickets, balance: result && result.snapshot ? result.snapshot.val() : null };
    } catch (e) {
        console.error('[マイルームチケット] 消費エラー:', e);
        return { success: false };
    }
}

// --- ガチャの「天井」用累計連数カウント ---
// GACHA_PITY_THRESHOLD連（現在110連）ごとに「PU交換チケット」を1枚獲得する。
const GACHA_PITY_THRESHOLD = 110;

// 今回引いた回数（pullCount）を累計連数に加算し、天井を跨いだ分だけチケットを付与する。
// 戻り値：{ ticketsGranted, totalPulls }
async function advanceGachaPityCounter(pullCount) {
    if (!pullCount || pullCount <= 0) return { ticketsGranted: 0, totalPulls: 0 };
    if (typeof initFirebase !== 'function' || !initFirebase()) return { ticketsGranted: 0, totalPulls: 0 };
    try {
        const pid = getMyPlayerId();
        const ref = firebaseDb.ref(`player_currency/${pid}/gachaTotalPullCount`);
        let oldTotal = 0;
        const result = await ref.transaction(current => {
            oldTotal = current || 0;
            return oldTotal + pullCount;
        });
        const newTotal = (result && result.snapshot) ? result.snapshot.val() : (oldTotal + pullCount);
        // 1回の11連でも天井を複数回跨ぐ可能性を考慮し、差分から獲得枚数を算出する
        const ticketsGranted = Math.floor(newTotal / GACHA_PITY_THRESHOLD) - Math.floor(oldTotal / GACHA_PITY_THRESHOLD);
        if (ticketsGranted > 0) await awardGachaPuTickets(ticketsGranted);
        return { ticketsGranted, totalPulls: newTotal };
    } catch (e) {
        console.error('[ガチャ天井] カウント加算エラー:', e);
        return { ticketsGranted: 0, totalPulls: 0 };
    }
}

async function fetchMyGachaTotalPullCount() {
    if (typeof initFirebase !== 'function' || !initFirebase()) return 0;
    try {
        const pid = getMyPlayerId();
        const snap = await firebaseDb.ref(`player_currency/${pid}/gachaTotalPullCount`).once('value');
        return snap.val() || 0;
    } catch (e) {
        console.error('[ガチャ天井] 累計連数取得エラー:', e);
        return 0;
    }
}

// --- PU交換チケット（天井到達で獲得。その時点でピックアップ中のモンスターと確定交換できる） ---
async function awardGachaPuTickets(amount) {
    if (!amount || amount <= 0) return null;
    if (typeof initFirebase !== 'function' || !initFirebase()) return null;
    try {
        const pid = getMyPlayerId();
        const ref = firebaseDb.ref(`player_currency/${pid}/gachaPuTickets`);
        const result = await ref.transaction(current => (current || 0) + amount);
        return result && result.committed ? result.snapshot.val() : null;
    } catch (e) {
        console.error('[PU交換チケット] 加算エラー:', e);
        return null;
    }
}

async function fetchMyGachaPuTickets() {
    if (typeof initFirebase !== 'function' || !initFirebase()) return 0;
    try {
        const pid = getMyPlayerId();
        const snap = await firebaseDb.ref(`player_currency/${pid}/gachaPuTickets`).once('value');
        return snap.val() || 0;
    } catch (e) {
        console.error('[PU交換チケット] 取得エラー:', e);
        return 0;
    }
}

// --- PU交換チケットを1枚消費する（残数が無い場合はsuccess:falseを返す） ---
async function spendGachaPuTicket() {
    if (typeof initFirebase !== 'function' || !initFirebase()) return { success: false };
    let insufficientTickets = false;
    try {
        const pid = getMyPlayerId();
        const ref = firebaseDb.ref(`player_currency/${pid}/gachaPuTickets`);
        const result = await ref.transaction(current => {
            const count = current || 0;
            if (count < 1) { insufficientTickets = true; return count; }
            insufficientTickets = false;
            return count - 1;
        });
        return { success: !insufficientTickets, balance: result && result.snapshot ? result.snapshot.val() : null };
    } catch (e) {
        console.error('[PU交換チケット] 消費エラー:', e);
        return { success: false };
    }
}


async function fetchClaimedAchievementDiamondIds() {
    if (typeof initFirebase !== 'function' || !initFirebase()) return {};
    try {
        const pid = getMyPlayerId();
        const snap = await firebaseDb.ref(`player_currency/${pid}/achvDiamondsClaimed`).once('value');
        return snap.val() || {};
    } catch (e) {
        console.error('[実績報酬] 受領済み一覧取得エラー:', e);
        return {};
    }
}

async function markAchievementDiamondsClaimed(achievementIds) {
    if (!achievementIds || achievementIds.length === 0) return;
    if (typeof initFirebase !== 'function' || !initFirebase()) return;
    try {
        const pid = getMyPlayerId();
        const updates = {};
        achievementIds.forEach(id => { updates[id] = true; });
        await firebaseDb.ref(`player_currency/${pid}/achvDiamondsClaimed`).update(updates);
    } catch (e) {
        console.error('[実績報酬] 受領済みフラグ保存エラー:', e);
    }
}

// --- タイトル画面・ガチャ画面のダイヤ残高表示をまとめて更新する ---
async function refreshDiamondBalanceDisplays() {
    const balance = await fetchMyDiamondBalance();
    const titleChip = document.getElementById('title-diamond-balance-chip');
    if (titleChip) titleChip.textContent = `💎${balance.toLocaleString()}`;
    const gachaBalanceEl = document.getElementById('gacha-diamond-balance');
    if (gachaBalanceEl) gachaBalanceEl.textContent = balance.toLocaleString();
    return balance;
}

// =====================================================
// 初回ログイン特典：ダイヤ1,500個プレゼント
// ・今回の更新を起点に、まだ受け取っていない全プレイヤー（既存・新規問わず）に
//   次回起動時1回だけ自動で付与する。
// ・player_currency/{pid}/launchBonusClaimed フラグで、既に受け取ったかどうかを管理する
//   （このフラグが無い＝まだ未受領のプレイヤー、という判定にしているため、
//   　更新前から遊んでいた既存プレイヤーにも次回起動時に自動で行き渡る）
// =====================================================
const LAUNCH_DIAMOND_BONUS_AMOUNT = 1500;

async function checkFirstLoginDiamondBonus() {
    if (typeof initFirebase !== 'function' || !initFirebase()) return;
    const pid = getMyPlayerId();
    try {
        const ref = firebaseDb.ref(`player_currency/${pid}/launchBonusClaimed`);
        const snap = await ref.once('value');
        if (snap.val()) return; // 既に受け取り済み
        await ref.set(true);
        await awardDiamonds(LAUNCH_DIAMOND_BONUS_AMOUNT);
        if (typeof refreshDiamondBalanceDisplays === 'function') refreshDiamondBalanceDisplays();
        if (typeof showToast === 'function') {
            showToast(`🎁 初回ログイン特典！ダイヤを${LAUNCH_DIAMOND_BONUS_AMOUNT.toLocaleString()}個プレゼント！`);
        }
    } catch (e) {
        console.error('[ダイヤ] 初回ログイン特典の付与エラー:', e);
    }
}

// =====================================================
// デイリーログインボーナス：毎日1回目のアクセス時にダイヤ150個プレゼント
// ・player_currency/{pid}/lastLoginBonusDate に「最後に受け取った日付」を保存し、
//   端末のローカル日付と比較して、日付が変わっていれば再度受け取れるようにする
// =====================================================
const DAILY_LOGIN_BONUS_AMOUNT = 150;

function getTodayDateStringForBonusCheck() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function checkDailyLoginBonus() {
    if (typeof initFirebase !== 'function' || !initFirebase()) return;
    const pid = getMyPlayerId();
    try {
        const ref = firebaseDb.ref(`player_currency/${pid}/lastLoginBonusDate`);
        const snap = await ref.once('value');
        const today = getTodayDateStringForBonusCheck();
        if (snap.val() === today) return; // 本日は既に受け取り済み
        await ref.set(today);
        await awardDiamonds(DAILY_LOGIN_BONUS_AMOUNT);
        if (typeof refreshDiamondBalanceDisplays === 'function') refreshDiamondBalanceDisplays();
        if (typeof showToast === 'function') {
            showToast(`🎁 ログインボーナス！ダイヤを${DAILY_LOGIN_BONUS_AMOUNT}個獲得しました！`);
        }
    } catch (e) {
        console.error('[ダイヤ] デイリーログインボーナスの付与エラー:', e);
    }
}

// --- ガッツファクトリーのラン終了時に呼び出す：獲得ダイヤを計算・付与し、獲得量を返す ---
async function awardKinNejikiRunDiamonds(totalWins) {
    const amount = computeKinNejikiDiamondsForWins(totalWins);
    if (amount <= 0) return 0;
    await awardDiamonds(amount);
    if (typeof refreshDiamondBalanceDisplays === 'function') refreshDiamondBalanceDisplays();
    return amount;
}
