/**
 * Phase 17-B — OpenRouter provider adapter (boundary).
 *
 * This module is the ONLY place OpenRouter-specific request/response/error mapping lives.
 * The rest of the AI core depends only on the canonical AIProvider / AIRequest / AIResponse /
 * AIProviderError contracts. Provider detail is normalized here and never escapes.
 *
 * Runtime approach: `@openrouter/sdk@1.2.17` is declared in the root `package.json` but is NOT
 * imported here. This adapter issues a direct HTTPS request to the documented OpenRouter
 * chat-completions HTTP API using the runtime-global `fetch` (Node >= 18), keeping the
 * adapter dependency-free and the provider-agnostic core boundary clean. The SDK is
 * deliberately avoided to keep the integration narrow, transparent, and free of any
 * provider-specific types leaking into the core.
 *
 * The API key and model come ONLY from server-side configuration (process.env via the
 * factory), never from the client and never hardcoded. Secrets are never logged and never
 * returned in error messages — errors are normalized into the canonical AIProviderError
 * contract by `classifyOpenRouterError`.
 *
 * Timeout and bounded retry are owned by `AIGateway` (not duplicated here). Only retryable
 * categories are surfaced so the gateway can retry; a network-level failure is mapped to
 * PROVIDER_UNAVAILABLE so the gateway treats it consistently.
 */

import { AIProvider, AIProviderError } from './provider';
import { AIProviderErrorInfo, AIRequest, AIResponse, AIUsage } from './types';

export interface OpenRouterProviderOptions {
  apiKey: string;
  model: string;
  /** Optional endpoint override (primarily for testing); defaults to OPENROUTER_CHAT_URL. */
  baseUrl?: string;
}

export const OPENROUTER_PROVIDER = 'openrouter';

/**
 * OpenRouter chat-completions HTTP endpoint (documented public API).
 * Defaults to the live endpoint; `OpenRouterProviderOptions.baseUrl` may override
 * it (primarily for testing).
 */
export const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
/** App-level identity sent in OpenRouter's required headers (not a secret). */
const OPENROUTER_DEFAULT_REFERER = 'https://crm.radharealhomeproperties.com';
const OPENROUTER_APP_TITLE = 'RRH-CRMS AI Search';

/** Build the provider-specific chat-completion request from a canonical AIRequest (pure). */
export function buildOpenRouterBody(request: AIRequest, model: string): Record<string, unknown> {
  return {
    model,
    messages: request.messages,
    temperature: request.temperature ?? 0,
    max_tokens: request.maxTokens,
    // Strongest structured-output hint where supported. Provider-led JSON extraction.
    response_format: { type: 'json_object' },
  };
}

/** Normalize a raw provider chat-completion response into a canonical AIResponse (pure). */
export function parseOpenRouterResponse(
  body: any,
  request: AIRequest,
  provider: string,
): AIResponse {
  const b = body as any;
  const choice = (b && b.choices && b.choices[0]) || {};
  const message = choice.message || {};

  const content =
    typeof message.content === 'string'
      ? message.content
      : typeof choice.text === 'string'
        ? choice.text
        : '';

  if (!content) {
    throw new AIProviderError({
      category: 'INVALID_PROVIDER_RESPONSE',
      message: 'OpenRouter returned an empty response.',
      retryable: false,
      provider,
    });
  }

  const usageRaw = b && b.usage;
  const usage: AIUsage | null =
    usageRaw && typeof usageRaw === 'object'
      ? {
          provider,
          model: String(b.model || request.model || provider),
          inputTokens: Number(usageRaw.prompt_tokens ?? 0),
          outputTokens: Number(usageRaw.completion_tokens ?? 0),
          totalTokens: Number(usageRaw.total_tokens ?? 0),
        }
      : null;

  return {
    content,
    model: String(b.model || request.model || provider),
    usage,
    metadata: request.metadata,
  };
}

function looksLikeQuota(err: any): boolean {
  const msg = String(err?.message || '');
  return /insufficient.quota|quota|out.?of.?credit|402/i.test(msg);
}

