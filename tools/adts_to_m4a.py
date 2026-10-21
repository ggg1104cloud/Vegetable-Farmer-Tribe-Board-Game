#!/usr/bin/env python3
"""把「裸 ADTS-AAC 流」重新封装成标准 M4A（MP4 容器）。

为什么需要它
------------
用户给的背景音乐虽然扩展名是 .m4a，实际是**裸 ADTS AAC**（文件头是 FF F1，
没有 ftyp/moov）。浏览器 <audio> 对裸 ADTS 支持不稳（Firefox 直接不支持），
但都支持 MP4 容器里的 AAC。

本机环境里的 ffmpeg 是精简版（只有 h264 视频编解码，没有 aac 解复用器），
所以这里用纯 Python 手工写 MP4 容器 —— 只做「换壳」，**不重新编码**，音质无损。

用法
----
    python tools/adts_to_m4a.py <input.aac> <output.m4a>
"""
import struct
import sys

# ADTS sampling_frequency_index → 实际采样率
SF_TABLE = [96000, 88200, 64000, 48000, 44100, 32000,
            24000, 22050, 16000, 12000, 11025, 8000, 7350]

MATRIX = struct.pack('>9i', 0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000)


def box(t, payload):
    """一个 MP4 box：size(4) + type(4) + payload。"""
    return struct.pack('>I', len(payload) + 8) + t + payload


def fullbox(t, ver, flags, payload):
    """带 version/flags 的 box。"""
    return box(t, struct.pack('>B', ver) + struct.pack('>I', flags)[1:] + payload)


def desc(tag, payload):
    """MPEG-4 描述符：tag + 变长长度（7 位/字节，最高位=续接）+ payload。"""
    n = len(payload)
    out = bytes([tag])
    if n < 0x80:
        out += bytes([n])
    else:
        chunks = []
        while True:
            chunks.insert(0, n & 0x7F)
            n >>= 7
            if n == 0:
                break
        for i in range(len(chunks) - 1):
            chunks[i] |= 0x80
        out += bytes(chunks)
    return out + payload


def parse_adts(data):
    """遍历 ADTS 帧，返回 (流信息, [每帧的原始 AAC 载荷])。"""
    frames = []
    info = None
    pos, n = 0, len(data)
    while pos + 7 <= n:
        if data[pos] != 0xFF or (data[pos + 1] & 0xF0) != 0xF0:
            pos += 1                      # 找同步字
            continue
        protection_absent = data[pos + 1] & 0x01
        profile = (data[pos + 2] >> 6) & 0x03
        sf_index = (data[pos + 2] >> 2) & 0x0F
        channel_cfg = ((data[pos + 2] & 0x01) << 2) | ((data[pos + 3] >> 6) & 0x03)
        frame_len = ((data[pos + 3] & 0x03) << 11) | (data[pos + 4] << 3) | (data[pos + 5] >> 5)
        blocks = data[pos + 6] & 0x03
        if frame_len < 7 or pos + frame_len > n:
            break
        header_len = 7 if protection_absent else 9
        frames.append(data[pos + header_len:pos + frame_len])
        if info is None:
            info = dict(profile=profile, sf_index=sf_index, channel_cfg=channel_cfg,
                        samples_per_frame=1024 * (blocks + 1))
        pos += frame_len
    return info, frames


def audio_specific_config(object_type, sf_index, channel_cfg):
    """AudioSpecificConfig：5 位对象类型 + 4 位采样率索引 + 4 位声道数，共 13 位。"""
    bits = ((object_type & 0x1F) << 11) | ((sf_index & 0x0F) << 7) | ((channel_cfg & 0x0F) << 3)
    return struct.pack('>H', bits)


