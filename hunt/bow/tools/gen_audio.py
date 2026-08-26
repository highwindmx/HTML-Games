#!/usr/bin/env python3
# WSADgame - 程序化生成音效 (纯 stdlib, 16-bit 单声道 WAV @44100Hz)
# 输出到 ../audio/  (相对于本脚本所在 tools/ 目录)
import math, struct, wave, os, random

SR = 44100

def write_wav(path, samples):
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = bytearray()
        for s in samples:
            v = max(-1.0, min(1.0, s))
            frames += struct.pack("<h", int(v * 32767))
        w.writeframes(bytes(frames))

def tone(freq, dur, amp=0.5, decay=8.0, type="sine"):
    out = []
    n = int(SR * dur)
    for i in range(n):
        t = i / SR
        env = math.exp(-t * decay)
        ph = 2 * math.pi * freq * t
        if type == "square":
            s = 1.0 if (ph % (2 * math.pi)) < math.pi else -1.0
        else:
            s = math.sin(ph)
        out.append(s * amp * env)
    return out

def noise_burst(dur, amp=0.6, decay=30.0, low_thump=0.0):
    out = []
    n = int(SR * dur)
    for i in range(n):
        t = i / SR
        env = math.exp(-t * decay)
        nz = (random.random() * 2 - 1)
        thump = math.sin(2 * math.pi * 90 * t) * math.exp(-t * 25) * low_thump if low_thump else 0
        out.append((nz * amp + thump) * env)
    return out

def concat(*segments):
    out = []
    for seg in segments:
        out.extend(seg)
    return out

def main():
    base = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "audio")
    os.makedirs(base, exist_ok=True)

    # 枪声：噪声爆裂 + 低频砰
    write_wav(os.path.join(base, "gun.wav"), noise_burst(0.13, amp=0.7, decay=42.0, low_thump=0.5))

    # 命中：高频短促 ping
    write_wav(os.path.join(base, "hit.wav"), tone(1250, 0.08, amp=0.5, decay=55.0))

    # 敌人死亡：噪声 + 下行音
    death = []
    n = int(SR * 0.35)
    for i in range(n):
        t = i / SR
        env = math.exp(-t * 11)
        nz = (random.random() * 2 - 1) * 0.55
        tone_f = 380 - 280 * (t / 0.35)
        death.append((nz + math.sin(2 * math.pi * tone_f * t) * 0.4) * env)
    write_wav(os.path.join(base, "enemy_death.wav"), death)

    # 波次开始：两音上行 (C5 -> E5)
    write_wav(os.path.join(base, "wave_start.wav"),
              concat(tone(523.25, 0.13, amp=0.45, decay=6.0),
                     tone(659.25, 0.16, amp=0.45, decay=6.0)))

    # 波次清空：上行琶音 C-E-G-C
    write_wav(os.path.join(base, "wave_clear.wav"),
              concat(tone(523.25, 0.10, amp=0.4, decay=7.0),
                     tone(659.25, 0.10, amp=0.4, decay=7.0),
                     tone(783.99, 0.10, amp=0.4, decay=7.0),
                     tone(1046.5, 0.18, amp=0.4, decay=7.0)))

    # 游戏结束：下行三音 (C5 -> G4 -> C4) 带衰减
    write_wav(os.path.join(base, "game_over.wav"),
              concat(tone(523.25, 0.20, amp=0.5, decay=4.0),
                     tone(392.00, 0.20, amp=0.5, decay=4.0),
                     tone(261.63, 0.34, amp=0.5, decay=3.0)))

    # 换弹：两段机械咔哒
    write_wav(os.path.join(base, "reload.wav"),
              concat(noise_burst(0.03, amp=0.5, decay=60.0),
                     [0.0] * int(SR * 0.07),
                     noise_burst(0.03, amp=0.5, decay=60.0)))

    # 受伤：低频嗡鸣
    write_wav(os.path.join(base, "hurt.wav"), tone(130, 0.22, amp=0.5, decay=9.0, type="square"))

    # UI 点击：短促 blip
    write_wav(os.path.join(base, "ui_click.wav"), tone(880, 0.05, amp=0.35, decay=40.0))

    print("Audio generated into:", os.path.normpath(base))

if __name__ == "__main__":
    random.seed(42)
    main()
