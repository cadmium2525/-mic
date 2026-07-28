// =====================================================
// monster_motion_gari.js
// ガリ専用のバトルモーション演出。
//
// ガリの特徴（＝演出の軸）：
//   ・「ホーリー」を冠する属性技を複数持つ
//        → ホーリー系（ファイヤー／アース／アイシクル）は、共通の「聖なる輪が開く」導入を
//          必ず挟み、そこから属性ごとの現象が起きる形に統一する。
//          これで3技が「同じ系統の技」であることが見た目で伝わる
//   ・素朴な格闘技も持つ（ナックル／ストレート／プレス）
//        → こちらは装飾を排して、素直な打撃で描く。属性技との落差を作る
//   ・回転系（スピンカッター／大スピンカッター）
//        → 大は回転数・軌跡・着弾をすべて増やして格上だと分かるようにする
//
// 対応技：ナックル／ホーリーファイヤー／ゴッドブレス／プレス／ハリケーン／ホーリーアース／
//         スピンカッター／ストレート／ホーリーアイシクル／大スピンカッター／ゴッドファイナル
// =====================================================

const GARI_HOLY = '#fff0b8';   // 聖なる光
const GARI_FIRE = '#ff8a4c';   // ホーリーファイヤー
const GARI_EARTH = '#c2a06a';  // ホーリーアース
const GARI_ICE = '#a8e8ff';    // ホーリーアイシクル

// --- ガリ共通：ホーリー系の導入（足元に聖なる輪が開く） ---
//   ホーリー3種で必ず使い、同系統であることを見た目で伝える。
function playGariHolyCircle(side, color, opts = {}) {
    const { duration = 520 } = opts;
    const casterEl = getBattleSpriteContainerEl(side);
    if (!casterEl) return 0;
    const { x, y } = getElCenter(casterEl);
    const d = duration * EFFECT_SPEED_MULTIPLIER;

    // 祈るように身を起こす
    animateSpriteLayers(side, [
        { transform: 'translateY(0) scale(1)', offset: 0 },
        { transform: 'translateY(-8px) scale(1.04)', offset: 0.45 },
        { transform: 'translateY(-8px) scale(1.04)', offset: 0.7 },
        { transform: 'translateY(0) scale(1)', offset: 1 }
    ], { duration: d * 1.7, easing: 'ease-in-out' });

    // 足元の輪が回りながら開く
    for (let i = 0; i < 2; i++) {
        spawnCustomParticle('◯', x, y + 20, {
            size: 56, delay: i * 130, duration: d, color,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.2) scaleY(0.35) rotate(0deg)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.15) scaleY(0.4) rotate(140deg)', opacity: 0.95, offset: 0.5 },
                { transform: 'translate(-50%,-50%) scale(1.4) scaleY(0.45) rotate(250deg)', opacity: 0 }
            ]
        });
    }
    return d;
}

// --- ナックル：素直な拳の一撃 ---
function playKnuckleMotion(side) {
    const { impactAt, to } = playLungeMotion(side, { reach: 0.6, duration: 580 });
    if (!to) return;
    setTimeout(() => {
        spawnImpactBurst(to.x, to.y, { size: 32, duration: 320 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 11, rotate: 8 });
    }, impactAt);
}
registerCustomSkillMotion('knuckle', playKnuckleMotion, 'ガリ');

// --- ストレート：踏み込みを深くした、重い直突き（ナックルの上位互換として踏み込みと衝撃を大きく） ---
function playGariStraightMotion(side) {
    const { impactAt, to } = playLungeMotion(side, { reach: 0.72, duration: 680, scaleHit: 1.08 });
    if (!to) return;
    setTimeout(() => {
        spawnSlashArc(to.x, to.y, 0, { length: 88, width: 9, color: '#ffffff', duration: 240 * EFFECT_SPEED_MULTIPLIER });
        spawnImpactBurst(to.x, to.y, { size: 40, duration: 380 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 14, rotate: 10 });
    }, impactAt);
}
registerCustomSkillMotion('straight', playGariStraightMotion, 'ガリ');

