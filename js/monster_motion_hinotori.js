// =====================================================
// monster_motion_hinotori.js
// ヒノトリ専用のバトルモーション演出。
//
// ヒノトリの特徴（＝演出の軸）：
//   ・炎を纏う不死鳥 → 炎技は「翼を広げる → 炎が舞い上がる」という流れで統一する
//   ・空を飛ぶ       → 移動は必ず一度舞い上がってから降りてくる。地を這わない
//   ・くちばしと鉤爪 → 物理技はこの2つで描き分ける（突く／裂く）
//
// ★炎技の格付け（見た目で段階が分かるようにしている）：
//     フレイムライン    … 地を這う一直線の炎
//     フレイムビーム    … 極太の炎の光線
//     フレイムタイフーン … 渦を巻いて巻き上げる炎
//     ファイアウェーブ  … 面となって押し寄せる炎
//     ファイヤーバード  … 自らが炎の鳥と化して突撃
//     エボニーノヴァ    … 最上位。黒い炎が超新星のように爆発する
//
// 対応技：くちばし／連続かぎづめ／フレイムタイフーン／雄叫び／爆裂落とし／
//         フレイムライン／フレイムビーム／ファイヤーバード／ファイアウェーブ／エボニーノヴァ
// =====================================================

const HINOTORI_FLAME = '#ff7a3c';  // 炎の橙
const HINOTORI_EMBER = '#ffd76a';  // 熾火の黄
const HINOTORI_EBONY = '#8a4ad6';  // エボニー（黒炎）の紫

// --- ヒノトリ共通：舞い上がって相手へ降りかかり、また戻る（地を這わない動き） ---
function playHinotoriFlight(side, opts = {}) {
    const { duration = 860, reach = 0.7, height = 44 } = opts;
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return null;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const d = duration * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * reach;

    animateSpriteLayers(side, [
        { transform: 'translate(0,0) scale(1,1)', offset: 0 },
        { transform: `translate(0,-${height}px) scale(1.04,1.02)`, offset: 0.26 },             // 舞い上がる
        { transform: `translate(${travel}px,-${height * 0.5}px) scale(1.06,1)`, offset: 0.5 },  // 降下しながら接近
        { transform: `translate(${travel}px,0) scale(1.04,1)`, offset: 0.62 },
        { transform: 'translate(0,0) scale(1,1)', offset: 1 }
    ], { duration: d, easing: 'ease-in-out' });

    return { duration: d, impactAt: d * 0.52, from, to };
}

// --- ヒノトリ共通：炎が立ち上る ---
function spawnHinotoriFlames(x, y, count, opts = {}) {
    const { color = HINOTORI_FLAME, size = 24, spread = 40, rise = 34, duration = 480 } = opts;
    for (let i = 0; i < count; i++) {
        const ox = count > 1
            ? (i - (count - 1) / 2) * (spread / (count - 1)) + (Math.random() - 0.5) * 8
            : (Math.random() - 0.5) * 8;
        spawnCustomParticle('🔥', x + ox, y, {
            size: size + Math.random() * 6, delay: i * 45, duration: duration * EFFECT_SPEED_MULTIPLIER, color,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: `translate(0,-${rise * 0.6}px) translate(-50%,-50%) scale(1.25)`, opacity: 1, offset: 0.45 },
                { transform: `translate(0,-${rise}px) translate(-50%,-50%) scale(0.7)`, opacity: 0 }
            ]
        });
    }
}

// --- くちばし：鋭いくちばしで一突き ---
function playKuchibashiMotion(side) {
    const r = playHinotoriFlight(side, { duration: 680, reach: 0.66, height: 30 });
    if (!r) return;
    setTimeout(() => {
        spawnSlashArc(r.to.x, r.to.y, 0, { length: 82, width: 7, color: HINOTORI_EMBER, duration: 240 * EFFECT_SPEED_MULTIPLIER });
        spawnImpactBurst(r.to.x, r.to.y, { size: 32, duration: 320 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 11, rotate: 8 });
    }, r.impactAt);
}
registerCustomSkillMotion('kuchibashi', playKuchibashiMotion, 'ヒノトリ');

