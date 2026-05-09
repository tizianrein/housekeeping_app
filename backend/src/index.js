/**
 * Immobilien-Verwaltung Worker
 * Stellt API für Frontend bereit, prüft Passwort, spricht mit D1 und R2
 */

// ============== HILFSFUNKTIONEN ==============

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}

// Token aus dem Request lesen
function getToken(request) {
  const auth = request.headers.get('Authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

// Token prüfen: muss = APP_PASSWORD sein
function isAuthenticated(request, env) {
  const token = getToken(request);
  return token && token === env.APP_PASSWORD;
}

// ============== HANDLER ==============

async function handleLogin(request, env) {
  const body = await request.json().catch(() => ({}));
  const { password } = body;

  if (!password || password !== env.APP_PASSWORD) {
    return errorResponse('Falsches Passwort', 401);
  }

  return jsonResponse({ token: env.APP_PASSWORD });
}

async function handleGetState(request, env) {
  if (!isAuthenticated(request, env)) {
    return errorResponse('Nicht angemeldet', 401);
  }

  // Alle Daten parallel holen
  const [objekte, einheiten, schaeden, handwerker, wartung] = await Promise.all([
    env.DB.prepare('SELECT * FROM objekte ORDER BY name').all(),
    env.DB.prepare('SELECT * FROM einheiten ORDER BY id').all(),
    env.DB.prepare('SELECT * FROM schaeden ORDER BY erstellt DESC').all(),
    env.DB.prepare('SELECT * FROM handwerker ORDER BY name').all(),
    env.DB.prepare('SELECT * FROM wartung ORDER BY naechster').all(),
  ]);

  // Objekte mit ihren Einheiten zusammenführen
  const objekteWithEinheiten = objekte.results.map(o => ({
    id: o.id,
    name: o.name,
    adresse: o.adresse,
    emoji: o.emoji,
    einheiten: einheiten.results
      .filter(e => e.objekt_id === o.id)
      .map(e => ({
        id: e.id,
        typ: e.typ,
        bez: e.bez,
        mieter: e.mieter,
        m2: e.m2,
        kmM2: e.km_m2,
        kmMonat: e.km_monat,
        nkMonat: e.nk_monat,
        letzteErhoehung: e.letzte_erhoehung,
        naechste: JSON.parse(e.naechste_erhoehungen || '[]'),
      })),
  }));

  // Schäden parsen (fotos und historie sind JSON-Strings)
  const schaedenParsed = schaeden.results.map(s => ({
    id: s.id,
    titel: s.titel,
    beschreibung: s.beschreibung,
    objektId: s.objekt_id,
    einheitId: s.einheit_id,
    kategorie: s.kategorie,
    prioritaet: s.prioritaet,
    status: s.status,
    kosten: s.kosten,
    handwerkerId: s.handwerker_id,
    erstellt: s.erstellt,
    fotos: JSON.parse(s.fotos || '[]'),
    historie: JSON.parse(s.historie || '[]'),
  }));

  return jsonResponse({
    objekte: objekteWithEinheiten,
    schaeden: schaedenParsed,
    handwerker: handwerker.results,
    wartung: wartung.results.map(w => ({
      id: w.id,
      titel: w.titel,
      objektId: w.objekt_id,
      intervall: w.intervall,
      naechster: w.naechster,
      notiz: w.notiz,
    })),
  });
}

async function handlePutState(request, env) {
  if (!isAuthenticated(request, env)) {
    return errorResponse('Nicht angemeldet', 401);
  }

  const state = await request.json();

  // Alle Tabellen leeren und neu schreiben (einfacher Ansatz für den Anfang)
  // Bei viel Last würde man inkrementell arbeiten - reicht erstmal nicht.
  const stmts = [];

  // Lösche alle alten Daten
  stmts.push(env.DB.prepare('DELETE FROM einheiten'));
  stmts.push(env.DB.prepare('DELETE FROM objekte'));
  stmts.push(env.DB.prepare('DELETE FROM schaeden'));
  stmts.push(env.DB.prepare('DELETE FROM handwerker'));
  stmts.push(env.DB.prepare('DELETE FROM wartung'));

  // Objekte einfügen
  for (const o of (state.objekte || [])) {
    stmts.push(env.DB.prepare(
      'INSERT INTO objekte (id, name, adresse, emoji) VALUES (?, ?, ?, ?)'
    ).bind(o.id, o.name, o.adresse || null, o.emoji || null));

    // Einheiten dieses Objekts einfügen
    for (const e of (o.einheiten || [])) {
      stmts.push(env.DB.prepare(
        `INSERT INTO einheiten 
        (id, objekt_id, typ, bez, mieter, m2, km_m2, km_monat, nk_monat, letzte_erhoehung, naechste_erhoehungen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        e.id, o.id, e.typ || null, e.bez || null, e.mieter || null,
        e.m2 || null, e.kmM2 || null, e.kmMonat || null, e.nkMonat || null,
        e.letzteErhoehung || null,
        JSON.stringify(e.naechste || [])
      ));
    }
  }

  // Schäden einfügen
  for (const s of (state.schaeden || [])) {
    stmts.push(env.DB.prepare(
      `INSERT INTO schaeden 
      (id, titel, beschreibung, objekt_id, einheit_id, kategorie, prioritaet, status, kosten, handwerker_id, erstellt, fotos, historie)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      s.id, s.titel, s.beschreibung || null, s.objektId, s.einheitId || null,
      s.kategorie || null, s.prioritaet || null, s.status || 'offen',
      s.kosten || 0, s.handwerkerId || null, s.erstellt || null,
      JSON.stringify(s.fotos || []),
      JSON.stringify(s.historie || [])
    ));
  }

  // Handwerker einfügen
  for (const h of (state.handwerker || [])) {
    stmts.push(env.DB.prepare(
      'INSERT INTO handwerker (id, name, gewerk, tel, notiz) VALUES (?, ?, ?, ?, ?)'
    ).bind(h.id, h.name, h.gewerk || null, h.tel || null, h.notiz || null));
  }

  // Wartung einfügen
  for (const w of (state.wartung || [])) {
    stmts.push(env.DB.prepare(
      'INSERT INTO wartung (id, titel, objekt_id, intervall, naechster, notiz) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(w.id, w.titel, w.objektId || null, w.intervall || null, w.naechster || null, w.notiz || null));
  }

  // Alle Statements als eine Transaktion ausführen
  await env.DB.batch(stmts);

  return jsonResponse({ ok: true });
}

async function handleUploadFoto(request, env) {
  if (!isAuthenticated(request, env)) {
    return errorResponse('Nicht angemeldet', 401);
  }

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.startsWith('image/')) {
    return errorResponse('Kein Bild', 400);
  }

  const fotoId = crypto.randomUUID();
  const key = `fotos/${fotoId}.jpg`;
  const data = await request.arrayBuffer();

  await env.FOTOS.put(key, data, {
    httpMetadata: { contentType },
  });

  return jsonResponse({ id: fotoId, key });
}

async function handleGetFoto(request, env, fotoId) {
  if (!isAuthenticated(request, env)) {
    return errorResponse('Nicht angemeldet', 401);
  }

  const key = `fotos/${fotoId}.jpg`;
  const obj = await env.FOTOS.get(key);

  if (!obj) {
    return errorResponse('Foto nicht gefunden', 404);
  }

  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg',
      'Cache-Control': 'private, max-age=3600',
      ...CORS_HEADERS,
    },
  });
}

// ============== ROUTING ==============

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      // Login
      if (path === '/api/login' && method === 'POST') {
        return await handleLogin(request, env);
      }

      // State (alle Daten)
      if (path === '/api/state' && method === 'GET') {
        return await handleGetState(request, env);
      }
      if (path === '/api/state' && method === 'PUT') {
        return await handlePutState(request, env);
      }

      // Foto upload
      if (path === '/api/foto' && method === 'POST') {
        return await handleUploadFoto(request, env);
      }

      // Foto abrufen
      const fotoMatch = path.match(/^\/api\/foto\/([a-z0-9-]+)$/);
      if (fotoMatch && method === 'GET') {
        return await handleGetFoto(request, env, fotoMatch[1]);
      }

      // Health-Check
      if (path === '/' || path === '/api/health') {
        return jsonResponse({ status: 'ok', message: 'Immobilien-API läuft' });
      }

      return errorResponse('Endpoint nicht gefunden', 404);
    } catch (err) {
      console.error('Worker error:', err);
      return errorResponse(err.message || 'Server error', 500);
    }
  },
};