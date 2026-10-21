# -*- coding: utf-8 -*-
"""
裁切《菜农部落电子版.pdf》全部卡牌素材 -> cn-village/assets/cards/

坐标来源：聚类检测（tools 用 -1 版）+ 人工按版式核对。
页面尺寸 841.92 x 595.32 pt。
"""
import fitz, os, sys
sys.stdout.reconfigure(encoding='utf-8')

BASE = r'C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版'
PDF = os.path.join(BASE, '菜农部落电子版.pdf')
OUT = os.path.join(BASE, 'cn-village', 'assets')
DPI = 220
PAD = 2

doc = fitz.open(PDF)


def crop(pi, rect, name, pad=PAD, rot=0):
    """裁切并保存；rot != 0 时用 PIL 旋转（竖版卡 -> 横版）"""
    page = doc[pi]
    r = fitz.Rect(rect[0] + pad, rect[1] + pad, rect[2] - pad, rect[3] - pad) & page.rect
    pix = page.get_pixmap(dpi=DPI, clip=r)
    path = os.path.join(OUT, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if rot:
        from PIL import Image
        import io
        im = Image.open(io.BytesIO(pix.tobytes('png'))).rotate(rot, expand=True)
        im.save(path)
        print(f'  {name:<32} {im.width}x{im.height}  rot{rot}')
        return path
    pix.save(path)
    print(f'  {name:<32} {pix.width}x{pix.height}')
    return path


# ---------------- 图板 ----------------
print('=== 图板 ===')
crop(0, (100, 55, 742, 540), 'board_full.png', pad=0)
crop(0, (168, 145, 742, 462), 'map_china.png', pad=0)

# ---------------- 土地信息卡 11 张 ----------------
# page4(idx3): 三列 x=10/279/564, 两行 y=89..294 / 314..514, 卡宽 268
print('=== 土地信息卡 ===')
COLS = [10, 279, 564]
CW = 268
R1 = (89, 294)
R2 = (314, 514)
p4 = [
    ('land_huangmiantu', COLS[0], R1), ('land_heilitu',    COLS[1], R1),
    ('land_jiangnan',   COLS[2], R1), ('land_zise',       COLS[0], R2),
    ('land_xibei',      COLS[1], R2), ('land_nanfang',    COLS[2], R2),
]
for nm, cx, (y0, y1) in p4:
    crop(3, (cx, y0, cx + CW, y1), f'cards/{nm}.png')

p5 = [
    ('land_shandong', COLS[0], R1), ('land_huangmo', COLS[1], R1),
    ('land_yungui',   COLS[2], R1), ('land_hainan',  COLS[0], R2),
    ('land_qingzang', COLS[1], R2),
]
for nm, cx, (y0, y1) in p5:
    crop(4, (cx, y0, cx + CW, y1), f'cards/{nm}.png')

# ---------------- 作物卡 10 张 ----------------
# page6(idx5) 上排 5 张横版（图片矩形 x=5.9/162.1/327.7/493.8/672.7）
print('=== 作物卡 ===')
CROP_TOP = [
    ('crop_malingshu', 5.9, 66.1, 159.8, 355.3),
    ('crop_huasheng',  162.1, 66.1, 325.4, 357.6),
    ('crop_xigua',     327.7, 65.4, 491.5, 354.6),
    ('crop_hongshu',   493.8, 66.1, 663.1, 357.6),
    ('crop_xiaomai',   672.7, 65.5, 833.5, 354.6),
]
for nm, x0, y0, x1, y1 in CROP_TOP:
    crop(5, (x0, y0, x1, y1), f'cards/{nm}.png')

# 下排 3 组是旋转 90° 的竖版卡（番茄/玉米/油菜 + 水稻），裁切后转正
CROP_ROT = [
    ('crop_fanqie', 4.6, 367.0, 280.9, 518.2),
    ('crop_yumi',   279.0, 366.2, 559.0, 520.8),
    ('crop_youcai', 559.0, 364.0, 833.5, 525.2),
]
for nm, x0, y0, x1, y1 in CROP_ROT:
    crop(5, (x0, y0, x1, y1), f'cards/{nm}.png', rot=-90)

# page7(idx6)：水稻卡 + 茶树卡（横版）
crop(6, (17.4, 71.2, 172.2, 355.2), 'cards/crop_shuidao.png')
crop(6, (191.4, 71.2, 355.2, 355.2), 'cards/crop_chashu.png')

# ---------------- 改良卡 12 张 ----------------
print('=== 改良卡 ===')
# page8(idx7) 上排 4 张
p8_top = [('imp_dimo', 111.7), ('imp_diguan', 273.6),
          ('imp_jixiehua', 443.3), ('imp_zengchan', 613.8)]
for nm, x0 in p8_top:
    crop(7, (x0, 66, x0 + 152, 272), f'cards/{nm}.png')
# page8 下排 4 张
p8_bot = [('imp_youjifei', 108.7), ('imp_fuhefei', 282.8),
          ('imp_qiyuan', 449.8), ('imp_fuzhi', 613.8)]
for nm, x0 in p8_bot:
    crop(7, (x0, 303, x0 + 152, 508), f'cards/{nm}.png')
# page9(idx8) 4 张
p9 = [('imp_cetu', 113.2), ('imp_ph', 283.6),
      ('imp_nongyao', 451.0), ('imp_tudihuli', 618.4)]
for nm, x0 in p9:
    crop(8, (x0, 69, x0 + 152, 270), f'cards/{nm}.png')

# ---------------- 站点小图标 ----------------
print('=== 站点图标 ===')
# page7(idx6) 的 4 个 65x65 是 A/B/C/D 部落方块
for i, nm in enumerate(['tribe_A', 'tribe_B', 'tribe_C', 'tribe_D']):
    x0 = 383.9 + i * 111
    crop(6, (x0, 77.5, x0 + 65, 142.5), f'ui/{nm}.png')
# page8/9 左上角站点标签
crop(7, (17.5, 70, 96, 141), 'ui/station_nongji.png')
crop(7, (17.5, 304, 91, 380), 'ui/station_duifei.png')
crop(8, (21, 70, 99, 147), 'ui/station_keyan.png')

print('\n完成 ->', OUT)