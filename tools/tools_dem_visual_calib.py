#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
交互式目视校正：生成带经纬网格的底图，人工挑参数。

用法：
    python tools_dem_visual_calib.py --a0 70.87 --a1 0.04888 --b0 54.88 --b1 -0.04340
反复调 a0/a1/b0/b1，直到网格线与地物（海岸线、山脉走向、文字标注）贴合，
然后把最终参数填回 tools_dem_align2.py 的初值，或直接写进 _affine_best.json。
"""
import argparse, json, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = r'C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版\cn-village'
A = os.path.join(ROOT, 'assets')

ap = argparse.ArgumentParser()
ap.add_argument('--a0', type=float, default=70.8709)
ap.add_argument('--a1', type=float, default=0.04887784)
ap.add_argument('--b0', type=float, default=54.8768)
ap.add_argument('--b1', type=float, default=-0.04340240)
ap.add_argument('--out', default='_lonlat_grid.png')
ap.add_argument('--save', default='')
args = ap.parse_args()

A0, A1, B0, B1 = args.a0, args.a1, args.b0, args.b1
lon2px = lambda lon: (lon - A0)/A1
lat2px = lambda lat: (lat - B0)/B1

img = Image.open(os.path.join(A, 'map_base.png')).convert('RGBA')
W, H = img.size
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
try:
    font = ImageFont.truetype('consola.ttf', 14)
except Exception:
    font = ImageFont.load_default()

for lat in range(18, 56, 2):
    y = lat2px(lat)
    if not (0 <= y < H):
        continue
    major = (lat % 10 == 0)
    d.line([(0, y), (W, y)],
           fill=(0, 110, 255, 210) if major else (120, 190, 255, 100),
           width=2 if major else 1)
    for lon in range(75, 136, 10):
        x = lon2px(lon)
        if 0 <= x < W:
            d.text((x+3, y+2), f'{lat}N', fill=(0, 80, 255, 255), font=font)

for lon in range(75, 136, 5):
    x = lon2px(lon)
    if not (0 <= x < W):
        continue
    major = (lon % 10 == 0)
    d.line([(x, 0), (x, H)],
           fill=(255, 0, 255, 210) if major else (255, 150, 255, 100),
           width=2 if major else 1)
    for lat in range(20, 56, 10):
        y = lat2px(lat)
        if 0 <= y < H:
            d.text((x+3, y+3), f'{lon}E', fill=(190, 0, 190, 255), font=font)

Image.alpha_composite(img, ov).convert('RGB').save(os.path.join(A, args.out))
print(f'-> assets/{args.out}')
print(f'  a0={A0} a1={A1}  b0={B0} b1={B1}')

if args.save:
    with open(os.path.join(A, '_affine_best.json'), 'w', encoding='utf-8') as f:
        json.dump({'a0': A0, 'a1': A1, 'b0': B0, 'b1': B1}, f, indent=2)
    print('  已保存 assets/_affine_best.json')

print('\n关键地标像素（可直接用于校验）:')
for nm, lon, lat in [('帕米尔西端', 73.8, 39.5), ('抚远东端', 134.0, 48.3),
                     ('漠河北端', 122.5, 53.3), ('塔里木', 82.5, 39.5),
                     ('柴达木', 95.5, 37.0), ('青藏核心', 88.0, 33.0),
                     ('珠峰', 86.9, 28.0), ('华北平原', 115.0, 36.5),
                     ('长江中下游', 112.0, 30.5), ('东北平原', 125.0, 45.0),
                     ('四川盆地', 104.5, 30.5), ('云贵高原', 104.0, 25.0),
                     ('秦岭', 108.5, 34.0), ('黄土高原', 109.0, 36.5)]:
    print(f'  {nm:<10} -> px=({lon2px(lon):6.0f}, {lat2px(lat):5.0f})')