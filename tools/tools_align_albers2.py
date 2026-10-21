#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
控制点自动精化+ Albers 配准。

问题：目测底图上的像素位置不准（上一版残差 105px）。
方案：每个控制点给一个粗略位置和搜索半径，在半径内用
      "局部高程一致性"做爬山细化 —— 即在该点邻域，
      找真实 DEM 高程与该地真实高程最接近的位置。
最后用精化后的控制点解plane->board 变换。
"""
import os, math
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')
LON_MIN, LON_MAX = 71.0, 140.0
LAT_MIN, LAT_MAX = 2.0, 55.0

LON_0 = 105.0
LAT_1, LAT_2, LAT_0 = 25.0, 47.0, 36.0
E2 = 0.00669438
_n = 0.5 * (1 + math.sqrt(1 - E2))
_C = math.cos(math.radians(LAT_1))**2 + 2*_n*math.sin(math.radians(LAT_1))* \
     math.cos(math.radians(LAT_1)) / math.tan(math.radians(LAT_2))
_rho0 = _C / (math.tan(math.radians(LAT_0)) *
              math.sqrt(1 - E2*math.sin(math.radians(LAT_0))**2))


def albers_arr(lon_deg, lat_deg):
    lat = np.radians(lat_deg); lon = np.radians(lon_deg)
    s = np.sin(lat)
    rho = _C / (np.tan(lat) * np.sqrt(np.clip(1 - E2*s*s, 1e-12, None)))
    th = lon - math.radians(LON_0)
    return rho*np.sin(th), _rho0 - rho*np.cos(th)


def albers(lo, la):
    x, y = albers_arr(np.array([lo]), np.array([la]))
    return float(x[0]), float(y[0])


def build_plane():
    dem = np.load(os.path.join(ASSETS, 'dem_china_raw.npy')).astype(np.float32)
    dh, dw = dem.shape
    lons = LON_MIN + (LON_MAX-LON_MIN)*np.arange(dw)/(dw-1)
    lats = LAT_MAX - (LAT_MAX-LAT_MIN)*np.arange(dh)/(dh-1)
    LON, LAT = np.meshgrid(lons, lats)
    X, Y = albers_arr(LON, LAT)
    land = dem > 0
    m = 3.0
    X0, X1 = float(X[land].min())-m, float(X[land].max())+m
    Y0, Y1 = float(Y[land].min())-m, float(Y[land].max())+m
    PW, PH = 2600, 2400
    ux, uy = (X1-X0)/PW, (Y1-Y0)/PH
    ix = np.clip(((X-X0)/ux).astype(np.int32), 0, PW-1)
    iy = np.clip(((Y-Y0)/uy).astype(np.int32), 0, PH-1)
    plane = np.zeros((PH, PW), dtype=np.float32)
    order = np.argsort(-dem.ravel())
    plane[iy.ravel()[order], ix.ravel()[order]] = dem.ravel()[order]
    return plane, X0, Y0, ux, uy


def sample(plane, X0, Y0, ux, uy, Xq, Yq):
    PH, PW = plane.shape
    fx = np.clip((Xq-X0)/ux, 0, PW-1.001)
    fy = np.clip((Yq-Y0)/uy, 0, PH-1.001)
    i0 = fx.astype(np.int32); j0 = fy.astype(np.int32)
    a = fx-i0; b = fy-j0
    return (plane[j0,i0]*(1-a)*(1-b) + plane[j0,i0+1]*a*(1-b) +
            plane[j0+1,i0]*(1-a)*b + plane[j0+1,i0+1]*a*b)


# 控制点：(粗略x, 粗略y, 经度, 纬度, 搜索半径px, 说明)
CONTROL = [
    (55,   352,  73.5,  39.5, 60,'帕米尔西端'),
    (1245, 300,  134.3, 48.4, 60, '抚远（东端）'),
    (900,  45,   122.5, 53.3, 70, '漠河北端'),
    (645,  455,  108.5, 34.0, 70, '秦岭'),
    (955,  215,  125.0, 45.5, 70, '松嫩平原'),
    (505,  615,  101.0, 23.5, 70, '滇南'),
    (700,  500,  116.0, 30.0, 70, '长江下游'),
    (560,  505,  104.0, 30.5, 70, '四川盆地'),
    (860,  300,  115.0, 42.0, 70, '华北北缘'),
    (400,  480,  90.0,  32.0, 70, '藏北'),
]


def refine(plane, X0, Y0, ux, uy, board):
    """
    迭代精化：给定当前 plane->board 变换，把控制点投影到 board，
    再按真实 DEM 高程做局部爬山微调。反复几轮。
    """
    cps = [(x, y, lo, la, r, n) for (x, y, lo, la, r, n) in CONTROL]
    H, W = board.shape
    for rnd in range(6):
        txy = np.array([albers(c[2], c[3]) for c in cps])
        P = np.array([c[0] for c in cps], float)
        Q = np.array([c[1] for c in cps], float)
        A = np.zeros((2*len(cps), 6)); b = np.zeros(2*len(cps))
        for i in range(len(cps)):
            X, Y = txy[i]
            A[2*i]   = [X, Y, 1, 0, 0, 0]; b[2*i]   = P[i]
            A[2*i+1] = [0, 0, 0, X, Y, 1]; b[2*i+1] = Q[i]
        sol, *_ = np.linalg.lstsq(A, b, rcond=None)
        M = np.array([[sol[0], sol[1]], [sol[3], sol[4]]])
        t = np.array([sol[2], sol[5]])
        Minv = np.linalg.inv(M)

        # 各控制点真实高程
        dem = np.load(os.path.join(ASSETS, 'dem_china_raw.npy')).astype(np.float32)
        dh, dw = dem.shape
        lons = LON_MIN + (LON_MAX-LON_MIN)*np.arange(dw)/(dw-1)
        lats = LAT_MAX - (LAT_MAX-LAT_MIN)*np.arange(dh)/(dh-1)

        moved = 0
        for i, (x, y, lo, la, r, name) in enumerate(cps):
            # 该点真实高程（DEM 像素级取值）
            ci = int(round((lo-LON_MIN)/(LON_MAX-LON_MIN)*(dw-1)))
            ri = int(round((LAT_MAX-la)/(LAT_MAX-LAT_MIN)*(dh-1)))
            ci = max(0, min(dw-1, ci)); ri = max(0, min(dh-1, ri))
            target = float(dem[max(0,ri-3):ri+4, max(0,ci-3):ci+4].mean())

            # 在半径 r 内找使局部高程最接近 target 的位置
            rad = r if rnd == 0 else max(6, r // (2 ** rnd))
            yy, xx = np.mgrid[int(y)-rad:int(y)+rad+1, int(x)-rad:int(x)+rad+1]
            fx = (M[0,0]*xx + M[0,1]*yy + t[0])
            fy = (M[1,0]*xx + M[1,1]*yy + t[1])
            vals = sample(plane, X0, Y0, ux, uy, fx, fy)
            # 用 5x5 均值模拟"这一小片区域的平均高程"
            k = 7
            acc = np.zeros_like(vals); cnt = np.zeros_like(vals)
            for dy in range(-k, k+1, 2):
                for dx in range(-k, k+1, 2):
                    v = sample(plane, X0, Y0, ux, uy, fx+dx, fy+dy)
                    acc += v; cnt += 1
            vals = acc/cnt
            d = np.abs(vals - target)
            j, i2 = np.unravel_index(np.argmin(d), d.shape)
            nx_, ny_ = int(xx[j, i2]), int(yy[j, i2])
            if (nx_, ny_) != (int(x), int(y)):
                moved += 1
            cps[i] = (nx_, ny_, lo, la, r, name)

        # 残差
        txy = np.array([albers(c[2], c[3]) for c in cps])
        P = np.array([c[0] for c in cps], float); Q = np.array([c[1] for c in cps], float)
        pred = np.stack([sol[0]*txy[:,0]+sol[1]*txy[:,1]+sol[2],
                         sol[3]*txy[:,0]+sol[4]*txy[:,1]+sol[5]], axis=1)
        err = np.linalg.norm(pred-np.stack([P,Q],axis=1), axis=1)
        print(f'  round {rnd}: RMS={np.sqrt((err**2).mean()):6.1f}px  moved={moved}')
    return cps, sol


def main():
    board = np.asarray(Image.open(os.path.join(ASSETS, 'map_base.png')).convert('RGBA'))[:, :, 3] > 128
    H, W = board.shape
    plane, X0, Y0, ux, uy = build_plane()
    print(f'board {W}x{H}\n控制点精化：')
    cps, sol = refine(plane, X0, Y0, ux, uy, board)

    print('\n精化后控制点：')
    for (x, y, lo, la, r, n) in cps:
        print(f'  {n:<14} px=({x},{y})  lon={lo} lat={la}')

    # 输出对齐高程
    M = np.array([[sol[0], sol[1]], [sol[3], sol[4]]]); t = np.array([sol[2], sol[5]])
    Minv = np.linalg.inv(M)
    ys, xs = np.mgrid[0:H, 0:W]
    flat = np.stack([xs.ravel().astype(float), ys.ravel().astype(float)]) - t[:, None]
    Xq, Yq = Minv @ flat
    h = sample(plane, X0, Y0, ux, uy, Xq, Yq).reshape(H, W)
    h = np.where(board, h, 0.0)

    land = h[board]
    print(f'\n陆地区域 min/max/mean = {land.min():.0f}/{land.max():.0f}/{land.mean():.0f} m')
    print(f'  >3000m 占比 {(land>3000).mean()*100:.2f}%  (真实中国 2~3%)')
    print(f'  >1000m 占比 {(land>1000).mean()*100:.2f}%  (真实中国 ~26%)')

    np.save(os.path.join(ASSETS, 'map_height_dem.npy'), h)
    lo_, hi_ = np.percentile(land, 1), np.percentile(land, 99.7)
    g = np.clip((h-lo_)/max(1e-6, hi_-lo_)*255, 0, 255)
    Image.fromarray(np.where(board, g, 0).astype(np.uint8)).save(os.path.join(ASSETS, 'map_height_dem.png'))

    bi = Image.open(os.path.join(ASSETS, 'map_base.png')).convert('RGBA')
    hv = np.asarray(Image.open(os.path.join(ASSETS, 'map_height_dem.png')))
    ov = np.asarray(bi).copy()
    ov[:, :, :3] = (ov[:, :, :3]*0.45 + np.stack([hv]*3, -1).astype(np.float32)*0.55).astype(np.uint8)
    Image.fromarray(ov).save(os.path.join(ASSETS, '_dem_overlay_check.png'))

    mk = bi.copy(); d = ImageDraw.Draw(mk)
    for (x, y, lo, la, r, n) in cps:
        d.ellipse([x-8,y-8,x+8,y+8], outline=(255,0,255,255), width=3)
        d.text((x+11, y-8), f'{n}', fill=(255,0,255,255))
    mk.save(os.path.join(ASSETS, '_control_points.png'))
    print('\n输出 map_height_dem.png / _dem_overlay_check.png / _control_points.png')


if __name__ == '__main__':
    main()