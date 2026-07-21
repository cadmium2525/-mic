// =====================================================
// audio.js
// BGM / SE 管理モジュール。
//
// 外部の音声ファイルを一切使わず、Web Audio API でその場で波形を
// 合成して再生する（＝アセット不要で軽量、オフラインPWAとも相性が良い）。
//
// ・音量は BGM/SE それぞれ 0〜100 の数値で個別に指定できる。初期値はどちらも 0（無音）。
// ・設定は localStorage に保存され、次回起動時も復元される。
//   （旧バージョンの「OFF・小・中・大」の4段階設定が残っている場合は、
//   相当する数値へ自動的に変換して引き継ぐ）
// ・画面遷移（changeScreen）・戦闘演出（showEffect）・通知（showToast）を
//   ラップして自動的に適切な音を鳴らす。個々の画面のコードは変更不要。
//
// 他の game_*.js / masmon_*.js より後、かつそれらが定義する
// changeScreen / showEffect / showToast をラップするため
// index.html の <script> 読み込み順は「最後」に置くこと。
// =====================================================

const AudioManager = (() => {

    const STORAGE_KEY = 'mfload_audio_settings';
    const VOLUME_MIN = 0;
    const VOLUME_MAX = 100;
    // 音量100%時の実際のゲイン値（旧「大」相当の値を踏襲）
    const BGM_MAX_GAIN = 0.28;
    const SE_MAX_GAIN = 0.8;
    // 旧バージョン（OFF/小/中/大の4段階）からの移行用：相当する0〜100の数値に変換する
    const LEGACY_LEVEL_TO_VOLUME = { off: 0, small: 30, mid: 55, large: 100 };

    let settings = { bgm: 0, se: 0 };

    let ctx = null;
    let masterBgmGain = null;
    let masterSeGain = null;
    let noiseBuffer = null;

    let currentTrackName = null;
    let bgmTimerId = null;
    let bgmToken = 0;
    let activeBgmNodes = []; // 現在スケジュール済みのBGM用osc/gainノード（曲切り替え時に即座に停止するため）

    function clampVolume(v) {
        const n = Number(v);
        if (!Number.isFinite(n)) return 0;
        return Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, Math.round(n)));
    }

    function bgmVolumeToGain(v) {
        return (clampVolume(v) / VOLUME_MAX) * BGM_MAX_GAIN;
    }

    function seVolumeToGain(v) {
        return (clampVolume(v) / VOLUME_MAX) * SE_MAX_GAIN;
    }

    // ---------------------------------------------------
    // 設定の読み書き（LocalStorage）
    // ---------------------------------------------------
    function loadSettings() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const saved = JSON.parse(raw);
            if (!saved) return;
            // 旧形式（'off'|'small'|'mid'|'large'）からの移行
            const bgmRaw = (typeof saved.bgm === 'string') ? LEGACY_LEVEL_TO_VOLUME[saved.bgm] : saved.bgm;
            const seRaw = (typeof saved.se === 'string') ? LEGACY_LEVEL_TO_VOLUME[saved.se] : saved.se;
            if (typeof bgmRaw === 'number') settings.bgm = clampVolume(bgmRaw);
            if (typeof seRaw === 'number') settings.se = clampVolume(seRaw);
        } catch (e) { /* 読み込み失敗時は初期値(0)のまま */ }
    }

    function saveSettings() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (e) { /* プライベートブラウズ等で失敗しても無視 */ }
    }

    // ---------------------------------------------------
    // AudioContext 初期化・再開
    // ---------------------------------------------------
    function ensureContext() {
        if (ctx) return ctx;
        try {
            const Ctor = window.AudioContext || window.webkitAudioContext;
            if (!Ctor) return null;
            ctx = new Ctor();
            masterBgmGain = ctx.createGain();
            masterBgmGain.gain.value = bgmVolumeToGain(settings.bgm);
            masterBgmGain.connect(ctx.destination);

            masterSeGain = ctx.createGain();
            masterSeGain.gain.value = seVolumeToGain(settings.se);
            masterSeGain.connect(ctx.destination);
        } catch (e) {
            console.warn('[AudioManager] Web Audio API が利用できません:', e);
            ctx = null;
        }
        return ctx;
    }

    function resume() {
        const c = ensureContext();
        if (c && c.state === 'suspended') {
            c.resume().catch(() => {});
        }
    }

    // 初回のユーザー操作でAudioContextのロックを解除する（ブラウザの自動再生制限対策）
    function installUnlockListener() {
        const unlock = () => {
            resume();
            document.removeEventListener('pointerdown', unlock, true);
            document.removeEventListener('keydown', unlock, true);
        };
        document.addEventListener('pointerdown', unlock, true);
        document.addEventListener('keydown', unlock, true);
    }

    // ---------------------------------------------------
    // 音名 → 周波数
    // ---------------------------------------------------
    const NOTE_INDEX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
    function noteFreq(note) {
        if (!note) return null;
        const m = /^([A-G]#?)(\d)$/.exec(note);
        if (!m) return null;
        const semitoneFromA4 = (parseInt(m[2], 10) - 4) * 12 + (NOTE_INDEX[m[1]] - NOTE_INDEX['A']);
        return 440 * Math.pow(2, semitoneFromA4 / 12);
    }

    // ---------------------------------------------------
    // 単音の合成・再生
    // ---------------------------------------------------
    function tone({ freq, freqEnd = null, duration = 0.15, type = 'square', when = 0, volume = 1, gainNode }) {
        const c = ensureContext();
        if (!c || !freq) return;
        const osc = c.createOscillator();
        osc.type = type;
        const startAt = c.currentTime + when;
        osc.frequency.setValueAtTime(freq, startAt);
        if (freqEnd) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), startAt + duration);
        }
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, startAt);
        g.gain.linearRampToValueAtTime(volume, startAt + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
        osc.connect(g);
        g.connect(gainNode);
        osc.start(startAt);
        osc.stop(startAt + duration + 0.03);
        return { osc, gain: g };
    }

    function getNoiseBuffer() {
        const c = ensureContext();
        if (!c) return null;
        if (noiseBuffer) return noiseBuffer;
        const len = c.sampleRate * 0.5;
        noiseBuffer = c.createBuffer(1, len, c.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        return noiseBuffer;
    }

    function noiseBurst({ duration = 0.12, when = 0, volume = 1, filterFreq = 1200, gainNode }) {
        const c = ensureContext();
        const buf = getNoiseBuffer();
        if (!c || !buf) return;
        const src = c.createBufferSource();
        src.buffer = buf;
        const filter = c.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = filterFreq;
        const g = c.createGain();
        const startAt = c.currentTime + when;
        g.gain.setValueAtTime(volume, startAt);
        g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
        src.connect(filter);
        filter.connect(g);
        g.connect(gainNode);
        src.start(startAt);
        src.stop(startAt + duration + 0.03);
    }

    // ---------------------------------------------------
    // SE（効果音）定義
    // ---------------------------------------------------
    const SE_DEFS = {
        click: () => tone({ freq: 720, duration: 0.05, type: 'square', volume: 0.5, gainNode: masterSeGain }),
        decide: () => {
            tone({ freq: 523, duration: 0.07, type: 'square', volume: 0.5, gainNode: masterSeGain });
            tone({ freq: 784, duration: 0.09, type: 'square', when: 0.06, volume: 0.5, gainNode: masterSeGain });
        },
        cancel: () => {
            tone({ freq: 392, duration: 0.09, type: 'triangle', volume: 0.45, gainNode: masterSeGain });
            tone({ freq: 294, duration: 0.1, type: 'triangle', when: 0.06, volume: 0.4, gainNode: masterSeGain });
        },
        hit: () => {
            noiseBurst({ duration: 0.09, volume: 0.55, filterFreq: 1800, gainNode: masterSeGain });
            tone({ freq: 180, freqEnd: 90, duration: 0.1, type: 'square', volume: 0.5, gainNode: masterSeGain });
        },
        critical: () => {
            noiseBurst({ duration: 0.1, volume: 0.7, filterFreq: 2600, gainNode: masterSeGain });
            tone({ freq: 220, freqEnd: 70, duration: 0.14, type: 'sawtooth', volume: 0.6, gainNode: masterSeGain });
            tone({ freq: 880, duration: 0.08, type: 'square', when: 0.08, volume: 0.4, gainNode: masterSeGain });
        },
        miss: () => tone({ freq: 500, freqEnd: 150, duration: 0.22, type: 'sine', volume: 0.4, gainNode: masterSeGain }),
        defend: () => tone({ freq: 150, freqEnd: 100, duration: 0.18, type: 'triangle', volume: 0.55, gainNode: masterSeGain }),
        heal: () => {
            ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => {
                tone({ freq: noteFreq(n), duration: 0.16, type: 'triangle', when: i * 0.07, volume: 0.4, gainNode: masterSeGain });
            });
        },
        buff: () => {
            ['C5', 'F5', 'A5'].forEach((n, i) => {
                tone({ freq: noteFreq(n), duration: 0.12, type: 'square', when: i * 0.05, volume: 0.35, gainNode: masterSeGain });
            });
        },
        debuff: () => {
            ['A4', 'F4', 'D4'].forEach((n, i) => {
                tone({ freq: noteFreq(n), duration: 0.14, type: 'sawtooth', when: i * 0.06, volume: 0.35, gainNode: masterSeGain });
            });
        },
        status: () => tone({ freq: 300, freqEnd: 600, duration: 0.3, type: 'sine', volume: 0.3, gainNode: masterSeGain }),
        win: () => {
            ['C5', 'E5', 'G5', 'C6', 'G5', 'C6'].forEach((n, i) => {
                tone({ freq: noteFreq(n), duration: 0.18, type: 'square', when: i * 0.11, volume: 0.5, gainNode: masterSeGain });
            });
        },
        lose: () => {
            ['A4', 'G4', 'F4', 'D4'].forEach((n, i) => {
                tone({ freq: noteFreq(n), duration: 0.28, type: 'triangle', when: i * 0.16, volume: 0.4, gainNode: masterSeGain });
            });
        },
        item: () => {
            tone({ freq: noteFreq('E6'), duration: 0.06, type: 'square', volume: 0.4, gainNode: masterSeGain });
            tone({ freq: noteFreq('B6'), duration: 0.14, type: 'square', when: 0.06, volume: 0.4, gainNode: masterSeGain });
        },
        notify: () => tone({ freq: 660, duration: 0.09, type: 'sine', volume: 0.4, gainNode: masterSeGain }),
        error: () => {
            tone({ freq: 220, duration: 0.14, type: 'sawtooth', volume: 0.4, gainNode: masterSeGain });
            tone({ freq: 165, duration: 0.18, type: 'sawtooth', when: 0.1, volume: 0.4, gainNode: masterSeGain });
        },
        toggle: () => tone({ freq: 900, duration: 0.05, type: 'sine', volume: 0.4, gainNode: masterSeGain }),
    };

    function playSE(name) {
        if (settings.se === 0) return;
        const c = ensureContext();
        if (!c) return;
        resume();
        const fn = SE_DEFS[name];
        if (fn) fn();
    }

    // ---------------------------------------------------
    // BGM（ループ楽曲）定義：メロディ + ベースの2声チップチューン
    // 各音符は [音名 or null(休符), 拍数] の配列
    // ---------------------------------------------------
    const BGM_TRACKS = {
        title: {
            tempo: 100, leadType: 'triangle', bassType: 'sine',
            lead: [['C4',1],['E4',1],['G4',1],['C5',1],['B4',1],['G4',1],['E4',1],['D4',1],
                   ['C4',1],['F4',1],['A4',1],['C5',1],['G4',1],['E4',1],['D4',1],['C4',2]],
            bass: [['C3',2],['G3',2],['A3',2],['E3',2],['F3',2],['C3',2],['G3',2],['C3',2]],
        },
        adventure: {
            tempo: 118, leadType: 'triangle', bassType: 'sine',
            lead: [['E4',0.5],['G4',0.5],['A4',1],['G4',0.5],['E4',0.5],['D4',1],
                   ['E4',0.5],['G4',0.5],['C5',1],['B4',0.5],['G4',0.5],['A4',1],
                   [null,0.5],['E4',0.5],['D4',0.5],['C4',0.5],['D4',2]],
            bass: [['A3',2],['E3',2],['F3',2],['C3',2],['A3',2],['E3',2],['G3',1],['A3',1],['D3',2]],
        },
        battle: {
            // 疾走感のあるJRPG風バトル曲（完全新規オリジナル作曲）。
            // Dナチュラルマイナー・テンポ168のハイテンポ構成で、ガロップ気味の
            // ベースラインの上に、跳躍を多用したサビ（アルペジオ）を乗せることで
            // 緊迫感・高揚感を狙っている。「イントロ→ヴァース→サビ→ヴァース→サビ」の
            // 1周72拍構成で、サビの着地からイントロ冒頭へ自然にループする。
            tempo: 168, leadType: 'square', bassType: 'sawtooth',
            lead: [
                // --- イントロ (8拍)：主音と属音を交互に刻みながら駆け上がる ---
                ['D4',0.5],['D4',0.5],['F4',0.5],['D4',0.5],['A4',0.5],['D5',0.5],['C5',0.5],['A4',0.5],
                ['F4',0.5],['A4',0.5],['C5',0.5],['D5',0.5],['A4',0.5],['F4',0.5],['D4',0.5],['A4',0.5],
                // --- ヴァース (16拍)：下降シーケンスを軸にしたメロディ ---
                ['A4',0.5],['C5',0.5],['D5',0.5],['C5',0.5],['A4',0.5],['F4',0.5],['G4',0.5],['A4',0.5],
                ['A4',0.5],['C5',0.5],['D5',0.5],['C5',0.5],['A4',0.5],['G4',0.5],['F4',0.5],['D4',0.5],
                ['G4',0.5],['A4',0.5],['A#4',0.5],['A4',0.5],['G4',0.5],['F4',0.5],['E4',0.5],['D4',0.5],
                ['F4',0.5],['G4',0.5],['A4',0.5],['G4',0.5],['F4',0.5],['E4',0.5],['D4',0.5],[null,0.5],
                // --- サビ (16拍)：オクターブ跳躍のアルペジオで一気に盛り上げる ---
                ['D5',0.5],['F5',0.5],['A5',0.5],['F5',0.5],['D5',0.5],['F5',0.5],['A5',0.5],['C6',0.5],
                ['A#5',0.5],['A5',0.5],['G5',0.5],['F5',0.5],['E5',0.5],['G5',0.5],['F5',0.5],['D5',0.5],
                ['D5',0.5],['F5',0.5],['A5',0.5],['F5',0.5],['D5',0.5],['F5',0.5],['A5',0.5],['C6',0.5],
                ['A#5',0.5],['A5',0.5],['G5',0.5],['F5',0.5],['E5',0.5],['D5',0.5],['C5',0.5],[null,0.5],
                // --- ヴァース (16拍・再) ---
                ['A4',0.5],['C5',0.5],['D5',0.5],['C5',0.5],['A4',0.5],['F4',0.5],['G4',0.5],['A4',0.5],
                ['A4',0.5],['C5',0.5],['D5',0.5],['C5',0.5],['A4',0.5],['G4',0.5],['F4',0.5],['D4',0.5],
                ['G4',0.5],['A4',0.5],['A#4',0.5],['A4',0.5],['G4',0.5],['F4',0.5],['E4',0.5],['D4',0.5],
                ['F4',0.5],['G4',0.5],['A4',0.5],['G4',0.5],['F4',0.5],['E4',0.5],['D4',0.5],[null,0.5],
                // --- サビ (16拍・再) ---
                ['D5',0.5],['F5',0.5],['A5',0.5],['F5',0.5],['D5',0.5],['F5',0.5],['A5',0.5],['C6',0.5],
                ['A#5',0.5],['A5',0.5],['G5',0.5],['F5',0.5],['E5',0.5],['G5',0.5],['F5',0.5],['D5',0.5],
                ['D5',0.5],['F5',0.5],['A5',0.5],['F5',0.5],['D5',0.5],['F5',0.5],['A5',0.5],['C6',0.5],
                ['A#5',0.5],['A5',0.5],['G5',0.5],['F5',0.5],['E5',0.5],['D5',0.5],['C5',0.5],[null,0.5],
            ],
            bass: [
                // --- イントロ (8拍)：主音固定のガロップ刻み ---
                ['D2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],
                ['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['G2',0.5],['G2',0.5],['G2',0.5],['G2',0.5],
                // --- ヴァース (16拍)：ルート-5度の往復 ---
                ['D2',0.5],['A2',0.5],['D2',0.5],['A2',0.5],['F2',0.5],['C3',0.5],['F2',0.5],['C3',0.5],
                ['D2',0.5],['A2',0.5],['D2',0.5],['A2',0.5],['G2',0.5],['D3',0.5],['G2',0.5],[null,0.5],
                ['A#2',0.5],['F3',0.5],['A#2',0.5],['F3',0.5],['G2',0.5],['D3',0.5],['G2',0.5],['D3',0.5],
                ['F2',0.5],['C3',0.5],['F2',0.5],['C3',0.5],['G2',0.5],['D3',0.5],['G2',0.5],[null,0.5],
                // --- サビ (16拍)：8分刻みで畳みかける ---
                ['D2',0.5],['D2',0.5],['A2',0.5],['A2',0.5],['D2',0.5],['D2',0.5],['A2',0.5],['A2',0.5],
                ['A#2',0.5],['A#2',0.5],['F2',0.5],['F2',0.5],['A#2',0.5],['A#2',0.5],['F2',0.5],['F2',0.5],
                ['D2',0.5],['D2',0.5],['A2',0.5],['A2',0.5],['D2',0.5],['D2',0.5],['A2',0.5],['A2',0.5],
                ['A#2',0.5],['A#2',0.5],['F2',0.5],['F2',0.5],['G2',0.5],['G2',0.5],['C3',0.5],[null,0.5],
                // --- ヴァース (16拍・再) ---
                ['D2',0.5],['A2',0.5],['D2',0.5],['A2',0.5],['F2',0.5],['C3',0.5],['F2',0.5],['C3',0.5],
                ['D2',0.5],['A2',0.5],['D2',0.5],['A2',0.5],['G2',0.5],['D3',0.5],['G2',0.5],[null,0.5],
                ['A#2',0.5],['F3',0.5],['A#2',0.5],['F3',0.5],['G2',0.5],['D3',0.5],['G2',0.5],['D3',0.5],
                ['F2',0.5],['C3',0.5],['F2',0.5],['C3',0.5],['G2',0.5],['D3',0.5],['G2',0.5],[null,0.5],
                // --- サビ (16拍・再) ---
                ['D2',0.5],['D2',0.5],['A2',0.5],['A2',0.5],['D2',0.5],['D2',0.5],['A2',0.5],['A2',0.5],
                ['A#2',0.5],['A#2',0.5],['F2',0.5],['F2',0.5],['A#2',0.5],['A#2',0.5],['F2',0.5],['F2',0.5],
                ['D2',0.5],['D2',0.5],['A2',0.5],['A2',0.5],['D2',0.5],['D2',0.5],['A2',0.5],['A2',0.5],
                ['A#2',0.5],['A#2',0.5],['F2',0.5],['F2',0.5],['G2',0.5],['G2',0.5],['C3',0.5],[null,0.5],
            ],
        },
        // レジェンドブリーダー・コルト（3セット目ボス戦）専用BGM。
        // 低音を厚めにしたテンポ控えめの重厚な曲調で「ボス戦」感を強調する。
        boss: {
            tempo: 108, leadType: 'sawtooth', bassType: 'square',
            lead: [
                // イントロ：低音域の付点リズムによる威圧的な入り (8拍)
                ['D4',0.75],[null,0.25],['D4',0.5],[null,0.5],['F4',0.75],[null,0.25],['E4',0.5],['D4',0.5],
                ['A4',0.75],[null,0.25],['G4',0.5],['D4',0.5],['A#4',1],['A4',1],
                // 展開：畳みかけるような8分刻み。トライトーン(G#)で不穏さを演出 (8拍)
                ['D4',0.5],['D4',0.5],['F4',0.5],['D4',0.5],['G#4',0.5],['G4',0.5],['F4',0.5],['E4',0.5],
                ['D4',0.5],['D4',0.5],['C5',0.5],['A#4',0.5],['A4',0.5],['G4',0.5],['F4',0.5],['E4',0.5],
                // 頂点：大きく間を取った一撃ずつの強打 (8拍)
                ['D5',1],[null,0.5],['C5',0.5],['A#4',1],[null,0.5],['A4',0.5],['D5',1.5],[null,0.5],['A4',1],['D4',1],
            ],
            bass: [
                ['D2',1],['D2',1],['A2',1],['D2',1],['F2',1],['F2',1],['C3',1],['D2',1],
                ['D2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],
                ['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['C3',0.5],['C3',0.5],['C3',0.5],['C3',0.5],
                ['D2',2],['A2',2],['A#2',2],['D2',2],
            ],
        },
        // レジェンドブリーダー・コルト（7セット目・最終決戦）専用BGM（完全新規オリジナル作曲）。
        // Aハーモニックマイナー・テンポ176の疾走感あるドラマチックな構成で、
        // 「壮大なラスボス決戦」のムードを狙っている（特定の既存楽曲の引用・模倣ではない）。
        // ノコギリ波の鋭いリードと矩形波の力強いオクターブ刻みベースで畳みかけつつ、
        // サビでは跳躍の大きいアルペジオにより頂点の高揚感を演出する。
        // 「イントロ→ヴァース→サビ→ヴァース→サビ」の1周72拍構成で自然にループする。
        finalboss: {
            tempo: 176, leadType: 'sawtooth', bassType: 'square',
            lead: [
                // --- イントロ (8拍)：主音のオクターブ連打から一気に駆け上がる ---
                ['A4',0.5],['A4',0.5],['A4',0.5],['A4',0.5],['E5',0.5],['E5',0.5],['E5',0.5],['E5',0.5],
                ['F5',0.5],['F5',0.5],['E5',0.5],['E5',0.5],['D5',0.5],['D5',0.5],['C5',0.5],['C5',0.5],
                // --- ヴァース (16拍)：ハーモニックマイナー特有の増2度(F-G#)を含む緊迫したメロディ ---
                ['E5',0.5],['D5',0.5],['C5',0.5],['B4',0.5],['A4',0.5],['G#4',0.5],['A4',0.5],['C5',0.5],
                ['E5',0.5],['D5',0.5],['C5',0.5],['B4',0.5],['A4',0.5],['G#4',0.5],['A4',0.5],['B4',0.5],
                ['C5',0.5],['B4',0.5],['A4',0.5],['G#4',0.5],['A4',0.5],['B4',0.5],['C5',0.5],['D5',0.5],
                ['E5',0.5],['F5',0.5],['E5',0.5],['D5',0.5],['C5',0.5],['B4',0.5],['A4',0.5],[null,0.5],
                // --- サビ (16拍)：オクターブ跳躍のアルペジオで一気に頂点へ ---
                ['A5',0.5],['E5',0.5],['C5',0.5],['E5',0.5],['A5',0.5],['E5',0.5],['C5',0.5],['E5',0.5],
                ['G#5',0.5],['E5',0.5],['C5',0.5],['E5',0.5],['G#5',0.5],['E5',0.5],['C5',0.5],['E5',0.5],
                ['F5',0.5],['C5',0.5],['A4',0.5],['C5',0.5],['F5',0.5],['C5',0.5],['A4',0.5],['C5',0.5],
                ['E5',0.5],['C5',0.5],['A4',0.5],['G#4',0.5],['A4',0.5],['B4',0.5],['C5',0.5],[null,0.5],
                // --- ヴァース (16拍・再) ---
                ['E5',0.5],['D5',0.5],['C5',0.5],['B4',0.5],['A4',0.5],['G#4',0.5],['A4',0.5],['C5',0.5],
                ['E5',0.5],['D5',0.5],['C5',0.5],['B4',0.5],['A4',0.5],['G#4',0.5],['A4',0.5],['B4',0.5],
                ['C5',0.5],['B4',0.5],['A4',0.5],['G#4',0.5],['A4',0.5],['B4',0.5],['C5',0.5],['D5',0.5],
                ['E5',0.5],['F5',0.5],['E5',0.5],['D5',0.5],['C5',0.5],['B4',0.5],['A4',0.5],[null,0.5],
                // --- サビ (16拍・再) ---
                ['A5',0.5],['E5',0.5],['C5',0.5],['E5',0.5],['A5',0.5],['E5',0.5],['C5',0.5],['E5',0.5],
                ['G#5',0.5],['E5',0.5],['C5',0.5],['E5',0.5],['G#5',0.5],['E5',0.5],['C5',0.5],['E5',0.5],
                ['F5',0.5],['C5',0.5],['A4',0.5],['C5',0.5],['F5',0.5],['C5',0.5],['A4',0.5],['C5',0.5],
                ['E5',0.5],['C5',0.5],['A4',0.5],['G#4',0.5],['A4',0.5],['B4',0.5],['C5',0.5],[null,0.5],
            ],
            bass: [
                // --- イントロ (8拍)：主音固定のオクターブ刻み ---
                ['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['E3',0.5],['E3',0.5],['E3',0.5],['E3',0.5],
                ['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['D2',0.5],['D2',0.5],['C2',0.5],['C2',0.5],
                // --- ヴァース (16拍)：ルート-5度のガロップ ---
                ['A2',0.5],['A2',0.5],['E3',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['E3',0.5],['A2',0.5],
                ['F2',0.5],['F2',0.5],['C3',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['C3',0.5],['F2',0.5],
                ['D2',0.5],['D2',0.5],['A2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],['A2',0.5],['D2',0.5],
                ['E2',0.5],['E2',0.5],['B2',0.5],['E2',0.5],['E2',0.5],['E2',0.5],['B2',0.5],[null,0.5],
                // --- サビ (16拍)：8分刻みで畳みかける ---
                ['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],
                ['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],
                ['D2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],
                ['E2',0.5],['E2',0.5],['E2',0.5],['E2',0.5],['E2',0.5],['E2',0.5],['E2',0.5],[null,0.5],
                // --- ヴァース (16拍・再) ---
                ['A2',0.5],['A2',0.5],['E3',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['E3',0.5],['A2',0.5],
                ['F2',0.5],['F2',0.5],['C3',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['C3',0.5],['F2',0.5],
                ['D2',0.5],['D2',0.5],['A2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],['A2',0.5],['D2',0.5],
                ['E2',0.5],['E2',0.5],['B2',0.5],['E2',0.5],['E2',0.5],['E2',0.5],['B2',0.5],[null,0.5],
                // --- サビ (16拍・再) ---
                ['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],['A2',0.5],
                ['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],['F2',0.5],
                ['D2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],['D2',0.5],
                ['E2',0.5],['E2',0.5],['E2',0.5],['E2',0.5],['E2',0.5],['E2',0.5],['E2',0.5],[null,0.5],
            ],
        },
        victory: {
            tempo: 132, leadType: 'square', bassType: 'triangle',
            lead: [['C5',0.5],['C5',0.5],['C5',0.5],['G5',1.5],['E5',1.5],
                   ['F5',0.5],['F5',0.5],['F5',0.5],['C5',0.75],['D5',0.25],['E5',2]],
            bass: [['C3',1.5],['G2',1.5],['A2',1.5],['C3',1.5],['F2',1.5],['C3',1.5],['G2',1.5],['C3',1.5]],
        },
        defeat: {
            tempo: 70, leadType: 'triangle', bassType: 'sine',
            lead: [['A4',1.5],['G4',1],['F4',1.5],['E4',1],['D4',2],[null,1],
                   ['D4',1.5],['C4',1],['B3',1.5],['A3',1],['A3',2],[null,1]],
            bass: [['D3',2],['A2',2],['B2',2],['E2',2],['A2',2],['D2',2]],
        },
    };

    function totalBeats(seq) {
        return seq.reduce((s, [, d]) => s + d, 0);
    }

    function scheduleBgmLoop(trackName, token) {
        const track = BGM_TRACKS[trackName];
        const c = ensureContext();
        if (!track || !c) return;

        const beatSec = 60 / track.tempo;
        const startAt = 0.06; // 発音開始までの僅かなマージン（when は "今から何秒後" の相対値）

        // このループ呼び出しで新たにスケジュールするノードだけを追跡する
        // （前回呼び出し分のノードは通常通り鳴り終わっているはずだが、念のため配列を差し替える）
        const scheduledNodes = [];

        let t = startAt;
        track.lead.forEach(([note, d]) => {
            const freq = noteFreq(note);
            if (freq) {
                const node = tone({ freq, duration: d * beatSec * 0.92, type: track.leadType, when: t, volume: 0.55, gainNode: masterBgmGain });
                if (node) scheduledNodes.push(node);
            }
            t += d * beatSec;
        });

        t = startAt;
        (track.bass || []).forEach(([note, d]) => {
            const freq = noteFreq(note);
            if (freq) {
                const node = tone({ freq, duration: d * beatSec * 0.92, type: track.bassType, when: t, volume: 0.4, gainNode: masterBgmGain });
                if (node) scheduledNodes.push(node);
            }
            t += d * beatSec;
        });

        activeBgmNodes = scheduledNodes;

        const loopMs = totalBeats(track.lead) * beatSec * 1000;
        bgmTimerId = setTimeout(() => {
            if (token !== bgmToken) return; // 途中で停止・曲変更されていたら止める
            scheduleBgmLoop(trackName, token);
        }, Math.max(200, loopMs - 80));
    }

    // 現在鳴っている・鳴る予定のBGM用ノードを即座に無音化して停止する。
    // tone() は1ループ分（曲によっては十数秒）の音符をまとめて未来の時刻に
    // スケジュールしてしまうため、setTimeout を止めるだけでは既にスケジュール
    // 済みの音がそのまま最後まで鳴り続けてしまい、場面転換時に前のBGMと
    // 新しいBGMが二重に鳴る不具合の原因になっていた。
    // ここで各ノードを強制的にごく短いフェードアウトの後に停止させることで、
    // 曲の切り替え時に即座に前の曲を止められるようにする。
    function stopAllBgmNodes() {
        if (!activeBgmNodes.length) return;
        const nodes = activeBgmNodes;
        activeBgmNodes = [];
        const c = ctx;
        const now = c ? c.currentTime : 0;
        nodes.forEach(({ osc, gain }) => {
            try {
                if (c && gain) {
                    gain.gain.cancelScheduledValues(now);
                    gain.gain.setValueAtTime(gain.gain.value, now);
                    gain.gain.linearRampToValueAtTime(0.0001, now + 0.03);
                }
            } catch (e) { /* 無視 */ }
            try {
                osc.stop(c ? now + 0.04 : 0);
            } catch (e) { /* 既に停止済み等は無視 */ }
        });
    }

    function stopBgmScheduling() {
        bgmToken++;
        if (bgmTimerId) {
            clearTimeout(bgmTimerId);
            bgmTimerId = null;
        }
        stopAllBgmNodes();
    }

    // trackName を「現在流すべき曲」として記憶する。
    // BGM音量が0のときは実際には鳴らさないが、次に音量を上げた時に自動再開できるよう記憶だけしておく。
    function playBGM(trackName) {
        if (!BGM_TRACKS[trackName]) return;
        if (currentTrackName === trackName && bgmTimerId) return; // 既に同じ曲を再生中
        currentTrackName = trackName;
        stopBgmScheduling();
        if (settings.bgm === 0) return;
        const c = ensureContext();
        if (!c) return;
        resume();
        scheduleBgmLoop(trackName, bgmToken);
    }

    // ---------------------------------------------------
    // 画面遷移に応じた自動BGM切り替え
    // （個々の勝敗が絡む結果画面は各ゲームロジック側で明示的に
    //   playBGM('victory' / 'defeat') を呼ぶため、ここには含めない）
    // ---------------------------------------------------
    const SCREEN_BGM_MAP = {
        'screen-title': 'title',
        'screen-battle': 'battle',
        'screen-masmon-realtime-keyword': 'title',
        'screen-masmon-realtime-waiting': 'title',
        'screen-masmon-realtime-matched': 'battle',
        'screen-masmon-battle-result': 'title',
        'screen-pvp-ranking': 'title',
        'screen-pvp-rental-select': 'title',
        'screen-pvp-preset-list': 'title',
        'screen-pvp-preset-editor': 'title',
        'screen-pvp-preset-monster-editor': 'title',
        'screen-kinnejiki-title': 'title',
        'screen-kinnejiki-select': 'title',
        'screen-kinnejiki-swap': 'title',
        'screen-kinnejiki-result': 'title',
        'screen-kinnejiki-ranking': 'title',
    };

    // 「screen-battle」表示時、現在ガッツファクトリー（きんねじき）のボス戦かどうかを見て
    // 通常戦闘曲('battle')かボス曲('boss'/'finalboss')かを振り分ける。
    // MASMON_BATTLE_STATE.kinNejiki は launchKinNejikiBattleEngine 内で
    // changeScreen('screen-battle') より前にセットされているため、ここで参照可能。
    function resolveBattleTrack() {
        try {
            const state = window.MASMON_BATTLE_STATE;
            const kn = state && state.kinNejiki;
            if (kn && kn.isNejiki) {
                return kn.set >= 7 ? 'finalboss' : 'boss';
            }
        } catch (e) { /* 参照できない場合は通常戦闘曲にフォールバック */ }
        return 'battle';
    }

    function onScreenChange(screenId) {
        const track = SCREEN_BGM_MAP[screenId];
        if (!track) return;
        playBGM(track === 'battle' ? resolveBattleTrack() : track);
    }

    // ---------------------------------------------------
    // showEffect(text) のテキスト内容から対応するSEを自動再生
    // ---------------------------------------------------
    function handleBattleEffectText(text) {
        if (typeof text !== 'string') return;
        if (text.includes('CRITICAL')) playSE('critical');
        else if (text.includes('HIT') || text.includes('被弾')) playSE('hit');
        else if (text.includes('MISS') || text.includes('回避')) playSE('miss');
        else if (text.includes('WIN') || text.includes('VICTORY')) playSE('win');
        else if (text.includes('LOSE') || text.includes('DEFEAT')) playSE('lose');
        else if (text.includes('DEFENSE') || text.includes('NO ACTION')) playSE('defend');
        else if (text.includes('回復')) playSE('heal');
        else if (text.includes('UP') || text.includes('会心') || text.includes('威力')) playSE('buff');
        else if (text.includes('衰弱') || text.includes('混乱')) playSE('debuff');
        else if (text.includes('交代') || text.includes('チャージ')) playSE('status');
        else playSE('notify');
    }

    // ---------------------------------------------------
    // showToast(message) の内容から対応するSEを自動再生
    // ---------------------------------------------------
    function handleToastText(message) {
        if (typeof message !== 'string') return;
        if (/できません|エラー|失敗|見つかりません/.test(message)) playSE('error');
        else if (/手に入れた|獲得|入手|引き継ぎました|宿した/.test(message)) playSE('item');
        else playSE('notify');
    }

    // ---------------------------------------------------
    // 設定変更
    // ---------------------------------------------------
    function applyGainImmediately() {
        const c = ensureContext();
        if (!c) return;
        if (masterBgmGain) masterBgmGain.gain.setTargetAtTime(bgmVolumeToGain(settings.bgm), c.currentTime, 0.05);
        if (masterSeGain) masterSeGain.gain.setTargetAtTime(seVolumeToGain(settings.se), c.currentTime, 0.05);
    }

    // volume: 0〜100の数値
    function setBgmVolume(volume) {
        const v = clampVolume(volume);
        const wasOff = settings.bgm === 0;
        settings.bgm = v;
        saveSettings();
        resume();
        applyGainImmediately();
        if (v === 0) {
            stopBgmScheduling();
        } else if (currentTrackName && (wasOff || !bgmTimerId)) {
            stopBgmScheduling();
            scheduleBgmLoop(currentTrackName, bgmToken);
        }
    }

    // volume: 0〜100の数値
    function setSeVolume(volume) {
        const v = clampVolume(volume);
        settings.se = v;
        saveSettings();
        resume();
        applyGainImmediately();
    }

    function getSettings() {
        return { ...settings };
    }

    loadSettings();
    installUnlockListener();

    return {
        VOLUME_MIN,
        VOLUME_MAX,
        playBGM,
        playSE,
        onScreenChange,
        handleBattleEffectText,
        handleToastText,
        setBgmVolume,
        setSeVolume,
        getSettings,
        resume,
    };
})();

// =====================================================
// 既存関数のラップ：画面遷移・戦闘演出・トースト通知に自動でサウンドを紐付ける
// （各 game_*.js / masmon_*.js 側のコードは一切変更不要）
// =====================================================
(function attachAudioHooks() {
    const originalChangeScreen = window.changeScreen;
    if (typeof originalChangeScreen === 'function') {
        window.changeScreen = function (screenId) {
            const ret = originalChangeScreen(screenId);
            AudioManager.onScreenChange(screenId);
            return ret;
        };
    }

    const originalShowEffect = window.showEffect;
    if (typeof originalShowEffect === 'function') {
        window.showEffect = function (text) {
            AudioManager.handleBattleEffectText(text);
            return originalShowEffect(text);
        };
    }

    const originalShowToast = window.showToast;
    if (typeof originalShowToast === 'function') {
        window.showToast = function (message) {
            AudioManager.handleToastText(message);
            return originalShowToast(message);
        };
    }
})();

// =====================================================
// 汎用UI操作音：button / onclick要素のクリックに軽いSEを付与
// （キャプチャフェーズで拾うため個々のボタンの実装変更は不要）
// =====================================================
document.addEventListener('click', function (e) {
    const target = e.target.closest('button, [onclick], input[type="radio"], input[type="checkbox"], select');
    if (!target) return;
    if (target.closest('#audio-settings-modal')) return; // 設定モーダル内は専用の音を鳴らすため除外
    AudioManager.playSE('click');
}, true);

// =====================================================
// 音声設定モーダルのUI制御
// =====================================================
function openAudioSettingsModal() {
    updateAudioSettingsUI();
    document.getElementById('audio-settings-modal').classList.remove('hidden');
}

function closeAudioSettingsModal() {
    document.getElementById('audio-settings-modal').classList.add('hidden');
}

// kind: 'bgm' | 'se'  /  value: 0〜100の数値（スライダーのinput/change両方から呼ばれる）
function setAudioVolume(kind, value) {
    const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    if (kind === 'bgm') {
        AudioManager.setBgmVolume(v);
    } else if (kind === 'se') {
        AudioManager.setSeVolume(v);
    }
    updateAudioSettingsUI();
}

// スライダーを指で離した（change）タイミングでのみ確認用のSEを鳴らす
// （input中に毎回鳴らすと連打音になってしまうため）
function confirmAudioVolume(kind, value) {
    setAudioVolume(kind, value);
    if (kind === 'se' && AudioManager.getSettings().se > 0) {
        AudioManager.playSE('toggle');
    }
}

function updateAudioSettingsUI() {
    const s = AudioManager.getSettings();

    const bgmSlider = document.getElementById('audio-slider-bgm');
    const bgmLabel = document.getElementById('audio-value-bgm');
    if (bgmSlider && document.activeElement !== bgmSlider) bgmSlider.value = s.bgm;
    if (bgmLabel) bgmLabel.textContent = s.bgm;

    const seSlider = document.getElementById('audio-slider-se');
    const seLabel = document.getElementById('audio-value-se');
    if (seSlider && document.activeElement !== seSlider) seSlider.value = s.se;
    if (seLabel) seLabel.textContent = s.se;

    const iconEl = document.getElementById('audio-settings-icon');
    if (iconEl) {
        const muted = s.bgm === 0 && s.se === 0;
        iconEl.className = muted
            ? 'fa-solid fa-volume-xmark'
            : 'fa-solid fa-volume-high';
    }
}

document.addEventListener('DOMContentLoaded', updateAudioSettingsUI);

// =====================================================
// 起動直後のBGM開始漏れ対策：
// 起動時点の画面は index.html 側で class="screen active" として
// 静的に表示されており changeScreen() を経由しないため、
// 何かしら画面遷移するまで onScreenChange が一度も呼ばれず
// BGMが鳴り始めないという不具合があった。
// 起動時に表示されている画面を検出し、明示的に
// onScreenChange 相当の処理を行うことで解消する。
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    const activeScreen = document.querySelector('.screen.active');
    AudioManager.onScreenChange(activeScreen ? activeScreen.id : 'screen-title');
});
