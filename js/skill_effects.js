// =====================================================
// skill_effects.js
// 全ての技（SKILLS_DB）に対して、技名・技説明からイメージした視覚エフェクトを
// 自動的に再生する。外部画像アセットは一切使わず、絵文字パーティクル＋CSS/Web
// Animations APIのみで完結する（既存の演出（showEffect等）に追加で重ねて鳴らす）。
//
// 仕組み：
//   1. SKILL_EFFECT_TYPE : 技キー → エフェクト種別（25種類）
//      技名・説明文に含まれるキーワード（「炎」「氷」「雷」「斬」など）から
//      分類したもの。例：キュービの「狐火」「超狐火」は fire_small（小さな炎）
//   2. SKILL_EFFECT_CONFIGS : エフェクト種別ごとの見た目設定（絵文字・動き・色味）
//   3. playSkillVisualEffect(skKey, side) : 育成中バトル（masmon_battle.js）用。
//      技キーから直接エフェクトを再生する。
//      playSkillVisualEffectByName(skillName, side) : PvPリアルタイム対戦
//      （masmon_realtime_battle.js）用。ログ文言に含まれる技名からエフェクトを
//      再生する（技キーそのものは同期ログに含まれないため、名前で引く）。
// =====================================================

// --- 技キー → エフェクト種別 -------------------------------------------------
const SKILL_EFFECT_TYPE = {
    akubi:'psychic', aoki_ibara_yo_toga_wo_ugate:'slash', arcana_flare:'holy_light', ars_magna:'punch_melee', ashura:'punch_melee', assassin_claw:'claw',
    assault_arrow:'punch_melee', atamatsuki:'punch_melee', aurora_gate:'psychic', bakudan_nage:'fire_large', bakuretsu_otoshi:'fire_large', berobinta:'claw',
    big_spin_cutter:'drill', bikkuri_dokuro:'dark_curse', blade_dance:'slash', body_press_nendoro:'punch_melee', body_slam:'punch_melee', boss_bite:'claw',
    boss_focus:'buff', boss_laser:'psychic', boss_meteor:'rock_earth', boss_roll:'drill', buster_sword:'slash', card:'dark_curse',
    chiretsuzan:'rock_earth', cho_atamatsuki:'punch_melee', cho_dash_giri:'slash', cho_kitsunebi:'fire_small', cho_mochihou:'holy_light', cho_monotaore:'punch_melee',
    cho_netsushisen:'fire_large', cho_ogoe:'sound', cho_parabola_beam:'holy_light', cho_raigeki:'electric', cho_rollinmochi:'drill', choonpa:'sound',
    claw_nage:'claw', combination:'punch_melee', combination_liger:'claw', combination_plant:'nature_seed', combo_punch:'slash', crimson_nova:'fire_large', dai_kaiten_otoshi:'drill',
    daisharin:'slash', dekopin:'punch_melee', doku_no_kona:'poison', dokuro_beam:'holy_light', double_chop:'punch_melee', double_shoda:'punch_melee',
    drain:'drain_effect', drill_rocket:'drill', ebony_nova:'fire_large', face_drill:'drill', fire_bird:'fire_large', fire_wave:'fire_large',
    flame_beam:'holy_light', flame_line:'fire_large', flame_typhoon:'fire_large', flower_beam:'holy_light', fujinken:'wind', g_cube:'metal_mecha',
    gaccho:'punch_melee', ganduke:'punch_melee', gappuri_yotsu:'punch_melee', gel_copter:'drill', gel_press:'punch_melee', ghost_flash:'dark_curse', gobi_step:'buff',
    god_bless:'holy_light', god_final:'holy_light', guruguru_attack:'drill', hae_tataki:'punch_melee', harite:'punch_melee', hidarite:'punch_melee',
    hikkaki:'claw', hizageri:'kick', holy_earth:'rock_earth', holy_fire:'fire_large', holy_icicle:'ice', honoo_taiatari:'fire_large',
    hurricane:'wind', ima_koso_shin_naru_mezame:'psychic', inore_rinne_no_wa_yo:'holy_light', jiraibari:'electric', jishin:'rock_earth', kaeru_no_shita:'claw',
    kaeru_no_uta:'sound', kafun:'nature_seed', kagegeki:'dark_curse', kagerou:'fire_large', kamitsuki:'claw', kamitsuki_dino:'claw',
    kamitsukinage:'claw', kawazutsuki:'punch_melee', kenbu:'buff', kijin_ranbu:'slash', kitsunebi:'fire_small', knuckle:'punch_melee', kokonoe_shingan:'psychic',
    koma_attack:'drill', kuchibashi:'punch_melee', kurohizacombo:'kick', kushizashi:'punch_melee', kuu:'claw', kuuchu_kaiten_attack:'drill',
    laser_blade:'holy_light', laser_cutter:'holy_light', liger_hikkaki:'claw', liger_kamitsuki:'claw', liger_raijinken:'electric', mach_punch:'punch_melee',
    machinegun_punch:'punch_melee', mana_drain:'drain_effect', mappufutatsu:'slash', meido_no_miyage:'punch_melee', meiso:'buff', meta_beam:'holy_light', michizure:'buff',
    midaretsuki:'slash', migawarimochi:'substitute', mirage_claw:'fire_large', monotaore:'punch_melee', morning_star:'punch_melee', mossama:'punch_melee',
    muchi:'punch_melee', nagekiss_nendoro:'scream_confuse', nagetobashi:'punch_melee', nameru:'claw', napalm_cannon:'fire_large', needle_turn:'drill', nen_eki:'poison',
    nendo_gatame:'buff', nobiru_punch:'punch_melee', odokasu:'dark_curse', ohki_otoshimono:'rock_earth', ohpunch:'punch_melee', onara:'poison',
    one_two:'punch_melee', one_two_punch:'punch_melee', onikokushou:'dark_curse', onite:'punch_melee', onitsume:'claw', otakebi:'sound',
    parabola_beam:'holy_light', piko_hammer:'punch_melee', pixie_astralray:'holy_light', pixie_bigbang:'explosion', pixie_gigaray:'holy_light', pixie_harite:'punch_melee',
    pixie_healraid:'holy_light', pixie_highkick:'kick', pixie_lightning:'electric', pixie_megaray:'holy_light', pixie_nagekiss:'scream_confuse', pixie_ray:'holy_light',
    pixie_thunder:'electric', pixie_van:'sound', plasma:'electric', ponken:'slash', press:'punch_melee', psychokinesis:'psychic',
    raigeki:'electric', raijinken:'electric', rakurai_kyoumei:'electric', rasetsu:'dark_curse', rashomon:'dark_curse', reikidan:'ice',
    renkon:'nature_seed', renzoku_harite:'punch_melee', renzoku_kagizume:'claw', requiem_end:'psychic', rocket_punch:'punch_melee', sabaki_no_hikari_yo_kudare:'holy_light',
    sakebigoe:'sound', sakurafubuki:'petal', sakuranomai:'buff', sanren_attack:'rock_earth', seiya_no_kane_yo_narihibike:'sound', sekai_wo_yurase:'rock_earth',
    senkousho:'holy_light', seoinage:'punch_melee', shield_bash:'punch_melee', shinkou_yo_kegare_wo_harae:'holy_light', shinpi_no_mamori:'buff', shippo:'punch_melee',
    shiten_no_tsurugi_yo_oritate:'holy_light', sho_henka:'metal_mecha', shoda:'punch_melee', shuuen_ni_sukui_wo_ataeyo:'holy_light', sobat:'drill', spin_cutter:'drill',
    stealth_rock:'hazard', straight:'punch_melee', straight_punch:'punch_melee', sunakake:'psychic', sunkei:'punch_melee', taiatari:'punch_melee',
    taihou:'explosion', taikyoku_henka:'metal_mecha', tail_attack:'punch_melee', tail_blade:'slash', tane_gun:'nature_seed', tane_machinegun:'nature_seed',
    ten_no_jihi_yo_shimesareyo:'holy_light', tenga_tensho:'psychic', tetsuzankou:'punch_melee', tobe_shinritsu_no_yaiba:'slash', tobi_harite:'punch_melee', tornado_attack:'wind',
    trio_beam_z:'holy_light', tsukisashi:'slash', twin_shoda:'punch_melee', utau:'sound', uwatenage:'punch_melee', venom_edge:'poison',
    w_drill_rocket:'drill', w_kick:'kick', w_laser_sword:'holy_light', w_needle_turn:'slash', waga_hitomi:'psychic', warawara:'sound',
    yaezakura:'heal', youkaieki:'poison', youko_no_inori:'buff', yuuwaku:'scream_confuse', zan_assault_dance:'slash', zan_assault_raid:'holy_light',
    zan_axis_bullet:'drill', zan_dark_haunt:'dark_curse', zan_double_summer:'slash', zan_leg_arc:'slash', zan_meteor_drive:'rock_earth', zan_mirage_shift:'slash',
    zan_ohzantou:'slash', zan_rising_rave:'holy_light', zan_single_shot:'slash', zan_stunner_blitz:'electric', zan_makibishi:'hazard', zoom_punch:'punch_melee', zoom_punch_nendoro:'punch_melee',
    zutsuki:'punch_melee',
};

