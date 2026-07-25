// =====================================================
// pvp_preset.js
// PvP（リアルタイム対戦）向け「編成プリセット」機能。
//
// 対応要件:
//   ・ユーザー自身が技構成（技）と装備アイテムをカスタマイズした6体のモンスターを
//     「候補6体」として使用できるようにする（ガッツファクトリーのレンタル生成とは無関係）
//   ・6体1組を「編成プリセット」として保存し、最大6セットまで保管できる
//   ・プリセットはプレイヤーID（getMyPlayerId）に紐づけて Firebase に保存し、
//     端末のキャッシュ／ローカルストレージをクリアしても消えないようにする
//
// Firebase Realtime Database 構造:
//   pvp_presets/{playerId}/{slotKey} = {
//     name: string,
//     monsters: [
//       { speciesId: string, skills: string[](最大4), equipId: string|null },
//       ... 6件
//     ]
//   }
//     slotKey = 'p0' 〜 'p5'（プリセット枠は6つ固定）
//
// 実際にPvPマッチングへ渡す「候補6体」への変換（ステータス個体差の付与・装備インスタンス化）は
// js/pvp_rental.js の generatePvpPresetOffer / generatePvpMonsterFromPresetSlot が担当する。
// =====================================================

const PVP_PRESET_SLOT_COUNT = 6;   // 保存できるプリセットの数
const PVP_PRESET_TEAM_SIZE = 6;    // 1プリセットあたりのモンスター数（候補6体固定）

const PVP_PRESET_STATE = {
    loaded: false,
    loading: false,
    presets: new Array(PVP_PRESET_SLOT_COUNT).fill(null), // 各枠: null または { name, monsters: [...] }
    selectMode: false,       // true: PvPマッチング用に選ぶ画面として開いている（false: 単なる編成管理）
    editingSlot: null,       // 現在編集中のプリセット枠インデックス（0〜5）
    draftPreset: null,       // 編集中プリセットの作業用コピー
    editingMonsterIndex: null, // 現在編集中のモンスタースロット（0〜5）
    draftMonster: null       // 編集中モンスターの作業用コピー { speciesId, skills, equipId }
};

function pvpPresetSlotKey(i) {
    return 'p' + i;
}

function createEmptyPvpPresetDraft(slotIndex) {
    return {
        name: `プリセット${slotIndex + 1}`,
        monsters: new Array(PVP_PRESET_TEAM_SIZE).fill(null)
    };
}

function isPvpPresetMonsterComplete(m) {
    if (!m || !m.speciesId) return false;
    const tmpl = MONSTER_TEMPLATES[m.speciesId];
    if (!tmpl) return false;
    if (!Array.isArray(m.skills) || m.skills.length === 0) return false;
    if (tmpl.dualStatType && m.statType !== 'pow' && m.statType !== 'int') return false;
    if (!m.aura || !AURA_TYPES[m.aura]) return false;
    return true;
}

function isPvpPresetComplete(preset) {
    return !!(preset && Array.isArray(preset.monsters) &&
        preset.monsters.length === PVP_PRESET_TEAM_SIZE &&
        preset.monsters.every(isPvpPresetMonsterComplete));
}

function escapeHtmlPvpPreset(str) {
    const d = document.createElement('div');
    d.textContent = (str === null || str === undefined) ? '' : String(str);
    return d.innerHTML;
}

// -----------------------------------------------------
// Firebase 読み込み・保存（プレイヤーIDに紐づけ。キャッシュクリアの影響を受けない）
// -----------------------------------------------------
async function loadPvpPresetsIfNeeded(forceReload) {
    if (PVP_PRESET_STATE.loading) return;
    if (PVP_PRESET_STATE.loaded && !forceReload) return;
    PVP_PRESET_STATE.loading = true;
    try {
        if (typeof initFirebase !== 'function' || !initFirebase()) {
            showToast('Firebase未設定のため編成プリセットを読み込めません。');
            PVP_PRESET_STATE.loaded = true;
            return;
        }
        const myId = getMyPlayerId();
        const snap = await firebaseDb.ref(`pvp_presets/${myId}`).once('value');
        const data = snap.val() || {};
        const presets = new Array(PVP_PRESET_SLOT_COUNT).fill(null);
        for (let i = 0; i < PVP_PRESET_SLOT_COUNT; i++) {
            presets[i] = data[pvpPresetSlotKey(i)] || null;
        }
        PVP_PRESET_STATE.presets = presets;
        PVP_PRESET_STATE.loaded = true;
    } catch (e) {
        console.error('[Firebase] 編成プリセット読込エラー:', e);
        showToast('編成プリセットの読み込みに失敗しました。通信状態をご確認ください。');
    } finally {
        PVP_PRESET_STATE.loading = false;
    }
}

