// =====================================================
// monster_motion_zan.js
// ザン専用のバトルモーション演出。
//
// ザンの特徴（＝演出の軸）：
//   ・黒い体に蛍光緑と紫  → エフェクトの色はこの2色を基調に統一する
//   ・曲刀（大きな反った刀）→ 斬撃は長く反った軌跡で見せる
//   ・非常に素早い剣士     → 動きは「短く・鋭く・残像を残す」リズムにする
//
// 対応技（14種）：
//   ミラージュシフト／シングルショット／レッグアーク／スタナーブリッツ／王惨刀／ダブルサマー／
//   メテオドライブ／アサルトダンス／アサルトレイド／ライジングレイヴ／アクシズバレット／
//   ダークホウスト／まきびし／みがわりの術
// =====================================================

const ZAN_GREEN = '#8dff4f';  // 蛍光グリーン（刃・基本の斬撃）
const ZAN_PURPLE = '#b07bff'; // 紫（闇・特殊系）

// --- ザン共通：素早さを表す「残像」を置くヘルパー ---
//   移動の軌跡上に、色付きの残像を短時間だけ置いていく。
function spawnZanAfterimages(fromX, fromY, toX, toY, count, opts = {}) {
    const { color = ZAN_GREEN, size = 30, duration = 320, startDelay = 0 } = opts;
    for (let i = 0; i < count; i++) {
        const t = (i + 1) / (count + 1);
        spawnCustomParticle('◤', fromX + (toX - fromX) * t, fromY + (toY - fromY) * t, {
            size, color,
            duration: duration * EFFECT_SPEED_MULTIPLIER,
            delay: startDelay + i * 45,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 0.55 },
                { transform: 'translate(-50%,-50%) scale(0.9)', opacity: 0 }
            ]
        });
    }
}

// --- ミラージュシフト：分身を残して掻き消え、別角度から斬る ---
function playZanMirageShiftMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 880 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.75;

    // 一度消えて（透明になり）、現れて斬る
    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1)', opacity: 1, offset: 0 },
        { transform: 'translateX(0) scale(1)', opacity: 0.15, offset: 0.28 },              // 掻き消える
        { transform: `translateX(${travel}px) scale(1.05)`, opacity: 0.15, offset: 0.42 },  // 移動中は見えない
        { transform: `translateX(${travel}px) scale(1.05)`, opacity: 1, offset: 0.5 },      // 出現して斬る
        { transform: 'translateX(0) scale(1)', opacity: 1, offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    spawnZanAfterimages(from.x, from.y, to.x, to.y, 4, { startDelay: duration * 0.28, color: ZAN_PURPLE });
    setTimeout(() => {
        spawnSlashArc(to.x, to.y, -35, { length: 118, width: 8, color: ZAN_GREEN, duration: 280 * EFFECT_SPEED_MULTIPLIER });
        spawnImpactBurst(to.x, to.y, { size: 30, duration: 320 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 10, rotate: 7 });
    }, duration * 0.5);
}
registerCustomSkillMotion('zan_mirage_shift', playZanMirageShiftMotion, 'ザン');

// --- シングルショット：無駄のない、鋭い一閃 ---
function playZanSingleShotMotion(side) {
    const { impactAt, to } = playLungeMotion(side, { reach: 0.68, duration: 520 });
    if (!to) return;
    setTimeout(() => {
        spawnSlashArc(to.x, to.y, -18, { length: 108, width: 7, color: ZAN_GREEN, duration: 250 * EFFECT_SPEED_MULTIPLIER });
        spawnImpactBurst(to.x, to.y, { size: 28, duration: 300 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 9, rotate: 6 });
    }, impactAt);
}
registerCustomSkillMotion('zan_single_shot', playZanSingleShotMotion, 'ザン');

