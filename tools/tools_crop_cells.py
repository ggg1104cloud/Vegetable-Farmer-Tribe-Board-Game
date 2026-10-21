#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
按白色网格线精确切出 board_full.png 外圈每一格，存成独立贴图。

做���：
  1. 在四条边条带里检测白色分隔线的像素位置
  2. 相邻两条线之间 = 一格，得到每格精确 bbox
  3. 顺时针遍历（下边从右到左 -> 右边从下到上 -> 上边从右到左 -> 左边从上到下）
  4. 每格裁切+留白边，输出 assets/cells/cell_00.png ... cell_NN.png
  5. 另存 cells_index.json：序号 / bbox / 中心归一化坐标 / 顺时针路径
"""
import os, json
import numpy as np
from PIL import Image

ROOT = r'C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版\cn-village'
A = os.path.join(ROOT, 'assets')
OUT = os.path.join(A, 'cells')
os.makedirs(OUT, exist_ok=True)


def runs(mask):
    """把布尔数组压成 [start,end) 区间列表"""
    out = []
    s = None
    for i, v in enumerate(mask):
        if v and s is None:
            s = i
        elif not v and s is not None:
            out.append((s, i - 1))
            s = None
    if s is not None:
        out.append((s, len(mask) - 1))
    return out


def merge(iv, gap=6):
    """把邻近区间合并（分隔线本身有宽度）"""
    m = []
    for a, b in iv:
        if m and a - m[-1][1] <= gap:
            m[-1][1] = b
        else:
            m.append([a, b])
    return [(a + b) // 2 for a, b in m]


def detect():
    im = Image.open(os.path.join(A, 'board_full.png'))
    a = np.asarray(im.convert('RGB')).astype(int)
    H, W, _ = a.shape
    w = (a[:, :, 0] > 243) & (a[:, :, 1] > 240) & (a[:, :, 2] > 228)

    T = 90# 边条带厚度
    def vlines(sl):
        return merge([r for r in runs(sl) ], 8)
    # 顶/底条：竖线
    top = merge(runs(w[12:66, :].mean(0) > 0.65), 8)
    bot = merge(runs(w[H - 66:H - 12, :].mean(0) > 0.65), 8)
    # 左/右条：横线
    lef = merge(runs(w[:, 12:66].mean(1) > 0.65), 8)
    rig = merge(runs(w[:, W - 66:W - 12].mean(1) > 0.65), 8)
    return im, a, (W, H), top, bot, lef, rig


def main():
    im, a, (W, H), top, bot, lef, rig = detect()
    print(f'图 {W}x{H}')
    print('顶条竖线', top)
    print('底条竖线', bot)
    print('左条横线', lef)
    print('右条横线', rig)

    # 每格 bbox = (x0,y0,x1,y1)，由四条线交点确定
    def cells_from(v, h, vertical_first):
        """vertical_first=True 表示沿 x 方向排布的一排（顶/底条）"""
        out = []
        if vertical_first:
            for i in range(len(v) - 1):
                out.append((v[i], h[0], v[i + 1], h[1]))
        else:
            for i in range(len(h) - 1):
                out.append((v[0], h[i], v[1], h[i + 1]))
        return out

    # 四条边的有效区段（去掉角部，避免角格重复计数）
    ytop0, ytop1 = top[0], top[-1]
    ybot0, ybot1 = bot[0], bot[-1]
    xlef0, xlef1 = lef[0], lef[-1]
    xrig0, xrig1 = rig[0], rig[-1]

    bottom_cells = [(x, ybot0, x2, ybot1) for x, x2 in zip(bot, bot[1:])]
    top_cells = [(x, ytop0, x2, ytop1) for x, x2 in zip(top, top[1:])]
    # 左边：y 从 ytop1 到 ybot0（排除角）
    left_cells = [(xlef0, y, xlef1, y2) for y, y2 in zip(lef, lef[1:])
                  if y >= ytop1 - 2 and y2 <= ybot0 + 2]
    right_cells = [(xrig0, y, xrig1, y2) for y, y2 in zip(rig, rig[1:])
                   if y >= ytop1 - 2 and y2 <= ybot0 + 2]

    print(f'\n底边 {len(bottom_cells)} 格 / 顶边 {len(top_cells)} 格 / '
          f'左边 {len(left_cells)} 格 / 右边 {len(right_cells)} 格')

    # 顺时针：起点在右下角 -> 沿底边向左 -> 左边向上 -> 顶边向右 -> 右边向下
    seq = []
    seq += [(c, 'S') for c in reversed(bottom_cells)]      # 底边 右->左
    seq += [(c, 'W') for c in left_cells]                  # 左边 上->下? 下面统一
    seq += [(c, 'N') for c in top_cells]                   # 顶边 左->右
    seq += [(c, 'E') for c in right_cells]                 # 右边 上->下

    # 修正方向：真正顺时针（俯视，+x 向右、+z 向下）
    seq = []
    seq += [(c, 'S') for c in reversed(bottom_cells)]      # 右下 -> 左下
    seq += [(c, 'W') for c in reversed(left_cells)]        # 左下 -> 左上
    seq += [(c, 'N') for c in top_cells]                   # 左上 -> 右上
    seq += [(c, 'E') for c in right_cells]                 # 右上 -> 右下
    # 最后回到起点，末尾若与首格重合则去掉
    print(f'顺时针合计 {len(seq)} 格')

    # 裁切
    PAD = 3
    idx = []
    for i, ((x0, y0, x1, y1), side) in enumerate(seq):
        box = (max(0, x0 + PAD), max(0, y0 + PAD),
               min(W, x1 - PAD), min(H, y1 - PAD))
        crop = im.crop(box)
        # 统一到正方形（贴图要求），短边补白
        cw, ch = crop.size
        s = max(cw, ch)
        canvas = Image.new('RGB', (s, s), (250, 246, 235))
        canvas.paste(crop, ((s - cw) // 2, (s - ch) // 2))
        # 存 2 倍尺寸，投影后仍清晰
        canvas = canvas.resize((s * 2, s * 2), Image.LANCZOS)
        fn = f'cell_{i:02d}.png'
        canvas.save(os.path.join(OUT, fn))
        cx = (x0 + x1) / 2 / W
        cy = (y0 + y1) / 2 / H
        idx.append(dict(i=i, file=fn, side=side, bbox=[int(x0), int(y0), int(x1), int(y1)],
                        cx=round(cx, 4), cy=round(cy, 4),
                        w=int(x1 - x0), h=int(y1 - y0)))

    with open(os.path.join(OUT, 'cells_index.json'), 'w', encoding='utf-8') as f:
        json.dump(idx, f, indent=1, ensure_ascii=False)
    print(f'已输出 {len(idx)} 张格子贴图 -> {OUT}')

    # 拼一张预览图方便肉眼核对
    cols = 8
    rows = (len(idx) + cols - 1) // cols
    TS = 160
    sheet = Image.new('RGB', (cols * TS, rows * (TS + 18)), (255, 255, 255))
    from PIL import ImageDraw
    d = ImageDraw.Draw(sheet)
    for k, r in enumerate(idx):
        im2 = Image.open(os.path.join(OUT, r['file'])).resize((TS, TS), Image.LANCZOS)
        cx0 = (k % cols) * TS; cy0 = (k // cols) * (TS + 18)
        sheet.paste(im2, (cx0, cy0))
        d.rectangle([cx0, cy0, cx0 + TS - 1, cy0 + TS - 1], outline=(200, 200, 200))
        d.text((cx0 + 4, cy0 + TS + 3), f"{k:02d} {r['side']} {r['w']}x{r['h']}", fill=(0, 0, 0))
    sheet.save(os.path.join(A, '_cells_sheet.png'))
    print('预览 -> assets/_cells_sheet.png')


if __name__ == '__main__':
    main()