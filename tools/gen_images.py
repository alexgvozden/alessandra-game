"""Generate every game image with Gemini.

Run: python tools/gen_images.py [--force] [name-prefix ...]
Raw outputs go to assets_src/raw/<name>.jpg; tools/process_images.py turns them into game assets.
"""
import os, sys, json
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, os.path.join(ROOT, "plan", "tools"))
import generate_image as gi  # noqa: E402

RAW = os.path.join(ROOT, "assets_src", "raw")
SCREENS = os.path.join(ROOT, "plan", "screens")
STYLE_SCENE = os.path.join(ROOT, "assets_src", "style_scene.jpg")
TYPING = os.path.join(SCREENS, "03_typing.jpg")
MASCOT = os.path.join(SCREENS, "09_mascot_sheet.jpg")

STYLE = ("Soft clay-like 3D render like a modern animated feature film: chunky rounded forms, glossy candy highlights, "
         "soft global illumination, pastel palette (sky blue, sunshine yellow, bubblegum pink, mint green, soft lavender, "
         "warm cream). Cute and friendly for children aged 3-5.")

SCENE = ("A finished storybook scene illustration for a children's typing game, in exactly the art style of the attached "
         "reference image (match its rendering, colors and cuteness; do NOT copy its content or its frame). "
         "MAIN SUBJECT: {subject}. The subject is big, cute and friendly, placed exactly in the CENTER of the image, "
         "fully visible, about 40% of the image height, facing the viewer, clearly readable against a simple area directly "
         "behind it. SETTING filling the rest of the picture: {setting}. Put fun little details in all four corners so "
         "there is something to discover everywhere. The scene fills the whole canvas edge to edge: no border, no frame, "
         "no text, no letters, no UI, no watermark, no inner panels, windows or rounded boxes behind the subject. " + STYLE)

LEVELS = {
    "cat": ("a fluffy orange tabby kitten with big eyes, sitting", "a cozy farmyard with a red barn, hay bales, a wooden fence, sunflowers, a blue sky with puffy clouds"),
    "dog": ("a happy brown-and-white puppy with a red collar, tongue out", "a green farm meadow with a little doghouse, a colorful ball, a picket fence, apple trees and a blue sky"),
    "cow": ("a cute black-and-white spotted cow with a golden bell, standing", "a grassy farm field with a red barn and silo, daisies, rolling green hills and a blue sky"),
    "pig": ("a chubby pink piglet with a curly tail, smiling", "a farm pen with a small mud puddle, straw, a wooden fence, a barn and tall sunflowers"),
    "hen": ("a plump white hen with a red comb, standing beside a straw nest with three eggs", "a farmyard with a little chicken coop, straw, a wooden fence, flowers and a sunny sky"),
    "sun": ("a big smiling cartoon sun with a friendly face, rosy cheeks and soft rays, shining in the sky", "above rolling green farm hills with a small barn, round trees, fluffy clouds and flower fields"),
    "duck": ("a cute yellow duckling floating on the water, wings open happily", "a sparkling blue pond with lily pads and pink water lilies, round lollipop trees, a little wooden dock, cattails, a rainbow and a smiling sun"),
    "fish": ("a bright rainbow-colored cartoon fish with big eyes", "underwater in a clear pond: smooth pebbles, green water plants, bubbles and sunbeams from above"),
    "frog": ("a cute green frog sitting on a big lily pad, smiling", "a pond with pink water lilies, cattails, willow trees, dragonflies and a blue sky"),
    "boat": ("a little red wooden sailboat with a white sail", "a sparkly blue lake with small waves, green hills, round trees, a tiny lighthouse on the shore and a sunny sky"),
    "bee": ("a chubby cute honeybee with tiny shiny wings, flying", "a flower meadow beside a pond, a honey beehive hanging from a tree branch, many colorful flowers"),
    "tree": ("a big round leafy green tree with a thick friendly trunk", "a flower garden with green grass, a little stone path, bushes, tulips and a blue sky with clouds"),
    "apple": ("one big shiny red apple with a green leaf, resting on the grass", "an orchard with apple trees, a wicker basket of apples, flowers and a sunny sky"),
    "bird": ("a little round bluebird singing, perched on a flowering branch", "a spring garden with a wooden birdhouse, cherry blossoms, flowers and a blue sky"),
    "flower": ("one giant smiling pink flower with a yellow center and green leaves", "a colorful flower garden with tulips and daisies, a watering can, a garden fence and a blue sky"),
    "snail": ("a cute snail with a swirly pastel shell and happy face", "a garden floor with big green leaves, red-and-white mushrooms, strawberries and dewdrops"),
    "whale": ("a friendly blue whale spouting a fountain of water, smiling", "the open ocean with gentle waves, a sunny sky, a tiny island with a palm tree and seagulls"),
    "crab": ("a cute red crab waving its claws, smiling", "a sandy beach with seashells, a sandcastle, gentle waves and palm trees"),
    "shell": ("one big shiny pink spiral seashell", "a sunny beach with soft sand, starfish, pebbles, gentle waves and a bright sky"),
    "turtle": ("a cute green sea turtle swimming, smiling", "underwater coral reef with colorful corals, seaweed, bubbles and sunbeams"),
    "octopus": ("a cute purple octopus with curly tentacles, waving", "an underwater reef with a small treasure chest, corals, seaweed and bubbles"),
    "rocket": ("a red and white cartoon rocket blasting off with a puffy orange flame", "outer space with a starry pastel night sky, a smiling moon and small colorful planets"),
    "planet": ("a cute ringed purple planet with a smiling face", "outer space with twinkling stars, small colorful planets, a comet and a soft pastel nebula"),
    "rainbow": ("a big bright rainbow arc with fluffy white clouds at both ends", "a magical twilight sky with twinkling stars over soft green hills with glowing flowers"),
    "butterfly": ("a big beautiful butterfly with pink, lavender and yellow wings, flying", "a twilight flower garden with glowing fireflies, tall flowers and twinkling stars"),
    "dinosaur": ("a friendly little green baby dinosaur, smiling and waving", "a small alien planet with soft craters, crystals, palm trees and a starry pastel sky with a moon"),
}

