# Gemini And Imagen Prompting

## Gemini Image Models

Use Gemini image models when multimodal iteration is needed (text + image refinement loops) and when rapid concept exploration matters.

### Prompt Pattern

```text
Generate an image of [subject] in [scene/context].
Style: [photo/illustration/vector-like look], [aesthetic descriptors].
Composition: [camera angle], [subject placement], [foreground/background instructions].
Lighting and color: [lighting setup], [palette/contrast].
Output constraints: [aspect ratio/size], [space for headline or no text].
```

### High-Value Techniques

- Use rich, explicit descriptors for subject, context, and style.
- Specify composition and framing directly (for example: "subject on left third, clean space on right").
- State lighting intent and color palette to reduce style drift.
- Keep prompts focused and remove conflicting constraints.
- Iterate by tightening one field at a time (composition first, then style).

### Common Fixes

- Wrong arrangement: add explicit spatial relationships and directional anchors.
- Visual clutter: reduce object count and request lower detail density.
- Weak text rendering: shorten text or leave blank space for downstream typography.

## Imagen 4

Use Imagen 4 for high-quality image generation within Vertex AI workflows, especially when consistent structure and polished visual outputs are required.

### Prompt Pattern

```text
Create [image type] featuring [subject] in [context].
Style and mood: [art direction], [tone].
Camera/composition: [angle], [framing], [negative space instructions].
Technical constraints: [aspect ratio/size], [output intent].
```

### High-Value Techniques

- Describe what to include in positive terms.
- Prioritize clear subject-context-style-composition structure.
- Use short, concrete descriptors over long ambiguous prose.
- Keep text requirements minimal and explicit for legibility.
- Use provided prompt-guidance tools in Vertex when available.

### Cautions

- Avoid relying on negative prompts as the primary control mechanism.
- Use image generation for concept visuals; validate scientific or numeric claims separately.
