// =====================================================
// monster_motion_mochi.js
// モッチー専用の丁寧なバトルモーション演出。
// skill_effects.js の CUSTOM_SKILL_MOTIONS 仕組みを使い、モッチーの技だけ
// 汎用の絵文字エフェクトではなく、スプライト自体を動かす・専用の粒子演出を
// 個別に再生する。今後は他モンスターも同じ要領で1体ずつファイルを追加していく想定。
//
// 対応技：
//   ・sakuranomai    （桜の舞）    ：自身が横回転しながら、周囲にさくらの花びらが舞う
//   ・gaccho         （ガッチョ）  ：ピンクの手（🖐️）で2回攻撃。着地位置を少しずつずらして2回表示
//   ・sakurafubuki   （さくら吹雪）：モッチーから複数のさくらが飛んでいき、敵の位置で舞う
//   ・cho_rollinmochi（超ローリンモッチ）：モッチー自身が丸くなって相手に激突する
//   ・mossama        （もっさま）  ：ジャンプ→空中で丸まり、相手の上から落下する
//   ・yaezakura      （八重ざくら）：自身の周囲にさくらの花びら＋キラキラが舞う（回復演出）
// ※超もっち砲（cho_mochihou）はビームの太さのみ skill_effects.js 側の
//   SKILL_EFFECT_OVERRIDES（beamWidth）で調整済みのため、ここでは扱わない。
// =====================================================

// --- 桜の舞：自身が横回転（rotateY）しながら、周囲にさくらの花びらが舞う ---
function playSakuranomaiMotion(side) {
    // 絵柄本体とオーラ着色を一緒に回す（本体だけ回すと着色が回らずズレてしまうため）
    animateSpriteLayers(side, [
        { transform: 'perspective(500px) rotateY(0deg)' },
        { transform: 'perspective(500px) rotateY(180deg)', offset: 0.5 },
        { transform: 'perspective(500px) rotateY(360deg)' }
    ], { duration: 700 * EFFECT_SPEED_MULTIPLIER, easing: 'ease-in-out' });

    const casterContainer = getBattleSpriteContainerEl(side);
    spawnSelfParticleRing(casterContainer, '🌸', 6, 20, 650 * EFFECT_SPEED_MULTIPLIER);
}
registerCustomSkillMotion('sakuranomai', playSakuranomaiMotion, 'モッチー');

// --- ガッチョ：ピンクの🖐️で2回攻撃。位置を少しずつずらしながら2回表示 ---
function playGacchoMotion(side) {
    const targetContainer = getBattleSpriteContainerEl(otherSide(side));
    if (!targetContainer) return;
    const { x, y } = getElCenter(targetContainer);
    const hitOffsets = [{ dx: -14, dy: -6 }, { dx: 14, dy: 8 }];
    hitOffsets.forEach((offset, i) => {
        setTimeout(() => {
            spawnCustomParticle('🖐️', x + offset.dx, y + offset.dy, {
                size: 30,
                duration: 340 * EFFECT_SPEED_MULTIPLIER,
                color: '#ff7fc0',
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.3) rotate(-20deg)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.35) rotate(10deg)', opacity: 1, offset: 0.45 },
                    { transform: 'translate(-50%,-50%) scale(1) rotate(0deg)', opacity: 0 }
                ]
            });
        }, i * 230 * EFFECT_SPEED_MULTIPLIER);
    });
}
registerCustomSkillMotion('gaccho', playGacchoMotion, 'モッチー');