SPRITE = ("A single cute {what}, {pose}. " + STYLE + " Match the art style of the attached reference image. "
          "Isolated object centered with generous empty margin around it, on a perfectly flat, uniform, pure {bg} background "
          "(solid {hex}, no gradient, no shadow, no floor, no texture, no other objects, no text).")
GREEN = ("chroma green", "#00FF00")
MAGENTA = ("chroma magenta", "#FF00FF")

SURPRISES = {
    "chick": ("fluffy yellow baby chick", "hopping happily", GREEN),
    "mouse": ("little grey mouse with pink ears", "sitting up and waving", GREEN),
    "bunny": ("white fluffy bunny with pink ears", "hopping", GREEN),
    "butterfly_s": ("pastel butterfly with pink and blue wings", "flying, wings open", GREEN),
    "ladybug": ("red ladybug with black spots and a smiling face", "seen from above at a slight angle", GREEN),
    "frog_s": ("green frog with big eyes", "jumping with arms open", MAGENTA),
    "dragonfly": ("turquoise dragonfly with shiny wings", "flying", MAGENTA),
    "goldfish": ("orange goldfish with a flowing tail", "swimming, side view", GREEN),
    "starfish": ("orange-pink starfish with a smiling face", "waving one arm", GREEN),
    "seahorse": ("yellow seahorse with a curly tail", "side view, smiling", MAGENTA),
    "jellyfish": ("lavender jellyfish with wavy tentacles and a smiling face", "floating", GREEN),
    "alien": ("little mint-green alien with one big eye and antennae", "waving hello", MAGENTA),
    "ufo": ("pastel flying saucer UFO with a glass dome and colorful lights", "flying", GREEN),
    "shootingstar": ("golden shooting star with a rainbow sparkle tail", "flying diagonally", GREEN),
}

