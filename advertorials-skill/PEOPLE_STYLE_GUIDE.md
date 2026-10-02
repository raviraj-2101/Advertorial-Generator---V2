# PEOPLE_STYLE_GUIDE — realistic editorial photography for advertorial images

> Authored after Session 7 operator feedback: existing Ledisa/Cleantra image bank had people that read as 3D-rendered / Pixar-style / uncanny-valley AI. Editorial advertorials in this category require people that read as **real photography of real humans** — never animated, never 3D-rendered, never uncanny.

This guide is mandatory binding context for every image generation call that includes a person. Pass the whole file as system context to the image generator alongside the per-product image spec.

---

## The non-negotiables

Every person-image MUST satisfy ALL of the following:

1. **Photographic, not rendered.** The image must read as if shot on a real camera. No 3D-renders. No CGI textures. No video-game lighting. No anime / Pixar / Disney aesthetics. No "AI-art shimmer."
2. **Realistic skin.** Visible pores, faint asymmetric blemishes, fine wrinkles at the eyes and mouth where age-appropriate, slight redness around the nose or cheeks, real-light highlights. Smooth-plastic skin is an instant reject.
3. **Believable proportions.** Heads, hands, eyes, fingers must be anatomically correct. Fingers should be five per hand (a famously bad AI failure mode). Eye whites should not glow. Pupils should be the same size.
4. **Lived-in environment.** Real homes, real kitchens, real waiting rooms, real bathrooms, real exam rooms, real workshops. NOT idealized studio whites. Visible clutter is good: a coffee mug, a kid's drawing on the fridge, a folded towel, a bottle of pills on the counter, a magazine, a TV remote.
5. **Natural lighting.** Window light, overhead kitchen light, lamp glow, morning sun through curtains. NOT ring-light glare, NOT studio softbox, NOT magic-hour-everywhere.
6. **Candid composition, not headshot composition.** The person is doing something — washing dishes, reading the bottle, holding a phone, looking at a photo, sitting on the couch, walking down a hallway. NOT posed against a backdrop with crossed arms.
7. **Editorial color grading.** Slightly desaturated, very faint film grain, slightly warm shadows. Like an Apple commercial or a Modern Health Daily editorial photo. NOT Instagram-perfect, NOT HDR-pushed.

---

## Demographic patterns that work in this category

Match the angle of the advertorial to the demographic. From the RejuvaCare reference family:

- **The doctor / clinician.** Late 50s to 60s. White coat or scrubs OR business-casual without coat. Light grey at the temples. Slight stubble for men; minimal makeup for women. Setting: clinic exam room with visible diplomas, a sink, an exam table corner. Holding a clipboard, a phone, or the product.
- **The patient who was failed by the system.** 50s to early 70s. Lived-in face — visible smile lines, faint sun damage, a slight stoop. Casual home clothes — fleece pullover, plaid button-down, a worn t-shirt. Setting: their own kitchen, living room, or porch. Slightly tired expression that breaks into a smile when discussing the breakthrough.
- **The nurse / former medical staff.** 40s to 60s. Scrubs or a polo with a hospital logo. Hair pulled back. Practical watch. Setting: nurses' station or break room, or at home after a shift.
- **The construction worker / hands-on man.** 40s to 60s. Stocky build. Calloused hands visible. Hi-vis jacket, flannel, or carpenter's apron. Setting: a workshop, a job site, a garage. Holding the product like a tool.
- **The wife / supportive partner.** 40s to 60s. Casual lounge wear or cardigan. Settings: kitchen counter, breakfast nook, looking at a photo with the husband. Reading the product label.
- **The active retiree.** 60s to 70s. Walking poles, garden gloves, golf polo, or hiking pullover. Setting: outdoor — a path, a garden, a beach walk. Demonstrating restored mobility.

Avoid: late-teens / 20s / influencer aesthetics. Avoid Instagram-bait. Avoid models that look like models — they read as advertisements, not editorials.

---

## Prompt language to include on EVERY person-image generation

Insert this verbatim into the prompt sent to the image generator (Nano Banana Pro or equivalent):

```
Style: candid editorial photography, real photograph (not 3D-rendered,
not animated, not Pixar/Disney/anime style, not AI-shimmer). Realistic
human anatomy, correct finger count, asymmetric natural facial features,
visible skin texture (pores, fine lines, faint blemishes), real-light
highlights. Lived-in environment with subtle clutter that grounds the
scene. Natural light from a real source (window, lamp, overhead) — never
ring-light glare. Slight film grain. Color grade slightly desaturated
with warm shadows, in the visual language of a 2024 health-magazine
editorial photo. Subject is mid-action (looking at a photo, reading the
product label, walking down a hallway, washing dishes) — NOT posed
against a studio backdrop with crossed arms.
```

