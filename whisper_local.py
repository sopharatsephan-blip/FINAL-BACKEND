import sys
from faster_whisper import WhisperModel

video_path = sys.argv[1]
model = WhisperModel("small", device="cpu", compute_type="int8")

segments, info = model.transcribe(video_path)  # ไม่ระบุ language ให้ auto-detect
text = " ".join([seg.text for seg in segments]).strip()

sys.stdout.buffer.write(text.encode('utf-8'))
sys.stdout.buffer.flush()