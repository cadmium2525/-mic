// =====================================================
// friends.js
// フレンド機能（フレンドコード・プロフィール・フレンドのマイルーム閲覧）
//
// ★セキュリティ設計（重要）★
// このゲームのアカウントID（localStorageの mfload_player_id、"p_"で始まる文字列）は、
// アカウント管理の「以前のIDで復帰する」にそのまま入力するだけで、そのアカウントに
// 成り代われてしまう＝実質的にパスワードと同じ重みを持つ情報である。
// そのため、フレンド機能でアカウントIDをそのまま交換させる設計にすると、
// 「フレンドになった相手に自分のアカウントを乗っ取られる」危険がある。
//
// そこで、以下のように「他人に見せてよい情報」と「絶対に見せてはいけない情報」を
// 完全に別のIDに分離している：
//
//   ・アカウントID（pid）      … 秘密。パスワード相当。フレンド機能では一切送信も表示もしない。
//   ・公開ID（pubId）          … 公開してよいID。pidとは無関係な別の乱数として発行する。
//                                pidから計算・復元することは不可能。
//                                公開プロフィール・公開マイルームの保存場所のキーになる。
//   ・フレンドコード（code）   … 相手に伝えるための短い文字列（例：GR-A3KD-9F2M）。
//                                friend_codes/{code} には pubId だけを保存する。
//
// この分離により、
//   ・フレンドコードやpubIdがどれだけ広まっても、pidは推測できないため乗っ取りは起きない
//   ・万が一フレンドコードを晒してしまっても、コードは再発行でき、古いコードは無効化される
//   ・閲覧できるのは「公開用に書き出したマイルームのスナップショット」だけで、
//     所持品の全データやプレイ記録・課金情報に相当するものは一切公開しない
//   ・フレンドのデータへの書き込み経路を作らない（閲覧専用）ため、荒らしも成立しない
// という状態を保っている。
//
// ※注意：Firebase Realtime Database 側のセキュリティルールも併せて設定することを強く推奨する。
//   このファイルはクライアント側の設計だけで「乗っ取りに繋がる情報を流さない」ようにしているが、
//   DBのルールが全公開のままだと、悪意のある第三者が直接DBを触ってデータを書き換えられる。
//   推奨ルールは README 的な形でこのファイル末尾のコメントに記載している。
//
// Firebase Realtime Database の構成：
//   player_profile/{pid}   = { publicId, friendCode }            ← 自分だけが読み書きする対応表
//   friend_codes/{CODE}    = { pubId, updatedAt }                ← コード→公開IDの逆引き（公開）
//   player_public/{pubId}  = { name, iconSpeciesId, iconAuraKey,  ← 公開プロフィール＋公開マイルーム
//                              room: { backgroundId, placedFurniture, placedMonsters }, updatedAt }
//   player_friends/{pid}/{pubId} = { addedAt }                    ← 自分のフレンド一覧（自分の領域のみ）
// =====================================================

// --- フレンドコードに使う文字（0/O・1/I/l など、見間違えやすい文字は最初から使わない） ---
const FRIEND_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const FRIEND_CODE_BODY_LENGTH = 8; // GR-XXXX-XXXX の X の総数
const FRIEND_CODE_PREFIX = 'GR';

// メモリ上のキャッシュ（同じ画面内で何度も取得し直さないため）
const FRIENDS_STATE = {
    myPublicId: null,
    myFriendCode: null,
    myProfile: null,      // { name, iconSpeciesId, iconAuraKey }
    friendList: [],       // [{ pubId, name, iconSpeciesId, iconAuraKey }]
    visitingPubId: null,  // フレンドのマイルームを閲覧中の場合、その公開ID
    visitingName: null
};

// =====================================================
// 公開ID・フレンドコードの発行と取得
// =====================================================

// --- ランダムな公開IDを生成する（アカウントIDとは何の関係も持たせない） ---
function generateNewPublicId() {
    return 'pub_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
}

// --- ランダムなフレンドコード本体を生成する ---
function generateFriendCodeBody() {
    let body = '';
    for (let i = 0; i < FRIEND_CODE_BODY_LENGTH; i++) {
        body += FRIEND_CODE_ALPHABET[Math.floor(Math.random() * FRIEND_CODE_ALPHABET.length)];
    }
    return body;
}

