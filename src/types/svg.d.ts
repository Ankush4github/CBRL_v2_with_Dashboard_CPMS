/**
 * next.config.js routes `*.svg` imports through @svgr/webpack, so an imported
 * SVG is a React component rather than the static asset URL that
 * `next/image-types/global` declares. This override matches the loader.
 */
declare module '*.svg' {
  import type { FC, SVGProps } from 'react';
  const ReactComponent: FC<SVGProps<SVGSVGElement>>;
  export default ReactComponent;
}