Plus the demographic descriptor matching the angle of the advertorial.

---

## Negative prompt language (what to forbid)

```
3D render, CGI, animated, Pixar style, Disney style, anime, manga,
cartoon, video game graphics, plastic skin, glowing eyes, magazine
cover, glamour shot, Instagram filter, HDR pop, studio backdrop,
ring light glare, professional model headshot, fashion editorial,
six fingers, four fingers, malformed hand, distorted face, mannequin,
wax figure.
```

---

## Per-archetype prompt snippets

### Hero shot — single person, holding the product
```
A 58-year-old man with grey at the temples, wearing a navy button-down
shirt with sleeves rolled to the forearms, sitting at his kitchen
counter in late morning light through the window over the sink. He's
looking down at [PRODUCT_REFERENCE] in his right hand, slight smile of
recognition. The kitchen behind him is a real lived-in family kitchen
— a coffee maker, a basket of fruit, a school photo on the fridge.
[STYLE BLOCK FROM ABOVE]
```

### Doctor — clinical authority shot
```
A 56-year-old woman doctor with shoulder-length silver-blonde hair
pulled back loosely, wearing a white clinic coat over a navy
turtleneck. She's standing in a real exam room — there's a paper-lined
exam table behind her, a wall-mounted blood pressure cuff visible at
the edge of the frame, framed diplomas slightly out of focus. She's
mid-explanation, hands gestured slightly toward the camera, looking
directly at the viewer with a serious but warm expression. Natural
light from a north-facing window plus overhead fluorescent.
[STYLE BLOCK FROM ABOVE]
```

### Patient testimonial — at home, post-recovery
```
A 64-year-old former patient sitting on a worn beige sofa in her own
living room, wearing a soft pink fleece pullover and faded jeans. A
woven blanket is half-folded on the cushion next to her. She's looking
at an old photograph in her hand — a memory she couldn't engage with
before. Warm late-afternoon light from a side window. A potted plant
in the corner, a TV remote on the coffee table, a half-finished cup
of tea. She has a soft, quiet smile — the kind that comes from a small
private victory, not a posed photo.
[STYLE BLOCK FROM ABOVE]
```

### Before/After — split frame
```
Split-frame editorial diptych. Left frame: a 52-year-old construction
worker leaning against his pickup truck in the driveway, late afternoon
sun behind him, wincing slightly as he shifts his weight. Hi-vis vest
hanging from a sideview mirror. Tired posture. Right frame: same man,
same driveway, same light, but standing upright, both hands on his
hips, smiling at the camera. The hi-vis vest is now on his shoulders,
ready to head out. Time-of-day continuity is the visual unifier.
[STYLE BLOCK FROM ABOVE]
```

### Lifestyle — active retiree
```
A 67-year-old man walking a coastal path in a navy quarter-zip pullover
and beige hiking pants, walking poles in both hands. Real morning light
on the ocean to his right. He's mid-stride, looking out at the water,
with a calm satisfied expression. Real coastal vegetation — sea grass,
salt-bleached driftwood. Slightly grainy, warm color grade.
[STYLE BLOCK FROM ABOVE]
```

---

## Reference-image anchoring

When the product has a `reference_image_url` set on the products table, **always pass the reference image to the generator as a visual anchor** alongside the prompt. This keeps the product bottle / packaging visually locked across all renderings. Without a reference image anchor, the model invents the packaging on every call.

For Cleantra Lymphatic Drainage Drops specifically: the reference is the amber-glass dropper bottle with black dropper cap + gold collar + white label with "CLEANTRA" wordmark + lotus logo + bold black "LYMPHATIC DRAINAGE*" + blue herbal-blend list + "10-IN-1 HERBAL BLEND" pill + black "DRAIN* IMMUNE* CLEANSE*" footer + "1 FL OZ (30ML)" band. THIS bottle, every render, until further notice.

---

## Acceptance check before a person-image leaves the bank

Before tagging a person-image as approved:

1. Look at the hands. Five fingers? Anatomy correct?
2. Look at the eyes. Same size pupils? White-of-eye non-glowing? Eyelashes natural?
3. Look at the skin. Pores visible? Some texture? Faint asymmetry?
4. Look at the environment. Is there at least one piece of real-world clutter?
5. Look at the lighting. Does it match a real light source visible in or implied by the frame?
6. Look at the pose. Is the subject mid-action, or stiff-posed?
7. Is the color grade editorial (slightly desat, warm shadow) or Instagram (HDR pop)?

A "no" on any of these means regenerate. No exceptions.

---

## Update history

- 2026-05-20 — initial guide, authored as part of Session 7 hard-correction response. Triggered by operator observation that Ledisa + Cleantra image bank had 3D / animated / uncanny people images.
