// =====================================================
// monster_motion_kijin.js
// キジン専用のバトルモーション演出。
//
// キジンの特徴（＝演出の軸）：
//   ・鬼の膂力     → 打撃は「重く、赤黒い衝撃」で見せる
//   ・鋭い鬼の爪   → 爪技は3本線の平行な斬撃（獣の爪痕）にする
//   ・鬼気・怨念   → 鬼哭衝・羅刹は紫黒の禍々しい色で統一する
//   ・和風の大技   → 阿修羅・羅生門は格上として、ためと規模を明確に大きくする
//
// ★威力の格付け（見た目でも段階が分かるようにしている）：
//     鬼手・鬼爪   … 単発の打撃／斬撃
//     鬼神乱舞     … 多段
//     地裂斬       … 地面を割る range 技
//     阿修羅       … 自己強化（多腕の残像）
//     羅刹・羅生門 … 最上位。長いため＋画面規模の演出
//
// 対応技：頭突き／鬼手／投げ飛ばし／鬼爪／鬼神乱舞／地裂斬／鬼哭衝／阿修羅／羅刹／羅生門
// =====================================================

const KIJIN_ONI = '#e05a4a';    // 鬼の赤
const KIJIN_CURSE = '#8f5ac0';  // 怨念の紫

// --- 鬼の爪痕（3本の平行な斬撃）を描く共通処理 ---
function spawnKijinClawMarks(x, y, opts = {}) {
    const { angle = -30, length = 104, color = KIJIN_ONI, gap = 16, duration = 300 } = opts;
    for (let i = 0; i < 3; i++) {
        const offset = (i - 1) * gap;
        setTimeout(() => {
            spawnSlashArc(x + offset * 0.4, y + offset, angle, {
                length, width: 7, color, duration: duration * EFFECT_SPEED_MULTIPLIER
            });
        }, i * 45);
    }
}

// --- 頭突き：角ごと相手に叩き込む ---
function playZutsukiMotion(side) {
    const { impactAt, to } = playLungeMotion(side, { reach: 0.66, duration: 640, scaleHit: 1.08 });
    if (!to) return;
    setTimeout(() => {
        spawnImpactBurst(to.x, to.y - 6, { size: 36, duration: 340 * EFFECT_SPEED_MULTIPLIER });
        spawnCustomParticle('💢', to.x + 16, to.y - 22, {
            size: 24, duration: 420 * EFFECT_SPEED_MULTIPLIER, color: KIJIN_ONI,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 1, offset: 0.4 },
                { transform: 'translate(0,-10px) translate(-50%,-50%) scale(0.9)', opacity: 0 }
            ]
        });
        playRecoilMotion(otherSide(side), { distance: 13, rotate: 9 });
    }, impactAt);
}
registerCustomSkillMotion('zutsuki', playZutsukiMotion, 'キジン');

// --- 鬼手：鬼の膂力を込めた掌の一撃 ---
function playOniteMotion(side) {
    const { impactAt, to } = playLungeMotion(side, { reach: 0.58, duration: 700, scaleHit: 1.06 });
    if (!to) return;
    setTimeout(() => {
        // 掌の面で押し込む重い衝撃
        spawnCustomParticle('◯', to.x, to.y, {
            size: 54, duration: 400 * EFFECT_SPEED_MULTIPLIER, color: KIJIN_ONI,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.25) scaleX(0.8)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.1) scaleX(1.25)', opacity: 0.9, offset: 0.4 },
                { transform: 'translate(-50%,-50%) scale(1.7) scaleX(1.6)', opacity: 0 }
            ]
        });
        spawnImpactBurst(to.x, to.y, { size: 38, duration: 380 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 14, rotate: 10 });
    }, impactAt);
}
registerCustomSkillMotion('onite', playOniteMotion, 'キジン');

