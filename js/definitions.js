// Récupération en direct des définitions françaises via Wiktionnaire (CORS natif, sans serveur)

const defCache = new Map();

function normalizeNoAccents(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function parseFrenchExtract(rawExtract, displayTitle) {
  if (!rawExtract) return null;

  // Isoler la section "== Français =="
  const frMatch = rawExtract.match(/==\s*Français\s*==([\s\S]*?)(?=\n==\s*[^=]|$)/i);
  const section = frMatch ? frMatch[1] : rawExtract;

  // Découper par sous-sections "=== ... ==="
  const subRegex = /===\s*([^=]+?)\s*===/g;
  const parts = [];
  let match;
  while ((match = subRegex.exec(section)) !== null) {
    parts.push({ title: match[1].trim(), index: match.index, end: subRegex.lastIndex });
  }

  const skipTitles = /^(étymologie|prononciation|anagrammes|voir aussi|références|synonymes|antonymes|dérivés|traductions|notes|citations|homophones|paronymes)$/i;

  for (let i = 0; i < parts.length; i++) {
    const pos = parts[i].title;
    if (skipTitles.test(pos)) continue;

    const bodyStart = parts[i].end;
    const bodyEnd = i + 1 < parts.length ? parts[i + 1].index : section.length;
    const body = section.slice(bodyStart, bodyEnd);

    const lines = body
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('===='));

    // Sauter la ligne d'en-tête phonétique / genre (ex: "zoo \zo\ masculin")
    const defLines = lines.filter(l => {
      if (l.includes('\\') && l.length < 90) return false;
      if (/^(masculin|féminin|invariable|singulier|pluriel)\b/i.test(l) && l.length < 40) return false;
      if (normalizeNoAccents(l.split(/\s+/)[0]) === normalizeNoAccents(displayTitle) && l.length < 60 && !l.includes('.')) return false;
      return l.length > 8;
    });

    if (defLines.length > 0) {
      let text = defLines[0];
      if (text.length > 180) text = text.slice(0, 177).trimEnd() + '…';
      return { title: displayTitle, pos, text };
    }
  }

  return null;
}

async function queryExtractByTitle(title) {
  const url = `https://fr.wiktionary.org/w/api.php?action=query&prop=extracts&explaintext=1&exchars=1600&titles=${encodeURIComponent(title)}&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined || !page.extract) return null;
  return { title: page.title, extract: page.extract };
}

async function findAccentedTitle(upperWord) {
  const lower = upperWord.toLowerCase();
  const url = `https://fr.wiktionary.org/w/api.php?action=opensearch&search=${encodeURIComponent(lower)}&limit=8&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const candidates = data?.[1] || [];
  for (const cand of candidates) {
    if (normalizeNoAccents(cand) === upperWord) {
      return cand;
    }
  }
  return null;
}

export async function fetchDefinition(word) {
  const key = word.toUpperCase();
  if (defCache.has(key)) return defCache.get(key);

  const promise = (async () => {
    try {
      // 1. Essai direct en minuscules
      let page = await queryExtractByTitle(key.toLowerCase());
      let parsed = page ? parseFrenchExtract(page.extract, page.title) : null;

      // 2. Si absent (mot accentué comme "café", "étoile", "étaient"), recherche Wiktionnaire
      if (!parsed) {
        const accented = await findAccentedTitle(key);
        if (accented && accented !== key.toLowerCase()) {
          page = await queryExtractByTitle(accented);
          parsed = page ? parseFrenchExtract(page.extract, page.title) : null;
        }
      }

      if (parsed) return parsed;
      return {
        title: key.toLowerCase(),
        pos: 'Mot Scrabble (ODS8)',
        text: 'Mot français valide (forme conjuguée, variante ou terme spécialisé du Scrabble).'
      };
    } catch {
      return {
        title: key.toLowerCase(),
        pos: 'Hors ligne',
        text: 'Définition indisponible sans connexion internet.'
      };
    }
  })();

  defCache.set(key, promise);
  return promise;
}
