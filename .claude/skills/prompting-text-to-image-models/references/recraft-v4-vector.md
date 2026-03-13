# Recraft V4 SVG/Vector Prompting

Focus this reference on SVG/vector-producing Recraft variants.

## Vector-First Prompt Structure

Use this order:

1. Subject: main objects and their hierarchy.
2. Composition: layout, perspective, spacing, and visual balance.
3. Context: use case (slide, icon set, infographic panel, dashboard element).
4. Style: vector direction (flat, geometric, outlined, minimal, editorial).
5. Level of detail: simple/moderate/dense.
6. Technical constraints: editable SVG/vector intent, layer clarity, palette limits.

## Base Template

```text
Create an editable SVG/vector illustration of [subject].
Composition: [layout and placement rules].
Context: [where it will be used].
Style: [vector style adjectives].
Level of detail: [low/medium/high], with clear shape hierarchy.
Color and lines: [palette], [stroke style/thickness], [background handling].
Output intent: clean, layered vector suitable for post-editing.
```

## High-Value Vector Keywords

- "editable SVG/vector"
- "clean paths"
- "flat fills with minimal gradients"
- "consistent stroke weight"
- "separate foreground/background groups"
- "high legibility at slide scale"

## Specialized Templates

### Icon Set

```text
Create a coherent SVG icon set for [topic] with [N] icons, consistent grid alignment, uniform stroke width, rounded corners, flat two-tone palette, no raster textures.
```

### Biology/Technical Diagram

```text
Create an editable SVG/vector diagram of [system/process], with clearly separated components, directional flow markers, restrained color coding per component group, and space reserved for external labels.
```

### Infographic Card

```text
Create a 16:9 vector infographic panel about [topic], with clear title zone, primary visual in [position], and minimal supporting icons. Keep hierarchy obvious and text placeholders short.
```

## Quality Checks

- Confirm element hierarchy remains readable at presentation scale.
- Keep text placeholders short; add final labels in a vector editor when precision is required.
- Rebuild data-accurate charts in plotting tools after style exploration.
