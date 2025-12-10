// src/pages/Saved.jsx
import React, { useEffect, useState } from "react";
import { listSaved, deleteSavedById, addSavedAiSnapshot } from "../data/saved";
import { normalizeInstructions } from "../lib/hydrateSaved";
import { generateAiImage } from "../api/aiImage";
import { addShoppingItemsBulk } from "../data/shoppingList";

const API_BASE =
  process.env.REACT_APP_API_BASE?.replace(/\/$/, "") ||
  "http://localhost:4000/api";

async function fetchLocalRecipe(recipeId) {
  const res = await fetch(`${API_BASE}/recipes/${recipeId}`);
  if (!res.ok) {
    throw new Error(`Failed to load recipe #${recipeId}`);
  }
  return res.json();
}

async function hydrateLocalSaved(rows = []) {
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

    const recipe = entry.recipe;
    return {
      ...fav,
      name: recipe.name || fav.name,
      description: recipe.description || fav.description,
      ingredients:
        (Array.isArray(recipe.ingredients) && recipe.ingredients.length
          ? recipe.ingredients
          : fav.ingredients) || [],
      instructions: (() => {
        const fromRecipe = normalizeInstructions(recipe.steps);
        const fromFav = normalizeInstructions(fav.instructions);
        return fromRecipe.length ? fromRecipe : fromFav;
      })(),
      minutes: recipe.minutes ?? fav.minutes,
      rating: recipe.rating ?? fav.rating,
      cuisine: recipe.cuisine ?? fav.cuisine,
      diet: recipe.diet ?? fav.diet,
      localRecipe: recipe,
    };
  });
}

const REMIX_SUGGESTIONS = [
  "Make it vegetarian and protein-packed",
  "Give it bold, spicy flavors",
  "Turn it into a 20-minute weeknight meal",
  "Keep it low-carb but comforting",
];

const INITIAL_REMIX_STATE = {
  activeId: null,
  notes: "",
  loading: false,
  error: null,
};

function formatIngredientEntry(entry) {
  if (!entry) return null;
  if (typeof entry === "string") {
    const trimmed = entry.trim();
    return trimmed || null;
  }

  if (typeof entry === "object") {
    const name =
      entry.ingredient ||
      entry.name ||
      entry.item ||
      entry.food ||
      entry.title ||
      "";
    if (!name) return null;
    const qty = [entry.quantity ?? entry.amount, entry.unit || entry.measure]
      .filter(Boolean)
      .join(" ")
      .trim();
    const prep = entry.prep || entry.preparation || entry.notes || "";
    const base = [qty, name].filter(Boolean).join(" ").trim() || name;
    return prep ? `${base} (${prep})` : base;
  }

  return null;
}

function listAllIngredientLines(recipe) {
  const list = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
  return list.map(formatIngredientEntry).filter(Boolean);
}

function collectIngredientLines(recipe) {
  return listAllIngredientLines(recipe).slice(0, 20);
}

function collectStepLines(recipe) {
  const normalized =
    normalizeInstructions(recipe?.instructions) ||
    normalizeInstructions(recipe?.steps);
  return normalized.slice(0, 12);
}

function buildRemixPrompt(recipe, userNotes = "") {
  const title = recipe?.name || "this recipe";
  const description = recipe?.description || "";
  const metaParts = [
    recipe?.cuisine ? `Cuisine: ${recipe.cuisine}` : "",
    recipe?.diet ? `Diet: ${recipe.diet}` : "",
    recipe?.minutes ? `Ready in ~${recipe.minutes} minutes` : "",
    typeof recipe?.rating === "number" ? `Rating: ${recipe.rating}` : "",
  ].filter(Boolean);
  const ingredients = collectIngredientLines(recipe);
  const steps = collectStepLines(recipe);
  const request = userNotes.trim()
    ? userNotes.trim()
    : "Give it a fresh twist while keeping it practical for home cooks.";

  return [
    "You are an inventive but practical chef.",
    `Create exactly ONE new recipe inspired by "${title}".`,
    metaParts.length ? `Context: ${metaParts.join(" · ")}` : "",
    "",
    "Existing description:",
    description || "No description provided.",
    "",
    "Ingredients:",
    ingredients.length
      ? ingredients.map((line) => `- ${line}`).join("\n")
      : "- (not provided)",
    "",
    "Steps:",
    steps.length
      ? steps.map((text, idx) => `${idx + 1}. ${text}`).join("\n")
      : "1. (no steps provided)",
    "",
    "User request / constraints:",
    request,
    "",
    "Return JSON array with a single object in this shape:",
    '[{ "name": string, "description": string, "ingredients": array, "steps": array }]',
    "Keep instructions concise, numbered implicitly by their array order.",
  ]
    .filter(Boolean)
    .join("\n");
}

