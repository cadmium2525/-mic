// =====================================================
// monster_motion_metalner.js
// メタルナー専用のバトルモーション演出。
//
// メタルナーの特徴（＝演出の軸）：
//   ・中国拳法のような掌打・拳打が主力
//        → どの打撃も「静かに構える → 一瞬で打ち抜く → 残心」という、
//          ためと静止のある拳法らしいリズムにする。他の格闘系（ハム＝手数、
//          ゴーレム＝力任せ）とは、この「静と動の落差」で描き分ける
//   ・金属質の体
//        → 打撃の閃光や軌跡は白銀。炎や光の属性色は使わない
//   ・「変化」の技を持つ
//        → 小変化・太極変化は、身体が滑らかに流れるように動く（円運動）
//
// ★打撃技の対応関係（同系統の技は見た目でも対応させている）：
//     ポン拳   ↔ ダブルぽん拳（2連）
//     左掌     ↔ ツイン掌打（2連）
//     すんけい … ゼロ距離からの発勁
//     閃光掌   … 目にも留まらぬ速さの掌打
//     テツざんこう … 体当たり気味の重い一撃
//
// 対応技：ポン拳／左掌／すんけい／閃光掌／テツざんこう／
//         ダブルぽん拳／ツイン掌打／メタビーム／小変化／太極変化
// =====================================================

const METAL_SHEEN = '#dfe7ee';  // 金属の白銀
const METAL_BEAM = '#9ed8ff';   // メタビームの淡い青

// --- メタルナー共通：静かに構えてから、一瞬で打ち抜く ---
//   ためを長めに、打撃自体は短く鋭く。拳法らしい「静と動」を作る。
function playMetalnerStrike(side, opts = {}) {
    const { duration = 780, reach = 0.6, hitOffset = 0.5 } = opts;
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return null;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const d = duration * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * reach;

    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1)', offset: 0 },
        { transform: 'translateX(0) scale(0.98)', offset: 0.3 },                       // 静かに構える（ほぼ動かない）
        { transform: `translateX(${-travel * 0.08}px) scale(0.96)`, offset: hitOffset - 0.06 }, // 沈める
        { transform: `translateX(${travel}px) scale(1.06)`, offset: hitOffset },        // 一瞬で打ち抜く
        { transform: `translateX(${travel}px) scale(1.04)`, offset: hitOffset + 0.16 }, // 残心
        { transform: 'translateX(0) scale(1)', offset: 1 }
    ], { duration: d, easing: 'ease-in-out' });

    return { duration: d, impactAt: d * hitOffset, from, to };
}

// --- メタルナー共通：金属質の閃光（打撃の着弾で使う） ---
function spawnMetalFlash(x, y, opts = {}) {
    const { size = 40, duration = 340, wide = false } = opts;
    spawnCustomParticle('◯', x, y, {
        size, duration: duration * EFFECT_SPEED_MULTIPLIER, color: METAL_SHEEN,
        keyframes: [
            { transform: `translate(-50%,-50%) scale(0.2)${wide ? ' scaleX(0.8)' : ''}`, opacity: 0 },
            { transform: `translate(-50%,-50%) scale(1.1)${wide ? ' scaleX(1.5)' : ''}`, opacity: 0.95, offset: 0.4 },
            { transform: `translate(-50%,-50%) scale(1.7)${wide ? ' scaleX(2)' : ''}`, opacity: 0 }
        ]
    });
}

// --- ポン拳：素早い拳の一撃 ---
function playPonkenMotion(side) {
    const r = playMetalnerStrike(side, { duration: 700, reach: 0.62 });
    if (!r) return;
    setTimeout(() => {
        spawnMetalFlash(r.to.x, r.to.y, { size: 38 });
        spawnImpactBurst(r.to.x, r.to.y, { size: 32, duration: 320 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 12, rotate: 8 });
    }, r.impactAt);
}
registerCustomSkillMotion('ponken', playPonkenMotion, 'メタルナー');