async function savePvpPresetSlotToFirebase(slotIndex, preset) {
    if (typeof initFirebase !== 'function' || !initFirebase()) {
        showToast('Firebase未設定のため保存できません。');
        return false;
    }
    try {
        const myId = getMyPlayerId();
        await firebaseDb.ref(`pvp_presets/${myId}/${pvpPresetSlotKey(slotIndex)}`).set(preset);
        return true;
    } catch (e) {
        console.error('[Firebase] 編成プリセット保存エラー:', e);
        showToast('プリセットの保存に失敗しました。もう一度お試しください。');
        return false;
    }
}

async function deletePvpPresetSlotFromFirebase(slotIndex) {
    if (typeof initFirebase !== 'function' || !initFirebase()) {
        showToast('Firebase未設定のため削除できません。');
        return false;
    }
    try {
        const myId = getMyPlayerId();
        await firebaseDb.ref(`pvp_presets/${myId}/${pvpPresetSlotKey(slotIndex)}`).remove();
        return true;
    } catch (e) {
        console.error('[Firebase] 編成プリセット削除エラー:', e);
        showToast('プリセットの削除に失敗しました。');
        return false;
    }
}

// -----------------------------------------------------
// 一覧画面（selectMode=true: PvPマッチング用に選ぶ／false: 単なる編成管理）
// -----------------------------------------------------
async function openPvpPresetManageScreen(selectMode) {
    PVP_PRESET_STATE.selectMode = !!selectMode;
    changeScreen('screen-pvp-preset-list');
    renderPvpPresetListHeader();
    renderPvpPresetListLoadingIfNeeded();
    await loadPvpPresetsIfNeeded();
    renderPvpPresetList();
}

function renderPvpPresetListHeader() {
    const title = document.getElementById('pvp-preset-list-title');
    const desc = document.getElementById('pvp-preset-list-desc');
    if (title) title.textContent = PVP_PRESET_STATE.selectMode ? '編成を選んで対戦へ' : 'マイ編成を管理';
    if (desc) {
        desc.textContent = PVP_PRESET_STATE.selectMode
            ? '対戦に使用する編成プリセットを選んでください。6体すべて設定済みのプリセットのみ選択できます。'
            : '技構成と装備アイテムをカスタマイズした6体を1セットの編成プリセットとして、最大6つまで保存できます。';
    }
}

function renderPvpPresetListLoadingIfNeeded() {
    if (PVP_PRESET_STATE.loaded) return;
    const container = document.getElementById('pvp-preset-list-container');
    if (container) container.innerHTML = '<div class="text-center text-gray-500 text-xs py-8">読み込み中...</div>';
}

function returnFromPvpPresetList() {
    if (typeof startPvpRentalEntry === 'function') {
        startPvpRentalEntry(PVP_RENTAL_STATE.battleType || 'team');
    } else {
        changeScreen('screen-title');
    }
}

