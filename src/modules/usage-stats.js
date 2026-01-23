import { readFile, writeFile, mkdir, copyFile, access } from 'fs/promises';
import { existsSync, constants as fsConstants } from 'fs';
import path from 'path';

import { USAGE_HISTORY_PATH } from '../constants.js';

// Persistence path
const HISTORY_FILE = USAGE_HISTORY_PATH;
const DATA_DIR = path.dirname(HISTORY_FILE);
const OLD_DATA_DIR = path.join(process.cwd(), 'data');
const OLD_HISTORY_FILE = path.join(OLD_DATA_DIR, 'usage-history.json');

// In-memory storage
// Structure: { "YYYY-MM-DDTHH:00:00.000Z": { "claude": { "model-name": count, "_subtotal": count }, "_total": count } }
let history = {};
let isDirty = false;
let isSaving = false;

/**
 * Extract model family from model ID
 * @param {string} modelId - The model identifier (e.g., "claude-opus-4-5-thinking")
 * @returns {string} The family name (claude, gemini, or other)
 */
function getFamily(modelId) {
    const lower = (modelId || '').toLowerCase();
    if (lower.includes('claude')) return 'claude';
    if (lower.includes('gemini')) return 'gemini';
    return 'other';
}

/**
 * Extract short model name (without family prefix)
 * @param {string} modelId - The model identifier
 * @param {string} family - The model family
 * @returns {string} Short model name
 */
function getShortName(modelId, family) {
    if (family === 'other') return modelId;
    // Remove family prefix (e.g., "claude-opus-4-5" -> "opus-4-5")
    return modelId.replace(new RegExp(`^${family}-`, 'i'), '');
}

/**
 * Helper to check if file exists using async access
 */
async function fileExists(path) {
    try {
        await access(path, fsConstants.F_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * Ensure data directory exists and load history.
 * Includes migration from legacy local data directory.
 */
async function load() {
    try {
        // Migration logic: if old file exists and new one doesn't
        if (await fileExists(OLD_HISTORY_FILE) && !(await fileExists(HISTORY_FILE))) {
            console.log('[UsageStats] Migrating legacy usage data...');
            if (!(await fileExists(DATA_DIR))) {
                await mkdir(DATA_DIR, { recursive: true });
            }
            await copyFile(OLD_HISTORY_FILE, HISTORY_FILE);
            // We keep the old file for safety initially, but could delete it
            console.log(`[UsageStats] Migration complete: ${OLD_HISTORY_FILE} -> ${HISTORY_FILE}`);
        }

        if (!(await fileExists(DATA_DIR))) {
            await mkdir(DATA_DIR, { recursive: true });
        }
        if (await fileExists(HISTORY_FILE)) {
            const data = await readFile(HISTORY_FILE, 'utf8');
            history = JSON.parse(data);
        }
    } catch (err) {
        console.error('[UsageStats] Failed to load history:', err);
        history = {};
    }
}

/**
 * Save history to disk
 */
async function save() {
    if (!isDirty || isSaving) return;

    isSaving = true;
    try {
        await writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
        isDirty = false;
    } catch (err) {
        console.error('[UsageStats] Failed to save history:', err);
    } finally {
        isSaving = false;
    }
}

/**
 * Prune old data (keep last 30 days)
 */
function prune() {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let pruned = false;
    Object.keys(history).forEach(key => {
        if (new Date(key) < cutoff) {
            delete history[key];
            pruned = true;
        }
    });

    if (pruned) isDirty = true;
}

/**
 * Track a request by model ID using hierarchical structure
 * @param {string} modelId - The specific model identifier
 */
function track(modelId) {
    const now = new Date();
    // Round down to nearest hour
    now.setMinutes(0, 0, 0);
    const key = now.toISOString();

    if (!history[key]) {
        history[key] = { _total: 0 };
    }

    const hourData = history[key];
    const family = getFamily(modelId);
    const shortName = getShortName(modelId, family);

    // Initialize family object if needed
    if (!hourData[family]) {
        hourData[family] = { _subtotal: 0 };
    }

    // Increment model-specific count
    hourData[family][shortName] = (hourData[family][shortName] || 0) + 1;

    // Increment family subtotal
    hourData[family]._subtotal = (hourData[family]._subtotal || 0) + 1;

    // Increment global total
    hourData._total = (hourData._total || 0) + 1;

    isDirty = true;
}

/**
 * Setup Express Middleware
 * @param {import('express').Application} app
 */
async function setupMiddleware(app) {
    await load();

    // Auto-save every minute
    setInterval(async () => {
        await save();
        prune();
    }, 60 * 1000);

    // Save on exit (use sync for exit handlers if possible, but SIGINT/SIGTERM are fine with async usually if we don't exit immediately)
    // However, on exit we should probably attempt a quick write.
    const onExit = async () => {
        if (isDirty) {
            try {
                // Try sync write on exit to be safe
                const fsSync = await import('fs');
                fsSync.default.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
            } catch (err) {
                // Ignore
            }
        }
        process.exit();
    };

    process.on('SIGINT', onExit);
    process.on('SIGTERM', onExit);

    // Request interceptor
    // Track both Anthropic (/v1/messages) and OpenAI compatible (/v1/chat/completions) endpoints
    const TRACKED_PATHS = ['/v1/messages', '/v1/chat/completions'];

    app.use((req, res, next) => {
        if (req.method === 'POST' && TRACKED_PATHS.includes(req.path)) {
            const model = req.body?.model;
            if (model) {
                track(model);
            }
        }
        next();
    });
}

/**
 * Setup API Routes
 * @param {import('express').Application} app
 */
function setupRoutes(app) {
    app.get('/api/stats/history', (req, res) => {
        // Sort keys to ensure chronological order
        const sortedKeys = Object.keys(history).sort();
        const sortedData = {};
        sortedKeys.forEach(key => {
            sortedData[key] = history[key];
        });
        res.json(sortedData);
    });
}

/**
 * Get usage history data
 * @returns {object} History data sorted by timestamp
 */
function getHistory() {
    const sortedKeys = Object.keys(history).sort();
    const sortedData = {};
    sortedKeys.forEach(key => {
        sortedData[key] = history[key];
    });
    return sortedData;
}

export default {
    setupMiddleware,
    setupRoutes,
    track,
    getFamily,
    getShortName,
    getHistory
};
