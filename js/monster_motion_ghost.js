// =====================================================
// monster_motion_ghost.js
// ゴースト専用のバトルモーション演出。
//
// ゴーストの特徴（＝演出の軸）：
//   ・実体を持たない幽霊 → 移動は「すうっと薄くなって現れ直す」形にし、
//                          足で走らず必ず透明度の変化を伴わせる
//   ・おふざけ系の技      → ピコピコハンマー・カード・大きなおとしものは
//                          コミカルに（小気味よく、大げさに）
//   ・ホラー系の技        → ドクロビーム・のろい・おどかすは
//                          紫と骸骨で不気味に。同じモンスターでも2つの顔を描き分ける
//
// 対応技：ピコピコハンマー／体当たり／大パンチ／コンビネーション／おどかす／ドクロビーム／
//         びっくりドクロ／カード／大きなおとしもの／ゴーストフラッシュ／のろい／ドロン
// =====================================================

const GHOST_SPOOK = '#a97fd6';  // 不気味な紫
const GHOST_PALE = '#dcd6ea';   // 幽霊の淡い白

// --- ゴースト共通：すうっと消えて、目標の位置に現れ直す（実体が無いことの表現） ---
//   戻り値は「出現し終わるタイミング（ms）」。着弾演出をここに合わせる。
function playGhostPhaseMove(side, opts = {}) {
    const { duration = 760, reach = 0.66 } = opts;
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return null;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const d = duration * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * reach;

    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1)', opacity: 1, offset: 0 },
        { transform: 'translateX(0) scale(1.02)', opacity: 0.15, offset: 0.24 },        // 消える
        { transform: `translateX(${travel}px) scale(1.02)`, opacity: 0.15, offset: 0.4 }, // 見えないまま移動
        { transform: `translateX(${travel}px) scale(1.05)`, opacity: 1, offset: 0.5 },    // 現れる
        { transform: `translateX(${travel}px) scale(1.05)`, opacity: 1, offset: 0.64 },
        { transform: 'translateX(0) scale(1)', opacity: 1, offset: 1 }
    ], { duration: d, easing: 'ease-in-out' });

    return { duration: d, impactAt: d * 0.52, from, to };
}

// --- ピコピコハンマー：おもちゃのハンマーで小気味よく叩く（コミカル） ---
function playPikoHammerMotion(side) {
    const r = playGhostPhaseMove(side, { duration: 700, reach: 0.6 });
    if (!r) return;
    setTimeout(() => {
        // ハンマーが振り下ろされる
        spawnCustomParticle('🔨', r.to.x, r.to.y - 34, {
            size: 32, duration: 380 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) rotate(-60deg) scale(0.7)', opacity: 0 },
                { transform: 'translate(-50%,-50%) rotate(10deg) scale(1.15)', opacity: 1, offset: 0.45 },
                { transform: 'translate(0,20px) translate(-50%,-50%) rotate(20deg) scale(1)', opacity: 0 }
            ]
        });
        // 「ピコッ」という軽さを、小さめの衝撃と星で表す
        spawnImpactBurst(r.to.x, r.to.y, { size: 26, duration: 280 * EFFECT_SPEED_MULTIPLIER });
        spawnCustomParticle('⭐', r.to.x + 14, r.to.y - 18, {
            size: 18, delay: 60, duration: 380 * EFFECT_SPEED_MULTIPLIER, color: '#ffd84d',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0.4 },
                { transform: 'translate(8px,-12px) translate(-50%,-50%) scale(0.7)', opacity: 0 }
            ]
        });
        playRecoilMotion(otherSide(side), { distance: 8, rotate: 6 });
    }, r.impactAt);
}
registerCustomSkillMotion('piko_hammer', playPikoHammerMotion, 'ゴースト');

