---
name: prompting-text-to-image-models
description: Use when crafting, improving, or troubleshooting text-to-image prompts for Gemini image models, ChatGPT Image (gpt-image), Recraft V4 SVG/vector variants, FLUX.2 models, or Imagen 4, especially for model choice, composition control, text legibility, style consistency, and iterative prompt refinement.
---

# Prompting Text To Image Models

## Overview
Deliver model-specific, evidence-backed prompting workflows for current state-of-the-art text-to-image models. Route quickly to the right model reference, build structured prompts, and iterate with targeted fixes.

## Route By Need
Load only the reference needed for the active request.

- Model selection or comparison: read `references/model-selection.md`.
- Google Gemini image generation: read `references/gemini-and-imagen.md` (Gemini section).
- Imagen 4 prompting: read `references/gemini-and-imagen.md` (Imagen section).
- ChatGPT Image / `gpt-image`: read `references/chatgpt-image.md`.
- Recraft V4 SVG/vector work: read `references/recraft-v4-vector.md`.
- FLUX.2 prompt design: read `references/flux2.md`.
- Source provenance and refresh: read `references/sources.md`.

## Build Prompts In This Order
1. Define intent: subject, audience, and delivery format.
2. Define hard constraints: aspect ratio, orientation, composition, brand/style guardrails, and whether text must be rendered or left blank.
3. Choose model/variant using `references/model-selection.md`.
4. Write the base prompt using the universal scaffold below.
5. Add model-native instructions from the model reference.
6. Generate one baseline and one controlled variant.
7. Diagnose failure mode and apply a minimal edit, not a full rewrite.

## Universal Prompt Scaffold
Use this scaffold, then specialize per model.

```text
Create a [medium/style] of [primary subject] in [context].
Composition: [camera/perspective/framing], [subject placement], [negative space instructions].
Visual style: [art direction], [color palette], [texture/lighting].
Clarity constraints: [readability, simplicity, hierarchy].
Technical constraints: [aspect ratio or size], [background handling], [output format if supported].
Do not include: [only if model supports this pattern well; otherwise describe desired output positively].
```

## Fast Iteration Rules
- Change one variable at a time: composition, style, lighting, or detail density.
- Preserve successful instructions verbatim across iterations.
- Prefer regional editing/inpainting when available instead of full regeneration.
- For text-heavy visuals, request short text strings and explicit placement.
- For data-accurate charts, use image models for concept/style only, then rebuild with plotting tools.

## Debugging Checklist
- Subject wrong: front-load subject noun phrase and remove competing subjects.
- Layout wrong: add explicit spatial anchors (left/right/top/bottom, foreground/background).
- Style drift: repeat 2-3 anchor style descriptors and remove contradictory adjectives.
- Text unreadable: shorten copy, increase requested font size/contrast, or reserve blank areas and add text downstream.
- Overcrowded image: cap element count and request lower visual density.

## Evidence Freshness Rule
When asked for "latest" behavior, pricing, model releases, or capability deltas, verify with official docs before answering. Prefer primary sources listed in `references/sources.md`.

## References
- `references/model-selection.md`
- `references/gemini-and-imagen.md`
- `references/chatgpt-image.md`
- `references/recraft-v4-vector.md`
- `references/flux2.md`
- `references/sources.md`