// --- プレス：跳び上がって全体重で押し潰す ---
function playPressMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1020 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x;

    animateSpriteLayers(side, [
        { transform: 'translate(0,0) scale(1,1)', offset: 0 },
        { transform: 'translate(0,6px) scale(1.1,0.9)', offset: 0.16 },
        { transform: `translate(${dx * 0.5}px,-46px) scale(0.92,1.12)`, offset: 0.4 },
        { transform: `translate(${dx * 0.85}px,6px) scale(1.28,0.72)`, offset: 0.6 },  // 潰す
        { transform: `translate(${dx * 0.5}px,0) scale(1.04,0.96)`, offset: 0.78 },
        { transform: 'translate(0,0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        spawnCustomParticle('◯', to.x, to.y + 14, {
            size: 62, duration: 460 * EFFECT_SPEED_MULTIPLIER, color: '#d8d0c0',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3) scaleY(0.4)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.3) scaleY(0.45)', opacity: 0.9, offset: 0.4 },
                { transform: 'translate(-50%,-50%) scale(2) scaleY(0.5)', opacity: 0 }
            ]
        });
        spawnImpactBurst(to.x, to.y + 8, { size: 44, duration: 440 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 15, rotate: 11, duration: 560 });
    }, duration * 0.58);
}
registerCustomSkillMotion('press', playPressMotion, 'ガリ');

