export type ToneAnalysis = {
  aggressive: boolean;
  score: number;
  signals: string[];
  reformulatedText: string | null;
  engine: 'duecase-tonemeter-v1';
};

const INSULT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(idiota|idioti|idiota)\b/giu, label: 'insulto diretto' },
  { pattern: /\b(cretino|cretina|cretini|cretine)\b/giu, label: 'insulto diretto' },
  { pattern: /\b(stupido|stupida|stupidi|stupide)\b/giu, label: 'insulto diretto' },
  { pattern: /\b(coglione|cogliona|coglioni)\b/giu, label: 'insulto diretto' },
  { pattern: /\b(stronzo|stronza|stronzi|stronze)\b/giu, label: 'insulto diretto' },
  { pattern: /\b(incapace|incapaci)\b/giu, label: 'svalutazione personale' },
  { pattern: /\b(bugiardo|bugiarda|bugiardi|bugiarde)\b/giu, label: 'accusa personale' },
  { pattern: /\b(ridicolo|ridicola|ridicoli|ridicole)\b/giu, label: 'svalutazione personale' },
  { pattern: /\bvaffanculo\b/giu, label: 'volgarità aggressiva' },
  { pattern: /\b(fanculo)\b/giu, label: 'volgarità aggressiva' },
  { pattern: /\b(non capisci niente|non capisci un cazzo)\b/giu, label: 'svalutazione diretta' },
];

const THREAT_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(te la far[oò] pagare|me la pagherai)\b/giu, label: 'minaccia' },
  { pattern: /\b(ti rovino|ti distruggo)\b/giu, label: 'minaccia' },
  { pattern: /\b(vedrai cosa ti succede|vedrai che fine fai)\b/giu, label: 'minaccia' },
];

const DIPLOMATIC_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bnon capisci niente\b/giu, 'credo che ci sia un’incomprensione'],
  [/\bnon capisci un cazzo\b/giu, 'credo che ci sia un’incomprensione'],
  [/\bsei (un |una )?(idiota|cretino|cretina|stupido|stupida|coglione|cogliona|stronzo|stronza|incapace|bugiardo|bugiarda|ridicolo|ridicola)\b/giu, 'non condivido il modo in cui questa situazione è stata gestita'],
  [/\b(vaffanculo|fanculo)\b/giu, 'vorrei evitare toni offensivi'],
  [/\b(te la far[oò] pagare|me la pagherai|ti rovino|ti distruggo)\b/giu, 'vorrei affrontare la questione attraverso modalità corrette e rispettose'],
  [/\btu non fai mai\b/giu, 'in questa situazione non mi risulta che sia stato fatto'],
  [/\btu fai sempre\b/giu, 'in questa situazione mi sembra che sia successo più volte'],
  [/\bsei sempre\b/giu, 'in questa situazione sei stato/a'],
  [/\bsei mai\b/giu, 'in questa situazione sei'],
];

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

function uppercaseRatio(text: string): number {
  const letters = [...text].filter((char) => /[A-Za-zÀ-ÖØ-öø-ÿ]/u.test(char));
  if (letters.length === 0) return 0;
  const uppercase = letters.filter((char) => char === char.toUpperCase() && char !== char.toLowerCase());
  return uppercase.length / letters.length;
}

function sentenceCase(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function buildDiplomaticVersion(input: string): string {
  let text = input.trim();

  for (const [pattern, replacement] of DIPLOMATIC_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  text = text
    .replace(/!{2,}/g, '.')
    .replace(/\?{3,}/g, '?')
    .replace(/\.{3,}/g, '.')
    .replace(/\s+/g, ' ')
    .trim();

  if (uppercaseRatio(text) > 0.55) {
    text = text.toLocaleLowerCase('it-IT');
  }

  text = sentenceCase(text);
  if (text && !/[.!?]$/.test(text)) text += '.';

  const opening = 'Vorrei affrontare questo punto in modo chiaro e rispettoso.';
  const closing = 'Ti propongo di concentrarci su una soluzione concreta nell’interesse dei figli.';

  if (!text) return `${opening} ${closing}`;
  return `${opening} ${text} ${closing}`;
}

export function analyzeTone(text: string): ToneAnalysis {
  let score = 0;
  const signals = new Set<string>();

  for (const item of INSULT_PATTERNS) {
    const matches = countMatches(text, item.pattern);
    if (matches > 0) {
      score += matches * 3;
      signals.add(item.label);
    }
  }

  for (const item of THREAT_PATTERNS) {
    const matches = countMatches(text, item.pattern);
    if (matches > 0) {
      score += matches * 5;
      signals.add(item.label);
    }
  }

  const letters = [...text].filter((char) => /[A-Za-zÀ-ÖØ-öø-ÿ]/u.test(char)).length;
  if (letters >= 12 && uppercaseRatio(text) >= 0.55) {
    score += 2;
    signals.add('uso esteso di maiuscole');
  }

  if ((text.match(/!/g) ?? []).length >= 3) {
    score += 1;
    signals.add('punteggiatura aggressiva');
  }

  if (/\b(tu|te)\b.{0,20}\b(sempre|mai|colpa tua|vergognati)\b/iu.test(text)) {
    score += 1;
    signals.add('accusa personale');
  }

  const aggressive = score >= 3;

  return {
    aggressive,
    score,
    signals: [...signals],
    reformulatedText: aggressive ? buildDiplomaticVersion(text) : null,
    engine: 'duecase-tonemeter-v1',
  };
}
