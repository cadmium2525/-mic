// =====================================================
// monster_motion_kawazumo.js
// カワズモー専用のバトルモーション演出。
//
// カワズモーの特徴（＝演出の軸）：
//   ・相撲取り     → 攻撃の前に必ず「腰を落として構える」所作を入れる。
//                    どっしり沈み込んでから前へ出る、という重心移動で相撲らしさを出す
//   ・カエル       → 跳躍・長い舌・粘液。跳ぶ技は高く弧を描き、着地は必ず重く見せる
//   ・張り手系が主力 → はり手／連続はり手／飛びはり手は、
//                      「1発」「連打」「跳びながら」で明確に描き分ける
//
// 対応技：はり手／がっぷりよつ／上手投げ／かわずつき／連続はり手／飛びはり手／
//         かえるのした／大回転落とし／かえるのうた／ばくだん投げ／粘液
// =====================================================

const KAWAZU_SKIN = '#8ecf6a';  // カエルの体色
const KAWAZU_SLIME = '#b8e04a'; // 粘液の黄緑

// --- カワズモー共通：腰を落として構える（すべての打撃技の導入に使う） ---
//   返り値のキーフレームを前半に差し込むことで、どの技も相撲の所作から始まるようにする。
function kawazumoStanceKeyframes(travel, opts = {}) {
    const { hitOffset = 0.46, recover = 1 } = opts;
    return [
        { transform: 'translate(0,0) scale(1,1)', offset: 0 },
        { transform: 'translate(0,8px) scale(1.12,0.88)', offset: 0.2 },                     // 腰を落とす
        { transform: `translate(${travel}px,-2px) scale(1.06,1.02)`, offset: hitOffset },     // 前へ出る
        { transform: `translate(${travel}px,0) scale(1,1)`, offset: hitOffset + 0.14 },
        { transform: 'translate(0,0) scale(1,1)', offset: recover }
    ];
}

// --- はり手：腰を落として、鋭い張り手を一発 ---
function playKawazuHariteMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 720 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.56;

    animateSpriteLayers(side, kawazumoStanceKeyframes(travel), { duration, easing: 'ease-in-out' });
    setTimeout(() => {
        // 平手なので横に広い衝撃
        spawnSlashArc(to.x, to.y, -8, { length: 98, width: 10, color: KAWAZU_SKIN, duration: 260 * EFFECT_SPEED_MULTIPLIER });
        spawnImpactBurst(to.x, to.y, { size: 34, duration: 320 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 13, rotate: 9 });
    }, duration * 0.46);
}
registerCustomSkillMotion('harite', playKawazuHariteMotion, 'カワズモー');

// --- 連続はり手：左右の張り手を高速で浴びせ続ける ---
function playRenzokuHariteMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1080 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.56;
    const hits = 6;

    // 構えてから、小刻みに押し込みながら連打する
    const kf = [
        { transform: 'translate(0,0) scale(1,1)', offset: 0 },
        { transform: 'translate(0,8px) scale(1.12,0.88)', offset: 0.14 }
    ];
    for (let i = 0; i < hits; i++) {
        const base = 0.22 + (i / hits) * 0.62;
        kf.push({ transform: `translate(${travel}px,0) scale(1.05,1)`, offset: base });
        kf.push({ transform: `translate(${travel * 0.82}px,0) scale(0.98,1.02)`, offset: base + 0.035 });
    }
    kf.push({ transform: 'translate(0,0) scale(1,1)', offset: 1 });
    animateSpriteLayers(side, kf, { duration, easing: 'linear' });

    for (let i = 0; i < hits; i++) {
        setTimeout(() => {
            const oy = (i % 2 === 0) ? -12 : 10;
            // 左右交互に張る
            spawnSlashArc(to.x, to.y + oy, i % 2 === 0 ? -12 : 12, { length: 84, width: 8, color: KAWAZU_SKIN, duration: 200 * EFFECT_SPEED_MULTIPLIER });
            spawnImpactBurst(to.x, to.y + oy, { size: 22, duration: 220 * EFFECT_SPEED_MULTIPLIER });
        }, duration * (0.22 + (i / hits) * 0.62));
    }
    setTimeout(() => playRecoilMotion(otherSide(side), { distance: 14, rotate: 10 }), duration * 0.86);
}
registerCustomSkillMotion('renzoku_harite', playRenzokuHariteMotion, 'カワズモー');