def build(input_path, output_path):
    data = open(input_path, 'rb').read()
    info, frames = parse_adts(data)
    if not info or not frames:
        raise SystemExit('没有解析到任何 ADTS 帧，确认输入是裸 AAC 流')

    object_type = (info['profile'] + 1) & 0x1F          # AAC-LC → 2
    sf_index = info['sf_index']
    channel_cfg = info['channel_cfg']
    sample_rate = SF_TABLE[sf_index] if sf_index < len(SF_TABLE) else 44100
    spf = info['samples_per_frame']
    nframes = len(frames)
    total_samples = nframes * spf
    duration_ms = round(total_samples / sample_rate * 1000)
    total_bytes = sum(len(f) for f in frames)
    avg_bitrate = int(total_bytes * 8 / (total_samples / sample_rate)) if total_samples else 0

    asc = audio_specific_config(object_type, sf_index, channel_cfg)

    # ---- 采样表 ----
    esds_payload = struct.pack('>I', 0) + desc(
        0x03,
        struct.pack('>H', 0) + bytes([0]) +
        desc(0x04,
             bytes([0x40, 0x15]) + struct.pack('>I', 0)[1:] +
             struct.pack('>I', avg_bitrate * 2) + struct.pack('>I', avg_bitrate) +
             desc(0x05, asc)) +
        desc(0x06, b'\x02'))
    esds = box(b'esds', esds_payload)
    mp4a = box(b'mp4a',
               b'\x00' * 6 + struct.pack('>H', 1) + b'\x00' * 8 +
               struct.pack('>HHHH', channel_cfg, 16, 0, 0) +
               struct.pack('>I', sample_rate << 16) + esds)
    stsd = fullbox(b'stsd', 0, 0, struct.pack('>I', 1) + mp4a)
    stts = fullbox(b'stts', 0, 0, struct.pack('>I', 1) + struct.pack('>II', nframes, spf))
    stsc = fullbox(b'stsc', 0, 0, struct.pack('>I', 1) + struct.pack('>III', 1, nframes, 1))
    stsz = fullbox(b'stsz', 0, 0,
                   struct.pack('>I', 0) + struct.pack('>I', nframes) +
                   b''.join(struct.pack('>I', len(f)) for f in frames))

    def make_moov(chunk_offset):
        stco = fullbox(b'stco', 0, 0, struct.pack('>I', 1) + struct.pack('>I', chunk_offset))
        stbl = box(b'stbl', stsd + stts + stsc + stsz + stco)
        smhd = fullbox(b'smhd', 0, 0, struct.pack('>HH', 0, 0))
        dref = fullbox(b'dref', 0, 0, struct.pack('>I', 1) + fullbox(b'url ', 0, 1, b''))
        minf = box(b'minf', smhd + box(b'dinf', dref) + stbl)
        mdhd = fullbox(b'mdhd', 0, 0,
                       struct.pack('>II', 0, 0) + struct.pack('>I', sample_rate) +
                       struct.pack('>I', total_samples) + struct.pack('>HH', 0x55C4, 0))
        hdlr = fullbox(b'hdlr', 0, 0,
                       struct.pack('>I', 0) + b'soun' + b'\x00' * 12 + b'SoundHandler\x00')
        mdia = box(b'mdia', mdhd + hdlr + minf)
        tkhd = fullbox(b'tkhd', 0, 7,
                       struct.pack('>II', 0, 0) + struct.pack('>I', 1) + struct.pack('>I', 0) +
                       struct.pack('>I', duration_ms) + struct.pack('>II', 0, 0) +
                       struct.pack('>HHHH', 0, 0, 0x0100, 0) + MATRIX +
                       struct.pack('>II', 0, 0))
        trak = box(b'trak', tkhd + mdia)
        mvhd = fullbox(b'mvhd', 0, 0,
                       struct.pack('>IIII', 0, 0, 1000, duration_ms) +
                       struct.pack('>I', 0x00010000) + struct.pack('>H', 0x0100) +
                       struct.pack('>H', 0) + struct.pack('>II', 0, 0) + MATRIX +
                       b'\x00' * 24 + struct.pack('>I', 2))
        return box(b'moov', mvhd + trak)

    ftyp = box(b'ftyp', b'M4A ' + struct.pack('>I', 0x200) + b'M4A ' + b'mp42' + b'isom')
    # moov 在 mdat 之前（faststart）：先算长度，再回填 chunk_offset（长度不变）
    moov = make_moov(0)
    chunk_offset = len(ftyp) + len(moov) + 8
    moov = make_moov(chunk_offset)
    mdat = box(b'mdat', b''.join(frames))

    open(output_path, 'wb').write(ftyp + moov + mdat)
    print(f'OK  {output_path}')
    print(f'    AAC-LC  object_type={object_type}  {sample_rate}Hz  {channel_cfg}ch')
    print(f'    {nframes} 帧 / {total_samples} 采样 / {duration_ms/1000:.1f} 秒')
    print(f'    ASC=0x{asc.hex()}  avg_bitrate={avg_bitrate//1000}kbps  '
          f'输出 {len(ftyp)+len(moov)+len(mdat)} 字节')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('用法：python tools/adts_to_m4a.py <input.aac> <output.m4a>')
    build(sys.argv[1], sys.argv[2])