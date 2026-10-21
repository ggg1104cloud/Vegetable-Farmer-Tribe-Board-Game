# -*- coding: utf-8 -*-
"""裁剪东南/南部区域，用于定位台湾、海南、曾母暗沙"""
from PIL import Image, ImageDraw
import os

ROOT = r'C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版\cn-village'
src = Image.open(os.path.join(ROOT, 'assets', 'map_base.png')).convert('RGBA')

REGIONS = [
    ('se_taiwan',   740,  560,  920,  760, 3),
    ('s_hainan2',   520,  640,  720,  800, 3),
    ('sw_nansha',   560,  740,  760,  928, 3),
    ('n_bohai',     620,  200,  860,  380, 3),
]
for name, x0, y0, x1, y1, sc in REGIONS:
    crop = src.crop((x0, y0, x1, y1)).resize(
        ((x1-x0) * sc, (y1-y0) * sc), Image.LANCZOS)
    d = ImageDraw.Draw(crop)
    step = 20
    for x in range(0, (x1-x0)//step*step + 1, step):
        d.line([(x*sc, 0), (x*sc, crop.height)], fill=(255,0,255,190), width=1)
        d.text((x*sc+2, 2), str(x0+x), fill=(255,0,255,255))
    for y in range(0, (y1-y0)//step*step + 1, step):
        d.line([(0, y*sc), (crop.width, y*sc)], fill=(0,150,255,190), width=1)
        d.text((2, y*sc+2), str(y0+y), fill=(0,110,255,255))
    p = os.path.join(ROOT, 'assets', f'_crop_{name}.png')
    crop.save(p)
    print('->', p, crop.size)