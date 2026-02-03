import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { logger } from './utils/logger.js';

// Default config
const DEFAULT_CONFIG = {
    apiKey: '',
    webuiPassword: '',
    port: 8080,
    debug: false,
    logLevel: 'info',
    maxRetries: 5,
    retryBaseMs: 1000,
    retryMaxMs: 30000,
    persistTokenCache: false,
    defaultCooldownMs: 10000,  // 10 seconds
    maxWaitBeforeErrorMs: 120000, // 2 minutes
    respectApiRateLimit: false, // Respect API reset time instead of capping
    requestBodyLimit: '50mb',
    accountConfigPath: '', // Will be set to default path if empty
    modelMapping: {}
};

// Config locations
const HOME_DIR = os.homedir();
const CONFIG_DIR = path.join(HOME_DIR, '.config', 'antigravity-proxy');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Ensure config dir exists - use async version inside initialization
async function ensureConfigDir() {
    if (!existsSync(CONFIG_DIR)) {
        try {
            await mkdir(CONFIG_DIR, { recursive: true });
        } catch (err) {
            // Ignore
        }
    }
}

// Load config
let config = { ...DEFAULT_CONFIG };
let isLoaded = false;
let loadPromise = null;

export async function initializeConfig() {
    if (isLoaded) return config;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
        try {
            await ensureConfigDir();

            if (existsSync(CONFIG_FILE)) {
                const fileContent = await readFile(CONFIG_FILE, 'utf8');
                const userConfig = JSON.parse(fileContent);
                config = { ...DEFAULT_CONFIG, ...userConfig };
            } else {
                 // Try looking in current dir for config.json as fallback
                 const localConfigPath = path.resolve('config.json');
                 if (existsSync(localConfigPath)) {
                     const fileContent = await readFile(localConfigPath, 'utf8');
                     const userConfig = JSON.parse(fileContent);
                     config = { ...DEFAULT_CONFIG, ...userConfig };
                 }
            }

            // Environment overrides
            if (process.env.API_KEY) config.apiKey = process.env.API_KEY;
            if (process.env.WEBUI_PASSWORD) config.webuiPassword = process.env.WEBUI_PASSWORD;
            if (process.env.DEBUG !== undefined) config.debug = process.env.DEBUG === 'true';
            if (process.env.RESPECT_API_RATE_LIMIT !== undefined) config.respectApiRateLimit = process.env.RESPECT_API_RATE_LIMIT === 'true';

            isLoaded = true;
            return config;
        } catch (error) {
            console.error('[Config] Error loading config:', error);
            return config; // Return defaults on error
        } finally {
            loadPromise = null;
        }
    })();

    return loadPromise;
}

// Still support synchronous get for parts of the app that can't wait,
// but they should call initializeConfig() at startup.
export function getPublicConfig() {
    return { ...config };
}

export async function saveConfig(updates) {
    try {
        // Apply updates
        config = { ...config, ...updates };

        // Save to disk
        await ensureConfigDir();
        await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
        return true;
    } catch (error) {
        logger.error('[Config] Failed to save config:', error);
        return false;
    }
}

export { config };