// --- 投げ飛ばし：掴んで力任せに放り投げる ---
function playNagetobashiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1080 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.5;
    const throwDir = (to.x - from.x) > 0 ? 1 : -1;

    animateSpriteLayers(side, [
        { transform: 'translateX(0) rotate(0deg)', offset: 0 },
        { transform: `translateX(${travel}px) rotate(0deg)`, offset: 0.24 },    // 掴む
        { transform: `translateX(${travel}px) rotate(-18deg)`, offset: 0.46 },  // 振り回す
        { transform: `translateX(${travel * 0.6}px) rotate(20deg)`, offset: 0.62 }, // 放る
        { transform: 'translateX(0) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        animateSpriteLayers(otherSide(side), [
            { transform: 'translate(0,0) rotate(0deg)', offset: 0 },
            { transform: `translate(${-throwDir * 14}px,-28px) rotate(-60deg)`, offset: 0.3 },
            { transform: `translate(${throwDir * 32}px,-12px) rotate(-260deg)`, offset: 0.62 },
            { transform: `translate(${throwDir * 14}px,12px) rotate(-350deg)`, offset: 0.85 },
            { transform: 'translate(0,0) rotate(-360deg)', offset: 1 }
        ], { duration: duration * 0.72, easing: 'ease-in-out' });
    }, duration * 0.26);

    setTimeout(() => {
        spawnImpactBurst(to.x, to.y + 16, { size: 40, duration: 420 * EFFECT_SPEED_MULTIPLIER });
        spawnCustomParticle('💨', to.x, to.y + 20, {
            size: 28, duration: 440 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.5)', opacity: 0.9, offset: 0.4 },
                { transform: 'translate(-50%,-50%) scale(2)', opacity: 0 }
            ]
        });
    }, duration * 0.8);
}
registerCustomSkillMotion('nagetobashi', playNagetobashiMotion, 'キジン');

// --- 鬼爪：鋭い爪で3本の爪痕を刻む ---
function playOnitsumeMotion(side) {
    const { impactAt, to } = playLungeMotion(side, { reach: 0.64, duration: 680 });
    if (!to) return;
    setTimeout(() => {
        spawnKijinClawMarks(to.x, to.y, { angle: -32, length: 108 });
        spawnImpactBurst(to.x, to.y, { size: 34, duration: 340 * EFFECT_SPEED_MULTIPLIER, color: KIJIN_ONI });
        playRecoilMotion(otherSide(side), { distance: 12, rotate: 9 });
    }, impactAt);
}
registerCustomSkillMotion('onitsume', playOnitsumeMotion, 'キジン');

// --- 鬼神乱舞：位置を変えながら爪と拳を叩き込む多段技 ---
function playKijinRanbuMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1200 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.7;
    const hits = 4;

    const kf = [{ transform: 'translate(0,0) rotate(0deg)', offset: 0 }];
    for (let i = 0; i < hits; i++) {
        const base = 0.16 + (i / hits) * 0.66;
        const oy = (i % 2 === 0) ? -20 : 16;
        kf.push({ transform: `translate(${travel * (i % 2 === 0 ? 1 : 0.84)}px,${oy}px) rotate(${i % 2 === 0 ? -14 : 12}deg)`, offset: base });
    }
    kf.push({ transform: 'translate(0,0) rotate(0deg)', offset: 1 });
    animateSpriteLayers(side, kf, { duration, easing: 'ease-in-out' });

    for (let i = 0; i < hits; i++) {
        setTimeout(() => {
            const oy = (i % 2 === 0) ? -16 : 14;
            if (i % 2 === 0) {
                spawnKijinClawMarks(to.x, to.y + oy, { angle: -38, length: 92, gap: 13, duration: 240 });
            } else {
                spawnSlashArc(to.x, to.y + oy, 38, { length: 96, width: 8, color: KIJIN_ONI, duration: 240 * EFFECT_SPEED_MULTIPLIER });
            }
            spawnImpactBurst(to.x, to.y + oy, { emoji: '💥', size: 24, duration: 260 * EFFECT_SPEED_MULTIPLIER });
        }, duration * (0.16 + (i / hits) * 0.66));
    }
    setTimeout(() => {
        spawnImpactBurst(to.x, to.y, { size: 40, duration: 380 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 14, rotate: 10 });
    }, duration * 0.86);
}
registerCustomSkillMotion('kijin_ranbu', playKijinRanbuMotion, 'キジン');

