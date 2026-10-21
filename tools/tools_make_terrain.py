# -*- coding: utf-8 -*-
"""
把 board_full.png 中央的中国地图裁成独立底片，并分析出高度场（用于 three.js 立体化）。

产出:
  assets/map_base.png   纯地图底片（透明外圈，供 3D 贴图）
  assets/map_mask.png   陆地掩码（白=陆地）—— 决定地形网格哪里凸起
  src/terrainData.js    高度场（Uint8 数组 + 尺寸 + 陆地掩码）

高度来源（按优先级）:
  1. 图上原有的三角山峰符号 -> 尖峰
  2. 图上原有山脉连线（喜马拉雅/秦岭/大兴安岭等）-> 脊线
  3. 土地利用色块（黄土高原/草原/盆地/平原）-> 分层台地
  4. 水域（黄/蓝江海）-> 凹陷到 0
"""
import os, sys, json, base64
from PIL import Image
import numpy as np

BASE = r'C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版\cn-village'
BOARD = os.path.join(BASE, 'assets', 'board_full.png')
OUT_PNG = os.path.join(BASE, 'assets', 'map_base.png')
OUT_MASK = os.path.join(BASE, 'assets', 'map_mask.png')
OUT_JS = os.path.join(BASE, 'src', 'terrainData.js')

# board_full.png 里地图区的像素范围（用宣纸白底色定位得到）
X0, X1 = 297, 1664
Y0, Y1 = 276, 1204

# 网格精度（够用又不至于太大）
GW, GH = 116, 110


def rgb(r, g, b):
    return np.array([r, g, b], dtype=np.int16)


