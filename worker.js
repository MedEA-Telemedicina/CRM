/**
 * Cloudflare Worker — Google Lookup (Places + Custom Search)
 *
 * Variabili d'ambiente da impostare in Cloudflare:
 *   GOOGLE_API_KEY   (Secret) → chiave Google Maps/Places API
 *   GOOGLE_CSE_ID    (Text)   → ID del motore di ricerca programmabile Google
 *   ALLOWED_ORIGIN   (Text)   → es. https://tuoutente.github.io (opzionale)
 */

addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const allowedOrigin =
    typeof ALLOWED_ORIGIN !== "undefined" && ALLOWED_ORIGIN
      ? ALLOWED_ORIGIN
      : "*";

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(allowedOrigin),
    });
  }

  if (url.pathname !== "/lookup") {
    return jsonResponse({ error: "Not found" }, 404, allowedOrigin);
  }

  const number = (url.searchParams.get("number") || "").trim();
  if (!number) {
    return jsonResponse({ error: "Parametro 'number' mancante" }, 400, allowedOrigin);
  }

  try {
    const result = await lookup(number);
    return jsonResponse(result, 200, allowedOrigin);
  } catch (err) {
    return jsonResponse(
      { error: err.message, name: null, address: null },
      500,
      allowedOrigin
    );
  }
}

/* ──────────────────────────────────────────────
 *  Normalizzazione numero italiano → E.164
 * ────────────────────────────────────────────── */
function normalizeToE164(raw) {
  let n = raw.replace(/[\s\-().\/]/g, "");

  // 0039xxx  → +39xxx
  if (n.startsWith("0039")) n = "+" + n.slice(2);
  // 0049xxx, 0044xxx ecc. → +49xxx (altri paesi)
  else if (n.startsWith("00"))  n = "+" + n.slice(2);
  // 39xxxxxxxxx (≥11 cifre, probabilmente IT senza +)
  else if (/^39\d{8,}$/.test(n)) n = "+" + n;
  // 0xxxxxxxxx (numero locale italiano)
  else if (n.startsWith("0") && n.length >= 6) n = "+39" + n;
  // 3xxxxxxxxx (cellulare italiano senza prefisso internazionale)
  else if (/^3[0-9]{8,}$/.test(n) && !n.startsWith("39")) n = "+39" + n;
  // Se già ha il +, lascia com'è
  else if (!n.startsWith("+")) n = "+39" + n;

  return n;
}

/* Genera varianti utili per la ricerca */
function numberVariants(e164) {
  const variants = [e164];

  if (e164.startsWith("+39")) {
    const local = "0" + e164.slice(3);          // 06xxxxxxxx
    const withSpaces = e164.slice(0, 3) + " " + e164.slice(3); // +39 06...
    variants.push(local, withSpaces);
  }

  return [...new Set(variants)];
}

/* ──────────────────────────────────────────────
 *  Pipeline di ricerca
 *  1) Google Places — findplacefromtext (phonenumber)
 *  2) Google Places — Text Search
 *  3) Google Custom Search (cerca nel web)
 * ────────────────────────────────────────────── */
