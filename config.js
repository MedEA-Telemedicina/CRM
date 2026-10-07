// ============================================================
// config.js — Configura qui le tue credenziali
// ============================================================

const CONFIG = {
  // URL del tuo Cloudflare Worker (endpoint /lookup)
  // Es: "https://crm-lookup.tuonome.workers.dev/lookup"
  WORKER_LOOKUP_URL: "https://shiny-mud-a8b9.testmedeatelemedicina.workers.dev",

  // Supabase
  // Trovalo in: Supabase → Settings → API → Project URL
  SUPABASE_URL: "https://docyzzzjduecrfrjezoo.supabase.co",

  // Trovalo in: Supabase → Settings → API → anon public
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvY3l6enpqZHVlY3Jmcmplem9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3OTQxNzAsImV4cCI6MjA5NTM3MDE3MH0.UkhERx4Ju-mIAPMpHIN9jPR50nVDwd8dKETHHuUU7XA",

  // Interni 3CX -> nome operatore (sostituisci i nomi con quelli reali)
  OPERATORS: {
    "41": "Antonio Marino",
    "19": "Giovanni Cafaro",
    "20": "Carmine Calocero",
    "21": "Fabio Cataldi",
    "22": "Rosy Pia Cavuoti",
    "29": "Antonio Equestre",
    "32": "Vincenzo Lagrotta",
    "35": "Angela Lione",
    "38": "Antonello Gugliotti",
    "44": "Gianmarco Palazzo",
    "45": "Vito Palladino",
    "47": "William M. Potenza",
    // "42": "Nome collega",
  },
};
