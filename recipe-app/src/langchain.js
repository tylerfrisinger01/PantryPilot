import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "langchain";

const openAiApiKey = process.env.REACT_APP_OPENAI_API_KEY;

if (!openAiApiKey) {
  console.warn(
    "Missing REACT_APP_OPENAI_API_KEY. LangChain calls will fail until it is provided."
  );
}

// Configure your OpenAI model
const model = new ChatOpenAI({
  model: "gpt-4.1",
  apiKey: openAiApiKey,
});

/**
 * Get AI response from LangChain LLM
 * @param {string} userPrompt - The prompt from the user
 * @param {string|SystemMessage} systemPrompt - Optional system prompt
 * @returns {Promise<string>} - AI output text
 */
async function getAiResponse(userPrompt, systemPrompt = null) { // for home page
  try {
    // If systemPrompt is a string, wrap in SystemMessage
    const systemMsg = typeof systemPrompt === "string"
      ? new SystemMessage(systemPrompt)
      : systemPrompt;

    const messages = [
      systemMsg || new SystemMessage(
        "You are a helpful assistant that creates recipes based on dietary preferences and ingredients given. " +
        "Return a JSON array of recipes with name, description, ingredients, and steps."
      ),
      new HumanMessage(userPrompt),
    ];

    const response = await model.invoke(messages);
    // LangChain returns an object with text
    return response.text ?? response;
  } catch (error) {
    console.error("Error invoking model:", error);
    return "";
  }
}


async function generateSearchResponse(userPrompt, systemPrompt = null) { // for search page
  try {
    // If systemPrompt is a string, wrap in SystemMessage
    const systemMsg = typeof systemPrompt === "string"
      ? new SystemMessage(systemPrompt)
      : systemPrompt;

    const messages = [
      systemMsg || new SystemMessage(
        "You are a helpful assistant that helps create recipes based on their dietary preferences." +
        "and only using ingredients that they give you. If no ingredients or dietary preferences are given, you should should return a list of recipes" +
        "that are similar to the recipe name they entered. If no recipes can be created, you should say that no recipes can be created and return a list of recipes that" +
        "are similar to what they asked for."
      ),
      new HumanMessage(userPrompt),
    ];

    const response = await model.invoke(messages);
    
    return response.text ?? response;
  } catch (error) {
    console.error("Error invoking model:", error);
    return "";
  }
}


export { generateSearchResponse };
export { getAiResponse };
