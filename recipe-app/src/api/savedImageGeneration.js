export async function generateSavedImage(savedId, name, ingredients) {
  try {
    const res = await fetch("http://localhost:4000/api/saved-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saved_id: savedId, name, ingredients }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Failed to generate image");
    }

    const json = await res.json();
    return json.image_url;
  } catch (err) {
    console.error("generateSavedImage error:", err);
    return null;
  }
}