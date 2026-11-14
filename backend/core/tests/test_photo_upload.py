"""
upload_photo приймає лише фото (JPEG, PNG, HEIC/HEIF) і не довіряє імені файлу.

До NAV-176 (18.10.2026) сюди проходив будь-який файл, а розширення бралось з
імені від клієнта: `x.html` лягав у /media/ і віддавався як text/html з домену
застосунку. Ці тести падають на старому upload_photo.
"""

import base64
import io
import os
import shutil
import tempfile
from decimal import Decimal
from unittest import mock

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from core.models import Borsch, Place, PlaceType


# Справжній HEIC 640×480 з Apple-кодувальника (sips на macOS, 18.10.2026),
# той самий, що пише айфон: ftyp heic + mif1 MiPr miaf MiHB heic.
REAL_HEIC = base64.b64decode(
    'AAAAJGZ0eXBoZWljAAAAAG1pZjFNaVBybWlhZk1pSEJoZWljAAABhG1ldGEAAAAAAAAAIWhkbHIA'
    'AAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAA'
    'AAABAAAADnBpdG0AAAAAAAEAAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABodmMxAAAAAORp'
    'cHJwAAAAw2lwY28AAAATY29scm5jbHgAAgACAAaAAAAADGNsbGkAywBAAAAAFGlzcGUAAAAAAAAC'
    'gAAAAeAAAAAJaXJvdAAAAAAQcGl4aQAAAAADCAgIAAAAb2h2Y0MBA3AAAACwAAAAAABa8AD8/fj4'
    'AAALA6AAAQAXQAEMAf//A3AAAAMAsAAAAwAAAwBacCShAAEAIUIBAQNwAAADALAAAAMAAAMAWqAF'
    'AgHhYh7kWVTcCAgYAqIAAQAJRAHAYXLIQFMkAAAAGWlwbWEAAAAAAAAAAQABBoECAwWGhAAAAB5p'
    'bG9jAAAAAEQAAAEAAQAAAAEAAAG4AAAC8gAAAAFtZGF0AAAAAAAAAwIAAALuKAGvjz0FCV8fZMjr'
    '98sXH01Gw+3Au0OH5uOPfxHfLR4bzv2DvSsqZ/6EInCI5ozoEc2zRWlFu2qJ70+0uTQiuHT+olsC'
    'q2bJ3j40bcaSGjKVfXUfRBtBZw1njaD8fSmiD0A9c0Bg6HK86QERy16ouY12yAOsihQXXxyhxVwZ'
    'wRTdRBVioAAAAwBPQCIaP/dRSSIwh/4Yzhge/EHuoDLAX60/5ovafI1vnxbgAAADAAacLrUAtbPE'
    'etbpUCK290oNoxT+7AiXkT1AXvFIEUjUeUh1Ol/5MUngO+AdWBY4FSwjsFCgSwG4DABVgvgmQmJy'
    'KqUDvZuwBB8/8iE39xNqeweV9HV3IMiRBZMtgAAABNQ5+FlfHlPLsfpeJvEaB34BlqBYO8/yy42u'
    '3sZIPw7yPyLpfSMGzmIgBS5/0fQWAyKphwRHERZqC3/OaViiLMD8Vlgg7aj+9VQwizn6wwkttFbn'
    'BoHRrpSs5EK1j3nh6L8/8LbGqjJOpJrVAnZY3XmhhEjwm/Fc4k+S+zeCyLoAAAMABRxXP0x8KC6E'
    '9rWphNG8ZR4dvEgGsgOB67Yt25GOs+Gg9Pw3RfNhDtD8oxGg8TNO2UW+SrgDt9K9j2Enlq4Dd4PA'
    'X1jFE/PcHYjcdaNyfohEF/ys0PteQmjFVIXbM+yL9b70LWFteH5r0lyyGTPKKpMaiCapoxNxwjwD'
    'yp8nIu7AYiuKLveZpt5i5KBDsTnCAjtGcc+CZfoH9BaaJiopN9RvhFDeldrKOsiIWyNAbJEg9b8G'
    'vtww0kGuG58Fmcyi6GmBbGCYMEo5nhybnR4Nr1kR065hJt0UY3fz8Sh3YMvH6wPeJ744/676HPOH'
    'OyJG2v7vY/hfpuqAAADQgJ01ow20XJV6EEGnuYaM9lQEUnsMiTH6+/+hfos9rzBCNUV4AAAXUNgf'
    '+3a77VD2HDVnpALaD7aeGD7HBiK+dM3qtTlTxfBSXQSAX7O2HqLoTgdAk48HvpzBuJfE3fd7'
)

