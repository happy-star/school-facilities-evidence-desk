export type ModelServiceStatus = {
  state: "unavailable";
  reason: string;
};

/**
 * This build never calls a model provider, even if a key or endpoint is present.
 * AgentFoundry is not connected here.
 */
export function modelServiceStatus(): ModelServiceStatus {
  const configured = Boolean(
    process.env.AGENT_NL_ENDPOINT ||
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.AZURE_OPENAI_API_KEY,
  );
  if (configured) {
    return {
      state: "unavailable",
      reason:
        "A model environment variable is present, but this build does not call a provider and does not spend a key. The desk stays on the deterministic baseline until a reviewed AgentFoundry workflow is connected.",
    };
  }
  return {
    state: "unavailable",
    reason:
      "No natural-language model service is configured. No provider request is made. Answers from the question box are the deterministic baseline, not model output, and were not generated in AgentFoundry.",
  };
}