// --- レッグアーク：低い姿勢から弧を描く足技で薙ぐ ---
function playZanLegArcMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 700 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.62;

    // 低く沈んで滑り込み、脚で弧を描く
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) scale(1,1) rotate(0deg)', offset: 0 },
        { transform: 'translate(0,6px) scale(1.06,0.9) rotate(0deg)', offset: 0.2 },                  // 沈む
        { transform: `translate(${travel}px,8px) scale(1.04,0.94) rotate(-16deg)`, offset: 0.46 },     // 滑り込む
        { transform: `translate(${travel}px,2px) scale(1,1) rotate(10deg)`, offset: 0.62 },            // 蹴り上げる
        { transform: 'translate(0,0) scale(1,1) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        // 足元から上へ弧を描く軌跡（2本重ねて弧に見せる）
        spawnSlashArc(to.x, to.y + 18, 20, { length: 104, width: 9, color: ZAN_GREEN, duration: 260 * EFFECT_SPEED_MULTIPLIER });
        setTimeout(() => spawnSlashArc(to.x, to.y + 2, 58, { length: 92, width: 8, color: ZAN_GREEN, duration: 250 * EFFECT_SPEED_MULTIPLIER }), 70);
        spawnImpactBurst(to.x, to.y + 10, { size: 30, duration: 320 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 10, rotate: -6 });
    }, duration * 0.48);
}
registerCustomSkillMotion('zan_leg_arc', playZanLegArcMotion, 'ザン');

// --- スタナーブリッツ：帯電した刃で高速に突っ込み、相手を痺れさせる ---
function playZanStunnerBlitzMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 800 * EFFECT_SPEED_MULTIPLIER;

    const { impactAt } = playLungeMotion(side, { reach: 0.8, duration });
    // 帯電
    spawnSelfParticleRing(casterEl, '⚡', 4, 18, 400 * EFFECT_SPEED_MULTIPLIER, 30);
    spawnZanAfterimages(from.x, from.y, to.x, to.y, 3, { startDelay: duration * 0.2, color: '#ffe066' });

    setTimeout(() => {
        spawnSlashArc(to.x, to.y, -25, { length: 112, width: 9, color: '#ffe066', duration: 270 * EFFECT_SPEED_MULTIPLIER });
        // 相手の全身に電流が走って痙攣する
        animateSpriteLayers(otherSide(side), [
            { transform: 'translateX(0)', offset: 0 },
            { transform: 'translateX(4px)', offset: 0.15 },
            { transform: 'translateX(-4px)', offset: 0.3 },
            { transform: 'translateX(3px)', offset: 0.45 },
            { transform: 'translateX(-3px)', offset: 0.6 },
            { transform: 'translateX(0)', offset: 1 }
        ], { duration: 520 * EFFECT_SPEED_MULTIPLIER, easing: 'linear' });
        for (let i = 0; i < 4; i++) {
            spawnCustomParticle('⚡', to.x + (Math.random() - 0.5) * 44, to.y + (Math.random() - 0.5) * 36, {
                size: 22, delay: i * 60, duration: 340 * EFFECT_SPEED_MULTIPLIER, color: '#ffe066',
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.25)', opacity: 1, offset: 0.4 },
                    { transform: 'translate(-50%,-50%) scale(0.8)', opacity: 0 }
                ]
            });
        }
    }, impactAt);
}
registerCustomSkillMotion('zan_stunner_blitz', playZanStunnerBlitzMotion, 'ザン');

// --- 王惨刀：曲刀の重さを乗せた、大きく反った一撃 ---
function playZanOhzantouMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1080 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.66;

    animateSpriteLayers(side, [
        { transform: 'translate(0,0) rotate(0deg) scale(1)', offset: 0 },
        { transform: 'translate(0,-6px) rotate(-24deg) scale(1.06)', offset: 0.34 }, // 大きく反らす
        { transform: 'translate(0,-6px) rotate(-26deg) scale(1.07)', offset: 0.45 },
        { transform: `translate(${travel}px,4px) rotate(18deg) scale(1.03)`, offset: 0.62 },
        { transform: 'translate(0,0) rotate(0deg) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 刃に力が集まる
    for (let i = 0; i < 3; i++) {
        spawnCustomParticle('✦', from.x, from.y - 18, {
            size: 24, delay: 120 + i * 100, duration: 400 * EFFECT_SPEED_MULTIPLIER, color: ZAN_GREEN,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 1, offset: 0.5 },
                { transform: 'translate(-50%,-50%) scale(0.6)', opacity: 0 }
            ]
        });
    }
    // 反った刃を表すため、角度をずらした2本の軌跡を続けて出す
    setTimeout(() => {
        spawnSlashArc(to.x, to.y, 72, { length: 158, width: 15, color: ZAN_GREEN, duration: 380 * EFFECT_SPEED_MULTIPLIER });
        setTimeout(() => spawnSlashArc(to.x, to.y + 8, 96, { length: 130, width: 11, color: '#e6ffd0', duration: 340 * EFFECT_SPEED_MULTIPLIER }), 90);
        spawnImpactBurst(to.x, to.y, { size: 44, duration: 440 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 15, rotate: 12, duration: 560 });
    }, duration * 0.58);
}
registerCustomSkillMotion('zan_ohzantou', playZanOhzantouMotion, 'ザン');