// --- 飛びはり手：跳び上がって、落下の勢いを乗せた張り手 ---
function playTobiHariteMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 880 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.62;

    // カエルらしく大きく跳ねてから、上から張る
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) scale(1,1) rotate(0deg)', offset: 0 },
        { transform: 'translate(0,10px) scale(1.16,0.84)', offset: 0.16 },                        // 深く沈む
        { transform: `translate(${travel * 0.6}px,-52px) scale(0.9,1.16) rotate(-10deg)`, offset: 0.44 }, // 跳ぶ
        { transform: `translate(${travel}px,-4px) scale(1.08,0.96) rotate(12deg)`, offset: 0.62 }, // 振り下ろす
        { transform: 'translate(0,0) scale(1,1) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        spawnSlashArc(to.x, to.y, 70, { length: 112, width: 12, color: KAWAZU_SKIN, duration: 290 * EFFECT_SPEED_MULTIPLIER });
        spawnImpactBurst(to.x, to.y, { size: 42, duration: 400 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 16, rotate: 11, duration: 560 });
    }, duration * 0.6);
}
registerCustomSkillMotion('tobi_harite', playTobiHariteMotion, 'カワズモー');

// --- がっぷりよつ：組み合って押し込む ---
function playGappuriYotsuMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1150 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.5;
    const pushDir = (to.x - from.x) > 0 ? 1 : -1;

    // 立合い → 組む → じりじり押し込む
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) scale(1,1)', offset: 0 },
        { transform: 'translate(0,10px) scale(1.14,0.86)', offset: 0.14 },              // 立合いの構え
        { transform: `translate(${travel}px,2px) scale(1.06,0.98)`, offset: 0.32 },      // 組む
        { transform: `translate(${travel * 1.15}px,2px) scale(1.08,0.98)`, offset: 0.56 }, // 押す
        { transform: `translate(${travel * 1.3}px,0) scale(1.05,1)`, offset: 0.72 },      // 押し切る
        { transform: 'translate(0,0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 組み合っている間、相手はじりじり押し下がる
    setTimeout(() => {
        animateSpriteLayers(otherSide(side), [
            { transform: 'translateX(0) scale(1,1)', offset: 0 },
            { transform: `translateX(${pushDir * 8}px) scale(0.98,1.02)`, offset: 0.35 },
            { transform: `translateX(${pushDir * 20}px) scale(0.96,1.03)`, offset: 0.7 },
            { transform: 'translateX(0) scale(1,1)', offset: 1 }
        ], { duration: 760 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-in-out' });
        // 力のぶつかり合い
        for (let i = 0; i < 3; i++) {
            spawnCustomParticle('💢', (from.x + to.x) / 2, to.y - 10 + (i - 1) * 12, {
                size: 22, delay: i * 130, duration: 420 * EFFECT_SPEED_MULTIPLIER,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1, offset: 0.4 },
                    { transform: 'translate(-50%,-50%) scale(0.9)', opacity: 0 }
                ]
            });
        }
    }, duration * 0.34);

    setTimeout(() => {
        spawnImpactBurst(to.x, to.y, { size: 40, duration: 400 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 14, rotate: 9 });
    }, duration * 0.72);
}
registerCustomSkillMotion('gappuri_yotsu', playGappuriYotsuMotion, 'カワズモー');

