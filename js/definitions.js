// Récupération des vraies définitions françaises via Wiktionnaire (avec recherche insensible aux accents)

const defCache = new Map();

function normalizeNoAccents(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function parseFrenchExtract(rawExtract, displayTitle) {
  if (!rawExtract) return null;

  // Exiger explicitement la section "== Français ==" pour ne pas prendre un mot anglais/étranger
  const frMatch = rawExtract.match(/==\s*Français\s*==([\s\S]*?)(?=\n==\s*[^=]|$)/i);
  if (!frMatch) return null;
  const section = frMatch[1];

  // Découper par sous-sections "=== ... ==="
  const subRegex = /===\s*([^=]+?)\s*===/g;
  const parts = [];
  let match;
  while ((match = subRegex.exec(section)) !== null) {
    parts.push({ title: match[1].trim(), index: match.index, end: subRegex.lastIndex });
  }

  const skipTitles = /^(étymologie|prononciation|anagrammes|voir aussi|références|synonymes|antonymes|dérivés|traductions|notes|citations|homophones|paronymes|vocabulaire|apparentés)/i;

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

    // Filtrer la ligne d'en-tête phonétique / genre (ex: "énol \e.nɔl\ masculin")
    const defLines = lines.filter(l => {
      if (l.includes('\\') && l.length < 110) return false;
      if (/^(masculin|féminin|invariable|singulier|pluriel|transitif|intransitif)\b/i.test(l) && l.length < 45) return false;
      const firstWord = l.split(/\s+/)[0].replace(/[.,;:!?]/g, '');
      if (normalizeNoAccents(firstWord) === normalizeNoAccents(displayTitle) && l.length < 65 && !l.includes('.')) return false;
      return l.length > 8;
    });

    if (defLines.length > 0) {
      let text = defLines[0];
      if (text.length > 210) text = text.slice(0, 207).trimEnd() + '…';
      return { title: displayTitle, pos, text };
    }
  }

  return null;
}

async function queryExtractByTitle(title) {
  const url = `https://fr.wiktionary.org/w/api.php?action=query&prop=extracts&explaintext=1&exchars=3500&titles=${encodeURIComponent(title)}&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined || !page.extract) return null;
  return { title: page.title, extract: page.extract };
}

async function findAccentedCandidates(upperWord) {
  const lower = upperWord.toLowerCase();
  const url = `https://fr.wiktionary.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(lower)}&srlimit=12&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const items = data?.query?.search || [];

  const matches = [];
  for (const item of items) {
    const t = item.title;
    if (normalizeNoAccents(t) === upperWord && t !== lower) {
      matches.push(t);
    }
  }
  // Préférer les titres en minuscules (ex: "énol", "ère", "café", "étoile") avant les majuscules
  matches.sort((a, b) => {
    const aLower = a === a.toLowerCase() ? 0 : 1;
    const bLower = b === b.toLowerCase() ? 0 : 1;
    return aLower - bLower;
  });
  return matches.slice(0, 4);
}

export async function fetchDefinition(word) {
  const key = word.toUpperCase();
  if (defCache.has(key)) return defCache.get(key);

  const promise = (async () => {
    try {
      // 1. Essai direct en minuscules (avec vérification stricte de la section "== Français ==")
      const direct = await queryExtractByTitle(key.toLowerCase());
      const directParsed = direct ? parseFrenchExtract(direct.extract, direct.title) : null;
      if (directParsed) return directParsed;

      // 2. Recherche insensible aux accents (trouve "énol", "ère", "café", "étoile", "étaient"...)
      const candidates = await findAccentedCandidates(key);
      for (const cand of candidates) {
        const page = await queryExtractByTitle(cand);
        const parsed = page ? parseFrenchExtract(page.extract, page.title) : null;
        if (parsed) return parsed;
      }

      return {
        title: key.toLowerCase(),
        pos: 'Wiktionnaire',
        text: 'Définition introuvable sur le Wiktionnaire pour cette forme.'
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
