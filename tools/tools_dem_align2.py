#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把真实 DEM 配准到 PDF 图板的手绘中国地图 —— 直接在经纬度域做仿射。

为什么不用 Albers 中间层
------------------------
之前几版反复失败，根因都在"先投到平面栅格、再找平面->像素变换"这条路上：
平面栅格化时南沙细条、边距、行列索引任何一个环节算错，
IoU 就恒为 0，而反向搜索很难看出是哪一步错的。

本版做法（最少的转换、最容易验证）：
  1. 底图裁剪出中国主体 bbox（去掉南沙细条）
  2. 假设 board 像素 -> (lon, lat) 是**无剪切仿射**：
         lon = a0 + a1*x,   lat = b0 + b1*y      (a1>0, b1<0)
     中国全图的实际投影（Albers/兰勃特/等距圆柱）与这个仿射的偏差
     在 ±3% 量级，肉眼不可见，对做沙盘完全够用。
  3. 用 4 个粗控制点给出初值，坐标下降最大化"轮廓吻合度"
     （在 1/3 降采样上搜，快）
  4. 最后用**地标高程校验**：华北平原读数应<300m，青藏应>4500m。
     这一步是真正的验收标准，配准错了一定会露馅。

输出：assets/map_height_dem.npy（米）、assets/map_height_dem.png（灰度）
"""
import os, math
import numpy as np
from PIL import Image
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, 'assets')

LON_MIN, LON_MAX = 71.0, 140.0
LAT_MIN, LAT_MAX = 2.0, 55.0

# 底图上可辨认的地标：(像素x, 像素y, 经度, 纬度, 说明)
# 这些是从 _grid_overlay.png 上放大核对后读出的
LANDMARKS = [
    (48,   350,  73.6,  39.6, '帕米尔高原西端'),
    (1250, 300,  134.2, 48.3, '黑龙江抚远（东端）'),
    (915,  40,   122.6, 53.4, '漠河（北端）'),
    (645,  452,  108.6, 34.0, '秦岭'),
    (955,  215,  125.0, 45.6, '松嫩平原'),
    (505,  615,  101.0, 23.6, '滇南'),
    (700,  498,  116.0, 30.2, '长江下游'),
    (562,  505,  104.2, 30.6, '四川盆地'),
    (862,  300,  115.2, 42.0, '华北北缘'),
    (395,  480,  90.0,  32.0, '藏北'),
]

# 数值验收基准：(像素x, 像素y, 期望高程下限, 期望上限, 说明)
CHECKS = [
    (700,  470,  -100, 400,   '华北平原'),
    (690,  520,  -100, 300,   '长江中下游'),
    (740,  545,  -100, 600,   '洞庭湖平原'),
    (420,  430,  4000, 6000,  '青藏高原核心'),
    (350,  520,  3000, 6500,  '珠峰一带'),
    (480,  350,  900,  1400,  '塔里木盆地'),
    (560,  400,  2600, 3200,  '柴达木盆地'),
    (620,  520,  200,  900,   '四川盆地'),
    (940,  250,  0,    400,   '松嫩平原'),
    (880,  430,  -100, 300,   '黄淮海'),
]


def load_board():
    """返回 (RGB, 陆地掩码只含中国大陆主体)"""
    img = Image.open(os.path.join(ASSETS, 'map_base.png')).convert('RGBA')
    a = np.asarray(img)
    m = a[:, :, 3] > 128
    H, W = m.shape
    # 最大连通域
    seen = np.zeros_like(m); ys, xs = np.where(m); best = None
    for sy, sx in zip(ys, xs):
        if seen[sy, sx]:
            continue
        q = deque([(sy, sx)]); seen[sy, sx] = True; pix = []
        while q:
            y, x = q.popleft(); pix.append(y*W+x)
            for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                ny, nx = y+dy, x+dx
                if 0 <= ny < H and 0 <= nx < W and m[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; q.append((ny, nx))
        if best is None or len(pix) > len(best):
            best = pix
    o = np.zeros(H*W, bool); o[best] = True
    land = o.reshape(H, W)
    return img, land


def crop_mainland(land):
    """去掉底部南沙细条：按行找主体下边界"""
    rows = land.sum(axis=1)
    ys = np.where(rows > 0)[0]
    y0, y1 = int(ys.min()), int(ys.max())
    body = rows[y0:y1+1]
    # 主体行的宽度至少是最大宽度的 8%
    thr = body.max() * 0.08
    last = y1
    for y in range(y1, y0, -1):
        if rows[y] >= thr:
            last = y
            break
    cut = last + max(6, int((y1-last)*0.35))
    land = land.copy()
    if y1 - last > 25:
        land[cut:, :] = False
        print(f'  裁掉南沙细条 y[{cut},{y1}]')
    return land


def bilinear(dem, lon, lat):
    """按经纬度双线性采样 dem（dem 是 Web Mercator 规则网格）"""
    dh, dw = dem.shape
    fx = (lon - LON_MIN) / (LON_MAX - LON_MIN) * (dw - 1)
    fy = (LAT_MAX - lat) / (LAT_MAX - LAT_MIN) * (dh - 1)
    fx = np.clip(fx, 0, dw-1.001); fy = np.clip(fy, 0, dh-1.001)
    i0 = fx.astype(np.int32); j0 = fy.astype(np.int32)
    a = fx - i0; b = fy - j0
    return (dem[j0, i0]*(1-a)*(1-b) + dem[j0, i0+1]*a*(1-b) +
            dem[j0+1, i0]*(1-a)*b + dem[j0+1, i0+1]*a*b)


def sample_land_at(q, land, dem, ds):
    """按仿射 q在降采样网格上采样 DEM，返回 (值, 掩码)"""
    H, W = land.shape
    Hd = H//ds; Wd = W//ds
    yy, xx = np.mgrid[0:Hd, 0:Wd]
    lon = q[0] + q[1]*(xx*ds)
    lat = q[2] + q[3]*(yy*ds)
    v = bilinear(dem, lon, lat)
    return v, land[:Hd*ds:ds, :Wd*ds:ds]


def main():
    img, land = load_board()
    land = crop_mainland(land)
    H, W = land.shape
    ys, xs = np.where(land)
    LX0, LX1, LY0, LY1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    print(f'board {W}x{H}  陆地 bbox x[{LX0},{LX1}] y[{LY0},{LY1}]')

    dem = np.load(os.path.join(ASSETS, 'dem_china_raw.npy')).astype(np.float32)

    # ---- 初值：用 4 个角点标定无剪切仿射 ----
    # 中国主体大致 lon 73.5~134.3 / lat 18.5~53.5（南沙已裁掉）
    LON_W, LON_E = 73.5, 134.3
    LAT_N, LAT_S = 53.5, 18.5
    # 注意单位：a1/b1 是「度/像素」，不是「像素/度」
    a1 = (LON_E - LON_W) / (LX1 - LX0)      # 度/像素，东为正
    b1 = (LAT_S - LAT_N) / (LY1 - LY0)      # 度/像素，y 向下为南 -> 纬度降低 -> 负
    a0 = LON_W - a1*LX0
    b0 = LAT_N - b1*LY0
    p = [a0, a1, b0, b1]
    print(f'初值: lon={p[0]:.4f}+{p[1]:.7f}*x  lat={p[2]:.4f}+{p[3]:.7f}*y')
    print(f'  校验 x={LX0}->lon {a0+a1*LX0:.1f}  x={LX1}->lon {a0+a1*LX1:.1f}')
    print(f'        y={LY0}->lat {b0+b1*LY0:.1f}  y={LY1}->lat {b0+b1*LY1:.1f}')

    def score(q, ds=3):
        v, m = sample_land_at(q, land, dem, ds)
        vland = v > 0
        fwd = (m & vland).sum() / max(1, m.sum())
        inv = (m & vland).sum() / max(1, vland.sum())
        return 0.5*(fwd + inv)

    print('初值 score =', round(score(p), 4))
    step = [0.05, 0.0002, 0.05, 0.0002]
    best = score(p)
    for restart in range(8):
        cur = list(p) if restart == 0 else list(p)
        cs = score(cur); st = list(step)
        for it in range(200):
            imp = False
            for k in range(4):
                for sg in (1, -1):
                    t = list(cur); t[k] += sg*st[k]
                    # 约束：a1>0（东为右），b1<0（y 向下增大 = 纬度降低）
                    if t[1] <= 0 or t[3] >= 0:
                        continue
                    v = score(t)
                    if v > cs:
                        cs, cur, imp = v, t, True
            if not imp:
                st = [s*0.55 for s in st]
                if max(abs(st[0]), abs(st[2])) < 1e-4:
                    break
        if cs > best:
            best = cs
        print(f'  r{restart}: {cs:.4f}   best={best:.4f}')
        p = list(cur)

    print(f'\n最优 score = {best:.4f}')
    print(f'  lon = {p[0]:.4f} + {p[1]:.8f} * x')
    print(f'  lat = {p[2]:.4f} + {p[3]:.8f} * y')

    # ---- 全分辨率输出 ----
    yy, xx = np.mgrid[0:H, 0:W]
    lon = p[0] + p[1]*xx
    lat = p[2] + p[3]*yy
    h = bilinear(dem, lon, lat)
    h = np.where(land, h, 0.0)
    np.save(os.path.join(ASSETS, 'map_height_dem.npy'), h)

    v = h[land]
    lo, hi = np.percentile(v, 1), np.percentile(v, 99.7)
    g = np.clip((h-lo)/max(1e-6, hi-lo)*255, 0, 255)
    Image.fromarray(np.where(land, g, 0).astype(np.uint8)).save(
        os.path.join(ASSETS, 'map_height_dem.png'))

    print(f'\n高程 min/max/mean = {v.min():.0f} / {v.max():.0f} / {v.mean():.0f} m')
    print(f'  >3000m {(v>3000).mean()*100:.2f}%   >1000m {(v>1000).mean()*100:.2f}%')

    # ---- 数值验收 ----
    print('\n地标高程校验：')
    ok = 0
    for (x, y, lo_e, hi_e, name) in CHECKS:
        if 0 <= y < H and 0 <= x < W and land[y, x]:
            vv = float(h[max(0,y-8):y+9, max(0,x-8):x+9].mean())
            good = lo_e <= vv <= hi_e
            ok += good
            print(f'  {name:<14} ({x:4d},{y:4d}) = {vv:7.0f} m  期望[{lo_e},{hi_e}]  {"OK" if good else "!!"}')
        else:
            print(f'  {name:<14} ({x:4d},{y:4d})  不在陆地')
    print(f'\n通过 {ok}/{len(CHECKS)}')

    # ---- 对照图 ----
    hv = np.asarray(Image.open(os.path.join(ASSETS, 'map_height_dem.png')))
    ov = np.asarray(img).copy()
    ov[:, :, :3] = (ov[:, :, :3]*0.45 + np.stack([hv]*3, -1).astype(np.float32)*0.55).astype(np.uint8)
    Image.fromarray(ov).save(os.path.join(ASSETS, '_dem_overlay_check.png'))
    print('\n已输出 map_height_dem.npy / .png / _dem_overlay_check.png')


if __name__ == '__main__':
    main()