/**
 * build_extension.cjs
 * Bundles modular extension source files into production extension assets using esbuild.
 */
const { execSync } = require('child_process');

console.log('[Paylens Build] Bundling content.js -> content.bundle.js...');
try {
  execSync('npx esbuild extension/content/content.js --bundle --outfile=extension/content/content.bundle.js', { stdio: 'inherit' });
  console.log('[Paylens Build] Successfully generated extension/content/content.bundle.js');
} catch (err) {
  console.error('[Paylens Build] Error bundling:', err);
  process.exit(1);
}
