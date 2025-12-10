import React, { useEffect, useMemo, useRef, useState } from "react";
import { generateSearchRecipes } from "../api/aiSearch";
import { getPantry } from "../data/pantry";
import {
  listLocalSaved,
  listAiSaved,
  addSavedLocal,
  addSavedAiSnapshot,
  removeSavedAiByName,
  removeSavedLocal,
} from "../data/saved";

import { generateSavedImage } from "../api/savedImageGeneration";



const API_BASE = "http://localhost:4000/api";
const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZES = [5, 10, 20, 50];
const LS_KEY = "searchFilters.v1"; 

const S = {
  page: { maxWidth: 1100, margin: "0 auto", padding: "28px 16px", fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: "#0f172a" },
  h1: { fontSize: 28, fontWeight: 800, textAlign: "center", margin: "0 0 20px" },

  inputWrap: { position: "relative", border: "1px solid #e2e8f0", borderRadius: 16, background: "#fff", padding: 12, marginBottom: 16 },
  inputRow: { display: "flex", gap: 10, alignItems: "center", padding: 10, border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff", flexWrap: "wrap" },
  pillsWrap: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", maxWidth: "100%" },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    background: "#16a34a",          
    color: "#fff",
    border: "1px solid #16a34a",
  },
  pillBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 18,
    height: 18,
    borderRadius: 999,
    border: "1px solid #a7f3d0",     
    background: "#ecfdf5",           
    color: "#065f46",                
    cursor: "pointer",
    fontSize: 12,
    lineHeight: "16px",
    padding: 0,
  },

  textInput: { border: "none", outline: "none", flex: 1, minWidth: 160, fontSize: 16 },

  menu: { position: "absolute", top: "100%", left: 12, right: 12, marginTop: 8, border: "1px solid #e2e8f0", borderRadius: 16, background: "#fff", boxShadow: "0 10px 30px rgba(15,23,42,0.08)", zIndex: 20, padding: 12 },
  menuRow: { display: "grid", gridTemplateColumns: "110px 1fr", gap: 12, alignItems: "start", padding: "8px 0" },
  menuTitle: { fontSize: 12, fontWeight: 800, color: "#475569", paddingTop: 6 },
  menuChips: { display: "flex", gap: 8, flexWrap: "wrap", maxHeight: 140, overflow: "auto" },
  inputSmall: { width: "100%", padding: "8px 10px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 13 },

  layout: { display: "grid", gridTemplateColumns: "1fr", gap: 16 },
  card: { border: "1px solid #e2e8f0", borderRadius: 16, background: "#fff", padding: 16 },
  chip: (active) => ({
    fontSize: 12,
  padding: "6px 10px",
  borderRadius: 999,
  border: `1px solid ${active ? "#16a34a" : "#86efac"}`, // green-600 / green-200
  background: active ? "#16a34a" : "#ffffff",
  color: active ? "#ffffff" : "#065f46",                 // emerald-700 text when inactive
  cursor: "pointer",
  fontWeight: 700,
  }),
  select: { padding: "8px 12px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff", fontSize: 13 },

  list: { display: "grid", gap: 12 },
  rCard: { border: "1px solid #e2e8f0", borderRadius: 16, background: "#fff", padding: 16 },
  title: { fontSize: 18, fontWeight: 800, marginBottom: 6 },
  meta: { display: "flex", gap: 12, color: "#64748b", fontSize: 13, alignItems: "center", flexWrap: "wrap" },
  tag: { background: "#f1f5f9", color: "#334155", padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 500 },
  details: { marginTop: 8, color: "#334155", lineHeight: 1.5, whiteSpace: "pre-wrap" },

  row: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 },
  small: { color: "#64748b", fontSize: 12 },

  pager: { display: "flex", gap: 8, justifyContent: "center", marginTop: 12 },
  btn: { border: "1px solid #cbd5e1", borderRadius: 10, background: "#fff", padding: "8px 12px", fontSize: 13, cursor: "pointer", fontWeight: 600 },
  btnPri: {
    border: "1px solid #16a34a",
    borderRadius: 10,
    background: "#16a34a",
    color: "#fff",
    padding: "10px 14px",
    fontSize: 14,
    cursor: "pointer",
    fontWeight: 800,
  },

  error: { border: "1px solid #fecaca", background: "#fef2f2", color: "#b91c1c", padding: 12, borderRadius: 12 },
  skel: { border: "1px solid #e2e8f0", borderRadius: 16, background: "#fff" },
  skelBar: { height: 14, background: "linear-gradient(90deg,#f1f5f9, #e5e7eb, #f1f5f9)", borderRadius: 6, animation: "pulse 1.2s infinite" },

  drawer: { marginTop: 12, borderTop: "1px solid #e2e8f0", paddingTop: 12 },
  subTitle: { fontWeight: 800, margin: "10px 0 6px" },
  actionRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 },

  kebabWrap: {
    position: "relative",
  },
  kebabBtn: {
    border: "none",
    background: "transparent",
    padding: 4,
    borderRadius: 999,
    cursor: "pointer",
    lineHeight: 0,
  },
  kebabMenu: {
    position: "absolute",
    top: 24,
    right: 0,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    boxShadow: "0 10px 30px rgba(15,23,42,0.15)",
    padding: "4px 0",
    zIndex: 30,
    minWidth: 140,
  },
  kebabItem: {
    width: "100%",
    display: "block",
    padding: "6px 12px",
    border: "none",
    background: "transparent",
    textAlign: "left",
    fontSize: 13,
    cursor: "pointer",
  },

};

