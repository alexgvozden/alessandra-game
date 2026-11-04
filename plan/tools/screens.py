"""Prompts for every game screen design. Run: python plan/tools/screens.py [name ...]"""
import subprocess, sys, os
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "plan", "screens")
PROMPTS = os.path.join(ROOT, "plan", "prompts")

STYLE = (
    "VISUAL STYLE (apply exactly): A polished screenshot of a premium 3D children's video game for ages 3-5, "
    "rendered like a modern animated feature film - soft clay-like 3D shapes, chunky rounded forms, glossy candy "
    "highlights, soft global illumination, gentle depth of field, dreamy volumetric light and floating sparkles. "
    "Palette: sky blue #7EC8F2, sunshine yellow #FFD34E, bubblegum pink #FF8FB1, mint green #7FDBB6, soft lavender "
    "#B79CFF, warm cream #FFF6E5. All UI elements are big, puffy and rounded (like soft plastic toys or jelly candy), "
    "no sharp corners. Typography: very large, extra-bold, rounded, bubbly uppercase letters, easy for a small child "
    "to read. Almost no text besides the game words. Landscape 16:9 full-screen game UI, no browser chrome, no device "
    "frame, no watermark. Do not print hex codes or style notes in the image."
)

MASCOT = ("the mascot Pip - a small round fluffy baby owl with lavender feathers, pale pink belly, enormous sparkly "
          "teal eyes, tiny yellow beak, rosy cheeks and a tiny golden star-tipped magic wand")

SCREENS = {
    "01_title": f"""SCREEN: Title / start screen of the game "ALESSANDRA'S WORD MAGIC".
The big bubbly 3D title "ALESSANDRA'S WORD MAGIC" floats in the upper center, each letter a different pastel candy color with sparkles.
Behind it a magical storybook world: a giant open glowing picture book on a grassy hill, and little 3D scenes pop out of its pages
(a yellow duckling on a pond, a red apple tree, a smiling sun, a rainbow, a kitten). Soft clouds, rainbow sky.
{MASCOT} waves hello from beside the book. Bottom center: one huge round glossy yellow PLAY button with a white triangle icon, glowing.
Top right: a small round sticker-book button.""",

    "02_map": f"""SCREEN: World map / level select.
A winding candy-colored path loops across floating islands seen from a gentle 3/4 top-down angle. Each island is a themed world:
Farm (red barn, cow), Pond (lake, duck, lily pads), Garden (flowers, butterflies), Ocean (beach, whale), Space (planet, rocket).
Along the path sit big round glossy level buttons like giant jelly coins, each showing a tiny picture icon (cat, dog, duck, sun, fish):
the first few are completed with 3 small golden stars above them, the current level glows and bounces with {MASCOT} standing on it,
and future levels are soft grey with a tiny padlock. Top left: round home button. Top right: a big golden star with the number 12.""",

    "03_typing": f"""SCREEN: Main gameplay - TYPING phase, word "DUCK", the child has typed 2 of 4 letters.
Top 60%: a big rounded magic picture window framed like a thick glossy storybook frame. Inside, a pond scene is almost fully hidden under
soft fluffy swirly pastel lavender and pink magic clouds. In the very center the cloud parts in a glowing circle and a cute yellow 3D duckling
is half-appearing with golden sparkles (only head and upper body visible so far).
Bottom 40%: the word "DUCK" shown as four big puffy letter tiles. Beneath them four slots: the first two are filled with glowing candy letters
"D" and "U" with star bursts and confetti popping; the third slot is empty with a thick bouncing dotted underline and the letter tile "C"
above it pulses as the next letter to press; fourth slot empty. At the very bottom a friendly chunky on-screen keyboard strip where the key
"C" glows bright yellow as a hint. {MASCOT} sits on the corner of the frame cheering.""",

    "04_word_complete": f"""SCREEN: Moment of success - the word "DUCK" is completed.
The four letters "D U C K" jump up in a happy wave, each a different candy color, shining with rainbow glow, confetti and star explosion.
In the magic picture window above, the cute 3D yellow duckling is now fully revealed in the center, quacking happily with a little musical
note, sitting on a small patch of blue water. The rest of the scene (lake, trees, sky) is still covered by fluffy pastel magic clouds.
A giant glossy cartoon hand-pointer cursor holding a sparkly sponge sits next to the clouds with curved motion arrows showing a rubbing
motion, inviting the child to use the mouse to wipe away the clouds. {MASCOT} gives an excited cheer.""",

    "05_uncover": f"""SCREEN: Main gameplay - UNCOVER phase, the child moves the mouse to reveal the picture.
The magic picture fills most of the screen. About half of the fluffy pastel magic cloud cover has been wiped away along soft brush-like trails,
revealing a gorgeous storybook scene around the yellow duckling: a sparkling blue lake with lily pads and pink water lilies, round lollipop trees,
a little wooden dock, reeds, butterflies, a rainbow and a smiling sun. At the mouse position a glowing magic wand cursor with a star tip sprays
glitter, bubbles and little hearts as clouds dissolve. A hidden surprise pops as it is uncovered: a green frog jumping off a lily pad with a
small burst. Along the top edge a chunky rainbow progress bar filled to about 55 percent with a star at the end. The word "DUCK" sits small
and proud at the bottom on a golden ribbon banner.""",

    "06_level_complete": f"""SCREEN: Level complete celebration.
The fully revealed pond picture (yellow duckling, blue lake, lily pads, lollipop trees, rainbow, sun) is shown inside a glowing golden storybook
frame, slightly tilted like a sticker being awarded. Above it three giant 3D golden stars pop in with shine. Massive colorful confetti, balloons
and star fireworks. A big bubbly "YAY!" in rainbow letters. {MASCOT} dances next to the duckling who flaps its wings.
Bottom: one huge glossy green round next button with a white arrow, and a smaller round pink replay button beside it.""",

    "07_sticker_book": f"""SCREEN: Sticker book / collection of finished pictures.
A huge open 3D storybook with a soft padded cover on a cozy pastel background. On its pages a grid of rounded sticker slots: earned pictures shown
as shiny die-cut stickers with white borders and holographic shine (a kitten on a pillow, a puppy with a ball, a duckling on a pond, a sun over
hills, a fish in the sea, a red apple tree), and the remaining slots are soft silhouettes with a question mark. Under each earned sticker the word
in big friendly letters: CAT, DOG, DUCK, SUN, FISH, APPLE. Round glossy page-turn arrows left and right, home button top left.
{MASCOT} peeks happily over the top of the book.""",

    "08_hard_level": f"""SCREEN: A harder level later in the game - TYPING phase for the long word "BUTTERFLY" (9 letters), in the Garden world.
Top 60%: the magic picture window shows a flower garden mostly hidden under pastel magic clouds; in the center a big beautiful 3D butterfly with
pink, lavender and yellow wings is half-materialized with sparkles.
Bottom 40%: the word "BUTTERFLY" as a row of exactly NINE smaller puffy letter tiles: B, U, T, T, E, R, F, L, Y. Directly below, a row of exactly NINE answer slots aligned one under each tile: slot 1 "B", slot 2 "U", slot 3 "T", slot 4 "T", slot 5 "E" are filled with glowing candy letters (note: TWO letter T slots, one after the other); slot 6 is empty with a bouncing dotted underline and the "R" tile above it pulses as the next letter; slots 7, 8 and 9 are empty. Chunky on-screen keyboard strip at the bottom with the "R" key glowing. Level badge top-left shows a flower icon. Warm late-afternoon golden light. {MASCOT} flies nearby.""",

    "09_mascot_sheet": """IMAGE: Character model sheet for the game mascot, clean warm cream background, like a professional animation studio turnaround sheet.
The mascot PIP: a small round fluffy baby owl, lavender feathers with a pale pink belly, enormous sparkly teal eyes, tiny yellow beak, rosy cheeks,
two small feather tufts on the head, holding a tiny golden star-tipped magic wand. Show Pip in 6 poses in a neat 3x2 grid: waving hello,
cheering with wings up, pointing with the wand, thinking with a wing on chin, dancing with confetti, sleepy yawning.
Consistent 3D animated-film render. No text except the title "PIP" at the top.""",

    "10_design_system": """IMAGE: UI kit / design system sheet for this children's game, neatly laid out on a warm cream background like a premium UI kit presentation.
Show in tidy sections: (1) six color swatches as round glossy jelly blobs: sky blue, sunshine yellow, bubblegum pink, mint green, soft lavender, cream;
(2) giant puffy round buttons: yellow PLAY with triangle, green NEXT arrow, pink replay, blue home - each in normal and pressed state;
(3) letter tiles: letters A B C D as puffy glossy candy tiles in different colors, plus an empty slot with dotted underline, a glowing active slot,
and a filled slot with sparkle burst; (4) three golden 3D stars and one grey unearned star; (5) a chunky rainbow progress bar;
(6) a swatch of fluffy pastel magic cloud cover and a magic wand cursor; (7) level buttons: completed with stars, current glowing, locked with padlock.
Short section labels in a large rounded font.""",
}


