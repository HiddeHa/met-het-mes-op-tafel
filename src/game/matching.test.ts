import { describe, expect, it } from 'vitest';
import { isCorrectAnswer, normalize } from './matching';
import type { Question } from './types';

const geo: Question = {
  id: 'geo-test',
  category: 'Geografie',
  difficulty: 1,
  question: 'Wat is de hoofdstad van Australië?',
  answers: ['Canberra'],
};

const history: Question = {
  id: 'ges-test',
  category: 'Geschiedenis',
  difficulty: 1,
  question: 'In welk jaar begon de Tweede Wereldoorlog?',
  answers: ['1939', '1 september 1939'],
};

const art: Question = {
  id: 'kun-test',
  category: 'Kunst',
  difficulty: 2,
  question: 'Welk museum?',
  answers: ['Vrede van Münster', 'Münster'],
};

describe('normalize', () => {
  it('strips accents, casing and punctuation', () => {
    expect(normalize('  De  Canbérra! ')).toBe('de canberra');
    expect(normalize('Münster')).toBe('munster');
    expect(normalize("Ain't No Mountain")).toBe('aint no mountain');
  });
});

describe('isCorrectAnswer', () => {
  it('accepts capitals and surrounding words', () => {
    expect(isCorrectAnswer(geo, 'canberra')).toBe(true);
    expect(isCorrectAnswer(geo, 'Canberra, Australië')).toBe(true);
    expect(isCorrectAnswer(geo, 'De hoofdstad is Canberra')).toBe(true);
  });

  it('accepts any listed alternative', () => {
    expect(isCorrectAnswer(history, '1939')).toBe(true);
    expect(isCorrectAnswer(history, '1 september 1939')).toBe(true);
    expect(isCorrectAnswer(art, 'munster')).toBe(true);
  });

  it('allows a single typo in longer answers', () => {
    expect(isCorrectAnswer(geo, 'Canbera')).toBe(true);
    expect(isCorrectAnswer(history, '1938')).toBe(false);
  });

  it('rejects wrong or empty answers', () => {
    expect(isCorrectAnswer(geo, 'Sydney')).toBe(false);
    expect(isCorrectAnswer(geo, '')).toBe(false);
    expect(isCorrectAnswer(geo, '   ')).toBe(false);
  });
});