// --- ダブルぽん拳：ポン拳を左右で2連（対応する単発技と同じ見た目を2回見せる） ---
function playDoubleShodaMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 960 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.62;

    animateSpriteLayers(side, [
        { transform: 'translate(0,0) scale(1)', offset: 0 },
        { transform: 'translate(0,0) scale(0.98)', offset: 0.2 },
        { transform: `translate(${travel}px,-8px) scale(1.06)`, offset: 0.36 },   // 1発目
        { transform: `translate(${travel * 0.72}px,0) scale(0.98)`, offset: 0.5 },
        { transform: `translate(${travel}px,8px) scale(1.08)`, offset: 0.68 },    // 2発目
        { transform: 'translate(0,0) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    [[0.36, -10, 34], [0.68, 8, 42]].forEach(([at, oy, size], i) => {
        setTimeout(() => {
            spawnMetalFlash(to.x, to.y + oy, { size });
            spawnImpactBurst(to.x, to.y + oy, { size: i === 1 ? 38 : 30, duration: 320 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: i === 1 ? 14 : 9, rotate: i === 1 ? 10 : 6, duration: 360 });
        }, duration * at);
    });
}
registerCustomSkillMotion('double_shoda', playDoubleShodaMotion, 'メタルナー');

// --- 左掌：掌で押し込む一撃（拳より面で当てるので、横に広い衝撃にする） ---
function playHidariteMotion(side) {
    const r = playMetalnerStrike(side, { duration: 780, reach: 0.58 });
    if (!r) return;
    setTimeout(() => {
        spawnMetalFlash(r.to.x, r.to.y, { size: 46, wide: true });
        spawnImpactBurst(r.to.x, r.to.y, { size: 36, duration: 360 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 14, rotate: 9 });
    }, r.impactAt);
}
registerCustomSkillMotion('hidarite', playHidariteMotion, 'メタルナー');

// --- ツイン掌打：左掌を両手で2連（対応する単発技と同じ見た目を2回見せる） ---
function playTwinShodaMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1000 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.6;

    animateSpriteLayers(side, [
        { transform: 'translate(0,0) scale(1,1)', offset: 0 },
        { transform: 'translate(0,0) scale(0.97,1.02)', offset: 0.22 },
        { transform: `translate(${travel}px,-6px) scale(1.06,1)`, offset: 0.38 },
        { transform: `translate(${travel * 0.74}px,0) scale(0.98,1.01)`, offset: 0.52 },
        { transform: `translate(${travel * 1.06}px,6px) scale(1.1,0.98)`, offset: 0.7 },  // 決めの二枚目
        { transform: 'translate(0,0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    [[0.38, -10, 44], [0.7, 8, 54]].forEach(([at, oy, size], i) => {
        setTimeout(() => {
            spawnMetalFlash(to.x, to.y + oy, { size, wide: true });
            spawnImpactBurst(to.x, to.y + oy, { size: i === 1 ? 42 : 32, duration: 360 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: i === 1 ? 16 : 10, rotate: i === 1 ? 11 : 7, duration: 400 });
        }, duration * at);
    });
}
registerCustomSkillMotion('twin_shoda', playTwinShodaMotion, 'メタルナー');

// --- すんけい：ゼロ距離から浸透する発勁（動きは最小、衝撃は内側で爆ぜる） ---
function playSunkeiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1000 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.66;

    // 密着してから、ほんのわずかしか動かずに打つ（動きの小ささが「寸勁」の表現）
    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1)', offset: 0 },
        { transform: `translateX(${travel}px) scale(1)`, offset: 0.32 },         // 密着する
        { transform: `translateX(${travel}px) scale(0.99)`, offset: 0.5 },       // 息を溜める
        { transform: `translateX(${travel * 1.04}px) scale(1.03)`, offset: 0.58 }, // ごくわずかに押す
        { transform: `translateX(${travel}px) scale(1)`, offset: 0.74 },
        { transform: 'translateX(0) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        // 衝撃は相手の内側から広がる（外に大きな軌跡は出さない）
        for (let i = 0; i < 3; i++) {
            spawnCustomParticle('◯', to.x, to.y, {
                size: 44 + i * 14, delay: i * 90, duration: 480 * EFFECT_SPEED_MULTIPLIER, color: METAL_SHEEN,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.1)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.9, offset: 0.4 },
                    { transform: 'translate(-50%,-50%) scale(1.8)', opacity: 0 }
                ]
            });
        }
        // 内側から揺さぶられる
        animateSpriteLayers(otherSide(side), [
            { transform: 'translateX(0) scale(1,1)', offset: 0 },
            { transform: 'translateX(3px) scale(1.06,0.94)', offset: 0.2 },
            { transform: 'translateX(-3px) scale(0.94,1.06)', offset: 0.42 },
            { transform: 'translateX(2px) scale(1.03,0.97)', offset: 0.64 },
            { transform: 'translateX(0) scale(1,1)', offset: 1 }
        ], { duration: 640 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-out' });
        spawnImpactBurst(to.x, to.y, { size: 44, duration: 440 * EFFECT_SPEED_MULTIPLIER });
    }, duration * 0.58);
}
registerCustomSkillMotion('sunkei', playSunkeiMotion, 'メタルナー');

