/**
 * Metro config for the pnpm monorepo.
 *
 * Two things Metro does not do by default and this app needs:
 *  1. Watch the workspace root, so edits to @chivago/core and @chivago/tokens
 *     trigger a rebuild instead of silently serving a stale bundle.
 *  2. Resolve pnpm's symlinked node_modules, which are not hoisted.
 *
 * The shared packages ship raw TypeScript (`main: src/index.ts`) rather than a
 * build artifact - one fewer build step, and Metro transpiles them anyway.
 */

const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// pnpm symlinks every dependency; without this Metro follows the link to a
// real path outside the project and then refuses to serve it.
config.resolver.unstable_enableSymlinks = true;

// Hierarchical lookup MUST stay on for pnpm. Expo's monorepo guide disables it,
// but that guide assumes npm/yarn hoisting: with pnpm, a package's own
// dependencies live under .pnpm/<pkg>/node_modules and Metro only reaches them
// by walking up from the module's real path. Disabling it here fails to resolve
// expo-modules-core and @babel/runtime.
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
