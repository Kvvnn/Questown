export interface OpenAiServerConfig {
  apiKey?: string;
  model?: string;
  isConfigured: boolean;
}

export const getOpenAiServerConfig = (): OpenAiServerConfig => {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim();

  return {
    apiKey,
    model,
    isConfigured: Boolean(apiKey && model)
  };
};