// --- 閃光掌：目にも留まらぬ速さの掌打（残像が置き去りになる） ---
function playSenkoushoMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 760 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.7;

    // 構え → 消えたように見える速さで到達 → 残心
    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1)', opacity: 1, offset: 0 },
        { transform: 'translateX(0) scale(0.98)', opacity: 1, offset: 0.34 },
        { transform: `translateX(${travel * 0.5}px) scale(1.02)`, opacity: 0.3, offset: 0.42 }, // 残像だけ
        { transform: `translateX(${travel}px) scale(1.06)`, opacity: 1, offset: 0.48 },
        { transform: `translateX(${travel}px) scale(1.04)`, opacity: 1, offset: 0.64 },
        { transform: 'translateX(0) scale(1)', opacity: 1, offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 通過した軌跡に残像を置く
    for (let i = 0; i < 3; i++) {
        const t = (i + 1) / 4;
        spawnCustomParticle('◤', from.x + (to.x - from.x) * t * 0.7, from.y, {
            size: 28, delay: duration * 0.36 + i * 40, duration: 300 * EFFECT_SPEED_MULTIPLIER, color: METAL_SHEEN,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(1.05)', opacity: 0.5 },
                { transform: 'translate(-50%,-50%) scale(0.9)', opacity: 0 }
            ]
        });
    }
    setTimeout(() => {
        spawnMetalFlash(to.x, to.y, { size: 52, wide: true });
        spawnSlashArc(to.x, to.y, -10, { length: 100, width: 7, color: '#ffffff', duration: 230 * EFFECT_SPEED_MULTIPLIER });
        spawnImpactBurst(to.x, to.y, { size: 36, duration: 340 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 13, rotate: 9 });
    }, duration * 0.48);
}
registerCustomSkillMotion('senkousho', playSenkoushoMotion, 'メタルナー');

// --- テツざんこう：金属の体そのものをぶつける、重い体当たり ---
function playTetsuzankouMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1000 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.78;

    // 肩から入る重い当たり（他の技より踏み込みが深い）
    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1,1)', offset: 0 },
        { transform: `translateX(${-travel * 0.12}px) scale(0.96,1.02)`, offset: 0.3 },  // 引く
        { transform: `translateX(${travel}px) scale(1.12,0.98)`, offset: 0.54 },          // 肩からぶつかる
        { transform: `translateX(${travel}px) scale(1.06,1)`, offset: 0.68 },
        { transform: 'translateX(0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        spawnMetalFlash(to.x, to.y, { size: 58, wide: true });
        // 金属同士がぶつかる火花
        for (let i = 0; i < 4; i++) {
            const a = (Math.PI * 2 * i) / 4;
            spawnCustomParticle('✦', to.x, to.y, {
                size: 20, delay: i * 40, duration: 380 * EFFECT_SPEED_MULTIPLIER, color: METAL_SHEEN,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                    { transform: `translate(${Math.cos(a) * 34}px,${Math.sin(a) * 26}px) translate(-50%,-50%) scale(1.1)`, opacity: 1, offset: 0.45 },
                    { transform: `translate(${Math.cos(a) * 56}px,${Math.sin(a) * 44}px) translate(-50%,-50%) scale(0.6)`, opacity: 0 }
                ]
            });
        }
        spawnImpactBurst(to.x, to.y, { size: 48, duration: 460 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 17, rotate: 12, duration: 580 });
    }, duration * 0.54);
}
registerCustomSkillMotion('tetsuzankou', playTetsuzankouMotion, 'メタルナー');

