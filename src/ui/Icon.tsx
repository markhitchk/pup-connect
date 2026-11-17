import React from "react";
import Svg, { Path } from "react-native-svg";
import icons from "../assets/icons.json";
export type IconName = keyof typeof icons;
export function Icon({
  name,
  color = "#00b8f0",
  size = 22,
}: {
  name: IconName;
  color?: string;
  size?: number;
}) {
  const icon = icons[name];
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${icon.width} ${icon.height}`}
      accessibilityElementsHidden
    >
      {icon.paths.map((path, i) => (
        <Path key={i} d={path} fill={color} />
      ))}
    </Svg>
  );
}
