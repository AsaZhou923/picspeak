"""Remove embedded metadata (EXIF, GPS, XMP, IPTC, comments) from stored photos.

Uploads keep the camera's original bytes, which can include the shooting
location. Any response that hands those bytes to a browser must go through
``strip_image_metadata`` first. JPEG, PNG and WebP are rewritten at the
container level so pixels and color profiles stay unchanged; only files that
need an orientation fix or cannot be parsed are re-encoded.
"""
from __future__ import annotations

import struct
from io import BytesIO

from PIL import Image, ImageOps, ImageSequence, UnidentifiedImageError

EXIF_ORIENTATION_TAG = 0x0112
_ORIENTATION_TRANSPOSE = {
    2: Image.Transpose.FLIP_LEFT_RIGHT,
    3: Image.Transpose.ROTATE_180,
    4: Image.Transpose.FLIP_TOP_BOTTOM,
    5: Image.Transpose.TRANSPOSE,
    6: Image.Transpose.ROTATE_270,
    7: Image.Transpose.TRANSVERSE,
    8: Image.Transpose.ROTATE_90,
}
_EXIF_HEADER = b'Exif\x00\x00'
_JPEG_STANDALONE_MARKERS = {0x01, *range(0xD0, 0xD8)}
_JPEG_APP1 = 0xE1
_JPEG_APP2 = 0xE2
_JPEG_APP13 = 0xED
_JPEG_COM = 0xFE
_JPEG_SOS = 0xDA
_JPEG_EOI = 0xD9
_PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'
_PNG_METADATA_CHUNKS = {b'eXIf', b'tEXt', b'zTXt', b'iTXt', b'tIME'}
_WEBP_METADATA_CHUNKS = {b'EXIF', b'XMP '}
_WEBP_VP8X_METADATA_FLAGS = 0x08 | 0x04


class ImageMetadataError(ValueError):
    pass


class _NeedsReencode(Exception):
    pass


def strip_image_metadata(data: bytes, content_type: str) -> bytes:
    """Return ``data`` without embedded metadata, preserving its displayed orientation."""
    try:
        if content_type == 'image/jpeg':
            return _strip_jpeg(data)
        if content_type == 'image/png':
            return _strip_png(data)
        if content_type == 'image/webp':
            return _strip_webp(data)
    except (_NeedsReencode, ImageMetadataError, struct.error, IndexError):
        pass
    return _reencode_without_metadata(data)


def _exif_orientation(data: bytes) -> int | None:
    try:
        with Image.open(BytesIO(data)) as image:
            orientation = image.getexif().get(EXIF_ORIENTATION_TAG)
    except (UnidentifiedImageError, OSError, ValueError):
        return None
    return orientation if isinstance(orientation, int) else None


def _orientation_only_exif(orientation: int) -> bytes:
    exif = Image.Exif()
    exif[EXIF_ORIENTATION_TAG] = orientation
    return exif.tobytes()


def _strip_jpeg(data: bytes) -> bytes:
    if data[:2] != b'\xff\xd8':
        raise ImageMetadataError('Missing JPEG start of image')
    orientation = _exif_orientation(data)
    # Browsers rotate JPEGs by EXIF orientation, so keep that single tag.
    replacement_exif = (
        _orientation_only_exif(orientation) if orientation is not None and orientation != 1 else None
    )
    output = bytearray(b'\xff\xd8')
    position = 2
    size = len(data)
    while True:
        if position >= size or data[position] != 0xFF:
            raise ImageMetadataError('Malformed JPEG marker')
        while position < size and data[position] == 0xFF:
            position += 1
        if position >= size:
            raise ImageMetadataError('Truncated JPEG marker')
        marker = data[position]
        position += 1
        if marker == _JPEG_EOI:
            # Drop anything appended after the primary image, such as MPF
            # secondary images that carry their own EXIF blocks.
            output += b'\xff\xd9'
            return bytes(output)
        if marker in _JPEG_STANDALONE_MARKERS:
            output += bytes((0xFF, marker))
            continue
        if position + 2 > size:
            raise ImageMetadataError('Truncated JPEG segment')
        length = int.from_bytes(data[position:position + 2], 'big')
        if length < 2 or position + length > size:
            raise ImageMetadataError('Invalid JPEG segment length')
        segment = data[position:position + length]
        position += length
        payload = segment[2:]
        if marker == _JPEG_APP1:
            if replacement_exif is not None and payload.startswith(_EXIF_HEADER):
                output += b'\xff\xe1' + (len(replacement_exif) + 2).to_bytes(2, 'big') + replacement_exif
                replacement_exif = None
            continue
        if marker in {_JPEG_APP13, _JPEG_COM}:
            continue
        if marker == _JPEG_APP2 and payload.startswith(b'MPF\x00'):
            continue
        output += bytes((0xFF, marker)) + segment
        if marker == _JPEG_SOS:
            scan_start = position
            while True:
                index = data.find(b'\xff', position)
                if index < 0 or index + 1 >= size:
                    raise ImageMetadataError('Unterminated JPEG scan')
                following = data[index + 1]
                if following == 0x00 or 0xD0 <= following <= 0xD7:
                    position = index + 2
                    continue
                if following == 0xFF:
                    position = index + 1
                    continue
                output += data[scan_start:index]
                position = index
                break


