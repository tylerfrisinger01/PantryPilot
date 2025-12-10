import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "../css/home.css";
import { addSavedAiSnapshot, listSaved } from "../data/saved";
import { generateAiImage } from "../api/aiImage";
import { Link } from "react-router-dom";
import { hydrateSavedRecipes, normalizeInstructions } from "../lib/hydrateSaved";
import {
  getShoppingList,
  addShoppingItem as createShoppingItem,
  addShoppingItemsBulk,
  toggleShoppingChecked,
  removeShoppingItem as deleteShoppingItem,
  clearShopping,
} from "../data/shoppingList";
import { addPantryItem } from "../data/pantry";

const items = ["chicken breast", "ground beef", "onion", "garlic", "olive oil", "salt", "black pepper", "butter", "potatoes", "rice", "pasta", "tomatoes", "carrots", "bell peppers", "cheese", "eggs", "flour", "broth", "soy sauce", "herbs"];
const AI_IMAGE_FALLBACK = "/meal_image.jpg";
const AI_IMAGE_MAX_ATTEMPTS = 3;

function extractIngredientName(entry) {
  if (!entry) return "";
  if (typeof entry === "string") return entry;
  return entry.ingredient || "";
}

function pickDinnerCandidate(recipes = []) {
  if (!Array.isArray(recipes) || recipes.length === 0) return null;
  const withDescription = recipes.filter(
    (recipe) =>
      typeof recipe?.description === "string" && recipe.description.trim()
  );
  const pool = withDescription.length ? withDescription : recipes;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

function truncateText(text, max = 120) {
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

function createEmptyAiSession() {
  return {
    prompt: null,
    recipes: [],
    images: [],
    generatedAt: null,
  };
}

function getRecipeSteps(recipe) {
  if (!recipe) return [];
  if (Array.isArray(recipe.steps) && recipe.steps.length) {
    return recipe.steps;
  }
  const instructions = recipe.instructions;
  if (typeof instructions === "string") {
    return normalizeInstructions(instructions);
  }
  if (
    Array.isArray(instructions) &&
    instructions.every((entry) => typeof entry === "string")
  ) {
    return normalizeInstructions(instructions);
  }
  return [];
}

function formatStepEntries(rawSteps = []) {
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) return [];
  return rawSteps
    .map((entry, idx) => {
      if (!entry) return null;
      if (typeof entry === "string") {
        const text = entry.trim();
        if (!text) return null;
        return {
          number: idx + 1,
          text,
          title: null,
        };
      }
      if (typeof entry === "object") {
        const text =
          entry.text ||
          entry.description ||
          entry.body ||
          entry.step ||
          entry.value ||
          "";
        const cleaned = typeof text === "string" ? text.trim() : "";
        if (!cleaned) return null;
        const numberCandidate =
          entry.number ?? entry.step_number ?? entry.index ?? entry.order;
        const number = Number(numberCandidate);
        return {
          number: Number.isFinite(number) ? number : idx + 1,
          text: cleaned,
          title:
            typeof entry.title === "string"
              ? entry.title.trim()
              : typeof entry.name === "string"
              ? entry.name.trim()
              : null,
        };
      }
      return null;
    })
    .filter(Boolean);
}

function sortShoppingEntries(entries = []) {
  return [...entries].sort((a, b) => {
    if (!!a.checked === !!b.checked) {
      const aTime = new Date(a.created_at || 0).getTime();
      const bTime = new Date(b.created_at || 0).getTime();
      return bTime - aTime;
    }
    return a.checked ? 1 : -1;
  });
}

async function generateAiImageWithRetry(recipe, maxAttempts = AI_IMAGE_MAX_ATTEMPTS) {
  const payload = {
    name: recipe?.name,
    ingredients: recipe?.ingredients,
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const url = await generateAiImage(payload);
    if (url) {
      return url;
    }
  }
  return AI_IMAGE_FALLBACK;
}

// ---------------- Home Component ----------------
export default function Home({
  systemPrompt = null,
  aiSession = null,
  setAiSession = null,
}) {
  const [shoppingList, setShoppingList] = useState([]);
  const [shoppingLoading, setShoppingLoading] = useState(true);
  const [shoppingError, setShoppingError] = useState(null);
  const [shoppingAddLoading, setShoppingAddLoading] = useState(false);
  const [shoppingClearing, setShoppingClearing] = useState(false);
  const [savedRecipes, setSavedRecipes] = useState([]);
  const [savedLoading, setSavedLoading] = useState(true);

  const [fallbackAiSession, setFallbackAiSession] = useState(() =>
    createEmptyAiSession()
  );
  const sessionState = aiSession ?? fallbackAiSession;
  const sessionSetter = setAiSession ?? setFallbackAiSession;

  const [aiRecipes, setAiRecipes] = useState(
    () => sessionState?.recipes || []
  );
  const [aiImages, setAiImages] = useState(
    () => sessionState?.images || []
  );
  const [aiImagesLoading, setAiImagesLoading] = useState(false);
  const [dinnerIdea, setDinnerIdea] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [expandedAiIndex, setExpandedAiIndex] = useState(null);
  const [savingAiIndex, setSavingAiIndex] = useState(null);
  const [aiSaveError, setAiSaveError] = useState(null);

  const hasAutoGeneratedRef = useRef(false);

  useEffect(() => {
    if (sessionState) {
      setAiRecipes(sessionState.recipes || []);
      setAiImages(sessionState.images || []);
    }
  }, [sessionState]);

  // ---------------- AI Fetch ----------------
  async function fetchAiRecipes(prompt, systemPrompt = null) {
    try {
      const res = await fetch("http://localhost:4000/api/ai-recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, systemPrompt }),
      });
      const data = await res.json();
      return data.text || "[]"; 
    } catch (err) {
      console.error(err);
      return "[]";
    }
  }

  const refreshAiImages = useCallback(async (recipes = []) => {
    if (!Array.isArray(recipes) || recipes.length === 0) {
      setAiImages([]);
      setAiImagesLoading(false);
      return [];
    }
    setAiImagesLoading(true);
    try {
      const urls = await Promise.all(
        recipes.map((recipe) => generateAiImageWithRetry(recipe))
      );
      setAiImages(urls);
      return urls;
    } catch (err) {
      console.error("Failed to generate AI images:", err);
      const fallbacks = recipes.map(() => AI_IMAGE_FALLBACK);
      setAiImages(fallbacks);
      return fallbacks;
    } finally {
      setAiImagesLoading(false);
    }
  }, []);

  const generateDefaultPrompt = useCallback(() => {
    const pantry = items.join(", ");
    return `Generate 3 balanced dinner recipes using the following pantry staples: ${pantry}.
Focus on flavorful, practical meals that feel achievable on a weeknight.
Return JSON array like: [{name, description, ingredients, steps}]`;
  }, []);

  const fetchSavedRecipes = useCallback(async () => {
    const data = await listSaved();
    const rows = Array.isArray(data) ? data : [];
    return hydrateSavedRecipes(rows);
  }, []);

  const loadShoppingList = useCallback(async () => {
    setShoppingLoading(true);
    setShoppingError(null);
    try {
      const rows = await getShoppingList();
      setShoppingList(sortShoppingEntries(rows || []));
    } catch (err) {
      console.error("Failed to load shopping list:", err);
      setShoppingError(err?.message || "Failed to load shopping list");
      setShoppingList([]);
    } finally {
      setShoppingLoading(false);
    }
  }, []);

  const resetAiSession = useCallback(() => {
    sessionSetter(createEmptyAiSession());
  }, [sessionSetter]);

  const storeAiSession = useCallback(
    ({ prompt, recipes, images }) => {
      sessionSetter({
        prompt: prompt || null,
        recipes: Array.isArray(recipes) ? recipes : [],
        images: Array.isArray(images) ? images : [],
        generatedAt: Date.now(),
      });
    },
    [sessionSetter]
  );

  const runAiGeneration = useCallback(
    async ({ prompt, silent = false } = {}) => {
      const effectivePrompt = prompt || generateDefaultPrompt();
      if (!silent) setLoadingAi(true);
      try {
        const text = await fetchAiRecipes(effectivePrompt, systemPrompt);
        let recipes = [];
        try {
          recipes = JSON.parse(text);
        } catch {
          recipes = [];
        }
        if (!Array.isArray(recipes)) {
          recipes = [];
        }
        setAiRecipes(recipes);
        setExpandedAiIndex(null);
        if (!recipes.length) {
          setAiImages([]);
          resetAiSession();
          return;
        }
        const urls = await refreshAiImages(recipes);
        storeAiSession({
          prompt: effectivePrompt,
          recipes,
          images: Array.isArray(urls) ? urls : [],
        });
      } catch (err) {
        console.error("Failed to generate AI recipes:", err);
        setAiRecipes([]);
        setExpandedAiIndex(null);
        setAiImages([]);
        resetAiSession();
      } finally {
        if (!silent) setLoadingAi(false);
      }
    },
    [generateDefaultPrompt, refreshAiImages, resetAiSession, storeAiSession, systemPrompt]
  );

  useEffect(() => {
    if (hasAutoGeneratedRef.current) return;
    if (aiRecipes.length > 0) {
      hasAutoGeneratedRef.current = true;
      return;
    }
    hasAutoGeneratedRef.current = true;
    runAiGeneration({ prompt: generateDefaultPrompt() });
  }, [aiRecipes.length, generateDefaultPrompt, runAiGeneration]);

  useEffect(() => {
    loadShoppingList();
  }, [loadShoppingList]);
  
  useEffect(() => {
    let cancelled = false;
    setSavedLoading(true);
    fetchSavedRecipes()
      .then((enriched) => {
        if (cancelled) return;
        setSavedRecipes(enriched);
        setDinnerIdea(pickDinnerCandidate(enriched));
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load saved recipes:", err);
        setSavedRecipes([]);
        setDinnerIdea(null);
      })
      .finally(() => {
        if (!cancelled) setSavedLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchSavedRecipes]);

  // ---------------- Handlers ----------------
  const handleShoppingAdd = useCallback(
    async (rawInput) => {
      const normalized = (rawInput || "").trim();
      if (!normalized) return;
      const entries = normalized
        .split(/[\n,]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (!entries.length) return;

      setShoppingAddLoading(true);
      setShoppingError(null);

      try {
        if (entries.length === 1) {
          const row = await createShoppingItem({ name: entries[0] });
          setShoppingList((prev) =>
            sortShoppingEntries([row, ...prev])
          );
        } else {
          const inserted = await addShoppingItemsBulk(entries);
          setShoppingList((prev) =>
            sortShoppingEntries([...(inserted || []), ...prev])
          );
        }
      } catch (err) {
        console.error("Failed to add shopping item:", err);
        setShoppingError(err?.message || "Failed to add shopping item");
      } finally {
        setShoppingAddLoading(false);
      }
    },
    []
  );

  const syncCheckedItemToPantry = useCallback(
    async (entry) => {
      if (!entry?.name) return;
      try {
        await addPantryItem({
          name: entry.name,
          qty: entry.qty ?? "",
          notes: entry.notes ?? "",
        });
      } catch (err) {
        console.error("Failed to sync pantry item:", err);
        setShoppingError((prev) => prev ?? "Could not add item to pantry.");
      }
    },
    [setShoppingError]
  );

  const handleShoppingToggle = useCallback(
    async (item) => {
    if (!item?.id) return;
    const nextChecked = !item.checked;
    setShoppingList((prev) =>
      sortShoppingEntries(
        prev.map((row) =>
          row.id === item.id ? { ...row, checked: nextChecked } : row
        )
      )
    );
    try {
      const updated = await toggleShoppingChecked(item.id, nextChecked);
      if (updated) {
        setShoppingList((prev) =>
          sortShoppingEntries(
            prev.map((row) =>
              row.id === updated.id ? { ...row, ...updated } : row
            )
          )
        );
          if (updated.checked) {
            await syncCheckedItemToPantry(updated);
          }
      }
    } catch (err) {
      console.error("Failed to update shopping item:", err);
      setShoppingError(err?.message || "Failed to update shopping item");
      setShoppingList((prev) =>
        sortShoppingEntries(
          prev.map((row) =>
            row.id === item.id ? { ...row, checked: item.checked } : row
          )
        )
      );
    }
    },
    [syncCheckedItemToPantry]
  );

  const handleShoppingRemove = useCallback(
    async (id) => {
      if (!id) return;
      setShoppingError(null);
      setShoppingList((prev) => prev.filter((row) => row.id !== id));
      try {
        await deleteShoppingItem(id);
      } catch (err) {
        console.error("Failed to remove shopping item:", err);
        setShoppingError(err?.message || "Failed to remove shopping item");
        loadShoppingList();
      }
    },
    [loadShoppingList]
  );

  const handleClearShopping = useCallback(async () => {
    if (!shoppingList.length) return;
    setShoppingClearing(true);
    setShoppingError(null);
    try {
      await clearShopping();
      setShoppingList([]);
    } catch (err) {
      console.error("Failed to clear shopping list:", err);
      setShoppingError(err?.message || "Failed to clear shopping list");
      await loadShoppingList();
    } finally {
      setShoppingClearing(false);
    }
  }, [loadShoppingList, shoppingList.length]);

  async function handleSaveAiRecipe(recipe, index) {
    if (!recipe) return;
    const normalizedName = (recipe.name || "").trim();
    if (!normalizedName) {
      setAiSaveError("Please name the recipe before saving it.");
      return;
    }
    const lookupName = normalizedName.toLowerCase();
    if (savedAiNames.has(lookupName)) {
      return;
    }
    const imageUrl = aiImages[index] || null;

    setAiSaveError(null);
    setSavingAiIndex(index);
    try {
      await addSavedAiSnapshot({
        ...recipe,
        name: normalizedName,
        ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
        steps: Array.isArray(recipe.steps) ? recipe.steps : [],
        image_url: imageUrl,
      });
      const enriched = await fetchSavedRecipes();
      setSavedRecipes(enriched);
      setDinnerIdea(pickDinnerCandidate(enriched));
    } catch (err) {
      console.error("Failed to save AI recipe:", err);
      setAiSaveError(err?.message || "Failed to save recipe");
    } finally {
      setSavingAiIndex(null);
    }
  }

  const outstandingShopping = useMemo(
    () => shoppingList.filter((item) => !item.checked),
    [shoppingList]
  );
  const completedShopping = useMemo(
    () => shoppingList.filter((item) => !!item.checked),
    [shoppingList]
  );
  const dinnerMeta = dinnerIdea
    ? [
        dinnerIdea.minutes ? `${dinnerIdea.minutes} min` : null,
        typeof dinnerIdea.rating === "number" ? `★ ${dinnerIdea.rating}` : null,
        dinnerIdea.cuisine || null,
        dinnerIdea.diet || null,
      ].filter(Boolean)
    : [];
  const dinnerDescription =
    dinnerIdea && typeof dinnerIdea.description === "string" && dinnerIdea.description.trim()
      ? dinnerIdea.description
      : dinnerIdea
      ? "This saved recipe doesn't have a description yet, but it's ready to cook!"
      : "";
  const dinnerIngredientsPreview =
    dinnerIdea && Array.isArray(dinnerIdea.ingredients)
      ? dinnerIdea.ingredients
          .map(extractIngredientName)
          .filter(Boolean)
          .slice(0, 5)
      : [];
  const dinnerStepsSource = dinnerIdea ? getRecipeSteps(dinnerIdea) : [];
  const dinnerStepsPreview = formatStepEntries(dinnerStepsSource).slice(0, 3);
  const savedAiNames = useMemo(() => {
    const nameSet = new Set();
    savedRecipes.forEach((recipe) => {
      if (recipe?.name && recipe?.is_ai_recipe) {
        nameSet.add(recipe.name.toLowerCase());
      }
    });
    return nameSet;
  }, [savedRecipes]);

  // ---------------- UI ----------------
  return (
    <div className="home-shell">
      <header className="home-header">
        <div className="home-title">
          <span className="logo">🍽️</span>
          <div>
            <h1>Welcome back</h1>
            <p className="subtitle">Here's your personalized kitchen dashboard.</p>
          </div>
        </div>
      </header>

      {/* What's for Dinner */}
      <section className="panel">
        <div className="panel-head">
          <h2>What's for Dinner</h2>
        </div>
        <div className="dinner-section">
          {savedLoading ? (
            <p>Loading your saved recipes…</p>
          ) : savedRecipes.length === 0 ? (
            <div>
            <p>You haven't saved any recipes yet. Head to Search to save a few favorites.</p>
              <Link className="btn primary" to="/saved">View Saved Recipes</Link>
            </div>
          ) : dinnerIdea ? (
            <div className="dinner-layout">
              {dinnerIdea.image_url && (
                <div className="dinner-media">
                  <img
                    src={dinnerIdea.image_url}
                    alt={dinnerIdea.name || "Saved recipe"}
                    className="dinner-image"
                  />
                </div>
              )}
              <div className="dinner-text">
                <p className="dinner-eyebrow">Chef's pick</p>
                <h3 className="dinner-caption">{dinnerIdea.name}</h3>
                <p className="dinner-description">{dinnerDescription}</p>
                {dinnerMeta.length > 0 && (
                  <div className="dinner-meta">
                    {dinnerMeta.map((pill) => (
                      <span key={pill} className="meta-pill">
                        {pill}
                      </span>
                    ))}
                  </div>
                )}
                {dinnerIngredientsPreview.length > 0 && (
                  <div className="dinner-block">
                    <strong>Quick ingredients</strong>
                    <ul className="inline-list">
                      {dinnerIngredientsPreview.map((ing, idx) => (
                        <li key={idx}>{ing}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {dinnerStepsPreview.length > 0 && (
                  <div className="dinner-block">
                    <strong>Steps</strong>
                    <ol className="dinner-steps">
                      {dinnerStepsPreview.map((step) => {
                        const key = `${step.number}-${step.text.slice(0, 24)}`;
                        return (
                          <li key={key}>
                            <div className="dinner-step-label">
                              Step {step.number}
                              {step.title ? ` · ${step.title}` : ""}
                            </div>
                            <div className="dinner-step-text">{step.text}</div>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}
                <Link className="btn primary" to="/saved">
                  Go to Saved Recipes
                </Link>
              </div>
            </div>
          ) : (
            <div>
              <p>No saved recipes available right now.</p>
              <Link className="btn primary" to="/saved">Go to Saved Recipes</Link>
            </div>
          )}
        </div>
      </section>

      {/* AI Recipes */}
      <section className="panel">
        <div className="panel-head">
          <h2>Recipe Inspiration</h2>
        </div>
        {loadingAi ? (
          <p>Generating AI recipes...</p>
        ) : (
          <>
            {aiImagesLoading && aiRecipes.length > 0 && (
              <p>Generating fresh images…</p>
            )}
            {aiSaveError && <p className="inline-error">{aiSaveError}</p>}
            {aiRecipes.length === 0 ? (
              <p>No AI recipes yet.</p>
            ) : (
              <div className="ai-card-grid">
                {aiRecipes.map((r, i) => {
                  const isExpanded = expandedAiIndex === i;
                  const imgUrl = aiImages[i] || null;
                  const normalizedName = (r.name || "").toLowerCase();
                  const alreadySaved = !!(
                    normalizedName && savedAiNames.has(normalizedName)
                  );
                  const saving = savingAiIndex === i;
                  const disableSave = !r.name || alreadySaved || saving;
                  return (
                    <article
                      className={`ai-card ${isExpanded ? "expanded" : ""}`}
                      key={i}
                      onClick={() => setExpandedAiIndex(isExpanded ? null : i)}
                    >
                      {imgUrl && (
                        <div className="ai-card-media">
                          <img src={imgUrl} alt={r.name || `Recipe ${i + 1}`} />
                        </div>
                      )}
                      <div className="ai-card-body">
                        <h3>{r.name || `Recipe ${i + 1}`}</h3>
                        <p className="ai-card-hint">
                          {isExpanded ? "Click to collapse" : "Click to expand"}
                        </p>
                        {!isExpanded && r.description && (
                          <p className="ai-card-summary">
                            {truncateText(r.description, 140)}
                          </p>
                        )}
                        <div className="ai-card-chips">
                          {Array.isArray(r.ingredients) && r.ingredients.length > 0 && (
                            <span>{r.ingredients.length} ingredients</span>
                          )}
                          {Array.isArray(r.steps) && r.steps.length > 0 && (
                            <span>{r.steps.length} steps</span>
                          )}
                        </div>
                        <div className="ai-card-actions">
                          <button
                            type="button"
                            className="btn secondary"
                            disabled={disableSave}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (!disableSave) {
                                handleSaveAiRecipe(r, i);
                              }
                            }}
                          >
                            {alreadySaved
                              ? "Saved"
                              : saving
                              ? "Saving…"
                              : "Save Recipe"}
                          </button>
                          {alreadySaved && (
                            <span className="ai-card-saved">Recipe Saved</span>
                          )}
                        </div>
                        {isExpanded && (
                          <div className="ai-card-details">
                            {r.description && <p>{r.description}</p>}
                            {Array.isArray(r.ingredients) && r.ingredients.length > 0 && (
                              <div>
                                <strong>Ingredients:</strong>
                                <ul>
                                  {r.ingredients.map((ing, idx) => (
                                    <li key={idx}>
                                      {typeof ing === "string" ? ing : ing.ingredient || ""}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {Array.isArray(r.steps) && r.steps.length > 0 && (
                              <div>
                                <strong>Steps:</strong>
                                <ol>
                                  {r.steps.map((step, idx) => (
                                    <li key={idx}>{step}</li>
                                  ))}
                                </ol>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      {/* Profile Summary */}
      <section className="panel">
        <div className="panel-head"><h2>Profile Summary</h2></div>
        <ul className="profile-list profile-stats">
          <li>
            <span className="label">Saved Recipes</span>
            <span className="value">{savedRecipes.length}</span>
          </li>
          <li>
            <span className="label">Pending Shopping Items</span>
            <span className="value">{outstandingShopping.length}</span>
          </li>
          <li>
            <span className="label">Daily Challenge</span>
            <span className="value highlight">Make an Italian dish</span>
          </li>
        </ul>
      </section>

      {/* Shopping List */}
      <section className="panel shopping-panel">
        <div className="panel-head">
          <h2>Shopping List</h2>
          {shoppingList.length > 0 && (
            <button
              type="button"
              className="btn ghost"
              onClick={handleClearShopping}
              disabled={shoppingClearing}
            >
              {shoppingClearing ? "Clearing…" : "Clear all"}
            </button>
          )}
        </div>

        <div className="shopping-list-header">
          <div>
            <p className="shopping-eyebrow">Next grocery run</p>
            <p className="shopping-headline">
              {shoppingLoading
                ? "Syncing shopping list…"
                : outstandingShopping.length
                ? `${outstandingShopping.length} item${
                    outstandingShopping.length === 1 ? "" : "s"
                  } left to buy`
                : "You're fully stocked"}
            </p>
          </div>
          <div className="shopping-pills">
            <span className="shopping-pill pending">
              {outstandingShopping.length} to buy
            </span>
            <span className="shopping-pill done">
              {completedShopping.length} checked
            </span>
          </div>
        </div>

        <AddShoppingItem
          onAdd={handleShoppingAdd}
          isAdding={shoppingAddLoading}
        />

        {shoppingError && <p className="inline-error">{shoppingError}</p>}

        {shoppingLoading ? (
          <div className="empty">
            <p>Loading your shopping list…</p>
          </div>
        ) : shoppingList.length === 0 ? (
          <div className="empty">
            <p>Your shopping list is empty. Add ingredients above!</p>
          </div>
        ) : (
          <div className="shopping-list-grid">
            <ShoppingColumn
              title="Need to buy"
              items={outstandingShopping}
              emptyText="Every ingredient is accounted for."
              onToggle={handleShoppingToggle}
              onRemove={handleShoppingRemove}
            />
            <ShoppingColumn
              title="Checked off"
              items={completedShopping}
              emptyText="Nothing checked off yet."
              onToggle={handleShoppingToggle}
              onRemove={handleShoppingRemove}
            />
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------- Components ----------------
function AddShoppingItem({ onAdd, isAdding }) {
  const [value, setValue] = useState("");

  async function submit() {
    const text = value.trim();
    if (!text || isAdding) return;
    await onAdd(text);
    setValue("");
  }

  return (
    <div className="add-fav-row">
      <input
        type="text"
        value={value}
        placeholder="Add item or paste comma-separated entries"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
      />
      <button
        className="btn primary"
        type="button"
        onClick={submit}
        disabled={isAdding || !value.trim()}
      >
        {isAdding ? "Adding…" : "Add"}
      </button>
    </div>
  );
}

function ShoppingColumn({
  title,
  items = [],
  emptyText,
  onToggle,
  onRemove,
}) {
  return (
    <div className="shopping-column">
      <div className="shopping-column-head">
        <h3>{title}</h3>
        <span className="shopping-count-pill">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="shopping-column-empty">{emptyText}</p>
      ) : (
        <div className="shopping-items">
          {items.map((item) => (
            <ShoppingListItem
              key={item.id}
              item={item}
              onToggle={onToggle}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ShoppingListItem({ item, onToggle, onRemove }) {
  if (!item) return null;
  const detail = [item.qty, item.notes]
    .map((value) => (value ? String(value).trim() : ""))
    .filter(Boolean)
    .join(" • ");

  return (
    <div className={`shopping-item ${item.checked ? "done" : ""}`}>
      <label className="shopping-item-main">
        <input
          type="checkbox"
          checked={!!item.checked}
          onChange={() => onToggle(item)}
        />
        <div className="shopping-item-text">
          <span className="shopping-item-name">{item.name}</span>
          {detail && <span className="shopping-item-detail">{detail}</span>}
        </div>
      </label>
      <button
        type="button"
        className="shopping-remove-btn"
        onClick={() => onRemove(item.id)}
      >
        Remove
      </button>
    </div>
  );
}