// --- さくら吹雪：モッチーから複数のさくらが飛んでいき、敵の位置で舞う ---
function playSakurafubukiMotion(side) {
    const casterContainer = getBattleSpriteContainerEl(side);
    const targetContainer = getBattleSpriteContainerEl(otherSide(side));
    if (!casterContainer || !targetContainer) return;
    const from = getElCenter(casterContainer);
    const to = getElCenter(targetContainer);
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    const count = 6;
    const flightDuration = 360 * EFFECT_SPEED_MULTIPLIER;
    const swirlDuration = 420 * EFFECT_SPEED_MULTIPLIER;
    const totalDuration = flightDuration + swirlDuration;
    const flightOffset = flightDuration / totalDuration;

    for (let i = 0; i < count; i++) {
        const jitter = (Math.random() - 0.5) * 30;
        spawnCustomParticle('🌸', from.x, from.y, {
            size: 16 + Math.random() * 6,
            duration: totalDuration,
            delay: i * 65 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.5) rotate(0deg)', opacity: 0, offset: 0 },
                { transform: `translate(${dx * 0.55 + jitter}px, ${dy * 0.55 - 22}px) translate(-50%,-50%) scale(1) rotate(200deg)`, opacity: 1, offset: flightOffset * 0.7 },
                { transform: `translate(${dx + jitter}px, ${dy}px) translate(-50%,-50%) scale(1.1) rotate(360deg)`, opacity: 1, offset: flightOffset },
                { transform: `translate(${dx + jitter * 1.4}px, ${dy - 26}px) translate(-50%,-50%) scale(0.8) rotate(500deg)`, opacity: 0, offset: 1 }
            ]
        });
    }
}
registerCustomSkillMotion('sakurafubuki', playSakurafubukiMotion, 'モッチー');

// --- 超ローリンモッチ・もっさま共通：技の間だけ「丸まった状態」の専用イラストに差し替えるヘルパー ---
//   通常の立ち姿画像のまま transform で無理やり丸めていた（borderRadiusを50%にするなど）と、
//   見た目が破綻するため、専用のロールイラスト（images/モッチーroll.png）に差し替える。
//   オーラ着色オーバーレイ（.monster-visual-aura-tint）は通常時、img要素とは別のsibling要素として
//   重ねているだけなので、img側だけをtransformで動かすと「色付けだけがその場に残り続ける」
//   （色違いのモッチーが動いているように見えない）不具合になる。これを防ぐため、オーバーレイの
//   マスク画像もロールイラストに差し替えたうえで、img・オーバーレイの両方に全く同じtransformの
//   アニメーションを適用し、常に同じ位置・向きで重なった状態のまま一緒に動くようにする。
const MOCCHI_ROLL_IMAGE_PATH = 'images/モッチーroll.png';

function swapToMocchiRollVisual(side) {
    const iconEl = getBattleIconEl(side);
    const imgEl = iconEl ? iconEl.querySelector('img.monster-visual-img') : null;
    if (!imgEl) return null; // 画像が読み込めていない（絵文字代替表示中）場合は差し替えを諦め、通常のアニメーションのみ行う

    const tintEl = iconEl.querySelector('.monster-visual-aura-tint');
    const encodedRollPath = encodeURI(MOCCHI_ROLL_IMAGE_PATH);

    const originalImgSrc = imgEl.src;
    imgEl.src = encodedRollPath;

    let originalTintMaskWebkit = null;
    let originalTintMaskStandard = null;
    if (tintEl) {
        originalTintMaskWebkit = tintEl.style.webkitMaskImage;
        originalTintMaskStandard = tintEl.style.maskImage;
        tintEl.style.webkitMaskImage = `url("${encodedRollPath}")`;
        tintEl.style.maskImage = `url("${encodedRollPath}")`;
    }

    return {
        imgEl,
        tintEl,
        // 技のモーションが終わったら、通常の見た目（元の画像・元のマスク）に戻す
        restore() {
            imgEl.src = originalImgSrc;
            if (tintEl) {
                tintEl.style.webkitMaskImage = originalTintMaskWebkit;
                tintEl.style.maskImage = originalTintMaskStandard;
            }
        }
    };
}