// --- 体当たり：実体の無い体で、すり抜けるようにぶつかる ---
function playGhostTaiatariMotion(side) {
    const r = playGhostPhaseMove(side, { duration: 720, reach: 0.85 });
    if (!r) return;
    setTimeout(() => {
        // すり抜ける表現として、相手の位置に淡い残像を置く
        spawnCustomParticle('◯', r.to.x, r.to.y, {
            size: 54, duration: 400 * EFFECT_SPEED_MULTIPLIER, color: GHOST_PALE,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 0.75, offset: 0.4 },
                { transform: 'translate(-50%,-50%) scale(1.7)', opacity: 0 }
            ]
        });
        spawnImpactBurst(r.to.x, r.to.y, { size: 30, duration: 320 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 10, rotate: 7 });
    }, r.impactAt);
}
registerCustomSkillMotion('taiatari', playGhostTaiatariMotion, 'ゴースト');

// --- 大パンチ：大きく振りかぶった、重い一撃 ---
function playOhpunchMotion(side) {
    const r = playGhostPhaseMove(side, { duration: 820, reach: 0.62 });
    if (!r) return;
    setTimeout(() => {
        spawnCustomParticle('✊', r.to.x, r.to.y, {
            size: 34, duration: 360 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 1, offset: 0.4 },
                { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 0 }
            ]
        });
        spawnImpactBurst(r.to.x, r.to.y, { size: 40, duration: 380 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 14, rotate: 10 });
    }, r.impactAt);
}
registerCustomSkillMotion('ohpunch', playOhpunchMotion, 'ゴースト');

// --- コンビネーション：消えては現れながら、位置を変えて連打する ---
function playGhostCombinationMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1150 * EFFECT_SPEED_MULTIPLIER;
    const travel = (to.x - from.x) * 0.7;
    const hits = 3;

    // 打つたびに一瞬消えて、別の高さに現れ直す
    const kf = [{ transform: 'translate(0,0)', opacity: 1, offset: 0 }];
    for (let i = 0; i < hits; i++) {
        const base = 0.18 + (i / hits) * 0.62;
        const oy = (i === 0) ? -20 : (i === 1 ? 16 : -6);
        kf.push({ transform: `translate(${travel * 0.5}px,${oy}px)`, opacity: 0.15, offset: base - 0.05 });
        kf.push({ transform: `translate(${travel}px,${oy}px)`, opacity: 1, offset: base });
    }
    kf.push({ transform: 'translate(0,0)', opacity: 1, offset: 1 });
    animateSpriteLayers(side, kf, { duration, easing: 'ease-in-out' });

    for (let i = 0; i < hits; i++) {
        setTimeout(() => {
            const oy = (i === 0) ? -18 : (i === 1 ? 14 : -4);
            spawnImpactBurst(to.x, to.y + oy, { size: i === hits - 1 ? 36 : 26, duration: 300 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: i === hits - 1 ? 12 : 7, rotate: i === hits - 1 ? 9 : 5, duration: 320 });
        }, duration * (0.18 + (i / hits) * 0.62));
    }
}
registerCustomSkillMotion('combination', playGhostCombinationMotion, 'ゴースト');