# Справжній AVIF (ImageMagick 6 + libheif): ftyp avif + avif mif1 miaf.
REAL_AVIF = base64.b64decode(
    'AAAAHGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZgAAAOptZXRhAAAAAAAAACFoZGxyAAAAAAAAAABw'
    'aWN0AAAAAAAAAAAAAAAAAAAAAA5waXRtAAAAAAABAAAAImlsb2MAAAAAREAAAQABAAAAAAEOAAEA'
    'AAAAAAAAmwAAACNpaW5mAAAAAAABAAAAFWluZmUCAAAAAAEAAGF2MDEAAAAAamlwcnAAAABLaXBj'
    'bwAAABNjb2xybmNseAABAA0ABoAAAAAMYXYxQ4EEDAAAAAAUaXNwZQAAAAAAAAKAAAAB4AAAABBw'
    'aXhpAAAAAAMICAgAAAAXaXBtYQAAAAAAAAABAAEEAYIDBAAAAKNtZGF0EgAKChkmJ/77BAQ0GhAy'
    'igESAAKKKKEAwUiou6DMDqmiuWiYT66fiETS6w6GBOmtBB3XR/EhItWRF+mfQgygjgKV/RiA0w3C'
    'MJgyWPickId7HKTANchDRdoO1dvNkvoKMw4Syekbyt/Tkn65DgLCWgNONTBQo112mnFO0eViZ490'
    '4I6IubOpBBVYIVvpoMkTgUtLP9YNk5lHU6Q='
)


def jpeg_bytes(size=(64, 48), exif_gps=False):
    buf = io.BytesIO()
    im = Image.new('RGB', size, (155, 27, 48))
    kwargs = {}
    if exif_gps:
        exif = Image.Exif()
        exif[0x8825] = {1: 'N', 2: (50.0, 28.0, 55.0), 3: 'E', 4: (30.0, 31.0, 4.0)}
        kwargs['exif'] = exif.tobytes()
    im.save(buf, 'JPEG', **kwargs)
    return buf.getvalue()


def iphone_hdr_jpeg_bytes():
    """JPEG + другий кадр (MPF), як HDR-фото з айфона: Pillow читає його як MPO."""
    buf = io.BytesIO()
    base = Image.new('RGB', (64, 48), (155, 27, 48))
    gain_map = Image.new('RGB', (32, 24), (128, 128, 128))
    base.save(buf, 'MPO', save_all=True, append_images=[gain_map])
    return buf.getvalue()


def png_bytes():
    buf = io.BytesIO()
    Image.new('RGBA', (32, 32), (155, 27, 48, 128)).save(buf, 'PNG')
    return buf.getvalue()


def ftyp(major, *compatible):
    """Початок ISO BMFF-файлу, як у HEIC з айфона: ftyp + бренди + шматок meta."""
    brands = b''.join(compatible)
    box = (16 + len(brands)).to_bytes(4, 'big') + b'ftyp' + major + b'\x00\x00\x00\x00' + brands
    return box + b'\x00\x00\x00\x2cmeta' + b'\x00' * 64


