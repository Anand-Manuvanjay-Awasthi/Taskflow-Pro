import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

/**
 * Lazily constructs the Anthropic client from ANTHROPIC_API_KEY. Never
 * called from the browser — this module only ever runs on the server.
 * Throws a clear error if the key is missing rather than silently no-opting,
 * so misconfiguration is obvious in development.
 */
export function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add a key.");
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
