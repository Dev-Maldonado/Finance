export function cardColors(value: string) {
  const background = /^#[0-9a-f]{6}$/i.test(value) ? value : "#5B35D5";
  const rgb = [1, 3, 5].map(i => parseInt(background.slice(i, i + 2), 16) / 255);
  const [r, g, b] = rgb.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return { background, color: luminance > 0.179 ? "#171327" : "#FFFFFF" };
}
