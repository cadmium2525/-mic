// ============================================================
// DataLoader
// data/ 以下のJSONを一括fetchする。
// 新しいワールドを増やす際は STAGE_LIST に行を追加するだけでよい。
// ============================================================
export const STAGE_LIST = [
  { id: '1-1', path: './data/stages/1-1.json' },
  { id: '1-2', path: './data/stages/1-2.json' },
  { id: '1-3', path: './data/stages/1-3.json' },
  { id: '1-4', path: './data/stages/1-4.json' },
];

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`データ読み込み失敗: ${path}`);
  return res.json();
}

export async function loadAllData() {
  const [items, recipes, enemies, merchants, dialogues] = await Promise.all([
    fetchJson('./data/items.json'),
    fetchJson('./data/recipes.json'),
    fetchJson('./data/enemies.json'),
    fetchJson('./data/merchants.json'),
    fetchJson('./data/dialogues.json'),
  ]);

  const stages = {};
  for (const s of STAGE_LIST) {
    stages[s.id] = await fetchJson(s.path);
  }

  return { items, recipes, enemies, merchants, dialogues, stages };
}
