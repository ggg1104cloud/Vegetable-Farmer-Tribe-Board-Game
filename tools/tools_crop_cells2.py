#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
用 43 个实测中心点（cellPositions.js）反推每格精确 bbox，再裁切贴图。

思路：
  中心点可靠（已由tools_detect_cells.py 验证），但每格宽高不一
  （角上的"起点+100""种子集市"是两格宽），所以 bbox 不能假设正方形。
  对每个中心点，沿水平/垂直方向走到最近的白色分隔线，即为格边。

输出：
  assets/cells/cell_00.png ... cell_42.png   正方形贴图（短边补米黄底）
  assets/cells/cells_index.json              序号 / bbox / 中心 / 边 / 宽高
"""
import os, json, re
import numpy as np
from PIL import Image, ImageDraw

ROOT = r'C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版\cn-village'
A = os.path.join(ROOT, 'assets')
OUT = os.path.join(A, 'cells')
os.makedirs(OUT, exist_ok=True)

PAD = 5# 从白线内侧往里缩，留白边


def load_centers():
    js = open(os.path.join(ROOT, 'src', 'cellPositions.js'), encoding='utf-8').read()
    m = re.search(r'CELL_POS\s*=\s*(\[\s*\[.*?\]\s*\]);', js, re.S)
    return json.loads(m.group(1))


def main():
    im = Image.open(os.path.join(A, 'board_full.png')).convert('RGB')
    W, H = im.size
    a = np.asarray(im).astype(np.int16)
    # 白色分隔线：近白
    white = (a[:, :, 0] > 240) & (a[:, :, 1] > 236) & (a[:, :, 2] > 224)

    centers = load_centers()
    print(f'中心点 {len(centers)} 个，图 {W}x{H}')

    boxes = []
    # 格子物理边长基准：白线间距约 156~166px，据此钳制 bbox，防止
    # 某一侧白线缺失时搜索穿透到邻格（曾出现 448/996px 的异常高）
    CELL = 166
    MAXW, MAXH = CELL * 2 + 40, CELL * 2 + 40
    for k, (nx, nz) in enumerate(centers):
        cx, cy = int(round(nx * W)), int(round(nz * H))
        cx = max(0, min(W - 1, cx)); cy = max(0, min(H - 1, cy))

        # 用 ±6 行/列的平均，避免单行白线缺失
        def white_col_frac(x):
            return white[max(0, cy-6):cy+7, x].mean()
        def white_row_frac(y):
            return white[y, max(0, cx-6):cx+7].mean()

        xl = cx
        while xl > 0 and white_col_frac(xl) < 0.4:
            xl -= 1
        xr = cx
        while xr < W - 1 and white_col_frac(xr) < 0.4:
            xr += 1
        yt = cy
        while yt > 0 and white_row_frac(yt) < 0.4:
            yt -= 1
        yb = cy
        while yb < H - 1 and white_row_frac(yb) < 0.4:
            yb += 1

        x0, x1 = xl + PAD, xr - PAD
        y0, y1 = yt + PAD, yb - PAD

        # 钳制：以中心为锚，超出物理上限就截断
        if x1 - x0 > MAXW:
            x0 = max(x0, cx - MAXW // 2); x1 = min(x1, cx + MAXW // 2)
        if y1 - y0 > MAXH:
            y0 = max(y0, cy - MAXH // 2); y1 = min(y1, cy + MAXH // 2)
        if x1 - x0 < 20: x0, x1 = cx - 60, cx + 60
        if y1 - y0 < 20: y0, y1 = cy - 60, cy + 60
        boxes.append((x0, y0, x1, y1))
        print(f'  {k:2d} c=({cx:4d},{cy:4d}) bbox x[{x0:4d},{x1:4d}] y[{y0:4d},{y1:4d}] '
              f'{x1-x0:4d}x{y1-y0:4d}')

    # ---- 裁切 + 按所在边旋正 + 补成正方形 ----
    # PDF 原图里，左右两侧格子的文字是竖排（顺时针转 90°），
    # 3D 贴到方块顶面后要能正着读，故按边做方向归一。
    def side_of(k):
        nx, nz = centers[k]
        if nz > 0.90: return 'S'
        if nx > 0.90: return 'E'
        if nz < 0.10: return 'N'
        if nx < 0.10: return 'W'
        return '?'

    ROT = {'S': 0, 'N': 0, 'E': -90, 'W': 90}

    idx = []
    for i, (x0, y0, x1, y1) in enumerate(boxes):
        box = (max(0, x0), max(0, y0), min(W, x1), min(H, y1))
        crop = im.crop(box)
        sd = side_of(i)
        r = ROT.get(sd, 0)
        if r:
            crop = crop.rotate(r, expand=True)
        cw, ch = crop.size
        s = max(cw, ch)
        canvas = Image.new('RGB', (s, s), (255, 231, 187))
        canvas.paste(crop, ((s - cw) // 2, (s - ch) // 2))
        canvas = canvas.resize((s * 2, s * 2), Image.LANCZOS)
        fn = f'cell_{i:02d}.png'
        canvas.save(os.path.join(OUT, fn))
        idx.append(dict(i=i, file=fn, side=sd, rot=r,
                        bbox=[int(box[0]), int(box[1]), int(box[2]), int(box[3])],
                        cx=round((box[0]+box[2])/2/W, 4), cy=round((box[1]+box[3])/2/H, 4),
                        w=int(box[2]-box[0]), h=int(box[3]-box[1])))

    json.dump(idx, open(os.path.join(OUT, 'cells_index.json'), 'w', encoding='utf-8'),
              indent=1, ensure_ascii=False)
    print(f'\n已输出 {len(idx)} 张 -> {OUT}')

    # 预览大图
    cols = 7
    rows = (len(idx) + cols - 1) // cols
    TS, LB = 190, 20
    sheet = Image.new('RGB', (cols*TS, rows*(TS+LB)), (255, 255, 255))
    d = ImageDraw.Draw(sheet)
    for k, r in enumerate(idx):
        t = Image.open(os.path.join(OUT, r['file'])).resize((TS, TS), Image.LANCZOS)
        ox, oy = (k % cols)*TS, (k // cols)*(TS+LB)
        sheet.paste(t, (ox, oy))
        d.rectangle([ox, oy, ox+TS-1, oy+TS-1], outline=(190, 190, 190))
        d.text((ox+4, oy+TS+4), f"{k:02d} {r['w']}x{r['h']}", fill=(0, 0, 0))
    sheet.save(os.path.join(A, '_cells_sheet.png'))
    print('预览 -> assets/_cells_sheet.png')


if __name__ == '__main__':
    main()