const API = 'http://localhost:4000/api';


const normalizeSteps = (steps = []) =>
  // eslint-disable-next-line no-useless-escape
  steps.map(s => String(s).replace(/^\s*(?:\d+[\.\)]|-)\s*/, '').trim());

const normalizeIngredients = (ings = []) =>
  ings.map(x => (typeof x === 'string'
    ? { ingredient: x, quantity: 0, unit: '', prep: null, notes: null }
    : x));

export async function generateSearchRecipes({
  q = '',
  diet = '',
  cuisine = '',
  ingredients = [],
  pantry = [],          
  systemPrompt
} = {}) {
  const res = await fetch(`${API}/ai-search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, diet, cuisine, ingredients, pantry, systemPrompt }),
  });
  if (!res.ok) throw new Error(await res.text());
  const { text } = await res.json();

  const raw = (text || '').trim();
  const jsonStr = raw.startsWith('```')
    ? raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    : raw;

  try {
    const data = JSON.parse(jsonStr);
    if (!Array.isArray(data)) return [];
    // normalize each recipe
    return data.map(r => ({
      ...r,
      steps: normalizeSteps(r.steps || []),
      ingredients: normalizeIngredients(r.ingredients || []),
    }));
  } catch (e) {
    console.error('AI JSON parse error:', e, { raw });
    return [];
  }
}

