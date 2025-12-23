// scripts/update_uptime_svg.js
// CommonJS - Node 20+

const fs = require("node:fs/promises");

const SVG_PATH = process.env.SVG_PATH || "assets/about.svg";
const LINE_WIDTH = 99;

// === CONFIG: scegli l'origine dell'uptime ===
// Esempio: data di nascita (YYYY-MM-DD) oppure una "start date" del profilo.
// Cambiala con la tua data reale:
const ORIGIN_DATE_ISO = process.env.UPTIME_ORIGIN || "2001-08-06";

function replaceTspanById(svg, id, newText) {
  const re = new RegExp(`(<tspan[^>]*\\bid="${id}"[^>]*>)([\\s\\S]*?)(</tspan>)`, "m");
  if (!re.test(svg)) {
    console.warn(`Warning: tspan id="${id}" not found.`);
    return svg;
  }
  const escaped = String(newText)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return svg.replace(re, `$1${escaped}$3`);
}

function setDots(svg, dotsId, dotsCount) {
  const n = Math.max(0, Math.trunc(dotsCount));
  return replaceTspanById(svg, dotsId, ".".repeat(n));
}

// Calcolo differenza in anni/mesi/giorni "calendario" (non solo giorni totali)
function diffYMD(from, to) {
  if (to < from) [from, to] = [to, from];

  let years = to.getUTCFullYear() - from.getUTCFullYear();
  let months = to.getUTCMonth() - from.getUTCMonth();
  let days = to.getUTCDate() - from.getUTCDate();

  if (days < 0) {
    // prendi i giorni del mese precedente rispetto a "to"
    const prevMonth = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 0)); // day 0 = last day prev month
    days += prevMonth.getUTCDate();
    months -= 1;
  }

  if (months < 0) {
    months += 12;
    years -= 1;
  }

  return { years, months, days };
}

function plural(n, s) {
  return `${n} ${s}${n === 1 ? "" : "s"}`;
}

async function main() {
  const svgOriginal = await fs.readFile(SVG_PATH, "utf8");

  const origin = new Date(`${ORIGIN_DATE_ISO}T00:00:00Z`);
  if (Number.isNaN(origin.getTime())) {
    console.error(`Invalid ORIGIN_DATE_ISO: "${ORIGIN_DATE_ISO}". Use YYYY-MM-DD.`);
    process.exit(1);
  }

  const now = new Date(); // ok: usiamo UTC sotto
  const { years, months, days } = diffYMD(origin, now);

  const uptimeStr = `${plural(years, "year")}, ${plural(months, "month")}, ${plural(days, "day")}`;

  // Aggiorna valore uptime
  let svg = svgOriginal;
  svg = replaceTspanById(svg, "age_data", uptimeStr);

  // Applica regola 99 caratteri:
  // riga visibile = prefix + dots + " " + uptimeStr
  // prefix visibile deve essere ESATTAMENTE ". Uptime:" (include spazio dopo punto)
  const prefix = ". Uptime:";

  // lo spazio tra dots e stats è reale nell'SVG => conta 1
  const dots = LINE_WIDTH - prefix.length - 1 - uptimeStr.length;

  svg = setDots(svg, "age_data_dots", dots);

  if (svg !== svgOriginal) {
    await fs.writeFile(SVG_PATH, svg, "utf8");
    console.log(`Uptime updated: ${uptimeStr}`);
  } else {
    console.log("No changes detected.");
  }
}

main().catch((e) => {
  console.error(e?.stack || e);
  process.exit(1);
});
