# -*- coding: utf-8 -*-
"""在map_base.png 上叠加坐标网格，用于人工读取地标的像素位置"""
from PIL import Image, ImageDraw
import os

ROOT = r'C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版\cn-village'
src = Image.open(os.path.join(ROOT, 'assets', 'map_base.png')).convert('RGBA')
W, H = src.size
out = src.copy()
d = ImageDraw.Draw(out)

STEP = 100
for x in range(0, W, STEP):
    col = (255, 0, 255, 255) if x % 500 == 0 else (255, 160, 255, 160)
    d.line([(x, 0), (x, H)], fill=col, width=2 if x % 500 == 0 else 1)
    d.text((x + 3, 3), str(x), fill=(255, 0, 255, 255))
for y in range(0, H, STEP):
    col = (0, 160, 255, 255) if y % 500 == 0 else (150, 210, 255, 160)
    d.line([(0, y), (W, y)], fill=col, width=2 if y % 500 == 0 else 1)
    d.text((3, y + 3), str(y), fill=(0, 120, 255, 255))

p = os.path.join(ROOT, 'assets', '_grid_overlay.png')
out.save(p)
print('->', p, out.size)