// --- ダブルサマー：跳び上がりながら2連続で斬り上げる ---
function playZanDoubleSummerMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 900 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.66;

    // 1段目で斬り上げ、さらに跳んで2段目
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) rotate(0deg)', offset: 0 },
        { transform: 'translate(0,5px) rotate(0deg)', offset: 0.12 },
        { transform: `translate(${travel}px,-18px) rotate(-14deg)`, offset: 0.34 }, // 1段目
        { transform: `translate(${travel}px,-6px) rotate(4deg)`, offset: 0.46 },
        { transform: `translate(${travel}px,-40px) rotate(-20deg)`, offset: 0.66 }, // 2段目（より高く）
        { transform: 'translate(0,0) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    [[0.34, 88, 8, ZAN_GREEN], [0.66, 112, 11, '#e6ffd0']].forEach(([at, len, w, col], i) => {
        setTimeout(() => {
            spawnSlashArc(to.x, to.y - i * 14, i === 0 ? 62 : 78, { length: len, width: w, color: col, duration: 280 * EFFECT_SPEED_MULTIPLIER });
            spawnImpactBurst(to.x, to.y - i * 14, { size: i === 0 ? 28 : 38, duration: 320 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: i === 0 ? 8 : 13, rotate: i === 0 ? -5 : -10 });
        }, duration * at);
    });
}
registerCustomSkillMotion('zan_double_summer', playZanDoubleSummerMotion, 'ザン');

// --- メテオドライブ：高く跳び上がり、隕石のように真上から突き落とす ---
function playZanMeteorDriveMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1200 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x;

    // 大きく跳躍 → 画面外近くまで上がる → 真上から急降下 → 着地して戻る
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) rotate(0deg) scale(1)', offset: 0 },
        { transform: 'translate(0,6px) rotate(0deg) scale(1.05,0.93)', offset: 0.1 },              // ためる
        { transform: `translate(${dx * 0.4}px,-90px) rotate(-30deg) scale(0.92)`, offset: 0.36 },   // 跳ぶ
        { transform: `translate(${dx * 0.95}px,-104px) rotate(-180deg) scale(0.9)`, offset: 0.52 }, // 頂点で反転
        { transform: `translate(${dx * 0.95}px,10px) rotate(-350deg) scale(1.06)`, offset: 0.7 },   // 急降下
        { transform: `translate(${dx * 0.6}px,0) rotate(-360deg) scale(1)`, offset: 0.86 },
        { transform: 'translate(0,0) rotate(-360deg) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 落下してくる軌跡（上から下へ光の筋）
    setTimeout(() => {
        spawnBeamLine(to.x, to.y - 120, 0, 120, ZAN_GREEN, 380 * EFFECT_SPEED_MULTIPLIER, 12);
    }, duration * 0.55);

    // 着弾：地面が砕けるように破片が飛び散る
    setTimeout(() => {
        spawnSlashArc(to.x, to.y + 12, 90, { length: 140, width: 14, color: '#e6ffd0', duration: 340 * EFFECT_SPEED_MULTIPLIER });
        spawnImpactBurst(to.x, to.y + 10, { size: 48, duration: 460 * EFFECT_SPEED_MULTIPLIER });
        for (let i = 0; i < 5; i++) {
            const a = -Math.PI + (Math.PI * i) / 4;
            spawnCustomParticle('🪨', to.x, to.y + 18, {
                size: 16, delay: i * 40, duration: 480 * EFFECT_SPEED_MULTIPLIER,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
                    { transform: `translate(${Math.cos(a) * 40}px, ${Math.sin(a) * 26}px) translate(-50%,-50%) scale(1) rotate(180deg)`, opacity: 1, offset: 0.45 },
                    { transform: `translate(${Math.cos(a) * 64}px, ${Math.sin(a) * 10}px) translate(-50%,-50%) scale(0.7) rotate(320deg)`, opacity: 0 }
                ]
            });
        }
        playRecoilMotion(otherSide(side), { distance: 16, rotate: 12, duration: 600 });
    }, duration * 0.7);
}
registerCustomSkillMotion('zan_meteor_drive', playZanMeteorDriveMotion, 'ザン');

