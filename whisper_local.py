import os
import site
import sys
import time

# NVIDIA's pip packages keep CUDA DLLs in separate folders that Windows does
# not search automatically when CTranslate2 loads its GPU backend.
if os.name == "nt":
    dll_directories = []
    for site_directory in site.getsitepackages():
        dll_directories.extend(
            os.path.join(site_directory, relative_directory)
            for relative_directory in (
                "nvidia\\cublas\\bin",
                "nvidia\\cudnn\\bin",
                "nvidia\\cuda_nvrtc\\bin",
                "nvidia\\cuda_runtime\\bin",
            )
        )

    for dll_directory in dll_directories:
        if os.path.isdir(dll_directory):
            os.add_dll_directory(dll_directory)
            os.environ["PATH"] = dll_directory + os.pathsep + os.environ.get("PATH", "")

import ctranslate2
from faster_whisper import WhisperModel

video_path = sys.argv[1]


MODEL_SIZE = os.environ.get("WHISPER_MODEL_SIZE", "large-v3-turbo")
try:
    CUDA_DEVICE_COUNT = ctranslate2.get_cuda_device_count()
except (AttributeError, RuntimeError):
    CUDA_DEVICE_COUNT = 0

DEVICE = os.environ.get("WHISPER_DEVICE", "cuda" if CUDA_DEVICE_COUNT else "cpu")
BEAM_SIZE = int(os.environ.get("WHISPER_BEAM_SIZE", "3"))
COMPUTE_TYPE = os.environ.get(
    "WHISPER_COMPUTE_TYPE",
    "float16" if DEVICE == "cuda" else "int8",
)

TRANSCRIBE_ARGS = dict(
    language="th",
    vad_filter=True,
    condition_on_previous_text=True,
    beam_size=BEAM_SIZE,
    initial_prompt=(
        "บทสัมภาษณ์นักศึกษาฝึกงาน ชื่อหน่วยงาน อุทยานวิทยาศาสตร์ ภูมิภาค ภาคใต้ "
        "ตำแหน่งงาน โปรเจกต์ UX UI DESIGN "
        "การออกแบบเว็บไซต์ การออกแบบแอปพลิเคชัน ซอฟต์แวร์ เทคโนโลยี "
        "ชื่อบุคคล ชื่อสถานที่ ชื่อบริษัท สถาบันการศึกษา ภาครัฐ ภาคเอกชน"
    ),
)

start = time.time()
model_options = {
    "device": DEVICE,
    "compute_type": COMPUTE_TYPE,
}
if DEVICE == "cpu":
    model_options["cpu_threads"] = os.cpu_count() or 4

model = WhisperModel(MODEL_SIZE, **model_options)
raw_segments, info = model.transcribe(video_path, **TRANSCRIBE_ARGS)
segments = list(raw_segments)
elapsed = time.time() - start
print(
    f"[whisper] ถอดเสียงสำเร็จด้วย device={DEVICE} compute={COMPUTE_TYPE} "
    f"model={MODEL_SIZE} ใช้เวลา {elapsed:.1f}s",
    file=sys.stderr,
)

text = " ".join([seg.text for seg in segments]).strip()

sys.stdout.buffer.write(text.encode('utf-8'))
sys.stdout.buffer.flush()
