// Metro config: enable react-native-svg-transformer so `.svg` files import as
// React components (used for the Spotlight brand logomarks in assets/brand/).
// https://github.com/kristerkari/react-native-svg-transformer
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.transformer.babelTransformerPath = require.resolve(
  "react-native-svg-transformer/expo",
);
config.resolver.assetExts = config.resolver.assetExts.filter(
  (ext) => ext !== "svg",
);
config.resolver.sourceExts = [...config.resolver.sourceExts, "svg"];

module.exports = config;
