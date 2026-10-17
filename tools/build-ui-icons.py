"""Trace supplied tiny WebP icons into standalone SVG paths.
Run with Pillow 13.0.0 and vtracer 0.6.15 installed in a separate asset-tools venv.
Original uploads and mapping are preserved under art/ui-icons/.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
import json,re,hashlib
import xml.etree.ElementTree as ET
from PIL import Image
import vtracer

ROOT=Path(__file__).resolve().parents[1]
items=json.loads((ROOT/'art/ui-icons/manifest.json').read_text())
css=(ROOT/'public/style.css').read_text()
colors=dict(re.findall(r'\.damage-([a-z]+)\{--damage-color:(#[0-9A-Fa-f]{6})',css))
out=ROOT/'public/assets/ui-icons';out.mkdir(parents=True,exist_ok=True)
with TemporaryDirectory() as tmp:
 for item in items:
  source=ROOT/'art/ui-icons'/item['source']
  original=Image.open(source).convert('RGBA')
  rgba=original.copy()
  pixels=list(rgba.get_flattened_data())
  maximum=max((max(r,g,b) for r,g,b,a in pixels if a>=128),default=0)
  damage=item['id'].startswith('damage-')
  color=colors[item['id'][7:]] if damage else '#CBD5DC'
  base=tuple(int(color[i:i+2],16) for i in (1,3,5))
  def tint(pixel):
   r,g,b,a=pixel
   light=(.2126*r+.7152*g+.0722*b)/255
   if damage:
    # Base hue remains the existing type color, with darker shadows and highlights.
    amount=.5+light*.8
    rgb=tuple(round(c*amount) if amount<=1 else round(c+(255-c)*(amount-1)/.3) for c in base)
   elif maximum<90:
    amount=.8 if maximum==0 else .45+.55*min(1,light*255/maximum)
    rgb=tuple(round(c*amount) for c in base)
   else:
    rgb=tuple(round(70+light*180) for _ in range(3))
   return (*rgb,a)
  rgba.putdata([tint(p) for p in pixels])
  # Upsampling allows curves to follow the antialiased source instead of square pixels.
  rgba=rgba.resize((original.width*8,original.height*8),Image.Resampling.LANCZOS)
  rgba.putalpha(rgba.getchannel('A').point(lambda a: 255 if a >= 128 else 0))
  png=Path(tmp)/'input.png';svg=Path(tmp)/'output.svg'
  rgba.save(png)
  vtracer.convert_image_to_svg_py(str(png),str(svg),colormode='color',hierarchical='stacked',mode='spline',filter_speckle=2,color_precision=6,layer_difference=1,corner_threshold=60,length_threshold=3.5,max_iterations=10,splice_threshold=45,path_precision=2)
  ET.register_namespace('', 'http://www.w3.org/2000/svg')
  traced=ET.parse(svg).getroot()
  paths='\n'.join(ET.tostring(child,encoding='unicode').replace(' xmlns="http://www.w3.org/2000/svg"','') for child in traced)
  # No raster payload: only scalable path geometry from the tracer.
  result=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {rgba.width} {rgba.height}" width="24" height="24" role="img" aria-label="{item["name"]}">\n<title>{item["name"]}</title>\n{paths.strip()}\n</svg>\n'
  (out/(item['id']+'.svg')).write_text(result)
  item.update(width=original.width,height=original.height,color=color,sha256=hashlib.sha256(source.read_bytes()).hexdigest())
(ROOT/'art/ui-icons/manifest.json').write_text(json.dumps(items,ensure_ascii=False,indent=2)+'\n')
print(f'Generated {len(items)} transparent path-only SVG icons.')