// --- おどかす：突然大きくなって相手を怖がらせる ---
function playOdokasuMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 900 * EFFECT_SPEED_MULTIPLIER;

    // 一度小さくすぼまってから、いきなり膨れ上がる（「わっ！」の間の取り方）
    animateSpriteLayers(side, [
        { transform: 'scale(1,1)', opacity: 1, offset: 0 },
        { transform: 'scale(0.86,0.9)', opacity: 0.8, offset: 0.26 },  // ためる
        { transform: 'scale(1.45,1.4)', opacity: 1, offset: 0.4 },     // わっ！
        { transform: 'scale(1.3,1.28)', opacity: 1, offset: 0.56 },
        { transform: 'scale(1,1)', opacity: 1, offset: 1 }
    ], { duration, easing: 'ease-out' });

    setTimeout(() => {
        spawnCustomParticle('👻', from.x, from.y, {
            size: 52, duration: 460 * EFFECT_SPEED_MULTIPLIER, color: GHOST_PALE,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.5)', opacity: 0.9, offset: 0.35 },
                { transform: 'translate(-50%,-50%) scale(2)', opacity: 0 }
            ]
        });
        // 驚いて跳び上がる
        animateSpriteLayers(otherSide(side), [
            { transform: 'translateY(0) scale(1,1)', offset: 0 },
            { transform: 'translateY(-16px) scale(0.94,1.1)', offset: 0.25 },
            { transform: 'translateY(0) scale(1.06,0.94)', offset: 0.5 },
            { transform: 'translateY(-5px) scale(1,1)', offset: 0.72 },
            { transform: 'translateY(0) scale(1,1)', offset: 1 }
        ], { duration: 640 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-out' });
        spawnImpactBurst(to.x, to.y - 24, { emoji: '😱', size: 30, duration: 500 * EFFECT_SPEED_MULTIPLIER });
    }, duration * 0.4);
}
registerCustomSkillMotion('odokasu', playOdokasuMotion, 'ゴースト');

// --- ドクロビーム：眼から不気味な紫の光線を放つ ---
function playDokuroBeamMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const chargeMs = 460 * EFFECT_SPEED_MULTIPLIER;
    const beamMs = 560 * EFFECT_SPEED_MULTIPLIER;

    animateSpriteLayers(side, [
        { transform: 'scale(1)', offset: 0 },
        { transform: 'scale(1.06)', offset: 0.34 },
        { transform: 'scale(0.98)', offset: 0.5 },
        { transform: 'scale(1)', offset: 1 }
    ], { duration: chargeMs + beamMs, easing: 'ease-in-out' });

    // ドクロが集まってくる
    for (let i = 0; i < 3; i++) {
        const a = (Math.PI * 2 * i) / 3;
        spawnCustomParticle('💀', from.x + Math.cos(a) * 34, from.y + Math.sin(a) * 26, {
            size: 22, delay: i * 80, duration: chargeMs, color: GHOST_SPOOK,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0.45 },
                { transform: `translate(${-Math.cos(a) * 34}px,${-Math.sin(a) * 26}px) translate(-50%,-50%) scale(0.4)`, opacity: 0 }
            ]
        });
    }

    setTimeout(() => {
        spawnBeamLine(from.x, from.y - 4, to.x - from.x, to.y - (from.y - 4), GHOST_SPOOK, beamMs, 12);
        setTimeout(() => {
            spawnImpactBurst(to.x, to.y, { emoji: '💀', size: 42, duration: 440 * EFFECT_SPEED_MULTIPLIER, color: GHOST_SPOOK });
            playRecoilMotion(otherSide(side), { distance: 12, rotate: 9 });
        }, beamMs * 0.3);
    }, chargeMs);
}
registerCustomSkillMotion('dokuro_beam', playDokuroBeamMotion, 'ゴースト');