// --- 上手投げ：まわしを掴んで、豪快に投げる ---
function playUwatenageMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1200 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.48;
    const throwDir = (to.x - from.x) > 0 ? -1 : 1; // 自分の後方へ投げる

    animateSpriteLayers(side, [
        { transform: 'translate(0,0) rotate(0deg) scale(1,1)', offset: 0 },
        { transform: 'translate(0,8px) rotate(0deg) scale(1.12,0.88)', offset: 0.14 },   // 構え
        { transform: `translate(${travel}px,2px) rotate(0deg) scale(1.04,1)`, offset: 0.3 }, // 掴む
        { transform: `translate(${travel}px,-4px) rotate(-20deg) scale(1.04,1)`, offset: 0.48 }, // 引き付ける
        { transform: `translate(${travel * 0.7}px,4px) rotate(24deg) scale(1.02,1)`, offset: 0.64 }, // 投げる
        { transform: 'translate(0,0) rotate(0deg) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 相手は大きく弧を描いて投げ飛ばされ、地面に叩きつけられる
    setTimeout(() => {
        animateSpriteLayers(otherSide(side), [
            { transform: 'translate(0,0) rotate(0deg)', offset: 0 },
            { transform: `translate(${-throwDir * 10}px,-36px) rotate(-70deg)`, offset: 0.32 },
            { transform: `translate(${throwDir * 30}px,-18px) rotate(-200deg)`, offset: 0.62 },
            { transform: `translate(${throwDir * 18}px,16px) rotate(-330deg)`, offset: 0.85 },
            { transform: 'translate(0,0) rotate(-360deg)', offset: 1 }
        ], { duration: duration * 0.7, easing: 'ease-in-out' });
    }, duration * 0.3);

    setTimeout(() => {
        spawnImpactBurst(to.x, to.y + 18, { size: 44, duration: 440 * EFFECT_SPEED_MULTIPLIER });
        spawnCustomParticle('💨', to.x, to.y + 22, {
            size: 30, duration: 460 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4) scaleY(0.5)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.6) scaleY(0.6)', opacity: 0.9, offset: 0.4 },
                { transform: 'translate(-50%,-50%) scale(2.2) scaleY(0.7)', opacity: 0 }
            ]
        });
    }, duration * 0.82);
}
registerCustomSkillMotion('uwatenage', playUwatenageMotion, 'カワズモー');

// --- かわずつき：カエルらしく飛び込んで頭から突っ込む ---
function playKawazutsukiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 820 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.72;

    // 深く沈んでから、低く鋭く飛び込む（跳躍力の表現）
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) scale(1,1)', offset: 0 },
        { transform: 'translate(0,12px) scale(1.2,0.8)', offset: 0.2 },                  // 深く沈む
        { transform: `translate(${travel * 0.6}px,-26px) scale(0.88,1.18)`, offset: 0.42 }, // 飛び出す
        { transform: `translate(${travel}px,0) scale(1.12,0.94)`, offset: 0.56 },          // 頭から当たる
        { transform: 'translate(0,0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        spawnImpactBurst(to.x, to.y - 4, { size: 40, duration: 400 * EFFECT_SPEED_MULTIPLIER });
        spawnCustomParticle('💫', to.x, to.y - 24, {
            size: 22, duration: 420 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0.45 },
                { transform: 'translate(0,-12px) translate(-50%,-50%) scale(0.8)', opacity: 0 }
            ]
        });
        playRecoilMotion(otherSide(side), { distance: 15, rotate: 10 });
    }, duration * 0.54);
}
registerCustomSkillMotion('kawazutsuki', playKawazutsukiMotion, 'カワズモー');