// --- 表示用の整形（GR-XXXX-XXXX） ---
function formatFriendCode(body) {
    const half = FRIEND_CODE_BODY_LENGTH / 2;
    return `${FRIEND_CODE_PREFIX}-${body.slice(0, half)}-${body.slice(half)}`;
}

// --- 入力されたフレンドコードを正規化する（大文字化・区切り文字や空白の除去） ---
// ユーザーが「gr-a3kd-9f2m」「GR A3KD 9F2M」「a3kd9f2m」のどう入力しても通るようにする。
// 正規化できない（文字数・使用文字が不正な）場合はnullを返す。
function normalizeFriendCodeInput(raw) {
    if (!raw) return null;
    const cleaned = String(raw).toUpperCase().replace(/[\s\-_]/g, '');

    // 先頭の "GR" は接頭辞として取り除く。ただしコード本体そのものが偶然 "GR" で始まる場合
    // （例：本体が GRDDQP94）に無条件で削ってしまうと、本体の2文字を削って壊してしまうため、
    // 「削った結果がちょうど本体の長さになる」場合のみ接頭辞と見なす。
    let body = cleaned;
    if (body.length !== FRIEND_CODE_BODY_LENGTH
        && body.startsWith(FRIEND_CODE_PREFIX)
        && body.length - FRIEND_CODE_PREFIX.length === FRIEND_CODE_BODY_LENGTH) {
        body = body.slice(FRIEND_CODE_PREFIX.length);
    }

    if (body.length !== FRIEND_CODE_BODY_LENGTH) return null;
    for (const ch of body) {
        if (!FRIEND_CODE_ALPHABET.includes(ch)) return null;
    }
    return body;
}

// --- 自分の公開ID・フレンドコードを取得する（無ければその場で発行して保存する） ---
async function ensureMyPublicIdentity() {
    if (FRIENDS_STATE.myPublicId && FRIENDS_STATE.myFriendCode) {
        return { publicId: FRIENDS_STATE.myPublicId, friendCode: FRIENDS_STATE.myFriendCode };
    }
    if (typeof initFirebase !== 'function' || !initFirebase()) return { publicId: null, friendCode: null };

    const pid = getMyPlayerId();
    try {
        const snap = await firebaseDb.ref(`player_profile/${pid}`).once('value');
        const val = snap.val();
        if (val && val.publicId && val.friendCode) {
            FRIENDS_STATE.myPublicId = val.publicId;
            FRIENDS_STATE.myFriendCode = val.friendCode;
            return { publicId: val.publicId, friendCode: val.friendCode };
        }

        // まだ発行していない（初回）ので、公開IDとフレンドコードを新規発行する
        const publicId = (val && val.publicId) ? val.publicId : generateNewPublicId();
        const friendCode = await issueUniqueFriendCode(publicId);
        if (!friendCode) return { publicId: null, friendCode: null };

        await firebaseDb.ref(`player_profile/${pid}`).update({ publicId, friendCode });
        FRIENDS_STATE.myPublicId = publicId;
        FRIENDS_STATE.myFriendCode = friendCode;
        return { publicId, friendCode };
    } catch (e) {
        console.error('[フレンド] 公開ID・フレンドコードの取得エラー:', e);
        return { publicId: null, friendCode: null };
    }
}

// --- 未使用のフレンドコードを1つ確保して返す（既に使われていたら別のコードで再試行する） ---
async function issueUniqueFriendCode(publicId) {
    for (let attempt = 0; attempt < 8; attempt++) {
        const body = generateFriendCodeBody();
        try {
            const ref = firebaseDb.ref(`friend_codes/${body}`);
            let won = false;
            // transactionで「まだ誰も使っていなければ自分のものにする」を1操作で行い、
            // 同時に同じコードが発行されて衝突するのを防ぐ
            await ref.transaction(current => {
                if (current) { won = false; return current; } // 既に他の人が使用中：別のコードを試す
                won = true;
                return { pubId: publicId, updatedAt: Date.now() };
            });
            if (won) return body;
        } catch (e) {
            console.error('[フレンド] フレンドコード発行エラー:', e);
            return null;
        }
    }
    console.error('[フレンド] フレンドコードの発行に失敗しました（衝突が続いたため）');
    return null;
}

