import React, { useEffect, useMemo, useRef, useState } from "react";
import "../css/pantry.css";
import { getPantry, addPantryItem, updatePantryItem, removePantryItem } from "../data/pantry";

const CATEGORIES = ["all", "produce", "dairy", "protein", "grain", "condiment", "snack","drink", "other"];

const EMOJI_MAP = {
  milk: "🥛",
  egg: "🥚",
  eggs: "🥚",
  bread: "🍞",
  rice: "🍚",
  pasta: "🍝",
  apple: "🍎",
  banana: "🍌",
  onion: "🧅",
  garlic: "🧄",
  tomato: "🍅",
  potato: "🥔",
  chicken: "🍗",
  beef: "🥩",
  pork: "🐖",
  lamb: "🐑",
  salad: "🥗",
  goat: "🐐",
  turkey: "🦃",
  duck: "🦆",
  fish: "🐠",
  tuna: "🐟",
  lobster: "🦞",
  crab: "🦀",
  squid: "🦑",
  octopus: "🐙",
  cheese: "🧀",
  lettuce: "🥬",
  carrot: "🥕",
  oil: "🫒",
  salt: "🧂",
  pepper: "🫙",
  sugar: "🧂",
  orange: "🍊",
  kiwi: "🥝",
  grapes: "🍇",
  strawberry: "🍓",
  blueberry: "🫐",
  watermelon: "🍉",
  pineapple: "🍍",
  cherries: "🍒",
  peas: "🫛",
  beans: "🫘",
  broccoli: "🥦",
  eggplant: "🍆",
  cucumber: "🥒",
  pizza: "🍕",
  bagel: "🥯",
  waffles: "🧇",
  bacon: "🥓",
  tacos: "🌮",
  butter: "🧈",
  "tomato sauce": "🥫",
  shrimp: "🍤",
  beer: "🍺",
  wine: "🍷",
  juice: "🧃",
  peanuts: "🥜",
  coffee: "☕",
  tea: "🍵",
  donut: "🍩",
  cookie: "🍪",
  cake: "🍰",
  "ice cream": "🍨",
  candy: "🍬",
  soup: "🍜",
  "red pepper": "🌶",
  "green pepper": "🫑",
  pop: "🥤",
  soda: "🥤",
  cereal: "🥣",
  popcorn: "🍿",
};

function inferCategory(name) {
  const n = name.toLowerCase();
  if (/(apple|banana|lettuce|spinach|tomato|onion|garlic|carrot|potato|peas|broccoli|eggplant|cucumber|red pepper|green pepper)/.test(n)) return "produce";
  if (/(milk|cheese|yogurt|butter|cream|ice cream|sour cream|margarine|mayonnaise)/.test(n)) return "dairy";
  if (/(chicken|beef|pork|fish|tofu|egg|eggs|duck|turkey|lamb|goat|tuna|lobster|crab|octopus|squid)/.test(n)) return "protein";
  if (/(rice|pasta|bread|tortilla|oat|cereal|flour)/.test(n)) return "grain";
  if (/(salt|pepper|sauce|ketchup|mustard|mayo|oil|vinegar|soy|sugar|tomatoe sauce)/.test(n)) return "condiment";
  if (/(chips|cookie|chocolate|candy|cracker|snack|popcorn|salsa|cake|donut)/.test(n)) return "snack";
  if (/(wine|beer|soda|juice|pop|milk)/.test(n)) return "drink";
  return "other";
}

function emojiFor(name) {
  const key = name.trim().toLowerCase();
  if (EMOJI_MAP[key]) return EMOJI_MAP[key];
  const match = Object.keys(EMOJI_MAP).find((k) => key.includes(k));
  return match ? EMOJI_MAP[match] : "🧺";
}

function parseQuickAdd(input) {
  const raw = input.trim();
  if (!raw) return null;
  const xForm = raw.replace(/\bx\s*(\d+(?:\.\d+)?)\b/i, "$1");
  const tokens = xForm.split(/\s+/);

  let qty;
  let unit;
  const nameTokens = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const num = Number(t);
    if (!isNaN(num) && qty === undefined) {
      qty = num;
      const maybeUnit = tokens[i + 1];
      if (maybeUnit && /^(g|kg|ml|l|lb|oz|cup|cups|tbsp|tsp|pc|pcs|ct)$/i.test(maybeUnit)) {
        unit = maybeUnit;
        i++;
      }
    } else {
      nameTokens.push(t);
    }
  }

  const name = nameTokens.join(" ").trim();
  if (!name) return { name: raw };
  return { name, qty, unit };
}

