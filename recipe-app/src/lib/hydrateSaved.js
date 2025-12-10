const API_BASE =
  process.env.REACT_APP_API_BASE?.replace(/\/$/, "") ||
  "http://localhost:4000/api";

function cleanInstructionList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((step) =>
      typeof step === "string"
        // eslint-disable-next-line no-useless-escape
        ? step.replace(/^\s*(?:\d+[\.\)]|-)\s*/, "").trim()
        : ""
    )
    .filter(Boolean);
}

function parseBracketedList(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!(trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    return null;
  }

  const attempts = [trimmed];

  const pythonFriendly = trimmed.replace(
    /'((?:\\'|[^'])*)'/g,
    (_, inner) => `"${inner.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
  );
  if (pythonFriendly !== trimmed) {
    attempts.push(pythonFriendly);
  }

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      
    }
  }

  const quoteMatches = [...pythonFriendly.matchAll(/"((?:\\.|[^"])*)"/g)].map(
    (match) =>
      match[1]
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .trim()
  );
  if (quoteMatches.length) {
    return quoteMatches.filter(Boolean);
  }

  return trimmed
    .slice(1, -1)
    .split(/\s*,\s*/)
    .map((entry) =>
      entry
        .replace(/^['"]|['"]$/g, "")
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .trim()
    )
    .filter(Boolean);
}

export function normalizeInstructions(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return cleanInstructionList(value);
  }
  if (typeof value === "string") {
    const parsedList = parseBracketedList(value);
    if (Array.isArray(parsedList) && parsedList.length > 0) {
      return cleanInstructionList(parsedList);
    }
    return cleanInstructionList(value.split(/\r?\n+/));
  }
  return [];
}

async function fetchLocalRecipe(recipeId) {
  const res = await fetch(`${API_BASE}/recipes/${recipeId}`);
  if (!res.ok) {
    throw new Error(`Failed to load recipe #${recipeId}`);
  }
  return res.json();
}

export async function hydrateSavedRecipes(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return Array.isArray(rows) ? rows : [];
  }

  const ids = [
    ...new Set(
      rows
        .filter((fav) => !fav.is_ai_recipe && fav.recipe_id != null)
        .map((fav) => fav.recipe_id)
    ),
  ];

  if (!ids.length) return rows;

  const recipeMap = new Map();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const recipe = await fetchLocalRecipe(id);
        recipeMap.set(id, { recipe });
      } catch (err) {
        recipeMap.set(id, { error: err.message || "Failed to load recipe" });
      }
    })
  );

  return rows.map((fav) => {
    if (fav.is_ai_recipe || fav.recipe_id == null) return fav;
    const entry = recipeMap.get(fav.recipe_id);
    if (!entry) return fav;
    if (entry.error) {
      return { ...fav, localError: entry.error };
    }

    const recipe = entry.recipe || {};
    const normalizedInstructions = (() => {
      const fromRecipe = normalizeInstructions(recipe.steps);
      const fromFav = normalizeInstructions(fav.instructions);
      return fromRecipe.length ? fromRecipe : fromFav;
    })();

    return {
      ...fav,
      name: recipe.name || fav.name,
      description: recipe.description || fav.description,
      ingredients:
        (Array.isArray(recipe.ingredients) && recipe.ingredients.length
          ? recipe.ingredients
          : fav.ingredients) || [],
      instructions: normalizedInstructions,
      steps: normalizedInstructions,
      minutes: recipe.minutes ?? fav.minutes,
      rating: recipe.rating ?? fav.rating,
      cuisine: recipe.cuisine ?? fav.cuisine,
      diet: recipe.diet ?? fav.diet,
      localRecipe: recipe,
    };
  });
}

export async function hydrateSavedRecipe(row) {
  if (!row) return row;
  const [hydrated] = await hydrateSavedRecipes([row]);
  return hydrated || row;
}

