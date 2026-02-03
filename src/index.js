/**
 * Antigravity Claude Proxy
 * Entry point - starts the proxy server
 */

import 'global-agent/bootstrap.js';
import { initProxy } from './utils/proxy.js';
import { initializeConfig } from './config.js';

import app from './server.js';
import { DEFAULT_PORT, refreshConstants } from './constants.js';
import { logger } from './utils/logger.js';
import path from 'path';
import os from 'os';

// Initialize proxy before anything else
initProxy();

// Parse command line arguments
const args = process.argv.slice(2);
const isDebug = args.includes('--debug') || process.env.DEBUG === 'true';
const isFallbackEnabled = args.includes('--fallback') || process.env.FALLBACK === 'true';

// Initialize logger
logger.setDebug(isDebug);

// Main startup function
async function startServer() {
    // Initialize configuration
    const loadedConfig = await initializeConfig();
    
    // Refresh constants with loaded config values
    refreshConstants();

    if (isDebug) {
        logger.debug('Debug mode enabled');
    }

    if (isFallbackEnabled) {
        logger.info('Model fallback mode enabled');
    }

    if (loadedConfig.respectApiRateLimit) {
        logger.info('API rate limit respect mode enabled');
    }

    // Port priority: Environment variable > Config file > Default constant
    const PORT = process.env.PORT || loadedConfig.port || DEFAULT_PORT;

    // Home directory for account storage
    const HOME_DIR = os.homedir();
    const CONFIG_DIR = path.join(HOME_DIR, '.config', 'antigravity-proxy');

    app.listen(PORT, () => {
        // Clear console for a clean start
        console.clear();

        const border = '║';
        // align for 2-space indent (60 chars), align4 for 4-space indent (58 chars)
        const align = (text) => text + ' '.repeat(Math.max(0, 60 - text.length));
        const align4 = (text) => text + ' '.repeat(Math.max(0, 58 - text.length));

        // Build Control section dynamically
        let controlSection = '║  Control:                                                    ║\n';
        if (!isDebug) {
            controlSection += '║    --debug            Enable debug logging                   ║\n';
        }
        if (!isFallbackEnabled) {
            controlSection += '║    --fallback         Enable model fallback on quota exhaust ║\n';
        }
        controlSection += '║    Ctrl+C             Stop server                            ║';

        // Build status section if any modes are active
        let statusSection = '';
        if (isDebug || isFallbackEnabled) {
            statusSection = '║                                                              ║\n';
            statusSection += '║  Active Modes:                                               ║\n';
            if (isDebug) {
                statusSection += '║    ✓ Debug mode enabled                                      ║\n';
            }
            if (isFallbackEnabled) {
                statusSection += '║    ✓ Model fallback enabled                                  ║\n';
            }
        }

        logger.log(`
╔══════════════════════════════════════════════════════════════╗
║           Antigravity Claude Proxy Server                    ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
${border}  ${align(`Server running at: http://localhost:${PORT}`)}${border}
${statusSection}║                                                              ║
${controlSection}
║                                                              ║
║  Endpoints:                                                  ║
║    POST /v1/messages         - Anthropic Messages API        ║
║    GET  /v1/models           - List available models         ║
║    GET  /health              - Health check                  ║
║    GET  /account-limits      - Account status & quotas       ║
║    POST /refresh-token       - Force token refresh           ║
║                                                              ║
${border}  ${align(`Configuration:`)}${border}
${border}    ${align4(`Storage: ${CONFIG_DIR}`)}${border}
║                                                              ║
║  Usage with Claude Code:                                     ║
${border}    ${align4(`export ANTHROPIC_BASE_URL=http://localhost:${PORT}`)}${border}
║    export ANTHROPIC_API_KEY=dummy                            ║
║    claude                                                    ║
║                                                              ║
║  Add Google accounts:                                        ║
║    npm run accounts                                          ║
║                                                              ║
║  Prerequisites (if no accounts configured):                  ║
║    - Antigravity must be running                             ║
║    - Have a chat panel open in Antigravity                   ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);

        logger.success(`Server started successfully on port ${PORT}`);
        if (isDebug) {
            logger.warn('Running in DEBUG mode - verbose logs enabled');
        }
    });
}

// Start the server
startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});

// Export fallback flag for server to use
export const FALLBACK_ENABLED = isFallbackEnabled;
