/**
 * NOTE: the Worker source of truth is worker/src/index.js (deploy: cd worker && npx wrangler@3.114.17 deploy).
 * This root file only re-exports it so older configs pointing at ./worker-index.js keep working.
 */
export { default } from './worker/src/index.js';
