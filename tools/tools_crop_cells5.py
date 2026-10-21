#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
按白色网格线精确切出 board_full.png 外圈每一格 -> assets/cells/*.png

board_full.png 1963x1482 实测网格：
  外框      x[7,1954]  y[8,1473]
  顶/底条竖线 x: 7 297 466 636 807 978 1148 1319 1490 1660 1954  (10 段)
  左/右条横线 y: 8 276 431 586 741 896 1051 1205 1473            ( 8 段)
  -> 底边 10 + 右边 7 + 顶边 10 + 左边 7 = 34 格

顺时针编号（俯视 +x 向右 / +z 向下，起点在右下角「起点+100」）：
  底边 右->左 (10)  右边 下->上 (7)
  顶边 左->右 (10)  左边 上->下 (7)

左右两侧格子在PDF 里文字竖排，贴到 3D 方块顶面前需旋转 90° 旋正。
"""
import os, json
import numpy as np
from PIL import Image, ImageDraw

ROOT = r'C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版\cn-village'
A = os.path.join(ROOT, 'assets')
OUT = os.path.join(A, 'cells')
os.makedirs(OUT, exist_ok=True)

PAD = 4
BG = (255, 231, 187)


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

    TX = runs(white[12:66, :].mean(0))          # 顶边竖线
    BX = runs(white[H-66:H-12, :].mean(0))      # 底边竖线
    YS = runs(white[:, 12:66].mean(1))          # 左/右 边横线
    print('TX', TX, len(TX) - 1)
    print('BX', BX, len(BX) - 1)
    print('YS', YS, len(YS) - 1)

    X0, X1 = TX[0], TX[-1]        # 7, 1954  外框左/右
    Y0, Y1 = YS[0], YS[-1]        # 8, 1473  外框上/下
    # 顶条占 y[8,276]，底条占 y[1205,1473]，中间 y[276,1205] 是左右条带区
    yTop0, yTop1 = YS[0], YS[1]        # 8, 276
    yBot0, yBot1 = YS[-2], YS[-1]      # 1205, 1473
    # 左右条带的横向范围：左条 x[7,297]，右条 x[1664,1954]
    xW_in, xE_in = TX[0], BX[-2]
    xW_out, xE_out = TX[1], TX[-1]
    print(f'外框 x[{X0},{X1}] y[{Y0},{Y1}]')
    print(f'顶条 y[{yTop0},{yTop1}]  底条 y[{yBot0},{yBot1}]')
    print(f'左条 x[{xW_in},{xW_out}]  右条 x[{xE_in},{xE_out}]')

    boxes = []# (side, bbox)

    # 底边：BX 10 段，顺序 右 -> 左
    bot = [('S', (BX[k] + PAD, yBot0 + PAD, BX[k+1] - PAD, yBot1 - PAD))
           for k in range(len(BX) - 1)]
    boxes += list(reversed(bot))

    # 右边：YS 中间段（去掉最下一段=角格、去掉第一条=顶边角格），下 -> 上
    for k in range(len(YS) - 3, 0, -1):
        boxes.append(('E', (xE_in + PAD, YS[k] + PAD, xE_out - PAD, YS[k+1] - PAD)))

    # 顶边：TX 10 段，顺序 左 -> 右
    for k in range(len(TX) - 1):
        boxes.append(('N', (TX[k] + PAD, yTop0 + PAD, TX[k+1] - PAD, yTop1 - PAD)))

    # 左边：YS 中间段，上 -> 下
    for k in range(1, len(YS) - 2):
        boxes.append(('W', (xW_in + PAD, YS[k] + PAD, xW_out - PAD, YS[k+1] - PAD)))

    print(f'\n共 {len(boxes)} 格')
    for i, (sd, b) in enumerate(boxes):
        print(f'  {i:2d} {sd} x[{b[0]:4d},{b[2]:4d}] y[{b[1]:4d},{b[3]:4d}] '
              f'{b[2]-b[0]:4d}x{b[3]-b[1]:4d}')

    # ---- 裁切 + 逐格旋正 + 补正方形 ----
    # PDF 原图排版是「棋盘从各方向观看」的混合朝向，逐格实测：
    #   底边 S：全部正立                -> 0°
    #   左列 W：文字逆时针 90° 竖排     -> +90°
    #   右列 E：文字顺时针 90° 竖排     -> -90°
    #   顶边 N：混排 —— 站点格（监狱/弃种地/改良站/气象站/种子集市）
    #             已正立；土地卡格（土地缩略图 + 竖排名）倒置 180°
    # 顶边段序 -> cells 索引 16..25 -> 旋转（0=正立，180=倒置）
    N_ROT = {16: 0, 17: 0, 18: 180, 19: 180, 20: 0,
             21: 180, 22: 0, 23: 180, 24: 180, 25: 0}
    def rot_for(i, sd):
        if sd == 'N':
            return N_ROT.get(i, 180)
        return {'S': 0, 'E': -90, 'W': 90}[sd]
    idx = []
    for i, (sd, b) in enumerate(boxes):
        box = (max(0, b[0]), max(0, b[1]), min(W, b[2]), min(H, b[3]))
        crop = im.crop(box)
        r = rot_for(i, sd)
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


if __name__ == '__main__':
    main()