// --- 地裂斬：大地を叩き割り、裂け目が相手まで走る ---
function playChiretsuzanMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1150 * EFFECT_SPEED_MULTIPLIER;

    // 大きく振りかぶり、地面へ叩きつける
    animateSpriteLayers(side, [
        { transform: 'translateY(0) rotate(0deg)', offset: 0 },
        { transform: 'translateY(-12px) rotate(-20deg)', offset: 0.3 },
        { transform: 'translateY(-12px) rotate(-22deg)', offset: 0.42 },
        { transform: 'translateY(8px) rotate(16deg)', offset: 0.56 },  // 叩きつけ
        { transform: 'translateY(0) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        const groundY = Math.max(from.y, to.y) + 26;
        // 裂け目が地面を走る
        spawnBeamLine(from.x, groundY, to.x - from.x, 0, '#6b4a2f', 480 * EFFECT_SPEED_MULTIPLIER, 12);
        // 走った先で岩が突き上がる
        [0.4, 0.7, 1].forEach((t, i) => {
            const px = from.x + (to.x - from.x) * t;
            spawnCustomParticle('🪨', px, groundY, {
                size: 24, delay: i * 80, duration: 500 * EFFECT_SPEED_MULTIPLIER,
                keyframes: [
                    { transform: 'translate(-50%,-50%) translateY(18px) scale(0.4)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) translateY(-24px) scale(1.2) rotate(150deg)', opacity: 1, offset: 0.5 },
                    { transform: 'translate(-50%,-50%) translateY(0) scale(0.9) rotate(250deg)', opacity: 0 }
                ]
            });
        });
        setTimeout(() => {
            spawnSlashArc(to.x, to.y + 10, 88, { length: 130, width: 13, color: '#8a6a4a', duration: 320 * EFFECT_SPEED_MULTIPLIER });
            spawnImpactBurst(to.x, to.y + 8, { size: 44, duration: 420 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: 15, rotate: 11, duration: 560 });
        }, 320 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.54);
}
registerCustomSkillMotion('chiretsuzan', playChiretsuzanMotion, 'キジン');

// --- 鬼哭衝：鬼の慟哭が衝撃波となって襲いかかる ---
function playOnikokushouMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1080 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x;

    // 天を仰いで慟哭する
    animateSpriteLayers(side, [
        { transform: 'translateY(0) scale(1,1)', offset: 0 },
        { transform: 'translateY(-6px) scale(1.08,1.08)', offset: 0.28 },  // 吸い込む
        { transform: 'translateY(0) scale(0.94,0.96)', offset: 0.44 },     // 叫ぶ
        { transform: 'translateY(0) scale(1.02,1.01)', offset: 0.6 },
        { transform: 'translateY(0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-out' });

    // 怨念を帯びた衝撃波が押し寄せる
    for (let i = 0; i < 4; i++) {
        spawnCustomParticle('◯', from.x, from.y, {
            size: 46 + i * 6, delay: duration * 0.4 + i * 100, duration: 640 * EFFECT_SPEED_MULTIPLIER, color: KIJIN_CURSE,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.25)', opacity: 0 },
                { transform: `translate(${dx * 0.55}px,0) translate(-50%,-50%) scale(1.2)`, opacity: 0.9, offset: 0.5 },
                { transform: `translate(${dx}px,0) translate(-50%,-50%) scale(1.9)`, opacity: 0 }
            ]
        });
    }
    // 怨霊が相手に取り憑く
    setTimeout(() => {
        for (let i = 0; i < 3; i++) {
            const a = (Math.PI * 2 * i) / 3;
            spawnCustomParticle('👺', to.x, to.y - 14, {
                size: 22, delay: i * 90, duration: 640 * EFFECT_SPEED_MULTIPLIER, color: KIJIN_CURSE,
                keyframes: [
                    { transform: `translate(${Math.cos(a) * 22}px,${Math.sin(a) * 10}px) translate(-50%,-50%) scale(0.5)`, opacity: 0 },
                    { transform: `translate(${Math.cos(a + 2.1) * 24}px,${Math.sin(a + 2.1) * 11}px) translate(-50%,-50%) scale(1.1)`, opacity: 1, offset: 0.45 },
                    { transform: `translate(${Math.cos(a + 4.2) * 22}px,${Math.sin(a + 4.2) * 10}px) translate(-50%,-50%) scale(0.8)`, opacity: 0 }
                ]
            });
        }
        playRecoilMotion(otherSide(side), { distance: 12, rotate: 8 });
    }, duration * 0.68);
}
registerCustomSkillMotion('onikokushou', playOnikokushouMotion, 'キジン');

