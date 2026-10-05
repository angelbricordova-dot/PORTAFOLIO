"""Recorta y limpia el fondo de la hoja de personaje 3D de Lamont.
Uso: python3 scripts/make-avatar.py <hoja.png>
Genera assets/img/lamont-*.webp (fotogramas del giro 3D) y lamont-head.webp.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC = sys.argv[1]
OUT = "public/assets/img"
sheet = Image.open(SRC).convert("RGB")

# (nombre, caja x0,y0,x1,y1) sobre la hoja de 577x1024. Se evitan las etiquetas de texto.
REGIONS = [
    ("front", (15, 38, 232, 298)),
    ("q-front", (228, 38, 402, 298)),
    ("side", (425, 38, 570, 298)),
    ("q-back", (22, 362, 198, 592)),
    ("back", (198, 362, 388, 592)),
]

def matte(img):
    a = np.asarray(img).astype(np.float32)
    minc = a.min(axis=2)
    sat = a.max(axis=2) - minc
    # fondo blanco + sombra de suelo gris + huecos entre piernas: claro y sin color
    bg = (minc >= 212) | ((sat < 16) & (minc > 118))
    bg = ndi.binary_opening(bg, iterations=1) | (minc >= 240)
    zone = ndi.binary_dilation(bg, iterations=3)
    alpha = np.ones(minc.shape, np.float32)
    soft = np.clip((252 - minc) / (252 - 205), 0, 1)
    alpha[zone] = soft[zone]
    alpha[bg] = 0
    # limpia motas sueltas: se queda con el componente opaco más grande
    solid = alpha > 0.2
    lab2, n2 = ndi.label(solid)
    if n2:
        sizes = ndi.sum(solid, lab2, range(1, n2 + 1))
        keep = lab2 == (1 + int(np.argmax(sizes)))
        alpha[~ndi.binary_dilation(keep, iterations=2)] = 0
    # borde limpio: se erosiona 1 px, se suaviza el alfa y el color del borde se toma del interior
    core = ndi.binary_erosion(alpha > 0.5, iterations=1)
    _, (iy, ix) = ndi.distance_transform_edt(~core, return_indices=True)
    rgb = a[iy, ix]
    alpha = ndi.gaussian_filter(core.astype(np.float32), 0.8)
    alpha = np.clip((alpha - 0.08) / 0.84, 0, 1)
    rgba = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")

frames = {}
for name, box in REGIONS:
    im = matte(sheet.crop(box))
    bbox = im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    frames[name] = im.crop(bbox)

# lienzo común: mismos pies (base) y centrado, escalado 2.5x con Lanczos
SCALE = 2.5
big = {k: v.resize((round(v.width * SCALE), round(v.height * SCALE)), Image.LANCZOS) for k, v in frames.items()}
W = max(v.width for v in big.values()) + 40
H = max(v.height for v in big.values()) + 20
for k, v in big.items():
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canvas.alpha_composite(v, ((W - v.width) // 2, H - v.height - 10))
    canvas.save(f"{OUT}/lamont-{k}.webp", "WEBP", quality=90, method=6)
    print(k, canvas.size)

# cabeza para logo/favicon: parte alta del fotograma frontal
f = big["front"]
head = f.crop((0, 0, f.width, int(f.height * 0.36)))
hb = head.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
head = head.crop(hb)
side = max(head.size) + 16
sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
sq.alpha_composite(head, ((side - head.width) // 2, (side - head.height) // 2 + 4))
sq = sq.resize((256, 256), Image.LANCZOS)
sq.save(f"{OUT}/lamont-head.webp", "WEBP", quality=92, method=6)
sq.save(f"{OUT}/lamont-head.png")
sq.resize((64, 64), Image.LANCZOS).save(f"{OUT}/favicon.png")
# vista previa sobre fondo naranja para revisar el recorte
prev = Image.new("RGBA", (W * 5, H), (255, 77, 28, 255))
for i, k in enumerate(["front", "q-front", "side", "q-back", "back"]):
    prev.alpha_composite(Image.open(f"{OUT}/lamont-{k}.webp").convert("RGBA"), (i * W, 0))
prev.convert("RGB").save("/tmp/preview.png")