// --- アサルトダンス：舞うように連続で斬りつける多段技 ---
function playZanAssaultDanceMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1150 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.7;
    const hits = 4;

    // 相手の周囲を舞うように、位置と角度を変えながら連続で斬る
    const kf = [{ transform: 'translate(0,0) rotate(0deg)', offset: 0 }];
    for (let i = 0; i < hits; i++) {
        const base = 0.18 + (i / hits) * 0.62;
        const oy = (i % 2 === 0) ? -18 : 14;
        const ox = travel * (i % 2 === 0 ? 1 : 0.82);
        kf.push({ transform: `translate(${ox}px,${oy}px) rotate(${i % 2 === 0 ? -16 : 14}deg)`, offset: base });
    }
    kf.push({ transform: 'translate(0,0) rotate(0deg)', offset: 1 });
    animateSpriteLayers(side, kf, { duration, easing: 'ease-in-out' });

    for (let i = 0; i < hits; i++) {
        setTimeout(() => {
            const oy = (i % 2 === 0) ? -14 : 12;
            spawnSlashArc(to.x, to.y + oy, i % 2 === 0 ? -40 : 40, { length: 96, width: 7, color: ZAN_GREEN, duration: 240 * EFFECT_SPEED_MULTIPLIER });
            spawnImpactBurst(to.x, to.y + oy, { emoji: '✨', size: 22, duration: 260 * EFFECT_SPEED_MULTIPLIER, color: ZAN_GREEN });
        }, duration * (0.18 + (i / hits) * 0.62));
    }
    // 最後にまとめて仰け反る
    setTimeout(() => {
        spawnImpactBurst(to.x, to.y, { size: 36, duration: 360 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 12, rotate: 9 });
    }, duration * 0.84);
}
registerCustomSkillMotion('zan_assault_dance', playZanAssaultDanceMotion, 'ザン');