// --- 連続かぎづめ：空中で位置を変えながら鉤爪で何度も引き裂く ---
function playRenzokuKagizumeMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1100 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.68;
    const hits = 4;

    const kf = [{ transform: 'translate(0,0)', offset: 0 }];
    for (let i = 0; i < hits; i++) {
        const base = 0.16 + (i / hits) * 0.66;
        const oy = [-34, -6, -28, -12][i];
        kf.push({ transform: `translate(${travel}px,${oy}px)`, offset: base });
        kf.push({ transform: `translate(${travel * 0.78}px,${oy - 8}px)`, offset: base + 0.05 });
    }
    kf.push({ transform: 'translate(0,0)', offset: 1 });
    animateSpriteLayers(side, kf, { duration, easing: 'ease-in-out' });

    for (let i = 0; i < hits; i++) {
        setTimeout(() => {
            const oy = [-24, -2, -18, -8][i];
            // 3本の鉤爪痕
            for (let k = 0; k < 3; k++) {
                setTimeout(() => {
                    spawnSlashArc(to.x + (k - 1) * 6, to.y + oy + (k - 1) * 12, i % 2 === 0 ? -40 : 40, {
                        length: 88, width: 6, color: HINOTORI_EMBER, duration: 210 * EFFECT_SPEED_MULTIPLIER
                    });
                }, k * 30);
            }
            spawnImpactBurst(to.x, to.y + oy, { size: 24, duration: 250 * EFFECT_SPEED_MULTIPLIER });
        }, duration * (0.16 + (i / hits) * 0.66));
    }
    setTimeout(() => {
        spawnImpactBurst(to.x, to.y, { size: 38, duration: 380 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 13, rotate: 9 });
    }, duration * 0.88);
}
registerCustomSkillMotion('renzoku_kagizume', playRenzokuKagizumeMotion, 'ヒノトリ');

// --- 雄叫び：翼を大きく広げて咆哮し、相手を怯ませる ---
function playOtakebiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1000 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x;

    animateSpriteLayers(side, [
        { transform: 'translateY(0) scale(1,1)', offset: 0 },
        { transform: 'translateY(-10px) scale(1.14,1.1)', offset: 0.28 },  // 翼を広げる
        { transform: 'translateY(-6px) scale(0.96,0.98)', offset: 0.44 },  // 吠える
        { transform: 'translateY(0) scale(1.04,1.02)', offset: 0.6 },
        { transform: 'translateY(0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-out' });

    // 熱を帯びた咆哮の輪が押し寄せる
    for (let i = 0; i < 4; i++) {
        spawnCustomParticle('◯', from.x, from.y, {
            size: 44 + i * 8, delay: duration * 0.38 + i * 110, duration: 640 * EFFECT_SPEED_MULTIPLIER, color: HINOTORI_EMBER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.25)', opacity: 0 },
                { transform: `translate(${dx * 0.55}px,0) translate(-50%,-50%) scale(1.2)`, opacity: 0.9, offset: 0.5 },
                { transform: `translate(${dx}px,0) translate(-50%,-50%) scale(1.9)`, opacity: 0 }
            ]
        });
    }
    setTimeout(() => {
        animateSpriteLayers(otherSide(side), [
            { transform: 'translateX(0) scale(1,1)', offset: 0 },
            { transform: `translateX(${dx > 0 ? 12 : -12}px) scale(0.95,0.96)`, offset: 0.35 },
            { transform: 'translateX(0) scale(1,1)', offset: 1 }
        ], { duration: 620 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-out' });
        spawnImpactBurst(to.x, to.y - 20, { emoji: '😨', size: 28, duration: 480 * EFFECT_SPEED_MULTIPLIER });
    }, duration * 0.66);
}
registerCustomSkillMotion('otakebi', playOtakebiMotion, 'ヒノトリ');

// --- 爆裂落とし：高く舞い上がり、炎を纏って真上から落下する ---
function playBakuretsuOtoshiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1250 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x;

    animateSpriteLayers(side, [
        { transform: 'translate(0,0) rotate(0deg) scale(1,1)', offset: 0 },
        { transform: `translate(${dx * 0.3}px,-96px) rotate(0deg) scale(0.92,1.06)`, offset: 0.36 },
        { transform: `translate(${dx * 0.95}px,-104px) rotate(-160deg) scale(0.9,1.06)`, offset: 0.52 },
        { transform: `translate(${dx * 0.95}px,8px) rotate(-340deg) scale(1.1,0.94)`, offset: 0.7 },
        { transform: 'translate(0,0) rotate(-360deg) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 落下の炎の尾
    setTimeout(() => {
        spawnBeamLine(to.x, to.y - 110, 0, 110, HINOTORI_FLAME, 420 * EFFECT_SPEED_MULTIPLIER, 15);
    }, duration * 0.55);

    setTimeout(() => {
        spawnCustomParticle('◯', to.x, to.y + 8, {
            size: 78, duration: 540 * EFFECT_SPEED_MULTIPLIER, color: HINOTORI_FLAME,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.1)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.7)', opacity: 1, offset: 0.32 },
                { transform: 'translate(-50%,-50%) scale(2.8)', opacity: 0 }
            ]
        });
        spawnHinotoriFlames(to.x, to.y, 6, { spread: 70, rise: 46, size: 26 });
        spawnImpactBurst(to.x, to.y, { size: 52, duration: 520 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 18, rotate: 13, duration: 620 });
    }, duration * 0.7);
}
registerCustomSkillMotion('bakuretsu_otoshi', playBakuretsuOtoshiMotion, 'ヒノトリ');

