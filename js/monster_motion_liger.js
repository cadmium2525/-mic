// =====================================================
// monster_motion_liger.js
// ライガー専用のバトルモーション演出。
//
// ライガーの特徴（＝演出の軸）：
//   ・獣の爪と牙   → ひっかき・かみつきは、素早い踏み込みと3本の爪痕／上下の牙で見せる
//   ・雷を纏う     → 雷撃系は黄色の電撃。技の格に応じて規模を明確に変える
//   ・冷気も操る   → 冷気弾だけは水色。同じ飛び道具でも雷と色で描き分ける
//   ・俊敏な四足獣 → 移動は低く速く。ためを短くし、跳ねるような軌道にする
//
// ★雷技の格付け（見た目で段階が分かるようにしている）：
//     雷撃       … 単発の落雷
//     超雷撃     … 太い落雷＋周囲に放電
//     雷神剣     … 雷を刃に纏わせた近接技（デュラハンの同名技とは別物として、獣らしく爪で振るう）
//     落雷共鳴   … 複数の落雷が連鎖して共鳴する最大技
//
// 対応技：ひっかき／かみつき／体当たり／雷撃／ワンツー／冷気弾／影撃／超雷撃／
//         空中回転アタック／コンビネーション／雷神剣／落雷共鳴
// =====================================================

const LIGER_THUNDER = '#ffe066'; // 雷の黄
const LIGER_FROST = '#a8e8ff';   // 冷気の水色
const LIGER_SHADOW = '#7a6a9b';  // 影撃の暗紫

// --- ライガー共通：落雷を1本落とす（雷技の規模差はこの引数で作る） ---
function spawnLigerBolt(x, y, opts = {}) {
    const { width = 12, height = 140, duration = 420, sparks = 3, color = LIGER_THUNDER } = opts;
    spawnBeamLine(x, y - height, 0, height, color, duration * EFFECT_SPEED_MULTIPLIER, width);
    for (let i = 0; i < sparks; i++) {
        spawnCustomParticle('⚡', x + (Math.random() - 0.5) * 44, y + (Math.random() - 0.5) * 34, {
            size: 22, delay: i * 55, duration: 360 * EFFECT_SPEED_MULTIPLIER, color,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.25)', opacity: 1, offset: 0.4 },
                { transform: 'translate(-50%,-50%) scale(0.8)', opacity: 0 }
            ]
        });
    }
}

// --- ひっかき：素早く踏み込み、3本の爪痕を刻む ---
function playLigerHikkakiMotion(side) {
    const { impactAt, to } = playLungeMotion(side, { reach: 0.64, duration: 580 });
    if (!to) return;
    setTimeout(() => {
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                spawnSlashArc(to.x + (i - 1) * 6, to.y + (i - 1) * 15, -34, {
                    length: 100, width: 7, color: '#ffd9a0', duration: 250 * EFFECT_SPEED_MULTIPLIER
                });
            }, i * 40);
        }
        spawnImpactBurst(to.x, to.y, { size: 32, duration: 320 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 11, rotate: 8 });
    }, impactAt);
}
registerCustomSkillMotion('liger_hikkaki', playLigerHikkakiMotion, 'ライガー');

// --- かみつき：獣らしく食らいつく（スエゾー・ディノの同名技とは別物として、俊敏さで差をつける） ---
function playLigerKamitsukiMotion(side) {
    const { impactAt, to } = playLungeMotion(side, { reach: 0.7, duration: 560, scaleHit: 1.08 });
    if (!to) return;
    setTimeout(() => {
        [-1, 1].forEach((dir, i) => {
            spawnCustomParticle('🦷', to.x, to.y + dir * 18, {
                size: 24, delay: i * 25, duration: 340 * EFFECT_SPEED_MULTIPLIER,
                keyframes: [
                    { transform: `translate(-50%,-50%) translateY(${dir * 18}px) scale(0.5) rotate(${dir * 22}deg)`, opacity: 0 },
                    { transform: 'translate(-50%,-50%) translateY(0) scale(1.2) rotate(0deg)', opacity: 1, offset: 0.45 },
                    { transform: 'translate(-50%,-50%) translateY(0) scale(1)', opacity: 0 }
                ]
            });
        });
        spawnImpactBurst(to.x, to.y, { size: 34, duration: 340 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 12, rotate: 8 });
    }, impactAt);
}
registerCustomSkillMotion('liger_kamitsuki', playLigerKamitsukiMotion, 'ライガー');