// --- 超ローリンモッチ：モッチー自身が丸くなって相手に激突する ---
function playChoRollinmochiMotion(side) {
    const casterContainer = getBattleSpriteContainerEl(side);
    const targetContainer = getBattleSpriteContainerEl(otherSide(side));
    const animTarget = getSpriteAnimTargetEl(side);
    if (!casterContainer || !targetContainer || !animTarget) return;

    const from = getElCenter(casterContainer);
    const to = getElCenter(targetContainer);
    const travel = to.x - from.x; // 敵が右にいれば正、左にいれば負（どちら向きでも自然に激突する）

    const rollVisual = swapToMocchiRollVisual(side); // ロール状態の専用イラストに差し替える（無ければ通常表示のまま進行）

    animTarget.style.willChange = 'transform';
    if (rollVisual && rollVisual.tintEl) rollVisual.tintEl.style.willChange = 'transform';
    const duration = 620 * EFFECT_SPEED_MULTIPLIER;
    const keyframes = [
        { transform: 'translateX(0) scale(1) rotate(0deg)', offset: 0 },
        { transform: `translateX(${travel * 0.15}px) scale(0.75) rotate(180deg)`, offset: 0.22 },
        { transform: `translateX(${travel * 0.85}px) scale(0.8) rotate(900deg)`, offset: 0.72 },
        { transform: `translateX(${travel}px) scale(0.92) rotate(1080deg)`, offset: 0.88 },
        { transform: `translateX(${travel * 0.7}px) scale(1) rotate(1080deg)`, offset: 1 }
    ];
    let anim;
    try {
        // オーラ着色オーバーレイがあれば、img本体と全く同じキーフレームで一緒に動かす
        // （transformの値は共通、offsetでズレを一切作らないことが「一体として動いて見える」ポイント）
        // 敵側の左右反転を維持するため、キーフレームは applySpriteFlipToKeyframes を通す
        if (rollVisual && rollVisual.tintEl) rollVisual.tintEl.animate(applySpriteFlipToKeyframes(rollVisual.tintEl, keyframes), { duration, easing: 'ease-in-out' });
        anim = animTarget.animate(applySpriteFlipToKeyframes(animTarget, keyframes), { duration, easing: 'ease-in-out' });
    } catch (e) { /* 非対応環境ではスプライトは動かないが、下の衝撃エフェクトだけは再生される */ }
    const restoreVisual = () => { if (rollVisual) rollVisual.restore(); };
    if (anim) anim.onfinish = restoreVisual;
    else if (rollVisual) setTimeout(restoreVisual, duration);

    // 激突の瞬間に衝撃エフェクト
    setTimeout(() => {
        spawnCustomParticle('💥', to.x, to.y, {
            size: 30,
            duration: 300 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 1, offset: 0.5 },
                { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }
            ]
        });
    }, duration * 0.78);
}
registerCustomSkillMotion('cho_rollinmochi', playChoRollinmochiMotion, 'モッチー');

// --- もっさま：ジャンプ→空中で丸まりながら移動→相手の上から落下する ---
function playMossamaMotion(side) {
    const casterContainer = getBattleSpriteContainerEl(side);
    const targetContainer = getBattleSpriteContainerEl(otherSide(side));
    const animTarget = getSpriteAnimTargetEl(side);
    if (!casterContainer || !targetContainer || !animTarget) return;

    const from = getElCenter(casterContainer);
    const to = getElCenter(targetContainer);
    const dx = to.x - from.x;

    const rollVisual = swapToMocchiRollVisual(side); // ロール状態の専用イラストに差し替える（無ければ通常表示のまま進行）

    animTarget.style.willChange = 'transform';
    if (rollVisual && rollVisual.tintEl) rollVisual.tintEl.style.willChange = 'transform';
    const duration = 900 * EFFECT_SPEED_MULTIPLIER;
    const keyframes = [
        { transform: 'translate(0,0) scale(1) rotate(0deg)', offset: 0 },
        { transform: 'translate(0,-60px) scale(1.05) rotate(0deg)', offset: 0.28 },       // ジャンプ
        { transform: `translate(${dx * 0.9}px,-70px) scale(0.85) rotate(360deg)`, offset: 0.55 }, // 空中で丸まりながら移動
        { transform: `translate(${dx * 0.95}px,-8px) scale(0.9) rotate(540deg)`, offset: 0.8 },   // 相手の上から急降下
        { transform: `translate(${dx * 0.7}px,0px) scale(1) rotate(560deg)`, offset: 1 }           // 着地して自陣へ戻る
    ];
    let anim;
    try {
        // 敵側の左右反転を維持するため、キーフレームは applySpriteFlipToKeyframes を通す
        if (rollVisual && rollVisual.tintEl) rollVisual.tintEl.animate(applySpriteFlipToKeyframes(rollVisual.tintEl, keyframes), { duration, easing: 'ease-in-out' });
        anim = animTarget.animate(applySpriteFlipToKeyframes(animTarget, keyframes), { duration, easing: 'ease-in-out' });
    } catch (e) { /* 非対応環境ではスプライトは動かないが、下の着地エフェクトだけは再生される */ }
    const restoreVisual = () => { if (rollVisual) rollVisual.restore(); };
    if (anim) anim.onfinish = restoreVisual;
    else if (rollVisual) setTimeout(restoreVisual, duration);

    // 落下・着地の瞬間に衝撃エフェクト
    setTimeout(() => {
        spawnCustomParticle('💥', to.x, to.y, {
            size: 30,
            duration: 300 * EFFECT_SPEED_MULTIPLIER,
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 1, offset: 0.5 },
                { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }
            ]
        });
    }, duration * 0.79);
}
registerCustomSkillMotion('mossama', playMossamaMotion, 'モッチー');

