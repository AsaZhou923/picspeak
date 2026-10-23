from __future__ import annotations

import sys
import unittest
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from PIL import Image, ImageCms
from PIL.TiffImagePlugin import IFDRational

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers.photos import get_photo_image
from app.services.image_metadata import strip_image_metadata

GPS_IFD = 0x8825
ORIENTATION = 0x0112


def _exif(*, orientation: int | None = None) -> Image.Exif:
    exif = Image.Exif()
    if orientation is not None:
        exif[ORIENTATION] = orientation
    exif[0x010F] = 'CameraMaker'
    gps = exif.get_ifd(GPS_IFD)
    gps[1] = 'N'
    gps[2] = (IFDRational(35), IFDRational(41), IFDRational(22))
    gps[3] = 'E'
    gps[4] = (IFDRational(139), IFDRational(41), IFDRational(30))
    return exif


def _source_image() -> Image.Image:
    image = Image.new('RGB', (48, 24))
    for x in range(48):
        for y in range(24):
            image.putpixel((x, y), ((x * 5) % 256, (y * 9) % 256, (x * y) % 256))
    return image


def _encode(format_name: str, *, orientation: int | None = None, **options) -> bytes:
    output = BytesIO()
    _source_image().save(output, format=format_name, exif=_exif(orientation=orientation).tobytes(), **options)
    return output.getvalue()


def _decoded(data: bytes) -> tuple[Image.Image, Image.Exif]:
    image = Image.open(BytesIO(data))
    exif = image.getexif()
    image.load()
    return image, exif