// --- エフェクト種別ごとの見た目設定 -------------------------------------------
// particles: 使用する絵文字（複数指定時は粒ごとに順番に使う）
// motion   : 動きのパターン（下のspawnParticleEffect内で分岐）
// count    : 粒の数 / size: フォントサイズ(px) / duration: 1粒あたりの再生時間(ms)
// 攻撃エフェクト（パーティクル）の再生速度係数。1.0が元の速さ、大きいほどゆっくり再生される。
// 「もう少しゆっくり」の要望に合わせて少し引き伸ばしている。
const EFFECT_SPEED_MULTIPLIER = 1.8;

const SKILL_EFFECT_CONFIGS = {
    fire_small:    { particles: ['🔥'],          motion: 'projectile',     count: 1, size: 22, duration: 500 },
    fire_large:    { particles: ['🔥'],          motion: 'projectile',     count: 3, size: 26, duration: 600 },
    ice:           { particles: ['❄️', '🧊'],    motion: 'projectile',     count: 3, size: 22, duration: 550 },
    electric:      { particles: ['⚡'],          motion: 'zigzag',         count: 2, size: 28, duration: 420 },
    sound:         { particles: ['〰️'],          motion: 'ring',           count: 3, size: 20, duration: 550 },
    poison:        { particles: ['☠️', '🟣'],    motion: 'bubble',         count: 4, size: 18, duration: 650 },
    wind:          { particles: ['🌀'],          motion: 'swirl',          count: 2, size: 26, duration: 550 },
    water:         { particles: ['💧'],          motion: 'projectile',     count: 3, size: 20, duration: 500 },
    rock_earth:    { particles: ['🪨'],          motion: 'projectile',     count: 3, size: 22, duration: 550 },
    petal:         { particles: ['🌸'],          motion: 'flutter',        count: 5, size: 18, duration: 700 },
    nature_seed:   { particles: ['🌿', '🍃'],    motion: 'projectile',     count: 3, size: 18, duration: 550 },
    psychic:       { particles: ['🔮'],          motion: 'ring',           count: 2, size: 24, duration: 550 },
    dark_curse:    { particles: ['💀', '🌑'],    motion: 'projectile',     count: 2, size: 22, duration: 550 },
    holy_light:    { particles: ['✨'],          motion: 'beam',           count: 3, size: 22, duration: 500, color: '#ffe066' },
    drill:         { particles: ['🌀'],          motion: 'spin_projectile',count: 1, size: 28, duration: 500 },
    claw:          { particles: ['🐾'],          motion: 'slash',          count: 1, size: 30, duration: 400 },
    slash:         { particles: ['⚔️'],          motion: 'slash',          count: 1, size: 30, duration: 400 },
    punch_melee:   { particles: ['👊'],          motion: 'impact',         count: 1, size: 28, duration: 350 },
    kick:          { particles: ['🦶'],          motion: 'impact',         count: 1, size: 28, duration: 350 },
    metal_mecha:   { particles: ['⚙️'],          motion: 'projectile',     count: 2, size: 22, duration: 500 },
    scream_confuse:{ particles: ['💋', '💫'],    motion: 'flutter',        count: 3, size: 20, duration: 600 },
    star_cosmic:   { particles: ['⭐', '🌟'],    motion: 'burst',          count: 5, size: 20, duration: 650 },
    drain_effect:  { particles: ['🩸'],          motion: 'drain',         count: 3, size: 18, duration: 700 },
    explosion:     { particles: ['💥'],          motion: 'burst',          count: 1, size: 34, duration: 450 },
    heal:          { particles: ['💚'],          motion: 'rise',          count: 3, size: 18, duration: 600 },
    buff:          { particles: ['⬆️'],          motion: 'rise',          count: 3, size: 18, duration: 550 },
    substitute:    { particles: ['🌸'],          motion: 'pop',            count: 1, size: 30, duration: 400 },
    hazard:        { particles: ['🪨'],          motion: 'ground_spread', count: 4, size: 16, duration: 600 },
};

