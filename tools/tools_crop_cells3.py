#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
用白色网格线（精确）+ 中心点（定序）确定 43 格的 bbox，裁切贴图。

网格线实测（board_full.png 1963x1482）：
  TOP  x: 7  297  466  636  807  978  1148 1319 1490 1660 1954
  BOT  x: 7  300  471  641  812  983  1153 1324 1495 1664 1954
  LEFT y: 8 276 431 586 741 896 1051 1205 1473
  RIGHTy: 8 276 431 586 741 896 1051 1205 1473
顶/底各 10 格，左右各 7 格（含角共 34）—— 但赛道是 43 格，
说明左右两侧每格被上下再分了一半（y 间距 155 = 格高的一半）。
因此左右边按 155px 步长细分，角格单独处理。

策略：
  底边 10 格 + 顶边 10 格 + 左边 7 格 + 右边 7 格 = 34
  仍差 9 格 -> 左右边每格再对半分（含角在内角格已是双倍尺寸）。
  直接用中心点数（43）校验：中心点数 = 底10 + 顶10 + 左中? + 右中?
  实测 43 - 20 = 23 分给左右两侧 => 左 11 右 12（含角）。
  故左/右条带各按 23/2 与 23-23/2 分段，纵向用网格线 y 做锚点再均分。