// --- メタビーム：体表の金属を共振させて光線を放つ ---
function playMetaBeamMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const chargeMs = 520 * EFFECT_SPEED_MULTIPLIER;
    const beamMs = 620 * EFFECT_SPEED_MULTIPLIER;

    // 体が細かく共振してから撃つ
    const kf = [{ transform: 'translateX(0) scale(1)', offset: 0 }];
    for (let i = 1; i <= 8; i++) {
        kf.push({ transform: `translateX(${i % 2 === 0 ? 2 : -2}px) scale(${1 + i * 0.006})`, offset: (i / 10) * 0.5 });
    }
    kf.push({ transform: 'translateX(0) scale(1.04)', offset: 0.56 });
    kf.push({ transform: 'translateX(0) scale(1)', offset: 1 });
    animateSpriteLayers(side, kf, { duration: chargeMs + beamMs, easing: 'linear' });

    // 共振の光が集まる
    for (let i = 0; i < 4; i++) {
        const a = (Math.PI * 2 * i) / 4;
        spawnCustomParticle('✦', from.x + Math.cos(a) * 34, from.y + Math.sin(a) * 26, {
            size: 20, delay: i * 70, duration: chargeMs, color: METAL_BEAM,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0.45 },
                { transform: `translate(${-Math.cos(a) * 34}px,${-Math.sin(a) * 26}px) translate(-50%,-50%) scale(0.4)`, opacity: 0 }
            ]
        });
    }

    setTimeout(() => {
        spawnBeamLine(from.x, from.y, to.x - from.x, to.y - from.y, METAL_BEAM, beamMs, 15);
        setTimeout(() => {
            spawnMetalFlash(to.x, to.y, { size: 50 });
            spawnImpactBurst(to.x, to.y, { size: 44, duration: 440 * EFFECT_SPEED_MULTIPLIER, color: METAL_BEAM });
            playRecoilMotion(otherSide(side), { distance: 14, rotate: 10, duration: 540 });
        }, beamMs * 0.3);
    }, chargeMs);
}
registerCustomSkillMotion('meta_beam', playMetaBeamMotion, 'メタルナー');

// --- 小変化：体をわずかに変化させて構えを整える（自己強化・動きは小さく滑らか） ---
function playShoHenkaMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    if (!casterEl) return;
    const duration = 900 * EFFECT_SPEED_MULTIPLIER;

    // 円運動を思わせる、滑らかで小さな変化
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) scale(1,1) rotate(0deg)', offset: 0 },
        { transform: 'translate(-4px,-3px) scale(1.02,0.99) rotate(-3deg)', offset: 0.25 },
        { transform: 'translate(4px,-3px) scale(0.99,1.02) rotate(3deg)', offset: 0.5 },
        { transform: 'translate(2px,2px) scale(1.02,1) rotate(1deg)', offset: 0.75 },
        { transform: 'translate(0,0) scale(1,1) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    spawnSelfParticleRing(casterEl, '✦', 4, 16, 640 * EFFECT_SPEED_MULTIPLIER, 32);
}
registerCustomSkillMotion('sho_henka', playShoHenkaMotion, 'メタルナー');

// --- 太極変化：陰陽の円を描くように全身を練り上げる（小変化の上位。円運動を大きく長く） ---
function playTaikyokuHenkaMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    if (!casterEl) return;
    const { x, y } = getElCenter(casterEl);
    const duration = 1250 * EFFECT_SPEED_MULTIPLIER;

    // 小変化と同じ円運動を、より大きく・長く
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) scale(1,1) rotate(0deg)', offset: 0 },
        { transform: 'translate(-9px,-6px) scale(1.05,0.97) rotate(-7deg)', offset: 0.2 },
        { transform: 'translate(0,-11px) scale(1.03,1.03) rotate(0deg)', offset: 0.38 },
        { transform: 'translate(9px,-6px) scale(0.97,1.05) rotate(7deg)', offset: 0.56 },
        { transform: 'translate(5px,3px) scale(1.04,1) rotate(3deg)', offset: 0.76 },
        { transform: 'translate(0,0) scale(1,1) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 陰と陽、2色の環が互い違いに巡る
    ['#ffffff', '#5a6b78'].forEach((color, i) => {
        for (let k = 0; k < 2; k++) {
            spawnCustomParticle('◯', x, y, {
                size: 58, delay: i * 150 + k * 320, duration: 700 * EFFECT_SPEED_MULTIPLIER, color,
                keyframes: [
                    { transform: `translate(-50%,-50%) scale(1.5) rotate(${i * 180}deg)`, opacity: 0 },
                    { transform: `translate(-50%,-50%) scale(1) rotate(${i * 180 + 180}deg)`, opacity: 0.85, offset: 0.55 },
                    { transform: `translate(-50%,-50%) scale(0.7) rotate(${i * 180 + 330}deg)`, opacity: 0 }
                ]
            });
        }
    });
    spawnSelfParticleRing(casterEl, '✦', 6, 18, 800 * EFFECT_SPEED_MULTIPLIER, 40);
}
registerCustomSkillMotion('taikyoku_henka', playTaikyokuHenkaMotion, 'メタルナー');
