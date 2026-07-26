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

// --- タイトル画面・ガチャ画面のダイヤ残高表示をまとめて更新する ---
async function refreshDiamondBalanceDisplays() {
    const balance = await fetchMyDiamondBalance();
    const titleChip = document.getElementById('title-diamond-balance-chip');
    if (titleChip) titleChip.textContent = `💎${balance.toLocaleString()}`;
    const gachaBalanceEl = document.getElementById('gacha-diamond-balance');
    if (gachaBalanceEl) gachaBalanceEl.textContent = balance.toLocaleString();
    return balance;
}

// --- ガッツファクトリーのラン終了時に呼び出す：獲得ダイヤを計算・付与し、獲得量を返す ---
async function awardKinNejikiRunDiamonds(totalWins) {
    const amount = computeKinNejikiDiamondsForWins(totalWins);
    if (amount <= 0) return 0;
    await awardDiamonds(amount);
    if (typeof refreshDiamondBalanceDisplays === 'function') refreshDiamondBalanceDisplays();
    return amount;
}