// --- 八重ざくら：自身の周囲にさくらの花びら＋キラキラが舞う（回復演出） ---
function playYaezakuraMotion(side) {
    const casterContainer = getBattleSpriteContainerEl(side);
    if (!casterContainer) return;
    spawnSelfParticleRing(casterContainer, '🌸', 6, 20, 750 * EFFECT_SPEED_MULTIPLIER);
    spawnSelfParticleRing(casterContainer, '✨', 5, 15, 650 * EFFECT_SPEED_MULTIPLIER, 38);
}
registerCustomSkillMotion('yaezakura', playYaezakuraMotion, 'モッチー');

// --- みがわり餅：自身と同じ大きさの桜餅を設置し、身代わりに立てる ---
//   ダメージは無く相手にも干渉しない技なので、攻撃の演出は入れない。
//   発動時に自身も最大ライフの20%を消耗するため、餅を生み出した後に軽く消耗を見せる。
function playMigawarimochiMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    if (!casterEl) return;
    const { x, y } = getElCenter(casterEl);
    const duration = 1050 * EFFECT_SPEED_MULTIPLIER;

    // 身を削って餅を練り出す（大きく膨らんでから、切り分けるようにしぼむ）
    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1,1)', offset: 0 },
        { transform: 'translateX(0) scale(1.14,1.1)', offset: 0.26 },   // 力を込める
        { transform: 'translateX(-8px) scale(0.9,1.04)', offset: 0.48 }, // 削り出して身を引く
        { transform: 'translateX(-4px) scale(0.97,1.01)', offset: 0.7 },
        { transform: 'translateX(0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 身代わりの桜餅が隣に生まれる
    setTimeout(() => {
        spawnCustomParticle('🍡', x + 26, y, {
            size: 42, duration: 700 * EFFECT_SPEED_MULTIPLIER, color: '#ffb3cc',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.2,0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.15,0.92)', opacity: 1, offset: 0.4 },  // ぷるんと出現
                { transform: 'translate(-50%,-50%) scale(0.96,1.06)', opacity: 1, offset: 0.62 },
                { transform: 'translate(-50%,-50%) scale(1,1)', opacity: 1 }
            ]
        });
        // 出現時のもちもちした余韻
        for (let i = 0; i < 3; i++) {
            spawnCustomParticle('🌸', x + 26 + (i - 1) * 18, y - 10, {
                size: 18, delay: i * 70, duration: 560 * EFFECT_SPEED_MULTIPLIER, color: '#ffb3cc',
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.4) rotate(0deg)', opacity: 0 },
                    { transform: 'translate(0,-16px) translate(-50%,-50%) scale(1.05) rotate(160deg)', opacity: 1, offset: 0.45 },
                    { transform: 'translate(0,-30px) translate(-50%,-50%) scale(0.7) rotate(300deg)', opacity: 0 }
                ]
            });
        }
    }, duration * 0.4);
}
registerCustomSkillMotion('migawarimochi', playMigawarimochiMotion, 'モッチー');

