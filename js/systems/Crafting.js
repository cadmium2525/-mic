// ============================================================
// CraftingSystem
// data/recipes.json のレシピ定義に基づき、素材消費と成果物付与を行う。
//
// レシピ定義の例：
// {
//   "id": "torch",
//   "name": "松明",
//   "inputs": [{"item":"wood","amount":1},{"item":"coal","amount":1}],
//   "output": {"item":"torch","amount":1,"isTool":false}
// }
// ============================================================
export class CraftingSystem {
  constructor(recipes) {
    this.recipes = recipes; // 配列
  }

  canCraft(recipeId, inventory) {
    const recipe = this.recipes.find(r => r.id === recipeId);
    if (!recipe) return false;
    return recipe.inputs.every(inp => inventory.has(inp.item, inp.amount));
  }

  craft(recipeId, inventory) {
    const recipe = this.recipes.find(r => r.id === recipeId);
    if (!recipe) return { ok: false, reason: 'not_found' };
    if (!this.canCraft(recipeId, inventory)) return { ok: false, reason: 'insufficient' };

    for (const inp of recipe.inputs) inventory.consume(inp.item, inp.amount);

    if (recipe.output.isTool) {
      inventory.giveTool(recipe.output.item);
    } else {
      inventory.add(recipe.output.item, recipe.output.amount || 1);
    }
    return { ok: true, recipe };
  }
}
