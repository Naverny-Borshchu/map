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
const FLOW_KEY = /^(rate|flow|bowl|table|facts)\./;
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

  it('no dashes, no hryvnia sign, no emoji, no Russian letters in the table and bowl copy', () => {
    const keys = Object.keys(uk).filter((k) => /^(table|bowl)\./.test(k) || k === 'card.tableHere');
    const bad = [];
    keys.forEach((k) => {
      [uk[k], en[k]].filter(Boolean).forEach((s) => {
        if (/[—–₴]/.test(s) || /\p{Extended_Pictographic}/u.test(s) || /[ыэъё]/i.test(s)) bad.push(`${k}: ${s}`);
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