async function lookup(rawNumber) {
  const apiKey = GOOGLE_API_KEY;
  const e164   = normalizeToE164(rawNumber);
  const variants = numberVariants(e164);

  // ── 1. Places: findplacefromtext ──────────────
  for (const num of variants) {
    const findUrl =
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
      `?input=${encodeURIComponent(num)}` +
      `&inputtype=phonenumber` +
      `&fields=name,formatted_address,place_id,formatted_phone_number` +
      `&key=${apiKey}`;

    const resp = await fetch(findUrl);
    const data = await resp.json();

    if (data.status === "OK" && data.candidates?.length) {
      const p = data.candidates[0];
      return {
        found: true,
        name: p.name || null,
        address: p.formatted_address || null,
        place_id: p.place_id || null,
        source: "google_places",
      };
    }
  }

  // ── 2. Places: Text Search ────────────────────
  {
    const searchUrl =
      `https://maps.googleapis.com/maps/api/place/textsearch/json` +
      `?query=${encodeURIComponent(e164)}` +
      `&key=${apiKey}`;

    const resp = await fetch(searchUrl);
    const data = await resp.json();

    if (data.status === "OK" && data.results?.length) {
      const p = data.results[0];
      return {
        found: true,
        name: p.name || null,
        address: p.formatted_address || null,
        source: "google_textsearch",
      };
    }
  }

  // ── 3. Google Custom Search (web) ─────────────
  if (typeof GOOGLE_CSE_ID !== "undefined" && GOOGLE_CSE_ID) {
    const cseResult = await googleCustomSearch(e164, apiKey);
    if (cseResult) return cseResult;

    // Riprova col formato locale
    for (const num of variants) {
      if (num !== e164) {
        const r = await googleCustomSearch(num, apiKey);
        if (r) return r;
      }
    }
  }

  // Nessun risultato
  return { found: false, name: null, address: null, source: null };
}

/* ──────────────────────────────────────────────
 *  Google Custom Search — cerca nel web come
 *  faresti tu a mano su google.com
 * ────────────────────────────────────────────── */
async function googleCustomSearch(query, apiKey) {
  const cseUrl =
    `https://www.googleapis.com/customsearch/v1` +
    `?q=${encodeURIComponent(query)}` +
    `&key=${apiKey}` +
    `&cx=${GOOGLE_CSE_ID}` +
    `&num=5` +
    `&gl=it` +
    `&lr=lang_it`;

  const resp = await fetch(cseUrl);
  const data = await resp.json();

  if (!data.items || data.items.length === 0) return null;

  // Cerca nei risultati un nome significativo
  for (const item of data.items) {
    const extracted = extractInfoFromResult(item, query);
    if (extracted) return extracted;
  }

  // Se non ha estratto niente di pulito, usa il primo risultato
  const first = data.items[0];
  return {
    found: true,
    name: cleanTitle(first.title) || null,
    address: extractAddress(first.snippet) || null,
    source: "google_web",
    url: first.link || null,
  };
}

/* Estrae nome e indirizzo dal risultato di ricerca */
function extractInfoFromResult(item, query) {
  const title   = item.title   || "";
  const snippet = item.snippet || "";
  const text    = title + " " + snippet;

  // Ignora risultati generici tipo "Cerca numero..." o pagine di elenchi senza info
  const skipPatterns = [
    /chi mi ha chiamato/i,
    /numero sconosciuto/i,
    /trovare il proprietario/i,
    /ricerca inversa/i,
  ];
  if (skipPatterns.some(p => p.test(text))) return null;

  const name    = cleanTitle(title);
  const address = extractAddress(snippet);

  if (!name) return null;

  return {
    found: true,
    name,
    address,
    source: "google_web",
    url: item.link || null,
  };
}

/* Pulisce il titolo rimuovendo suffissi di siti noti */
function cleanTitle(title) {
  if (!title) return null;
  return title
    .replace(/\s*[-–—|·•]\s*(Pagine\s*Gialle|PagineBianche|Infobel|Tellows|Google|Maps|Facebook|LinkedIn|Yelp|TripAdvisor|Cylex|Europages|Kompass).*$/i, "")
    .replace(/\s*[-–—|]\s*$/, "")
    .trim() || null;
}

/* Prova a estrarre un indirizzo dallo snippet */
function extractAddress(snippet) {
  if (!snippet) return null;
  // Pattern: Via/Piazza/Corso ... + CAP + Città
  const match = snippet.match(
    /((?:Via|Viale|Piazza|P\.zza|Corso|C\.so|Largo|Vicolo|Strada|Loc\.|Località|Contrada)\s+[^,.\d]{2,},?\s*\d{0,5}\s*[^,.\d]{2,})/i
  );
  return match ? match[1].trim() : null;
}

/* ── Utilità ─────────────────────────────────── */
function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}
