"""Crop small portraits from shipped atlases without modifying the source art.
Run with Pillow installed: python tools/build-portraits.py
"""
from pathlib import Path
import json
from PIL import Image
root = Path(__file__).resolve().parents[1]
output = root / 'public' / 'portraits'
output.mkdir(exist_ok=True)
for name in ('warrior', 'wizard', 'barbarian', 'ranger', 'cat', 'lamia'):
    folder = root / 'public' / 'assets' / name
    meta = json.loads((folder / 'sprite.json').read_text())
    frame = meta['frames'][meta['animations']['Front_Idle']['frameNames'][0]]['frame']
    x, y, size = frame['x'] + 56, frame['y'] + 24, 144
    with Image.open(folder / meta['image']) as atlas:
        atlas.crop((x, y, x + size, y + size)).save(output / (name + '.png'))