export default function PantryPro({ placeholder = "No items in pantry yet", onChange = () => {} }) {
  const inputRef = useRef(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("recent");
  const [busyId, setBusyId] = useState(null); 
  const [items, setItems] = useState([]);     

  // Initial load from Supabase
  useEffect(() => {
    (async () => {
      try {
        const rows = await getPantry();
        
        setItems(rows.map(r => ({
          ...r,
          qty: r.qty ?? 1, 
          category: inferCategory(r.name),
        })));
      } catch (e) {
        console.error("Failed to load pantry:", e);
      }
    })();
  }, []);

  
  useEffect(() => { onChange(items); }, [items, onChange]);

  async function addItem(raw) {
    const parsed = parseQuickAdd(raw);
    if (!parsed || !parsed.name) return;

    const name = parsed.name.trim();
    if (!name) return;

    
    if (items.some(it => it.name.toLowerCase() === name.toLowerCase())) {
      inputRef.current?.focus();
      return;
    }

    try {
      const created = await addPantryItem({ name, qty: parsed.qty ?? 1 });
      
      const withDerived = {
        ...created,
        qty: created.qty ?? (parsed.qty ?? 1),
        unit: parsed.unit,
        category: inferCategory(created.name),
      };
      setItems(prev => [withDerived, ...prev]);
      if (inputRef.current) inputRef.current.value = "";
      inputRef.current?.focus();
    } catch (e) {
      console.error("Add failed:", e);
      alert("Couldn't add item. Check your Supabase URL/key or table policies.");
    }
  }

  async function handleRemove(id) {
    try {
      setBusyId(id);
      await removePantryItem(id);
      setItems(prev => prev.filter(it => it.id !== id));
    } catch (e) {
      console.error("Remove failed:", e);
      alert("Couldn't remove item.");
    } finally {
      setBusyId(null);
    }
  }

  async function updateQty(id, delta) {
    const it = items.find(x => x.id === id);
    if (!it) return;
    const nextQty = Math.max(0, Number(it.qty ?? 1) + delta);

    
    setItems(prev => prev.map(x => x.id === id ? { ...x, qty: nextQty } : x));
    try {
      setBusyId(id);
      await updatePantryItem(id, { qty: nextQty });
    } catch (e) {
      console.error("Update qty failed:", e);
      
      setItems(prev => prev.map(x => x.id === id ? { ...x, qty: it.qty } : x));
      alert("Couldn't update quantity.");
    } finally {
      setBusyId(null);
    }
  }

  function setCustomImg(id) {
    const url = prompt("Paste an image URL for this item (https://...)")?.trim();
    if (!url) return;
    
    setItems(prev => prev.map(it => it.id === id ? { ...it, imgUrl: url } : it));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = items
      .map(it => ({ ...it, category: it.category ?? inferCategory(it.name) }))
      .filter(it =>
        (category === "all" || it.category === category) &&
        (q === "" || it.name.toLowerCase().includes(q))
      );

    if (sort === "az") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "za") list.sort((a, b) => b.name.localeCompare(a.name));
    
    return list;
  }, [items, search, category, sort]);

  return (
    <div className="pantry-shell">
      <header className="pantry-header">
        <div className="pantry-title">
          <span className="pantry-logo">🧺</span>
          <h1>Pantry</h1>
        </div>
        <div className="pantry-controls">
          <div className="input-with-icon">
            <input
              ref={inputRef}
              type="text"
              placeholder="Add item e.g. '2 milk' or 'rice 1 lb'"
              onKeyDown={(e) => {
                if (e.key === "Enter") addItem(e.target.value);
              }}
            />
            <button className="btn primary" onClick={() => addItem(inputRef.current?.value || "")}>Add</button>
          </div>

          <div className="filters">
            <input
              className="search"
              type="text"
              placeholder="Search pantry"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="recent">Recent first</option>
              <option value="az">A → Z</option>
              <option value="za">Z → A</option>
            </select>
          </div>
        </div>
      </header>

      <main className="pantry-grid">
        {filtered.length === 0 ? (
          <div className="empty">
            <IllustrationEmpty />
            <p>{items.length === 0 ? "No items in pantry yet" : "No items match your filters."}</p>
          </div>
        ) : (
          filtered.map((it) => (
            <article className="card" key={it.id}>
              <div className="card-media" onClick={() => setCustomImg(it.id)} title="Click to set a custom image">
                {it.imgUrl ? (
                  <img src={it.imgUrl} alt={it.name} />
                ) : (
                  <div className="emoji-avatar" aria-hidden>{emojiFor(it.name)}</div>
                )}
              </div>
              <div className="card-body">
                <div className="card-top">
                  <h3 className="card-title">{it.name}</h3>
                  <span className={`pill ${it.category}`}>{it.category}</span>
                </div>
                <div className="qty-row">
                  <button className="btn ghost" disabled={busyId === it.id} onClick={() => updateQty(it.id, -1)}>-</button>
                  <span className="qty">
                    {it.qty}{it.unit ? ` ${it.unit}` : ""}
                  </span>
                  <button className="btn ghost" disabled={busyId === it.id} onClick={() => updateQty(it.id, +1)}>+</button>
                </div>
              </div>
              <div className="card-actions">
                <button className="btn danger" disabled={busyId === it.id} onClick={() => handleRemove(it.id)} title="Remove">Remove</button>
              </div>
            </article>
          ))
        )}
      </main>

      <footer className="pantry-footer">
        <small>Tip: click an item image to add a custom photo URL. Quick-add supports quantities like “eggs x12”, “milk 2 L”, or just “tomato”.</small>
      </footer>
    </div>
  );
}

function IllustrationEmpty() {
  return (
    <svg width="120" height="80" viewBox="0 0 120 80" role="img" aria-label="Empty pantry">
      <defs>
        <linearGradient id="g" x1="0" x2="1">
          <stop offset="0" stopColor="#eef2ff" />
          <stop offset="1" stopColor="#e0e7ff" />
        </linearGradient>
      </defs>
      <rect x="0" y="10" width="120" height="60" rx="10" fill="url(#g)" />
      <rect x="12" y="20" width="96" height="40" rx="6" fill="#fff" stroke="#e5e7eb" />
      <circle cx="30" cy="40" r="10" fill="#f3f4f6" />
      <rect x="46" y="32" width="50" height="6" rx="3" fill="#e5e7eb" />
      <rect x="46" y="44" width="40" height="6" rx="3" fill="#e5e7eb" />
    </svg>
  );
}


