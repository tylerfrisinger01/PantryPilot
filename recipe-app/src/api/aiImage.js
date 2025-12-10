export async function generateAiImage({ name, ingredients }) {
  try {
    const res = await fetch("http://localhost:4000/api/ai-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, ingredients }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Failed to generate AI image");
    }

    const data = await res.json();
    return data.image_url || null;
  } catch (err) {
    console.error("generateAiImage error:", err);
    return null;
  }
}

