// =====================================================
// monster_motion_dino.js
// ディノ専用のバトルモーション演出。
//
// ディノの特徴（＝演出の軸）：
//   ・力強いしっぽ  → しっぽ系は「胴体を回して薙ぎ払う」動きで見せる
//   ・鋭いキバ      → かみつき系は牙で捕らえて振り回す
//   ・炎を纏う突進  → 炎のたいあたりは火を引きながら突っ込む
//   ・跳び膝蹴り    → ひざげり系は一度跳び上がってから膝を落とす
//
// 対応技：しっぽ／かみつき／砂かけ／かみつき投げ／炎のたいあたり／ひざげり／黒ひざコンボ／ステルスロック
// =====================================================

// --- しっぽ：胴体を回してしっぽで薙ぎ払う ---
function playShippoMotion(side) {
    const { duration, impactAt, to } = playLungeMotion(side, { reach: 0.4, duration: 620, spin: -22 });
    if (!to) return;
    setTimeout(() => {
        // しっぽの薙ぎ払いの軌跡（低い位置を横方向に走る）
        spawnSlashArc(to.x, to.y + 14, 8, { length: 110, width: 9, color: '#9fe8a0', duration: 300 * EFFECT_SPEED_MULTIPLIER });
        spawnImpactBurst(to.x, to.y + 10, { emoji: '💨', size: 28, duration: 340 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 9, rotate: 6 });
    }, impactAt);
}
registerCustomSkillMotion('shippo', playShippoMotion, 'ディノ');

// --- かみつき：鋭いキバで噛みつく（スエゾーのかみつきとは別物として、牙の鋭さを強調する） ---
function playKamitsukiDinoMotion(side) {
    const { impactAt, to } = playLungeMotion(side, { reach: 0.6, duration: 580 });
    if (!to) return;
    setTimeout(() => {
        // 上下の牙が交差するように噛み合わせる
        [-1, 1].forEach((dir, i) => {
            spawnCustomParticle('🦷', to.x, to.y + dir * 18, {
                size: 24, delay: i * 25,
                duration: 360 * EFFECT_SPEED_MULTIPLIER,
                keyframes: [
                    { transform: `translate(-50%,-50%) translateY(${dir * 18}px) scale(0.5) rotate(${dir * 25}deg)`, opacity: 0 },
                    { transform: `translate(-50%,-50%) translateY(0) scale(1.2) rotate(${dir * -8}deg)`, opacity: 1, offset: 0.45 },
                    { transform: 'translate(-50%,-50%) translateY(0) scale(1)', opacity: 0 }
                ]
            });
        });
        spawnImpactBurst(to.x, to.y, { size: 30, duration: 340 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 8, rotate: 5 });
    }, impactAt);
}
registerCustomSkillMotion('kamitsuki_dino', playKamitsukiDinoMotion, 'ディノ');

