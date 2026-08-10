import os
import sys
import time

from faster_whisper import WhisperModel

video_path = sys.argv[1]

# เครื่องนี้ไม่มีการ์ดจอ ใช้ GPU ไม่ได้ -> ถอดเสียงด้วย CPU เท่านั้น
# ใช้โมเดล small (เร็วกว่า medium มาก) เพื่อความเร็วบน CPU เป็นหลัก
# ความแม่นยำที่เสียไปให้ Typhoon ช่วยแก้คำผิดในขั้นตอนถัดไป (ดู typhoon.js: correctTranscript)
# cpu_threads ระบุเต็มจำนวนคอร์เพื่อให้ ctranslate2 ใช้ทุก core ช่วยกันถอด
MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "small")

TRANSCRIBE_ARGS = dict(
    language="th",  # ระบุภาษาไทยตายตัว กัน auto-detect หลุดภาษากลางคลิป
    vad_filter=True,  # ตัดช่วงเงียบ/noise ทิ้ง ลด hallucination
    condition_on_previous_text=False,  # กันข้อความวนซ้ำ/ลากยาวผิดจากบริบทก่อนหน้า
    beam_size=1,  # greedy decoding แทน beam search เพื่อความเร็ว (แลกความแม่นยำเล็กน้อย)
)

start = time.time()
model = WhisperModel(
    MODEL_SIZE,
    device="cpu",
    compute_type="int8",
    cpu_threads=os.cpu_count() or 4,
)
raw_segments, info = model.transcribe(video_path, **TRANSCRIBE_ARGS)
segments = list(raw_segments)
elapsed = time.time() - start
print(f"[whisper] ถอดเสียงสำเร็จด้วย CPU model={MODEL_SIZE} ใช้เวลา {elapsed:.1f}s", file=sys.stderr)

text = " ".join([seg.text for seg in segments]).strip()

sys.stdout.buffer.write(text.encode('utf-8'))
sys.stdout.buffer.flush()
