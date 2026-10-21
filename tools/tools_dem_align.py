#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把真实 DEM（AWS Terrain Tiles）配准到 PDF 图板的手绘中国地图上。

采用最稳的路线：**轮廓掩码配准 + 物理硬约束**。
  - 硬约束1：det > 0（不翻转）
  - 硬约束 2：各向异性缩放 <= 1.2（真实中国图与 Albers 差异不会更大）
  - 硬约束 3：剪切角<= 10°
  - 目标函数：把 board 陆地与 plane 陆地采样到**同一栅格**后求 IoU

输出
  assets/map_height_dem.npy   真实高程(米)，尺寸同 map_base.png
  assets/map_height_dem.png   8bit 灰度，供 three.js 直接读
  assets/_dem_overlay_check.png 叠加对照图
"""
import os, math
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, 'assets')

LON_MIN, LON_MAX = 71.0, 140.0
LAT_MIN, LAT_MAX = 2.0, 55.0

# 平面栅格只保留**大陆主体**（lat >= 16）。
# 原因：底图虽画了南沙群岛，但那是一条极细的长条，
# 在Albers 里把 Y 方向拉长 10 倍（lat4 的 Y=-19.7，而 lat18 才-1.9），
# 会把整个大陆压成几十像素，配准必然失败。
# 南沙是装饰性岛屿，对地形沙盘没有贡献。
PLANE_LAT_MIN = 16.0

LON_0, LAT_1, LAT_2, LAT_0 = 105.0, 25.0, 47.0, 36.0
E2 = 0.00669438
_n = 0.5 * (1 + math.sqrt(1 - E2))
_C = math.cos(math.radians(LAT_1))**2 + 2*_n*math.sin(math.radians(LAT_1)) * \
     math.cos(math.radians(LAT_1)) / math.tan(math.radians(LAT_2))
_rho0 = _C / (math.tan(math.radians(LAT_0)) *
              math.sqrt(1 - E2*math.sin(math.radians(LAT_0))**2))

PLANE_W = PLANE_H = 1200     # 平面栅格分辨率
BOARD_DS = 3                # 配准时板面降采样倍数（加速）


def alb_arr(lo, la):
    lo = np.asarray(lo, float); la = np.asarray(la, float)
    lat = np.radians(la); s = np.sin(lat)
    rho = _C / (np.tan(lat) * np.sqrt(np.clip(1 - E2*s*s, 1e-12, None)))
    th = np.radians(lo - LON_0)
    return rho*np.sin(th), _rho0 - rho*np.cos(th)


def build_plane():
    dem = np.load(os.path.join(ASSETS, 'dem_china_raw.npy')).astype(np.float32)
    dh, dw = dem.shape
    lons = LON_MIN + (LON_MAX-LON_MIN)*np.arange(dw)/(dw-1)
    lats = LAT_MAX - (LAT_MAX-LAT_MIN)*np.arange(dh)/(dh-1)
    LON, LAT = np.meshgrid(lons, lats)
    X, Y = alb_arr(LON, LAT)
    # 只保留大陆主体：纬度 >= PLANE_LAT_MIN 且高程 > 0
    land = (dem > 0) & (LAT >= PLANE_LAT_MIN)
    # 边距按栅格尺寸的比例给，而不是固定世界单位。
    # 固定 mg=3.0 而中国平面跨度只有 ~5.5 单位、栅格 1200 格时，
    # 边距会吃掉 3/5.5 = 55% 的范围，导致陆地只落在栅格中间一条。
    spanX = float(X[land].max() - X[land].min())
    spanY = float(Y[land].max() - Y[land].min())
    mgX, mgY = spanX * 0.02, spanY * 0.02
    X0, X1 = float(X[land].min())-mgX, float(X[land].max())+mgX
    Y0, Y1 = float(Y[land].min())-mgY, float(Y[land].max())+mgY
    ux, uy = (X1-X0)/PLANE_W, (Y1-Y0)/PLANE_H
    ix = np.clip(((X-X0)/ux).astype(np.int32), 0, PLANE_W-1)
    iy = np.clip(((Y-Y0)/uy).astype(np.int32), 0, PLANE_H-1)
    H = np.zeros((PLANE_H, PLANE_W), np.float32)
    o = np.argsort(-dem.ravel())          # 高的后写 -> 保留山脊
    H[iy.ravel()[o], ix.ravel()[o]] = dem.ravel()[o]
    # 把 PLANE_LAT_MIN 以下清零，避免南沙细条参与配准
    y_at_16 = alb_arr(np.array([110.0]), np.array([PLANE_LAT_MIN]))[1][0]
    row_at_16 = int(round((y_at_16 - Y0)/uy))
    H[row_at_16:, :] = 0.0
    print(f'plane {PLANE_W}x{PLANE_H}  ux={ux:.5f} uy={uy:.5f}  截断行={row_at_16}')
    return H, X0, Y0, ux, uy


def board_mask():
    """底图陆地掩码：只保留**最大连通域**。

    注意：alpha>128 会把四角说明框、箭头框、图例都算进来，
    必须按连通域筛掉，否则 bbox 覆盖整张图，配准必然失败。
    """
    from collections import deque
    a = np.asarray(Image.open(os.path.join(ASSETS, 'map_base.png')).convert('RGBA'))
    m = a[:, :, 3] > 128
    H, W = m.shape
    seen = np.zeros_like(m)
    ys, xs = np.where(m)
    best = None
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
    out = o.reshape(H, W)
    # 裁掉底部细长的南沙群岛：它会把 bbox 拉得很高，配准时被当成主体
    # 做法：按行统计，只保留连续的主体高度范围
    rows = out.sum(axis=1)
    ys_, xs_ = np.where(out)
    y0, y1 = int(ys_.min()), int(ys_.max())
    # 从底部往上找：连续 6 行都很少像素即认为是细条区
    thr = max(3, int(out[y0:y1+1].mean(axis=1).max()*0.02))
    cut = y1
    while cut > y0 and rows[cut] < thr:
        cut -= 1
    if y1 - cut > 40:
        out[cut+1:, :] = False
        print(f'  裁掉底部南沙细条: y {cut+1}..{y1} (阈值 {thr}px/行)')
    yy, xx = np.where(out)
    print(f'  board land {out.sum()}px  bbox x[{xx.min()},{xx.max()}] y[{yy.min()},{yy.max()}]')
    return out


def main():
    plane, X0, Y0, ux, uy = build_plane()
    plane_land = plane > 0
    board = board_mask()
    H, W = board.shape
    bd = board[::BOARD_DS, ::BOARD_DS]
    print(f'board {W}x{H} -> ds {bd.shape[1]}x{bd.shape[0]}')

    # 板面陆地 bbox（降采样坐标）—— np.where 返回 (ys, xs)，别搞反
    ys_, bxs = np.where(bd)
    bx0, bx1 = int(bxs.min()), int(bxs.max())
    by0, by1 = int(ys_.min()), int(ys_.max())
    print('board land bbox(ds) x[%d,%d] y[%d,%d]' % (bx0, bx1, by0, by1))

    pys, pxs = np.where(plane_land)
    pw, ph = plane.shape[1], plane.shape[0]
    print('plane land bbox x[%d,%d] y[%d,%d]'
          % (int(pxs.min()), int(pxs.max()), int(pys.min()), int(pys.max())))

    # 预计算 board(ds) -> plane 栅格的采样网格（板面尺寸固定，可复用）
    # 注意 Y 轴翻转：plane 栅格 y 向下增大 = 向南，board 也是向下增大 = 向南，
    # 两者方向一致，不需额外翻转。
    bY, bX = np.mgrid[0:bd.shape[0], 0:bd.shape[1]]
    bXf = bX.ravel().astype(np.float64)
    bYf = bY.ravel().astype(np.float64)

    def make_warp(c):
        M = np.array([[c[0], c[1]], [c[2], c[3]]]); t = np.array([c[4], c[5]])
        det = M[0,0]*M[1,1] - M[0,1]*M[1,0]
        if det <= 0:
            return None, det
        Mi = np.linalg.inv(M)
        f = np.stack([bXf, bYf]) - t[:, None]
        P = Mi @ f
        ix = np.clip(np.round((P[0]-X0)/ux).astype(np.int32), 0, pw-1)
        iy = np.clip(np.round((P[1]-Y0)/uy).astype(np.int32), 0, ph-1)
        return (iy, ix), det

    def obj(c):
        idx, det = make_warp(c)
        if idx is None:
            return -1.0
        # 物理约束
        sx = math.hypot(c[0], c[2]); sy = math.hypot(c[1], c[3])
        if min(sx, sy) <= 0:
            return -1.0
        if max(sx, sy)/min(sx, sy) > 1.20:
            return -1.0
        cosang = (c[0]*c[1] + c[2]*c[3]) / (sx*sy)
        if abs(cosang) > 0.18:             # 剪切 <= ~10.4度
            return -1.0
        iy, ix = idx
        w = plane_land[iy, ix]
        inter = np.logical_and(w, bd.ravel()).sum()
        uni = np.logical_or(w, bd.ravel()).sum()
        return inter/uni if uni else 0.0

    # ---- 初值：让 plane 陆地图与 board 陆地图 bbox 对齐 ----
    # plane 陆地 bbox: x[px0,px1] y[py0,py1]（y 向下为南）
    # board(ds) 陆地 bbox: x[bx0,bx1] y[by0,by1]
    # 映射 plane->board：x_b = s*(x_p - px0) + bx0
    #                     y_b = s*(y_p - py0) + by0
    tw = max(1, bx1-bx0); th = max(1, by1-by0)
    tpw = max(1, int(pxs.max()-pxs.min()))
    tph = max(1, int(pys.max()-pys.min()))
    s0 = (tw/tpw + th/tph) / 2
    c = [s0, 0.0, 0.0, s0,
         bx0 - pxs.min()*s0, by0 - pys.min()*s0]
    print('\n初值 obj =', round(obj(c), 4))

    rng = np.random.default_rng(2024)
    step = [s0*0.30, s0*0.06, s0*0.06, s0*0.30, tw*0.15, th*0.15]
    best, bc = obj(c), list(c)
    for restart in range(16):
        cur = list(bc) if restart == 0 else [bc[i] + rng.normal(0, step[i]*3) for i in range(6)]
        cs = obj(cur); st = list(step)
        for it in range(400):
            imp = False
            for k in range(6):
                for sg in (1, -1):
                    t2 = list(cur); t2[k] += sg*st[k]
                    v = obj(t2)
                    if v > cs:
                        cs, cur, imp = v, t2, True
            if not imp:
                st = [x*0.55 for x in st]
                if max(abs(st[4]), abs(st[5])) < 0.02:
                    break
        if cs > best:
            best, bc = cs, cur
        print(f'  r{restart:2d}: {cs:.4f}   best={best:.4f}')

    print(f'\n最优 IoU = {best:.4f}')
    print('plane->board: x = %.5f*X %+.5f*Y %+.3f| y = %.5f*X %+.5f*Y %+.3f'
          % (bc[0], bc[1], bc[4], bc[2], bc[3], bc[5]))

    # ---- 输出全分辨率高程图 ----
    M = np.array([[bc[0], bc[1]], [bc[2], bc[3]]]); t = np.array([bc[4], bc[5]])
    Mi = np.linalg.inv(M)
    ys, xs = np.mgrid[0:H, 0:W]
    P = Mi @ (np.stack([xs.ravel().astype(float), ys.ravel().astype(float)]) - t[:, None])
    fx = np.clip((P[0]-X0)/ux, 0, pw-1.001); fy = np.clip((P[1]-Y0)/uy, 0, ph-1.001)
    i0 = fx.astype(np.int32); j0 = fy.astype(np.int32)
    a = fx-i0; b = fy-j0
    h = (plane[j0,i0]*(1-a)*(1-b) + plane[j0,i0+1]*a*(1-b) +
         plane[j0+1,i0]*(1-a)*b + plane[j0+1,i0+1]*a*b).reshape(H, W)
    h = np.where(board, h, 0.0)

    land = h[board]
    print(f'\n高程 min/max/mean = {land.min():.0f} / {land.max():.0f} / {land.mean():.0f} m')
    print(f'  >3000m {(land>3000).mean()*100:.2f}%   >1000m {(land>1000).mean()*100:.2f}%')
    np.save(os.path.join(ASSETS, 'map_height_dem.npy'), h)
    lo, hi = np.percentile(land, 1), np.percentile(land, 99.7)
    g = np.clip((h-lo)/max(1e-6, hi-lo)*255, 0, 255)
    Image.fromarray(np.where(board, g, 0).astype(np.uint8)).save(
        os.path.join(ASSETS, 'map_height_dem.png'))

    bi = Image.open(os.path.join(ASSETS, 'map_base.png')).convert('RGBA')
    hv = np.asarray(Image.open(os.path.join(ASSETS, 'map_height_dem.png')))
    ov = np.asarray(bi).copy()
    ov[:, :, :3] = (ov[:, :, :3]*0.45 + np.stack([hv]*3, -1).astype(np.float32)*0.55).astype(np.uint8)
    Image.fromarray(ov).save(os.path.join(ASSETS, '_dem_overlay_check.png'))
    with open(os.path.join(ASSETS, '_plane2board.txt'), 'w', encoding='utf-8') as f:
        f.write(' '.join(repr(float(v)) for v in bc))
    print('\n已输出 map_height_dem.npy / .png / _dem_overlay_check.png / _plane2board.txt')


if __name__ == '__main__':
    main()