#!/usr/bin/env python3
import argparse, base64, json, os, sys, time, urllib.request, urllib.error

API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"

def load_key(args):
    if args.api_key:
        return args.api_key
    if args.api_key_file:
        with open(args.api_key_file) as f:
            content = f.read()
        for line in content.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                if "GEMINI" in k.upper() or "API_KEY" in k.upper():
                    return v.strip().strip('"').strip("'")
            else:
                return line
        sys.exit(f"No GEMINI_API_KEY= line found in {args.api_key_file}")
    env = os.environ.get("GEMINI_API_KEY")
    if env:
        return env
    sys.exit("No API key found.")

def build_input(prompt, references):
    items = [{"type": "text", "text": prompt}]
    for ref in references or []:
        with open(ref, "rb") as f:
            data = base64.b64encode(f.read()).decode()
        mime = "image/png" if ref.lower().endswith("png") else "image/jpeg"
        items.append({"type": "image", "data": data, "mime_type": mime})
    return items

def call_gemini(api_key, model, prompt, references, aspect_ratio, image_size):
    response_format = {"type": "image", "mime_type": "image/jpeg"}
    if aspect_ratio:
        response_format["aspect_ratio"] = aspect_ratio
    if image_size:
        response_format["image_size"] = image_size
    body = {"model": model, "input": build_input(prompt, references), "response_format": response_format}
    req = urllib.request.Request(API_URL, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            result = json.load(resp)
    except urllib.error.HTTPError as e:
        sys.exit(f"Gemini API error {e.code}: {e.read().decode(errors='replace')}")
    interaction_id = result.get("id")
    for _ in range(60):
        if result.get("status") in ("completed", "failed", None):
            break
        time.sleep(3)
        poll_req = urllib.request.Request(f"{API_URL}/{interaction_id}", headers={"x-goog-api-key": api_key})
        with urllib.request.urlopen(poll_req, timeout=60) as resp:
            result = json.load(resp)
    return result

def extract_images(response):
    images = []
    for step in response.get("steps", []):
        for item in step.get("content", []):
            if item.get("type") == "image" and item.get("data"):
                images.append(base64.b64decode(item["data"]))
    return images

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt")
    ap.add_argument("--prompt-file")
    ap.add_argument("--out", required=True)
    ap.add_argument("--api-key")
    ap.add_argument("--api-key-file")
    ap.add_argument("--model", default="gemini-3-pro-image")
    ap.add_argument("--aspect-ratio", default=None)
    ap.add_argument("--image-size", default=None)
    ap.add_argument("--reference", action="append", default=None)
    args = ap.parse_args()
    prompt = args.prompt or open(args.prompt_file, encoding="utf-8").read()
    api_key = load_key(args)
    resp = call_gemini(api_key, args.model, prompt, args.reference, args.aspect_ratio, args.image_size)
    images = extract_images(resp)
    if not images:
        print(json.dumps(resp, indent=2)[:2000], file=sys.stderr)
        sys.exit("No image returned.")
    for j, img in enumerate(images):
        path = args.out if len(images) == 1 else f"{os.path.splitext(args.out)[0]}_{j}.jpg"
        with open(path, "wb") as f:
            f.write(img)
        print("Saved:", path)

if __name__ == "__main__":
    main()
