import type { PluginStorage } from '../../../sdk/types';

export interface ThemeHostAdapter {
  setActiveTheme(themeKey: string | null): void;
  getActiveThemeKey?(): string | null;
}

const THEME_PREF_STORAGE_KEY = 'selectedThemeKey';

/**
 * Resolves the `<mplay3r-app>` host plugin theme switcher without interrupting audio playback.
 */
export async function resolveHostThemeAdapter(playerTarget: string): Promise<ThemeHostAdapter | null> {
  if (typeof document === 'undefined' || !playerTarget) return null;
  const el = document.querySelector(playerTarget) as
    | (HTMLElement & {
        getPluginHost?: () => Promise<{
          setActiveTheme(key: string | null): void;
          getActiveTheme?: () => { key: string } | null;
        }>;
      })
    | null;
  if (!el || typeof el.getPluginHost !== 'function') return null;
  const host = await el.getPluginHost();
  return {
    setActiveTheme: key => host.setActiveTheme(key),
    getActiveThemeKey: () => host.getActiveTheme?.()?.key ?? null,
  };
}

/**
 * Manages hot-switching between Minimal, Winamp Classic 2.x, Hi-Fi Rack, or any registered
 * structural theme while keeping playback uninterrupted and persisting the user's choice.
 */
export class ThemeSwitchController {
  private readonly storage: PluginStorage;
  private readonly getAdapter: () => Promise<ThemeHostAdapter | null>;
  private activeKey: string | null = null;

  constructor(storage: PluginStorage, getAdapter: () => Promise<ThemeHostAdapter | null>) {
    this.storage = storage;
    this.getAdapter = getAdapter;
  }

  getActiveThemeKey(): string | null {
    return this.activeKey;
  }

  async load(): Promise<string | null> {
    const saved = await this.storage.get<string | null>(THEME_PREF_STORAGE_KEY);
    this.activeKey = typeof saved === 'string' && saved.trim() ? saved : null;
    if (this.activeKey) {
      const adapter = await this.getAdapter();
      adapter?.setActiveTheme(this.activeKey);
    }
    return this.activeKey;
  }

  /** Switches themes hot in-place (DOM swap only — zero audio interruption). */
  async switchTo(themeKey: string | null): Promise<string | null> {
    const normalized = themeKey && themeKey.trim() ? themeKey.trim() : null;
    this.activeKey = normalized;
    const adapter = await this.getAdapter();
    adapter?.setActiveTheme(normalized);
    await this.storage.set(THEME_PREF_STORAGE_KEY, normalized);
    return normalized;
  }
}
