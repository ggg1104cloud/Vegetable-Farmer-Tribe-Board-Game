#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
用底图**自身的地貌配色**做配准 —— 远比海岸线可靠。

底图 map_base.png 已经按地貌分区上色：
    红 -> 青藏高原（高程 >4000）
    黄 -> 黄土高原 / 荒漠盆地（1000~3000）
    绿 -> 东部草原平原（<500）
把底图这三个颜色掩码作为"标准答案"，去优化仿射变换，
使 DEM 按高程分档后的三区与之吻合。

这比轮廓 IoU 稳得多：轮廓只约束边界，而配色区约束了**内部结构**，
退化解（比如整体平移几十像素）在配色上立刻露馅。

输出 assets/map_height_dem.npy / .png
"""
import os
import numpy as np
from PIL import Image
from collections import deque

ROOT = r'C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版\cn-village'
A = os.path.join(ROOT, 'assets')

LON_MIN, LON_MAX = 71.0, 140.0
LAT_MIN, LAT_MAX = 2.0, 55.0

# 底图配色 -> 语义 (R, G, B) 判据（在 HSV/归一化 RGB 上判）
def classify_board(path):
    img = Image.open(path).convert('RGBA')
    a = np.asarray(img).astype(np.float32)/255.0
    alpha = a[:, :, 3] > 0.5
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    mx = a[:, :, :3].max(axis=2); mn = a[:, :, :3].min(axis=2)
    sat = np.where(mx > 1e-6, (mx-mn)/np.maximum(mx, 1e-6), 0)
    # 红: R 明显主导
    red = alpha & (r > 0.45) & (r > g*1.5) & (r > b*1.5) & (sat > 0.35)
    # 黄: R,G 都高，B 低
    yel = alpha & (r > 0.55) & (g > 0.45) & (b < g*0.75) & (r > b*1.4)
    # 绿: G 主导
    grn = alpha & (g > 0.40) & (g > r*1.15) & (g > b*1.15) & (sat > 0.18)
    return red, yel, grn, alpha


def largest_component(mask):
    H, W = mask.shape
    seen = np.zeros_like(mask); ys, xs = np.where(mask); best = None
    for sy, sx in zip(ys, xs):
        if seen[sy, sx]:
            continue
        q = deque([(sy, sx)]); seen[sy, sx] = True; pix = []
        while q:
            y, x = q.popleft(); pix.append(y*W+x)
            for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                ny, nx = y+dy, x+dx
                if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; q.append((ny, nx))
        if best is None or len(pix) > len(best):
            best = pix
    if best is None:
        return np.zeros_like(mask)
    o = np.zeros(H*W, bool); o[best] = True
    return o.reshape(H, W)


def bilinear(dem, lon, lat):
    dh, dw = dem.shape
    fx = np.clip((lon-LON_MIN)/(LON_MAX-LON_MIN)*(dw-1), 0, dw-1.001)
    fy = np.clip((LAT_MAX-lat)/(LAT_MAX-LAT_MIN)*(dh-1), 0, dh-1.001)
    i0 = fx.astype(np.int32); j0 = fy.astype(np.int32)
    a = fx-i0; b = fy-j0
    return (dem[j0,i0]*(1-a)*(1-b) + dem[j0,i0+1]*a*(1-b) +
            dem[j0+1,i0]*(1-a)*b + dem[j0+1,i0+1]*a*b)


def main():
    red, yel, grn, alpha = classify_board(os.path.join(A, 'map_base.png'))
    print(f'底图配色像素: 红 {red.sum()}  黄 {yel.sum()}  绿 {grn.sum()}')
    # 只在"陆地"范围内统计，即取 alpha 内最大的连通域
    land = largest_component(alpha)
    red &= land; yel &= land; grn &= land
    print(f'  裁到主大陆后: 红 {red.sum()}  黄 {yel.sum()}  绿 {grn.sum()}')

    dem = np.load(os.path.join(A, 'dem_china_raw.npy')).astype(np.float32)
    H, W = land.shape

    # ---- 初值 ----
    ys, xs = np.where(land)
    LX0, LX1, LY0, LY1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    a1 = (134.3-73.5)/(LX1-LX0); b1 = (18.5-53.5)/(LY1-LY0)
    p = [73.5-a1*LX0, a1, 53.5-b1*LY0, b1]
    print(f'初值 lon={p[0]:.3f}+{p[1]:.7f}x  lat={p[2]:.3f}+{p[3]:.7f}y')

    DS = 3
    Hd, Wd = H//DS, W//DS
    gy, gx = np.mgrid[0:Hd, 0:Wd]
    GX = (gx*DS).astype(np.float32); GY = (gy*DS).astype(np.float32)
    Ld = land[:Hd*DS:DS, :Wd*DS:DS]
    Rd = red[:Hd*DS:DS, :Wd*DS:DS]
    Yd = yel[:Hd*DS:DS, :Wd*DS:DS]
    Gd = grn[:Hd*DS:DS, :Wd*DS:DS]
    print(f'搜索网格 {Wd}x{Hd}')

    def regions(h):
        """按高程把 DEM 分成三区，映射到底图配色语义"""
        return (h >= 3800), ((h >= 900) & (h < 3800)), (h < 900)

    def score(q):
        lon = q[0] + q[1]*GX
        lat = q[2] + q[3]*GY
        h = bilinear(dem, lon, lat)
        dr, dm, dg = regions(h)
        # 底图三色是模糊的（渐变、纹理），用软匹配：
        # 底图红色区应当高、青藏；绿色区应当低
        s_red  = (Rd & dr).sum() / max(1, Rd.sum())
        s_grn  = (Gd & dg).sum() / max(1, Gd.sum())
        s_yel  = (Yd & dm).sum() / max(1, Yd.sum())
        return (s_red + s_grn + s_yel)/3.0

    best = score(p)
    print('初值 score =', round(best, 4))
    step = [0.06, 0.0003, 0.06, 0.0003]
    for restart in range(10):
        cur = list(p); cs = score(cur); st = list(step)
        for it in range(300):
            imp = False
            for k in range(4):
                for sg in (1, -1):
                    t = list(cur); t[k] += sg*st[k]
                    if t[1] <= 0 or t[3] >= 0:
                        continue
                    v = score(t)
                    if v > cs:
                        cs, cur, imp = v, t, True
            if not imp:
                st = [s*0.55 for s in st]
                if max(abs(st[0]), abs(st[2])) < 1e-5:
                    break
        if cs > best:
            best, p = cs, cur
        print(f'  r{restart}: {cs:.4f}  best={best:.4f}')

    print(f'\n最优 score = {best:.4f}')
    print(f'  lon = {p[0]:.4f} + {p[1]:.8f} * x')
    print(f'  lat = {p[2]:.4f} + {p[3]:.8f} * y')

    yy, xx = np.mgrid[0:H, 0:W]
    h = bilinear(dem, p[0]+p[1]*xx, p[2]+p[3]*yy)
    h = np.where(land, h, 0.0)
    np.save(os.path.join(A, 'map_height_dem.npy'), h)
    v = h[land]
    lo, hi = np.percentile(v, 1), np.percentile(v, 99.7)
    g = np.clip((h-lo)/max(1e-6, hi-lo)*255, 0, 255)
    Image.fromarray(np.where(land, g, 0).astype(np.uint8)).save(
        os.path.join(A, 'map_height_dem.png'))
    print(f'\n高程 min/max/mean = {v.min():.0f}/{v.max():.0f}/{v.mean():.0f} m')
    print(f'  >3000m {(v>3000).mean()*100:.2f}%   >1000m {(v>1000).mean()*100:.2f}%')

    # ---- 地标数值校验（像素由仿射反算，不再目测） ----
    print('\n地标校验（像素由经纬度反算）:')
    CK = [('华北平原', 115.0, 36.5, -100, 400), ('长江中下游', 112.0, 30.5, -100, 300),
          ('东北平原', 125.0, 45.0, 0, 400), ('青藏核心', 88.0, 33.0, 4200, 6000),
          ('珠峰', 86.9, 28.0, 5000, 9000), ('塔里木', 82.5, 39.5, 900, 1500),
          ('柴达木', 95.5, 37.0, 2600, 3300), ('四川盆地', 104.5, 30.5, 200, 900),
          ('云贵高原', 104.0, 25.0, 800, 2200), ('秦岭', 108.5, 34.0, 500, 2500),
          ('准噶尔', 87.0, 45.0, 200, 1200), ('黄土高原', 109.0, 36.5, 700, 2000)]
    ok = 0
    for nm, lon, la, lo_e, hi_e in CK:
        x = int(round((lon-p[0])/p[1])); y = int(round((la-p[2])/p[3]))
        if 0 <= y < H and 0 <= x < W and land[y, x]:
            vv = float(h[max(0,y-9):y+10, max(0,x-9):x+10].mean())
            good = lo_e <= vv <= hi_e; ok += good
            print(f'  {nm:<10} ({x:4d},{y:4d}) = {vv:7.0f} m  期望[{lo_e},{hi_e}] {"OK" if good else "!!"}')
        else:
            print(f'  {nm:<10} ({x:4d},{y:4d}) 不在陆地')
    print(f'\n通过 {ok}/{len(CK)}')

    # 对照图
    hv = np.asarray(Image.open(os.path.join(A, 'map_height_dem.png')))
    bi = Image.open(os.path.join(A, 'map_base.png')).convert('RGBA')
    ov = np.asarray(bi).copy()
    ov[:, :, :3] = (ov[:, :, :3]*0.45 + np.stack([hv]*3, -1).astype(np.float32)*0.55).astype(np.uint8)
    Image.fromarray(ov).save(os.path.join(A, '_dem_overlay_check.png'))
    import json
    with open(os.path.join(A, '_affine_best.json'), 'w', encoding='utf-8') as f:
        json.dump({'a0': p[0], 'a1': p[1], 'b0': p[2], 'b1': p[3]}, f, indent=2)
    print('已输出 map_height_dem.npy/.png、_dem_overlay_check.png、_affine_best.json')


if __name__ == '__main__':
    main()