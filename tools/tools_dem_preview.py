# -*- coding: utf-8 -*-
"""把 dem_china_raw.npy 可视化成灰度预览图，人眼确认地貌是否对"""
import numpy as np, os
from PIL import Image

ROOT = r'C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版\cn-village'
p = os.path.join(ROOT, 'assets', 'dem_china_raw.npy')
g = np.load(p)
print('shape', g.shape, 'min', g.min(), 'max', g.max())

land = g > 0
print('land ratio', round(float(land.mean()), 3))

lo, hi = 0, 6000
n = np.clip((g - lo) / (hi - lo), 0, 1)
img = (n * 255).astype(np.uint8)
out = os.path.join(ROOT, 'assets', '_dem_preview.png')
Image.fromarray(img).save(out)
print('preview ->', out, img.shape)

# 侧写一行高程剖面，横穿西藏->东海，验证起伏
row = g[g.shape[0] // 2]
print('\nmid-row profile (每 1/12 采样):')
print([int(row[int(i * (row.size - 1) / 12)]) for i in range(13)])