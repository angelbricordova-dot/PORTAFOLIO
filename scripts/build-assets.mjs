// Copia las fuentes (latin) y genera el sprite de iconos Phosphor que usa el sitio.
import { copyFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const fonts = [
  ["@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2", "bricolage.woff2"],
  ["@fontsource-variable/geist/files/geist-latin-wght-normal.woff2", "geist.woff2"],
  ["@fontsource/geist-mono/files/geist-mono-latin-500-normal.woff2", "geist-mono.woff2"],
  ["@fontsource-variable/syne/files/syne-latin-wght-normal.woff2", "syne.woff2"],
];
for (const [src, out] of fonts) copyFileSync(`node_modules/${src}`, `public/assets/fonts/${out}`);

const icons = `arrow-up-right arrow-right arrow-left play play-circle x plus trash pencil-simple upload-simple image video-camera link
calendar-blank users chart-bar sparkle lock-simple sign-out floppy-disk eye eye-slash download-simple instagram-logo youtube-logo
tiktok-logo linkedin-logo envelope-simple whatsapp-logo star check warning film-strip paint-brush megaphone chats-circle lightbulb
compass list magnifying-glass copy house gear folder tag arrow-counter-clockwise caret-down caret-left caret-right monitor-play
palette users-three trend-up rocket heart cloud-arrow-up check-circle info clock-counter-clockwise note-pencil magic-wand
file-arrow-down file-arrow-up globe trophy target arrow-up x-logo behance-logo facebook-logo threads-logo twitch-logo star-four asterisk sun moon microphone quotes pause chat-circle-text seal-check`.split(/\s+/);

const symbols = [];
for (const name of icons) {
  for (const weight of ["regular", "fill"]) {
    const file = `node_modules/@phosphor-icons/core/assets/${weight}/${name}${weight === "regular" ? "" : "-fill"}.svg`;
    if (!existsSync(file)) { if (weight === "regular") console.warn("falta icono:", name); continue; }
    const svg = readFileSync(file, "utf8");
    const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    symbols.push(`<symbol id="${name}${weight === "fill" ? "-fill" : ""}" viewBox="0 0 256 256">${inner}</symbol>`);
  }
}
writeFileSync("public/assets/icons.svg", `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${symbols.join("")}</svg>`);
console.log("iconos:", symbols.length);