"""
import os, json, re
import numpy as np
from PIL import Image, ImageDraw

ROOT = r'C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版\cn-village'
A = os.path.join(ROOT, 'assets')
OUT = os.path.join(A, 'cells')
os.makedirs(OUT, exist_ok=True)

PAD = 4


def runs(v, th=0.6, gap=8):
    idx = [i for i, x in enumerate(v) if x > th]
    if not idx:
        return []
    out = []; cur = [idx[0]]
    for v2 in idx[1:]:
        if v2 - cur[-1] <= gap:
            cur.append(v2)
        else:
            out.append(int(np.mean(cur))); cur = [v2]
    out.append(int(np.mean(cur)))
    return out


def load_centers():
    js = open(os.path.join(ROOT, 'src', 'cellPositions.js'), encoding='utf-8').read()
    m = re.search(r'CELL_POS\s*=\s*(\[\s*\[.*?\]\s*\]);', js, re.S)
    return json.loads(m.group(1))


def main():
    im = Image.open(os.path.join(A, 'board_full.png')).convert('RGB')
    W, H = im.size
    a = np.asarray(im).astype(np.int16)
    white = (a[:, :, 0] > 243) & (a[:, :, 1] > 236) & (a[:, :, 2] > 224)

    TX = runs(white[12:66, :].mean(0))
    BX = runs(white[H-66:H-12, :].mean(0))
    LY = runs(white[:, 12:66].mean(1))
    RY = runs(white[:, W-66:W-12].mean(1))
    print('TX', TX); print('BX', BX); print('LY', LY); print('RY', RY)

    centers = load_centers()

    # ---- 分组：按中心点落在哪条带----
    grpS = [i for i, (nx, nz) in enumerate(centers) if nz > 0.90]
    grpN = [i for i, (nx, nz) in enumerate(centers) if nz < 0.10]
    grpE = [i for i, (nx, nz) in enumerate(centers) if nx > 0.90 and 0.10 <= nz <= 0.90]
    grpW = [i for i, (nx, nz) in enumerate(centers) if nx < 0.10 and 0.10 <= nz <= 0.90]
    print(f'S={len(grpS)} N={len(grpN)} E={len(grpE)} W={len(grpW)}  '
          f'合计{len(grpS)+len(grpN)+len(grpE)+len(grpW)}')
    # 角格同时属于横条和竖条 -> 归到横条（S/N）
    grpE = [i for i in grpE if i not in grpS and i not in grpN]
    grpW = [i for i in grpW if i not in grpS and i not in grpN]
    print(f'去角后 S={len(grpS)} N={len(grpN)} E={len(grpE)} W={len(grpW)}  '
          f'合计{len(grpS)+len(grpN)+len(grpE)+len(grpW)}')

    boxes = {}

    # 底边：从右到左 10 段（用 BX），角格更宽（起点+100 / 种子集市）
    grpS_sorted = sorted(grpS, key=lambda i: -centers[i][0])
    segs = [(BX[k], BX[k+1]) for k in range(len(BX)-1)]
    assert len(segs) == len(grpS_sorted), (len(segs), len(grpS_sorted))
    for i, (xa, xb) in zip(grpS_sorted, segs):
        boxes[i] = (xa + PAD, LY[-1] + PAD, xb - PAD, H - PAD)

    grpN_sorted = sorted(grpN, key=lambda i: centers[i][0])
    segs = [(TX[k], TX[k+1]) for k in range(len(TX)-1)]
    assert len(segs) == len(grpN_sorted), (len(segs), len(grpN_sorted))
    for i, (xa, xb) in zip(grpN_sorted, segs):
        boxes[i] = (xa + PAD, PAD, xb - PAD, LY[0] - PAD)

    # 右边 / 左边：中心点排序后，在相邻网格线之间均分
    def side_boxes(grp, xs, ys):
        g = sorted(grp, key=lambda i: -centers[i][1])   # 下 -> 上
        # 用中心点 y 把整段切成 n 份
        ys_c = sorted([centers[i][1]*H for i in g], reverse=True)
        edges = [ys[0]] + [(ys_c[k]+ys_c[k+1])/2 for k in range(len(ys_c)-1)] + [ys[-1]]
        for k, i in enumerate(g):
            boxes[i] = (xs[0] + PAD, int(edges[k]) + PAD,
                        xs[-1] - PAD, int(edges[k+1]) - PAD)

    side_boxes(grpE, RY, [8, H])
    side_boxes(grpW, LY, [8, H])

    assert len(boxes) == 43, len(boxes)
    for i in range(43):
        assert i in boxes, f'缺格 {i}'

    # ---- 裁切 ----
    ROT = {'S': 0, 'N': 0, 'E': -90, 'W': 90}
    def side_of(i):
        if i in grpS: return 'S'
        if i in grpN: return 'N'
        if i in grpE: return 'E'
        return 'W'

    idx = []
    for i in range(43):
        x0, y0, x1, y1 = boxes[i]
        box = (max(0, x0), max(0, y0), min(W, x1), min(H, y1))
        crop = im.crop(box)
        sd = side_of(i)
        r = ROT[sd]
        if r:
            crop = crop.rotate(r, expand=True)
        cw, ch = crop.size
        s = max(cw, ch)
        canvas = Image.new('RGB', (s, s), (255, 231, 187))
        canvas.paste(crop, ((s - cw)//2, (s - ch)//2))
        canvas = canvas.resize((s*2, s*2), Image.LANCZOS)
        fn = f'cell_{i:02d}.png'
        canvas.save(os.path.join(OUT, fn))
        idx.append(dict(i=i, file=fn, side=sd, rot=r,
                        bbox=[int(v) for v in box],
                        cx=round((box[0]+box[2])/2/W, 4),
                        cy=round((box[1]+box[3])/2/H, 4),
                        w=int(box[2]-box[0]), h=int(box[3]-box[1])))
        print(f'  {i:2d} {sd} x[{box[0]:4d},{box[2]:4d}] y[{box[1]:4d},{box[3]:4d}] '
              f'{box[2]-box[0]:4d}x{box[3]-box[1]:4d}')

    json.dump(idx, open(os.path.join(OUT, 'cells_index.json'), 'w', encoding='utf-8'),
              indent=1, ensure_ascii=False)

    cols = 7; TS, LB = 190, 20
    rows = (len(idx)+cols-1)//cols
    sheet = Image.new('RGB', (cols*TS, rows*(TS+LB)), (255, 255, 255))
    d = ImageDraw.Draw(sheet)
    for k, r in enumerate(idx):
        t = Image.open(os.path.join(OUT, r['file'])).resize((TS, TS), Image.LANCZOS)
        ox, oy = (k % cols)*TS, (k // cols)*(TS+LB)
        sheet.paste(t, (ox, oy))
        d.rectangle([ox, oy, ox+TS-1, oy+TS-1], outline=(190, 190, 190))
        d.text((ox+4, oy+TS+4), f"{k:02d} {r['side']} {r['w']}x{r['h']}", fill=(0, 0, 0))
    sheet.save(os.path.join(A, '_cells_sheet.png'))
    print(f'\n已输出 {len(idx)} 张 -> {OUT}')
    print('预览 -> assets/_cells_sheet.png')


if __name__ == '__main__':
    main()