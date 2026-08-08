import sys
from faster_whisper import WhisperModel

video_path = sys.argv[1]
model = WhisperModel("large-v3", device="cpu", compute_type="int8")

segments, info = model.transcribe(
    video_path,
    language="th",  # ระบุภาษาไทยตายตัว กัน auto-detect หลุดภาษากลางคลิป
    vad_filter=True,  # ตัดช่วงเงียบ/noise ทิ้ง ลด hallucination
    condition_on_previous_text=False,  # กันข้อความวนซ้ำ/ลากยาวผิดจากบริบทก่อนหน้า
    beam_size=5,
)
text = " ".join([seg.text for seg in segments]).strip()

sys.stdout.buffer.write(text.encode('utf-8'))
sys.stdout.buffer.flush()