function renderPvpPresetList() {
    renderPvpPresetListHeader();
    const container = document.getElementById('pvp-preset-list-container');
    if (!container) return;
    container.innerHTML = '';

    for (let i = 0; i < PVP_PRESET_SLOT_COUNT; i++) {
        const preset = PVP_PRESET_STATE.presets[i];
        const complete = isPvpPresetComplete(preset);

        const card = document.createElement('div');
        card.className = 'bg-[#16202b] border border-sky-900/50 rounded-xl p-2.5 space-y-1.5';

        const header = document.createElement('div');
        header.className = 'flex items-center justify-between gap-2';
        const missingCount = preset ? preset.monsters.filter(m => !isPvpPresetMonsterComplete(m)).length : PVP_PRESET_TEAM_SIZE;
        header.innerHTML = `
            <div class="text-xs font-bold text-sky-200 truncate">${preset ? escapeHtmlPvpPreset(preset.name) : `プリセット${i + 1}（未作成）`}</div>
            <div class="text-[9px] font-bold whitespace-nowrap ${preset ? (complete ? 'text-emerald-400' : 'text-amber-400') : 'text-gray-600'}">
                ${preset ? (complete ? '✅ 使用可能' : `⚠️ あと${missingCount}体設定`) : '未作成'}
            </div>
        `;
        card.appendChild(header);

        if (preset) {
            const row = document.createElement('div');
            row.className = 'flex flex-wrap gap-1';
            preset.monsters.forEach(m => {
                const chip = document.createElement('div');
                if (isPvpPresetMonsterComplete(m)) {
                    const tmpl = MONSTER_TEMPLATES[m.speciesId];
                    chip.className = 'text-[9px] bg-[#0a0f1a] border border-sky-900/40 rounded px-1.5 py-0.5 text-gray-300';
                    chip.textContent = `${tmpl.emoji} ${tmpl.name}`;
                } else {
                    chip.className = 'text-[9px] bg-[#0a0f1a] border border-dashed border-gray-700 rounded px-1.5 py-0.5 text-gray-600';
                    chip.textContent = '未設定';
                }
                row.appendChild(chip);
            });
            card.appendChild(row);
        }

        const btnRow = document.createElement('div');
        btnRow.className = 'flex gap-1.5 pt-0.5';

        if (PVP_PRESET_STATE.selectMode && complete) {
            const useBtn = document.createElement('button');
            useBtn.className = 'flex-1 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg text-[10px] transition-all active:scale-95';
            useBtn.textContent = 'この編成で対戦へ';
            useBtn.onclick = () => usePvpPresetForMatch(i);
            btnRow.appendChild(useBtn);
        }

        const editBtn = document.createElement('button');
        editBtn.className = 'flex-1 py-1.5 bg-[#2a1b15] hover:bg-[#3c2a21] text-amber-300 font-bold rounded-lg text-[10px] border border-amber-900/50 transition-all active:scale-95';
        editBtn.textContent = preset ? '編集する' : '作成する';
        editBtn.onclick = () => openPvpPresetEditor(i);
        btnRow.appendChild(editBtn);

        if (preset) {
            const delBtn = document.createElement('button');
            delBtn.className = 'py-1.5 px-2.5 bg-red-950 hover:bg-red-900 text-red-300 font-bold rounded-lg text-[10px] border border-red-800 transition-all active:scale-95';
            delBtn.textContent = '削除';
            delBtn.onclick = () => confirmDeletePvpPreset(i);
            btnRow.appendChild(delBtn);
        }

        card.appendChild(btnRow);
        container.appendChild(card);
    }
}

async function confirmDeletePvpPreset(slotIndex) {
    const preset = PVP_PRESET_STATE.presets[slotIndex];
    if (!preset) return;
    if (!confirm(`「${preset.name}」を削除します。よろしいですか？`)) return;
    const ok = await deletePvpPresetSlotFromFirebase(slotIndex);
    if (ok) {
        PVP_PRESET_STATE.presets[slotIndex] = null;
        showToast('プリセットを削除しました。');
        renderPvpPresetList();
    }
}

// --- 選出フェーズへ：確定済みプリセットを候補6体としてマッチングに使用する ---
function usePvpPresetForMatch(slotIndex) {
    const preset = PVP_PRESET_STATE.presets[slotIndex];
    if (!isPvpPresetComplete(preset)) {
        showToast('このプリセットはまだ6体すべて設定されていません。');
        return;
    }
    PVP_RENTAL_STATE.selectedPreset = preset;
    proceedToRealtimeMatchingFromRental();
}

// -----------------------------------------------------
// プリセット編集画面（1プリセット＝6体分のモンスタースロット＋名前）
// -----------------------------------------------------
function openPvpPresetEditor(slotIndex) {
    PVP_PRESET_STATE.editingSlot = slotIndex;
    const existing = PVP_PRESET_STATE.presets[slotIndex];
    PVP_PRESET_STATE.draftPreset = existing
        ? JSON.parse(JSON.stringify(existing))
        : createEmptyPvpPresetDraft(slotIndex);
    changeScreen('screen-pvp-preset-editor');
    renderPvpPresetEditorScreen();
}

