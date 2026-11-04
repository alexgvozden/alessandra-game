"""Transcribe generated voice clips with Gemini to verify they say the intended line.

Run: python tools/check_voice.py [id-prefix ...]   -> prints id, expected, heard, duration
"""
import base64, json, os, sys, urllib.request, wave
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
VOICE = os.path.join(ROOT, "public", "audio", "voice")
sys.path.insert(0, HERE)
from gen_voice import key  # noqa: E402


def transcribe(path):
    data = base64.b64encode(open(path, "rb").read()).decode()
    body = {"contents": [{"parts": [
        {"inline_data": {"mime_type": "audio/wav", "data": data}},
        {"text": "Transcribe exactly what is spoken in this audio, including single letters. Reply with only the transcript."}]}]}
    req = urllib.request.Request(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
        data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": key()}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        res = json.load(r)
    return res["candidates"][0]["content"]["parts"][0]["text"].strip()


def run(name):
    path = os.path.join(VOICE, name + ".wav")
    with wave.open(path) as w:
        dur = w.getnframes() / w.getframerate()
    try:
        heard = transcribe(path)
    except Exception as e:
        heard = "ERR " + repr(e)[:100]
    return name, dur, heard


if __name__ == "__main__":
    expected = json.load(open(os.path.join(HERE, "voice_lines.json")))
    names = sorted(f[:-4] for f in os.listdir(VOICE) if f.endswith(".wav"))
    if sys.argv[1:]:
        names = [n for n in names if any(n.startswith(a) for a in sys.argv[1:])]
    with ThreadPoolExecutor(max_workers=8) as ex:
        for name, dur, heard in ex.map(run, names):
            print(f"{name:22s} {dur:5.2f}s  expected={expected.get(name)!r:40s} heard={heard!r}", flush=True)