// --- 超もっち砲：最大出力のエネルギー弾を撃ち込む（モッチー最大の攻撃技） ---
function playChoMochihouMotion(side) {
    const casterEl = getBattleSpriteContainerEl(side);
    const targetEl = getBattleSpriteContainerEl(otherSide(side));
    if (!casterEl || !targetEl) return;
    const from = getElCenter(casterEl);
    const to = getElCenter(targetEl);
    const duration = 1350 * EFFECT_SPEED_MULTIPLIER;
    const dx = to.x - from.x, dy = to.y - from.y;

    // 体を大きく反らして力を溜め、撃つ反動で仰け反る
    animateSpriteLayers(side, [
        { transform: 'translateX(0) scale(1,1)', offset: 0 },
        { transform: 'translateX(0) scale(0.92,1.12)', offset: 0.24 },                        // 溜める
        { transform: 'translateX(0) scale(1.18,1.16)', offset: 0.46 },                        // 膨れ上がる
        { transform: `translateX(${-Math.sign(dx) * 14}px) scale(0.88,0.92)`, offset: 0.6 },   // 撃つ反動
        { transform: 'translateX(0) scale(1.04,1.02)', offset: 0.78 },
        { transform: 'translateX(0) scale(1,1)', offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    // 溜めの間、桜色のエネルギーが集まる
    for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6;
        const r = 56;
        spawnCustomParticle('🌸', from.x + Math.cos(a) * r, from.y + Math.sin(a) * r * 0.75, {
            size: 20, delay: 100 + i * 60, duration: 520 * EFFECT_SPEED_MULTIPLIER, color: '#ff9ec4',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0 },
                { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0.45 },
                { transform: `translate(${-Math.cos(a) * r}px,${-Math.sin(a) * r * 0.75}px) translate(-50%,-50%) scale(0.35)`, opacity: 0 }
            ]
        });
    }

    // 発射：極太のエネルギー弾が飛ぶ
    setTimeout(() => {
        spawnBeamLine(from.x, from.y, dx, dy, '#ff9ec4', 620 * EFFECT_SPEED_MULTIPLIER, 22);
        spawnCustomParticle('⬤', from.x, from.y, {
            size: 34, duration: 460 * EFFECT_SPEED_MULTIPLIER, color: '#ffb3cc', easing: 'ease-in',
            keyframes: [
                { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
                { transform: `translate(${dx * 0.5}px,${dy * 0.5}px) translate(-50%,-50%) scale(1.2)`, opacity: 1, offset: 0.5 },
                { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(1.3)`, opacity: 1 }
            ]
        });
        setTimeout(() => {
            // 着弾：桜色の爆発
            spawnCustomParticle('◯', to.x, to.y, {
                size: 86, duration: 600 * EFFECT_SPEED_MULTIPLIER, color: '#ff9ec4',
                keyframes: [
                    { transform: 'translate(-50%,-50%) scale(0.1)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.8)', opacity: 1, offset: 0.3 },
                    { transform: 'translate(-50%,-50%) scale(3)', opacity: 0 }
                ]
            });
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI * 2 * i) / 6;
                spawnCustomParticle('🌸', to.x, to.y, {
                    size: 24, delay: i * 40, duration: 560 * EFFECT_SPEED_MULTIPLIER, color: '#ffb3cc',
                    keyframes: [
                        { transform: 'translate(-50%,-50%) scale(0.3) rotate(0deg)', opacity: 0 },
                        { transform: `translate(${Math.cos(a) * 48}px,${Math.sin(a) * 38}px) translate(-50%,-50%) scale(1.25) rotate(180deg)`, opacity: 1, offset: 0.4 },
                        { transform: `translate(${Math.cos(a) * 82}px,${Math.sin(a) * 64}px) translate(-50%,-50%) scale(0.6) rotate(340deg)`, opacity: 0 }
                    ]
                });
            }
            spawnImpactBurst(to.x, to.y, { size: 58, duration: 560 * EFFECT_SPEED_MULTIPLIER });
            playRecoilMotion(otherSide(side), { distance: 20, rotate: 14, duration: 640 });
        }, 460 * EFFECT_SPEED_MULTIPLIER);
    }, duration * 0.56);
}
registerCustomSkillMotion('cho_mochihou', playChoMochihouMotion, 'モッチー');
