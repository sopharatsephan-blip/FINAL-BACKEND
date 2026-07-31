import sys
import io
from faster_whisper import WhisperModel

# บังคับให้ stdout เป็น UTF-8 เพื่อรองรับภาษาไทย
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

video_path = sys.argv[1]
model = WhisperModel("small", device="cpu", compute_type="int8")

segments, info = model.transcribe(video_path, language="th")
text = " ".join([seg.text for seg in segments])
print(text)