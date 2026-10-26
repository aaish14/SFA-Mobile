import React from "react";
import { Image } from "react-native";

// Use the supplied artwork unchanged, with space around the complete wordmark.
/**
 * Render the bundled brand image with the requested size and accessible image labeling.
 */
export default function BrandLogo({ width = 84 }: { width?: number }) {
  return (
    <Image
      source={require("../../assets/nestle-logo.png")}
      accessibilityLabel="Nestlé logo"
      resizeMode="contain"
      style={{ width, height: (width * 138) / 246, backgroundColor: "white", borderRadius: 4 }}
    />
  );
}
