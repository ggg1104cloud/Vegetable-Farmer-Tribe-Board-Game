#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
用**轮廓配准+ 物理约束**求解 Albers plane->board 变换。

放弃"目测控制点"和"高程爬山"两条路，原因：
  - 目测：手绘底图无网格，人眼读数误差 >50px
  - 爬山：同一高程值对应多个位置，多解导致发散

改为直接在底图上优化，但加上三条硬约束防止退化解：
  1. 允许的剪切/非均匀缩放范围限制在±25% 以内（真实中国地图投影
     与 Albers 的差异不会有那么大）
  2. 要求行列式为正（不翻转）
  3. 用 **双向 IoU**（DEM->board 与 board->DEM 都要重合），单双向都能卡住退化

搜索方式：Sobol 式粗网格 + 坐标下降精修。
"""
import os, math, itertools
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')
LON_MIN, LON_MAX = 71.0, 140.0
LAT_MIN, LAT_MAX = 2.0, 55.0

LON_0, LAT_1, LAT_2, LAT_0 = 105.0, 25.0, 47.0, 36.0
E2 = 0.00669438
_n = 0.5*(1+math.sqrt(1-E2))
_C = math.cos(math.radians(LAT_1))**2 + 2*_n*math.sin(math.radians(LAT_1))* \
     math.cos(math.radians(LAT_1))/math.tan(math.radians(LAT_2))
_rho0 = _C/(math.tan(math.radians(LAT_0))*math.sqrt(1-E2*math.sin(math.radians(LAT_0))**2))


def alb_arr(lo, la):
    lo = np.asarray(lo, float); la = np.asarray(la, float)
    lat = np.radians(la); s = np.sin(lat)
    rho = _C/(np.tan(lat)*np.sqrt(np.clip(1-E2*s*s, 1e-12, None)))
    th = np.radians(lo-LON_0)
    return rho*np.sin(th), _rho0-rho*np.cos(th)


def build_plane():
    """把 DEM 投到 Albers 平面栅格（同时保留经纬度，便于反查）"""
    dem = np.load(os.path.join(ASSETS, 'dem_china_raw.npy')).astype(np.float32)
    dh, dw = dem.shape
    lons = LON_MIN+(LON_MAX-LON_MIN)*np.arange(dw)/(dw-1)
    lats = LAT_MAX-(LAT_MAX-LAT_MIN)*np.arange(dh)/(dh-1)
    LON, LAT = np.meshgrid(lons, lats)
    X, Y = alb_arr(LON, LAT)
    land = dem > 0
    mg = 3.0
    X0, X1 = float(X[land].min())-mg, float(X[land].max())+mg
    Y0, Y1 = float(Y[land].min())-mg, float(Y[land].max())+mg
    PW, PH = 1400, 1300
    ux, uy = (X1-X0)/PW, (Y1-Y0)/PH
    ix = np.clip(((X-X0)/ux).astype(np.int32), 0, PW-1)
    iy = np.clip(((Y-Y0)/uy).astype(np.int32), 0, PH-1)
    H = np.zeros((PH, PW), np.float32)
    o = np.argsort(-dem.ravel())
    H[iy.ravel()[o], ix.ravel()[o]] = dem.ravel()[o]
    return H, X0, Y0, ux, uy


def board_mask():
    from collections import deque
    a = np.asarray(Image.open(os.path.join(ASSETS, 'map_base.png')).convert('RGBA'))
    m = a[:, :, 3] > 128
    H, W = m.shape
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
    return o.reshape(H, W)


def warp_board_to_plane(board, c, X0, Y0, ux, uy, PW, PHh):
    """board 像素 -> plane 栅格索引（返回 ix, iy）"""
    H, W = board.shape
    M = np.array([[c[0], c[1]], [c[2], c[3]]]); t = np.array([c[4], c[5]])
    if abs(np.linalg.det(M)) < 1e-9:
        return None
    ys, xs = np.mgrid[0:H:2, 0:W:2]
    f = np.stack([xs.ravel().astype(float), ys.ravel().astype(float)]) - t[:, None]
    P = np.linalg.solve(M, f)
    ix = np.clip(np.round((P[0]-X0)/ux).astype(np.int32), 0, PW-1)
    iy = np.clip(np.round((P[1]-Y0)/uy).astype(np.int32), 0, PHh-1)
    return ix, iy


def main():
    PH_img, X0, Y0, ux, uy = build_plane()
    plane_land = PH_img > 0
    board = board_mask()
    H, W = board.shape
    print(f'board {W}x{H}  plane {PH_img.shape[1]}x{PH_img.shape[0]}')

    # 平面栅格坐标 -> board 像素的粗略尺度：
    # 中国平面宽约 (X1-X0)，板面陆地图宽约 (1260-46)=1214px
    # plane 栅格宽 PW=1400对应同一范围
    s = plane_land.shape[1]
    approx_scale = (1260.0-46.0) / s        # px per plane-cell
    # 初值：把 plane 左上角对齐 board 陆地左上角附近
    c = [approx_scale, 0.0, 0.0, approx_scale,
         46.0, 36.0]

    PHh, PW = plane_land.shape   # 注意是 (行=高, 列=宽)

    def iou_b2p(cc):
        """把板面陆地采样到平面栅格，与平面陆地掩码求 IoU（同栅格比较）"""
        r = warp_board_to_plane(board, cc, X0, Y0, ux, uy, PW, PHh)
        if r is None:
            return -1
        ix, iy = r
        w = plane_land[iy, ix]           # 与 board[::2,::2] 同形状
        b = board[::2, ::2]
        inter = np.logical_and(w, b).sum(); uni = np.logical_or(w, b).sum()
        return inter/uni if uni else 0.0

    def iou_p2b(cc):
        """反向：plane -> board，看 DEM 轮廓落在板面陆地上的比例"""
        M = np.array([[cc[0], cc[1]], [cc[2], cc[3]]]); t = np.array([cc[4], cc[5]])
        ys, xs = np.mgrid[0:PHh, 0:PW]
        px = M[0,0]*xs + M[0,1]*ys + t[0]
        py = M[1,0]*xs + M[1,1]*ys + t[1]
        ix = np.clip(np.round(px).astype(np.int32), 0, W-1)
        iy = np.clip(np.round(py).astype(np.int32), 0, H-1)
        hit = board[iy, ix] & plane_land
        inside = (px >= 0) & (px < W) & (py >= 0) & (py < H)
        return float(hit.sum()) / max(1, int((plane_land & inside).sum()))

    def obj(cc):
        M = np.array([[cc[0], cc[1]], [cc[2], cc[3]]])
        det = M[0,0]*M[1,1]-M[0,1]*M[1,0]
        if det <= 0:                       # 硬约束：不可翻转
            return -1
        # 硬约束：非均匀缩放与剪切不超过 25%
        sx = math.hypot(cc[0], cc[2]); sy = math.hypot(cc[1], cc[3])
        if max(sx, sy)/min(sx, sy) > 1.25:
            return -1
        cosang = (cc[0]*cc[1]+cc[2]*cc[3])/(sx*sy+1e-9)
        if abs(cosang) > 0.25:              # 剪切 <= ~14.5 度
            return -1
        return 0.5*(iou_b2p(cc) + iou_p2b(cc))

    base = obj(c)
    print('初值 obj =', round(base, 4))

    rng = np.random.default_rng(3)
    step = [approx_scale*0.25, approx_scale*0.05, approx_scale*0.05, approx_scale*0.25, 30, 30]
    best, bc = base, list(c)
    for restart in range(14):
        cur = list(bc) if restart == 0 else [bc[i]+rng.normal(0, step[i]*3) for i in range(6)]
        cs = obj(cur); st = list(step)
        for it in range(300):
            imp = False
            for k in range(6):
                for sg in (1, -1):
                    t = list(cur); t[k] += sg*st[k]
                    v = obj(t)
                    if v > cs:
                        cs, cur, imp = v, t, True
            if not imp:
                st = [s*0.55 for s in st]
                if max(st[4], st[5]) < 0.05:
                    break
        if cs > best:
            best, bc = cs, cur
        print(f'  r{restart}: {cs:.4f}   best={best:.4f}')

    print(f'\n最优 obj = {best:.4f}  (iou_b2p={iou_b2p(bc):.4f}, iou_p2b={iou_p2b(bc):.4f})')
    print('plane->board: x = %.5f*X %+.5f*Y %+.3f ; y = %.5f*X %+.5f*Y %+.3f'
          % (bc[0], bc[1], bc[4], bc[2], bc[3], bc[5]))

    # 生成高度图
    M = np.array([[bc[0], bc[1]], [bc[2], bc[3]]]); t = np.array([bc[4], bc[5]])
    Minv = np.linalg.inv(M)
    ys, xs = np.mgrid[0:H, 0:W]
    f = np.stack([xs.ravel().astype(float), ys.ravel().astype(float)]) - t[:, None]
    P = Minv @ f
    Xq, Yq = P[0], P[1]
    fx = np.clip((Xq-X0)/ux, 0, PW-1.001); fy = np.clip((Yq-Y0)/uy, 0, PHh-1.001)
    i0 = fx.astype(np.int32); j0 = fy.astype(np.int32)
    a = fx-i0; b = fy-j0
    h = (PH_img[j0,i0]*(1-a)*(1-b) + PH_img[j0,i0+1]*a*(1-b) +
         PH_img[j0+1,i0]*(1-a)*b + PH_img[j0+1,i0+1]*a*b).reshape(H, W)
    h = np.where(board, h, 0.0)

    land = h[board]
    print(f'\n高程 min/max/mean = {land.min():.0f}/{land.max():.0f}/{land.mean():.0f} m')
    print(f'  >3000m {(land>3000).mean()*100:.2f}%   >1000m {(land>1000).mean()*100:.2f}%')
    np.save(os.path.join(ASSETS, 'map_height_dem.npy'), h)
    lo, hi = np.percentile(land, 1), np.percentile(land, 99.7)
    g = np.clip((h-lo)/max(1e-6, hi-lo)*255, 0, 255)
    Image.fromarray(np.where(board, g, 0).astype(np.uint8)).save(os.path.join(ASSETS, 'map_height_dem.png'))

    bi = Image.open(os.path.join(ASSETS, 'map_base.png')).convert('RGBA')
    hv = np.asarray(Image.open(os.path.join(ASSETS, 'map_height_dem.png')))
    ov = np.asarray(bi).copy()
    ov[:, :, :3] = (ov[:, :, :3]*0.45 + np.stack([hv]*3, -1).astype(np.float32)*0.55).astype(np.uint8)
    Image.fromarray(ov).save(os.path.join(ASSETS, '_dem_overlay_check.png'))
    print('\n已输出 map_height_dem.png / _dem_overlay_check.png')


if __name__ == '__main__':
    main()