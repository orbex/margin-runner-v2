import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { config } from '../config.js';

export interface LLMProvider {
  chat(system: string, user: string, maxTokens?: number): Promise<string>;
}

class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: config.claude.apiKey });
  }

  async chat(system: string, user: string, maxTokens = 1024): Promise<string> {
    const message = await this.client.messages.create({
      model: config.llm.claudeModel,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    });
    return message.content[0].type === 'text' ? message.content[0].text : '';
  }
}

class OllamaProvider implements LLMProvider {
  async chat(system: string, user: string, maxTokens = 1024): Promise<string> {
    const response = await axios.post(
      `${config.llm.ollamaBaseUrl}/v1/chat/completions`,
      {
        model: config.llm.ollamaModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: maxTokens,
        stream: false,
      },
      { timeout: 60_000 }
    );
    return response.data?.choices?.[0]?.message?.content ?? '';
  }
}

let _provider: LLMProvider | null = null;

export function resetLLMProvider(): void {
  _provider = null;
}

export function getLLMProvider(): LLMProvider {
  if (_provider) return _provider;

  if (config.llm.provider === 'ollama') {
    console.log(`🤖 LLM: Ollama (${config.llm.ollamaBaseUrl} / ${config.llm.ollamaModel})`);
    _provider = new OllamaProvider();
  } else {
    console.log(`🤖 LLM: Claude (${config.llm.claudeModel})`);
    _provider = new AnthropicProvider();
  }

  return _provider;
}