// --- かえるのした：長い舌を伸ばして絡め取る ---
function playKaeruNoShitaMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 880 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x, dy = to.y - from.y;
    const tongueMs = 620 * EFFECT_SPEED_MULTIPLIER;

    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1,1)', offset: 0 },
        { transform: 'translateX(-4px) scale(0.97,1.03)', offset: 0.22 },
        { transform: `translateX(${dx * 0.06}px) scale(1.05,0.97)`, offset: 0.4 },
        { transform: 'translateX(0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        // 舌の帯（スエゾーの舌と同じく、帯と先端を同じカーブで動かしてズレさせない）
        const length = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        const tongue = document.createElement('div');
        tongue.style.cssText = `position:fixed; left:${from.x}px; top:${from.y}px; width:${length}px; height:12px;
            margin-top:-6px; transform-origin:0% 50%; pointer-events:none; z-index:9998; border-radius:6px;
            background:linear-gradient(90deg, #ff8fb0, #ffb3cc);
            box-shadow:0 0 6px 2px rgba(255,143,176,0.45);`;
        document.body.appendChild(tongue);
        try {
            const anim = tongue.animate([
                { transform: `rotate(${angle}deg) scaleX(0)`, opacity: 1, offset: 0 },
                { transform: `rotate(${angle}deg) scaleX(1)`, opacity: 1, offset: 0.38 },
                { transform: `rotate(${angle}deg) scaleX(1)`, opacity: 1, offset: 0.6 },
                { transform: `rotate(${angle}deg) scaleX(0)`, opacity: 1, offset: 1 }
            ], { duration: tongueMs, easing: 'ease-in-out', fill: 'forwards' });
            anim.onfinish = () => tongue.remove();
            setTimeout(() => tongue.remove(), tongueMs + 200);
        } catch (e) { tongue.remove(); }

        spawnCustomParticle('👅', from.x, from.y, {
            size: 26, duration: tongueMs, easing: 'ease-in-out',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0, offset: 0 },
                { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(1.15)`, opacity: 1, offset: 0.38 },
                { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(1.15)`, opacity: 1, offset: 0.6 },
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0, offset: 1 }
            ]
        });

        setTimeout(() => {
            // 絡め取られて引っ張られる
            animateSpriteLayers(otherSide(side), [
                { transform: 'translateX(0) rotate(0deg)', offset: 0 },
                { transform: `translateX(${dx > 0 ? -12 : 12}px) rotate(${dx > 0 ? -7 : 7}deg)`, offset: 0.4 },
                { transform: 'translateX(0) rotate(0deg)', offset: 1 }
            ], { duration: 500 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-out' });
            spawnImpactBurst(to.x, to.y, { size: 32, duration: 340 * EFFECT_SPEED_MULTIPLIER });
        }, tongueMs * 0.4);
    }, duration * 0.3);
}
registerCustomSkillMotion('kaeru_no_shita', playKaeruNoShitaMotion, 'カワズモー');

// --- 大回転落とし：相手を抱えたまま高速回転し、頭から落とす ---
function playDaiKaitenOtoshiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1400 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.5;

    // 掴む → 一緒に回る → 叩きつける
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) rotate(0deg) scale(1,1)', offset: 0 },
        { transform: 'translate(0,8px) rotate(0deg) scale(1.12,0.88)', offset: 0.12 },
        { transform: `translate(${travel}px,0) rotate(0deg) scale(1.04,1)`, offset: 0.26 },      // 掴む
        { transform: `translate(${travel}px,-20px) rotate(360deg) scale(1,1)`, offset: 0.48 },   // 回転
        { transform: `translate(${travel}px,-24px) rotate(720deg) scale(1,1)`, offset: 0.62 },
        { transform: `translate(${travel}px,8px) rotate(900deg) scale(1.1,0.92)`, offset: 0.76 }, // 落とす
        { transform: 'translate(0,0) rotate(900deg) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 相手も一緒に回されてから、頭から落ちる
    setTimeout(() => {
        animateSpriteLayers(otherSide(side), [
            { transform: 'translate(0,0) rotate(0deg)', offset: 0 },
            { transform: 'translate(0,-30px) rotate(180deg)', offset: 0.3 },
            { transform: 'translate(0,-34px) rotate(540deg)', offset: 0.55 },
            { transform: 'translate(0,14px) rotate(880deg)', offset: 0.8 },
            { transform: 'translate(0,0) rotate(900deg)', offset: 1 }
        ], { duration: duration * 0.68, easing: 'ease-in-out' });
    }, duration * 0.26);

    setTimeout(() => {
        spawnImpactBurst(to.x, to.y + 16, { size: 50, duration: 480 * EFFECT_SPEED_MULTIPLIER });
        for (let i = 0; i < 4; i++) {
            const dir = i % 2 === 0 ? -1 : 1;
            spawnCustomParticle('💨', to.x, to.y + 20, {
                size: 24, delay: i * 40, duration: 460 * EFFECT_SPEED_MULTIPLIER,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                    { transform: `translate(${dir * 32}px,-6px) translate(-50%,-50%) scale(1.2)`, opacity: 0.9, offset: 0.45 },
                    { transform: `translate(${dir * 56}px,2px) translate(-50%,-50%) scale(1.7)`, opacity: 0 }
                ]
            });
        }
        playRecoilMotion(otherSide(side), { distance: 18, rotate: 13, duration: 620 });
    }, duration * 0.78);
}
registerCustomSkillMotion('dai_kaiten_otoshi', playDaiKaitenOtoshiMotion, 'カワズモー');

