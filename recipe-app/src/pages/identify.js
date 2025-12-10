import * as React from 'react';
import { useDropzone } from "react-dropzone";
import { useNavigate } from "react-router-dom";
import { addSavedAiSnapshot } from "../data/saved";

const API_KEY = process.env.REACT_APP_GEMINI_API_KEY;
const API_BASE =
  process.env.REACT_APP_API_BASE?.replace(/\/$/, "") ||
  "http://localhost:4000/api";

if (!API_KEY) {
  console.warn(
    "Missing REACT_APP_GEMINI_API_KEY. Identify page requests will fail until it is provided."
  );
}


function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Failed to read file"));
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.readAsDataURL(file);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Failed to read file"));
    r.onload = () => resolve(r.result);
    r.readAsDataURL(file);
  });
}

async function detectWithFetch(file) {
  const base64 = await fileToBase64(file);
  const mime = file.type || "image/jpeg";

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { inline_data: { data: base64, mime_type: mime } },
          {
            text:
              "Identify what food this is and return only the food name, be as specific as possible. For example include any sauces or specific ingredients that you can clearly identify. " +
              "If unsure, reply exactly: Upload the photo from a different angle and try again."
          }
        ]
      }
    ]
  };

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error?.message || "Gemini request failed");

  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || "")
      .join("")
      .trim() || "";

  return text || "No result";
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
    console.error("Failed to parse AI recipe payload:", err);
    return [];
  }
}

function sanitizeAiRecipePayload(recipe) {
  if (!recipe || typeof recipe !== "object") return null;
  const name = (recipe.name || "").trim() || "Generated Recipe";
  const description = (recipe.description || "").trim();
  const ingredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.filter(Boolean)
    : [];
  const steps = Array.isArray(recipe.steps)
    ? recipe.steps.filter(Boolean)
    : Array.isArray(recipe.instructions)
    ? recipe.instructions.filter(Boolean)
    : [];

  if (!ingredients.length || !steps.length) {
    return null;
  }

  return {
    name,
    description,
    ingredients,
    steps,
  };
}

