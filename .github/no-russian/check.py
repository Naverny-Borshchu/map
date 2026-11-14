"""Гвардія: у репозиторії немає російської — ні в інтерфейсі, ні в коментарях.

28.10.2026 на проді в DevTools знайшли `'Пользователь'` (NAV-184). Поруч
лежали ще десятки російських коментарів і повідомлень у консоль, а одне —
«Назва населенного пункта» — було видно в полі вибору міста. Перевірка «на
око» їх не ловила роками, тому тепер це перевіряє CI.

Як рахуємо. Беремо кожне кириличне слово з файлів під git і питаємо два
словники (pymorphy3, uk і ru):
  * є літера ы, э, ъ або ё — це російське слово, без варіантів;
  * російський словник слово знає, а український ні — теж російське.
Слова, яких не знає жоден словник (сленг, основи, власні назви), пропускаємо:
інакше перевірка падала б на кожному «деплої» і «апці».

Хибні спрацювання бувають: український словник не знає частини сленгу
(«апка», «дев», «вау»). Такі слова дописуються в allow.txt поруч, по одному
в рядку. Рядок, де російські літери потрібні як дані (таблиця транслітерації),
позначається коментарем `lang-check: allow` у тому ж рядку.

Запуск: python .github/no-russian/check.py  (з кореня репозиторію)
"""
import pathlib
import re
import subprocess
import sys

import pymorphy3

ROOT = pathlib.Path(__file__).resolve().parents[2]
ALLOW = {
    w.strip().lower()
    for w in (ROOT / '.github/no-russian/allow.txt').read_text(encoding='utf-8').splitlines()
    if w.strip() and not w.startswith('#')
}
# Сама гвардія називає російські слова, щоб пояснити, що шукає.
SKIP = re.compile(r'^\.github/no-russian/|(^|/)(package-lock\.json|yarn\.lock)$|\.min\.(js|css)$')
WORD = re.compile(r"[А-Яа-яЁёІіЇїЄєҐґ]+(?:['ʼ’‘][А-Яа-яЁёІіЇїЄєҐґ]+)*")
RU_LETTERS = set('ыэъёЫЭЪЁ')
UK_LETTERS = set('іїєґІЇЄҐ')
MARKER = 'lang-check: allow'

UK = pymorphy3.MorphAnalyzer(lang='uk')
RU = pymorphy3.MorphAnalyzer(lang='ru')
_seen = {}


def is_russian(word):
    w = re.sub("[ʼ’‘]", "'", word.lower())
    if w not in _seen:
        if set(w) & RU_LETTERS:
            _seen[w] = True
        elif set(w) & UK_LETTERS or len(w) < 2 or w in ALLOW:
            _seen[w] = False
        else:
            _seen[w] = RU.word_is_known(w) and not UK.word_is_known(w)
    return _seen[w]


def main():
    files = subprocess.run(['git', 'ls-files', '-z'], cwd=ROOT, check=True,
                           capture_output=True).stdout.decode().split('\0')
    found = 0
    for name in filter(None, files):
        if SKIP.search(name):
            continue
        raw = (ROOT / name).read_bytes()
        if b'\0' in raw[:8192]:
            continue
        for n, line in enumerate(raw.decode('utf-8', 'replace').splitlines(), 1):
            if MARKER in line:
                continue
            # м\'ясо в Python-рядку і м`ясо в даних — це апостроф, а не межа слова
            text = re.sub(r"\\'|`", "'", line)
            hits = [w for w in WORD.findall(text) if is_russian(w)]
            if hits:
                found += 1
                print(f'{name}:{n}: {", ".join(hits)}\n    {line.strip()[:160]}')
    if found:
        print(f'\n{found} рядк(ів) з російськими словами. Перекладіть українською; '
              f'якщо слово українське, а словник його не знає, допишіть його в '
              f'.github/no-russian/allow.txt.')
        return 1
    print('Російських слів не знайдено.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
