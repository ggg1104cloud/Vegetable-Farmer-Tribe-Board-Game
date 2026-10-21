# -*- coding: utf-8 -*-
"""裁剪局部并放大 + 网格，用于精确读取地标像素坐标"""
from PIL import Image, ImageDraw
import os, sys

ROOT = r'C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版\cn-village'
src = Image.open(os.path.join(ROOT, 'assets', 'map_base.png')).convert('RGBA')

# (name, x0,y0,x1,y1, scale)
REGIONS = [
    ('ne_mohe',      760,   0, 1120,  260, 2),   # 东北：漠河、乌苏里江
    ('nw_pamir',       0, 200,  360,  520, 2),   # 西北：帕米尔、塔里木
    ('s_hainan',     460,  560,  860,  928, 2),   # 南部：海南、曾母暗沙
    ('e_taiwan',     700,  480, 1000,  760, 2),   # 东部：台湾、长三角
]

for name, x0, y0, x1, y1, sc in REGIONS:
    crop = src.crop((x0, y0, x1, y1))
    crop = crop.resize((crop.width * sc, crop.height * sc), Image.LANCZOS)
    d = ImageDraw.Draw(crop)
    # 网格：每 20 原图像素 = 20*sc 输出像素
    step = 20
    for x in range(0, (x1 - x0) // step * step + 1, step):
        px = x * sc
        d.line([(px, 0), (px, crop.height)], fill=(255, 0, 255, 200), width=1)
        d.text((px + 2, 2), str(x0 + x), fill=(255, 0, 255, 255))
    for y in range(0, (y1 - y0) // step * step + 1, step):
        py = y * sc
        d.line([(0, py), (crop.width, py)], fill=(0, 150, 255, 200), width=1)
        d.text((2, py + 2), str(y0 + y), fill=(0, 110, 255, 255))
    p = os.path.join(ROOT, 'assets', f'_crop_{name}.png')
    crop.save(p)
    print('->', p, crop.size)