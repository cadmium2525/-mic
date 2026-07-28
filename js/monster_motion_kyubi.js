// =====================================================
// monster_motion_kyubi.js
// キュービ（九尾）専用のバトルモーション演出。
//
// キュービの特徴（＝演出の軸）：
//   ・青白い狐火     → 炎技は赤ではなく「青白い妖火」で描く。ヒノトリの炎とは色で明確に分ける
//   ・九つの尾       → 大技では尾を模した9つの光が扇状に開く。数の多さで格の高さを見せる
//   ・妖しさ・幻惑   → 陽炎・ゆうわくは、姿がゆらいだり分身したりする「掴みどころのなさ」で見せる
//   ・神性を帯びた瞳 → 九重神眼は瞳が起点。目が開く演出から入る
//
// ★狐火の格付け：
//     狐火     … 小さな妖火を1つ飛ばす（高命中の基本技）
//     超狐火   … 複数の妖火が渦を巻いて襲いかかる
//     天河天翔 … 最上位。九つの尾の光が奔流となって叩き込まれる
//
// 対応技：ひっかき／陽炎／狐火／超狐火／ゆうわく／九重神眼／天河天翔／あくび／妖狐の祈り
// =====================================================

const KYUBI_FOXFIRE = '#8fd8ff';  // 青白い狐火
const KYUBI_MYSTIC = '#c9a6ff';   // 妖しさ・幻惑の紫
const KYUBI_DIVINE = '#ffe9a8';   // 神性の金