class UploadPhotoOnlyImagesTest(APITestCase):

    @classmethod
    def setUpTestData(cls):
        place_type = PlaceType.objects.create(code='RESTAURANT', label='Ресторан')
        place = Place.objects.create(
            name='DEDA', address='Shalom Aleichem St 14', location_lat=Decimal('32.07'),
            location_lng=Decimal('34.77'), country='Israel', city='Tel Aviv-Yafo', type=place_type,
        )
        cls.borsch = Borsch.objects.create(
            place=place, name='Borsch', type_meat='beef', price_uah=Decimal('735.00'),
            weight_grams=500, photo_urls=[],
        )

    def setUp(self):
        self.user = User.objects.create_user(username='u', email='u@example.com', password='x' * 12)
        self.client.force_authenticate(self.user)
        self.media = tempfile.mkdtemp(prefix='test_media_')
        self.override = override_settings(MEDIA_ROOT=self.media, MEDIA_URL='/media/')
        self.override.enable()
        self.url = f'/api/borsches/{self.borsch.id}/upload_photo/'

    def tearDown(self):
        self.override.disable()
        shutil.rmtree(self.media, ignore_errors=True)

    def upload(self, name, content, content_type='image/jpeg'):
        return self.client.post(
            self.url, {'photo': SimpleUploadedFile(name, content, content_type=content_type)}, format='multipart',
        )

    def stored_files(self):
        found = []
        for root, _, files in os.walk(self.media):
            found += [os.path.join(root, f) for f in files]
        return found

    def assertRejected(self, response, code=status.HTTP_400_BAD_REQUEST):
        self.assertEqual(response.status_code, code, response.data)
        self.assertIn('error', response.data)
        self.assertEqual(self.stored_files(), [])
        self.borsch.refresh_from_db()
        self.assertEqual(self.borsch.photo_urls, [])

    # --- що проходить ----------------------------------------------------

    def test_jpeg_is_stored_as_jpg_whatever_the_client_called_it(self):
        response = self.upload('IMG_4821.JPEG', jpeg_bytes())
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(response.data['photo_url'].endswith('.jpg'))
        self.borsch.refresh_from_db()
        self.assertEqual(len(self.borsch.photo_urls), 1)

    def test_a_real_jpeg_named_html_is_saved_as_jpg_not_html(self):
        response = self.upload('page.html', jpeg_bytes(), content_type='text/html')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(response.data['photo_url'].endswith('.jpg'))
        self.assertFalse(any(f.endswith('.html') for f in self.stored_files()))

    def test_iphone_hdr_jpeg_with_gain_map_is_accepted_as_jpg(self):
        content = iphone_hdr_jpeg_bytes()
        with Image.open(io.BytesIO(content)) as im:
            self.assertEqual(im.format, 'MPO')   # саме те, що спіткнуло першу версію
        response = self.upload('IMG_5512.jpeg', content)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(response.data['photo_url'].endswith('.jpg'))

    def test_png_is_stored_as_png(self):
        response = self.upload('screenshot.png', png_bytes(), content_type='image/png')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(response.data['photo_url'].endswith('.png'))

    def test_iphone_heic_is_accepted(self):
        response = self.upload('IMG_0001.HEIC', ftyp(b'heic', b'mif1', b'heic'), content_type='image/heic')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(response.data['photo_url'].endswith('.heic'))

    def test_a_real_apple_heic_file_is_accepted(self):
        response = self.upload('IMG_0002.HEIC', REAL_HEIC, content_type='image/heic')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(response.data['photo_url'].endswith('.heic'))
        [stored] = self.stored_files()
        with open(stored, 'rb') as fh:
            self.assertEqual(fh.read(), REAL_HEIC)

    def test_generic_heif_is_accepted(self):
        response = self.upload('photo.heif', ftyp(b'mif1', b'mif1'), content_type='image/heif')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(response.data['photo_url'].endswith('.heif'))

    def test_the_file_is_stored_byte_for_byte_so_gps_survives(self):
        original = jpeg_bytes(exif_gps=True)
        response = self.upload('with-gps.jpg', original)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        [stored] = self.stored_files()
        with open(stored, 'rb') as fh:
            self.assertEqual(fh.read(), original)
        with Image.open(stored) as im:
            self.assertTrue(im.getexif().get_ifd(0x8825))

    # --- що не проходить -------------------------------------------------

    def test_html_disguised_as_jpg_is_rejected(self):
        self.assertRejected(self.upload('borsch.jpg', b'<html><script>alert(1)</script></html>'))

    def test_svg_is_rejected(self):
        svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        self.assertRejected(self.upload('borsch.svg', svg, content_type='image/svg+xml'))

    def test_gif_is_rejected(self):
        buf = io.BytesIO()
        Image.new('RGB', (8, 8)).save(buf, 'GIF')
        self.assertRejected(self.upload('a.gif', buf.getvalue(), content_type='image/gif'))

    def test_jpeg_signature_with_garbage_behind_it_is_rejected(self):
        self.assertRejected(self.upload('broken.jpg', b'\xff\xd8\xff\xe0' + b'not really a jpeg' * 10))

    def test_avif_is_not_mistaken_for_heif(self):
        self.assertRejected(self.upload('a.avif', ftyp(b'avif', b'mif1', b'miaf'), content_type='image/avif'))

    def test_a_real_avif_file_is_rejected(self):
        self.assertRejected(self.upload('a.avif', REAL_AVIF, content_type='image/avif'))

    def test_empty_file_is_rejected(self):
        self.assertRejected(self.upload('empty.jpg', b''))

    def test_too_large_is_413(self):
        with mock.patch('core.photo_upload.MAX_PHOTO_BYTES', 100):
            self.assertRejected(self.upload('big.jpg', jpeg_bytes(size=(400, 400))),
                                code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)

    def test_guest_still_cannot_upload(self):
        self.client.force_authenticate(None)
        response = self.upload('a.jpg', jpeg_bytes())
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
        self.assertEqual(self.stored_files(), [])