// --- フレンドコードを再発行する（コードを不用意に広めてしまった場合の回避手段） ---
// 古いコードは削除するため、以降そのコードでは自分を検索できなくなる。
// 既に登録済みのフレンドは公開IDで繋がっているため、再発行しても一覧から消えることはない。
async function regenerateMyFriendCode() {
    if (typeof initFirebase !== 'function' || !initFirebase()) {
        if (typeof showToast === 'function') showToast('通信できませんでした。時間をおいてお試しください。');
        return;
    }
    if (!confirm('フレンドコードを再発行します。\n今までのコードは無効になり、そのコードで新しく登録することはできなくなります。\n（すでに登録済みのフレンドはそのまま残ります）\n\nよろしいですか？')) return;

    const identity = await ensureMyPublicIdentity();
    if (!identity.publicId) {
        if (typeof showToast === 'function') showToast('フレンドコードの再発行に失敗しました。');
        return;
    }

    const oldCode = identity.friendCode;
    const newCode = await issueUniqueFriendCode(identity.publicId);
    if (!newCode) {
        if (typeof showToast === 'function') showToast('フレンドコードの再発行に失敗しました。');
        return;
    }

    try {
        const pid = getMyPlayerId();
        await firebaseDb.ref(`player_profile/${pid}`).update({ friendCode: newCode });
        // 新しいコードを確保できた後に古いコードを消す（順番を逆にすると、
        // 途中で失敗したときにどのコードでも検索できない状態になってしまう）
        if (oldCode) await firebaseDb.ref(`friend_codes/${oldCode}`).remove();
    } catch (e) {
        console.error('[フレンド] フレンドコード再発行の保存エラー:', e);
    }

    FRIENDS_STATE.myFriendCode = newCode;
    renderMyFriendCodeDisplay();
    if (typeof showToast === 'function') showToast('🔄 フレンドコードを再発行しました');
}

// =====================================================
// プロフィール（表示名＋アイコンのモンスター）
// =====================================================

// --- 自分の公開プロフィールを保存する（表示名は常にタイトル画面で入力した名前を使う） ---
async function saveMyPublicProfile(iconSpeciesId, iconAuraKey) {
    if (typeof initFirebase !== 'function' || !initFirebase()) return false;
    const identity = await ensureMyPublicIdentity();
    if (!identity.publicId) return false;
    try {
        await firebaseDb.ref(`player_public/${identity.publicId}`).update({
            name: (typeof GAME_STATE !== 'undefined' && GAME_STATE.playerName) ? GAME_STATE.playerName : 'ブリーダー',
            iconSpeciesId: iconSpeciesId || null,
            iconAuraKey: iconAuraKey || null,
            updatedAt: Date.now()
        });
        FRIENDS_STATE.myProfile = {
            name: (typeof GAME_STATE !== 'undefined' && GAME_STATE.playerName) ? GAME_STATE.playerName : 'ブリーダー',
            iconSpeciesId: iconSpeciesId || null,
            iconAuraKey: iconAuraKey || null
        };
        return true;
    } catch (e) {
        console.error('[フレンド] プロフィール保存エラー:', e);
        return false;
    }
}

// --- 自分の公開プロフィールを取得する ---
async function fetchMyPublicProfile() {
    if (typeof initFirebase !== 'function' || !initFirebase()) return null;
    const identity = await ensureMyPublicIdentity();
    if (!identity.publicId) return null;
    try {
        const snap = await firebaseDb.ref(`player_public/${identity.publicId}`).once('value');
        const val = snap.val() || {};
        FRIENDS_STATE.myProfile = {
            name: val.name || null,
            iconSpeciesId: val.iconSpeciesId || null,
            iconAuraKey: val.iconAuraKey || null
        };
        return FRIENDS_STATE.myProfile;
    } catch (e) {
        console.error('[フレンド] プロフィール取得エラー:', e);
        return null;
    }
}