// --- キュービ共通：青白い狐火の玉を飛ばす ---
function spawnKyubiFoxfire(fromX, fromY, toX, toY, opts = {}) {
    const { size = 24, duration = 480, delay = 0, wave = 0, color = KYUBI_FOXFIRE } = opts;
    const dx = toX - fromX, dy = toY - fromY;
    spawnCustomParticle('🔥', fromX, fromY, {
        size, delay, duration: duration * EFFECT_SPEED_MULTIPLIER, color,
        keyframes: [
            { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
            { transform: `translate(${dx * 0.5}px,${dy * 0.5 + wave}px) translate(-50%,-50%) scale(1.15)`, opacity: 1, offset: 0.5 },
            { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(1)`, opacity: 1 }
        ]
    });
}

// --- ひっかき：素早く踏み込んで爪で裂く ---
function playKyubiHikkakiMotion(side) {
    const { impactAt, to } = playLungeMotion(side, { reach: 0.64, duration: 560 });
    if (!to) return;
    setTimeout(() => {
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                spawnSlashArc(to.x + (i - 1) * 6, to.y + (i - 1) * 14, -34, {
                    length: 96, width: 6, color: KYUBI_FOXFIRE, duration: 240 * EFFECT_SPEED_MULTIPLIER
                });
            }, i * 40);
        }
        spawnImpactBurst(to.x, to.y, { size: 30, duration: 300 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 10, rotate: 7 });
    }, impactAt);
}
registerCustomSkillMotion('hikkaki', playKyubiHikkakiMotion, 'キュービ');

// --- 狐火：青白い妖火をひとつ飛ばす（高命中の基本技なので、素早く簡潔に） ---
function playKitsunebiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 760 * EFFECT_SPEED_MULTIPLIER;

    // 尾を一振りして妖火を送り出す
    animateSpriteLayers(side, [
        { transform: 'rotate(0deg) scale(1)', offset: 0 },
        { transform: 'rotate(-7deg) scale(1.03)', offset: 0.26 },
        { transform: 'rotate(7deg) scale(1.01)', offset: 0.44 },
        { transform: 'rotate(0deg) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-out' });

    setTimeout(() => {
        spawnKyubiFoxfire(from.x, from.y, to.x, to.y, { size: 26, duration: 440 });
        setTimeout(() => {
            spawnImpactBurst(to.x, to.y, { size: 32, duration: 340 * EFFECT_SPEED_MULTIPLIER, color: KYUBI_FOXFIRE });
            playRecoilMotion(otherSide(side), { distance: 10, rotate: 7 });
        }, 440 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.4);
}
registerCustomSkillMotion('kitsunebi', playKitsunebiMotion, 'キュービ');

// --- 超狐火：複数の妖火が渦を巻いて襲いかかる（狐火の強化版として数と規模を上げる） ---
function playChoKitsunebiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1100 * EFFECT_SPEED_MULTIPLIER;

    animateSpriteLayers(side, [
        { transform: 'translateY(0) scale(1)', offset: 0 },
        { transform: 'translateY(-8px) scale(1.06)', offset: 0.3 },
        { transform: 'translateY(-8px) scale(1.06)', offset: 0.46 },
        { transform: 'translateY(0) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 周囲に妖火が灯ってから、一斉に飛ぶ
    for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 * i) / 5;
        spawnCustomParticle('🔥', from.x + Math.cos(a) * 40, from.y + Math.sin(a) * 32, {
            size: 22, delay: 100 + i * 70, duration: 480 * EFFECT_SPEED_MULTIPLIER, color: KYUBI_FOXFIRE,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1, offset: 0.5 },
                { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }
            ]
        });
    }

    setTimeout(() => {
        // 渦を巻きながら相手へ殺到する
        for (let i = 0; i < 5; i++) {
            const a = (Math.PI * 2 * i) / 5;
            const sx = from.x + Math.cos(a) * 40;
            const sy = from.y + Math.sin(a) * 32;
            spawnKyubiFoxfire(sx, sy, to.x, to.y, {
                size: 24, delay: i * 55, duration: 460,
                wave: (i % 2 === 0 ? -22 : 20)
            });
        }
        setTimeout(() => {
            for (let i = 0; i < 3; i++) {
                spawnCustomParticle('🌀', to.x, to.y, {
                    size: 30, delay: i * 60, duration: 420 * EFFECT_SPEED_MULTIPLIER, color: KYUBI_FOXFIRE,
                    keyframes: [
                        { transform: 'translate(-50%,-50%) scale(0.4) rotate(0deg)', opacity: 0 },
                        { transform: 'translate(-50%,-50%) scale(1.3) rotate(300deg)', opacity: 1, offset: 0.45 },
                        { transform: 'translate(-50%,-50%) scale(0.9) rotate(540deg)', opacity: 0 }
                    ]
                });
            }
            spawnImpactBurst(to.x, to.y, { size: 46, duration: 460 * EFFECT_SPEED_MULTIPLIER, color: KYUBI_FOXFIRE });
            playRecoilMotion(otherSide(side), { distance: 15, rotate: 11, duration: 560 });
        }, 460 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.46);
}
registerCustomSkillMotion('cho_kitsunebi', playChoKitsunebiMotion, 'キュービ');

// --- 陽炎：ゆらめく陽炎に姿を紛れ込ませて斬りつける ---
//   効果「次に受ける攻撃を確実に回避する」に合わせ、斬った後も姿がゆらいだまま残る。
function playKagerouMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 980 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.72;

    // 揺らいで薄れる → 相手の位置で実体化して斬る → また揺らいで戻る
    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1,1)', opacity: 1, offset: 0 },
        { transform: 'translateX(0) scale(1.04,0.97)', opacity: 0.5, offset: 0.2 },        // ゆらぐ
        { transform: `translateX(${travel * 0.5}px) scale(0.97,1.04)`, opacity: 0.2, offset: 0.34 },
        { transform: `translateX(${travel}px) scale(1.05,1)`, opacity: 1, offset: 0.46 },   // 実体化
        { transform: `translateX(${travel}px) scale(1.02,1)`, opacity: 0.6, offset: 0.62 }, // また薄れる
        { transform: 'translateX(0) scale(1,1)', opacity: 1, offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 揺らめく陽炎の残像
    for (let i = 0; i < 3; i++) {
        const t = (i + 1) / 4;
        spawnCustomParticle('◤', from.x + (to.x - from.x) * t * 0.7, from.y, {
            size: 30, delay: duration * 0.22 + i * 60, duration: 420 * EFFECT_SPEED_MULTIPLIER, color: KYUBI_MYSTIC,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(1.05) skewX(0deg)', opacity: 0.45 },
                { transform: 'translate(-50%,-50%) scale(1) skewX(8deg)', opacity: 0.25, offset: 0.5 },
                { transform: 'translate(-50%,-50%) scale(0.92) skewX(-6deg)', opacity: 0 }
            ]
        });
    }

    setTimeout(() => {
        spawnSlashArc(to.x, to.y, -28, { length: 104, width: 8, color: KYUBI_MYSTIC, duration: 260 * EFFECT_SPEED_MULTIPLIER });
        spawnImpactBurst(to.x, to.y, { size: 34, duration: 340 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 12, rotate: 8 });
    }, duration * 0.46);
}
registerCustomSkillMotion('kagerou', playKagerouMotion, 'キュービ');

// --- ゆうわく：妖しい魅力で相手の闘志を大きく削ぐ ---
//   GUTS-40と混乱が主眼の技なので、打撃感より「惹き込まれる」雰囲気を主役にする。
function playYuuwakuMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1150 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x, dy = to.y - from.y;

    // しなやかに身をくねらせる
    animateSpriteLayers(side, [
        { transform: 'rotate(0deg) scale(1,1)', offset: 0 },
        { transform: 'rotate(-6deg) scale(1.03,0.99)', offset: 0.24 },
        { transform: 'rotate(6deg) scale(0.99,1.03)', offset: 0.48 },
        { transform: 'rotate(-3deg) scale(1.02,1)', offset: 0.7 },
        { transform: 'rotate(0deg) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 妖しい光が漂って相手を包む
    for (let i = 0; i < 4; i++) {
        const wave = (i % 2 === 0) ? -22 : 18;
        spawnCustomParticle('💜', from.x, from.y - 6, {
            size: 24, delay: duration * 0.28 + i * 110, duration: 680 * EFFECT_SPEED_MULTIPLIER, color: KYUBI_MYSTIC,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4) rotate(-10deg)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px,${dy * 0.5 + wave}px) translate(-50%,-50%) scale(1.1) rotate(10deg)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(0.85) rotate(-6deg)`, opacity: 0 }
            ]
        });
    }

    setTimeout(() => {
        // 惹き込まれてふらつく（混乱の予兆として頭上をぐるぐる回る）
        animateSpriteLayers(otherSide(side), [
            { transform: 'rotate(0deg) scale(1)', offset: 0 },
            { transform: 'rotate(7deg) scale(1.03)', offset: 0.28 },
            { transform: 'rotate(-6deg) scale(0.99)', offset: 0.58 },
            { transform: 'rotate(3deg) scale(1.01)', offset: 0.8 },
            { transform: 'rotate(0deg) scale(1)', offset: 1 }
        ], { duration: 760 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-in-out' });
        for (let i = 0; i < 3; i++) {
            const a = (Math.PI * 2 * i) / 3;
            spawnCustomParticle('💫', to.x, to.y - 24, {
                size: 20, delay: i * 90, duration: 680 * EFFECT_SPEED_MULTIPLIER, color: KYUBI_MYSTIC,
                keyframes: [
                    { transform: `translate(${Math.cos(a) * 20}px,${Math.sin(a) * 9}px) translate(-50%,-50%) scale(0.5)`, opacity: 0 },
                    { transform: `translate(${Math.cos(a + 2.1) * 22}px,${Math.sin(a + 2.1) * 10}px) translate(-50%,-50%) scale(1.1)`, opacity: 1, offset: 0.45 },
                    { transform: `translate(${Math.cos(a + 4.2) * 20}px,${Math.sin(a + 4.2) * 9}px) translate(-50%,-50%) scale(0.75)`, opacity: 0 }
                ]
            });
        }
        spawnImpactBurst(to.x, to.y, { emoji: '💜', size: 32, duration: 460 * EFFECT_SPEED_MULTIPLIER, color: KYUBI_MYSTIC });
        playRecoilMotion(otherSide(side), { distance: 8, rotate: 6 });
    }, duration * 0.64);
}
registerCustomSkillMotion('yuuwaku', playYuuwakuMotion, 'キュービ');

// --- 九重神眼：九尾の瞳で見据えて撃ち抜く ---
//   効果「自身にシールドを展開する」に合わせ、命中後に守りの光をまとう。
function playKokonoeShinganMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const chargeMs = 540 * EFFECT_SPEED_MULTIPLIER;
    const beamMs = 560 * EFFECT_SPEED_MULTIPLIER;

    animateSpriteLayers(side, [
        { transform: 'translateY(0) scale(1)', offset: 0 },
        { transform: 'translateY(-8px) scale(1.05)', offset: 0.34 },
        { transform: 'translateY(-6px) scale(1.02)', offset: 0.58 },
        { transform: 'translateY(0) scale(1)', offset: 1 }
    ], { duration: chargeMs + beamMs, easing: 'ease-in-out' });

    // 九つの瞳が周囲に開く（技名の「九重」を数で見せる）
    for (let i = 0; i < 9; i++) {
        const a = (Math.PI * 2 * i) / 9;
        spawnCustomParticle('◯', from.x + Math.cos(a) * 46, from.y + Math.sin(a) * 34, {
            size: 20, delay: i * 40, duration: chargeMs, color: KYUBI_DIVINE,
            keyframes: [
                { transform: 'translate(-50%,-50%) scaleX(1.3) scaleY(0.15)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scaleX(1.4) scaleY(1)', opacity: 1, offset: 0.5 },
                { transform: 'translate(-50%,-50%) scaleX(1.4) scaleY(0.9)', opacity: 0 }
            ]
        });
    }

    setTimeout(() => {
        spawnBeamLine(from.x, from.y - 4, to.x - from.x, to.y - (from.y - 4), KYUBI_DIVINE, beamMs, 13);
        setTimeout(() => {
            spawnImpactBurst(to.x, to.y, { size: 42, duration: 440 * EFFECT_SPEED_MULTIPLIER, color: KYUBI_DIVINE });
            playRecoilMotion(otherSide(side), { distance: 13, rotate: 10, duration: 520 });
            // 命中後、自身に守りの光がまとわりつく
            setTimeout(() => {
                spawnCustomParticle('◯', from.x, from.y, {
                    size: 62, duration: 560 * EFFECT_SPEED_MULTIPLIER, color: KYUBI_DIVINE,
                    keyframes: [
                        { transform: 'translate(-50%,-50%) scale(1.6)', opacity: 0 },
                        { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.85, offset: 0.55 },
                        { transform: 'translate(-50%,-50%) scale(0.92)', opacity: 0 }
                    ]
                });
                spawnSelfParticleRing(casterEl, '✦', 4, 16, 560 * EFFECT_SPEED_MULTIPLIER, 34);
            }, 300 * EFFECT_SPEED_MULTIPLIER);
        }, beamMs * 0.3);
    }, chargeMs);
}
registerCustomSkillMotion('kokonoe_shingan', playKokonoeShinganMotion, 'キュービ');

// --- 天河天翔：九つの尾の霊力が奔流となって叩き込まれる（キュービ最大の切り札） ---
function playTengaTenshoMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1600 * EFFECT_SPEED_MULTIPLIER;

    // 全技中もっとも長いため。宙に浮きながら霊力を高めていく
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) scale(1)', offset: 0 },
        { transform: 'translate(0,-10px) scale(1.05)', offset: 0.18 },
        { transform: 'translate(0,-18px) scale(1.1)', offset: 0.34 },
        { transform: 'translate(0,-22px) scale(1.14)', offset: 0.5 },
        { transform: 'translate(0,-10px) scale(1.04)', offset: 0.66 },
        { transform: 'translate(0,0) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 九つの尾を模した光が扇状に開く（技名の由来である「九」を見せ場にする）
    for (let i = 0; i < 9; i++) {
        const a = -Math.PI * 0.5 + (i - 4) * 0.28;
        spawnCustomParticle('✦', from.x, from.y, {
            size: 24, delay: 120 + i * 55, duration: 620 * EFFECT_SPEED_MULTIPLIER, color: KYUBI_FOXFIRE,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                { transform: `translate(${Math.cos(a) * 40}px,${Math.sin(a) * 34}px) translate(-50%,-50%) scale(1.15)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${Math.cos(a) * 62}px,${Math.sin(a) * 52}px) translate(-50%,-50%) scale(1)`, opacity: 1 }
            ]
        });
    }

    // 天河：光の奔流が相手へ流れ込む
    setTimeout(() => {
        for (let i = 0; i < 3; i++) {
            const oy = (i - 1) * 18;
            spawnBeamLine(from.x, from.y + oy, to.x - from.x, to.y - (from.y + oy), KYUBI_FOXFIRE, 700 * EFFECT_SPEED_MULTIPLIER, 16);
        }
        setTimeout(() => {
            // 着弾で霊力が渦を巻いて弾ける
            spawnCustomParticle('◯', to.x, to.y, {
                size: 92, duration: 640 * EFFECT_SPEED_MULTIPLIER, color: KYUBI_FOXFIRE,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.1)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.9)', opacity: 1, offset: 0.3 },
                    { transform: 'translate(-50%,-50%) scale(3.3)', opacity: 0 }
                ]
            });
            for (let i = 0; i < 9; i++) {
                const a = (Math.PI * 2 * i) / 9;
                spawnCustomParticle('🔥', to.x, to.y, {
                    size: 26, delay: i * 35, duration: 560 * EFFECT_SPEED_MULTIPLIER,
                    color: i % 2 === 0 ? KYUBI_FOXFIRE : KYUBI_DIVINE,
                    keyframes: [
                        { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                        { transform: `translate(${Math.cos(a) * 50}px,${Math.sin(a) * 40}px) translate(-50%,-50%) scale(1.3)`, opacity: 1, offset: 0.4 },
                        { transform: `translate(${Math.cos(a) * 84}px,${Math.sin(a) * 66}px) translate(-50%,-50%) scale(0.6)`, opacity: 0 }
                    ]
                });
            }
            spawnImpactBurst(to.x, to.y, { size: 60, duration: 580 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: 21, rotate: 15, duration: 660 });
        }, 240 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.58);
}
registerCustomSkillMotion('tenga_tensho', playTengaTenshoMotion, 'キュービ');

