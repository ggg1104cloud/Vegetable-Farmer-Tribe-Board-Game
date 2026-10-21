import os, sys
import numpy as np
from PIL import Image
from collections import deque

b = r'C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版\cn-village'
a = np.array(Image.open(os.path.join(b, 'assets', 'board_full.png')).convert('RGB')).astype(int)
H, W, _ = a.shape

white = (a[:,:,0] > 236) & (a[:,:,1] > 236) & (a[:,:,2] > 232)
# 只关心中央区域（避开外圈赛道）
core = np.zeros_like(white)
core[240:900, 290:1900] = True
white &= core

# 8x8 块：白占比 > 0.70 视为卡芯
bs = 8
Hc, Wc = H // bs, W // bs
blk = white[:Hc*bs, :Wc*bs].reshape(Hc, bs, Wc, bs).mean(axis=(1, 3))
solid = blk > 0.70

# BFS 连通域（8 连通）
lab = np.zeros((Hc, Wc), dtype=np.int32)
cur = 0
for y in range(Hc):
    for x in range(Wc):
        if solid[y, x] and lab[y, x] == 0:
            cur += 1
            q = deque([(y, x)]); lab[y, x] = cur
            while q:
                cy, cx = q.popleft()
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = cy+dy, cx+dx
                        if 0 <= ny < Hc and 0 <= nx < Wc and solid[ny, nx] and lab[ny, nx] == 0:
                            lab[ny, nx] = cur; q.append((ny, nx))

print('连接域数:', cur)
res = []
for i in range(1, cur+1):
    ys, xs = np.where(lab == i)
    if len(ys) < 40:   # 至少 40 块 = 2560px
        continue
    x0, x1 = xs.min()*bs, (xs.max()+1)*bs
    y0, y1 = ys.min()*bs, (ys.max()+1)*bs
    res.append((x0, y0, x1, y1, len(ys)*64))
res.sort(key=lambda r: -r[4])
for x0, y0, x1, y1, area in res[:10]:
    print('x %4d..%4d  y %4d..%4d  w=%4d h=%4d area=%6d | frac x %.4f..%.4f y %.4f..%.4f'
          % (x0, x1, y0, y1, x1-x0, y1-y0, area, x0/W, x1/W, y0/H, y1/H))