// --- マイルームの現在の配置を「公開用スナップショット」として書き出す ---
// フレンドが閲覧するのはこのスナップショットのみ。所持品の全リストなどは公開しない。
// myroom.js の saveMyRoomPlacement から呼ばれる。
async function publishMyRoomSnapshot() {
    if (typeof initFirebase !== 'function' || !initFirebase()) return;
    if (typeof MYROOM_STATE === 'undefined') return;
    const identity = await ensureMyPublicIdentity();
    if (!identity.publicId) return;
    try {
        await firebaseDb.ref(`player_public/${identity.publicId}`).update({
            name: (typeof GAME_STATE !== 'undefined' && GAME_STATE.playerName) ? GAME_STATE.playerName : 'ブリーダー',
            room: {
                backgroundId: MYROOM_STATE.backgroundId,
                placedFurniture: MYROOM_STATE.placedFurniture || {},
                placedMonsters: MYROOM_STATE.placedMonsters || {}
            },
            updatedAt: Date.now()
        });
    } catch (e) {
        console.error('[フレンド] マイルーム公開データの保存エラー:', e);
    }
}

// =====================================================
// フレンド一覧
// =====================================================

// --- フレンドコードから相手を検索して、自分のフレンド一覧に追加する ---
async function addFriendByCode() {
    const input = document.getElementById('friend-add-code-input');
    const raw = input ? input.value : '';
    const body = normalizeFriendCodeInput(raw);

    if (!body) {
        if (typeof showToast === 'function') showToast('フレンドコードの形式が正しくありません（GR-XXXX-XXXX の形式で入力してください）');
        return;
    }
    if (typeof initFirebase !== 'function' || !initFirebase()) {
        if (typeof showToast === 'function') showToast('通信できませんでした。時間をおいてお試しください。');
        return;
    }

    const identity = await ensureMyPublicIdentity();
    if (identity.friendCode === body) {
        if (typeof showToast === 'function') showToast('自分のフレンドコードです。');
        return;
    }

    try {
        // コード→公開IDの逆引き。ここで得られるのは公開IDのみで、
        // 相手のアカウントID（pid）は保存されていないため取得できない。
        const snap = await firebaseDb.ref(`friend_codes/${body}`).once('value');
        const rec = snap.val();
        if (!rec || !rec.pubId) {
            if (typeof showToast === 'function') showToast('そのフレンドコードのブリーダーは見つかりませんでした。');
            return;
        }
        const friendPubId = rec.pubId;

        const existing = FRIENDS_STATE.friendList.find(f => f.pubId === friendPubId);
        if (existing) {
            if (typeof showToast === 'function') showToast(`${existing.name || 'このブリーダー'}はすでにフレンドです。`);
            return;
        }

        // 自分の領域（player_friends/{自分のpid}）にだけ書き込む。
        // 相手のデータには一切書き込まないので、勝手に相手の情報を変えることはできない。
        const pid = getMyPlayerId();
        await firebaseDb.ref(`player_friends/${pid}/${friendPubId}`).set({ addedAt: Date.now() });

        if (input) input.value = '';
        if (typeof showToast === 'function') showToast('🤝 フレンドに追加しました！');
        await loadAndRenderFriendList();
    } catch (e) {
        console.error('[フレンド] フレンド追加エラー:', e);
        if (typeof showToast === 'function') showToast('フレンドの追加に失敗しました。');
    }
}

// --- フレンドを一覧から削除する（自分の一覧から消すだけで、相手側には何の影響もない） ---
async function removeFriend(friendPubId) {
    if (!friendPubId) return;
    const friend = FRIENDS_STATE.friendList.find(f => f.pubId === friendPubId);
    const label = friend && friend.name ? friend.name : 'このブリーダー';
    if (!confirm(`${label}をフレンド一覧から削除しますか？`)) return;
    if (typeof initFirebase !== 'function' || !initFirebase()) return;
    try {
        const pid = getMyPlayerId();
        await firebaseDb.ref(`player_friends/${pid}/${friendPubId}`).remove();
        if (typeof showToast === 'function') showToast('フレンドを削除しました。');
        await loadAndRenderFriendList();
    } catch (e) {
        console.error('[フレンド] フレンド削除エラー:', e);
    }
}

