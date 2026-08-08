import os
import sys

# faster-whisper (ctranslate2) โหลด cuBLAS/cuDNN แบบ dynamic ต้องชี้ path ของ
# ไลบรารีที่ติดตั้งผ่าน pip (nvidia-cublas-cu12, nvidia-cudnn-cu12) เอง
# เพราะ Windows ไม่เพิ่ม site-packages เข้า DLL search path ให้อัตโนมัติ
if sys.platform == "win32":
    try:
        import nvidia.cublas
        import nvidia.cudnn

        cublas_bin = os.path.join(nvidia.cublas.__path__[0], "bin")
        cudnn_bin = os.path.join(nvidia.cudnn.__path__[0], "bin")
        os.add_dll_directory(cublas_bin)
        os.add_dll_directory(cudnn_bin)
        os.environ["PATH"] = cublas_bin + os.pathsep + cudnn_bin + os.pathsep + os.environ["PATH"]
    except ImportError:
        pass

from faster_whisper import WhisperModel, BatchedInferencePipeline

video_path = sys.argv[1]

TRANSCRIBE_ARGS = dict(
    language="th",  # ระบุภาษาไทยตายตัว กัน auto-detect หลุดภาษากลางคลิป
    vad_filter=True,  # ตัดช่วงเงียบ/noise ทิ้ง ลด hallucination
    condition_on_previous_text=False,  # กันข้อความวนซ้ำ/ลากยาวผิดจากบริบทก่อนหน้า
    beam_size=5,
)

try:
    # ใช้ GPU (int8_float16) + batched inference: เร็วกว่า CPU int8 เดิมมาก
    # (วัดจริงบนเครื่องนี้: คลิป ~4 นาที ถอดเสร็จใน ~25 วิ เทียบเท่า ~10x realtime)
    model = WhisperModel("large-v3", device="cuda", compute_type="int8_float16")
    pipeline = BatchedInferencePipeline(model=model)
    segments, info = pipeline.transcribe(video_path, batch_size=16, **TRANSCRIBE_ARGS)
    segments = list(segments)
except Exception as e:
    print(f"[whisper] GPU ใช้ไม่ได้ ({e}) กำลังถอดเสียงด้วย CPU แทน", file=sys.stderr)
    model = WhisperModel("large-v3", device="cpu", compute_type="int8")
    segments, info = model.transcribe(video_path, **TRANSCRIBE_ARGS)
    segments = list(segments)

text = " ".join([seg.text for seg in segments]).strip()

sys.stdout.buffer.write(text.encode('utf-8'))
sys.stdout.buffer.flush()
