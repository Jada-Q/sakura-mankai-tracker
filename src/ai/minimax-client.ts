import OpenAI from "openai";

let client: OpenAI | null = null;

export function getMiniMaxClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      throw new Error("MINIMAX_API_KEY is not set");
    }
    client = new OpenAI({
      apiKey,
      baseURL: "https://api.minimax.io/v1",
    });
  }
  return client;
}
