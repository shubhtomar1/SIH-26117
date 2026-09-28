"use client";

import { memo } from "react";
import { LiquidMetal, type LiquidMetalProps } from "@paper-design/shaders-react";

export type LiquidMetalViewProps = Partial<LiquidMetalProps>;

/* Amorphous liquid-metal blob — free gooey silhouette, always in motion. */
function LiquidMetalView(props: LiquidMetalViewProps) {
  return (
    <LiquidMetal
      colorBack="#00000000"
      colorTint="#bcc3ec"
      repetition={5}
      softness={0.85}
      shiftRed={1}
      shiftBlue={-1}
      distortion={0.5}
      contour={0.5}
      angle={0}
      speed={0.9}
      scale={0.55}
      fit="contain"
      {...props}
      shape="metaballs"
    />
  );
}

export default memo(LiquidMetalView);
export { LiquidMetalView };