if (typeof document !== "undefined" && !document.getElementById("searchPulseKeyframes")) {
  const style = document.createElement("style");
  style.id = "searchPulseKeyframes";
  style.textContent = `@keyframes pulse { 0%{opacity:.8} 50%{opacity:.4} 100%{opacity:.8} }`;
  document.head.appendChild(style);
}

function MagnifierIcon() {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, display: "inline-block", verticalAlign: "-3px" }} aria-hidden>
      <path fill="#64748b" d="M21 20.3 16.7 16a7.5 7.5 0 1 0-1 1L20.3 21 21 20.3zM10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13z"/>
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, display: "inline-block", verticalAlign: "-3px" }} aria-hidden>
      <path fill="#64748b" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm.75 5.5a.75.75 0 0 0-1.5 0V12c0 .41.34.75.75.75H15a.75.75 0 0 0 0-1.5h-2.25V7.5z"/>
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{ width: 18, height: 18, display: "inline-block" }}
      aria-hidden
    >
      <circle cx="6" cy="12" r="1.5" fill="#64748b" />
      <circle cx="12" cy="12" r="1.5" fill="#64748b" />
      <circle cx="18" cy="12" r="1.5" fill="#64748b" />
    </svg>
  );
}

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}
function highlight(text, query) {
  if (!query) return text;
  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${safe})`, "ig");
  const parts = String(text || "").split(re);
  return parts.map((p, i) =>
    i % 2 ? <mark key={i} style={{ background: "#fde68a", padding: "0 3px", borderRadius: 3 }}>{p}</mark> : <React.Fragment key={i}>{p}</React.Fragment>
  );
}
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
function copy(text) {
  try { navigator.clipboard.writeText(text); } catch {}
}

async function apiSearch({ q, page, pageSize, cuisine, diet, minRating, maxMinutes, sort, ingredientsCSV }) {
  const u = new URL(`${API_BASE}/search`);
  if (q) u.searchParams.set("q", q);
  if (page) u.searchParams.set("page", page);
  if (pageSize) u.searchParams.set("page_size", pageSize);
  if (cuisine) u.searchParams.set("cuisine", cuisine);
  if (diet) u.searchParams.set("diet", diet);
  if (minRating) u.searchParams.set("min_rating", minRating);
  if (maxMinutes) u.searchParams.set("max_minutes", maxMinutes);
  if (sort) u.searchParams.set("sort", sort);
  if (ingredientsCSV) u.searchParams.set("ingredients", ingredientsCSV);
  return fetchJSON(u.toString());
}
async function apiFacets() { return fetchJSON(`${API_BASE}/facets`); }
async function apiRecipe(id) { return fetchJSON(`${API_BASE}/recipes/${id}`); }

export default function Search() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sort, setSort] = useState("relevance");

  const [cuisine, setCuisine] = useState("");
  const [diet, setDiet] = useState("");
  const [pickedIngredients, setPickedIngredients] = useState([]);

  // eslint-disable-next-line no-unused-vars
  const [minRating, setMinRating] = useState(0);
  // eslint-disable-next-line no-unused-vars
  const [maxMinutes, setMaxMinutes] = useState(0);

  const [ingredientInput, setIngredientInput] = useState("");
  const ingredientsCSV = useMemo(
    () => (pickedIngredients.length ? pickedIngredients.join(",") : ""),
    [pickedIngredients]
  );

  const [facets, setFacets] = useState({ cuisines: [], diets: [], ingredients: [] });
  const [results, setResults] = useState({ page: 1, page_size: pageSize, total: 0, pages: 0, items: [] });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const [aiRecipes, setAiRecipes] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState(null);
  const [usePantry, setUsePantry] = useState(false);
  const [pantryItems, setPantryItems] = useState([]);
  const pantryLoadedRef = useRef(false);

  const [savedLocalIds, setSavedLocalIds] = useState([]);      
  const [savedAiKeys, setSavedAiKeys] = useState([]);          
  const [openMenuKey, setOpenMenuKey] = useState(null);              
  const [savedAiNames, setSavedAiNames] = useState([]);       
  // eslint-disable-next-line no-unused-vars
  const [savedErr, setSavedErr] = useState(null);


  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const detailsCacheRef = useRef(new Map());

  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef(null);
  const menuRef = useRef(null);


  useEffect(() => {
    let cancelled = false;

    async function loadSaved() {
      try {
        const [localSaved, aiSaved] = await Promise.all([
          listLocalSaved(), 
          listAiSaved(),    
        ]);

        if (cancelled) return;

        setSavedLocalIds(
          (localSaved || [])
            .map((f) => f.recipe_id)
            .filter((id) => id != null)
        );

        setSavedAiNames(
          (aiSaved || [])
            .map((f) => f.name)
            .filter(Boolean)
        );
      } catch (e) {
        console.error("Error loading saved recipes:", e);
        
      }
    }

    loadSaved();
    return () => {
      cancelled = true;
    };
  }, []);


  useEffect(() => {
    if (usePantry && !pantryLoadedRef.current) {
      pantryLoadedRef.current = true;
      getPantry()
        .then(setPantryItems)
        .catch((err) => {
          console.error("Error loading pantry:", err);
          pantryLoadedRef.current = false; // allow retry if it failed
        });
    }
  }, [usePantry]);

  // ---- LOCALSTORAGE: save whenever filters change
  useEffect(() => {
    try {
      const payload = JSON.stringify({
        diet,
        cuisine,
        ingredients: pickedIngredients,
      });
      localStorage.setItem(LS_KEY, payload);
    } catch {}
  }, [diet, cuisine, pickedIngredients]);

  // load facets once
  useEffect(() => {
    apiFacets()
      .then((f) => setFacets({ cuisines: f.cuisines || [], diets: f.diets || [], ingredients: f.ingredients || [] }))
      .catch(() => {});
  }, []);

  // search whenever inputs change
  useEffect(() => {
    if (!dq) { setResults({ page: 1, page_size: pageSize, total: 0, pages: 0, items: [] }); setErr(null); return; }
    setLoading(true);
    setErr(null);
    apiSearch({ q: dq, page, pageSize, cuisine, diet, minRating, maxMinutes, sort, ingredientsCSV })
      .then((data) => setResults(data))
      .catch((e) => setErr(String(e.message || e)))
      .finally(() => setLoading(false));
  }, [dq, page, pageSize, cuisine, diet, minRating, maxMinutes, sort, ingredientsCSV]);

  useEffect(() => { setPage(1); }, [dq, cuisine, diet, minRating, maxMinutes, sort, ingredientsCSV]);

  async function openDetails(id) {
    setOpenId((cur) => (cur === id ? null : id));
    if (!id) { setDetail(null); return; }
    if (detailsCacheRef.current.has(id)) { setDetail(detailsCacheRef.current.get(id)); return; }
    const row = await apiRecipe(id).catch(() => null);
    if (row) { detailsCacheRef.current.set(id, row); setDetail(row); }
  }

  // ingredients suggestions (facets preferred; else derive from results)
  const ingredientSuggestions = useMemo(() => {
    if (facets.ingredients?.length) {
      return facets.ingredients
        .map((x) => ({ name: x.name, count: x.count || 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 200);
    }
    const counts = new Map();
    for (const it of results.items || []) {
      for (const ing of it.ingredients || []) {
        const k = String(ing).trim();
        if (!k) continue;
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 200);
  }, [facets.ingredients, results.items]);

  const hasCriteria = useMemo(() => {
    return (
      q.trim().length > 0 ||          
      !!diet ||                       
      !!cuisine ||                    
      pickedIngredients.length > 0 || 
      usePantry                       
    );
  }, [q, diet, cuisine, pickedIngredients.length, usePantry]);


  const filteredSuggestions = useMemo(() => {
    const q = ingredientInput.trim().toLowerCase();
    const base = ingredientSuggestions.filter(s => !pickedIngredients.includes(s.name));
    if (!q) return base.slice(0, 30);
    return base.filter(s => s.name.toLowerCase().includes(q)).slice(0, 30);
  }, [ingredientInput, ingredientSuggestions, pickedIngredients]);

  // eslint-disable-next-line no-unused-vars
  const addIngredient = (raw) => {
    const name = String(raw || "").trim();
    if (!name) return;
    setPickedIngredients((xs) => (xs.includes(name) ? xs : [...xs, name]));
    setIngredientInput("");
  };
  const toggleIngredient = (name) =>
    setPickedIngredients((xs) => (xs.includes(name) ? xs.filter((x) => x !== name) : [...xs, name]));

  const pills = useMemo(() => {
  const xs = [];
  if (diet) xs.push({ key: `diet:${diet}`, label: `Diet: ${diet}`, onRemove: () => setDiet("") });
  if (cuisine) xs.push({ key: `cuisine:${cuisine}`, label: `Cuisine: ${cuisine}`, onRemove: () => setCuisine("") });
  pickedIngredients.forEach((n) => {
    xs.push({ key: `ing:${n}`, label: n, onRemove: () => setPickedIngredients((arr) => arr.filter((x) => x !== n)) });
  });
  if (usePantry) {
    xs.push({ key: 'pantry:on', label: `Using Pantry (${pantryItems.length || 0})`, onRemove: () => setUsePantry(false) });
  }
  return xs;
}, [diet, cuisine, pickedIngredients, usePantry, pantryItems.length]);

  const infoLine = useMemo(() => {
    if (!dq) return "Type a query to begin.";
    const { page: p, pages, total } = results;
    return `Showing page ${p} of ${pages || 0}, total ${total} results for “${dq}”.`;
  }, [dq, results]);

  async function runAI() {
    if (!hasCriteria) {               
      setAiRecipes([]);
      setAiErr(null);
      return;
    }
    try {
      setAiLoading(true); setAiErr(null);
      const pantry = usePantry ? pantryItems.map(i => (i.name || i.item || i.ingredient || '').toString().trim()).filter(Boolean) : [];
      const data = await generateSearchRecipes({
        q: dq,
        diet,
        cuisine,
        ingredients: pickedIngredients,
        pantry,                   
      });
      setAiRecipes(data);
    } catch (e) {
      setAiErr(String(e.message || e));
      setAiRecipes([]);
    } finally {
      setAiLoading(false);
    }
  }

    // Local DB recipes: save recipe_id only, everything else null
  async function handleToggleSavedLocal(recipe) {
    setSavedErr(null);
    const isSaved = savedLocalIds.includes(recipe.id);

    
    setSavedLocalIds((prev) =>
      isSaved ? prev.filter((x) => x !== recipe.id) : [...prev, recipe.id]
    );

    try {
      if (!isSaved) {
        // ADD saved recipe and get the row
        const saved = await addSavedLocal(recipe.id); 

        // Generate image using local recipe details
        // Use recipe.name + recipe.ingredients 
        generateSavedImage(saved.id, recipe.name, recipe.ingredients);
      } else {
        // REMOVE saved recipe
        await removeSavedLocal(recipe.id);
      }
    } catch (err) {
      console.error("Saved (local) error:", err);
      setSavedErr(err.message || "Failed to update saved recipes");

      
      setSavedLocalIds((prev) =>
        isSaved ? [...prev, recipe.id] : prev.filter((x) => x !== recipe.id)
      );
    }
  }



  // AI recipes: name/ingredients/steps, recipe_id = null
  async function handleToggleSavedAi(recipe, key) {
    setSavedErr(null);

    const name = recipe.name || "";
    const isSaved =
      savedAiKeys.includes(key) || savedAiNames.includes(name);

    
    setSavedAiKeys((prev) =>
      isSaved ? prev.filter((x) => x !== key) : [...prev, key]
    );
    setSavedAiNames((prev) =>
      isSaved ? prev.filter((n) => n !== name) : [...prev, name]
    );

    try {
      if (!isSaved) {
        // ADD saved recipe in Supabase and get the row 
        const saved = await addSavedAiSnapshot(recipe); 

        // ask backend to generate + store an image
        generateSavedImage(saved.id, recipe.name, recipe.ingredients);
      } else {
        // REMOVE saved recipe
        await removeSavedAiByName(name);
      }
    } catch (err) {
      console.error("Saved (AI) error:", err);
      setSavedErr(err.message || "Failed to update saved recipes");

      
      setSavedAiKeys((prev) =>
        isSaved ? [...prev, key] : prev.filter((x) => x !== key)
      );
      setSavedAiNames((prev) =>
        isSaved ? [...prev, name] : prev.filter((n) => n !== name)
      );
    }
  }




  // popover close handlers
  useEffect(() => {
    function onDocClick(e) {
      if (!menuOpen) return;
      const t = e.target;
      if (menuRef.current && !menuRef.current.contains(t) && inputRef.current && !inputRef.current.contains(t)) {
        setMenuOpen(false);
      }
    }
    function onEsc(e) { if (e.key === "Escape") setMenuOpen(false); }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuOpen]);

  return (
  <main style={S.page}>
    <h1 style={S.h1}>Recipe Search</h1>

    {/* Query + pills + menu */}
    <div style={S.inputWrap}>
      <div style={S.inputRow} ref={inputRef} onClick={() => setMenuOpen(true)}>
        <MagnifierIcon />

        {/* Active pills INSIDE bar */}
        {pills.length > 0 && (
          <div style={S.pillsWrap}>
            {pills.map((p) => (
              <span key={p.key} style={S.pill}>
                {p.label}
                <button
                  style={S.pillBtn}
                  onClick={(e) => { e.stopPropagation(); p.onRemove(); }}
                  aria-label={`Remove ${p.label}`}
                  title="Remove"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={pills.length ? "Refine search…" : "Search recipes (e.g., chicken pasta)"}
          style={S.textInput}
          onFocus={() => setMenuOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              runAI(); 
              setMenuOpen(false);
            }
          }}
        />
        <button style={S.btn} onClick={() => setQ("")}>Clear</button>
      </div>

      {/* Popover */}
      {menuOpen && (
        <div style={S.menu} ref={menuRef} role="dialog" aria-label="Quick Filters">
          {/* Diet */}
          <div style={S.menuRow}>
            <div style={S.menuTitle}>Diet</div>
            <div style={S.menuChips}>
              <button style={S.chip(!diet)} onClick={() => setDiet("")}>All</button>
              {facets.diets.map((d) => (
                <button key={d.name} style={S.chip(diet === d.name)} onClick={() => setDiet(d.name)}>
                  {d.name} {d.count ? `(${d.count})` : ""}
                </button>
              ))}
            </div>
          </div>

          {/* Cuisine */}
          <div style={S.menuRow}>
            <div style={S.menuTitle}>Cuisine</div>
            <div style={S.menuChips}>
              <button style={S.chip(!cuisine)} onClick={() => setCuisine("")}>All</button>
              {facets.cuisines.map((c) => (
                <button key={c.name} style={S.chip(cuisine === c.name)} onClick={() => setCuisine(c.name)}>
                  {c.name} {c.count ? `(${c.count})` : ""}
                </button>
              ))}
            </div>
          </div>

          {/* Ingredients */}
          <div style={S.menuRow}>
            <div style={S.menuTitle}>Ingredients</div>
            <div>
              <input
                value={ingredientInput}
                disabled={usePantry} 
                onChange={(e) => setIngredientInput(e.target.value)}
                onKeyDown={(e) => {
                  if (usePantry) return; 
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    const pieces = ingredientInput.split(",").map(s => s.trim()).filter(Boolean);
                    if (pieces.length) {
                      setPickedIngredients((xs) => {
                        const set = new Set(xs);
                        pieces.forEach(p => set.add(p));
                        return Array.from(set);
                      });
                      setIngredientInput("");
                    }
                  }
                }}
                placeholder={
                  usePantry
                    ? "Using pantry items…" 
                    : "Type to add (press Enter)…"
                }
                style={{
                  ...S.inputSmall,
                  opacity: usePantry ? 0.5 : 1,
                  pointerEvents: usePantry ? "none" : "auto",
                }}
              />

              {/* Suggestions list */}
              <div
                style={{
                  ...S.menuChips,
                  marginTop: 8,
                  opacity: usePantry ? 0.5 : 1,
                  pointerEvents: usePantry ? "none" : "auto",
                }}
              >
                {filteredSuggestions.length === 0 ? (
                  <span style={{ fontSize: 12, color: "#64748b" }}>No suggestions.</span>
                ) : (
                  filteredSuggestions.map((s) => {
                    const active = pickedIngredients.includes(s.name);
                    return (
                      <button
                        key={s.name}
                        style={S.chip(active)}
                        onClick={() => toggleIngredient(s.name)}
                        title={active ? "Remove" : "Add"}
                        disabled={usePantry}
                      >
                        {s.name} {typeof s.count === "number" && s.count > 0 ? `(${s.count})` : ""}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Pantry toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                <button
                  style={S.chip(usePantry)}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = !usePantry; 
                    setUsePantry(next);
                    if (next) {
                      setPickedIngredients([]); 
                    }
                  }}
                  title={
                    usePantry
                      ? "Click to stop using pantry for substitutions"
                      : "Click to let AI use your pantry for substitutions"
                  }
                >
                  {usePantry ? "✔ Using Pantry" : "Use my Pantry"}
                </button>
                {usePantry && (
                  <span style={{ fontSize: 12, color: "#64748b" }}>
                    {pantryItems.length
                      ? `${pantryItems.length} items loaded`
                      : "loading…"}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <button
              style={S.btn}
              onClick={() => {
                setDiet("");
                setCuisine("");
                setPickedIngredients([]);
                setIngredientInput("");
                try { localStorage.removeItem(LS_KEY); } catch {}
              }}
              title="Clear selections"
            >
              Clear
            </button>
            <button
              style={S.btnPri}
              onClick={() => {
                setMenuOpen(false);
                runAI();
              }}
              title="Search"
            >
              Search
            </button>
          </div>
        </div> 
      )}

      <div style={S.row}>
        <span style={S.small}>Sort</span>
        <select style={S.select} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="relevance">Relevance</option>
          <option value="rating">Rating</option>
          <option value="minutes-asc">Time: Low → High</option>
          <option value="minutes-desc">Time: High → Low</option>
          <option value="popularity">Popularity</option>
        </select>

        <span style={S.small}>Per page</span>
        <select style={S.select} value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
    </div>

    <div style={S.layout}>
      <section>
        <div style={{ ...S.row, justifyContent: "space-between", marginTop: 0 }}>
          <div style={S.small}>{infoLine}</div>
          <div>
            <button
              style={{ ...S.btn, marginRight: 6, opacity: results.page <= 1 ? 0.6 : 1 }}
              disabled={results.page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Prev
            </button>
            <button
              style={S.btnPri}
              disabled={loading || results.page >= results.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        </div>

        {err && <div style={S.error}>{err}</div>}

        {/* ==== AI Recipe Suggestions ==== */}
        {(aiLoading || aiErr || aiRecipes.length > 0) && (
          <section style={{ marginTop: 12 }}>
            <div style={{ ...S.card, borderColor: "#c7d2fe", background: "#eef2ff" }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>
                AI Recipe Suggestions
              </div>

              {aiLoading && <div>Generating…</div>}
              {aiErr && <div style={S.error}>{aiErr}</div>}

              {!aiLoading && !aiErr && aiRecipes.length > 0 && (
                <div style={{ display: "grid", gap: 12 }}>
                  {aiRecipes.map((r, i) => {
                    const key = `ai:${i}:${r.name || ""}`;
                    const isSaved = savedAiKeys.includes(key) || savedAiNames.includes(r.name || "");
                    const menuKey = `ai-menu:${i}`;

                    return (
                      <article
                        key={i}
                        style={{ ...S.card, borderColor: "#cbd5e1" }}
                      >
                        {/* top row: title/meta + 3-dot menu */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={S.title}>{r.name}</div>

                            {/* Optional metadata if present */}
                            <div style={S.meta}>
                              {typeof r.total_time_minutes === "number" && (
                                <span>
                                  <ClockIcon /> {r.total_time_minutes}m
                                </span>
                              )}
                              {r.servings && <span>Serves {r.servings}</span>}
                              {r.cuisine && <span>{r.cuisine}</span>}
                              {r.diet && <span>{r.diet}</span>}
                              {Array.isArray(r.tags) &&
                                r.tags.slice(0, 4).map((t) => (
                                  <span key={t} style={S.tag}>
                                    {t}
                                  </span>
                                ))}
                              {isSaved && (
                                <span style={S.tag}>★ Saved</span>
                              )}
                            </div>
                          </div>

                          {/* 3-dot menu */}
                          <div style={S.kebabWrap}>
                            <button
                              type="button"
                              style={S.kebabBtn}
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuKey((cur) =>
                                  cur === menuKey ? null : menuKey
                                );
                              }}
                              aria-label="More options"
                            >
                              <DotsIcon />
                            </button>

                            {openMenuKey === menuKey && (
                              <div style={S.kebabMenu}>
                                <button
                                  type="button"
                                  style={S.kebabItem}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await handleToggleSavedAi(r, key);
                                    setOpenMenuKey(null);
                                  }}
                                >
                                  {isSaved ? "Unsave" : "Save"}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {r.description && (
                          <p style={{ ...S.details, marginTop: 8 }}>
                            {r.description}
                          </p>
                        )}

                        {!!r.ingredients?.length && (
                          <>
                            <div style={S.subTitle}>Ingredients</div>
                            <ul>
                              {r.ingredients.map((x, idx) => {
                                if (typeof x === "string") {
                                  return <li key={idx}>{x}</li>;
                                }
                                const qty =
                                  (x?.quantity ?? "") !== ""
                                    ? `${x.quantity} `
                                    : "";
                                const unit = x?.unit ? `${x.unit} ` : "";
                                const name = x?.ingredient || "";
                                const prep = x?.prep ? `, ${x.prep}` : "";
                                const notes = x?.notes ? ` (${x.notes})` : "";
                                return (
                                  <li key={idx}>
                                    {`${qty}${unit}${name}${prep}${notes}`.trim()}
                                  </li>
                                );
                              })}
                            </ul>
                          </>
                        )}

                        {!!r.steps?.length && (
                          <>
                            <div style={S.subTitle}>Steps</div>
                            <ol>
                              {r.steps.map((x, idx) => (
                                <li key={idx}>{x}</li>
                              ))}
                            </ol>
                          </>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}
        {/* ========================================= */}

        <div style={S.list}>
          {loading && (
            <>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} style={{ ...S.skel, padding: 16 }}>
                  <div style={{ ...S.skelBar, width: "60%" }} />
                  <div style={{ height: 8 }} />
                  <div style={{ ...S.skelBar, width: "35%" }} />
                  <div style={{ height: 8 }} />
                  <div style={{ ...S.skelBar, width: "80%" }} />
                </div>
              ))}
            </>
          )}

          {!loading && dq && results.items.length === 0 && !err && (
            <div style={{ ...S.card, textAlign: "center" }}>No results. Try different keywords or filters.</div>
          )}

          {results.items.map((r) => {
            const isSaved = savedLocalIds.includes(r.id);
            const menuKey = `local:${r.id}`;

            return (
              <article key={r.id} style={S.rCard}>
                {/* top row: title/meta on the left, 3-dot menu on the right */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.title} onClick={() => openDetails(r.id)}>
                      {highlight(r.name, dq)}
                    </div>
                    <div style={S.meta}>
                      <span><ClockIcon /> {r.minutes}m</span>
                      {r.rating != null && <span>★ {r.rating}</span>}
                      {!!r.popularity && <span>❤ {r.popularity}</span>}
                      {r.cuisine && <span>{r.cuisine}</span>}
                      {r.diet && <span>{r.diet}</span>}
                      {isSaved && <span style={S.tag}>★ Saved</span>}
                    </div>
                  </div>

                  {/* 3-dot menu */}
                  <div style={S.kebabWrap}>
                    <button
                      type="button"
                      style={S.kebabBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuKey((cur) => (cur === menuKey ? null : menuKey));
                      }}
                      aria-label="More options"
                    >
                      <DotsIcon />
                    </button>

                    {openMenuKey === menuKey && (
                      <div style={S.kebabMenu}>
                        <button
                          type="button"
                          style={S.kebabItem}
                          onClick={async (e) => {
                            e.stopPropagation();
                            await handleToggleSavedLocal(r);
                            setOpenMenuKey(null);
                          }}
                        >
                          {isSaved ? "Unsave" : "Save"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                
                {!!r.ingredients?.length && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    {r.ingredients.slice(0, 12).map((ing) => (
                      <span key={ing} style={S.tag}>{ing}</span>
                    ))}
                  </div>
                )}

                {r.description && (
                  <p style={{ ...S.details, marginTop: 8 }}>
                    {highlight(r.description.slice(0, 240), dq)}
                    {r.description.length > 240 ? "…" : ""}
                  </p>
                )}

                <div style={S.actionRow}>
                  <button style={S.btn} onClick={() => openDetails(r.id)}>
                    {openId === r.id ? "Hide details" : "Show full ingredients & instructions"}
                  </button>
                  {!!r.ingredients?.length && (
                    <button
                      style={S.btn}
                      onClick={() => copy(r.ingredients.join("\n"))}
                      title="Copy ingredients to clipboard"
                    >
                      Copy ingredients
                    </button>
                  )}
                </div>

                {openId === r.id && (
                  <div style={S.drawer}>
                    {!detail || detail.id !== r.id ? (
                      <div style={{ color: "#64748b" }}>Loading details…</div>
                    ) : (
                      <>
                        {!!detail.ingredients?.length && (
                          <>
                            <div style={S.subTitle}>Ingredients</div>
                            <ul>
                              {detail.ingredients.map((x, i) => <li key={i}>{x}</li>)}
                            </ul>
                          </>
                        )}
                        {detail.steps && (
                          <>
                            <div style={S.subTitle}>Instructions</div>
                            <p style={S.details}>{detail.steps}</p>
                          </>
                        )}
                        <div style={S.actionRow}>
                          <button style={S.btn} onClick={() => window.print()}>Print</button>
                          <button
                            style={S.btn}
                            onClick={() => {
                              setOpenId(null);
                              setDetail(null);
                            }}
                          >
                            Close
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  </main>
);}