// --- 技キー単位でエフェクトの色味・絵文字を個別に上書きするための設定 ---
// SKILL_EFFECT_TYPE で分類した「見た目のベース」（motion/count/size/duration）はそのまま使い、
// 特定の技だけ色味・絵文字を変えたい場合にここで上書きする（未指定の項目はベース設定を継承する）。
// color: ビーム本体の発光色（CSSカラー）。motion:'beam' のときのみ使用される。
const SKILL_EFFECT_OVERRIDES = {
    flame_beam:   { color: '#ff4d3d', particles: ['🔥'] }, // フレイムビーム（ヒノトリ）：赤を基調にした火炎ビーム
    cho_mochihou: { color: '#ff6fc4', particles: ['🌸'] }, // 超もっち砲（モッチー）：ピンクを基調にした一撃
    flower_beam:  { color: '#7ed957', particles: ['🌼'] }, // フラワービーム（プラント）：緑を基調にした光線
    dokuro_beam:  { color: '#9b6bff', particles: ['💀'] }, // ドクロビーム：紫を基調にした怪光線
};

// --- 技名 → エフェクト上書き設定（PvPリアルタイム対戦のログ再生用。SKILL_EFFECT_OVERRIDESから自動生成） ---
const SKILL_NAME_EFFECT_OVERRIDE = {};
(function buildSkillNameEffectOverrideMap() {
    if (typeof SKILLS_DB === 'undefined') return;
    for (const skKey in SKILL_EFFECT_OVERRIDES) {
        const def = SKILLS_DB[skKey];
        if (def && def.name) {
            SKILL_NAME_EFFECT_OVERRIDE[def.name] = SKILL_EFFECT_OVERRIDES[skKey];
        }
    }
})();

