import fs from 'fs';
import os from 'os';
import path from 'path';
import { AIProviderId, ConfiguredModel } from './types.js';

export interface PersistedProviderData {
  keys: Partial<Record<AIProviderId, string>>;
  selectedModels: Partial<Record<AIProviderId, string>>;
  configuredModels?: Partial<Record<AIProviderId, ConfiguredModel[]>>;
  activeSelection?: {
    provider: AIProviderId;
    model: string;
  };
  globalParams?: {
    temperature: number;
    maxTokens: number;
    streaming: boolean;
  };
}

const DATA_DIR = process.env.VERCEL
  ? path.join(os.tmpdir(), '.sanmine_data')
  : path.join(process.cwd(), '.data');
const STORAGE_FILE = path.join(DATA_DIR, 'provider_credentials.json');

/**
 * Ensures the data directory exists.
 */
function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    // Non-fatal, will log warning if writing fails
  }
}

/**
 * Loads persisted provider keys and settings from server storage.
 */
export function loadPersistedData(): PersistedProviderData {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        return {
          keys: parsed.keys || {},
          selectedModels: parsed.selectedModels || {},
          configuredModels: parsed.configuredModels || {},
          activeSelection: parsed.activeSelection,
          globalParams: parsed.globalParams,
        };
      }
    }
  } catch (err) {
    // If parse fails or file is empty, return empty structure safely
  }

  return {
    keys: {},
    selectedModels: {},
    configuredModels: {},
  };
}

/**
 * Saves provider data to server storage safely without exposing to client.
 */
export function savePersistedData(data: PersistedProviderData): boolean {
  try {
    ensureDataDir();
    const payload = {
      keys: data.keys || {},
      selectedModels: data.selectedModels || {},
      configuredModels: data.configuredModels || {},
      activeSelection: data.activeSelection,
      globalParams: data.globalParams,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.warn('[Storage] Failed to save provider credentials to server storage:', err);
    return false;
  }
}