// --- びっくりドクロ：相手の目の前に巨大なドクロが突然現れる ---
function playBikkuriDokuroMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const duration = 950 * EFFECT_SPEED_MULTIPLIER;

    // 術者は静かに手を掲げるだけ（驚かせるのは相手側の出来事なので、こちらは動きを抑える）
    animateSpriteLayers(side, [
        { transform: 'translateY(0)', offset: 0 },
        { transform: 'translateY(-8px)', offset: 0.3 },
        { transform: 'translateY(-8px)', offset: 0.48 },
        { transform: 'translateY(0)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    setTimeout(() => {
        // 何もない所から一気に巨大なドクロが出現する
        spawnCustomParticle('💀', to.x, to.y - 6, {
            size: 78, duration: 620 * EFFECT_SPEED_MULTIPLIER, color: GHOST_SPOOK,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.05) rotate(-20deg)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.4) rotate(5deg)', opacity: 1, offset: 0.3 },
                { transform: 'translate(-50%,-50%) scale(1.2) rotate(0deg)', opacity: 1, offset: 0.6 },
                { transform: 'translate(-50%,-50%) scale(1.5) rotate(-4deg)', opacity: 0 }
            ]
        });
        // 腰を抜かすほど驚く
        animateSpriteLayers(otherSide(side), [
            { transform: 'translate(0,0) rotate(0deg) scale(1)', offset: 0 },
            { transform: 'translate(0,-20px) rotate(-8deg) scale(0.92)', offset: 0.2 },
            { transform: 'translate(6px,6px) rotate(9deg) scale(1.02)', offset: 0.45 },
            { transform: 'translate(-4px,2px) rotate(-5deg) scale(0.99)', offset: 0.7 },
            { transform: 'translate(0,0) rotate(0deg) scale(1)', offset: 1 }
        ], { duration: 720 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-out' });
        spawnImpactBurst(to.x, to.y, { size: 38, duration: 400 * EFFECT_SPEED_MULTIPLIER, color: GHOST_SPOOK });
    }, duration * 0.46);
}
registerCustomSkillMotion('bikkuri_dokuro', playBikkuriDokuroMotion, 'ゴースト');