// --- かえるのうた：のんびりした歌声で相手を惑わせる ---
function playKaeruNoUtaMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1100 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x, dy = to.y - from.y;

    // 喉袋を大きく膨らませて鳴く（カエルらしさ）
    animateSpriteLayers(side, [
        { transform: 'scale(1,1)', offset: 0 },
        { transform: 'scale(1.16,1.1)', offset: 0.24 },   // 喉が膨らむ
        { transform: 'scale(0.96,0.96)', offset: 0.38 },  // 鳴く
        { transform: 'scale(1.12,1.08)', offset: 0.54 },  // もう一度
        { transform: 'scale(0.98,0.98)', offset: 0.68 },
        { transform: 'scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 音符がのんびり漂って届く
    const notes = ['🎵', '🎶', '🎵', '♪'];
    notes.forEach((note, i) => {
        const wave = (i % 2 === 0) ? -24 : 20;
        spawnCustomParticle(note, from.x, from.y - 8, {
            size: 22, delay: duration * 0.3 + i * 120, duration: 760 * EFFECT_SPEED_MULTIPLIER, color: KAWAZU_SKIN,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4) rotate(-12deg)', opacity: 0 },
                { transform: `translate(${dx * 0.4}px,${dy * 0.4 + wave}px) translate(-50%,-50%) scale(1.05) rotate(10deg)`, opacity: 1, offset: 0.45 },
                { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(0.85) rotate(-8deg)`, opacity: 0 }
            ]
        });
    });

    // 眠気を誘われてふらつく
    setTimeout(() => {
        animateSpriteLayers(otherSide(side), [
            { transform: 'rotate(0deg) scale(1,1)', offset: 0 },
            { transform: 'rotate(6deg) scale(0.99,1.01)', offset: 0.3 },
            { transform: 'rotate(-5deg) scale(1.01,0.99)', offset: 0.62 },
            { transform: 'rotate(0deg) scale(1,1)', offset: 1 }
        ], { duration: 720 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-in-out' });
        spawnImpactBurst(to.x, to.y - 22, { emoji: '💤', size: 28, duration: 560 * EFFECT_SPEED_MULTIPLIER });
    }, duration * 0.66);
}
registerCustomSkillMotion('kaeru_no_uta', playKaeruNoUtaMotion, 'カワズモー');

// --- ばくだん投げ：爆弾を放り投げて爆発させる ---
function playBakudanNageMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1100 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x, dy = to.y - from.y;

    // 振りかぶって放る
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) rotate(0deg) scale(1,1)', offset: 0 },
        { transform: 'translate(0,6px) rotate(-14deg) scale(1.1,0.9)', offset: 0.24 },
        { transform: 'translate(6px,0) rotate(16deg) scale(0.96,1.04)', offset: 0.42 },
        { transform: 'translate(0,0) rotate(0deg) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        // 弧を描いて飛ぶ爆弾
        spawnCustomParticle('💣', from.x, from.y, {
            size: 28, duration: 520 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-in',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.6) rotate(0deg)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 44}px) translate(-50%,-50%) scale(1.05) rotate(180deg)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(1.1) rotate(360deg)`, opacity: 1 }
            ]
        });
        setTimeout(() => {
            // 爆発
            spawnCustomParticle('◯', to.x, to.y, {
                size: 76, duration: 520 * EFFECT_SPEED_MULTIPLIER, color: '#ff9a3c',
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.1)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.6)', opacity: 1, offset: 0.3 },
                    { transform: 'translate(-50%,-50%) scale(2.6)', opacity: 0 }
                ]
            });
            for (let i = 0; i < 5; i++) {
                const a = (Math.PI * 2 * i) / 5;
                spawnCustomParticle('💥', to.x, to.y, {
                    size: 24, delay: i * 40, duration: 480 * EFFECT_SPEED_MULTIPLIER,
                    keyframes: [
                        { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                        { transform: `translate(${Math.cos(a) * 42}px,${Math.sin(a) * 34}px) translate(-50%,-50%) scale(1.2)`, opacity: 1, offset: 0.4 },
                        { transform: `translate(${Math.cos(a) * 70}px,${Math.sin(a) * 56}px) translate(-50%,-50%) scale(0.6)`, opacity: 0 }
                    ]
                });
            }
            spawnImpactBurst(to.x, to.y, { size: 48, duration: 480 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: 17, rotate: 12, duration: 580 });
        }, 520 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.4);
}
registerCustomSkillMotion('bakudan_nage', playBakudanNageMotion, 'カワズモー');