class StripImageMetadataTests(unittest.TestCase):
    def assert_no_location(self, data: bytes) -> None:
        _, exif = _decoded(data)
        self.assertEqual(dict(exif.get_ifd(GPS_IFD)), {})
        self.assertNotIn(0x010F, exif)
        self.assertNotIn(b'CameraMaker', data)

    def test_jpeg_drops_gps_and_keeps_pixels_losslessly(self) -> None:
        original = _encode('JPEG', quality=90)
        with Image.open(BytesIO(original)) as image:
            self.assertTrue(image.getexif().get_ifd(GPS_IFD))

        stripped = strip_image_metadata(original, 'image/jpeg')

        self.assert_no_location(stripped)
        self.assertNotIn(b'Exif\x00\x00', stripped)
        self.assertEqual(_decoded(stripped)[0].tobytes(), _decoded(original)[0].tobytes())

    def test_jpeg_keeps_only_the_orientation_tag(self) -> None:
        original = _encode('JPEG', orientation=6, quality=90)

        stripped = strip_image_metadata(original, 'image/jpeg')

        image, exif = _decoded(stripped)
        self.assertEqual(dict(exif), {ORIENTATION: 6})
        self.assert_no_location(stripped)
        self.assertEqual(image.tobytes(), _decoded(original)[0].tobytes())

    def test_progressive_jpeg_with_comment_and_icc_profile(self) -> None:
        icc = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
        original = _encode('JPEG', quality=85, progressive=True, icc_profile=icc, comment=b'shot at home')

        stripped = strip_image_metadata(original, 'image/jpeg')

        image, _ = _decoded(stripped)
        self.assert_no_location(stripped)
        self.assertNotIn(b'shot at home', stripped)
        self.assertEqual(image.info.get('icc_profile'), icc)
        self.assertEqual(image.tobytes(), _decoded(original)[0].tobytes())

    def test_jpeg_drops_data_appended_after_end_of_image(self) -> None:
        hidden = _encode('JPEG')
        original = _encode('JPEG') + hidden

        stripped = strip_image_metadata(original, 'image/jpeg')

        self.assertTrue(stripped.endswith(b'\xff\xd9'))
        self.assertLess(len(stripped), len(original) - len(hidden) + 1)
        self.assert_no_location(stripped)

    def test_png_drops_exif_and_text_chunks(self) -> None:
        from PIL.PngImagePlugin import PngInfo

        info = PngInfo()
        info.add_text('Location', 'home address')
        original = _encode('PNG', pnginfo=info)

        stripped = strip_image_metadata(original, 'image/png')

        self.assert_no_location(stripped)
        self.assertNotIn(b'home address', stripped)
        self.assertEqual(_decoded(stripped)[0].tobytes(), _decoded(original)[0].tobytes())

    def test_png_with_orientation_is_reencoded_upright(self) -> None:
        original = _encode('PNG', orientation=6)

        stripped = strip_image_metadata(original, 'image/png')

        image, exif = _decoded(stripped)
        self.assertEqual(dict(exif), {})
        self.assertEqual(image.size, (24, 48))

    def test_webp_drops_exif_and_xmp_and_clears_flags(self) -> None:
        xmp = b'<x:xmpmeta xmlns:x="adobe:ns:meta/">GPSLatitude</x:xmpmeta>'
        original = _encode('WEBP', lossless=True, xmp=xmp)
        self.assertIn(b'EXIF', original)

        stripped = strip_image_metadata(original, 'image/webp')

        self.assert_no_location(stripped)
        self.assertNotIn(b'GPSLatitude', stripped)
        self.assertEqual(int.from_bytes(stripped[4:8], 'little'), len(stripped) - 8)
        if stripped[12:16] == b'VP8X':
            self.assertEqual(stripped[20] & 0x0C, 0)
        self.assertEqual(_decoded(stripped)[0].tobytes(), _decoded(original)[0].tobytes())

    def test_animated_images_with_orientation_keep_every_frame(self) -> None:
        colors = [(255, 0, 0), (0, 255, 0), (0, 0, 255)]
        frames = [Image.new('RGB', (40, 20), color) for color in colors]
        for format_name, content_type in (('WEBP', 'image/webp'), ('PNG', 'image/png')):
            with self.subTest(format=format_name):
                output = BytesIO()
                frames[0].save(
                    output,
                    format=format_name,
                    save_all=True,
                    append_images=frames[1:],
                    duration=[120, 80, 200],
                    loop=0,
                    exif=_exif(orientation=6).tobytes(),
                    **({'lossless': True} if format_name == 'WEBP' else {}),
                )

                stripped = strip_image_metadata(output.getvalue(), content_type)

                with Image.open(BytesIO(stripped)) as image:
                    self.assertEqual(image.n_frames, 3)
                    self.assertEqual(image.size, (20, 40))
                    self.assertEqual(dict(image.getexif().get_ifd(GPS_IFD)), {})
                    self.assertNotIn(ORIENTATION, image.getexif())
                    seen = []
                    for index in range(3):
                        image.seek(index)
                        seen.append(image.convert('RGB').getpixel((10, 20)))
                        self.assertEqual(image.info.get('duration'), [120, 80, 200][index])
                    # WebP animations are re-encoded lossily, so allow small channel drift.
                    for actual, expected in zip(seen, colors):
                        self.assertTrue(all(abs(a - b) <= 3 for a, b in zip(actual, expected)), (actual, expected))

    def test_metadata_free_images_are_unchanged_in_content(self) -> None:
        output = BytesIO()
        _source_image().save(output, format='PNG')
        original = output.getvalue()

        self.assertEqual(strip_image_metadata(original, 'image/png'), original)


class PhotoImageRouteTests(unittest.TestCase):
    def test_original_photo_route_serves_stripped_bytes(self) -> None:
        original = _encode('JPEG', orientation=3)
        photo = SimpleNamespace(content_type='image/jpeg')

        with (
            patch('app.api.routers.photos._find_photo_from_token', return_value=photo),
            patch('app.api.routers.photos._get_photo_object', return_value=(None, original)),
        ):
            response = get_photo_image('pho_test', photo_token='token', db=None)

        self.assertEqual(response.media_type, 'image/jpeg')
        self.assertEqual(response.headers['content-length'], str(len(response.body)))
        _, exif = _decoded(response.body)
        self.assertEqual(dict(exif), {ORIENTATION: 3})


if __name__ == '__main__':
    unittest.main()