// --- カード：トランプを扇状にばら撒いて斬りつける ---
function playCardMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 900 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x, dy = to.y - from.y;

    // 手札を切って、撒く
    animateSpriteLayers(side, [
        { transform: 'rotate(0deg) translateX(0)', offset: 0 },
        { transform: 'rotate(-10deg) translateX(-5px)', offset: 0.24 },
        { transform: 'rotate(10deg) translateX(7px)', offset: 0.42 },
        { transform: 'rotate(0deg) translateX(0)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 5枚のカードが扇状に飛ぶ
    for (let i = 0; i < 5; i++) {
        const spread = (i - 2) * 18;
        spawnCustomParticle('🃏', from.x, from.y, {
            size: 24, delay: duration * 0.36 + i * 55, duration: 540 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.5) rotate(0deg)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px,${dy * 0.5 + spread * 0.5}px) translate(-50%,-50%) scale(1) rotate(240deg)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${dx}px,${dy + spread}px) translate(-50%,-50%) scale(0.9) rotate(480deg)`, opacity: 0 }
            ]
        });
    }
    setTimeout(() => {
        spawnSlashArc(to.x, to.y, -18, { length: 100, width: 6, color: GHOST_PALE, duration: 260 * EFFECT_SPEED_MULTIPLIER });
        spawnImpactBurst(to.x, to.y, { size: 32, duration: 340 * EFFECT_SPEED_MULTIPLIER });
        playRecoilMotion(otherSide(side), { distance: 10, rotate: 7 });
    }, duration * 0.68);
}
registerCustomSkillMotion('card', playCardMotion, 'ゴースト');

// --- 大きなおとしもの：頭上から特大の重りを落とす（コミカルな大技） ---
function playOhkiOtoshimonoMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const to = getElCenter(targetEl);
    const duration = 1150 * EFFECT_SPEED_MULTIPLIER;

    // 上を指差してから、知らんぷり
    animateSpriteLayers(side, [
        { transform: 'translateY(0) rotate(0deg)', offset: 0 },
        { transform: 'translateY(-8px) rotate(-6deg)', offset: 0.26 },
        { transform: 'translateY(0) rotate(0deg)', offset: 0.5 },
        { transform: 'translateY(0) rotate(0deg)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 相手の頭上に影が差してから、どすんと落ちる（落ちる前の「間」が可笑しみになる）
    setTimeout(() => {
        spawnCustomParticle('◯', to.x, to.y + 20, {
            size: 46, duration: 520 * EFFECT_SPEED_MULTIPLIER, color: '#1a1a1a',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3) scaleY(0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1) scaleY(0.35)', opacity: 0.6, offset: 0.5 },
                { transform: 'translate(-50%,-50%) scale(1.2) scaleY(0.4)', opacity: 0.7, offset: 1 }
            ]
        });
    }, duration * 0.34);

    setTimeout(() => {
        spawnCustomParticle('🗿', to.x, to.y - 90, {
            size: 56, duration: 340 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-in',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.9)', opacity: 0 },
                { transform: 'translate(0,50px) translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.4 },
                { transform: 'translate(0,96px) translate(-50%,-50%) scale(1.05)', opacity: 1 }
            ]
        });
        setTimeout(() => {
            spawnImpactBurst(to.x, to.y + 10, { size: 52, duration: 480 * EFFECT_SPEED_MULTIPLIER });
            for (let i = 0; i < 4; i++) {
                const dir = i % 2 === 0 ? -1 : 1;
                spawnCustomParticle('💨', to.x, to.y + 18, {
                    size: 22, delay: i * 40, duration: 440 * EFFECT_SPEED_MULTIPLIER,
                    keyframes: [
                        { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                        { transform: `translate(${dir * 30}px,-6px) translate(-50%,-50%) scale(1.2)`, opacity: 0.9, offset: 0.45 },
                        { transform: `translate(${dir * 52}px,2px) translate(-50%,-50%) scale(1.6)`, opacity: 0 }
                    ]
                });
            }
            playRecoilMotion(otherSide(side), { distance: 16, rotate: 12, duration: 580 });
        }, 300 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.56);
}
registerCustomSkillMotion('ohki_otoshimono', playOhkiOtoshimonoMotion, 'ゴースト');

// --- ゴーストフラッシュ：全身が発光し、視界を白く焼く ---
function playGhostFlashMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 880 * EFFECT_SPEED_MULTIPLIER;

    // 光を溜めて、一気に弾ける
    animateSpriteLayers(side, [
        { transform: 'scale(1)', opacity: 1, offset: 0 },
        { transform: 'scale(0.94)', opacity: 1, offset: 0.28 },
        { transform: 'scale(1.15)', opacity: 0.7, offset: 0.42 },
        { transform: 'scale(1)', opacity: 1, offset: 1 }
    ], { duration, easing: 'ease-out' });

    setTimeout(() => {
        // 画面を白く染めるような大きな閃光
        spawnCustomParticle('◯', from.x, from.y, {
            size: 90, duration: 480 * EFFECT_SPEED_MULTIPLIER, color: '#ffffff',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.1)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(2.2)', opacity: 0.95, offset: 0.3 },
                { transform: 'translate(-50%,-50%) scale(3.4)', opacity: 0 }
            ]
        });
        // 目が眩んでよろける
        animateSpriteLayers(otherSide(side), [
            { transform: 'rotate(0deg) translateX(0)', offset: 0 },
            { transform: 'rotate(-6deg) translateX(-5px)', offset: 0.3 },
            { transform: 'rotate(5deg) translateX(4px)', offset: 0.6 },
            { transform: 'rotate(0deg) translateX(0)', offset: 1 }
        ], { duration: 620 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-out' });
        for (let i = 0; i < 3; i++) {
            const a = (Math.PI * 2 * i) / 3;
            spawnCustomParticle('✨', to.x, to.y - 18, {
                size: 20, delay: i * 70, duration: 520 * EFFECT_SPEED_MULTIPLIER, color: '#ffffff',
                keyframes: [
                    { transform: `translate(${Math.cos(a) * 18}px,${Math.sin(a) * 8}px) translate(-50%,-50%) scale(0.4)`, opacity: 0 },
                    { transform: `translate(${Math.cos(a + 2.1) * 22}px,${Math.sin(a + 2.1) * 10}px) translate(-50%,-50%) scale(1.1)`, opacity: 1, offset: 0.45 },
                    { transform: `translate(${Math.cos(a + 4.2) * 18}px,${Math.sin(a + 4.2) * 8}px) translate(-50%,-50%) scale(0.7)`, opacity: 0 }
                ]
            });
        }
    }, duration * 0.42);
}
registerCustomSkillMotion('ghost_flash', playGhostFlashMotion, 'ゴースト');

// --- のろい：じっとりと呪詛を送り込む ---
function playNoroiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1200 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x, dy = to.y - from.y;

    // 動きは最小限。じわじわとした不気味さで見せる
    animateSpriteLayers(side, [
        { transform: 'scale(1,1)', opacity: 1, offset: 0 },
        { transform: 'scale(1.03,0.98)', opacity: 0.85, offset: 0.3 },
        { transform: 'scale(0.98,1.03)', opacity: 1, offset: 0.6 },
        { transform: 'scale(1,1)', opacity: 1, offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 呪いがゆっくり漂って相手に絡みつく
    for (let i = 0; i < 4; i++) {
        const wave = (i % 2 === 0) ? -20 : 18;
        spawnCustomParticle('🕯️', from.x, from.y, {
            size: 22, delay: duration * 0.3 + i * 110, duration: 700 * EFFECT_SPEED_MULTIPLIER, color: GHOST_SPOOK,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px,${dy * 0.5 + wave}px) translate(-50%,-50%) scale(1)`, opacity: 0.9, offset: 0.5 },
                { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(0.7)`, opacity: 0 }
            ]
        });
    }
    // 呪いの輪が締まっていく
    setTimeout(() => {
        for (let i = 0; i < 3; i++) {
            spawnCustomParticle('◯', to.x, to.y, {
                size: 56, delay: i * 140, duration: 640 * EFFECT_SPEED_MULTIPLIER, color: GHOST_SPOOK,
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(1.6) rotate(0deg)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(0.9) rotate(90deg)', opacity: 0.9, offset: 0.55 },
                    { transform: 'translate(-50%,-50%) scale(0.6) rotate(180deg)', opacity: 0 }
                ]
            });
        }
        animateSpriteLayers(otherSide(side), [
            { transform: 'scale(1,1) rotate(0deg)', offset: 0 },
            { transform: 'scale(0.94,1.05) rotate(-3deg)', offset: 0.35 },
            { transform: 'scale(1.02,0.98) rotate(3deg)', offset: 0.68 },
            { transform: 'scale(1,1) rotate(0deg)', offset: 1 }
        ], { duration: 700 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-in-out' });
        spawnImpactBurst(to.x, to.y - 20, { emoji: '💀', size: 30, duration: 560 * EFFECT_SPEED_MULTIPLIER, color: GHOST_SPOOK });
    }, duration * 0.62);
}
registerCustomSkillMotion('noroi', playNoroiMotion, 'ゴースト');

// --- ドロン：煙とともに姿を消す（回避態勢に入る） ---
function playDoronMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    if (!casterEl) return;
    const { x, y } = getElCenter(casterEl);
    const duration = 900 * EFFECT_SPEED_MULTIPLIER;

    // ぼんっと煙に包まれて薄くなり、また戻ってくる
    animateSpriteLayers(side, [
        { transform: 'scale(1,1)', opacity: 1, offset: 0 },
        { transform: 'scale(1.1,0.9)', opacity: 1, offset: 0.2 },
        { transform: 'scale(0.7,1.2)', opacity: 0.1, offset: 0.42 },  // 消える
        { transform: 'scale(0.9,1.05)', opacity: 0.35, offset: 0.7 },
        { transform: 'scale(1,1)', opacity: 1, offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 立ちこめる煙
    for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 * i) / 5;
        spawnCustomParticle('💨', x, y, {
            size: 26, delay: i * 45, duration: 620 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: `translate(${Math.cos(a) * 26}px,${Math.sin(a) * 20}px) translate(-50%,-50%) scale(1.3)`, opacity: 0.9, offset: 0.4 },
                { transform: `translate(${Math.cos(a) * 46}px,${Math.sin(a) * 34 - 10}px) translate(-50%,-50%) scale(1.8)`, opacity: 0 }
            ]
        });
    }
}
registerCustomSkillMotion('doron', playDoronMotion, 'ゴースト');