// --- フレイムライン：地を這う一直線の炎（炎技の基本形） ---
function playFlameLineMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 880 * EFFECT_SPEED_MULTIPLIER;

    animateSpriteLayers(side, [
        { transform: 'scale(1,1) rotate(0deg)', offset: 0 },
        { transform: 'scale(1.08,1.04) rotate(-6deg)', offset: 0.26 },
        { transform: 'scale(0.96,0.98) rotate(6deg)', offset: 0.44 },
        { transform: 'scale(1,1) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-out' });

    setTimeout(() => {
        const groundY = Math.max(from.y, to.y) + 18;
        spawnBeamLine(from.x, groundY, to.x - from.x, 0, HINOTORI_FLAME, 460 * EFFECT_SPEED_MULTIPLIER, 12);
        // 通過した所から炎が立ち上がる
        for (let i = 0; i < 4; i++) {
            const t = (i + 1) / 5;
            spawnHinotoriFlames(from.x + (to.x - from.x) * t, groundY, 1, { size: 22, rise: 28, duration: 400 });
        }
        setTimeout(() => {
            spawnImpactBurst(to.x, to.y, { size: 38, duration: 400 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: 12, rotate: 9 });
        }, 320 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.44);
}
registerCustomSkillMotion('flame_line', playFlameLineMotion, 'ヒノトリ');

// --- フレイムビーム：くちばしから極太の炎を放つ ---
function playFlameBeamMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const chargeMs = 520 * EFFECT_SPEED_MULTIPLIER;
    const beamMs = 620 * EFFECT_SPEED_MULTIPLIER;

    animateSpriteLayers(side, [
        { transform: 'scale(1,1)', offset: 0 },
        { transform: 'scale(1.1,1.06)', offset: 0.3 },
        { transform: 'scale(0.94,0.96)', offset: 0.46 },
        { transform: 'scale(1,1)', offset: 1 }
    ], { duration: chargeMs + beamMs, easing: 'ease-out' });
    spawnSelfParticleRing(casterEl, '🔥', 4, 18, chargeMs, 30);

    setTimeout(() => {
        spawnBeamLine(from.x, from.y, to.x - from.x, to.y - from.y, HINOTORI_FLAME, beamMs, 18);
        setTimeout(() => {
            spawnHinotoriFlames(to.x, to.y, 5, { spread: 56, rise: 40 });
            spawnImpactBurst(to.x, to.y, { size: 46, duration: 460 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: 15, rotate: 11, duration: 560 });
        }, beamMs * 0.3);
    }, chargeMs);
}
registerCustomSkillMotion('flame_beam', playFlameBeamMotion, 'ヒノトリ');

// --- フレイムタイフーン：炎の渦を巻き起こして相手を巻き上げる ---
function playFlameTyphoonMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const duration = 1200 * EFFECT_SPEED_MULTIPLIER;

    // 翼を高速で羽ばたかせて渦を起こす
    animateSpriteLayers(side, [
        { transform: 'scale(1,1)', offset: 0 },
        { transform: 'scale(1.12,0.94)', offset: 0.16 },
        { transform: 'scale(0.94,1.1)', offset: 0.3 },
        { transform: 'scale(1.1,0.96)', offset: 0.44 },
        { transform: 'scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        // 炎の渦が縦に伸びて立ち上がる
        for (let i = 0; i < 5; i++) {
            spawnCustomParticle('🌀', to.x, to.y + 20 - i * 16, {
                size: 28 + i * 3, delay: i * 70, duration: 620 * EFFECT_SPEED_MULTIPLIER, color: HINOTORI_FLAME,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4) rotate(0deg)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.25) rotate(320deg)', opacity: 1, offset: 0.45 },
                    { transform: 'translate(0,-22px) translate(-50%,-50%) scale(0.9) rotate(580deg)', opacity: 0 }
                ]
            });
        }
        spawnHinotoriFlames(to.x, to.y + 16, 5, { spread: 52, rise: 54 });
        // 巻き上げられて回る
        animateSpriteLayers(otherSide(side), [
            { transform: 'translateY(0) rotate(0deg)', offset: 0 },
            { transform: 'translateY(-24px) rotate(-160deg)', offset: 0.4 },
            { transform: 'translateY(-14px) rotate(-300deg)', offset: 0.66 },
            { transform: 'translateY(4px) rotate(-350deg)', offset: 0.88 },
            { transform: 'translateY(0) rotate(-360deg)', offset: 1 }
        ], { duration: 780 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-in-out' });
        spawnImpactBurst(to.x, to.y, { size: 42, duration: 440 * EFFECT_SPEED_MULTIPLIER });
    }, duration * 0.44);
}
registerCustomSkillMotion('flame_typhoon', playFlameTyphoonMotion, 'ヒノトリ');