/** Normalize a provider failure into the canonical error model (pure). */
export function classifyOpenRouterError(err: any, provider: string): AIProviderErrorInfo {
  const status = Number(err?.status ?? err?.statusCode ?? err?.response?.status ?? 0);

  if (status === 429) {
    return {
      category: 'RATE_LIMITED',
      message: 'OpenRouter rate limited',
      retryable: true,
      provider,
    };
  }
  if (status === 402 || looksLikeQuota(err)) {
    return {
      category: 'QUOTA_EXCEEDED',
      message: 'OpenRouter quota exceeded',
      retryable: false,
      provider,
    };
  }
  if (status === 401 || status === 403) {
    return {
      category: 'CONFIGURATION_ERROR',
      message: 'OpenRouter authentication/authorization failed',
      retryable: false,
      provider,
    };
  }
  if (status === 408) {
    return { category: 'TIMEOUT', message: 'OpenRouter timed out', retryable: true, provider };
  }
  if (status >= 500 || status === 502 || status === 503 || status === 504) {
    return {
      category: 'PROVIDER_UNAVAILABLE',
      message: 'OpenRouter unavailable',
      retryable: true,
      provider,
    };
  }
  return {
    category: 'UNKNOWN_PROVIDER_ERROR',
    message: 'OpenRouter error',
    retryable: false,
    provider,
  };
}

/**
 * OpenRouter provider adapter. Issues a direct HTTPS chat-completions request via the
 * runtime-global `fetch` to the documented OpenRouter HTTP API. The provider abstraction,
 * timeout, retry, and error normalization remain owned by the core/AIProvider contract and
 * AIGateway.
 */
export class OpenRouterProvider implements AIProvider {
  readonly capabilities = {
    provider: OPENROUTER_PROVIDER,
    supportsStreaming: false,
    maxOutputTokens: 8192,
    supportsUsage: true,
  } as const;

  constructor(private readonly options: OpenRouterProviderOptions) {}

  async generate(request: AIRequest): Promise<AIResponse> {
    const url = this.options.baseUrl ?? OPENROUTER_CHAT_URL;
    const body = buildOpenRouterBody(request, this.options.model);

    // AbortController-based timeout — prevents dangling fetch promises if OpenRouter
    // hangs indefinitely. Also enforced by AIGateway.withTimeout (30s default).
    const abortController = new AbortController();
    const timeoutMs = 30_000; // matches AIConfig.default timeoutMs
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': OPENROUTER_DEFAULT_REFERER,
          'X-Title': OPENROUTER_APP_TITLE,
        },
        body: JSON.stringify(body),
        signal: abortController.signal,
      }).catch((err) => {
        // Normalize immediately — the raw network error must never escape the provider
        // boundary. Distinguish abort (timeout) from other network failures.
        const info: AIProviderErrorInfo =
          err.name === 'AbortError'
            ? {
                category: 'TIMEOUT',
                message: 'OpenRouter request timed out.',
                retryable: true,
                provider: OPENROUTER_PROVIDER,
              }
            : {
                category: 'PROVIDER_UNAVAILABLE',
                message: 'OpenRouter request could not be completed (network error).',
                retryable: true,
                provider: OPENROUTER_PROVIDER,
              };
        throw new AIProviderError(info);
      });

      if (!response.ok) {
        let errBody: { error?: { message?: string } } = {};
        try {
          errBody = (await response.json()) as typeof errBody;
        } catch {
          /* non-JSON error body — fall back to status text */
        }
        throw new AIProviderError(
          classifyOpenRouterError(
            { status: response.status, message: errBody?.error?.message ?? response.statusText },
            OPENROUTER_PROVIDER,
          ),
        );
      }

      const data = await response.json();
      return parseOpenRouterResponse(data, request, OPENROUTER_PROVIDER);
    } finally {
      // Always clear the timeout so the abort timer never leaks as an open handle.
      clearTimeout(timeoutId);
    }
  }
}