async function fetchAiRecipe(foodName) {
  const prompt = `Create a detailed recipe for "${foodName}". 
Return a JSON object with this exact structure:
{
  "name": "Recipe name",
  "description": "Brief description of the dish",
  "ingredients": ["ingredient 1", "ingredient 2", ...],
  "steps": ["step 1", "step 2", ...]
}
Make the recipe practical, well-detailed, and suitable for home cooking.`;

  const res = await fetch(`${API_BASE}/ai-recipes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to generate recipe");
  }

  const data = await res.json();
  return data.text || "";
}

export default function Identify() {
  const navigate = useNavigate();
  const [status, setStatus] = React.useState("");
  const [previewUrl, setPreviewUrl] = React.useState("");
  const [uploadedFile, setUploadedFile] = React.useState(null);
  const [generatingRecipe, setGeneratingRecipe] = React.useState(false);
  const [recipeError, setRecipeError] = React.useState(null);

  const onDrop = React.useCallback(async (accepted) => {
    if (!accepted?.length) return;
    const file = accepted[0];
    setPreviewUrl(URL.createObjectURL(file));
    setUploadedFile(file);
    setStatus("Analyzing…");
    setRecipeError(null);
    try {
      const result = await detectWithFetch(file);
      setStatus(result);
    } catch (e) {
      console.error(e);
      setStatus("Failed to analyze image.");
    }
  }, []);

  const handleGenerateRecipe = React.useCallback(async () => {
    if (!status || status === "Analyzing…" || generatingRecipe) return;
    if (status === "Failed to analyze image." || status.includes("Upload the photo")) {
      setRecipeError("Please identify a valid food item first.");
      return;
    }
    if (!uploadedFile) {
      setRecipeError("Please upload an image first.");
      return;
    }

    setGeneratingRecipe(true);
    setRecipeError(null);

    try {
      // Generate recipe from identified food
      const text = await fetchAiRecipe(status);
      const [candidate] = parseAiRecipes(text);
      const sanitized = sanitizeAiRecipePayload(candidate);
      
      if (!sanitized) {
        throw new Error("Failed to generate a valid recipe. Please try again.");
      }

      // Convert uploaded file to data URL to use as the image
      const imageUrl = await fileToDataUrl(uploadedFile);

      // Save to saved recipes
      await addSavedAiSnapshot({
        ...sanitized,
        image_url: imageUrl,
      });

      // Navigate to saved page
      navigate("/saved");
    } catch (error) {
      console.error("Failed to generate recipe:", error);
      setRecipeError(error?.message || "Failed to generate recipe. Please try again.");
      setGeneratingRecipe(false);
    }
  }, [status, generatingRecipe, navigate, uploadedFile]);

  const { getRootProps, getInputProps, isDragActive, acceptedFiles } =
    useDropzone({
      onDrop,
      multiple: false,
      accept: {
        "image/jpeg": [".jpg", ".jpeg"],
        "image/png": [".png"]
      }
    });

  const isIdentified = status && 
    status !== "Analyzing…" && 
    status !== "Failed to analyze image." &&
    !status.includes("Upload the photo");
  const canGenerateRecipe = isIdentified && !generatingRecipe;

  return (
    <section className="container" style={{ maxWidth: 680, margin: "24px auto", padding: "0 16px" }}>
      <div
        {...getRootProps({ className: "dropzone" })}
        style={{
          border: `2px dashed ${isDragActive ? "#4f46e5" : "#cbd5e1"}`,
          padding: 32,
          borderRadius: 16,
          textAlign: "center",
          cursor: "pointer",
          background: isDragActive ? "#eef2ff" : "#ffffff",
          transition: "all 0.2s ease",
        }}
      >
        <input {...getInputProps()} />
        <p style={{ margin: "0 0 8px 0", fontSize: 16, color: "#1e293b", fontWeight: 500 }}>
          {isDragActive ? "Drop it here…" : "Drag & drop or click to select an image"}
        </p>
        <em style={{ fontSize: 13, color: "#64748b" }}>(*.jpeg or *.png)</em>
      </div>

      <aside style={{ marginTop: 24 }}>
        {acceptedFiles.length > 0 && (
          <div style={{ 
            marginBottom: 12, 
            fontSize: 13, 
            color: "#64748b",
            padding: "8px 12px",
            background: "#f8fafc",
            borderRadius: 8
          }}>
            {acceptedFiles[0].name} — {(acceptedFiles[0].size / 1024).toFixed(1)} KB
          </div>
        )}
        {previewUrl && (
          <div style={{ marginBottom: 16, textAlign: "center" }}>
            <img
              src={previewUrl}
              alt="preview"
              style={{ 
                maxWidth: "100%", 
                maxHeight: 300,
                borderRadius: 12, 
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
              }}
            />
          </div>
        )}
        {status && (
          <div style={{ 
            marginTop: 16,
            padding: 16,
            background: isIdentified ? "#ecfdf5" : "#fef2f2",
            border: `1px solid ${isIdentified ? "#bbf7d0" : "#fecaca"}`,
            borderRadius: 12
          }}>
            <p style={{ margin: 0, fontSize: 14, color: isIdentified ? "#15803d" : "#b91c1c" }}>
              <strong>Identified:</strong> {status}
            </p>
          </div>
        )}
        
        {isIdentified && (
          <div style={{ marginTop: 20, textAlign: "center" }}>
            <button
              type="button"
              onClick={handleGenerateRecipe}
              disabled={!canGenerateRecipe}
              style={{
                border: "none",
                borderRadius: 999,
                padding: "12px 24px",
                fontSize: 15,
                fontWeight: 600,
                background: canGenerateRecipe 
                  ? "linear-gradient(135deg, #4f46e5, #4338ca)" 
                  : "#cbd5e1",
                color: "#ffffff",
                cursor: canGenerateRecipe ? "pointer" : "not-allowed",
                boxShadow: canGenerateRecipe 
                  ? "0 4px 12px rgba(79,70,229,0.3)" 
                  : "none",
                transition: "all 0.2s ease",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
              onMouseEnter={(e) => {
                if (canGenerateRecipe) {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 6px 16px rgba(79,70,229,0.4)";
                }
              }}
              onMouseLeave={(e) => {
                if (canGenerateRecipe) {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(79,70,229,0.3)";
                }
              }}
            >
              {generatingRecipe ? (
                <>
                  <span style={{
                    width: 16,
                    height: 16,
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTop: "2px solid #ffffff",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite",
                    display: "inline-block"
                  }} />
                  Generating Recipe…
                </>
              ) : (
                <>
                  <span>✨</span>
                  Generate Recipe
                </>
              )}
            </button>
            {generatingRecipe && (
              <p style={{ 
                marginTop: 12, 
                fontSize: 13, 
                color: "#64748b",
                fontStyle: "italic"
              }}>
                Creating your recipe...
              </p>
            )}
          </div>
        )}

        {recipeError && (
          <div style={{
            marginTop: 16,
            padding: 12,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            color: "#b91c1c",
            fontSize: 13
          }}>
            {recipeError}
          </div>
        )}
      </aside>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </section>
  );
}


