import { translations } from './translations';

/**
 * Brand rules for the copy of the rating, bowl and table flows (Оцінка Борщу
 * 2.0): our own sentences write «Борщ» with a capital letter, both languages
 * carry every string, and the UI never shows a dash, a hryvnia sign or emoji.
 * The add flow and the map keep their own copy and are not checked here.
 */

const { uk, en } = translations;

// keys that belong to the add flow only, which keeps the lower case for now
const ADD_ONLY = new Set(['flow.qMeatType', 'flow.addedText', 'flow.stageBorsch']);
const FLOW_KEY = /^(rate|flow|bowl|table|facts|r3|taste)\./;
const flowKeys = Object.keys(uk).filter((k) => FLOW_KEY.test(k) && !ADD_ONLY.has(k));

describe('flow copy', () => {
  it('writes «Борщ» with a capital letter in our own Ukrainian sentences', () => {
    const lower = flowKeys.filter((k) => /(^|[^\p{L}ʼ'])борщ/u.test(uk[k]));
    expect(lower).toEqual([]);
  });

  it('«Покажи свій Борщ»', () => {
    expect(uk['flow.photoTitle']).toBe('Покажи свій Борщ');
  });

  it('every table string is in both languages', () => {
    const tableUk = Object.keys(uk).filter((k) => k.startsWith('table.') && !/_(one|few)$/.test(k));
    const missing = tableUk.filter((k) => !(k in en));
    expect(missing).toEqual([]);
  });

  // the four letters Ukrainian does not have, as escapes so this file passes the no-russian check itself
  it('no dashes, no hryvnia sign, no emoji, no Russian letters in the table and bowl copy', () => {
    const keys = Object.keys(uk).filter((k) => /^(table|bowl)\./.test(k) || k === 'card.tableHere');
    const bad = [];
    keys.forEach((k) => {
      [uk[k], en[k]].filter(Boolean).forEach((s) => {
        if (/[—–₴]/.test(s) || /\p{Extended_Pictographic}/u.test(s) || /[\u044B\u044D\u044A\u0451]/i.test(s)) bad.push(`${k}: ${s}`);
      });
    });
    expect(bad).toEqual([]);
  });

  it('English says borshch, never borsch', () => {
    const keys = Object.keys(en).filter((k) => /^(table|bowl)\./.test(k));
    // {borsch} is a placeholder, not a word on screen
    expect(keys.filter((k) => /\bborsch\b/i.test(en[k].replace(/\{\w+\}/g, '')))).toEqual([]);
  });
});

// Оцінювання 3.0 (NAV-216): the rating, its closing screen, the card and the filters
describe('Оцінювання 3.0 copy', () => {
  const NEW = /^(r3|taste|filter\.(trait|describe|new|traitHint))\b/;
  const keys = Object.keys(uk).filter((k) => NEW.test(k));

  it('every string is in both languages', () => {
    expect(keys.length).toBeGreaterThan(100);
    expect(keys.filter((k) => !(k in en))).toEqual([]);
  });

  it('no dashes, no hryvnia sign, no emoji, no Russian letters', () => {
    const bad = [];
    keys.forEach((k) => {
      [uk[k], en[k]].filter(Boolean).forEach((s) => {
        if (/[\u2013\u2014\u20B4]/.test(s) || /\p{Extended_Pictographic}/u.test(s) || /[\u044B\u044D\u044A\u0451]/i.test(s)) bad.push(`${k}: ${s}`);
      });
    });
    expect(bad).toEqual([]);
  });

  it('English says borshch, never borsch', () => {
    expect(keys.filter((k) => /\bborsch\b/i.test(en[k]))).toEqual([]);
  });

  it('the guide and the FAQ describe the new rating', () => {
    expect(uk['guide.rateText']).toMatch(/Шість складників/);
    expect(uk['faq.a3']).toMatch(/шість складників/);
    expect(en['guide.rateText']).toMatch(/Six parts/);
    expect(uk['faq.a3']).not.toMatch(/сім екранів/);
  });
});