// --- 阿修羅：三面六臂の幻影を纏い、無数の腕で殴りつける ---
//   ※自己強化専用技ではなく、force2.2の攻撃技（命中後に次の攻撃力が上がる）。
//     多腕の幻影を出すだけでは効果と食い違うため、その腕で連打する部分を主役にしている。
function playAshuraMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const { x, y } = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1100 * EFFECT_SPEED_MULTIPLIER;

    // 多腕による連打（幻影が出そろった後に一斉に殴りかかる）
    for (let i = 0; i < 5; i++) {
        setTimeout(() => {
            const oy = (i - 2) * 14;
            spawnKijinClawMarks(to.x, to.y + oy, { angle: i % 2 === 0 ? -36 : 36, length: 92, gap: 12, duration: 230 });
            spawnImpactBurst(to.x, to.y + oy, { size: 24, duration: 250 * EFFECT_SPEED_MULTIPLIER, color: KIJIN_ONI });
        }, duration * (0.5 + i * 0.08));
    }
    setTimeout(() => {
        spawnImpactBurst(to.x, to.y, { size: 42, duration: 400 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 15, rotate: 11, duration: 560 });
    }, duration * 0.9);

    // 静かに構え、力を膨れ上がらせる
    animateSpriteLayers(side, [
        { transform: 'translateY(0) scale(1)', offset: 0 },
        { transform: 'translateY(-6px) scale(1.05)', offset: 0.35 },
        { transform: 'translateY(-6px) scale(1.06)', offset: 0.62 },
        { transform: 'translateY(0) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 多腕の幻影：左右にずれた残像を複数重ねる
    [-1, 1, -2, 2].forEach((dir, i) => {
        spawnCustomParticle('◤', x, y, {
            size: 36, delay: i * 110, duration: 720 * EFFECT_SPEED_MULTIPLIER, color: KIJIN_ONI,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 },
                { transform: `translate(${dir * 20}px,0) translate(-50%,-50%) scale(1)`, opacity: 0.5, offset: 0.45 },
                { transform: `translate(${dir * 30}px,0) translate(-50%,-50%) scale(0.95)`, opacity: 0 }
            ]
        });
    });
    // 立ち上る闘気
    spawnSelfParticleRing(casterEl, '💢', 6, 18, 780 * EFFECT_SPEED_MULTIPLIER, 40);
}
registerCustomSkillMotion('ashura', playAshuraMotion, 'キジン');

// --- 羅刹：鬼気を解き放ち、闇の刃で切り刻む ---
function playRasetsuMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1300 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.75;

    // 鬼気を溜めてから、掻き消えるような速さで斬りかかる
    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1)', opacity: 1, offset: 0 },
        { transform: 'translateX(0) scale(1.05)', opacity: 1, offset: 0.3 },      // 溜める
        { transform: 'translateX(0) scale(1.04)', opacity: 0.3, offset: 0.44 },   // 掻き消える
        { transform: `translateX(${travel}px) scale(1.05)`, opacity: 1, offset: 0.56 }, // 出現して斬る
        { transform: `translateX(${travel * 0.6}px) scale(1)`, opacity: 1, offset: 0.76 },
        { transform: 'translateX(0) scale(1)', opacity: 1, offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    spawnSelfParticleRing(casterEl, '🌑', 5, 18, 520 * EFFECT_SPEED_MULTIPLIER, 36);

    // 闇の斬撃を連続で浴びせる
    [0.56, 0.64, 0.72].forEach((at, i) => {
        setTimeout(() => {
            spawnSlashArc(to.x, to.y + (i - 1) * 14, i % 2 === 0 ? -40 : 40, {
                length: 120, width: 10, color: KIJIN_CURSE, duration: 280 * EFFECT_SPEED_MULTIPLIER
            });
            spawnImpactBurst(to.x, to.y + (i - 1) * 14, { size: 30, duration: 300 * EFFECT_SPEED_MULTIPLIER, color: KIJIN_CURSE });
        }, duration * at);
    });
    setTimeout(() => {
        spawnImpactBurst(to.x, to.y, { size: 46, duration: 440 * EFFECT_SPEED_MULTIPLIER, color: KIJIN_CURSE });
        playRecoilMotion(otherSide(side), { distance: 16, rotate: 12, duration: 580 });
    }, duration * 0.78);
}
registerCustomSkillMotion('rasetsu', playRasetsuMotion, 'キジン');

