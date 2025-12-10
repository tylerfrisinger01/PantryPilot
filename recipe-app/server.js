// server.js
const express = require('express');
const sqlite = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

// LangChain / OpenAI
const { ChatOpenAI } = require('@langchain/openai');
const { SystemMessage, HumanMessage } = require('@langchain/core/messages');

// Gemeni 
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require("@supabase/supabase-js");


const openAiApiKey = process.env.OPENAI_API_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!openAiApiKey) {
  console.warn("OPENAI_API_KEY is not set. OpenAI endpoints will fail.");
}

if (!geminiApiKey) {
  console.warn("GEMINI_API_KEY is not set. Gemini image generation will fail.");
}

const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);


const app = express();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'recipes.db');
const db = sqlite(DB_PATH, { readonly: true });

app.use(express.json());


app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---------------- AI Recipe Endpoint ----------------
const model = new ChatOpenAI({
  model: 'gpt-4.1',
  apiKey: openAiApiKey,
});

app.post('/api/ai-recipes', async (req, res) => {
  try {
    const { prompt, systemPrompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    const systemMsg = new SystemMessage(
      systemPrompt ||
        'You are a helpful assistant that creates recipes based on dietary preferences, description and ingredients. ' +
        'Return a JSON array of recipes with fields: name, description, ingredients (array of strings), steps (array of strings).'
    );
    const messages = [systemMsg, new HumanMessage(prompt)];
    const response = await model.invoke(messages);
    const text = response?.content ?? response?.text ?? '';
    res.json({ text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: String(error?.message || error) });
  }
});


app.post('/api/ai-search', async (req, res) => {
  try {
    const {
      q = '',
      diet = '',
      cuisine = '',
      ingredients = [],
      pantry = [],             
      systemPrompt,
      prompt
    } = req.body || {};

    
    const userPrompt = typeof prompt === 'string' && prompt
      ? prompt
      : (() => {
          const lines = [];
          if (diet) lines.push(`Diet: ${diet}`);
          if (cuisine) lines.push(`Cuisine: ${cuisine}`);
          if (Array.isArray(ingredients) && ingredients.length) lines.push(`User-required ingredients: ${ingredients.join(', ')}`);
          if (q) lines.push(`User query: ${q}`);
          return lines.length
            ? `Create exactly 3 recipes that satisfy ALL of the following:\n${lines.join('\n')}`
            : `No filters provided. Propose 3 popular recipes.`;
        })();

    const defaultSystemPrompt =
`You are a strict recipe generator.

CONTEXT:
- USER PANTRY (available for substitutions): ${JSON.stringify(pantry)}

OUTPUT FORMAT:
- Respond with a JSON ARRAY of EXACTLY 3 recipes.
- No markdown, no prose, no backticks—JSON only.
- If nothing was input, return no recipes.

EACH RECIPE OBJECT MUST HAVE:
{
  "name": string,
  "description": string,
  "servings": number,
  "total_time_minutes": number,
  "diet": string,
  "cuisine": string,
  "ingredients": [
    { "ingredient": string, "quantity": number, "unit": string, "prep": string|null, "notes": string|null } 
  ],
  "steps": [string],   
  "tags": [string]
}

CONSTRAINTS:
- Use ONLY user-provided ingredients if given. If something essential is missing, FIRST try to substitute using items in USER PANTRY above. If still missing, you may add minimal common staples (salt, pepper, water, neutral oil, garlic/onion, lemon/vinegar).
- Respect diet and cuisine strictly.
- Prefer consistent units; default to US units.
- If the user inputs just a recipe name, return recipes that are similar to that name.
- Always give measured quantities (estimate if needed). For “to taste” items, say the ingredient then say "To taste" and dont give a quantity of 0, and put "to taste" in notes.
- Steps must be actionable and detailed (temps, times, pans, doneness cues).

VALIDATION:
- Return JSON that parses. Exactly 3 recipes. No comments. No trailing commas.

EXAMPLE INGREDIENT ENTRY:
{ "ingredient": "broccoli florets", "quantity": 300, "unit": "g", "prep": "bite-size", "notes": null }`;

    const systemMsg = new SystemMessage(systemPrompt || defaultSystemPrompt);

    
    const pantryLine = pantry?.length
      ? `Pantry items available for substitution: ${pantry.join(', ')}`
      : 'Pantry items available for substitution: (none)';

    const messages = [systemMsg, new HumanMessage(`${pantryLine}\n\n${userPrompt}`)];

    const response = await model.invoke(messages);
    const text = response?.content ?? response?.text ?? '';
    res.json({ text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});


// ---------------- Saved Recipe Image Generation Endpoint ----------------
app.post("/api/saved-image", async (req, res) => {
  try {
    const { saved_id, name, ingredients } = req.body || {};
    if (!saved_id) {
      return res.status(400).json({ error: "saved_id required" });
    }

    const image = await generateRecipeImage({ name, ingredients });
    const url = await uploadSavedImageToSupabase({
      savedId: saved_id,
      image,
    });

    res.json({ image_url: url });
  } catch (err) {
    console.error("Error generating saved recipe image:", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

app.post("/api/ai-image", async (req, res) => {
  try {
    const { name, ingredients } = req.body || {};
    if (!name && !Array.isArray(ingredients)) {
      return res.status(400).json({ error: "name or ingredients required" });
    }

    const image = await generateRecipeImage({ name, ingredients });
    const mime = image?.mimeType || "image/jpeg";
    const dataUrl = `data:${mime};base64,${image?.data || ""}`;
    res.json({ image_url: dataUrl });
  } catch (err) {
    console.error("Error generating AI recipe image:", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});


// ---------------- Saved Recipe Image Generation helper functions ----------------
async function generateRecipeImage({ name, ingredients }) {
  if (!genAI) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  
  const ingredientList = Array.isArray(ingredients)
    ? ingredients
        .map((x) => {
          if (typeof x === "string") return x;
          const nm = x.ingredient || "";
          const qty = x.quantity ? `${x.quantity} ${x.unit || ""}` : "";
          return `${qty} ${nm}`.trim();
        })
        .filter(Boolean)
        .join(", ")
    : "";

  const prompt = `
    Generate a high-quality, realistic photo-style image of the FINAL cooked dish.

    Recipe name: "${name || "Unknown dish"}"
    Key ingredients: ${ingredientList || "not specified"}

    Requirements:
    - Show a single plated serving of the finished dish.
    - Neutral, soft background (no text, no logos, no hands).
    - Bright, appetizing lighting.
    - No text overlays or watermarks.
    `;

  const MAX_RETRIES = 3;
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-image", 
        generationConfig: {
          responseModalities: ["IMAGE"], // only image back
        },
      });

      const response = await model.generateContent(prompt);
      console.log(`Gemini image response (attempt ${attempt + 1}/${MAX_RETRIES}):`, response.response);
      const parts =
        response?.response?.candidates?.[0]?.content?.parts || []; 

      const imagePart = parts.find((p) => p.inlineData);

      if (!imagePart || !imagePart.inlineData?.data) {
        if (attempt < MAX_RETRIES - 1) {
          console.log(`No image data returned, retrying... (attempt ${attempt + 1}/${MAX_RETRIES})`);
          // Wait a bit before retrying 
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
        throw new Error("No image data returned from Gemini after 3 attempts");
      }

      
      return imagePart.inlineData; 
    } catch (error) {
      // If it's the "No image data" error and we have retries left, continue the loop
      if (error.message.includes("No image data") && attempt < MAX_RETRIES - 1) {
        console.log(`Image generation failed, retrying... (attempt ${attempt + 1}/${MAX_RETRIES}):`, error.message);
        // Wait a bit before retrying 
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      // If it's a different error or we're out of retries, throw it
      throw error;
    }
  }
  
  // This should never be reached, but just in case
  throw new Error("Failed to generate image after all retry attempts");
}


async function uploadSavedImageToSupabase({ savedId, image }) {
  const buffer = Buffer.from(image.data, "base64");
  const ext = image.mimeType === "image/png" ? "png" : "jpg";
  const path = `saved/${savedId}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("recipe-images")
    .upload(path, buffer, {
      contentType: image.mimeType || "image/jpeg",
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from("recipe-images").getPublicUrl(path);

  // update the favorites row
  const { error: updateError } = await supabase
    .from("favorites")
    .update({ image_url: publicUrl })
    .eq("id", savedId);

  if (updateError) throw updateError;

  return publicUrl;
}





// ---------------- Existing endpoints ----------------
app.get('/api/health', (req, res) => {
  try {
    const row = db.prepare('SELECT 1 AS ok').get();
    res.json({ ok: !!row, db: DB_PATH });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});


function buildFtsWhere(q) {
  if (!q) return { where: '1=1', params: {} };
  const words = q.trim().split(/\s+/).slice(0, 6).map(w => w.replace(/"/g, ''));
  const matchExpr = words.length ? words.map(w => `"${w}"`).join(' NEAR ') : '';
  return { where: 'recipes_fts MATCH :match', params: { match: matchExpr } };
}


function orderClause(sort) {
  switch ((sort || '').toLowerCase()) {
    case 'rating':       return 'ORDER BY r.rating DESC';
    case 'minutes-asc':  return 'ORDER BY r.minutes ASC';
    case 'minutes-desc': return 'ORDER BY r.minutes DESC';
    case 'popularity':   return 'ORDER BY r.popularity DESC';
    default:             return 'ORDER BY score ASC';
  }
}

app.get('/api/search', (req, res) => {
  try {
    const q          = String(req.query.q || '').trim();
    const cuisine    = String(req.query.cuisine || '').trim();
    const diet       = String(req.query.diet || '').trim();
    const minRating  = Number(req.query.min_rating || 0);
    const maxMinutes = Number(req.query.max_minutes || 0);
    const page       = Math.max(1, Number(req.query.page || 1));
    const pageSize   = Math.min(50, Math.max(1, Number(req.query.page_size || 20)));
    const sort       = String(req.query.sort || 'relevance');

    const { where, params } = buildFtsWhere(q);

    const filters = [];
    if (cuisine)    filters.push('r.cuisine = :cuisine');
    if (diet)       filters.push('r.diet = :diet');
    if (minRating)  filters.push('r.rating >= :minRating');
    if (maxMinutes) filters.push('r.minutes <= :maxMinutes');

    const fullWhere = [where, ...filters].join(' AND ');

    const sql = `
      SELECT
        r.id,
        r.name            AS name,
        r.minutes         AS minutes,
        r.rating          AS rating,
        r.popularity      AS popularity,
        r.cuisine         AS cuisine,
        r.diet            AS diet,
        r.description     AS description,
        r.steps           AS steps,
        json_extract(r.ingredients, '$') AS ingredients,
        bm25(recipes_fts, 1.5, 1.2, 1.1, 1.3, 0.5, 0.8, 0.6) AS score
      FROM recipes_fts
      JOIN recipes AS r ON recipes_fts.rowid = r.id
      WHERE ${fullWhere}
      ${orderClause(sort)}
      LIMIT :limit OFFSET :offset;
    `;

    const items = db.prepare(sql).all({
      ...params,
      cuisine,
      diet,
      minRating,
      maxMinutes,
      limit: pageSize,
      offset: (page - 1) * pageSize
    });

    const total = db.prepare(`
      SELECT COUNT(*) AS c
      FROM recipes_fts
      JOIN recipes AS r ON recipes_fts.rowid = r.id
      WHERE ${fullWhere}
    `).get({
      ...params,
      cuisine,
      diet,
      minRating,
      maxMinutes
    }).c;

    res.json({
      page,
      page_size: pageSize,
      total,
      pages: Math.ceil(total / pageSize),
      items: items.map(r => ({
        ...r,
        ingredients: JSON.parse(r.ingredients || '[]')
      }))
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get('/api/recipes/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });

  const row = db.prepare(`
    SELECT
      r.id,
      r.name,
      r.minutes,
      r.rating,
      r.popularity,
      r.cuisine,
      r.diet,
      r.description,
      r.steps,
      json_extract(r.ingredients, '$') AS ingredients,
      json_extract(r.nutrition,  '$') AS nutrition,
      r.n_ingredients,
      r.n_steps,
      r.submitted
    FROM recipes AS r
    WHERE r.id = ?;
  `).get(id);

  if (!row) return res.status(404).json({ error: 'Not found' });

  row.ingredients = JSON.parse(row.ingredients || '[]');
  row.nutrition  = JSON.parse(row.nutrition  || '[]');

  res.json(row);
});

app.get('/api/facets', (req, res) => {
  const cuisines = db.prepare(`
    SELECT r.cuisine AS name, COUNT(*) AS count
    FROM recipes r
    WHERE r.cuisine IS NOT NULL AND r.cuisine <> ''
    GROUP BY r.cuisine
    ORDER BY count DESC
    LIMIT 40;
  `).all();

  const diets = db.prepare(`
    SELECT r.diet AS name, COUNT(*) AS count
    FROM recipes r
    WHERE r.diet IS NOT NULL AND r.diet <> ''
    GROUP BY r.diet
    ORDER BY count DESC
    LIMIT 20;
  `).all();

  res.json({ cuisines, diets });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () =>
  console.log(`API on http://localhost:${PORT} (DB: ${DB_PATH})`)
);
