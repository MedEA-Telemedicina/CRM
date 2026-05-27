/**
 * Cloudflare Worker — Google Places Phone Lookup
 * 
 * Variabili d'ambiente da impostare in Cloudflare:
 *   GOOGLE_API_KEY  (Secret)   → chiave Google Maps/Places API
 *   ALLOWED_ORIGIN  (Text)     → es. https://tuoutente.github.io  (opzionale)
 */

addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin") || "*";
  const allowedOrigin = (typeof ALLOWED_ORIGIN !== "undefined" && ALLOWED_ORIGIN)
    ? ALLOWED_ORIGIN
    : "*";

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(allowedOrigin),
    });
  }

  // Solo /lookup è esposto
  if (url.pathname !== "/lookup") {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders(allowedOrigin) },
    });
  }

  const number = url.searchParams.get("number") || "";
  if (!number) {
    return jsonResponse({ error: "Parametro 'number' mancante" }, 400, allowedOrigin);
  }

  // Normalizza: rimuovi spazi, trattini ecc.
  const cleanNumber = number.replace(/[\s\-().]/g, "");

  try {
    const result = await googlePlacesLookup(cleanNumber);
    return jsonResponse(result, 200, allowedOrigin);
  } catch (err) {
    return jsonResponse({ error: err.message, name: null, address: null }, 500, allowedOrigin);
  }
}

/**
 * Cerca il numero su Google Places (funziona bene per aziende/negozi).
 * Per numeri privati restituirà found: false.
 */
async function googlePlacesLookup(number) {
  const apiKey = GOOGLE_API_KEY;

  // Prima prova: findplacefromtext con inputtype=phonenumber
  const findUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
    `?input=${encodeURIComponent(number)}` +
    `&inputtype=phonenumber` +
    `&fields=name,formatted_address,place_id,formatted_phone_number` +
    `&key=${apiKey}`;

  const findResp = await fetch(findUrl);
  const findData = await findResp.json();

  if (findData.status === "OK" && findData.candidates && findData.candidates.length > 0) {
    const place = findData.candidates[0];
    return {
      found: true,
      name: place.name || null,
      address: place.formatted_address || null,
      place_id: place.place_id || null,
      source: "google_places",
    };
  }

  // Seconda prova: Text Search con il numero come query
  const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json` +
    `?query=${encodeURIComponent(number)}` +
    `&fields=name,formatted_address` +
    `&key=${apiKey}`;

  const searchResp = await fetch(searchUrl);
  const searchData = await searchResp.json();

  if (searchData.status === "OK" && searchData.results && searchData.results.length > 0) {
    const place = searchData.results[0];
    return {
      found: true,
      name: place.name || null,
      address: place.formatted_address || null,
      source: "google_textsearch",
    };
  }

  // Nessun risultato
  return {
    found: false,
    name: null,
    address: null,
    source: null,
    raw_status: findData.status,
  };
}

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
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}