function stripCodeFence(text = "") {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
  }
  return trimmed;
}

function parseAiRecipes(rawText = "") {
  if (!rawText) return [];
  const cleaned = stripCodeFence(rawText);
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return [parsed];
    return [];
  } catch (err) {
    console.error("Failed to parse AI remix payload:", err);
    return [];
  }
}

function sanitizeAiRecipePayload(recipe, baseName) {
  if (!recipe || typeof recipe !== "object") return null;
  const name =
    (recipe.name || "").trim() ||
    (baseName ? `${baseName} Remix` : "AI Remix");
  const description = (recipe.description || "").trim();
  const ingredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.filter(Boolean)
    : [];
  const steps = normalizeInstructions(recipe.steps || recipe.instructions);

  if (!ingredients.length || !steps.length) {
    return null;
  }

  return {
    ...recipe,
    name,
    description,
    ingredients,
    steps,
  };
}

function formatSavedRow(row) {
  if (!row) return row;
  const instructions = normalizeInstructions(row.instructions || row.steps);
  return {
    ...row,
    ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
    instructions,
    steps: instructions,
  };
}

async function fetchAiRemix(prompt) {
  const res = await fetch(`${API_BASE}/ai-recipes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to generate AI recipe");
  }

  const data = await res.json();
  return data.text || "";
}

const S = {
  page: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "28px 16px",
    fontFamily:
      "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    color: "#0f172a",
  },
  h1: { fontSize: 28, fontWeight: 800, marginBottom: 16 },
  small: { fontSize: 13, color: "#64748b", marginBottom: 16 },
  row: { display: "flex", justifyContent: "space-between", marginBottom: 12 },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 280px))",
    gap: 16,
    justifyContent: "center",
  },
  card: {
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: 16,
    background: "#ffffff",
    cursor: "pointer",
    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box",
    overflow: "hidden",
  },
  img: {
    width: "100%",
    maxHeight: 220,
    objectFit: "cover",
    borderRadius: 12,
    marginBottom: 8,
  },
  imgPlaceholder: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    marginBottom: 8,
    background: "linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)",
    backgroundSize: "2000px 100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    position: "relative",
    overflow: "hidden",
  },
  imgPlaceholderSpinner: {
    width: 40,
    height: 40,
    border: "3px solid #e2e8f0",
    borderTop: "3px solid #4f46e5",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  imgPlaceholderText: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: 500,
  },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  badgeRow: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  badge: {
    fontSize: 11,
    padding: "3px 8px",
    borderRadius: 999,
    background: "#f1f5f9",
    color: "#475569",
    fontWeight: 600,
  },
  aiBadge: {
    fontSize: 11,
    padding: "3px 8px",
    borderRadius: 999,
    background: "#eef2ff",
    color: "#4f46e5",
    fontWeight: 700,
  },
  body: { fontSize: 13, color: "#475569", lineHeight: 1.4 },
  list: { margin: "6px 0 0 18px", padding: 0 },
  metaRow: { display: "flex", gap: 8, flexWrap: "wrap", margin: "6px 0" },
  actions: {
    marginTop: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    paddingTop: 12,
    borderTop: "1px solid #e2e8f0",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  collapseHint: { fontSize: 12, color: "#64748b" },
  expandedContent: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1px solid #e2e8f0",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    fontSize: 13,
    color: "#475569",
    lineHeight: 1.4,
  },
  sectionLabel: { fontWeight: 600, fontSize: 13 },
  unsaveButton: {
    border: "1px solid #fecaca",
    borderRadius: 999,
    padding: "8px 16px",
    fontSize: 13,
    background: "#fff",
    color: "#b91c1c",
    cursor: "pointer",
  },
  error: {
    border: "1px solid #fecaca",
    background: "#fef2f2",
    color: "#b91c1c",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  notice: {
    border: "1px solid #bbf7d0",
    background: "#ecfdf5",
    color: "#15803d",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    fontSize: 13,
  },
  remixButton: {
    border: "none",
    borderRadius: 999,
    padding: "10px 18px",
    fontSize: 13,
    fontWeight: 600,
    background: "linear-gradient(135deg, #1d4ed8, #4338ca)",
    color: "#fff",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    boxShadow: "0 8px 18px rgba(67,56,202,0.18)",
  },
  shoppingButton: {
    border: "1px solid #c7d2fe",
    borderRadius: 999,
    padding: "9px 16px",
    fontSize: 13,
    fontWeight: 600,
    background: "#eef2ff",
    color: "#312e81",
    cursor: "pointer",
  },
  remixPanel: {
    marginTop: 16,
    padding: 20,
    borderRadius: 18,
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  remixPanelHeader: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  remixLabel: { fontSize: 14, fontWeight: 600, color: "#1f2937" },
  remixHint: { fontSize: 13, color: "#475569" },
  remixTextarea: {
    width: "100%",
    minHeight: 88,
    borderRadius: 12,
    border: "1px solid #cbd5f5",
    padding: 12,
    fontSize: 13,
    resize: "vertical",
    fontFamily: "inherit",
    color: "#0f172a",
    background: "#fff",
  },
  remixChips: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  remixChip: {
    border: "1px solid #cbd5f5",
    borderRadius: 999,
    padding: "6px 14px",
    background: "#e0e7ff",
    color: "#1e1b4b",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  remixPanelActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  remixPrimary: {
    border: "none",
    borderRadius: 999,
    padding: "10px 18px",
    fontSize: 13,
    fontWeight: 600,
    background: "#1d4ed8",
    color: "#fff",
    cursor: "pointer",
  },
  remixSecondary: {
    border: "1px solid #cbd5f5",
    borderRadius: 999,
    padding: "10px 18px",
    fontSize: 13,
    fontWeight: 600,
    background: "#fff",
    color: "#1e1b4b",
    cursor: "pointer",
  },
  remixError: {
    border: "1px solid #fecaca",
    background: "#fef2f2",
    color: "#b91c1c",
    borderRadius: 12,
    padding: 10,
    fontSize: 13,
  },
  remixSuccess: {
    border: "1px solid #bbf7d0",
    background: "#ecfdf5",
    color: "#15803d",
    borderRadius: 12,
    padding: 10,
    fontSize: 13,
  },
};

export default function Saved() {
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [expandedIds, setExpandedIds] = useState([]);
  const [remixState, setRemixState] = useState(INITIAL_REMIX_STATE);
  const [remixNotice, setRemixNotice] = useState(null);
  const [shoppingSyncState, setShoppingSyncState] = useState({
    activeId: null,
    loading: false,
    error: null,
  });
  const [imageGeneratingIds, setImageGeneratingIds] = useState(new Set());

  async function loadSaved(showLoading = true) {
    try {
      if (showLoading) {
        setLoading(true);
        setErr(null);
      }
      const data = await listSaved();
      const enriched = await hydrateLocalSaved(data || []);
      setSaved(enriched);
      
      // Track recipes without images as generating
      const idsWithoutImages = enriched
        .filter((row) => !row.image_url && row.id)
        .map((row) => row.id);
      if (idsWithoutImages.length > 0) {
        setImageGeneratingIds((prev) => {
          const next = new Set(prev);
          idsWithoutImages.forEach(id => next.add(id));
          return next;
        });
      }
      
      // Remove recipes that now have images from generating set
      setImageGeneratingIds((prev) => {
        const next = new Set(prev);
        enriched
          .filter((row) => row.image_url && row.id)
          .forEach((row) => next.delete(row.id));
        return next;
      });
    } catch (e) {
      console.error("Error loading saved recipes:", e);
      if (showLoading) {
        setErr(e.message || "Failed to load saved recipes");
      }
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadSaved();
  }, []);

  // Poll for image updates if there are recipes generating images
  useEffect(() => {
    if (imageGeneratingIds.size === 0) return;
    
    const pollInterval = setInterval(() => {
      loadSaved(false); // Background update, don't show loading spinner
    }, 3000); // Check every 3 seconds
    
    return () => clearInterval(pollInterval);
  }, [imageGeneratingIds.size]);

  useEffect(() => {
    setExpandedIds((prev) =>
      prev.filter((id) => saved.some((row) => row.id === id))
    );
  }, [saved]);

  useEffect(() => {
    if (!remixState.activeId) return;
    const stillExists = saved.some((row) => row.id === remixState.activeId);
    if (!stillExists) {
      setRemixState({ ...INITIAL_REMIX_STATE });
    }
  }, [saved, remixState.activeId]);

  useEffect(() => {
    if (!shoppingSyncState.activeId) return;
    const exists = saved.some((row) => row.id === shoppingSyncState.activeId);
    if (!exists) {
      setShoppingSyncState({ activeId: null, loading: false, error: null });
    }
  }, [saved, shoppingSyncState.activeId]);

  useEffect(() => {
    if (!remixNotice) return undefined;
    const timer = setTimeout(() => setRemixNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [remixNotice]);

  const toggleExpanded = (id) => {
    if (!id) return;
    setExpandedIds((prev) =>
      prev.includes(id)
        ? prev.filter((entry) => entry !== id)
        : [...prev, id]
    );
  };

  async function handleUnsave(id) {
    if (!id) return;
    setErr(null);
    setRemovingId(id);
    try {
      await deleteSavedById(id);
      setSaved((prev) => prev.filter((item) => item.id !== id));
      setExpandedIds((prev) => prev.filter((entry) => entry !== id));
    } catch (e) {
      console.error("Failed to unsave recipe:", e);
      setErr(e.message || "Failed to unsave recipe");
    } finally {
      setRemovingId(null);
    }
  }

  function toggleRemix(id) {
    if (!id) return;
    setRemixState((prev) => {
      if (prev.loading && prev.activeId === id) {
        return prev;
      }
      if (prev.activeId === id) {
        return { ...INITIAL_REMIX_STATE };
      }
      return { ...INITIAL_REMIX_STATE, activeId: id };
    });
  }

  const handleRemixNotesChange = (event) => {
    const value = event.target.value;
    setRemixState((prev) =>
      prev.activeId
        ? {
            ...prev,
            notes: value,
          }
        : prev
    );
  };

  function handleSuggestionClick(text) {
    if (!text) return;
    setRemixState((prev) => {
      if (!prev.activeId) return prev;
      const current = prev.notes.trim();
      const updated = current
        ? `${current} ${text}`.trim()
        : text;
      return { ...prev, notes: updated };
    });
  }

  async function handleSendIngredientsToShopping(fav) {
    if (!fav || !fav.id) return;
    const lines = listAllIngredientLines(fav);
    if (!lines.length) {
      setShoppingSyncState({
        activeId: fav.id,
        loading: false,
        error: "This recipe has no ingredients to add.",
      });
      return;
    }
    const deduped = [
      ...new Map(lines.map((line) => [line.toLowerCase(), line])).values(),
    ];
    setShoppingSyncState({ activeId: fav.id, loading: true, error: null });
    try {
      await addShoppingItemsBulk(deduped);
      setShoppingSyncState({ activeId: null, loading: false, error: null });
      setRemixNotice(
        `Added ${deduped.length} ingredient${
          deduped.length === 1 ? "" : "s"
        } from “${fav.name || "this recipe"}” to your shopping list.`
      );
    } catch (error) {
      console.error("Failed to add shopping items:", error);
      setShoppingSyncState({
        activeId: fav.id,
        loading: false,
        error:
          error?.message || "Failed to add ingredients to shopping list",
      });
    }
  }

  async function handleGenerateRemix(fav) {
    if (!fav || !fav.id) return;
    if (remixState.loading) return;
    const userNotes = remixState.notes;
    setRemixState((prev) => ({
      ...prev,
      loading: true,
      error: null,
    }));

    try {
      const prompt = buildRemixPrompt(fav, userNotes);
      const text = await fetchAiRemix(prompt);
      const [candidate] = parseAiRecipes(text);
      const sanitized = sanitizeAiRecipePayload(candidate, fav.name);
      if (!sanitized) {
        throw new Error(
          "AI response was incomplete. Try adding more detail to your request."
        );
      }
      
      // Create a temporary recipe entry with a placeholder ID to show loading state
      const tempId = `temp-${Date.now()}`;
      const tempRow = formatSavedRow({
        id: tempId,
        ...sanitized,
        image_url: null,
      });
      
      // Add to saved list immediately with loading state
      setSaved((prev) => [tempRow, ...prev]);
      setExpandedIds((prev) => [tempId, ...prev.filter((entry) => entry !== tempId)]);
      setImageGeneratingIds((prev) => new Set([...prev, tempId]));
      
      // Generate image
      const imageUrl =
        (await generateAiImage({
          name: sanitized.name,
          ingredients: sanitized.ingredients,
        })) || null;

      const savedRow = await addSavedAiSnapshot({
        ...sanitized,
        steps: sanitized.steps,
        image_url: imageUrl,
      });
      const normalizedRow = formatSavedRow(savedRow);

      // Replace temp entry with real one
      setSaved((prev) => {
        const filtered = prev.filter((row) => row.id !== tempId);
        return [normalizedRow, ...filtered];
      });
      setExpandedIds((prev) => [
        normalizedRow.id,
        ...prev.filter((entry) => entry !== tempId && entry !== normalizedRow.id),
      ]);
      setImageGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(tempId);
        return next;
      });
      setRemixState({ ...INITIAL_REMIX_STATE });
      setRemixNotice(
        `Added "${normalizedRow.name || "AI remix"}” to your saved recipes.`
      );
    } catch (error) {
      console.error("Failed to remix recipe:", error);
      // Remove temp entry on error
      setSaved((prev) => prev.filter((row) => !row.id?.startsWith("temp-")));
      setImageGeneratingIds((prev) => {
        const next = new Set(prev);
        Array.from(prev).forEach(id => {
          if (id?.startsWith("temp-")) next.delete(id);
        });
        return next;
      });
      setRemixState((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || "Failed to remix this recipe",
      }));
    }
  }

  return (
    <>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes shimmer {
          0% { background-position: -1000px 0; }
          100% { background-position: 1000px 0; }
        }
      `}</style>
      <main style={S.page}>
        <div style={S.row}>
          <div>
            <h1 style={S.h1}>Saved recipes</h1>
            <div style={S.small}>
              Showing all saved recipes with their generated images.
            </div>
          </div>
        </div>

      {remixNotice && <div style={S.notice}>{remixNotice}</div>}

      {err && <div style={S.error}>{err}</div>}

      {loading && <div style={S.small}>Loading saved recipes…</div>}

      {!loading && saved.length === 0 && !err && (
        <div style={S.small}>No saved recipes yet. Go save something!</div>
      )}

      {!loading && saved.length > 0 && (
        <div style={S.grid}>
          {saved.map((fav) => {
            const isAi = fav.is_ai_recipe;
            const title =
              fav.name ||
              (isAi
                ? "AI recipe"
                : fav.recipe_id != null
                ? `Local recipe #${fav.recipe_id}`
                : "Recipe");
            const isExpanded = expandedIds.includes(fav.id);
            const isRemixActive = remixState.activeId === fav.id;
            const isRemixLoading = remixState.loading && isRemixActive;
            const shoppingBusy =
              shoppingSyncState.loading && shoppingSyncState.activeId === fav.id;
            const shoppingErrorVisible =
              shoppingSyncState.activeId === fav.id
                ? shoppingSyncState.error
                : null;

            return (
              <article
                key={fav.id}
                style={{
                  ...S.card,
                  borderColor:
                    isExpanded ? "#c7d2fe" : "#e2e8f0",
                  boxShadow: isExpanded
                    ? "0 10px 30px rgba(79,70,229,0.12)"
                    : "none",
                }}
                onClick={() => toggleExpanded(fav.id)}
              >
                {(() => {
                  const isGenerating = imageGeneratingIds.has(fav.id);
                  const hasImage = !!fav.image_url;
                  
                  if (isGenerating || !hasImage) {
                    return (
                      <div style={S.imgPlaceholder}>
                        <div style={S.imgPlaceholderSpinner} />
                        <div style={S.imgPlaceholderText}>
                          {isGenerating ? "Generating image..." : "Image loading..."}
                        </div>
                      </div>
                    );
                  }
                  
                  return (
                    <img
                      src={fav.image_url}
                      alt={title}
                      style={S.img}
                      loading="lazy"
                    />
                  );
                })()}

                <div style={S.cardHeader}>
                  <div style={S.title}>{title}</div>
                  <span style={S.collapseHint}>
                    {isExpanded ? "Hide details" : "Show details"}
                  </span>
                </div>

                <div style={S.badgeRow}>
                  {isAi && <span style={S.aiBadge}>AI recipe</span>}
                  {fav.created_at && (
                    <span style={S.badge}>
                      saved: {new Date(fav.created_at).toLocaleString()}
                    </span>
                  )}
                </div>

                {isExpanded && (
                  <div style={S.expandedContent}>
                    {(fav.minutes ||
                      fav.rating != null ||
                      fav.cuisine ||
                      fav.diet) && (
                      <div style={S.metaRow}>
                        {fav.minutes && (
                          <span style={S.badge}>⏱ {fav.minutes} min</span>
                        )}
                        {fav.rating != null && (
                          <span style={S.badge}>★ {fav.rating}</span>
                        )}
                        {fav.cuisine && (
                          <span style={S.badge}>{fav.cuisine}</span>
                        )}
                        {fav.diet && <span style={S.badge}>{fav.diet}</span>}
                      </div>
                    )}

                    {fav.description && (
                      <p style={{ ...S.body, margin: 0 }}>{fav.description}</p>
                    )}

                    {Array.isArray(fav.ingredients) &&
                      fav.ingredients.length > 0 && (
                        <div>
                          <div style={S.sectionLabel}>Ingredients</div>
                          <ul style={S.list}>
                            {fav.ingredients.map((ing, idx) => (
                              <li key={idx}>
                                {typeof ing === "string"
                                  ? ing
                                  : formatIngredientEntry(ing) || ing.ingredient || ing.name || ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                    {Array.isArray(fav.instructions) &&
                      fav.instructions.length > 0 && (
                        <div>
                          <div style={S.sectionLabel}>Steps</div>
                          <ol style={S.list}>
                            {fav.instructions.map((step, idx) => (
                              <li key={idx}>{step}</li>
                            ))}
                          </ol>
                        </div>
                      )}

                    {!fav.is_ai_recipe &&
                      fav.recipe_id != null &&
                      fav.localError && (
                        <div style={{ fontSize: 13, color: "#b91c1c" }}>
                          Unable to load recipe details: {fav.localError}
                        </div>
                      )}

                    <div
                      style={S.actions}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        style={{
                          ...S.shoppingButton,
                          opacity: shoppingBusy ? 0.7 : 1,
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSendIngredientsToShopping(fav);
                        }}
                        disabled={shoppingBusy}
                      >
                        {shoppingBusy
                          ? "Adding ingredients…"
                          : "Add ingredients to shopping list"}
                      </button>
                      <button
                        type="button"
                        style={{
                          ...S.remixButton,
                          opacity: remixState.loading && !isRemixActive ? 0.6 : 1,
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleRemix(fav.id);
                        }}
                        disabled={remixState.loading && !isRemixActive}
                      >
                        {isRemixLoading
                          ? "Generating remix…"
                          : isRemixActive
                          ? "Close remix"
                          : "New AI remix"}
                      </button>
                      <button
                        type="button"
                        style={S.unsaveButton}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleUnsave(fav.id);
                        }}
                        disabled={removingId === fav.id}
                      >
                        {removingId === fav.id ? "Removing…" : "Unsave"}
                      </button>
                    </div>
                    {shoppingErrorVisible && (
                      <div style={S.remixError}>{shoppingErrorVisible}</div>
                    )}

                    {isRemixActive && (
                      <div
                        style={S.remixPanel}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div style={S.remixPanelHeader}>
                          <div style={S.remixLabel}>
                            Describe how you'd like to remix this recipe
                          </div>
                          <div style={S.remixHint}>
                            Share goals, dietary needs, timing, or must-use ingredients.
                          </div>
                        </div>
                        <textarea
                          style={S.remixTextarea}
                          placeholder='e.g. "Make it vegetarian with seasonal veggies and ready in 20 minutes."'
                          value={remixState.notes}
                          onChange={handleRemixNotesChange}
                          onClick={(event) => event.stopPropagation()}
                          disabled={remixState.loading}
                        />
                        <div style={S.remixChips}>
                          {REMIX_SUGGESTIONS.map((chip) => (
                            <button
                              key={chip}
                              type="button"
                              style={S.remixChip}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleSuggestionClick(chip);
                              }}
                              disabled={remixState.loading}
                            >
                              {chip}
                            </button>
                          ))}
                        </div>
                        {remixState.error && (
                          <div style={S.remixError}>{remixState.error}</div>
                        )}
                        <div style={S.remixPanelActions}>
                          <button
                            type="button"
                            style={{
                              ...S.remixPrimary,
                              opacity: remixState.loading ? 0.6 : 1,
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleGenerateRemix(fav);
                            }}
                            disabled={remixState.loading}
                          >
                            {remixState.loading
                              ? "Generating recipe…"
                              : "Generate recipe"}
                          </button>
                          <button
                            type="button"
                            style={S.remixSecondary}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleRemix(fav.id);
                            }}
                            disabled={remixState.loading}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      </main>
    </>
  );
}
