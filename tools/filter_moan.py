import sys
import os
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

TARGET_LABELS = {
    "Wail, moan", "Groan", "Grunt", "Pant", "Sigh", "Breathing", "Wheeze", "Gasp"
}
THRESHOLD = float(os.environ.get("MOAN_FILTER_THRESHOLD", "0.48"))
PAD_SECONDS = float(os.environ.get("MOAN_FILTER_PADDING", "0.12"))


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: filter_moan.py input.wav output.wav")
    try:
        import tensorflow_hub as hub
    except Exception as exc:
        raise SystemExit(
            "AI filter dependencies are missing. Install requirements-ai-filter.txt. "
            f"Details: {exc}"
        )

    audio, sample_rate = sf.read(sys.argv[1], dtype="float32", always_2d=False)
    if audio.ndim > 1:
        audio = np.mean(audio, axis=1)
    if sample_rate != 16000:
        from math import gcd
        divisor = gcd(int(sample_rate), 16000)
        audio = resample_poly(audio, 16000 // divisor, int(sample_rate) // divisor).astype(np.float32)
        sample_rate = 16000

    model = hub.load("https://tfhub.dev/google/yamnet/1")
    scores, _, _ = model(audio.astype(np.float32))
    scores = scores.numpy()
    class_map_path = model.class_map_path().numpy().decode("utf-8")
    import csv
    with open(class_map_path, newline="", encoding="utf-8") as handle:
        labels = [row[2] for row in list(csv.reader(handle))[1:]]
    target_indices = [i for i, label in enumerate(labels) if label in TARGET_LABELS]
    if not target_indices:
        sf.write(sys.argv[2], audio, sample_rate)
        return

    hop = 0.48
    frame_len = 0.96
    mask = np.zeros(len(audio), dtype=bool)
    for frame_index, frame_scores in enumerate(scores):
        target_score = float(np.max(frame_scores[target_indices]))
        if target_score >= THRESHOLD:
            start = max(0, int((frame_index * hop - PAD_SECONDS) * sample_rate))
            end = min(len(audio), int((frame_index * hop + frame_len + PAD_SECONDS) * sample_rate))
            mask[start:end] = True

    filtered = audio.copy()
    if np.any(mask):
        filtered[mask] = 0.0
        edge = max(1, int(0.015 * sample_rate))
        indexes = np.flatnonzero(np.diff(np.r_[False, mask, False].astype(np.int8)))
        for start, end in zip(indexes[::2], indexes[1::2]):
            left = max(0, start - edge)
            right = min(len(filtered), end + edge)
            if start > left:
                filtered[left:start] *= np.linspace(1.0, 0.0, start - left, endpoint=False)
            if right > end:
                filtered[end:right] *= np.linspace(0.0, 1.0, right - end, endpoint=False)

    sf.write(sys.argv[2], filtered, sample_rate, subtype="PCM_16")


if __name__ == "__main__":
    main()