// --- アサルトレイド：刃に光を集め、前方へ大きな光の斬撃波を放つ ---
function playZanAssaultRaidMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1000 * EFFECT_SPEED_MULTIPLIER;

    // 構えて溜め、振り抜いて飛ばす
    animateSpriteLayers(side, [
        { transform: 'translateX(0) rotate(0deg) scale(1)', offset: 0 },
        { transform: 'translateX(-6px) rotate(-20deg) scale(1.05)', offset: 0.34 },
        { transform: 'translateX(4px) rotate(16deg) scale(1.02)', offset: 0.52 },
        { transform: 'translateX(0) rotate(0deg) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    spawnSelfParticleRing(casterEl, '✨', 5, 18, 460 * EFFECT_SPEED_MULTIPLIER, 32);

    // 光の斬撃波が飛んでいく
    setTimeout(() => {
        spawnBeamLine(from.x, from.y, to.x - from.x, to.y - from.y, ZAN_GREEN, 480 * EFFECT_SPEED_MULTIPLIER, 16);
        setTimeout(() => {
            spawnSlashArc(to.x, to.y, -22, { length: 138, width: 13, color: '#e6ffd0', duration: 340 * EFFECT_SPEED_MULTIPLIER });
            spawnImpactBurst(to.x, to.y, { size: 42, duration: 420 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: 14, rotate: 10 });
        }, 200 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.48);
}
registerCustomSkillMotion('zan_assault_raid', playZanAssaultRaidMotion, 'ザン');

// --- ライジングレイヴ：下から上へ、光を巻き上げながら斬り上げる ---
function playZanRisingRaveMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 940 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.68;

    // 沈み込んでから、一気に伸び上がる
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) scale(1,1) rotate(0deg)', offset: 0 },
        { transform: 'translate(0,8px) scale(1.07,0.88) rotate(0deg)', offset: 0.24 },              // 沈む
        { transform: `translate(${travel}px,-30px) scale(0.94,1.12) rotate(-18deg)`, offset: 0.5 }, // 斬り上げる
        { transform: `translate(${travel * 0.7}px,-10px) scale(1,1) rotate(-6deg)`, offset: 0.7 },
        { transform: 'translate(0,0) scale(1,1) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        // 下から上へ立ち上がる光の柱
        spawnBeamLine(to.x, to.y + 40, 0, -110, ZAN_GREEN, 420 * EFFECT_SPEED_MULTIPLIER, 14);
        spawnSlashArc(to.x, to.y, 82, { length: 128, width: 12, color: '#e6ffd0', duration: 320 * EFFECT_SPEED_MULTIPLIER });
        // 巻き上がる光
        for (let i = 0; i < 4; i++) {
            spawnCustomParticle('✨', to.x + (Math.random() - 0.5) * 30, to.y + 20, {
                size: 20, delay: i * 55, duration: 480 * EFFECT_SPEED_MULTIPLIER, color: ZAN_GREEN,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                    { transform: 'translate(0,-34px) translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0.45 },
                    { transform: 'translate(0,-64px) translate(-50%,-50%) scale(0.7)', opacity: 0 }
                ]
            });
        }
        spawnImpactBurst(to.x, to.y - 8, { size: 38, duration: 400 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 10, rotate: -11 });
    }, duration * 0.46);
}
registerCustomSkillMotion('zan_rising_rave', playZanRisingRaveMotion, 'ザン');

// --- アクシズバレット：体を軸に高速回転し、弾丸のように突き抜ける ---
function playZanAxisBulletMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 820 * EFFECT_SPEED_MULTIPLIER;
    const through = (to.x - from.x) * 1.05;

    // 高速回転しながら一直線に突き抜ける
    animateSpriteLayers(side, [
        { transform: 'translateX(0) rotate(0deg) scale(1)', offset: 0 },
        { transform: 'translateX(0) rotate(180deg) scale(0.9)', offset: 0.2 },              // 回転して細くなる
        { transform: `translateX(${through}px) rotate(1080deg) scale(0.92)`, offset: 0.6 }, // 突き抜ける
        { transform: `translateX(${through * 0.6}px) rotate(1080deg) scale(1)`, offset: 0.78 },
        { transform: 'translateX(0) rotate(1080deg) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    spawnZanAfterimages(from.x, from.y, to.x, to.y, 5, { startDelay: duration * 0.2, color: ZAN_GREEN, size: 26 });

    setTimeout(() => {
        // 回転の勢いを表す渦
        for (let i = 0; i < 3; i++) {
            spawnCustomParticle('🌀', to.x, to.y, {
                size: 30, delay: i * 60, duration: 380 * EFFECT_SPEED_MULTIPLIER, color: ZAN_GREEN,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4) rotate(0deg)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.3) rotate(300deg)', opacity: 1, offset: 0.45 },
                    { transform: 'translate(-50%,-50%) scale(0.9) rotate(560deg)', opacity: 0 }
                ]
            });
        }
        spawnImpactBurst(to.x, to.y, { size: 36, duration: 380 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 13, rotate: 10 });
    }, duration * 0.55);
}
registerCustomSkillMotion('zan_axis_bullet', playZanAxisBulletMotion, 'ザン');