# The approved gameplay screen anchors the style, mascot and UI look of every other screen.
REFERENCE = "03_typing"
REF_NOTE = ("The attached image is an approved screen from this same game: match its exact art style, rendering, "
            "colors, frame and button look, letter tiles, and draw Pip the owl exactly as shown there. "
            "Do NOT copy its layout - compose the new screen described below.\n\n")


def run(name):
    prompt = (REF_NOTE if name != REFERENCE else "") + SCREENS[name] + "\n\n" + STYLE
    os.makedirs(PROMPTS, exist_ok=True)
    with open(os.path.join(PROMPTS, name + ".txt"), "w", encoding="utf-8") as f:
        f.write(prompt)
    cmd = [sys.executable, os.path.join(HERE, "generate_image.py"),
           "--prompt-file", os.path.join(PROMPTS, name + ".txt"),
           "--out", os.path.join(OUT, name + ".jpg"),
           "--api-key-file", os.path.join(ROOT, ".env"),
           "--model", "gemini-3-pro-image", "--aspect-ratio", "16:9", "--image-size", "2K"]
    ref = os.path.join(OUT, REFERENCE + ".jpg")
    if name != REFERENCE and os.path.exists(ref):
        cmd += ["--reference", ref]
    r = subprocess.run(cmd, capture_output=True, text=True)
    return name, r.returncode, (r.stdout + r.stderr).strip()[-1500:]


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    names = sys.argv[1:] or list(SCREENS)
    with ThreadPoolExecutor(max_workers=5) as ex:
        for name, code, out in ex.map(run, names):
            print(f"[{'OK' if code == 0 else 'FAIL'}] {name}: {out}")
