"""
Що можна завантажити як фото борщу.

Навіщо. До 18.10.2026 upload_photo зберігав будь-який файл і брав розширення
з імені, яке прислав клієнт. Файли лягають у MEDIA_ROOT, а nginx віддає їх з
того самого домену, що й застосунок (map.navernyborshchu.com), де в
localStorage лежать JWT. Тобто будь-який залогінений міг залити `x.html` або
SVG зі скриптом і отримати виконання коду на нашому origin (NAV-176).

Тепер приймаємо лише те, що реально знімає телефон: JPEG, PNG і HEIC/HEIF
(айфон). Тип визначаємо за вмістом, а не за іменем чи Content-Type від
клієнта, і розширення на диску ставимо за визначеним типом.

Метадані (EXIF, зокрема GPS) не чіпаємо: файл зберігається байт у байт.
"""

from PIL import Image, UnidentifiedImageError

# Те саме, що client_max_body_size на /api/ у nginx: більше туди не доїде,
# а якщо nginx колись послаблять, бекенд не мусить приймати що завгодно.
MAX_PHOTO_BYTES = 10 * 1024 * 1024

# тип → розширення на диску
EXTENSIONS = {
    'jpeg': '.jpg',
    'png': '.png',
    'heic': '.heic',
    'heif': '.heif',
}

# HEIC/HEIF — контейнер ISO BMFF: `....ftyp<major><minor><compatible...>`.
# Pillow без плагіна pillow-heif їх не відкриває, тож дивимось на бренди.
_HEIC_BRANDS = {b'heic', b'heix', b'hevc', b'hevx', b'heim', b'heis', b'hevm', b'hevs'}
_HEIF_BRANDS = {b'mif1', b'msf1'}
# AVIF живе в тому самому контейнері й теж несе mif1, але це не фото з телефона
_NOT_HEIF = {b'avif', b'avis'}

# MPO — це JPEG з кількома кадрами. Так айфон пише HDR-фото (другий кадр —
# gain map, маркер AMPF): Pillow бачить «MPO», браузер — звичайний JPEG.
# Без цього рядка відкидались справжні фото з iPhone 17 (перевірено на трьох
# знімках з проду від 11.10.2026).
_PILLOW_FORMATS = {'JPEG': 'jpeg', 'MPO': 'jpeg', 'PNG': 'png'}


class PhotoRejected(ValueError):
    """Файл не є фото дозволеного типу; message іде користувачу."""

    def __init__(self, message, too_large=False):
        super().__init__(message)
        self.too_large = too_large


def _ftyp_kind(head: bytes):
    if len(head) < 16 or head[4:8] != b'ftyp':
        return None
    box_size = int.from_bytes(head[0:4], 'big')
    major = head[8:12]
    if major in _NOT_HEIF:
        return None
    end = min(box_size, len(head)) if box_size >= 16 else len(head)
    compatible = {head[i:i + 4] for i in range(16, end - 3, 4)}
    brands = {major} | compatible
    if brands & _NOT_HEIF and not brands & _HEIC_BRANDS:
        return None
    if brands & _HEIC_BRANDS:
        return 'heic'
    if brands & _HEIF_BRANDS:
        return 'heif'
    return None


def detect_photo_kind(uploaded) -> str:
    """
    Повертає 'jpeg' | 'png' | 'heic' | 'heif' або кидає PhotoRejected.

    `uploaded` — UploadedFile з request.FILES. Позицію читання повертаємо на
    початок, щоб файл можна було далі зберегти через .chunks().
    """
    size = getattr(uploaded, 'size', None)
    if size is not None and size > MAX_PHOTO_BYTES:
        raise PhotoRejected('Фото завелике: максимум 10 МБ.', too_large=True)
    if not size:
        raise PhotoRejected('Файл порожній.')

    uploaded.seek(0)
    head = uploaded.read(64)
    uploaded.seek(0)

    kind = _ftyp_kind(head)
    if kind:
        return kind

    if head.startswith(b'\xff\xd8\xff') or head.startswith(b'\x89PNG\r\n\x1a\n'):
        # Сигнатура ще нічого не доводить: перевіряємо, що Pillow справді
        # розбирає це як картинку того самого формату.
        try:
            with Image.open(uploaded) as im:
                fmt = im.format
                im.verify()
        except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError):
            raise PhotoRejected('Файл пошкоджений або це не фото.')
        finally:
            uploaded.seek(0)
        if fmt in _PILLOW_FORMATS:
            return _PILLOW_FORMATS[fmt]

    raise PhotoRejected('Підходять лише фото: JPG, PNG або HEIC з айфона.')