def _strip_png(data: bytes) -> bytes:
    if not data.startswith(_PNG_SIGNATURE):
        raise ImageMetadataError('Missing PNG signature')
    orientation = _exif_orientation(data)
    if orientation is not None and orientation != 1:
        raise _NeedsReencode
    output = bytearray(_PNG_SIGNATURE)
    position = len(_PNG_SIGNATURE)
    size = len(data)
    while position + 8 <= size:
        length = int.from_bytes(data[position:position + 4], 'big')
        chunk_type = data[position + 4:position + 8]
        end = position + 12 + length
        if end > size:
            raise ImageMetadataError('Truncated PNG chunk')
        if chunk_type not in _PNG_METADATA_CHUNKS:
            output += data[position:end]
        position = end
        if chunk_type == b'IEND':
            return bytes(output)
    raise ImageMetadataError('Missing PNG end chunk')


def _strip_webp(data: bytes) -> bytes:
    if len(data) < 12 or data[:4] != b'RIFF' or data[8:12] != b'WEBP':
        raise ImageMetadataError('Missing WebP header')
    orientation = _exif_orientation(data)
    if orientation is not None and orientation != 1:
        raise _NeedsReencode
    riff_end = min(len(data), 8 + int.from_bytes(data[4:8], 'little'))
    body = bytearray(b'WEBP')
    position = 12
    while position + 8 <= riff_end:
        fourcc = data[position:position + 4]
        length = int.from_bytes(data[position + 4:position + 8], 'little')
        end = position + 8 + length + (length & 1)
        if position + 8 + length > riff_end:
            raise ImageMetadataError('Truncated WebP chunk')
        chunk = bytearray(data[position:min(end, riff_end)])
        position = end
        if fourcc in _WEBP_METADATA_CHUNKS:
            continue
        if fourcc == b'VP8X' and len(chunk) > 8:
            chunk[8] &= ~_WEBP_VP8X_METADATA_FLAGS & 0xFF
        if len(chunk) & 1:
            chunk += b'\x00'
        body += chunk
    return b'RIFF' + len(body).to_bytes(4, 'little') + bytes(body)


def _reencode_animation_without_metadata(source: Image.Image, image_format: str, save_options: dict) -> bytes:
    """Re-encode every frame of an animated PNG or WebP upright, keeping timing and looping."""
    orientation = source.getexif().get(EXIF_ORIENTATION_TAG)
    transpose = _ORIENTATION_TRANSPOSE.get(orientation) if isinstance(orientation, int) else None
    frames: list[Image.Image] = []
    durations: list[int] = []
    for frame in ImageSequence.Iterator(source):
        # Converting loads the frame, which is when its duration becomes available.
        upright = frame.convert('RGBA')
        durations.append(int(frame.info.get('duration') or 100))
        if transpose is not None:
            upright = upright.transpose(transpose)
        upright.info = {}
        frames.append(upright)
    output = BytesIO()
    options = {
        **save_options,
        'save_all': True,
        'append_images': frames[1:],
        'duration': durations,
        'loop': int(source.info.get('loop', 0) or 0),
    }
    if image_format == 'WEBP':
        options['quality'] = 95
    frames[0].save(output, format=image_format, **options)
    return output.getvalue()


def _reencode_without_metadata(data: bytes) -> bytes:
    try:
        with Image.open(BytesIO(data)) as source:
            image_format = source.format
            icc_profile = source.info.get('icc_profile')
            if image_format in {'PNG', 'WEBP'} and getattr(source, 'is_animated', False):
                return _reencode_animation_without_metadata(
                    source, image_format, {'icc_profile': icc_profile} if icc_profile else {},
                )
            image = ImageOps.exif_transpose(source)
            # exif_transpose keeps the remaining EXIF (including GPS) in info.
            image.info = {}
            save_options: dict = {'icc_profile': icc_profile} if icc_profile else {}
            output = BytesIO()
            if image_format == 'JPEG':
                if image.mode not in {'RGB', 'L', 'CMYK'}:
                    image = image.convert('RGB')
                image.save(output, format='JPEG', quality=95, **save_options)
            elif image_format == 'PNG':
                image.save(output, format='PNG', **save_options)
            elif image_format == 'WEBP':
                image.save(output, format='WEBP', quality=95, **save_options)
            else:
                raise ImageMetadataError(f'Unsupported image format: {image_format}')
            return output.getvalue()
    except (UnidentifiedImageError, OSError) as exc:
        raise ImageMetadataError('Image could not be decoded') from exc