def main():
    im = Image.open(BOARD).convert('RGB')
    W, H = im.size
    crop = im.crop((X0, Y0, X1, Y1))
    cw, ch = crop.size
    print(f'地图底片 {cw}x{ch}')

    # ---------- 1. 陆地掩码 ----------
    a = np.asarray(crop).astype(np.int16)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]

    # 宣纸白底（不属于地图）
    paper = (abs(r - 240) < 8) & (abs(g - 236) < 8) & (abs(b - 233) < 8)
    # 近白（卡片装饰底）
    near_white = (r > 246) & (g > 244) & (b > 238)

    # 陆地 = 有颜色的地方（排除白底与近白）
    colored = (np.abs(r - g) > 9) | (np.abs(g - b) > 9) | (np.abs(r - b) > 9)
    land = colored & ~near_white
    # 排除图上的文字标签（小连通域），后处理
    land = np.asarray(Image.fromarray((land * 255).astype(np.uint8))
                      .filter(__import__('PIL.ImageFilter', fromlist=['MedianFilter']).MedianFilter(5))) > 127

    # ---------- 2. 土壤/地貌配色分区（用于分层） ----------
    # 采样原图主色
    print('采样地貌主色…')
    yellow = (np.abs(r - 240) < 26) & (np.abs(g - 196) < 30) & (b < 130)   # 黄土高原
    darkred = (r > 180) & (g < 90) & (b < 70)                            # 青藏高原(红)
    green = (g > 150) & (r < 170) & (b < 160)                              # 草地/平原
    sandy = (r > 200) & (g > 175) & (b > 130) & (b < 205)                # 荒漠
    water = (b > 120) & (b > r + 35) & (b > g + 18)                     # 水域

    # 山峰符号：深灰褐三角 (r 60-130, g 50-110, b 50-110)
    peak = (r > 50) & (r < 140) & (g > 45) & (g < 120) & (b > 45) & (b < 120) & \
           (np.abs(r - g) < 34) & (np.abs(g - b) < 34)
    # 雪山符号（青藏）：偏白带灰
    snow = (r > 195) & (g > 195) & (b > 195) & (np.abs(r - b) < 30) & land

    print(f'  黄土 {yellow.mean():.3f} 青藏红 {darkred.mean():.3f} 草地 {green.mean():.3f} '
          f'荒漠 {sandy.mean():.3f} 水 {water.mean():.3f} 峰 {peak.mean():.4f} 雪 {snow.mean():.4f}')

    # ---------- 3. 降采样到网格 ----------
    def downsample_bool(mask, w, h, thr=0.5):
        """块平均后按阈值转回布尔 —— 细线（山脉/河）用点采样会整个漏掉"""
        sh, sw = mask.shape
        ys = np.linspace(0, sh, h + 1).astype(int)
        xs = np.linspace(0, sw, w + 1).astype(int)
        out = np.zeros((h, w), dtype=np.float32)
        for j in range(h):
            y0, y1 = ys[j], max(ys[j] + 1, ys[j + 1])
            for i in range(w):
                x0, x1 = xs[i], max(xs[i] + 1, xs[i + 1])
                blk = mask[y0:y1, x0:x1]
                out[j, i] = blk.mean() if blk.size else 0
        return out > thr

    def downsample(mask, w, h):
        # 用块平均（box resample）而不是点采样，否则细线（山脉/河流）会被漏掉
        sh, sw = mask.shape
        ys = np.linspace(0, sh, h + 1).astype(int)
        xs = np.linspace(0, sw, w + 1).astype(int)
        out = np.zeros((h, w), dtype=np.float32)
        for j in range(h):
            y0, y1 = ys[j], max(ys[j] + 1, ys[j + 1])
            for i in range(w):
                x0, x1 = xs[i], max(xs[i] + 1, xs[i + 1])
                blk = mask[y0:y1, x0:x1]
                out[j, i] = blk.mean() if blk.size else 0
        return out

    landG = downsample_bool(land, GW, GH)
    yellowG = downsample_bool(yellow, GW, GH) & landG
    darkG = downsample_bool(darkred, GW, GH) & landG
    greenG = downsample_bool(green, GW, GH) & landG
    sandyG = downsample_bool(sandy, GW, GH) & landG
    waterG = downsample_bool(water, GW, GH)
    peakG = downsample_bool(peak, GW, GH) & landG
    snowG = downsample_bool(snow, GW, GH) & landG

    # ---------- 4. 高度场（0-255）----------
    h = np.zeros((GH, GW), dtype=np.float32)

    # 基础台地高度：不同地貌不同海拔感（拉开差距才有立体感）
    BASE_H = 18
    h[landG] = BASE_H
    h[greenG] = 30                # 草原/平原：低平
    h[sandyG] = 46                      # 荒漠/盆地：略高
    h[yellowG] = 96                     # 黄土高原：明显隆起
    h[darkG] = 205                      # 青藏高原：最高

    # 水域：0（湖面/海面）
    h[waterG] = 0

    # 山峰符号 -> 尖峰（喜马拉雅最高）
    h[peakG] = np.maximum(h[peakG], 175)
    h[snowG] = np.maximum(h[snowG], 250)

    # ---------- 5. 高斯模糊 + 归一化 ----------
    def blur(arr, r):
        """高斯模糊。输入是 0~255 的浮点高度，返回同量纲。
        注意：PIL 的 GaussianBlur 只接受 uint8/图像，不能直接除 255，
        否则 0~255 会被压成 0~1（之前高度场全 0 就是这个坑）。"""
        from PIL import ImageFilter
        a8 = np.clip(arr, 0, 255).astype(np.uint8)
        img = Image.fromarray(a8).filter(ImageFilter.GaussianBlur(r))
        return np.asarray(img).astype(np.float32)

    # 大半径负责地形块面，小半径负责山峰细节
    hf = blur(h, 1)
    hb = blur(h, 4)
    hbig = blur(h, 7)
    hmix = np.where(h > 0, hb * 0.42 + hbig * 0.58, 0)
    # 加回山峰细节（只在大地形之上凸出，避免整体被抹平）
    hmix = np.where(hf > hb, np.maximum(hmix, hf * 0.85), hmix)

    # 陆地外扩一圈做裙边（让边缘平滑过渡到 0，避免悬空）
    lm = blur(landG.astype(np.float32) * 255.0, 3) / 255.0   # 归一化到 0~1
    hmix = hmix * np.clip(lm * 1.6, 0, 1)
    hmix[~landG & (lm > 0.12)] = 6             # 外围一圈浅裙边

    # gamma 提升中高差，让台地分层更明显
    hmix = np.clip(hmix / 255.0, 0, 1) ** 0.72
    hmix = hmix * 255.0
    h8 = np.clip(hmix, 0, 255).astype(np.uint8)
    # 非陆地置 0
    h8[~landG] = 0

    print(f'高度范围 {h8.min()} ~ {h8.max()}, 陆地格 {int(landG.sum())}/{GW*GH}')
    assert h8.max() > 100, f'高度场异常：max={h8.max()}，降采样逻辑可能有问题'

    # ---------- 6. 输出 ----------
    # 6.1 透明底片：陆地保留原色，外圈透明
    rgba = np.dstack([np.asarray(crop), (land * 255).astype(np.uint8)])
    Image.fromarray(rgba, 'RGBA').save(OUT_PNG)
    print('->', os.path.basename(OUT_PNG), Image.open(OUT_PNG).size)

    # 6.2 掩码图（调试用）
    Image.fromarray((land * 255).astype(np.uint8), 'L').save(OUT_MASK)

    # 6.3 高度场 JS（用 PNG 传高度更省，three.js 直接当纹理读）
    Image.fromarray(h8, 'L').save(os.path.join(BASE, 'assets', 'map_height.png'))
    print('->', 'map_height.png')

    # 6.4 JS 元数据
    js = f"""// 自动生成 —— python tools_make_terrain.py
// 中国地图体素地形数据（由 board_full.png 分析得到）
// 网格 {GW}x{GH}，对应 assets/map_height.png（灰度=高度）与 map_base.png（贴图）
export const TERRAIN_W = {GW};
export const TERRAIN_H = {GH};

/** 陆地掩码下采样到网格（true = 有陆地）*/
export const LAND_MASK = {json.dumps(landG.astype(bool).tolist())};

/** 图板中地图区在 board_full.png 上的像素范围 —— 3D 场景要对齐到这个区域 */
export const MAP_RECT_PX = {{ x: {X0}, y: {Y0}, w: {X1 - X0}, h: {Y1 - Y0} }};

/** 原始裁切区域（图板归一化坐标 0-1）*/
export const MAP_RECT_NORM = {{
  x: {round(X0 / 1963, 4)}, y: {round(Y0 / 1482, 4)},
  w: {round((X1 - X0) / 1963, 4)}, h: {round((Y1 - Y0) / 1482, 4)}
}};
"""
    open(OUT_JS, 'w', encoding='utf-8').write(js)
    print('->', os.path.basename(OUT_JS), os.path.getsize(OUT_JS), 'bytes')


if __name__ == '__main__':
    main()