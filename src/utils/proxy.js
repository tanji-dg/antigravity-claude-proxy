/**
 * Proxy Configuration Utility
 *
 * Configures global proxy settings for native fetch (undici) and
 * legacy http/https modules (via global-agent).
 */

import { setGlobalDispatcher, ProxyAgent } from 'undici';
import { logger } from './logger.js';

/**
 * Initialize global proxy settings from environment variables
 */
export function initProxy() {
    const proxyUrl = process.env.HTTPS_PROXY || 
                     process.env.https_proxy || 
                     process.env.HTTP_PROXY || 
                     process.env.http_proxy;

    if (!proxyUrl) {
        return;
    }

    try {
        logger.info(`[Proxy] Configuring global proxy: ${proxyUrl}`);
        
        // Configure undici (native fetch)
        const proxyAgent = new ProxyAgent({
            uri: proxyUrl,
            // Support NO_PROXY
            noProxy: process.env.NO_PROXY || process.env.no_proxy,
            // Increase timeouts for long-running LLM requests
            bodyTimeout: 300000, // 5 minutes
            headersTimeout: 300000,
            connectTimeout: 60000
        });
        
        setGlobalDispatcher(proxyAgent);
        
        // Ensure global-agent also knows about the proxy if it's not already set
        if (!process.env.GLOBAL_AGENT_HTTP_PROXY) {
            process.env.GLOBAL_AGENT_HTTP_PROXY = proxyUrl;
        }

        logger.success('[Proxy] Global proxy configured successfully');
    } catch (error) {
        logger.error('[Proxy] Failed to configure global proxy:', error.message);
    }
}