// エフェクトの向き：基本は「発動者→対象」だが、自分に効果が返る系（回復・バフ・身代わり）は
// 発動者自身の足元で完結させる
const SELF_DIRECTED_EFFECT_TYPES = ['heal', 'buff', 'substitute'];

// --- 技名 → エフェクト種別（PvPリアルタイム対戦のログ再生用。技キーが分からない場面で使う） ---
// SKILL_EFFECT_TYPE から実行時に自動生成する（二重管理を避けるため）。
const SKILL_NAME_EFFECT_TYPE = {};
(function buildSkillNameEffectMap() {
    if (typeof SKILLS_DB === 'undefined') return;
    for (const skKey in SKILL_EFFECT_TYPE) {
        const def = SKILLS_DB[skKey];
        if (def && def.name && !(def.name in SKILL_NAME_EFFECT_TYPE)) {
            SKILL_NAME_EFFECT_TYPE[def.name] = SKILL_EFFECT_TYPE[skKey];
        }
    }
})();

// -----------------------------------------------------
// パーティクル本体の再生処理
// fromEl / toEl : エフェクトの起点・終点となるDOM要素（スプライトコンテナ）
// -----------------------------------------------------
function spawnSkillParticleEffect(fromEl, toEl, config) {
    if (!fromEl || !toEl || !config) return;
    if (typeof fromEl.getBoundingClientRect !== 'function') return;

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const fromX = fromRect.left + fromRect.width / 2;
    const fromY = fromRect.top + fromRect.height / 2;
    const toX = toRect.left + toRect.width / 2;
    const toY = toRect.top + toRect.height / 2;
    const dx = toX - fromX;
    const dy = toY - fromY;

    const count = config.count || 1;
    // EFFECT_SPEED_MULTIPLIER: 攻撃エフェクト全体の再生速度を調整する係数。
    // 1.0が元の速さ。大きくするほどゆっくりになる。
    const baseDuration = (config.duration || 500) * EFFECT_SPEED_MULTIPLIER;
    const size = config.size || 22;

    // --- ビーム本体（発光する帯）を1本描画する。motion:'beam' の技のみ ---
    // 発動者→対象へ一直線に「撃つ」動きを、伸びる光の帯＋着弾フラッシュで表現する。
    if (config.motion === 'beam') {
        spawnBeamLine(fromX, fromY, dx, dy, config.color || '#ffe066', baseDuration);
    }

    for (let i = 0; i < count; i++) {
        const particle = document.createElement('div');
        particle.textContent = config.particles[i % config.particles.length];
        const glowShadow = (config.motion === 'beam' && config.color)
            ? `0 0 8px ${config.color}, 0 0 4px rgba(0,0,0,0.5)`
            : '0 0 6px rgba(0,0,0,0.5)';
        particle.style.cssText = `position:fixed; font-size:${size}px; line-height:1; pointer-events:none; z-index:9999; will-change:transform,opacity; text-shadow:${glowShadow};`;
        document.body.appendChild(particle);

        const delay = i * 55 * EFFECT_SPEED_MULTIPLIER;
        const jitterX = (Math.random() - 0.5) * 26;
        const jitterY = (Math.random() - 0.5) * 26;
        let keyframes;

        switch (config.motion) {
            case 'projectile':
            case 'spin_projectile':
                particle.style.left = fromX + 'px';
                particle.style.top = fromY + 'px';
                keyframes = [
                    { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.15 },
                    { transform: `translate(${dx + jitterX}px, ${dy + jitterY}px) translate(-50%,-50%) rotate(${config.motion === 'spin_projectile' ? 720 : 0}deg) scale(1.15)`, opacity: 1, offset: 0.85 },
                    { transform: `translate(${dx + jitterX}px, ${dy + jitterY}px) translate(-50%,-50%) scale(1.4)`, opacity: 0 }
                ];
                break;
            case 'zigzag':
                particle.style.left = fromX + 'px';
                particle.style.top = fromY + 'px';
                keyframes = [
                    { transform: 'translate(-50%,-50%) scale(0.6)', opacity: 0 },
                    { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 20}px) translate(-50%,-50%) scale(1.1)`, opacity: 1, offset: 0.35 },
                    { transform: `translate(${dx * 0.7}px, ${dy * 0.7 + 20}px) translate(-50%,-50%) scale(1.1)`, opacity: 1, offset: 0.65 },
                    { transform: `translate(${dx}px, ${dy}px) translate(-50%,-50%) scale(1.3)`, opacity: 0 }
                ];
                break;
            case 'beam':
                particle.style.left = fromX + 'px';
                particle.style.top = fromY + 'px';
                keyframes = [
                    { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0.9 },
                    { transform: `translate(${dx}px, ${dy}px) translate(-50%,-50%) scale(0.6)`, opacity: 1, offset: 0.35 },
                    { transform: `translate(${dx}px, ${dy}px) translate(-50%,-50%) scale(1.6)`, opacity: 0.9, offset: 0.55 },
                    { transform: `translate(${dx}px, ${dy}px) translate(-50%,-50%) scale(0.9)`, opacity: 0 }
                ];
                break;
            case 'slash':
            case 'impact':
                particle.style.left = toX + 'px';
                particle.style.top = toY + 'px';
                keyframes = [
                    { transform: 'translate(-50%,-50%) scale(0.3) rotate(-25deg)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.3) rotate(12deg)', opacity: 1, offset: 0.45 },
                    { transform: 'translate(-50%,-50%) scale(1) rotate(0deg)', opacity: 0 }
                ];
                break;
            case 'burst':
            case 'bubble':
            case 'ring':
            case 'flutter':
            case 'swirl':
                particle.style.left = (toX + jitterX) + 'px';
                particle.style.top = (toY + jitterY) + 'px';
                keyframes = [
                    { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.2)', opacity: 1, offset: 0.3 },
                    { transform: 'translate(-50%, calc(-50% - 36px)) scale(0.9)', opacity: 0 }
                ];
                break;
            case 'rise':
                particle.style.left = (fromX + jitterX) + 'px';
                particle.style.top = fromY + 'px';
                keyframes = [
                    { transform: 'translate(-50%,-50%) scale(0.6)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.1)', opacity: 1, offset: 0.3 },
                    { transform: 'translate(-50%, calc(-50% - 46px)) scale(1)', opacity: 0 }
                ];
                break;
            case 'drain':
                particle.style.left = toX + 'px';
                particle.style.top = toY + 'px';
                keyframes = [
                    { transform: 'translate(-50%,-50%) scale(1)', opacity: 0.9 },
                    { transform: `translate(${-dx}px, ${-dy}px) translate(-50%,-50%) scale(0.5)`, opacity: 0 }
                ];
                break;
            case 'ground_spread':
                particle.style.left = (toX + (i - count / 2) * 18) + 'px';
                particle.style.top = (toY + 22) + 'px';
                keyframes = [
                    { transform: 'translate(-50%,40%) scale(0.2)', opacity: 0 },
                    { transform: 'translate(-50%,40%) scale(1)', opacity: 1, offset: 0.5 },
                    { transform: 'translate(-50%,40%) scale(1)', opacity: 0 }
                ];
                break;
            case 'pop':
                particle.style.left = fromX + 'px';
                particle.style.top = fromY + 'px';
                keyframes = [
                    { transform: 'translate(-50%,-50%) scale(0)', opacity: 0 },
                    { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 1, offset: 0.5 },
                    { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }
                ];
                break;
            default:
                particle.style.left = toX + 'px';
                particle.style.top = toY + 'px';
                keyframes = [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }];
        }

        try {
            const anim = particle.animate(keyframes, { duration: baseDuration, delay, easing: 'ease-out', fill: 'forwards' });
            anim.onfinish = () => particle.remove();
            // Safariの古いバージョン等、onfinishが発火しない環境向けの保険
            setTimeout(() => particle.remove(), baseDuration + delay + 200);
        } catch (e) {
            particle.remove();
        }
    }
}

// --- ビーム本体（発光する帯）を1本描画する ---
// 発動者の位置から対象に向けて、一瞬で伸びる光の帯として表現する（実際に光線を撃つ見た目にするため）。
// fromX/fromY: 発射開始位置 / dx,dy: 対象までの相対距離 / color: 発光色（CSSカラー） / totalDuration: 全体の再生時間(ms)
function spawnBeamLine(fromX, fromY, dx, dy, color, totalDuration) {
    const length = Math.sqrt(dx * dx + dy * dy);
    if (!length) return;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;

    const beam = document.createElement('div');
    beam.style.cssText = `position:fixed; left:${fromX}px; top:${fromY}px; width:${length}px; height:8px;
        transform-origin:0% 50%; pointer-events:none; z-index:9998; will-change:transform,opacity; border-radius:4px;
        background:linear-gradient(90deg, ${color}00, ${color}ff 20%, ${color}ff 80%, ${color}00);
        box-shadow:0 0 10px 3px ${color}, 0 0 22px 6px ${color}80;`;
    document.body.appendChild(beam);

    // 発射：一瞬で伸びきる（全体の25%） → 少し保持（発射している間、光り続ける） → 素早く消える
    const keyframes = [
        { transform: `rotate(${angle}deg) scaleX(0)`, opacity: 0 },
        { transform: `rotate(${angle}deg) scaleX(1)`, opacity: 1, offset: 0.25 },
        { transform: `rotate(${angle}deg) scaleX(1)`, opacity: 0.85, offset: 0.55 },
        { transform: `rotate(${angle}deg) scaleX(1.03)`, opacity: 0 }
    ];

    try {
        const anim = beam.animate(keyframes, { duration: totalDuration, easing: 'ease-out', fill: 'forwards' });
        anim.onfinish = () => beam.remove();
        setTimeout(() => beam.remove(), totalDuration + 200);
    } catch (e) {
        beam.remove();
    }
}

// --- 育成中バトル（masmon_battle.js）用：技キーから直接再生 ---
function playSkillVisualEffect(skKey, side) {
    const effType = SKILL_EFFECT_TYPE[skKey];
    if (!effType) return;
    playSkillVisualEffectByType(effType, side, SKILL_EFFECT_OVERRIDES[skKey]);
}

// --- PvPリアルタイム対戦（masmon_realtime_battle.js）用：技名から再生 ---
function playSkillVisualEffectByName(skillName, side) {
    const effType = SKILL_NAME_EFFECT_TYPE[skillName];
    if (!effType) return;
    playSkillVisualEffectByType(effType, side, SKILL_NAME_EFFECT_OVERRIDE[skillName]);
}

function playSkillVisualEffectByType(effType, side, override) {
    const baseConfig = SKILL_EFFECT_CONFIGS[effType];
    if (!baseConfig) return;
    const config = override ? { ...baseConfig, ...override } : baseConfig;
    const casterId = side === 'player' ? 'battle-player-sprite-container' : 'battle-enemy-sprite-container';
    const targetId = side === 'player' ? 'battle-enemy-sprite-container' : 'battle-player-sprite-container';
    const casterEl = document.getElementById(casterId);
    const targetEl = document.getElementById(targetId);
    if (!casterEl || !targetEl) return;
    const selfDirected = SELF_DIRECTED_EFFECT_TYPES.includes(effType);
    spawnSkillParticleEffect(casterEl, selfDirected ? casterEl : targetEl, config);
}
