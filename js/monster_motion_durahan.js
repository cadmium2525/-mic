// =====================================================
// monster_motion_durahan.js
// デュラハン専用のバトルモーション演出。
//
// デュラハンの特徴（＝演出の軸）：
//   ・重厚な鎧の剣士 → 動きは「ためて、鋭く一閃し、残心」というリズムで見せる
//   ・大剣           → 斬撃は太く長い軌跡（spawnSlashArc）を主役にする
//   ・属性剣技       → 風神剣は緑の風、雷神剣は黄の雷で色分けする
//   ・最終奥義       → 全技中もっとも長くためて、決め手として最大級に見せる
//
// 対応技：超ダッシュ斬り／剣舞／乱れ突き／まっぷたつ／コンボパンチ／大車輪／風神剣／雷神剣／最終奥義
// =====================================================

const DURAHAN_BLADE_COLOR = '#dbeafe'; // 鋼の刃の色（基本の斬撃）

// --- 超ダッシュ斬り：相手をすれ違うように駆け抜けながら斬る ---
function playChoDashGiriMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 720 * EFFECT_SPEED_MULTIPLIER;
    const through = (to.x - from.x) * 1.15; // 相手を通り抜ける位置まで踏み込む

    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1)', offset: 0 },
        { transform: `translateX(${-through * 0.1}px) scale(0.95)`, offset: 0.18 },  // ためる
        { transform: `translateX(${through}px) scale(1.04)`, offset: 0.5 },          // 駆け抜ける
        { transform: `translateX(${through}px) scale(1.04)`, offset: 0.64 },         // 残心
        { transform: 'translateX(0) scale(1)', offset: 1 }                            // 戻る
    ], { duration, easing: 'ease-in-out' });

    // すれ違った瞬間に一閃
    setTimeout(() => {
        spawnSlashArc(to.x, to.y, -28, { length: 130, width: 9, color: DURAHAN_BLADE_COLOR, duration: 300 * EFFECT_SPEED_MULTIPLIER });
        spawnImpactBurst(to.x, to.y, { size: 32, duration: 340 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 11, rotate: 8 });
    }, duration * 0.46);
}
registerCustomSkillMotion('cho_dash_giri', playChoDashGiriMotion, 'デュラハン');