function renderPvpPresetEditorScreen() {
    const draft = PVP_PRESET_STATE.draftPreset;
    if (!draft) return;

    const nameInput = document.getElementById('pvp-preset-editor-name-input');
    if (nameInput && document.activeElement !== nameInput) nameInput.value = draft.name;

    const container = document.getElementById('pvp-preset-editor-monster-list');
    if (container) {
        container.innerHTML = '';
        draft.monsters.forEach((m, idx) => {
            const complete = isPvpPresetMonsterComplete(m);
            const card = document.createElement('div');
            card.className = `bg-[#16202b] border rounded-xl p-2.5 flex items-center space-x-2.5 cursor-pointer active:scale-[0.98] transition-all ${complete ? 'border-sky-800/60' : 'border-dashed border-gray-700'}`;
            card.onclick = () => openPvpPresetMonsterEditor(idx);

            const iconWrap = document.createElement('div');
            iconWrap.className = 'w-10 h-10 flex items-center justify-center text-2xl flex-shrink-0 bg-[#0a0f1a] rounded-full border border-sky-900/40 overflow-hidden';
            card.appendChild(iconWrap);

            const info = document.createElement('div');
            info.className = 'flex-1 min-w-0';
            if (complete) {
                const tmpl = MONSTER_TEMPLATES[m.speciesId];
                renderMonsterVisual(iconWrap, tmpl.name, tmpl.emoji, false, true, m.aura);
                const skillNames = buildSkillListWithAuraText(m.skills);
                const equipText = (m.equipId && EQUIPMENT_DB[m.equipId]) ? EQUIPMENT_DB[m.equipId].name : '未装備';
                const auraInfo = m.aura ? AURA_TYPES[m.aura] : null;
                const typeBadge = tmpl.dualStatType
                    ? `<span class="ml-1 text-[8px] font-bold px-1 py-0.5 rounded bg-rose-900/60 text-rose-200">${m.statType === 'pow' ? 'ちから型' : 'かしこさ型'}</span>`
                    : '';
                info.innerHTML = `
                    <div class="text-xs font-bold text-sky-200">${idx + 1}体目：${tmpl.name}${typeBadge}${auraInfo ? ` <span class="text-[10px]" title="オーラ: ${auraInfo.name}">${auraInfo.emoji}</span>` : ''}</div>
                    <div class="text-[9px] text-gray-500 mt-0.5 truncate">技: ${skillNames}</div>
                    <div class="text-[9px] text-purple-300 mt-0.5">装備: ${equipText}</div>
                `;
            } else {
                iconWrap.textContent = '❔';
                info.innerHTML = `<div class="text-xs font-bold text-gray-500">${idx + 1}体目：未設定（タップして編集）</div>`;
            }
            card.appendChild(info);

            const chevron = document.createElement('i');
            chevron.className = 'fa-solid fa-chevron-right text-sky-700 text-xs flex-shrink-0';
            card.appendChild(chevron);

            container.appendChild(card);
        });
    }

    updatePvpPresetEditorSaveButton();
}

function onPvpPresetEditorNameInput(value) {
    if (!PVP_PRESET_STATE.draftPreset) return;
    PVP_PRESET_STATE.draftPreset.name = (value || '').slice(0, 20);
}

function updatePvpPresetEditorSaveButton() {
    const btn = document.getElementById('pvp-preset-editor-save-btn');
    if (!btn || !PVP_PRESET_STATE.draftPreset) return;
    const complete = isPvpPresetComplete(PVP_PRESET_STATE.draftPreset);
    btn.disabled = !complete;
    btn.classList.toggle('opacity-50', !complete);
    if (complete) {
        btn.textContent = 'このプリセットを保存';
    } else {
        const missing = PVP_PRESET_STATE.draftPreset.monsters.filter(m => !isPvpPresetMonsterComplete(m)).length;
        btn.textContent = `保存する（あと${missing}体設定してください）`;
    }
}

