// Lets TypeScript treat `.svg` imports as React components (wired through
// react-native-svg-transformer in metro.config.js).
declare module "*.svg" {
  import type React from "react";
  import type { SvgProps } from "react-native-svg";
  const content: React.FC<SvgProps>;
  export default content;
}