// --- ファイアウェーブ：炎の壁が面となって押し寄せる ---
function playFireWaveMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1150 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x;

    animateSpriteLayers(side, [
        { transform: 'scale(1,1)', offset: 0 },
        { transform: 'scale(1.14,1.08)', offset: 0.28 },
        { transform: 'scale(0.94,0.96)', offset: 0.44 },
        { transform: 'scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-out' });

    setTimeout(() => {
        // 縦に長い炎の壁が横へ移動していく（「面で押し寄せる」表現）
        for (let i = 0; i < 3; i++) {
            spawnCustomParticle('◼', from.x, from.y, {
                size: 56, delay: i * 120, duration: 620 * EFFECT_SPEED_MULTIPLIER, color: HINOTORI_FLAME,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scaleX(0.3) scaleY(1.6)', opacity: 0 },
                    { transform: `translate(${dx * 0.5}px,0) translate(-50%,-50%) scaleX(0.5) scaleY(2)`, opacity: 0.9, offset: 0.5 },
                    { transform: `translate(${dx}px,0) translate(-50%,-50%) scaleX(0.6) scaleY(2.2)`, opacity: 0 }
                ]
            });
        }
        setTimeout(() => {
            spawnHinotoriFlames(to.x, to.y + 10, 6, { spread: 66, rise: 44, size: 26 });
            spawnImpactBurst(to.x, to.y, { size: 46, duration: 460 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: 15, rotate: 11, duration: 560 });
        }, 480 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.42);
}
registerCustomSkillMotion('fire_wave', playFireWaveMotion, 'ヒノトリ');

// --- ファイヤーバード：自らが炎の鳥と化して突撃する ---
function playFireBirdMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1250 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x;

    animateSpriteLayers(side, [
        { transform: 'translate(0,0) scale(1,1)', offset: 0 },
        { transform: 'translate(0,-16px) scale(1.12,1.08)', offset: 0.3 },       // 炎を纏う
        { transform: 'translate(0,-16px) scale(1.14,1.1)', offset: 0.44 },
        { transform: `translate(${dx * 1.05}px,-8px) scale(1.16,1.02)`, offset: 0.66 }, // 突き抜ける
        { transform: `translate(${dx * 0.5}px,0) scale(1.05,1)`, offset: 0.82 },
        { transform: 'translate(0,0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    spawnSelfParticleRing(casterEl, '🔥', 6, 20, 560 * EFFECT_SPEED_MULTIPLIER, 40);

    // 突撃の軌跡に炎を置いていく
    setTimeout(() => {
        for (let i = 0; i < 6; i++) {
            const t = i / 6;
            spawnCustomParticle('🔥', from.x + dx * t, from.y - 8, {
                size: 26 + Math.random() * 8, delay: i * 45, duration: 460 * EFFECT_SPEED_MULTIPLIER, color: HINOTORI_FLAME,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.35)', opacity: 1, offset: 0.35 },
                    { transform: 'translate(0,-24px) translate(-50%,-50%) scale(0.7)', opacity: 0 }
                ]
            });
        }
    }, duration * 0.46);

    setTimeout(() => {
        spawnHinotoriFlames(to.x, to.y, 6, { spread: 66, rise: 48, size: 28 });
        spawnImpactBurst(to.x, to.y, { size: 50, duration: 500 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 17, rotate: 12, duration: 600 });
    }, duration * 0.62);
}
registerCustomSkillMotion('fire_bird', playFireBirdMotion, 'ヒノトリ');

// --- エボニーノヴァ：黒き炎を凝縮させ、超新星のように解き放つ（ヒノトリ最大の大技） ---
function playEbonyNovaMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1600 * EFFECT_SPEED_MULTIPLIER;

    // 全技中もっとも長いため（黒炎が渦を巻いて集まる）
    animateSpriteLayers(side, [
        { transform: 'translate(0,0) scale(1,1)', offset: 0 },
        { transform: 'translate(-2px,-4px) scale(1.06,1.04)', offset: 0.16 },
        { transform: 'translate(2px,-8px) scale(1.1,1.08)', offset: 0.3 },
        { transform: 'translate(-2px,-12px) scale(1.16,1.12)', offset: 0.46 },
        { transform: 'translate(0,-12px) scale(1.18,1.14)', offset: 0.56 },
        { transform: 'translate(0,0) scale(0.96,0.98)', offset: 0.68 },
        { transform: 'translate(0,0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8;
        const r = 68;
        spawnCustomParticle('🔥', from.x + Math.cos(a) * r, from.y + Math.sin(a) * r * 0.7, {
            size: 24, delay: 80 + i * 60, duration: 560 * EFFECT_SPEED_MULTIPLIER, color: HINOTORI_EBONY,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.15)', opacity: 1, offset: 0.4 },
                { transform: `translate(${-Math.cos(a) * r}px,${-Math.sin(a) * r * 0.7}px) translate(-50%,-50%) scale(0.4)`, opacity: 0 }
            ]
        });
    }

    // 超新星：一点に潰れてから爆発的に膨張する
    setTimeout(() => {
        spawnCustomParticle('⬤', to.x, to.y, {
            size: 42, duration: 440 * EFFECT_SPEED_MULTIPLIER, color: HINOTORI_EBONY,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(2.2)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(0.25)', opacity: 1, offset: 0.6 },
                { transform: 'translate(-50%,-50%) scale(0.1)', opacity: 1 }
            ]
        });
        setTimeout(() => {
            spawnCustomParticle('◯', to.x, to.y, {
                size: 94, duration: 640 * EFFECT_SPEED_MULTIPLIER, color: HINOTORI_EBONY,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.05)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(2)', opacity: 1, offset: 0.3 },
                    { transform: 'translate(-50%,-50%) scale(3.5)', opacity: 0 }
                ]
            });
            for (let i = 0; i < 8; i++) {
                const a = (Math.PI * 2 * i) / 8;
                spawnCustomParticle('🔥', to.x, to.y, {
                    size: 28, delay: i * 40, duration: 580 * EFFECT_SPEED_MULTIPLIER,
                    color: i % 2 === 0 ? HINOTORI_EBONY : HINOTORI_FLAME,
                    keyframes: [
                        { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                        { transform: `translate(${Math.cos(a) * 52}px,${Math.sin(a) * 42}px) translate(-50%,-50%) scale(1.35)`, opacity: 1, offset: 0.4 },
                        { transform: `translate(${Math.cos(a) * 88}px,${Math.sin(a) * 70}px) translate(-50%,-50%) scale(0.6)`, opacity: 0 }
                    ]
                });
            }
            spawnImpactBurst(to.x, to.y, { size: 62, duration: 580 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: 21, rotate: 15, duration: 660 });
        }, 440 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.62);
}
registerCustomSkillMotion('ebony_nova', playEbonyNovaMotion, 'ヒノトリ');
