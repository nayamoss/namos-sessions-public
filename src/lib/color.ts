const hexPattern = /^#[0-9a-fA-F]{6}$/;

function rgbChannelToHsl(channel: number): number {
  return channel / 255;
}

export function hexToHslTriplet(hex: string): string | null {
  if (!hexPattern.test(hex)) return null;
  const red = rgbChannelToHsl(Number.parseInt(hex.slice(1, 3), 16));
  const green = rgbChannelToHsl(Number.parseInt(hex.slice(3, 5), 16));
  const blue = rgbChannelToHsl(Number.parseInt(hex.slice(5, 7), 16));
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const lightness = (maximum + minimum) / 2;
  if (maximum === minimum) return `0 0% ${Math.round(lightness * 100)}%`;
  const delta = maximum - minimum;
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (maximum === red) hue = ((green - blue) / delta) % 6;
  else if (maximum === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  return `${Math.round(hue)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`;
}

function linearize(channel: number) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function contrastForeground(hex: string): string {
  if (!hexPattern.test(hex)) return "0 0% 100%";
  const red = linearize(Number.parseInt(hex.slice(1, 3), 16));
  const green = linearize(Number.parseInt(hex.slice(3, 5), 16));
  const blue = linearize(Number.parseInt(hex.slice(5, 7), 16));
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return luminance > 0.179 ? "0 0% 0%" : "0 0% 100%";
}
