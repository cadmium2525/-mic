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

// --- ガッツファクトリーのラン終了時に呼び出す：獲得ダイヤを計算・付与し、獲得量を返す ---
async function awardKinNejikiRunDiamonds(totalWins) {
    const amount = computeKinNejikiDiamondsForWins(totalWins);
    if (amount <= 0) return 0;
    await awardDiamonds(amount);
    return amount;
}
