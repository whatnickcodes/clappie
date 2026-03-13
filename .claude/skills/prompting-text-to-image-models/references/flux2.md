# FLUX.2 Prompting

Use this reference for FLUX.2 model-family prompting.

## Model-Family Guidance

- Prefer high-quality FLUX.2 variants for final polished outputs.
- Prefer lighter/faster FLUX variants for exploration batches.
- Match prompt complexity to model capacity; denser prompts are better handled by top-tier variants.

## Prompt Construction Strategy

1. Start with a concise core description.
2. Add composition and camera instructions.
3. Add style and material/texture descriptors.
4. Add lighting and atmosphere.
5. Add output constraints (aspect ratio, negative space, intended post-processing).

## Base Template

```text
[Primary scene in one sentence].
Composition: [camera angle, framing, subject placement].
Style: [genre/aesthetic], [materials/textures].
Lighting: [type, direction, mood].
Constraints: [aspect ratio], [clarity/readability needs], [text-space instructions].
```

## Prompting Notes From BFL Guides

- Keep language direct and concrete before adding stylistic flourishes.
- Use atmosphere and cinematic cues after composition is stable.
- Use generated variants to branch from strong seeds instead of restarting.
- If available in the interface, leverage prompt enhancement/upsampling intentionally and compare against raw prompt behavior.

## Troubleshooting

- Weak composition: simplify scene description and front-load framing constraints.
- Style inconsistency: reduce style keywords to a compact, non-conflicting set.
- Over-complex scene: lower object count and split into staged iterations.