// --- 自分のフレンド一覧を取得して描画する ---
async function loadAndRenderFriendList() {
    const container = document.getElementById('friend-list-container');
    if (container) container.innerHTML = `<p class="text-gray-500 text-[10px]">読み込み中…</p>`;
    if (typeof initFirebase !== 'function' || !initFirebase()) {
        if (container) container.innerHTML = `<p class="text-gray-500 text-[10px]">通信できませんでした。</p>`;
        return;
    }

    try {
        const pid = getMyPlayerId();
        const snap = await firebaseDb.ref(`player_friends/${pid}`).once('value');
        const map = snap.val() || {};
        const pubIds = Object.keys(map);

        // 各フレンドの公開プロフィールをまとめて取得する
        const profiles = await Promise.all(pubIds.map(async pubId => {
            try {
                const pSnap = await firebaseDb.ref(`player_public/${pubId}`).once('value');
                const val = pSnap.val() || {};
                return {
                    pubId,
                    name: val.name || '（名前未設定）',
                    iconSpeciesId: val.iconSpeciesId || null,
                    iconAuraKey: val.iconAuraKey || null,
                    hasRoom: !!(val.room),
                    addedAt: (map[pubId] && map[pubId].addedAt) || 0
                };
            } catch (e) {
                return { pubId, name: '（読み込めませんでした）', iconSpeciesId: null, iconAuraKey: null, hasRoom: false, addedAt: 0 };
            }
        }));
        profiles.sort((a, b) => a.addedAt - b.addedAt);
        FRIENDS_STATE.friendList = profiles;
        renderFriendListInto(container, profiles);
    } catch (e) {
        console.error('[フレンド] フレンド一覧取得エラー:', e);
        if (container) container.innerHTML = `<p class="text-gray-500 text-[10px]">フレンド一覧を読み込めませんでした。</p>`;
    }
}

// --- フレンド一覧のDOMを組み立てる（アイコン＋名前で誰か分かるようにする） ---
function renderFriendListInto(container, profiles) {
    if (!container) return;
    if (!profiles || profiles.length === 0) {
        container.innerHTML = `<p class="text-gray-500 text-[10px] leading-relaxed">まだフレンドがいません。<br>相手のフレンドコードを入力して追加してみましょう。</p>`;
        return;
    }

    container.innerHTML = profiles.map(f => `
        <div class="flex items-center gap-2 bg-[#150b07] border border-emerald-900/50 rounded-lg px-2 py-2">
            <div class="friend-icon-slot w-9 h-9 flex-shrink-0 flex items-center justify-center text-xl bg-[#1a120b] rounded-full border border-emerald-800 overflow-hidden"
                data-species="${f.iconSpeciesId || ''}" data-aura="${f.iconAuraKey || ''}"></div>
            <span class="flex-1 min-w-0 text-[11px] text-amber-100 font-bold truncate">${escapeFriendText(f.name)}</span>
            <button onclick="visitFriendRoom('${f.pubId}')"
                class="shrink-0 px-2 py-1 bg-emerald-700 hover:bg-emerald-600 text-white font-bold rounded-lg text-[9px] transition-all active:scale-95">
                部屋を見る
            </button>
            <button onclick="removeFriend('${f.pubId}')" aria-label="フレンドを削除"
                class="shrink-0 px-1.5 py-1 text-gray-500 hover:text-red-400 text-[10px] transition-all">
                <i class="fa-solid fa-user-minus"></i>
            </button>
        </div>
    `).join('');

    // アイコン（モンスターの画像＋オーラ着色）を描画する
    container.querySelectorAll('.friend-icon-slot').forEach(slot => {
        const speciesId = slot.dataset.species;
        const auraKey = slot.dataset.aura;
        renderProfileIconInto(slot, speciesId, auraKey);
    });
}

// --- プロフィールアイコン（モンスター画像＋オーラ色）を指定要素に描画する共通ヘルパー ---
function renderProfileIconInto(el, speciesId, auraKey) {
    if (!el) return;
    const tmpl = (speciesId && typeof MONSTER_TEMPLATES !== 'undefined') ? MONSTER_TEMPLATES[speciesId] : null;
    if (!tmpl) {
        el.textContent = '👤'; // アイコン未設定
        return;
    }
    if (typeof renderMonsterVisual === 'function') {
        el.style.position = 'relative';
        renderMonsterVisual(el, tmpl.name, tmpl.emoji, false, true, auraKey || null);
    } else {
        el.textContent = tmpl.emoji || '👤';
    }
}