// --- 体当たり：低い姿勢で加速して突っ込む ---
function playLigerBodySlamMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 780 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.82;

    // 四足獣らしく、沈み込んでから低く速く走る
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) scale(1,1)', offset: 0 },
        { transform: 'translate(0,6px) scale(1.08,0.9)', offset: 0.18 },              // 沈む
        { transform: `translate(${travel}px,2px) scale(1.1,0.96)`, offset: 0.5 },      // 突撃
        { transform: `translate(${travel}px,0) scale(1.05,1)`, offset: 0.62 },
        { transform: 'translate(0,0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 走った跡の砂ぼこり
    for (let i = 0; i < 3; i++) {
        spawnCustomParticle('💨', from.x + (to.x - from.x) * (i / 4), from.y + 16, {
            size: 20, delay: duration * 0.22 + i * 55, duration: 400 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 0.8, offset: 0.4 },
                { transform: 'translate(-14px,-8px) translate(-50%,-50%) scale(1.5)', opacity: 0 }
            ]
        });
    }
    setTimeout(() => {
        spawnImpactBurst(to.x, to.y, { size: 38, duration: 380 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 14, rotate: 10 });
    }, duration * 0.5);
}
registerCustomSkillMotion('body_slam', playLigerBodySlamMotion, 'ライガー');

// --- 雷撃：単発の落雷を落とす（雷系の基本形） ---
function playRaigekiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const duration = 880 * EFFECT_SPEED_MULTIPLIER;

    // 吠えて雷を呼ぶ
    animateSpriteLayers(side, [
        { transform: 'translateY(0) scale(1,1)', offset: 0 },
        { transform: 'translateY(-6px) scale(1.06,1.04)', offset: 0.28 },
        { transform: 'translateY(0) scale(0.96,0.98)', offset: 0.44 },
        { transform: 'translateY(0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-out' });
    spawnSelfParticleRing(casterEl, '⚡', 3, 17, 400 * EFFECT_SPEED_MULTIPLIER, 30);

    setTimeout(() => {
        spawnLigerBolt(to.x, to.y, { width: 12, sparks: 3 });
        spawnImpactBurst(to.x, to.y, { size: 36, duration: 380 * EFFECT_SPEED_MULTIPLIER, color: LIGER_THUNDER });
        playRecoilMotion(otherSide(side), { distance: 11, rotate: 8 });
    }, duration * 0.48);
}
registerCustomSkillMotion('raigeki', playRaigekiMotion, 'ライガー');

// --- 超雷撃：極太の落雷＋周囲への放電（雷撃の強化版として規模を明確に上げる） ---
function playChoRaigekiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const duration = 1150 * EFFECT_SPEED_MULTIPLIER;

    // ためを長く取り、全身が帯電する
    animateSpriteLayers(side, [
        { transform: 'translateY(0) scale(1,1)', offset: 0 },
        { transform: 'translateY(-4px) scale(1.04,1.04)', offset: 0.2 },
        { transform: 'translateY(-8px) scale(1.1,1.08)', offset: 0.42 },
        { transform: 'translateY(0) scale(0.95,0.97)', offset: 0.58 },
        { transform: 'translateY(0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-out' });
    spawnSelfParticleRing(casterEl, '⚡', 6, 19, 620 * EFFECT_SPEED_MULTIPLIER, 38);

    setTimeout(() => {
        spawnLigerBolt(to.x, to.y, { width: 22, height: 160, duration: 520, sparks: 6 });
        // 地面を走る放電
        for (let i = 0; i < 4; i++) {
            const dir = i % 2 === 0 ? -1 : 1;
            spawnCustomParticle('⚡', to.x, to.y + 18, {
                size: 22, delay: i * 50, duration: 440 * EFFECT_SPEED_MULTIPLIER, color: LIGER_THUNDER,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                    { transform: `translate(${dir * 34}px,0) translate(-50%,-50%) scale(1.1)`, opacity: 1, offset: 0.45 },
                    { transform: `translate(${dir * 58}px,4px) translate(-50%,-50%) scale(0.7)`, opacity: 0 }
                ]
            });
        }
        spawnImpactBurst(to.x, to.y, { size: 48, duration: 460 * EFFECT_SPEED_MULTIPLIER, color: LIGER_THUNDER });
        playRecoilMotion(otherSide(side), { distance: 16, rotate: 12, duration: 580 });
    }, duration * 0.56);
}
registerCustomSkillMotion('cho_raigeki', playChoRaigekiMotion, 'ライガー');

