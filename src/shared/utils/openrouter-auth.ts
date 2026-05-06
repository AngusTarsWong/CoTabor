import { ModelInfo } from '../types/openrouter.ts';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export async function loginWithOpenRouter(): Promise<string> {
  const codeVerifier = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashBase64 = btoa(String.fromCharCode.apply(null, hashArray as unknown as number[]))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl = new URL('https://openrouter.ai/auth');
  authUrl.searchParams.append('callback_url', redirectUri);
  authUrl.searchParams.append('code_challenge', hashBase64);
  authUrl.searchParams.append('code_challenge_method', 'S256');

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      {
        url: authUrl.toString(),
        interactive: true,
      },
      async (redirectUrl) => {
        if (chrome.runtime.lastError || !redirectUrl) {
          return reject(new Error(chrome.runtime.lastError?.message || 'Authorization cancelled or failed.'));
        }

        const urlParams = new URL(redirectUrl).searchParams;
        const oauthError = urlParams.get('error');
        if (oauthError) {
          const description = urlParams.get('error_description') || oauthError;
          return reject(new Error(`OpenRouter authorization failed: ${description}`));
        }
        const authCode = urlParams.get('code');

        if (!authCode) {
          return reject(new Error('No auth code found in redirect URL.'));
        }

        try {
          const response = await fetch(`${OPENROUTER_BASE_URL}/auth/keys`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              code: authCode,
              code_verifier: codeVerifier,
            }),
          });

          if (!response.ok) {
            throw new Error(`Failed to exchange code: ${response.statusText}`);
          }

          const data = await response.json();
          if (data && data.key) {
            resolve(data.key);
          } else {
            reject(new Error('API key not found in the response.'));
          }
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

export async function fetchOpenRouterModels(): Promise<ModelInfo[]> {
  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/models?supported_parameters=tools&output_modalities=text`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const { data } = await response.json();
    return data.map((model: any) => ({
      id: model.id,
      name: model.name,
      description: model.description,
      contextLength: model.context_length,
      pricing: model.pricing,
      architecture: model.architecture,
    }));
  } catch (error) {
    console.error('Failed to fetch OpenRouter models:', error);
    return [];
  }
}