// --- 表示名など、ユーザーが自由に入力した文字列をHTMLに埋め込む前に無害化する ---
// （他プレイヤーが付けた名前をそのまま埋め込むと、名前にHTMLタグを仕込まれた場合に
//   こちらの画面が壊されたり、スクリプトを実行されたりする恐れがあるため）
function escapeFriendText(text) {
    return String(text == null ? '' : text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// =====================================================
// 自分のフレンドコード・プロフィール設定UI
// =====================================================

// --- フレンドコードの表示欄を更新する ---
function renderMyFriendCodeDisplay() {
    const el = document.getElementById('friend-my-code-display');
    if (!el) return;
    el.value = FRIENDS_STATE.myFriendCode ? formatFriendCode(FRIENDS_STATE.myFriendCode) : '…';
}

// --- アカウント管理の「フレンド」タブを開いたときの初期化 ---
async function initFriendsTab() {
    renderMyFriendCodeDisplay();
    const identity = await ensureMyPublicIdentity();
    if (!identity.friendCode) {
        const el = document.getElementById('friend-my-code-display');
        if (el) el.value = '取得できませんでした';
    }
    renderMyFriendCodeDisplay();

    // 自分のプロフィールアイコンの表示と、アイコン選択プルダウンの中身を用意する
    await fetchMyPublicProfile();
    populateProfileIconSelectors();
    renderMyProfilePreview();
    await loadAndRenderFriendList();
}

// --- アイコンに使うモンスター・オーラの選択肢を用意する ---
function populateProfileIconSelectors() {
    const speciesSelect = document.getElementById('friend-profile-species-select');
    if (speciesSelect && typeof KIN_NEJIKI_SPECIES_POOL !== 'undefined') {
        speciesSelect.innerHTML = KIN_NEJIKI_SPECIES_POOL.map(speciesId => {
            const tmpl = MONSTER_TEMPLATES[speciesId];
            return `<option value="${speciesId}">${tmpl ? tmpl.emoji + ' ' + tmpl.name : speciesId}</option>`;
        }).join('');
        if (FRIENDS_STATE.myProfile && FRIENDS_STATE.myProfile.iconSpeciesId) {
            speciesSelect.value = FRIENDS_STATE.myProfile.iconSpeciesId;
        }
    }

    const auraSelect = document.getElementById('friend-profile-aura-select');
    if (auraSelect && typeof AURA_TYPES !== 'undefined') {
        auraSelect.innerHTML = '<option value="">オーラなし</option>' + Object.keys(AURA_TYPES)
            .filter(auraKey => !AURA_TYPES[auraKey].exclusive)
            .map(auraKey => {
                const aura = AURA_TYPES[auraKey];
                return `<option value="${auraKey}">${aura.emoji} ${aura.name}</option>`;
            }).join('');
        if (FRIENDS_STATE.myProfile && FRIENDS_STATE.myProfile.iconAuraKey) {
            auraSelect.value = FRIENDS_STATE.myProfile.iconAuraKey;
        }
    }
}

// --- 自分のプロフィール（アイコン＋名前）のプレビュー表示を更新する ---
function renderMyProfilePreview() {
    const iconEl = document.getElementById('friend-profile-preview-icon');
    const nameEl = document.getElementById('friend-profile-preview-name');
    const profile = FRIENDS_STATE.myProfile || {};
    if (iconEl) renderProfileIconInto(iconEl, profile.iconSpeciesId, profile.iconAuraKey);
    if (nameEl) {
        const name = (typeof GAME_STATE !== 'undefined' && GAME_STATE.playerName) ? GAME_STATE.playerName : 'ブリーダー';
        nameEl.textContent = name;
    }
}

// --- プルダウンで選んだモンスターをプロフィールアイコンとして保存する ---
async function saveMyProfileIcon() {
    const speciesSelect = document.getElementById('friend-profile-species-select');
    const auraSelect = document.getElementById('friend-profile-aura-select');
    const speciesId = speciesSelect ? speciesSelect.value : null;
    const auraKey = auraSelect ? auraSelect.value : null;
    if (!speciesId) return;

    const ok = await saveMyPublicProfile(speciesId, auraKey || null);
    if (ok) {
        renderMyProfilePreview();
        if (typeof showToast === 'function') showToast('✅ プロフィールを保存しました');
    } else if (typeof showToast === 'function') {
        showToast('プロフィールの保存に失敗しました。');
    }
}

// --- 自分のフレンドコードをクリップボードへコピーする ---
function copyMyFriendCode() {
    if (!FRIENDS_STATE.myFriendCode) return;
    const text = formatFriendCode(FRIENDS_STATE.myFriendCode);
    const fallback = () => {
        const el = document.getElementById('friend-my-code-display');
        if (el) { el.select(); el.setSelectionRange(0, 99999); }
        if (typeof showToast === 'function') showToast('コピーできませんでした。表示欄を長押しして手動でコピーしてください。');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => { if (typeof showToast === 'function') showToast('フレンドコードをコピーしました！'); })
            .catch(fallback);
    } else {
        fallback();
    }
}

// =====================================================
// フレンドのマイルーム閲覧（閲覧専用）
// =====================================================

// --- フレンドの公開マイルームを取得して、閲覧モードで表示する ---
async function visitFriendRoom(friendPubId) {
    if (!friendPubId) return;
    if (typeof initFirebase !== 'function' || !initFirebase()) {
        if (typeof showToast === 'function') showToast('通信できませんでした。時間をおいてお試しください。');
        return;
    }

    try {
        const snap = await firebaseDb.ref(`player_public/${friendPubId}`).once('value');
        const val = snap.val();
        if (!val || !val.room) {
            if (typeof showToast === 'function') showToast('このブリーダーはまだマイルームを公開していません。');
            return;
        }

        FRIENDS_STATE.visitingPubId = friendPubId;
        FRIENDS_STATE.visitingName = val.name || 'ブリーダー';

        if (typeof closeAccountModal === 'function') closeAccountModal();
        // 実際の描画はmyroom.js側の閲覧モード（openMyRoomAsVisitor）に任せる
        if (typeof openMyRoomAsVisitor === 'function') {
            openMyRoomAsVisitor(val.room, FRIENDS_STATE.visitingName);
        }
    } catch (e) {
        console.error('[フレンド] マイルーム閲覧エラー:', e);
        if (typeof showToast === 'function') showToast('マイルームを読み込めませんでした。');
    }
}

// =====================================================
// 【推奨】Firebase Realtime Database セキュリティルール
// このファイルはクライアント側で「乗っ取りに繋がる情報を渡さない」ようにしているが、
// DB側のルールが全公開のままだと、第三者が直接DBを操作できてしまう。
// Firebaseコンソールの Realtime Database → ルール に、最低限このような制限を入れることを推奨する。
// （このゲームはFirebase Authenticationを使っていないため「本人だけが書ける」制約は作れないが、
//   少なくとも「データの形が正しいことの検証」と「一覧の丸ごと読み取りの禁止」は掛けられる）
//
// {
//   "rules": {
//     // フレンドコード：1件ずつの読み取りは許可するが、全件の一覧取得（ハーベスト）は禁止する。
//     // これにより「コードを総当たりで集めて公開IDを大量に収集する」ことをやりにくくする。
//     "friend_codes": {
//       ".read": false,
//       "$code": {
//         ".read": true,
//         ".write": "!data.exists() || newData.child('pubId').val() === data.child('pubId').val()",
//         ".validate": "newData.hasChildren(['pubId'])"
//       }
//     },
//     // 公開プロフィール・公開マイルーム：1件ずつの読み取りのみ許可
//     "player_public": {
//       ".read": false,
//       "$pubId": { ".read": true, ".write": true }
//     },
//     // 自分のフレンド一覧・公開IDの対応表：一覧の丸ごと読み取りは禁止
//     "player_friends": {
//       ".read": false,
//       "$pid": { ".read": true, ".write": true }
//     },
//     "player_profile": {
//       ".read": false,
//       "$pid": { ".read": true, ".write": true }
//     }
//   }
// }
//
// ※既に設定済みの他のノード（player_currency / player_inventory / ranking など）の
//   ルールを消してしまわないよう、既存のルールに上記を「追記」する形で編集すること。
// =====================================================