// --- 剣舞：自己強化。剣を舞うように振り、闘気を高める ---
function playKenbuMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    if (!casterEl) return;
    const { x, y } = getElCenter(casterEl);
    const duration = 900 * EFFECT_SPEED_MULTIPLIER;

    // 左右に舞うように身を切り返す
    animateSpriteLayers(side, [
        { transform: 'rotate(0deg) scale(1)', offset: 0 },
        { transform: 'rotate(-12deg) scale(1.03)', offset: 0.22 },
        { transform: 'rotate(12deg) scale(1.03)', offset: 0.48 },
        { transform: 'rotate(-8deg) scale(1.02)', offset: 0.72 },
        { transform: 'rotate(0deg) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 自分の周りに剣の軌跡を複数、角度を変えて走らせる
    [-40, 25, -15, 55].forEach((angle, i) => {
        setTimeout(() => {
            spawnSlashArc(x, y, angle, { length: 96, width: 7, color: DURAHAN_BLADE_COLOR, duration: 320 * EFFECT_SPEED_MULTIPLIER });
        }, i * 180 * EFFECT_SPEED_MULTIPLIER);
    });
    // 高まる闘気
    spawnSelfParticleRing(casterEl, '✨', 6, 17, 780 * EFFECT_SPEED_MULTIPLIER, 40);
}
registerCustomSkillMotion('kenbu', playKenbuMotion, 'デュラハン');

// --- 乱れ突き：細かい刺突を連続で浴びせる ---
function playMidaretsukiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 980 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.5;
    const thrustDir = (to.x - from.x) > 0 ? 1 : -1;

    // 小刻みに突き込む（前後の細かい往復を繰り返す）
    const kf = [{ transform: 'translateX(0)', offset: 0 }];
    const thrusts = 5;
    for (let i = 0; i < thrusts; i++) {
        const base = 0.15 + (i / thrusts) * 0.7;
        kf.push({ transform: `translateX(${travel}px)`, offset: base });
        kf.push({ transform: `translateX(${travel * 0.72}px)`, offset: base + 0.055 });
    }
    kf.push({ transform: 'translateX(0)', offset: 1 });
    animateSpriteLayers(side, kf, { duration, easing: 'linear' });

    // 突きの本数だけ、少しずつ位置をずらして刺突エフェクトを出す
    for (let i = 0; i < thrusts; i++) {
        setTimeout(() => {
            const oy = (Math.random() - 0.5) * 28;
            spawnSlashArc(to.x - thrustDir * 6, to.y + oy, 0, { length: 62, width: 6, color: DURAHAN_BLADE_COLOR, duration: 220 * EFFECT_SPEED_MULTIPLIER });
            spawnImpactBurst(to.x, to.y + oy, { emoji: '✨', size: 20, duration: 260 * EFFECT_SPEED_MULTIPLIER, color: '#dbeafe' });
        }, duration * (0.15 + (i / thrusts) * 0.7));
    }
    setTimeout(() => playRecoilMotion(otherSide(side), { distance: 7, rotate: 4 }), duration * 0.8);
}
registerCustomSkillMotion('midaretsuki', playMidaretsukiMotion, 'デュラハン');

// --- まっぷたつ：大きく振りかぶり、渾身の縦一閃で断ち切る ---
function playMappufutatsuMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1050 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.62;

    // たっぷりためて、一気に振り下ろす（一撃の重さを出すため、ためを長く取る）
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) rotate(0deg) scale(1)', offset: 0 },
        { transform: 'translate(0,-8px) rotate(-20deg) scale(1.05)', offset: 0.34 },   // 大きく振りかぶる
        { transform: 'translate(0,-8px) rotate(-22deg) scale(1.05)', offset: 0.44 },   // 溜め切る
        { transform: `translate(${travel}px,4px) rotate(16deg) scale(1.02)`, offset: 0.6 }, // 振り下ろす
        { transform: 'translate(0,0) rotate(0deg) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // ための間、刃に力が集まる
    for (let i = 0; i < 3; i++) {
        spawnCustomParticle('✦', from.x, from.y - 20, {
            size: 22, delay: 120 + i * 110, duration: 420 * EFFECT_SPEED_MULTIPLIER, color: '#dbeafe',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 1, offset: 0.5 },
                { transform: 'translate(-50%,-50%) scale(0.6)', opacity: 0 }
            ]
        });
    }

    // 断ち切る：縦一閃を一本だけ、太く長く見せる
    setTimeout(() => {
        spawnSlashArc(to.x, to.y, 90, { length: 150, width: 14, color: '#ffffff', duration: 380 * EFFECT_SPEED_MULTIPLIER });
        spawnImpactBurst(to.x, to.y, { size: 40, duration: 420 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 14, rotate: 11, duration: 520 });
    }, duration * 0.56);
}
registerCustomSkillMotion('mappufutatsu', playMappufutatsuMotion, 'デュラハン');

// --- コンボパンチ：剣を使わず、籠手による連打を叩き込む ---
function playComboPunchMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 900 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.55;

    // 左右の拳を交互に打ち込むイメージで、体を小さく振りながら3連打
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) rotate(0deg)', offset: 0 },
        { transform: `translate(${travel}px,-4px) rotate(-6deg)`, offset: 0.24 },
        { transform: `translate(${travel * 0.8}px,2px) rotate(5deg)`, offset: 0.38 },
        { transform: `translate(${travel}px,-4px) rotate(-5deg)`, offset: 0.52 },
        { transform: `translate(${travel * 0.8}px,2px) rotate(4deg)`, offset: 0.64 },
        { transform: `translate(${travel * 1.05}px,-6px) rotate(-8deg)`, offset: 0.78 }, // 決めの一発
        { transform: 'translate(0,0) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    [[0.24, 26], [0.52, 26], [0.78, 36]].forEach(([at, size], i) => {
        setTimeout(() => {
            const oy = (i - 1) * 12;
            spawnImpactBurst(to.x, to.y + oy, { size, duration: 300 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: i === 2 ? 12 : 7, rotate: i === 2 ? 9 : 5, duration: 340 });
        }, duration * at);
    });
}
registerCustomSkillMotion('combo_punch', playComboPunchMotion, 'デュラハン');