// --- ハリケーン：巻き起こした暴風が相手を薙ぎ払う ---
function playHurricaneMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1100 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x;

    // その場で回って風を起こす
    animateSpriteLayers(side, [
        { transform: 'rotate(0deg) scale(1,1)', offset: 0 },
        { transform: 'rotate(240deg) scale(0.94,1.06)', offset: 0.26 },
        { transform: 'rotate(600deg) scale(0.92,1.08)', offset: 0.46 },
        { transform: 'rotate(720deg) scale(1,1)', offset: 0.64 },
        { transform: 'rotate(720deg) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 風の渦が相手へ流れていく
    for (let i = 0; i < 5; i++) {
        spawnCustomParticle('🌀', from.x, from.y, {
            size: 26 + i * 2, delay: duration * 0.32 + i * 70, duration: 580 * EFFECT_SPEED_MULTIPLIER, color: '#bcd8ea',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4) rotate(0deg)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px,${(i % 2 === 0 ? -1 : 1) * 14}px) translate(-50%,-50%) scale(1.15) rotate(300deg)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${dx}px,0) translate(-50%,-50%) scale(1.4) rotate(600deg)`, opacity: 0 }
            ]
        });
    }
    setTimeout(() => {
        animateSpriteLayers(otherSide(side), [
            { transform: 'translateX(0) rotate(0deg)', offset: 0 },
            { transform: `translateX(${dx > 0 ? 16 : -16}px) rotate(${dx > 0 ? 10 : -10}deg)`, offset: 0.35 },
            { transform: 'translateX(0) rotate(0deg)', offset: 1 }
        ], { duration: 640 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-out' });
        spawnImpactBurst(to.x, to.y, { emoji: '💨', size: 42, duration: 440 * EFFECT_SPEED_MULTIPLIER });
    }, duration * 0.66);
}
registerCustomSkillMotion('hurricane', playHurricaneMotion, 'ガリ');

// --- スピンカッター：高速回転しながら相手を切り裂く ---
//   大スピンカッターは回転数・軌跡・着弾をすべて増やして格上だと分かるようにする
function playSpinCutterMotion(side, opts = {}) {
    const { big = false } = opts;
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = (big ? 1120 : 880) * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * (big ? 0.78 : 0.68);
    const spin = big ? 1440 : 720;
    const cuts = big ? 5 : 3;

    animateSpriteLayers(side, [
        { transform: 'translateX(0) rotate(0deg) scale(1,1)', offset: 0 },
        { transform: `translateX(0) rotate(${spin * 0.2}deg) scale(0.94,1.06)`, offset: 0.22 },
        { transform: `translateX(${travel}px) rotate(${spin * 0.8}deg) scale(0.96,1.04)`, offset: 0.58 },
        { transform: `translateX(${travel * 0.5}px) rotate(${spin}deg) scale(1,1)`, offset: 0.8 },
        { transform: `translateX(0) rotate(${spin}deg) scale(1,1)`, offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    for (let i = 0; i < cuts; i++) {
        setTimeout(() => {
            spawnSlashArc(to.x, to.y + (i - (cuts - 1) / 2) * 12, (i * 60) % 180 - 90, {
                length: big ? 128 : 100, width: big ? 11 : 8, color: '#e8f4ff', duration: 260 * EFFECT_SPEED_MULTIPLIER
            });
            spawnImpactBurst(to.x, to.y, { emoji: '✨', size: big ? 26 : 22, duration: 250 * EFFECT_SPEED_MULTIPLIER });
        }, duration * (0.46 + i * 0.07));
    }
    setTimeout(() => {
        spawnImpactBurst(to.x, to.y, { size: big ? 50 : 36, duration: 420 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: big ? 17 : 12, rotate: big ? 12 : 9, duration: big ? 580 : 440 });
    }, duration * 0.74);
}
registerCustomSkillMotion('spin_cutter', (side) => playSpinCutterMotion(side, { big: false }), 'ガリ');
registerCustomSkillMotion('big_spin_cutter', (side) => playSpinCutterMotion(side, { big: true }), 'ガリ');

// --- ホーリーファイヤー：聖なる輪から神聖な炎が噴き上がる ---
function playHolyFireMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const wait = playGariHolyCircle(side, GARI_FIRE);

    setTimeout(() => {
        // 相手の足元から聖なる炎が立ち上る
        for (let i = 0; i < 6; i++) {
            const ox = (i - 2.5) * 15;
            spawnCustomParticle('🔥', to.x + ox, to.y + 16, {
                size: 24 + Math.random() * 8, delay: i * 55, duration: 540 * EFFECT_SPEED_MULTIPLIER, color: GARI_FIRE,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                    { transform: 'translate(0,-36px) translate(-50%,-50%) scale(1.3)', opacity: 1, offset: 0.45 },
                    { transform: 'translate(0,-66px) translate(-50%,-50%) scale(0.7)', opacity: 0 }
                ]
            });
        }
        spawnImpactBurst(to.x, to.y, { size: 42, duration: 440 * EFFECT_SPEED_MULTIPLIER, color: GARI_FIRE });
        playRecoilMotion(otherSide(side), { distance: 13, rotate: 9 });
    }, wait);
}
registerCustomSkillMotion('holy_fire', playHolyFireMotion, 'ガリ');

// --- ホーリーアース：聖なる輪から大地の岩塊が突き上がる ---
function playHolyEarthMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const wait = playGariHolyCircle(side, GARI_EARTH);

    setTimeout(() => {
        // 足元から岩が次々に突き上がる
        for (let i = 0; i < 5; i++) {
            const ox = (i - 2) * 18;
            spawnCustomParticle('🪨', to.x + ox, to.y + 22, {
                size: 26, delay: i * 65, duration: 540 * EFFECT_SPEED_MULTIPLIER, color: GARI_EARTH,
                keyframes: [
                    { transform: 'translate(-50%,-50%) translateY(20px) scale(0.4) rotate(0deg)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) translateY(-28px) scale(1.2) rotate(150deg)', opacity: 1, offset: 0.5 },
                    { transform: 'translate(-50%,-50%) translateY(-6px) scale(0.9) rotate(250deg)', opacity: 0 }
                ]
            });
        }
        spawnCustomParticle('◯', to.x, to.y + 18, {
            size: 60, duration: 480 * EFFECT_SPEED_MULTIPLIER, color: GARI_EARTH,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.2) scaleY(0.35)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.2) scaleY(0.4)', opacity: 0.9, offset: 0.45 },
                { transform: 'translate(-50%,-50%) scale(1.9) scaleY(0.45)', opacity: 0 }
            ]
        });
        spawnImpactBurst(to.x, to.y + 8, { size: 44, duration: 460 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 14, rotate: 10 });
    }, wait);
}
registerCustomSkillMotion('holy_earth', playHolyEarthMotion, 'ガリ');

// --- ホーリーアイシクル：聖なる輪から氷の柱が生えて突き刺さる ---
function playHolyIcicleMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const wait = playGariHolyCircle(side, GARI_ICE);

    setTimeout(() => {
        // 氷柱が下から生えて突き刺さる
        for (let i = 0; i < 5; i++) {
            const ox = (i - 2) * 17;
            spawnCustomParticle('❄️', to.x + ox, to.y + 20, {
                size: 24, delay: i * 60, duration: 520 * EFFECT_SPEED_MULTIPLIER, color: GARI_ICE,
                keyframes: [
                    { transform: 'translate(-50%,-50%) translateY(18px) scaleY(0.3) scaleX(0.6)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) translateY(-30px) scaleY(1.5) scaleX(1)', opacity: 1, offset: 0.5 },
                    { transform: 'translate(-50%,-50%) translateY(-46px) scaleY(1.2) scaleX(0.8)', opacity: 0 }
                ]
            });
        }
        // 凍りついて動きが鈍る
        animateSpriteLayers(otherSide(side), [
            { transform: 'scale(1,1)', offset: 0 },
            { transform: 'scale(0.96,1.03)', offset: 0.35 },
            { transform: 'scale(1,1)', offset: 1 }
        ], { duration: 560 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-out' });
        spawnImpactBurst(to.x, to.y, { emoji: '❄️', size: 42, duration: 460 * EFFECT_SPEED_MULTIPLIER, color: GARI_ICE });
        playRecoilMotion(otherSide(side), { distance: 12, rotate: 9 });
    }, wait);
}
registerCustomSkillMotion('holy_icicle', playHolyIcicleMotion, 'ガリ');

// --- ゴッドブレス：天の加護を受けて自身を高める（自己強化） ---
function playGodBlessMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    if (!casterEl) return;
    const { x, y } = getElCenter(casterEl);
    const duration = 1000 * EFFECT_SPEED_MULTIPLIER;

    animateSpriteLayers(side, [
        { transform: 'translateY(0) scale(1)', offset: 0 },
        { transform: 'translateY(-10px) scale(1.04)', offset: 0.4 },
        { transform: 'translateY(-10px) scale(1.04)', offset: 0.68 },
        { transform: 'translateY(0) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 天から加護の光が降り注ぐ
    spawnBeamLine(x, y - 130, 0, 130, GARI_HOLY, 620 * EFFECT_SPEED_MULTIPLIER, 24);
    for (let i = 0; i < 5; i++) {
        spawnCustomParticle('✨', x + (Math.random() - 0.5) * 50, y - 50, {
            size: 20, delay: i * 85, duration: 640 * EFFECT_SPEED_MULTIPLIER, color: GARI_HOLY,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: 'translate(0,30px) translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0.5 },
                { transform: 'translate(0,58px) translate(-50%,-50%) scale(0.6)', opacity: 0 }
            ]
        });
    }
    spawnSelfParticleRing(casterEl, '✦', 6, 18, 760 * EFFECT_SPEED_MULTIPLIER, 38);
}
registerCustomSkillMotion('god_bless', playGodBlessMotion, 'ガリ');

// --- ゴッドファイナル：ホーリー3属性が同時に顕現する、ガリ最大の切り札 ---
//   ホーリー系の集大成として、3つの輪をまとめて開き、炎・岩・氷が一度に襲いかかる
function playGodFinalMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1600 * EFFECT_SPEED_MULTIPLIER;

    // 全技中もっとも長くためる
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) scale(1)', offset: 0 },
        { transform: 'translate(-2px,-6px) scale(1.06)', offset: 0.18 },
        { transform: 'translate(2px,-10px) scale(1.12)', offset: 0.34 },
        { transform: 'translate(0,-12px) scale(1.16)', offset: 0.5 },
        { transform: 'translate(0,0) scale(1.02)', offset: 0.66 },
        { transform: 'translate(0,0) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 術者の周りに3属性の輪が同時に開く
    [GARI_FIRE, GARI_EARTH, GARI_ICE].forEach((color, i) => {
        spawnCustomParticle('◯', from.x, from.y + 18, {
            size: 62, delay: 120 + i * 140, duration: 640 * EFFECT_SPEED_MULTIPLIER, color,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.2) scaleY(0.35) rotate(0deg)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.2) scaleY(0.4) rotate(160deg)', opacity: 0.95, offset: 0.5 },
                { transform: 'translate(-50%,-50%) scale(1.5) scaleY(0.45) rotate(280deg)', opacity: 0 }
            ]
        });
    });

    // 顕現：炎・岩・氷が順に、そして最後に聖光がまとめて降る
    setTimeout(() => {
        // 炎
        for (let i = 0; i < 4; i++) {
            spawnCustomParticle('🔥', to.x + (i - 1.5) * 18, to.y + 14, {
                size: 26, delay: i * 45, duration: 480 * EFFECT_SPEED_MULTIPLIER, color: GARI_FIRE,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                    { transform: 'translate(0,-34px) translate(-50%,-50%) scale(1.25)', opacity: 1, offset: 0.45 },
                    { transform: 'translate(0,-60px) translate(-50%,-50%) scale(0.7)', opacity: 0 }
                ]
            });
        }
        // 岩
        setTimeout(() => {
            for (let i = 0; i < 4; i++) {
                spawnCustomParticle('🪨', to.x + (i - 1.5) * 20, to.y + 20, {
                    size: 24, delay: i * 45, duration: 480 * EFFECT_SPEED_MULTIPLIER, color: GARI_EARTH,
                    keyframes: [
                        { transform: 'translate(-50%,-50%) translateY(18px) scale(0.4) rotate(0deg)', opacity: 0 },
                        { transform: 'translate(-50%,-50%) translateY(-26px) scale(1.15) rotate(150deg)', opacity: 1, offset: 0.5 },
                        { transform: 'translate(-50%,-50%) translateY(-4px) scale(0.9) rotate(250deg)', opacity: 0 }
                    ]
                });
            }
        }, 220 * EFFECT_SPEED_MULTIPLIER);
        // 氷
        setTimeout(() => {
            for (let i = 0; i < 4; i++) {
                spawnCustomParticle('❄️', to.x + (i - 1.5) * 19, to.y + 18, {
                    size: 24, delay: i * 45, duration: 480 * EFFECT_SPEED_MULTIPLIER, color: GARI_ICE,
                    keyframes: [
                        { transform: 'translate(-50%,-50%) translateY(16px) scaleY(0.3) scaleX(0.6)', opacity: 0 },
                        { transform: 'translate(-50%,-50%) translateY(-28px) scaleY(1.5) scaleX(1)', opacity: 1, offset: 0.5 },
                        { transform: 'translate(-50%,-50%) translateY(-44px) scaleY(1.2) scaleX(0.8)', opacity: 0 }
                    ]
                });
            }
        }, 440 * EFFECT_SPEED_MULTIPLIER);

        // 締め：天から聖光が降り、全てを飲み込む
        setTimeout(() => {
            spawnBeamLine(to.x, to.y - 165, 0, 165, '#ffffff', 620 * EFFECT_SPEED_MULTIPLIER, 32);
            spawnCustomParticle('◯', to.x, to.y, {
                size: 92, duration: 620 * EFFECT_SPEED_MULTIPLIER, color: GARI_HOLY,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.1)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.9)', opacity: 1, offset: 0.3 },
                    { transform: 'translate(-50%,-50%) scale(3.3)', opacity: 0 }
                ]
            });
            spawnImpactBurst(to.x, to.y, { size: 62, duration: 580 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: 21, rotate: 15, duration: 660 });
        }, 700 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.54);
}
registerCustomSkillMotion('god_final', playGodFinalMotion, 'ガリ');
