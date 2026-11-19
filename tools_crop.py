# Potong wajah dari foto di folder photos/ -> faces/<id>.png (256x320, latar oval transparan)
# Ubah angka CROPS kalau potongannya kurang pas: (file, cx, top, lebar)  tinggi = lebar*1.25
import sys, json
from PIL import Image, ImageDraw, ImageFilter, ImageStat
CROPS = {
  "sidik":   ("1.jpg", 698, 195, 300),
  "monang":  ("2.jpg", 196, 65, 150),
  "wawan":   ("2.jpg", 318, 135, 125),
  "dani":    ("3.jpg", 285, 470, 260),
  "sharil":  ("4.png", 122, 25, 180),
  "fajar":   ("5.jpg", 490, 85, 340),
  "lana":    ("6.jpg", 165, 225, 190),
  "anang":   ("6.jpg", 463, 205, 150),
  "pakrt":   ("7.jpg", 328, 148, 115),
  "josh":    ("8.jpg", 135, 243, 140),
  "irul":    ("8.jpg", 333, 256, 100),
  "paktas":  ("8.jpg", 882, 475, 120),
  "ardi":    ("ardi.png", 183, 50, 140),
  "hery":    ("hery.png", 104, 6, 138),
  "heriw":   ("heriwarung.png", 243, 42, 180),
  "ali":     ("ali.png", 252, 60, 230),
  "topik":   ("topik.png", 207, 52, 165),
}
W, H = 256, 320
mask = Image.new("L", (W, H), 0)
ImageDraw.Draw(mask).ellipse((6, 4, W - 6, H - 4), fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(5))
skins = {}
sheet = Image.new("RGB", (W * 6, H * 3), (40, 40, 60))
for i, (cid, (f, cx, top, w)) in enumerate(CROPS.items()):
    try:
        im = Image.open("photos/" + f).convert("RGB")
    except FileNotFoundError:
        print("  (lewati %s: photos/%s belum ada)" % (cid, f)); continue
    h = int(w * 1.25)
    c = im.crop((int(cx - w / 2), top, int(cx + w / 2), top + h)).resize((W, H), Image.LANCZOS)
    st = ImageStat.Stat(c.crop((W * .35, H * .55, W * .65, H * .7)))
    skins[cid] = "#%02x%02x%02x" % tuple(int(v) for v in st.mean)
    out = c.convert("RGBA"); out.putalpha(mask)
    out.save("faces/%s.png" % cid)
    sheet.paste(c, ((i % 6) * W, (i // 6) * H))
sheet.save(sys.argv[1] if len(sys.argv) > 1 else "faces_sheet.jpg")
print(json.dumps(skins))