// --- あくび：大きなあくびで眠気を誘う（ダメージ無しなので、相手を殴る演出は入れない） ---
function playAkubiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1150 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x, dy = to.y - from.y;

    // ゆっくり大きく口を開けて、脱力する（のんびりした間が可笑しみになる）
    animateSpriteLayers(side, [
        { transform: 'scale(1,1)', offset: 0 },
        { transform: 'scale(1.06,1.12)', offset: 0.3 },   // 大きく開く
        { transform: 'scale(1.08,1.14)', offset: 0.46 },
        { transform: 'scale(0.96,0.94)', offset: 0.62 },  // 脱力
        { transform: 'scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 眠気がゆっくり漂って相手に届く
    for (let i = 0; i < 3; i++) {
        const wave = (i % 2 === 0) ? -20 : 16;
        spawnCustomParticle('💤', from.x, from.y - 10, {
            size: 26, delay: duration * 0.42 + i * 150, duration: 820 * EFFECT_SPEED_MULTIPLIER, color: '#a8c8e8',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4) rotate(-8deg)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px,${dy * 0.5 + wave}px) translate(-50%,-50%) scale(1.1) rotate(8deg)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${dx}px,${dy - 10}px) translate(-50%,-50%) scale(0.9) rotate(-6deg)`, opacity: 0 }
            ]
        });
    }

    // つられて眠くなる（ダメージは無いので、仰け反らせず「うとうと」だけ見せる）
    setTimeout(() => {
        animateSpriteLayers(otherSide(side), [
            { transform: 'rotate(0deg) translateY(0)', offset: 0 },
            { transform: 'rotate(5deg) translateY(3px)', offset: 0.3 },
            { transform: 'rotate(-3deg) translateY(0)', offset: 0.6 },
            { transform: 'rotate(4deg) translateY(3px)', offset: 0.82 },
            { transform: 'rotate(0deg) translateY(0)', offset: 1 }
        ], { duration: 900 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-in-out' });
        spawnCustomParticle('💤', to.x + 18, to.y - 24, {
            size: 26, duration: 720 * EFFECT_SPEED_MULTIPLIER, color: '#a8c8e8',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: 'translate(6px,-14px) translate(-50%,-50%) scale(1.15)', opacity: 1, offset: 0.5 },
                { transform: 'translate(12px,-28px) translate(-50%,-50%) scale(0.8)', opacity: 0 }
            ]
        });
    }, duration * 0.7);
}
registerCustomSkillMotion('akubi', playAkubiMotion, 'キュービ');

// --- 妖狐の祈り：妖狐の力を借りて自らに祈りを捧げる（自己強化。相手には一切干渉しない） ---
function playYoukoNoInoriMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    if (!casterEl) return;
    const { x, y } = getElCenter(casterEl);
    const duration = 1100 * EFFECT_SPEED_MULTIPLIER;

    // 静かに座して祈るように、動きを抑える
    animateSpriteLayers(side, [
        { transform: 'translateY(0) scale(1)', offset: 0 },
        { transform: 'translateY(-8px) scale(1.03)', offset: 0.34 },
        { transform: 'translateY(-10px) scale(1.05)', offset: 0.6 },
        { transform: 'translateY(0) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 九つの狐火が周囲に灯り、ゆっくり自身へ収束する
    for (let i = 0; i < 9; i++) {
        const a = (Math.PI * 2 * i) / 9;
        const r = 58;
        spawnCustomParticle('🔥', x + Math.cos(a) * r, y + Math.sin(a) * r * 0.75, {
            size: 20, delay: 80 + i * 60, duration: 640 * EFFECT_SPEED_MULTIPLIER, color: KYUBI_FOXFIRE,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0.45 },
                { transform: `translate(${-Math.cos(a) * r}px,${-Math.sin(a) * r * 0.75}px) translate(-50%,-50%) scale(0.35)`, opacity: 0 }
            ]
        });
    }
    // 祈りが満ちた証の輪
    for (let i = 0; i < 2; i++) {
        spawnCustomParticle('◯', x, y, {
            size: 64, delay: 340 + i * 200, duration: 660 * EFFECT_SPEED_MULTIPLIER, color: KYUBI_DIVINE,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(1.6) rotate(0deg)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1) rotate(120deg)', opacity: 0.9, offset: 0.55 },
                { transform: 'translate(-50%,-50%) scale(0.85) rotate(220deg)', opacity: 0 }
            ]
        });
    }
    spawnSelfParticleRing(casterEl, '✨', 6, 17, 780 * EFFECT_SPEED_MULTIPLIER, 38);
}
registerCustomSkillMotion('youko_no_inori', playYoukoNoInoriMotion, 'キュービ');
