# Original calm ambient piece, synthesized from scratch (no samples).
import numpy as np, wave, sys
SR = 44100; DUR = float(sys.argv[2]) if len(sys.argv) > 2 else 48.0
N = int(SR * DUR); rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)
hz = lambda m: 440.0 * 2 ** ((m - 69) / 12)
CH = 6.0  # seconds per chord
chords = [  # (bass, voicing)  D major: D  Bm  G  A  D  Bm  G  D
    (38, [50, 57, 61, 64, 66]), (35, [47, 54, 57, 61, 62]), (31, [43, 50, 54, 57, 59]), (33, [45, 52, 55, 59, 61]),
    (38, [50, 57, 61, 64, 66]), (35, [47, 54, 57, 61, 62]), (31, [43, 50, 54, 57, 59]), (38, [50, 57, 62, 64, 69])]
def env(n, a, r, total):
    e = np.ones(n); ai = int(a * SR); ri = int(r * SR)
    e[:ai] = np.linspace(0, 1, ai) ** 2
    e[n - ri:] *= np.linspace(1, 0, ri) ** 1.5
    return e
def add(sig, start, pan=0.0, gain=1.0):
    s = int(start * SR); e = min(N, s + len(sig)); sig = sig[:e - s] * gain
    L[s:e] += sig * np.sqrt((1 - pan) / 2); R[s:e] += sig * np.sqrt((1 + pan) / 2)

# pad
for ci, (bass, voice) in enumerate(chords):
    start = ci * CH - 1.2 if ci else 0.0
    length = CH + 3.4 if ci < len(chords) - 1 else DUR - start
    n = int(length * SR); t = np.arange(n) / SR
    e = env(n, 2.2, 3.0, length)
    for vi, m in enumerate(voice):
        f = hz(m); sig = np.zeros(n)
        for det in (-0.0035, 0.0, 0.0035):
            for h in range(1, 6):
                sig += np.sin(2 * np.pi * f * (1 + det) * h * t + rng.uniform(0, 6.28)) / h ** 1.9
        sig *= (1 + 0.15 * np.sin(2 * np.pi * (0.11 + 0.03 * vi) * t))  # slow breathing
        add(sig * e, start, pan=(vi - 2) * 0.28, gain=0.018)
    # bass
    tb = t; b = np.sin(2 * np.pi * hz(bass) * tb) + 0.25 * np.sin(2 * np.pi * hz(bass) * 2 * tb)
    add(b * env(n, 1.5, 3.0, length), start, gain=0.07)

# soft piano / music-box line, sparse, enters after the intro
def note(m, vel):
    n = int(4.0 * SR); t = np.arange(n) / SR; f = hz(m)
    s = sum(np.sin(2 * np.pi * f * h * t) * np.exp(-t * (1.1 + 1.6 * h)) / h ** 1.3 for h in (1, 2, 3, 4))
    s += 0.25 * np.sin(2 * np.pi * f * 2.005 * t) * np.exp(-t * 2.2)
    a = int(0.006 * SR); s[:a] *= np.linspace(0, 1, a)
    return s * vel
pattern = [0, 2, 4, 3, 1, 3, 2, 4]  # indices into the upper voicing, eighth notes of a slow 60 bpm
for ci, (bass, voice) in enumerate(chords):
    if ci == 0: continue
    up = [m + 12 for m in voice]
    for k in range(12):  # 12 half-second slots per chord
        if (k % 3 == 2 and rng.random() < .6) or rng.random() < .12: continue
        if ci == len(chords) - 1 and k > 4: break
        m = up[pattern[(k + ci) % len(pattern)]]
        tt = ci * CH + k * 0.5 + rng.normal(0, 0.012)
        add(note(m, 0.9 + rng.uniform(-.25, .1)), tt, pan=rng.uniform(-.5, .5), gain=0.05)
# final chord, rolled
for j, m in enumerate([62, 66, 69, 74]):
    add(note(m + 12, .8), (len(chords) - 1) * CH + 3.0 + j * 0.18, pan=(j - 1.5) * .3, gain=0.05)

# reverb: exponentially decaying noise IR, convolved by FFT
def reverb(x, seed):
    r = np.random.default_rng(seed); n = int(3.2 * SR); t = np.arange(n) / SR
    ir = r.normal(0, 1, n) * np.exp(-t / 0.85); ir[:int(.02 * SR)] = 0
    ir /= np.sqrt((ir ** 2).sum())
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:len(x)]
    return y
WL, WR = reverb(L, 1), reverb(R, 2)
outL, outR = L * .75 + WL * .55, R * .75 + WR * .55
# gentle low-pass (one-pole) to keep it warm
def lp(x, fc=6500):
    a = np.exp(-2 * np.pi * fc / SR); y = np.empty_like(x); acc = 0.0
    for i in range(0, len(x), 1):  # vectorised below
        break
    from itertools import accumulate
    return np.array(list(accumulate(x, lambda p, v: (1 - a) * v + a * p)))
outL, outR = lp(outL), lp(outR)
# fades + normalise to -3 dBFS peak
f_in, f_out = int(1.5 * SR), int(3.5 * SR)
for o in (outL, outR):
    o[:f_in] *= np.linspace(0, 1, f_in) ** 2
    o[-f_out:] *= np.linspace(1, 0, f_out) ** 1.6
peak = max(np.abs(outL).max(), np.abs(outR).max()); g = 0.707 / peak
st = (np.stack([outL, outR], 1) * g * 32767).astype(np.int16)
with wave.open(sys.argv[1], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(st.tobytes())
rms = np.sqrt(((st / 32767.0) ** 2).mean()); print('ok', DUR, 's  rms dBFS', round(20 * np.log10(rms), 1))
