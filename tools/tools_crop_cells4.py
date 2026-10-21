#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
用白色网格线精确切出 board_full.png 外圈每一格 -> assets/cells/*.png

网格线实测（board_full.png 1963x1482）
  TX 顶边竖线: 7 297 466 636 807 978 1148 1319 1490 1660 1954  -> 10 格
  BX 底边竖线: 7 300 471 641 812 983 1153 1324 1495 1664 1954  -> 10 格
  LY 左条横线: 8 276 431 586 741 896 1051 1205 1473           ->  7 格
  RY 右条横线: 同上                                            ->  7 格
角格（起点+100 / 种子集市 / 监狱）跨越两条带，只算一次：
  底边 10 +顶边 10 + 左 5(去角) + 右 5(去角) = 30 格

顺时针编号（俯视，起点在右下角）：
  底边 右->左(10) ->右边 下->上(5) -> 顶边 左->右(10) -> 左边 上->下(5) = 30
"""
import os, json
import numpy as np
from PIL import Image, ImageDraw

ROOT = r'C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版\cn-village'
A = os.path.join(ROOT, 'assets')
OUT = os.path.join(A, 'cells')
os.makedirs(OUT, exist_ok=True)

PAD = 4
BG = (255, 231, 187)          # 赛道格底色，用于补边


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


def main():
    im = Image.open(os.path.join(A, 'board_full.png')).convert('RGB')
    W, H = im.size
    a = np.asarray(im).astype(np.int16)
    white = (a[:, :, 0] > 243) & (a[:, :, 1] > 236) & (a[:, :, 2] > 224)

    TX = runs(white[12:66, :].mean(0))
    BX = runs(white[H-66:H-12, :].mean(0))
    LY = runs(white[:, 12:66].mean(1))
    RY = runs(white[:, W-66:W-12].mean(1))
    print('TX', TX, len(TX) - 1)
    print('BX', BX, len(BX) - 1)
    print('LY', LY, len(LY) - 1)
    print('RY', RY, len(RY) - 1)

    # 四条带的内外边界（注意：TX/BX 是 x 方向线，LY/RY 是 y 方向线，
    # 底条的高度要用 LY 的最后一条，顶条的高度要用 LY 的第一条；
    # 左右条的宽度要用 BX/TX 的第一条与最后一条）
    yS0 = LY[-1]                # 底条上界
    yN1 = LY[0]                 # 顶条下界
    xW1 = TX[-1]                # 左条右界
    xE0 = TX[0]                 # 右条左界
    print(f'底条 y[{yS0},{H}]  顶条 y[0,{yN1}]  左条 x[0,{xW1}]  右条 x[{xE0},{W}]')

    boxes = []   # (side, bbox)

    # 底边：BX 切 10 段，从右到左
    for k in range(len(BX) - 1):
        boxes.append(('S', (BX[k] + PAD, yS0 + PAD, BX[k+1] - PAD, H - PAD)))
    boxes.reverse()

    # 右边：RY 切 7 段，去掉最下一段（角格已在底边），从下到上
    for k in range(len(RY) - 2, 0, -1):
        boxes.append(('E', (xE0 + PAD, RY[k] + PAD, W - PAD, RY[k+1] - PAD)))

    # 顶边：TX 切 10 段，从左到右
    for k in range(len(TX) - 1):
        boxes.append(('N', (TX[k] + PAD, PAD, TX[k+1] - PAD, yN1 - PAD)))

    # 左边：LY 切 7 段，去掉最下一段（角格），从上到下
    for k in range(0, len(LY) - 2):
        boxes.append(('W', (PAD, LY[k] + PAD, xW1 - PAD, LY[k+1] - PAD)))

    print(f'\n共{len(boxes)} 格')
    for i, (sd, b) in enumerate(boxes):
        print(f'  {i:2d} {sd} x[{b[0]:4d},{b[2]:4d}] y[{b[1]:4d},{b[3]:4d}] '
              f'{b[2]-b[0]:4d}x{b[3]-b[1]:4d}')

    # ---- 裁切 + 旋正 + 补正方形 ----
    # PDF 原图左右两侧文字竖排，贴到 3D 方块顶面需旋正
    ROT = {'S': 0, 'N': 0, 'E': -90, 'W': 90}
    idx = []
    for i, (sd, b) in enumerate(boxes):
        box = (max(0, b[0]), max(0, b[1]), min(W, b[2]), min(H, b[3]))
        crop = im.crop(box)
        r = ROT[sd]
        if r:
            crop = crop.rotate(r, expand=True)
        cw, ch = crop.size
        s = max(cw, ch)
        canvas = Image.new('RGB', (s, s), BG)
        canvas.paste(crop, ((s - cw)//2, (s - ch)//2))
        canvas = canvas.resize((s*2, s*2), Image.LANCZOS)
        fn = f'cell_{i:02d}.png'
        canvas.save(os.path.join(OUT, fn))
        idx.append(dict(i=i, file=fn, side=sd, rot=r, bbox=[int(v) for v in box],
                        cx=round((box[0]+box[2])/2/W, 4),
                        cy=round((box[1]+box[3])/2/H, 4),
                        w=int(box[2]-box[0]), h=int(box[3]-box[1])))

    json.dump(idx, open(os.path.join(OUT, 'cells_index.json'), 'w', encoding='utf-8'),
              indent=1, ensure_ascii=False)

    cols = 6; TS, LB = 200, 20
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