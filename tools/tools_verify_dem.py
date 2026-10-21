# -*- coding: utf-8 -*-
"""验证配准后的高度图：把若干已知地标的实际高程读出来核对"""
import numpy as np, os
from PIL import Image

ROOT = r'C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版\cn-village'
A = os.path.join(ROOT, 'assets')
h = np.load(os.path.join(A, 'map_height_dem.npy'))
board = np.asarray(Image.open(os.path.join(A, 'map_base.png')).convert('RGBA'))[:, :, 3] > 128
H, W = h.shape

# 底图上标注的文字位置（从叠加图读出的大致像素中心）
# 这些是图上印着地名的地方
MARKS = [
    ('青藏高原(核心)',   380, 470, '应 4500~5500'),
    ('珠峰附近',          400, 520, '应 >7000'),
    ('塔里木盆地',       330, 320, '应 800~1200'),
    ('柴达木盆地',       520, 360, '应 2600~3000'),
    ('内蒙古高原',       640, 300, '应 1000~1500'),
    ('东北平原',         880, 250, '应 0~300'),
    ('华北平原',         700, 430, '应 0~200'),
    ('长江中下游平原',   720, 500, '应 0~100'),
    ('四川盆地',         520, 500, '应 300~700'),
    ('云贵高原',         560, 560, '应 1000~2000'),
    ('海南岛',           640, 700, '应 0~500'),
    ('台湾',             790, 620, '应 0~3500'),
]

print(f'{"地标":<16}{"x":>5}{"y":>5}{"读数(m)":>10}   期望')
print('-' * 56)
for name, x, y, exp in MARKS:
    if 0 <= y < H and 0 <= x < W and board[y, x]:
        v = h[max(0, y-6):y+7, max(0, x-6):x+7]
        print(f'{name:<16}{x:>5}{y:>5}{v.mean():>10.0f}   {exp}')
    else:
        print(f'{name:<16}{x:>5}{y:>5}{"不在陆地":>10}   {exp}')

land = h[board]
print('\n陆地区域统计:')
print(f'  min={land.min():.0f}m  max={land.max():.0f}m  mean={land.mean():.0f}m')
for q in [50, 75, 90, 99, 99.9]:
    print(f'  P{q} = {np.percentile(land, q):.0f} m')
print(f'\n  高于3000m 占比: {(land>3000).mean()*100:.2f}%   (真实中国约 3~4%)')
print(f'  高于1000m 占比: {(land>1000).mean()*100:.2f}%')