ITEMS = {
    "wand": ("magic wand with a big glossy golden star on top and a lavender handle with a gold tip", "tilted 30 degrees, star at the top-left", GREEN),
    "hand": ("giant glossy white cartoon glove hand holding a pink sparkly bath sponge", "hand seen from the side, fingers wrapped around the sponge", GREEN),
    "book": ("small closed storybook sticker album with a lavender padded cover and a golden star on the cover", "front view, slightly tilted", GREEN),
    "world_farm": ("red cartoon barn with a white door and a little green grass base", "front three-quarter view, game icon", MAGENTA),
    "world_pond": ("little round pond with a lily pad and a pink water lily", "top three-quarter view, game icon", MAGENTA),
    "world_garden": ("pink flower with a yellow center and two green leaves", "front view, game icon", MAGENTA),
    "world_ocean": ("smiling blue whale with a water spout", "side view, game icon", MAGENTA),
    "world_space": ("red and white rocket with a round window and a small flame", "tilted, flying up, game icon", GREEN),
}

EDIT_NOTE = "Keep everything else exactly the same: same art style, same colors, same lighting, same composition, same image size."


def jobs():
    j = {}
    for name, (subject, setting) in LEVELS.items():
        j["scene_" + name] = dict(prompt=SCENE.format(subject=subject, setting=setting), refs=[STYLE_SCENE], aspect="16:9", size="2K")
    for name, (what, pose, (bg, hx)) in {**SURPRISES, **ITEMS}.items():
        j["sprite_" + name] = dict(prompt=SPRITE.format(what=what, pose=pose, bg=bg, hex=hx), refs=[TYPING], aspect="1:1", size="1K")
    j["bg_title"] = dict(prompt="Edit this image: remove the big title text 'ALESSANDRA'S WORD MAGIC', remove the big yellow PLAY button, remove "
                         "the purple owl, and remove the small round book button in the top-right corner. Fill those areas naturally with the "
                         "rainbow sky, clouds, the open storybook and the grassy hill. " + EDIT_NOTE,
                         refs=[os.path.join(SCREENS, "01_title.jpg")], aspect="16:9", size="2K")
    j["bg_map"] = dict(prompt="Edit this image: remove ALL the round level coin buttons (gold ones and grey locked ones), all the small golden stars "
                       "above them, all padlocks, the purple owl, the round home button in the top-left and the big star with the number in "
                       "the top-right. Keep the five floating islands (farm with barn and cow, pond with duck, beach with whale, "
                       "space island with planet and rocket) and keep the whole colorful candy block path, continuing it smoothly "
                       "where buttons were removed. " + EDIT_NOTE,
                       refs=[os.path.join(SCREENS, "02_map.jpg")], aspect="16:9", size="2K")
    j["bg_book"] = dict(prompt="Edit this image: remove every sticker, every word, every question-mark silhouette, the two round arrow buttons, the "
                        "home button and the owl. Leave the big open storybook with completely EMPTY blank cream pages (keep the subtle swirl "
                        "decorations in the page corners) on the same sky background. " + EDIT_NOTE,
                        refs=[os.path.join(SCREENS, "07_sticker_book.jpg")], aspect="16:9", size="2K")
    j["bg_party"] = dict(prompt="Edit this image: remove EVERYTHING in the foreground - the YAY text, stars, the storybook picture frame, the owl, "
                         "the green and pink buttons, balloons, fireworks and confetti. Keep only the soft dreamy pastel cloud sky background, "
                         "filling the removed areas with more soft pastel clouds and sky. " + EDIT_NOTE,
                         refs=[os.path.join(SCREENS, "06_level_complete.jpg")], aspect="16:9", size="2K")
    pip = ("Using the attached character sheet, render ONLY the owl mascot Pip, exactly this character (same colors, eyes, feathers, "
           "wand, proportions), {pose}. Single character, centered with generous margin, full body visible, on a perfectly flat, "
           "uniform, pure chroma green background (solid #00FF00, no gradient, no shadow, no floor, no sparkles, no text).")
    poses = {
        "idle": "sitting calmly facing the viewer, both wings resting at its sides, holding the star wand in one wing, eyes open, gentle smile",
        "wave": "standing and waving hello with one wing raised, eyes open, smiling",
        "cheer": "cheering with both wings raised high, mouth open happily, eyes open",
        "point": "pointing its star wand down and to the LEFT side of the image, eyes open, smiling",
        "think": "thinking with one wing on its chin, head slightly tilted, eyes open, curious",
        "dance": "dancing happily on one foot with wings out, eyes closed in a big happy smile",
        "sleep": "sitting and sleeping, eyes closed peacefully, head drooping slightly, wings folded",
        "blink": "sitting calmly facing the viewer, both wings resting at its sides, holding the star wand in one wing, eyes CLOSED (blinking), gentle smile",
    }
    for name, pose in poses.items():
        j["pip_" + name] = dict(prompt=pip.format(pose=pose), refs=[MASCOT], aspect="1:1", size="1K")
    # Blink must line up pixel-for-pixel with idle, so it is an edit of the idle image.
    j["pip_blink"] = dict(prompt="Edit this image: close the owl's eyes as if it is blinking (curved closed eyelids with lashes). "
                          "Change NOTHING else: same pose, same position, same size, same framing, same flat green background.",
                          refs=[os.path.join(RAW, "pip_idle.jpg")], aspect="1:1", size="1K")
    j["bg_map5"] = dict(prompt="World map background for this children's game, in exactly the art style of the attached image. "
                        "FIVE separate floating islands in a soft pastel sky with fluffy clouds, arranged left to right in a gentle zigzag, "
                        "each island with a wide, flat, open grassy (or sandy) top: 1) far left, upper: FARM island with a small red barn and a cow at "
                        "its back edge; 2) left-center, lower: POND island with a small pond, lily pads and a duck at its back edge; "
                        "3) center, upper: GARDEN island with flowers, a small tree and butterflies at its back edge; 4) right-center, lower: "
                        "OCEAN beach island with sand, a palm tree and a small whale in the water at its back edge; 5) far right, upper: SPACE island, "
                        "a dark purple starry rock with a small ringed planet and a rocket at its back edge. A chunky colorful candy block path "
                        "winds from island to island. Each island top keeps a big EMPTY flat area in its front/middle (for game buttons to be "
                        "placed later). No buttons, no coins, no stars on islands, no owl, no characters besides the cow, duck and whale, no text, no UI.",
                        refs=[os.path.join(SCREENS, "02_map.jpg")], aspect="16:9", size="2K")
    j["tex_clouds"] = dict(prompt="A full-frame texture of fluffy swirly pastel magic clouds filling the ENTIRE image edge to edge: big soft round "
                           "cotton-candy cloud puffs with gentle spiral swirls, in lavender, bubblegum pink, mint green and baby blue, soft clay-like "
                           "3D render with gentle glossy highlights, exactly like the magic clouds in the attached image. No sky visible, no gaps, no "
                           "objects, no characters, no frame, no text.",
                           refs=[TYPING], aspect="16:9", size="2K")
    return j


def run(item):
    name, spec = item
    out = os.path.join(RAW, name + ".jpg")
    key = gi.load_key(type("A", (), {"api_key": None, "api_key_file": os.path.join(ROOT, ".env")})())
    for attempt in range(3):
        try:
            resp = gi.call_gemini(key, "gemini-3-pro-image", spec["prompt"], spec["refs"], spec["aspect"], spec["size"])
            imgs = gi.extract_images(resp)
            if imgs:
                with open(out, "wb") as f:
                    f.write(imgs[-1])
                return name, "OK"
            err = json.dumps(resp)[:300]
        except SystemExit as e:
            err = str(e)[:300]
        except Exception as e:  # network hiccups
            err = repr(e)[:300]
    return name, "FAIL " + err


if __name__ == "__main__":
    os.makedirs(RAW, exist_ok=True)
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    todo = [(n, s) for n, s in jobs().items()
            if (not args or any(n.startswith(a) for a in args))
            and (force or not os.path.exists(os.path.join(RAW, n + ".jpg")))]
    print(f"{len(todo)} images to generate", flush=True)
    with ThreadPoolExecutor(max_workers=8) as ex:
        for name, status in ex.map(run, todo):
            print(f"[{status}] {name}", flush=True)
