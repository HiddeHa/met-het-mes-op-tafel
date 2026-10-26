import type { Question } from './types';

const ARTICLES = new Set(['de', 'het', 'een', 'the', 'a', 'an', 'van', 'der', 'den']);

export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokens(value: string): string[] {
  return normalize(value)
    .split(' ')
    .filter((token) => token.length > 0 && !ARTICLES.has(token));
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function allowedTypos(length: number): number {
  if (length >= 10) return 2;
  if (length >= 5) return 1;
  return 0;
}

function matchesOne(guess: string, accepted: string): boolean {
  const g = tokens(guess);
  const a = tokens(accepted);
  if (!g.length || !a.length) return false;

  const guessJoined = g.join(' ');
  const acceptedJoined = a.join(' ');
  if (guessJoined === acceptedJoined) return true;

  // The guess may contain extra words ("Canberra, Australië").
  if (acceptedJoined.length >= 4 && ` ${guessJoined} `.includes(` ${acceptedJoined} `)) {
    return true;
  }

  // A short answer (usually a name) may be part of a longer guess without
  // forming a clean word boundary after normalization: "de stad canberra".
  if (a.length === 1 && a[0].length >= 4 && guessJoined.includes(a[0])) {
    return true;
  }

  // Minor typos on the full accepted phrase.
  const typoBudget = allowedTypos(acceptedJoined.length);
  if (typoBudget > 0) {
    if (levenshtein(guessJoined, acceptedJoined) <= typoBudget) return true;
    if (a.length === 1 && g.length === 1) {
      return levenshtein(g[0], a[0]) <= typoBudget;
    }
  }

  return false;
}

export function isCorrectAnswer(question: Question, guess: string): boolean {
  const normalizedGuess = normalize(guess);
  if (!normalizedGuess) return false;
  return question.answers.some((accepted) => matchesOne(normalizedGuess, accepted));
}
