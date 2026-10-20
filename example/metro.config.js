// The package is linked with file:.. (a symlink), so Metro must watch it and must not load a second react/react-native from it.
// Hierarchical lookup stays on: react-native keeps some of its own dependencies (@react-native/virtualized-lists...) in a nested node_modules.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const library = path.resolve(__dirname, '..');
const escaped = library.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const config = getDefaultConfig(__dirname);
// The spec's fixtures (templates.generated.ts requires them) live in ../.spec or $MINIWALL_SPEC_DIR.
const spec = process.env.MINIWALL_SPEC_DIR ? path.resolve(process.env.MINIWALL_SPEC_DIR) : path.resolve(__dirname, '../.spec');
config.watchFolders = [library, spec];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
// The library's own copies of react and react-native (its devDependencies) are never bundled.
config.resolver.blockList = [new RegExp(`^${escaped}/node_modules/(react|react-native)/.*$`)];
module.exports = config;
