import { DEFAULT_SETTINGS, type Settings } from "./types";

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const settings = { ...DEFAULT_SETTINGS, ...stored } as Settings;
  const volume = Number(settings.speechVolume);
  return { ...settings, speechVolume: Number.isFinite(volume) ? Math.max(0, Math.min(100, volume)) : 100 };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.local.set(patch);
}