async function savePvpPresetEditor() {
    const draft = PVP_PRESET_STATE.draftPreset;
    const slotIndex = PVP_PRESET_STATE.editingSlot;
    if (!draft || slotIndex === null || slotIndex === undefined) return;
    if (!isPvpPresetComplete(draft)) {
        showToast('6体すべて設定してから保存してください。');
        return;
    }
    if (!draft.name || !draft.name.trim()) draft.name = `プリセット${slotIndex + 1}`;

    const btn = document.getElementById('pvp-preset-editor-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = '保存中...'; }

    const ok = await savePvpPresetSlotToFirebase(slotIndex, draft);
    if (ok) {
        PVP_PRESET_STATE.presets[slotIndex] = JSON.parse(JSON.stringify(draft));
        showToast('プリセットを保存しました。');
        PVP_PRESET_STATE.draftPreset = null;
        PVP_PRESET_STATE.editingSlot = null;
        changeScreen('screen-pvp-preset-list');
        renderPvpPresetList();
    } else {
        updatePvpPresetEditorSaveButton();
    }
}

function cancelPvpPresetEditor() {
    PVP_PRESET_STATE.draftPreset = null;
    PVP_PRESET_STATE.editingSlot = null;
    changeScreen('screen-pvp-preset-list');
    renderPvpPresetList();
}

// -----------------------------------------------------
// モンスター1体編集画面（① 種族 → ② タイプ（ちから型/かしこさ型・対象種族のみ） → ③ 技（最大4） → ④ 装備）
// -----------------------------------------------------
function openPvpPresetMonsterEditor(monsterIndex) {
    PVP_PRESET_STATE.editingMonsterIndex = monsterIndex;
    const existing = PVP_PRESET_STATE.draftPreset.monsters[monsterIndex];
    PVP_PRESET_STATE.draftMonster = existing
        ? JSON.parse(JSON.stringify(existing))
        : { speciesId: null, skills: [], equipId: null, statType: null, aura: null };
    changeScreen('screen-pvp-preset-monster-editor');
    renderPvpPresetMonsterEditorScreen();
}

function pvpPresetMonsterSkillLimit() {
    const m = PVP_PRESET_STATE.draftMonster;
    if (!m || !m.speciesId) return 4;
    const pool = KIN_NEJIKI_SKILL_POOL[m.speciesId] || [];
    return Math.max(1, Math.min(4, pool.length));
}

function renderPvpPresetMonsterEditorScreen() {
    const m = PVP_PRESET_STATE.draftMonster;
    if (!m) return;

    const title = document.getElementById('pvp-preset-monster-editor-title');
    if (title) title.textContent = `${PVP_PRESET_STATE.editingMonsterIndex + 1}体目の編集`;

    // ① 種族一覧
    const speciesContainer = document.getElementById('pvp-preset-monster-species-list');
    if (speciesContainer) {
        speciesContainer.innerHTML = '';
        KIN_NEJIKI_SPECIES_POOL.forEach(speciesId => {
            const tmpl = MONSTER_TEMPLATES[speciesId];
            if (!tmpl) return;
            const isSelected = m.speciesId === speciesId;
            const btn = document.createElement('div');
            btn.className = `flex flex-col items-center justify-center p-1.5 rounded-lg border cursor-pointer active:scale-95 transition-all ${isSelected ? 'bg-sky-900 border-sky-400' : 'bg-[#16202b] border-sky-900/40'}`;
            btn.onclick = () => selectPvpPresetMonsterSpecies(speciesId);

            const iconWrap = document.createElement('div');
            iconWrap.className = 'w-9 h-9 flex items-center justify-center text-xl';
            btn.appendChild(iconWrap);

            const label = document.createElement('div');
            label.className = 'text-[8px] text-gray-300 mt-0.5 text-center leading-tight';
            label.textContent = tmpl.name;
            btn.appendChild(label);

            speciesContainer.appendChild(btn);
            renderMonsterVisual(iconWrap, tmpl.name, tmpl.emoji, false, true, m.aura);
        });
    }

    const statTypeSection = document.getElementById('pvp-preset-monster-stattype-section');
    const skillsSection = document.getElementById('pvp-preset-monster-skills-section');
    const equipSection = document.getElementById('pvp-preset-monster-equip-section');
    const auraSection = document.getElementById('pvp-preset-monster-aura-section');

    if (!m.speciesId) {
        if (statTypeSection) statTypeSection.classList.add('hidden');
        if (skillsSection) skillsSection.classList.add('hidden');
        if (equipSection) equipSection.classList.add('hidden');
        if (auraSection) auraSection.classList.add('hidden');
        updatePvpPresetMonsterConfirmButton();
        return;
    }

    const tmpl = MONSTER_TEMPLATES[m.speciesId];
    const isDualStatType = !!(tmpl && tmpl.dualStatType);

    if (statTypeSection) {
        statTypeSection.classList.toggle('hidden', !isDualStatType);
        if (isDualStatType) {
            const powBtn = document.getElementById('pvp-preset-monster-stattype-pow-btn');
            const intBtn = document.getElementById('pvp-preset-monster-stattype-int-btn');
            const activeCls = 'flex-1 py-2 text-xs font-bold rounded-lg border transition-all bg-rose-900 border-rose-400 text-rose-100';
            const inactiveCls = 'flex-1 py-2 text-xs font-bold rounded-lg border transition-all bg-[#16202b] border-rose-900/40 text-gray-400';
            if (powBtn) powBtn.className = m.statType === 'pow' ? activeCls : inactiveCls;
            if (intBtn) intBtn.className = m.statType === 'int' ? activeCls : inactiveCls;
        }
    }

    if (skillsSection) skillsSection.classList.remove('hidden');
    if (equipSection) equipSection.classList.remove('hidden');
    if (auraSection) auraSection.classList.remove('hidden');

    // ② 技一覧
    const skillLimit = pvpPresetMonsterSkillLimit();
    const skillCountLabel = document.getElementById('pvp-preset-monster-skill-count');
    if (skillCountLabel) skillCountLabel.textContent = `（${m.skills.length}/${skillLimit}）`;

    const skillContainer = document.getElementById('pvp-preset-monster-skill-list');
    if (skillContainer) {
        skillContainer.innerHTML = '';
        const pool = KIN_NEJIKI_SKILL_POOL[m.speciesId] || [];
        pool.forEach(skKey => {
            const sk = SKILLS_DB[skKey];
            if (!sk) return;
            const isSelected = m.skills.includes(skKey);
            const row = document.createElement('div');
            row.className = `p-2 rounded-lg border cursor-pointer active:scale-[0.98] transition-all ${isSelected ? 'bg-sky-900/60 border-sky-400' : 'bg-[#16202b] border-sky-900/30'}`;
            row.onclick = () => togglePvpPresetMonsterSkill(skKey);
            row.innerHTML = `
                <div class="flex items-center justify-between gap-2">
                    <span class="text-[11px] font-bold text-sky-200">${isSelected ? '✅ ' : ''}${sk.name}</span>
                    <span class="text-[9px] text-gray-500 whitespace-nowrap">GUTS${sk.cost}</span>
                </div>
                <div class="text-[9px] text-gray-500 mt-0.5 leading-relaxed">${sk.desc}</div>
            `;
            skillContainer.appendChild(row);
        });
    }

    // ③ 装備一覧
    const equipContainer = document.getElementById('pvp-preset-monster-equip-list');
    if (equipContainer) {
        equipContainer.innerHTML = '';

        const noneSelected = !m.equipId;
        const noneRow = document.createElement('div');
        noneRow.className = `p-2 rounded-lg border cursor-pointer active:scale-[0.98] transition-all ${noneSelected ? 'bg-purple-900/60 border-purple-400' : 'bg-[#16202b] border-purple-900/30'}`;
        noneRow.onclick = () => selectPvpPresetMonsterEquip(null);
        noneRow.innerHTML = `<span class="text-[11px] font-bold text-purple-200">${noneSelected ? '✅ ' : ''}装備なし</span>`;
        equipContainer.appendChild(noneRow);

        Object.values(EQUIPMENT_DB).forEach(base => {
            const isSelected = m.equipId === base.id;
            const row = document.createElement('div');
            row.className = `p-2 rounded-lg border cursor-pointer active:scale-[0.98] transition-all ${isSelected ? 'bg-purple-900/60 border-purple-400' : 'bg-[#16202b] border-purple-900/30'}`;
            row.onclick = () => selectPvpPresetMonsterEquip(base.id);
            const effectText = (typeof getEquipmentDexEffectText === 'function') ? getEquipmentDexEffectText(base) : (base.desc || '');
            row.innerHTML = `
                <div class="flex items-center justify-between gap-2">
                    <span class="text-[11px] font-bold text-purple-200">${isSelected ? '✅ ' : ''}${base.icon} ${base.name}</span>
                    <span class="text-[9px] whitespace-nowrap ${base.rarity && base.rarity.includes('★★★') ? 'text-amber-400' : 'text-gray-500'}">${base.rarity || ''}</span>
                </div>
                <div class="text-[9px] text-gray-500 mt-0.5 leading-relaxed">${effectText}</div>
            `;
            equipContainer.appendChild(row);
        });
    }

    // ⑤ オーラ一覧
    const auraContainer = document.getElementById('pvp-preset-monster-aura-list');
    if (auraContainer) {
        auraContainer.innerHTML = '';
        Object.values(AURA_TYPES).forEach(aura => {
            if (aura.exclusive) return; // モスト専用オーラ等は通常のPvP編成では選べないようにする
            const isSelected = m.aura === aura.key;
            const btn = document.createElement('div');
            btn.className = `flex flex-col items-center justify-center p-2 rounded-lg border cursor-pointer active:scale-95 transition-all ${isSelected ? 'bg-amber-900/60 border-amber-400' : 'bg-[#16202b] border-amber-900/30'}`;
            btn.onclick = () => selectPvpPresetMonsterAura(aura.key);
            btn.innerHTML = `
                <span class="text-xl">${aura.emoji}</span>
                <span class="text-[9px] font-bold text-gray-300 mt-0.5">${aura.name}${isSelected ? ' ✅' : ''}</span>
            `;
            auraContainer.appendChild(btn);
        });
    }

    updatePvpPresetMonsterConfirmButton();
}

function selectPvpPresetMonsterSpecies(speciesId) {
    const m = PVP_PRESET_STATE.draftMonster;
    if (!m || m.speciesId === speciesId) return;
    m.speciesId = speciesId;
    m.skills = []; // 種族が変わると技候補も変わるため選択済みの技はリセットする
    m.statType = null; // 種族が変わるとタイプ（ちから型/かしこさ型）の対象も変わるためリセットする
    renderPvpPresetMonsterEditorScreen();
}

// --- ちから特化型／かしこさ特化型の2系統を持つ種族（モッチー・モノリスなど）向け：型を選ぶ ---
function selectPvpPresetMonsterStatType(statType) {
    const m = PVP_PRESET_STATE.draftMonster;
    if (!m) return;
    m.statType = statType;
    renderPvpPresetMonsterEditorScreen();
}

function togglePvpPresetMonsterSkill(skillKey) {
    const m = PVP_PRESET_STATE.draftMonster;
    if (!m) return;
    const limit = pvpPresetMonsterSkillLimit();
    const pos = m.skills.indexOf(skillKey);
    if (pos >= 0) {
        m.skills.splice(pos, 1);
    } else {
        if (m.skills.length >= limit) {
            showToast(`技は最大${limit}個まで選択できます。`);
            return;
        }
        m.skills.push(skillKey);
    }
    renderPvpPresetMonsterEditorScreen();
}

function selectPvpPresetMonsterEquip(equipId) {
    const m = PVP_PRESET_STATE.draftMonster;
    if (!m) return;
    m.equipId = equipId;
    renderPvpPresetMonsterEditorScreen();
}

// --- PvPプリセット：モンスターのオーラ（赤/緑/黄/青）を選ぶ ---
function selectPvpPresetMonsterAura(auraKey) {
    const m = PVP_PRESET_STATE.draftMonster;
    if (!m) return;
    m.aura = auraKey;
    renderPvpPresetMonsterEditorScreen();
}

function updatePvpPresetMonsterConfirmButton() {
    const btn = document.getElementById('pvp-preset-monster-editor-confirm-btn');
    if (!btn) return;
    const ok = isPvpPresetMonsterComplete(PVP_PRESET_STATE.draftMonster);
    btn.disabled = !ok;
    btn.classList.toggle('opacity-50', !ok);
}

function confirmPvpPresetMonsterEditor() {
    const m = PVP_PRESET_STATE.draftMonster;
    if (!m || !m.speciesId || !m.skills || m.skills.length === 0) {
        showToast('モンスターと技を1つ以上選択してください。');
        return;
    }
    const tmpl = MONSTER_TEMPLATES[m.speciesId];
    if (tmpl && tmpl.dualStatType && m.statType !== 'pow' && m.statType !== 'int') {
        showToast('ちから型／かしこさ型のどちらかを選択してください。');
        return;
    }
    if (!m.aura || !AURA_TYPES[m.aura]) {
        showToast('オーラを1つ選択してください。');
        return;
    }
    const idx = PVP_PRESET_STATE.editingMonsterIndex;
    PVP_PRESET_STATE.draftPreset.monsters[idx] = JSON.parse(JSON.stringify(m));
    PVP_PRESET_STATE.draftMonster = null;
    PVP_PRESET_STATE.editingMonsterIndex = null;
    changeScreen('screen-pvp-preset-editor');
    renderPvpPresetEditorScreen();
}

function cancelPvpPresetMonsterEditor() {
    PVP_PRESET_STATE.draftMonster = null;
    PVP_PRESET_STATE.editingMonsterIndex = null;
    changeScreen('screen-pvp-preset-editor');
    renderPvpPresetEditorScreen();
}