// --- 砂かけ：後ろ足で砂を蹴り上げて相手の視界を奪う ---
function playSunakakeMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 760 * EFFECT_SPEED_MULTIPLIER;

    // 砂を蹴り上げる動作（後ろに沈んでから前へ蹴り出す）
    animateSpriteLayers(side, [
        { transform: 'translateX(0) rotate(0deg)', offset: 0 },
        { transform: 'translateX(-6px) rotate(-6deg)', offset: 0.22 },
        { transform: 'translateX(4px) rotate(5deg)', offset: 0.42 },
        { transform: 'translateX(0) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 砂が扇状に広がって相手へ飛ぶ
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    for (let i = 0; i < 6; i++) {
        const spread = (i - 2.5) * 13;
        spawnCustomParticle('🌫️', from.x, from.y + 14, {
            size: 18 + Math.random() * 8,
            duration: 560 * EFFECT_SPEED_MULTIPLIER,
            delay: 180 + i * 45,
            color: '#d9c08a',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px, ${dy * 0.5 + spread * 0.4 - 12}px) translate(-50%,-50%) scale(1)`, opacity: 0.95, offset: 0.5 },
                { transform: `translate(${dx}px, ${dy + spread * 0.5}px) translate(-50%,-50%) scale(1.3)`, opacity: 0 }
            ]
        });
    }

    // 目に砂が入って怯む
    setTimeout(() => {
        animateSpriteLayers(otherSide(side), [
            { transform: 'rotate(0deg)', offset: 0 },
            { transform: 'rotate(-5deg)', offset: 0.3 },
            { transform: 'rotate(4deg)', offset: 0.6 },
            { transform: 'rotate(0deg)', offset: 1 }
        ], { duration: 460 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-in-out' });
        spawnImpactBurst(to.x, to.y - 12, { emoji: '😖', size: 26, duration: 420 * EFFECT_SPEED_MULTIPLIER });
    }, duration * 0.62);
}
registerCustomSkillMotion('sunakake', playSunakakeMotion, 'ディノ');

// --- かみつき投げ：噛みついたまま相手を持ち上げて投げ飛ばす ---
function playKamitsukinageMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1080 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.5;
    const throwDir = (to.x - from.x) > 0 ? 1 : -1;

    // 噛みついて → 振り回して → 投げ放つ
    animateSpriteLayers(side, [
        { transform: 'translateX(0) rotate(0deg)', offset: 0 },
        { transform: `translateX(${travel}px) rotate(0deg)`, offset: 0.26 },       // 組みつく
        { transform: `translateX(${travel}px) rotate(-16deg)`, offset: 0.48 },     // 振りかぶる
        { transform: `translateX(${travel * 0.7}px) rotate(14deg)`, offset: 0.64 }, // 投げる
        { transform: 'translateX(0) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 相手は持ち上げられ、回転しながら投げ飛ばされて落ちる
    setTimeout(() => {
        animateSpriteLayers(otherSide(side), [
            { transform: 'translate(0,0) rotate(0deg)', offset: 0 },
            { transform: `translate(${-throwDir * 10}px,-30px) rotate(-40deg)`, offset: 0.3 },  // 持ち上げられる
            { transform: `translate(${throwDir * 26}px,-14px) rotate(-220deg)`, offset: 0.62 }, // 投げられて回る
            { transform: `translate(${throwDir * 8}px, 8px) rotate(-350deg)`, offset: 0.85 },   // 落ちる
            { transform: 'translate(0,0) rotate(-360deg)', offset: 1 }
        ], { duration: duration * 0.72, easing: 'ease-in-out' });
    }, duration * 0.26);

    // 叩きつけられた衝撃
    setTimeout(() => {
        spawnImpactBurst(to.x, to.y + 16, { size: 34, duration: 380 * EFFECT_SPEED_MULTIPLIER });
        spawnCustomParticle('💨', to.x, to.y + 18, {
            size: 26, duration: 420 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.4)', opacity: 0.9, offset: 0.4 },
                { transform: 'translate(-50%,-50%) scale(1.8)', opacity: 0 }
            ]
        });
    }, duration * 0.82);
}
registerCustomSkillMotion('kamitsukinage', playKamitsukinageMotion, 'ディノ');

// --- 炎のたいあたり：全身に炎を纏って突進する ---
function playHonooTaiatariMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 880 * EFFECT_SPEED_MULTIPLIER;

    // 炎を纏う → 一気に突進 → 押し込む
    const { impactAt } = playLungeMotion(side, { reach: 0.82, duration, scaleHit: 1.1 });

    // 突進前に体を包む炎
    spawnSelfParticleRing(casterEl, '🔥', 5, 20, 460 * EFFECT_SPEED_MULTIPLIER, 34);

    // 突進の軌跡として、道中に炎を置いていく
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    for (let i = 0; i < 5; i++) {
        const t = i / 5;
        spawnCustomParticle('🔥', from.x + dx * t * 0.8, from.y + dy * t * 0.8, {
            size: 22 + Math.random() * 8,
            duration: 480 * EFFECT_SPEED_MULTIPLIER,
            delay: duration * 0.28 + i * 42,
            color: '#ff7a3c',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 1, offset: 0.35 },
                { transform: 'translate(0,-20px) translate(-50%,-50%) scale(0.7)', opacity: 0 }
            ]
        });
    }

    // 激突で炎が爆ぜる
    setTimeout(() => {
        for (let i = 0; i < 4; i++) {
            const sx = (Math.random() - 0.5) * 46;
            const sy = (Math.random() - 0.5) * 34;
            spawnCustomParticle('🔥', to.x + sx, to.y + sy, {
                size: 24 + Math.random() * 8,
                duration: 440 * EFFECT_SPEED_MULTIPLIER,
                delay: i * 40, color: '#ff6a2c',
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.35)', opacity: 1, offset: 0.4 },
                    { transform: 'translate(0,-26px) translate(-50%,-50%) scale(0.7)', opacity: 0 }
                ]
            });
        }
        spawnImpactBurst(to.x, to.y, { size: 34, duration: 380 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 12, rotate: 9 });
    }, impactAt);
}
registerCustomSkillMotion('honoo_taiatari', playHonooTaiatariMotion, 'ディノ');

// --- ひざげり：跳び上がってから鋭い膝を叩き込む ---
function playHizageriMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 760 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.6;

    // 沈み込む → 跳ぶ → 膝を落とす → 着地
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) scale(1,1) rotate(0deg)', offset: 0 },
        { transform: 'translate(0,4px) scale(1.04,0.92) rotate(0deg)', offset: 0.16 },              // 沈む
        { transform: `translate(${travel * 0.6}px,-34px) scale(0.96,1.08) rotate(-12deg)`, offset: 0.42 }, // 跳ぶ
        { transform: `translate(${travel}px,-6px) scale(1.05,1) rotate(6deg)`, offset: 0.6 },        // 膝を叩き込む
        { transform: 'translate(0,0) scale(1,1) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        spawnSlashArc(to.x, to.y, 62, { length: 76, width: 10, color: '#c8f0a8', duration: 280 * EFFECT_SPEED_MULTIPLIER });
        spawnImpactBurst(to.x, to.y, { size: 32, duration: 340 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 10, rotate: 7 });
    }, duration * 0.58);
}
registerCustomSkillMotion('hizageri', playHizageriMotion, 'ディノ');

// --- 黒ひざコンボ：膝蹴りを2連続で叩き込む（2回攻撃技なので、はっきり2回見せる） ---
function playKurohizacomboMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1000 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.62;

    // 1発目 → 引き戻し → 2発目、と間を作って2回の打撃が伝わるようにする
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) rotate(0deg)', offset: 0 },
        { transform: 'translate(0,3px) rotate(0deg)', offset: 0.1 },
        { transform: `translate(${travel}px,-14px) rotate(-10deg)`, offset: 0.3 },        // 1発目
        { transform: `translate(${travel * 0.55}px,-2px) rotate(4deg)`, offset: 0.45 },   // 引き戻す
        { transform: `translate(${travel}px,-20px) rotate(-14deg)`, offset: 0.66 },       // 2発目（より深く）
        { transform: 'translate(0,0) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 2回分の打撃エフェクト（2発目を大きくして「決め」に見せる）
    [[0.3, 30, 74], [0.66, 38, 92]].forEach(([at, size, arcLen], i) => {
        setTimeout(() => {
            // 黒ひざの名にあわせ、暗い紫の軌跡にする
            spawnSlashArc(to.x, to.y, i === 0 ? 58 : 70, { length: arcLen, width: 10, color: '#a97fd6', duration: 280 * EFFECT_SPEED_MULTIPLIER });
            spawnImpactBurst(to.x, to.y, { size, duration: 340 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: i === 0 ? 8 : 13, rotate: i === 0 ? 6 : 10 });
        }, duration * at);
    });
}
registerCustomSkillMotion('kurohizacombo', playKurohizacomboMotion, 'ディノ');

// --- ステルスロック：相手の足元に鋭い岩をばら撒く（設置技なので相手を直接殴らない） ---
function playStealthRockMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const duration = 780 * EFFECT_SPEED_MULTIPLIER;

    // 地面を踏み鳴らして岩を巻き上げる動き
    animateSpriteLayers(side, [
        { transform: 'translateY(0) scale(1,1)', offset: 0 },
        { transform: 'translateY(-10px) scale(0.97,1.05)', offset: 0.25 },
        { transform: 'translateY(4px) scale(1.06,0.93)', offset: 0.42 }, // 踏みつける
        { transform: 'translateY(0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 相手の足元に岩が降ってきて、そのまま残る
    setTimeout(() => {
        spawnScatterOnField(to.x, to.y + 24, '🪨', 5, {
            size: 17,
            duration: 700 * EFFECT_SPEED_MULTIPLIER,
            spread: 66
        });
    }, duration * 0.42);
}
registerCustomSkillMotion('stealth_rock', playStealthRockMotion, 'ディノ');
