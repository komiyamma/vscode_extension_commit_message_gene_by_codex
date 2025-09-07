export interface ProviderConfig {
  commandId: string;
  binaryName: string;
  messages: {
    runError: (msg: string, locale: 'ja' | 'en') => string;
    closed: (code: number | null, locale: 'ja' | 'en') => string;
  };
}

// Project-specific provider configuration (codex variant in this repo)
export const provider: ProviderConfig = {
  commandId: 'commit-message-gene-by-codex.runCodexCmd',
  binaryName: 'codex_proxy.exe',
  messages: {
    runError: (msg, locale) =>
      locale === 'ja'
        ? `[codex_proxy.exe 実行エラー]: ${msg}`
        : `[codex_proxy.exe run error]: ${msg}`,
    closed: (code, locale) =>
      locale === 'ja'
        ? `\n[codex_proxy.exe 終了: code ${code}]`
        : `\n[codex_proxy.exe exited: code ${code}]`,
  },
};