// --- 雷神剣：雷を爪に纏わせて斬りつける（デュラハンの同名技とは別物。剣ではなく獣の爪で振るう） ---
function playLigerRaijinkenMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    if (!casterEl) return;
    spawnSelfParticleRing(casterEl, '⚡', 4, 18, 420 * EFFECT_SPEED_MULTIPLIER, 30);
    const { impactAt, to } = playLungeMotion(side, { reach: 0.68, duration: 820, scaleHit: 1.06 });
    if (!to) return;
    setTimeout(() => {
        // 雷を纏った爪痕（3本を電撃色で）
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                spawnSlashArc(to.x + (i - 1) * 6, to.y + (i - 1) * 16, -30, {
                    length: 118, width: 9, color: LIGER_THUNDER, duration: 270 * EFFECT_SPEED_MULTIPLIER
                });
            }, i * 45);
        }
        spawnLigerBolt(to.x, to.y, { width: 10, height: 90, duration: 340, sparks: 3 });
        spawnImpactBurst(to.x, to.y, { size: 42, duration: 420 * EFFECT_SPEED_MULTIPLIER, color: LIGER_THUNDER });
        playRecoilMotion(otherSide(side), { distance: 14, rotate: 10 });
    }, impactAt);
}
registerCustomSkillMotion('liger_raijinken', playLigerRaijinkenMotion, 'ライガー');

// --- 落雷共鳴：複数の落雷が連鎖して共鳴する（ライガー最大の雷技） ---
function playRakuraiKyoumeiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1550 * EFFECT_SPEED_MULTIPLIER;

    // 最上位技として最も長くためる（全身が激しく帯電して震える）
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) scale(1,1)', offset: 0 },
        { transform: 'translate(-2px,0) scale(1.04,1.04)', offset: 0.14 },
        { transform: 'translate(2px,-4px) scale(1.08,1.08)', offset: 0.28 },
        { transform: 'translate(-2px,-6px) scale(1.14,1.12)', offset: 0.44 },
        { transform: 'translate(0,-6px) scale(1.16,1.14)', offset: 0.54 },
        { transform: 'translate(0,2px) scale(0.96,0.98)', offset: 0.66 },
        { transform: 'translate(0,0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });
    spawnSelfParticleRing(casterEl, '⚡', 8, 20, 800 * EFFECT_SPEED_MULTIPLIER, 44);

    // 空に雷雲が集まる
    for (let i = 0; i < 3; i++) {
        spawnCustomParticle('☁️', to.x + (i - 1) * 26, to.y - 110, {
            size: 30, delay: duration * 0.3 + i * 100, duration: 720 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 0.9, offset: 0.35 },
                { transform: 'translate(-50%,-50%) scale(1.05)', opacity: 0.9, offset: 0.7 },
                { transform: 'translate(-50%,-50%) scale(0.9)', opacity: 0 }
            ]
        });
    }

    // 連鎖する落雷：位置と大きさをずらしながら次々に落ち、最後に本命が落ちる
    const strikes = [
        { ox: -34, delay: 0.6, width: 12, size: 32 },
        { ox: 32, delay: 0.66, width: 12, size: 32 },
        { ox: -14, delay: 0.72, width: 14, size: 36 },
        { ox: 0, delay: 0.82, width: 26, size: 58 }   // 本命
    ];
    strikes.forEach((s, i) => {
        setTimeout(() => {
            spawnLigerBolt(to.x + s.ox, to.y, {
                width: s.width, height: i === 3 ? 175 : 145,
                duration: i === 3 ? 560 : 400, sparks: i === 3 ? 7 : 3
            });
            spawnImpactBurst(to.x + s.ox, to.y, { size: s.size, duration: 420 * EFFECT_SPEED_MULTIPLIER, color: LIGER_THUNDER });
            if (i === 3) {
                // 共鳴：最後の一撃で光の環が広がる
                spawnCustomParticle('◯', to.x, to.y, {
                    size: 86, duration: 620 * EFFECT_SPEED_MULTIPLIER, color: LIGER_THUNDER,
                    keyframes: [
                        { transform: 'translate(-50%,-50%) scale(0.1)', opacity: 0 },
                        { transform: 'translate(-50%,-50%) scale(1.8)', opacity: 1, offset: 0.3 },
                        { transform: 'translate(-50%,-50%) scale(3.2)', opacity: 0 }
                    ]
                });
                playRecoilMotion(otherSide(side), { distance: 20, rotate: 15, duration: 660 });
            }
        }, duration * s.delay);
    });
}
registerCustomSkillMotion('rakurai_kyoumei', playRakuraiKyoumeiMotion, 'ライガー');