// --- 粘液：べとつく粘液を浴びせて動きを鈍らせる ---
function playNenEkiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1000 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x, dy = to.y - from.y;

    // 体を波打たせて吐き出す
    animateSpriteLayers(side, [
        { transform: 'scale(1,1)', offset: 0 },
        { transform: 'scale(0.92,1.12)', offset: 0.24 },  // 溜める
        { transform: 'scale(1.18,0.88)', offset: 0.42 },  // 吐く
        { transform: 'scale(0.98,1.02)', offset: 0.6 },
        { transform: 'scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 粘液が飛び散る
    for (let i = 0; i < 6; i++) {
        const spread = (i - 2.5) * 13;
        spawnCustomParticle('💧', from.x, from.y, {
            size: 20 + Math.random() * 8, delay: duration * 0.38 + i * 50,
            duration: 580 * EFFECT_SPEED_MULTIPLIER, color: KAWAZU_SLIME,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px,${dy * 0.5 + spread * 0.5 - 10}px) translate(-50%,-50%) scale(1.1)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${dx}px,${dy + spread}px) translate(-50%,-50%) scale(0.9)`, opacity: 0 }
            ]
        });
    }
    // 粘液まみれで動きが鈍る
    setTimeout(() => {
        animateSpriteLayers(otherSide(side), [
            { transform: 'scale(1,1)', offset: 0 },
            { transform: 'scale(1.04,0.94)', offset: 0.35 },  // べたっと押し潰される
            { transform: 'scale(0.99,1.01)', offset: 0.7 },
            { transform: 'scale(1,1)', offset: 1 }
        ], { duration: 660 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-out' });
        spawnCustomParticle('◯', to.x, to.y, {
            size: 56, duration: 520 * EFFECT_SPEED_MULTIPLIER, color: KAWAZU_SLIME,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 0.75, offset: 0.45 },
                { transform: 'translate(-50%,-50%) scale(1.4)', opacity: 0 }
            ]
        });
        spawnImpactBurst(to.x, to.y, { emoji: '🫧', size: 30, duration: 460 * EFFECT_SPEED_MULTIPLIER, color: KAWAZU_SLIME });
    }, duration * 0.68);
}
registerCustomSkillMotion('nen_eki', playNenEkiMotion, 'カワズモー');
