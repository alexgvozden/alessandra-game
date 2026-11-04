"""Generate every spoken line with Gemini TTS into public/audio/voice/<id>.wav.

Run: python tools/gen_voice.py [--force] [id-prefix ...]
The line list lives in tools/voice_lines.json (written by this script from the level data below).
"""
import base64, json, os, sys, time, urllib.request, urllib.error, wave, struct
from concurrent.futures import ThreadPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
OUT = os.path.join(ROOT, "public", "audio", "voice")
MODEL = "gemini-2.5-pro-preview-tts"
VOICE = "Leda"
RATE = 24000

STYLE = "Say cheerfully and warmly, like a kind teacher talking to a small child: "

LETTER_NAMES = {c: c for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"}

WORDS = {
    "cat": "Meow! Meow!", "dog": "Woof woof!", "cow": "Moooooo!", "pig": "Oink oink!", "hen": "Cluck cluck cluck!",
    "sun": "Good morning, sunshine!", "duck": "Quack quack!", "fish": "Blub blub blub!", "frog": "Ribbit! Ribbit!",
    "boat": "Toot toot!", "bee": "Bzzzzzz!", "tree": "Whoosh, whoosh, go the leaves!", "apple": "Crunch! Yummy!",
    "bird": "Tweet tweet!", "flower": "Mmmm, it smells so nice!", "snail": "Slowly, slowly!", "whale": "Splash! Whoosh!",
    "crab": "Snip snap!", "shell": "Listen... I can hear the sea!", "turtle": "Swim, swim, swim!",
    "octopus": "Wiggly, wiggly!", "rocket": "Three, two, one... blast off!", "planet": "Hello from space!",
    "rainbow": "So many colors!", "butterfly": "Flutter, flutter!", "dinosaur": "Roaaar!",
}

SURPRISES = {
    "chick": "Cheep cheep! A baby chick!", "mouse": "Squeak squeak!", "bunny": "Hop, hop, hop!", "butterfly_s": "A butterfly!",
    "ladybug": "A ladybug!", "frog_s": "Ribbit!", "dragonfly": "Zoom, zoom!", "goldfish": "A little fish!",
    "starfish": "A starfish!", "seahorse": "A seahorse!", "jellyfish": "Wiggle wiggle!", "alien": "Beep boop! Hello!",
    "ufo": "Whoa! A spaceship!", "shootingstar": "Make a wish!",
}

PHRASES = {
    "hello": "Hello! I'm Pip! Let's play!",
    "pick": "Pick a picture!",
    "rub": "Now rub the clouds away!",
    "yay": "Yaaay! You did it!",
    "great": "Great job!",
    "wow": "Wow!",
    "super": "Super!",
    "amazing": "Amazing!",
    "stickers": "Look at all your stickers!",
    "newworld": "Hooray! A new world!",
    "help": "Look! This one!",
    "almost": "Almost there!",
}


def lines():
    out = {}
    for c in LETTER_NAMES:
        out["letter_" + c.lower()] = c + "!"
    for w, sound in WORDS.items():
        out["word_" + w] = w.capitalize() + "!"
        out["ask_" + w] = f"Can you type... {w}?"
        out["sound_" + w] = sound
    for k, v in SURPRISES.items():
        out["surprise_" + k] = v
    for k, v in PHRASES.items():
        out["say_" + k] = v
    return out


def key():
    for line in open(os.path.join(ROOT, ".env")):
        if "=" in line and "GEMINI" in line.upper():
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("no key")


def tts(text):
    body = {
        "contents": [{"parts": [{"text": STYLE + text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": VOICE}}},
        },
    }
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
        data=json.dumps(body).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": key()}, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        res = json.load(r)
    part = res["candidates"][0]["content"]["parts"][0]["inlineData"]
    return base64.b64decode(part["data"])


def clean(pcm):
    """Trim silence, add short fades and normalise the peak."""
    a = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0
    if a.size == 0:
        return a
    env = np.convolve(np.abs(a), np.ones(240) / 240, mode="same")
    idx = np.where(env > 0.01)[0]
    if idx.size:
        a = a[max(0, idx[0] - 1200): min(a.size, idx[-1] + 2400)]
    fade = min(240, a.size // 4)
    a[:fade] *= np.linspace(0, 1, fade)
    a[-fade:] *= np.linspace(1, 0, fade)
    peak = np.max(np.abs(a)) or 1
    return a * (0.89 / peak)


def save(path, a):
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes((np.clip(a, -1, 1) * 32767).astype("<i2").tobytes())


def run(item):
    name, text = item
    for attempt in range(4):
        try:
            save(os.path.join(OUT, name + ".wav"), clean(tts(text)))
            return name, "OK"
        except urllib.error.HTTPError as e:
            err = f"{e.code} {e.read().decode(errors='replace')[:200]}"
            time.sleep(5 * (attempt + 1))
        except Exception as e:
            err = repr(e)[:200]
            time.sleep(3)
    return name, "FAIL " + err


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    all_lines = lines()
    with open(os.path.join(HERE, "voice_lines.json"), "w") as f:
        json.dump(all_lines, f, indent=1)
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    todo = [(k, v) for k, v in all_lines.items()
            if (not args or any(k.startswith(a) for a in args))
            and (force or not os.path.exists(os.path.join(OUT, k + ".wav")))]
    print(len(todo), "lines to generate", flush=True)
    with ThreadPoolExecutor(max_workers=6) as ex:
        for name, status in ex.map(run, todo):
            print(f"[{status}] {name}", flush=True)