// --- ワンツー：前足で素早く2連打 ---
function playLigerOneTwoMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 660 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.55;

    animateSpriteLayers(side, [
        { transform: 'translate(0,0) rotate(0deg)', offset: 0 },
        { transform: `translate(${travel}px,-6px) rotate(-7deg)`, offset: 0.26 },
        { transform: `translate(${travel * 0.7}px,2px) rotate(4deg)`, offset: 0.42 },
        { transform: `translate(${travel * 1.05}px,-4px) rotate(-8deg)`, offset: 0.62 },
        { transform: 'translate(0,0) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    [[0.26, -10, 26], [0.62, 8, 34]].forEach(([at, oy, size], i) => {
        setTimeout(() => {
            spawnImpactBurst(to.x, to.y + oy, { size, duration: 300 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: i === 1 ? 11 : 7, rotate: i === 1 ? 8 : 5, duration: 320 });
        }, duration * at);
    });
}
registerCustomSkillMotion('one_two', playLigerOneTwoMotion, 'ライガー');

// --- 冷気弾：凍てつく息を吐き出す（雷とは別系統として水色で描き分ける） ---
function playReikidanMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 920 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x, dy = to.y - from.y;

    // 息を吸って、一気に吐く
    animateSpriteLayers(side, [
        { transform: 'scale(1,1)', offset: 0 },
        { transform: 'scale(1.08,1.06)', offset: 0.26 },
        { transform: 'scale(0.94,0.96)', offset: 0.42 },
        { transform: 'scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-out' });

    // 冷気が扇状に広がって届く
    for (let i = 0; i < 5; i++) {
        const spread = (i - 2) * 14;
        spawnCustomParticle('❄️', from.x, from.y, {
            size: 20 + Math.random() * 8, delay: duration * 0.34 + i * 55,
            duration: 560 * EFFECT_SPEED_MULTIPLIER, color: LIGER_FROST,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4) rotate(0deg)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px,${dy * 0.5 + spread * 0.5}px) translate(-50%,-50%) scale(1.1) rotate(180deg)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${dx}px,${dy + spread}px) translate(-50%,-50%) scale(0.9) rotate(360deg)`, opacity: 0 }
            ]
        });
    }
    setTimeout(() => {
        // 凍りついて動きが鈍る
        animateSpriteLayers(otherSide(side), [
            { transform: 'scale(1,1)', offset: 0 },
            { transform: 'scale(0.96,1.03)', offset: 0.35 },
            { transform: 'scale(1,1)', offset: 1 }
        ], { duration: 560 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-out' });
        spawnImpactBurst(to.x, to.y, { emoji: '❄️', size: 38, duration: 440 * EFFECT_SPEED_MULTIPLIER, color: LIGER_FROST });
        playRecoilMotion(otherSide(side), { distance: 10, rotate: 7 });
    }, duration * 0.66);
}
registerCustomSkillMotion('reikidan', playReikidanMotion, 'ライガー');

// --- 影撃：影に潜り、死角から一撃を入れる ---
function playKagegekiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 880 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.8;

    // 地面に沈み込むように消えて、相手の足元から現れる
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) scale(1,1)', opacity: 1, offset: 0 },
        { transform: 'translate(0,10px) scale(1.15,0.5)', opacity: 0.35, offset: 0.24 },  // 影に潜る
        { transform: `translate(${travel}px,10px) scale(1.15,0.5)`, opacity: 0.2, offset: 0.42 },
        { transform: `translate(${travel}px,0) scale(1.05,1.05)`, opacity: 1, offset: 0.54 }, // 飛び出す
        { transform: 'translate(0,0) scale(1,1)', opacity: 1, offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 移動中の影
    spawnCustomParticle('◯', (from.x + to.x) / 2, to.y + 22, {
        size: 44, delay: duration * 0.26, duration: 400 * EFFECT_SPEED_MULTIPLIER, color: '#000000',
        keyframes: [
            { transform: 'translate(-50%,-50%) scale(0.4) scaleY(0.3)', opacity: 0 },
            { transform: 'translate(-50%,-50%) scale(1.1) scaleY(0.35)', opacity: 0.55, offset: 0.5 },
            { transform: 'translate(-50%,-50%) scale(1.3) scaleY(0.4)', opacity: 0 }
        ]
    });

    setTimeout(() => {
        spawnSlashArc(to.x, to.y, 62, { length: 110, width: 9, color: LIGER_SHADOW, duration: 280 * EFFECT_SPEED_MULTIPLIER });
        spawnImpactBurst(to.x, to.y, { size: 38, duration: 380 * EFFECT_SPEED_MULTIPLIER, color: LIGER_SHADOW });
        playRecoilMotion(otherSide(side), { distance: 13, rotate: -9 });
    }, duration * 0.56);
}
registerCustomSkillMotion('kagegeki', playKagegekiMotion, 'ライガー');

// --- 空中回転アタック：跳び上がって回転しながら突っ込む ---
function playKuuchuKaitenAttackMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1020 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x;

    // 跳ぶ → 空中で回る → 落下しながら当てる
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) rotate(0deg) scale(1,1)', offset: 0 },
        { transform: 'translate(0,6px) rotate(0deg) scale(1.08,0.92)', offset: 0.14 },
        { transform: `translate(${dx * 0.4}px,-52px) rotate(220deg) scale(0.94,1.06)`, offset: 0.42 },
        { transform: `translate(${dx * 0.85}px,-14px) rotate(560deg) scale(0.98,1.02)`, offset: 0.62 },
        { transform: `translate(${dx * 0.6}px,0) rotate(720deg) scale(1,1)`, offset: 0.8 },
        { transform: 'translate(0,0) rotate(720deg) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        for (let i = 0; i < 2; i++) {
            spawnCustomParticle('🌀', to.x, to.y, {
                size: 30, delay: i * 70, duration: 380 * EFFECT_SPEED_MULTIPLIER, color: '#ffd9a0',
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4) rotate(0deg)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.25) rotate(300deg)', opacity: 1, offset: 0.45 },
                    { transform: 'translate(-50%,-50%) scale(0.9) rotate(520deg)', opacity: 0 }
                ]
            });
        }
        spawnImpactBurst(to.x, to.y, { size: 40, duration: 400 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 14, rotate: 10 });
    }, duration * 0.62);
}
registerCustomSkillMotion('kuuchu_kaiten_attack', playKuuchuKaitenAttackMotion, 'ライガー');

// --- コンビネーション：爪と牙を織り交ぜた連続攻撃 ---
function playLigerCombinationMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1150 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.68;
    const hits = 4;

    const kf = [{ transform: 'translate(0,0) rotate(0deg)', offset: 0 }];
    for (let i = 0; i < hits; i++) {
        const base = 0.16 + (i / hits) * 0.66;
        const oy = (i % 2 === 0) ? -18 : 14;
        kf.push({ transform: `translate(${travel}px,${oy}px) rotate(${i % 2 === 0 ? -12 : 10}deg)`, offset: base });
        kf.push({ transform: `translate(${travel * 0.78}px,0) rotate(0deg)`, offset: base + 0.05 });
    }
    kf.push({ transform: 'translate(0,0) rotate(0deg)', offset: 1 });
    animateSpriteLayers(side, kf, { duration, easing: 'ease-in-out' });

    for (let i = 0; i < hits; i++) {
        setTimeout(() => {
            const oy = (i % 2 === 0) ? -16 : 12;
            if (i % 2 === 0) {
                // 爪
                spawnSlashArc(to.x, to.y + oy, -36, { length: 96, width: 7, color: '#ffd9a0', duration: 230 * EFFECT_SPEED_MULTIPLIER });
            } else {
                // 牙
                spawnCustomParticle('🦷', to.x, to.y + oy, {
                    size: 22, duration: 280 * EFFECT_SPEED_MULTIPLIER,
                    keyframes: [
                        { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
                        { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1, offset: 0.45 },
                        { transform: 'translate(-50%,-50%) scale(0.9)', opacity: 0 }
                    ]
                });
            }
            spawnImpactBurst(to.x, to.y + oy, { size: 24, duration: 260 * EFFECT_SPEED_MULTIPLIER });
        }, duration * (0.16 + (i / hits) * 0.66));
    }
    setTimeout(() => {
        spawnImpactBurst(to.x, to.y, { size: 38, duration: 380 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 13, rotate: 9 });
    }, duration * 0.88);
}
registerCustomSkillMotion('combination_liger', playLigerCombinationMotion, 'ライガー');