// --- 大車輪：全身を大きく回転させ、剣を車輪のように振り回す ---
function playDaisharinMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 920 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.7;

    // 回転しながら相手へ寄り、回りきってから戻る
    animateSpriteLayers(side, [
        { transform: 'translateX(0) rotate(0deg)', offset: 0 },
        { transform: `translateX(${travel * 0.3}px) rotate(220deg)`, offset: 0.35 },
        { transform: `translateX(${travel}px) rotate(560deg)`, offset: 0.66 },
        { transform: `translateX(${travel * 0.6}px) rotate(720deg)`, offset: 0.82 },
        { transform: 'translateX(0) rotate(720deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 車輪の軌跡として、角度を回しながら斬撃を連続で出す
    for (let i = 0; i < 4; i++) {
        setTimeout(() => {
            spawnSlashArc(to.x, to.y, i * 45 - 20, { length: 116, width: 8, color: DURAHAN_BLADE_COLOR, duration: 280 * EFFECT_SPEED_MULTIPLIER });
        }, duration * (0.4 + i * 0.09));
    }
    setTimeout(() => {
        spawnImpactBurst(to.x, to.y, { size: 36, duration: 380 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 12, rotate: 9 });
    }, duration * 0.66);
}
registerCustomSkillMotion('daisharin', playDaisharinMotion, 'デュラハン');

// --- 風神剣：刃に風を纏わせ、緑の風刃を飛ばす ---
function playFujinkenMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 900 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    // 構えて、風を纏い、振り抜く
    animateSpriteLayers(side, [
        { transform: 'rotate(0deg) scale(1)', offset: 0 },
        { transform: 'rotate(-16deg) scale(1.04)', offset: 0.3 },
        { transform: 'rotate(14deg) scale(1.02)', offset: 0.48 },
        { transform: 'rotate(0deg) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 刃に集まる風
    spawnSelfParticleRing(casterEl, '🌀', 4, 18, 420 * EFFECT_SPEED_MULTIPLIER, 30);

    // 三日月状の風刃が3枚、少しずつずれて飛ぶ
    for (let i = 0; i < 3; i++) {
        const off = (i - 1) * 20;
        spawnCustomParticle('🌀', from.x, from.y + off * 0.5, {
            size: 26, delay: duration * 0.42 + i * 70, duration: 520 * EFFECT_SPEED_MULTIPLIER, color: '#8ce8a8',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4) rotate(0deg)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px, ${dy * 0.5 + off}px) translate(-50%,-50%) scale(1.1) rotate(240deg)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${dx}px, ${dy + off}px) translate(-50%,-50%) scale(0.9) rotate(480deg)`, opacity: 0 }
            ]
        });
    }
    setTimeout(() => {
        spawnSlashArc(to.x, to.y, -20, { length: 112, width: 9, color: '#8ce8a8', duration: 300 * EFFECT_SPEED_MULTIPLIER });
        spawnImpactBurst(to.x, to.y, { emoji: '💨', size: 32, duration: 360 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 10, rotate: 7 });
    }, duration * 0.78);
}
registerCustomSkillMotion('fujinken', playFujinkenMotion, 'デュラハン');

// --- 雷神剣：刃に雷を集め、落雷とともに斬りつける ---
function playRaijinkenMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 940 * EFFECT_SPEED_MULTIPLIER;

    // 剣を高く掲げて雷を集め、振り下ろす
    animateSpriteLayers(side, [
        { transform: 'translateY(0) rotate(0deg)', offset: 0 },
        { transform: 'translateY(-8px) rotate(-18deg)', offset: 0.34 }, // 掲げる
        { transform: 'translateY(-8px) rotate(-20deg)', offset: 0.46 },
        { transform: 'translateY(2px) rotate(14deg)', offset: 0.62 },   // 振り下ろす
        { transform: 'translateY(0) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 刃に集まる雷
    for (let i = 0; i < 4; i++) {
        spawnCustomParticle('⚡', from.x + (Math.random() - 0.5) * 30, from.y - 24 + (Math.random() - 0.5) * 16, {
            size: 20, delay: 100 + i * 90, duration: 380 * EFFECT_SPEED_MULTIPLIER, color: '#ffe066',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 1, offset: 0.45 },
                { transform: 'translate(-50%,-50%) scale(0.7)', opacity: 0 }
            ]
        });
    }

    // 落雷：相手の真上から一直線に雷が落ちる
    setTimeout(() => {
        spawnBeamLine(to.x, to.y - 150, 0, 150, '#ffe066', 420 * EFFECT_SPEED_MULTIPLIER, 11);
        spawnSlashArc(to.x, to.y, 78, { length: 120, width: 10, color: '#fff3b0', duration: 300 * EFFECT_SPEED_MULTIPLIER });
        for (let i = 0; i < 3; i++) {
            spawnCustomParticle('⚡', to.x + (Math.random() - 0.5) * 40, to.y + (Math.random() - 0.5) * 30, {
                size: 24, delay: i * 55, duration: 360 * EFFECT_SPEED_MULTIPLIER, color: '#ffe066',
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 1, offset: 0.4 },
                    { transform: 'translate(-50%,-50%) scale(0.8)', opacity: 0 }
                ]
            });
        }
        spawnImpactBurst(to.x, to.y, { size: 36, duration: 380 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 12, rotate: 9 });
    }, duration * 0.58);
}
registerCustomSkillMotion('raijinken', playRaijinkenMotion, 'デュラハン');

// --- 最終奥義：デュラハン渾身の大技。全技中もっとも長くためて、最大級の一撃で決める ---
function playSaigoOugiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1500 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.72;

    // ①長いため（震えながら力を溜める）→ ②踏み込み → ③特大の振り下ろし → ④残心
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) rotate(0deg) scale(1)', offset: 0 },
        { transform: 'translate(-2px,0) rotate(-6deg) scale(1.03)', offset: 0.14 },
        { transform: 'translate(2px,-4px) rotate(-14deg) scale(1.07)', offset: 0.26 },
        { transform: 'translate(-2px,-6px) rotate(-24deg) scale(1.1)', offset: 0.4 },  // 溜め切る
        { transform: 'translate(0,-6px) rotate(-26deg) scale(1.12)', offset: 0.5 },
        { transform: `translate(${travel}px,6px) rotate(20deg) scale(1.04)`, offset: 0.66 }, // 振り下ろす
        { transform: `translate(${travel * 0.7}px,0) rotate(6deg) scale(1)`, offset: 0.82 }, // 残心
        { transform: 'translate(0,0) rotate(0deg) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // ための間、闘気が渦を巻いて集まってくる（外側から内側へ）
    for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8;
        const r = 66;
        spawnCustomParticle(i % 2 === 0 ? '✦' : '✨', from.x + Math.cos(angle) * r, from.y + Math.sin(angle) * r * 0.7, {
            size: 22, delay: 80 + i * 65, duration: 520 * EFFECT_SPEED_MULTIPLIER, color: '#ffd76a',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0.4 },
                { transform: `translate(${-Math.cos(angle) * r}px, ${-Math.sin(angle) * r * 0.7}px) translate(-50%,-50%) scale(0.4)`, opacity: 0 }
            ]
        });
    }
    // 溜め切った瞬間の閃光
    setTimeout(() => {
        spawnCustomParticle('✦', from.x, from.y - 16, {
            size: 60, duration: 420 * EFFECT_SPEED_MULTIPLIER, color: '#fff3b0',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.7)', opacity: 1, offset: 0.4 },
                { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 0 }
            ]
        });
    }, duration * 0.46);

    // 一撃：極太の縦一閃 ＋ 十字に走る追撃の斬撃
    setTimeout(() => {
        spawnSlashArc(to.x, to.y, 90, { length: 185, width: 20, color: '#ffffff', duration: 460 * EFFECT_SPEED_MULTIPLIER });
        setTimeout(() => {
            spawnSlashArc(to.x, to.y, 0, { length: 165, width: 14, color: '#ffd76a', duration: 400 * EFFECT_SPEED_MULTIPLIER });
        }, 110 * EFFECT_SPEED_MULTIPLIER);
        spawnImpactBurst(to.x, to.y, { size: 52, duration: 520 * EFFECT_SPEED_MULTIPLIER });
        for (let i = 0; i < 5; i++) {
            const a = (Math.PI * 2 * i) / 5;
            spawnCustomParticle('✨', to.x + Math.cos(a) * 28, to.y + Math.sin(a) * 22, {
                size: 24, delay: i * 45, duration: 460 * EFFECT_SPEED_MULTIPLIER, color: '#ffd76a',
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                    { transform: `translate(${Math.cos(a) * 34}px, ${Math.sin(a) * 26}px) translate(-50%,-50%) scale(1.2)`, opacity: 1, offset: 0.45 },
                    { transform: `translate(${Math.cos(a) * 56}px, ${Math.sin(a) * 44}px) translate(-50%,-50%) scale(0.7)`, opacity: 0 }
                ]
            });
        }
        playRecoilMotion(otherSide(side), { distance: 18, rotate: 14, duration: 640 });
    }, duration * 0.62);
}
registerCustomSkillMotion('saigo_ougi', playSaigoOugiMotion, 'デュラハン');