// --- ダークホウスト：紫の呪詛が相手に取り憑く ---
function playZanDarkHauntMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1060 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    // 印を結ぶように腕を掲げ、闇を放つ
    animateSpriteLayers(side, [
        { transform: 'translateY(0) scale(1)', offset: 0 },
        { transform: 'translateY(-8px) scale(1.04)', offset: 0.3 },
        { transform: 'translateY(-8px) scale(1.04)', offset: 0.44 },
        { transform: 'translateY(0) scale(1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    spawnSelfParticleRing(casterEl, '🌑', 4, 18, 460 * EFFECT_SPEED_MULTIPLIER, 32);

    // 紫の影が漂いながら相手へ向かい、取り憑く
    for (let i = 0; i < 4; i++) {
        const wave = (i % 2 === 0) ? -22 : 20;
        spawnCustomParticle('🌑', from.x, from.y, {
            size: 24, delay: duration * 0.34 + i * 90, duration: 620 * EFFECT_SPEED_MULTIPLIER, color: ZAN_PURPLE,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px, ${dy * 0.5 + wave}px) translate(-50%,-50%) scale(1.1)`, opacity: 0.95, offset: 0.5 },
                { transform: `translate(${dx}px, ${dy}px) translate(-50%,-50%) scale(0.7)`, opacity: 0 }
            ]
        });
    }

    // 取り憑かれて body が沈み込む
    setTimeout(() => {
        animateSpriteLayers(otherSide(side), [
            { transform: 'scale(1,1) rotate(0deg)', offset: 0 },
            { transform: 'scale(0.96,1.04) rotate(-3deg)', offset: 0.3 },
            { transform: 'scale(1.02,0.97) rotate(3deg)', offset: 0.6 },
            { transform: 'scale(1,1) rotate(0deg)', offset: 1 }
        ], { duration: 620 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-in-out' });
        for (let i = 0; i < 3; i++) {
            const a = (Math.PI * 2 * i) / 3;
            spawnCustomParticle('💀', to.x, to.y - 16, {
                size: 20, delay: i * 90, duration: 680 * EFFECT_SPEED_MULTIPLIER, color: ZAN_PURPLE,
                keyframes: [
                    { transform: `translate(${Math.cos(a) * 20}px, ${Math.sin(a) * 9}px) translate(-50%,-50%) scale(0.5)`, opacity: 0 },
                    { transform: `translate(${Math.cos(a + 2.1) * 22}px, ${Math.sin(a + 2.1) * 10}px) translate(-50%,-50%) scale(1)`, opacity: 1, offset: 0.45 },
                    { transform: `translate(${Math.cos(a + 4.2) * 20}px, ${Math.sin(a + 4.2) * 9}px) translate(-50%,-50%) scale(0.75)`, opacity: 0 }
                ]
            });
        }
    }, duration * 0.7);
}
registerCustomSkillMotion('zan_dark_haunt', playZanDarkHauntMotion, 'ザン');

// --- まきびし：相手の足元に撒菱をばら撒く（設置技なので相手を直接殴らない） ---
function playZanMakibishiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const duration = 720 * EFFECT_SPEED_MULTIPLIER;

    // 素早く腕を振って撒く動作
    animateSpriteLayers(side, [
        { transform: 'rotate(0deg) translateX(0)', offset: 0 },
        { transform: 'rotate(-12deg) translateX(-4px)', offset: 0.22 },
        { transform: 'rotate(10deg) translateX(6px)', offset: 0.4 },   // 撒く
        { transform: 'rotate(0deg) translateX(0)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        spawnScatterOnField(to.x, to.y + 24, '✦', 6, {
            size: 15,
            duration: 660 * EFFECT_SPEED_MULTIPLIER,
            spread: 70,
            color: ZAN_GREEN
        });
    }, duration * 0.4);
}
registerCustomSkillMotion('zan_makibishi', playZanMakibishiMotion, 'ザン');

// --- みがわりの術：分身を残して姿を消す（身代わりを立てる） ---
function playZanMigawariNoJutsuMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    if (!casterEl) return;
    const { x, y } = getElCenter(casterEl);
    const duration = 900 * EFFECT_SPEED_MULTIPLIER;

    // 一瞬ぶれて、分身が左右に分かれるように見せる
    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1)', opacity: 1, offset: 0 },
        { transform: 'translateX(-8px) scale(1)', opacity: 0.5, offset: 0.22 },
        { transform: 'translateX(8px) scale(1)', opacity: 0.5, offset: 0.38 },
        { transform: 'translateX(0) scale(1.03)', opacity: 1, offset: 0.6 },
        { transform: 'translateX(0) scale(1)', opacity: 1, offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 左右に分かれて消えていく残像＝身代わり
    [-1, 1].forEach((dir, i) => {
        spawnCustomParticle('◤', x, y, {
            size: 34, delay: i * 80, duration: 620 * EFFECT_SPEED_MULTIPLIER, color: ZAN_PURPLE,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.6 },
                { transform: `translate(${dir * 34}px,0) translate(-50%,-50%) scale(0.95)`, opacity: 0.35, offset: 0.5 },
                { transform: `translate(${dir * 52}px,0) translate(-50%,-50%) scale(0.85)`, opacity: 0 }
            ]
        });
    });
    // 煙に紛れる
    spawnSelfParticleRing(casterEl, '💨', 5, 20, 620 * EFFECT_SPEED_MULTIPLIER, 36);
}
registerCustomSkillMotion('zan_migawari_no_jutsu', playZanMigawariNoJutsuMotion, 'ザン');