// --- 羅生門：異界の門を開き、鬼の軍勢もろとも叩きつける（キジン最大の大技） ---
function playRashomonMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1600 * EFFECT_SPEED_MULTIPLIER;

    // 最上位技として、他のどの技より長くためる
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) scale(1) rotate(0deg)', offset: 0 },
        { transform: 'translate(-2px,0) scale(1.04) rotate(-3deg)', offset: 0.14 },
        { transform: 'translate(2px,-4px) scale(1.08) rotate(3deg)', offset: 0.26 },  // 震える
        { transform: 'translate(-2px,-8px) scale(1.12) rotate(-4deg)', offset: 0.4 },
        { transform: 'translate(0,-8px) scale(1.14) rotate(0deg)', offset: 0.5 },      // 溜め切る
        { transform: 'translate(0,4px) scale(1.02) rotate(0deg)', offset: 0.64 },      // 解き放つ
        { transform: 'translate(0,0) scale(1) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // ための間、鬼気が渦を巻いて集まる
    for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8;
        const r = 68;
        spawnCustomParticle(i % 2 === 0 ? '💢' : '🌑', from.x + Math.cos(a) * r, from.y + Math.sin(a) * r * 0.7, {
            size: 22, delay: 80 + i * 60, duration: 540 * EFFECT_SPEED_MULTIPLIER, color: KIJIN_CURSE,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0.4 },
                { transform: `translate(${-Math.cos(a) * r}px,${-Math.sin(a) * r * 0.7}px) translate(-50%,-50%) scale(0.4)`, opacity: 0 }
            ]
        });
    }

    // 門が開く：相手の位置に巨大な門（多重の輪）が現れる
    setTimeout(() => {
        [KIJIN_CURSE, KIJIN_ONI, '#3a2a4a'].forEach((color, i) => {
            spawnCustomParticle('◯', to.x, to.y, {
                size: 78, delay: i * 110, duration: 780 * EFFECT_SPEED_MULTIPLIER, color,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.15) rotate(0deg)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.1) rotate(100deg)', opacity: 0.9, offset: 0.45 },
                    { transform: 'translate(-50%,-50%) scale(1.7) rotate(200deg)', opacity: 0 }
                ]
            });
        });
    }, duration * 0.5);

    // 門から鬼の軍勢が押し寄せ、最後に断ち切る
    setTimeout(() => {
        for (let i = 0; i < 5; i++) {
            const a = (Math.PI * 2 * i) / 5;
            spawnCustomParticle('👹', to.x, to.y, {
                size: 24, delay: i * 60, duration: 620 * EFFECT_SPEED_MULTIPLIER, color: KIJIN_ONI,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                    { transform: `translate(${Math.cos(a) * 40}px,${Math.sin(a) * 32}px) translate(-50%,-50%) scale(1.2)`, opacity: 1, offset: 0.45 },
                    { transform: `translate(${Math.cos(a) * 70}px,${Math.sin(a) * 56}px) translate(-50%,-50%) scale(0.6)`, opacity: 0 }
                ]
            });
        }
        // 締めの一閃（十字）
        spawnSlashArc(to.x, to.y, 90, { length: 170, width: 18, color: '#ffffff', duration: 420 * EFFECT_SPEED_MULTIPLIER });
        setTimeout(() => spawnSlashArc(to.x, to.y, 0, { length: 150, width: 14, color: KIJIN_ONI, duration: 380 * EFFECT_SPEED_MULTIPLIER }), 110);
        spawnImpactBurst(to.x, to.y, { size: 56, duration: 540 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 20, rotate: 15, duration: 660 });
    }, duration * 0.66);
}
registerCustomSkillMotion('rashomon', playRashomonMotion, 'キジン');
