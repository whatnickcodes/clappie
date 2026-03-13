# Model Selection

Use this table to pick the first model pass. Then load the matching model reference.

## Quick Matrix

| Need | Recommended model | Why | Watch-outs |
|---|---|---|---|
| Fast concept iterations, infographic-style drafts | Gemini Flash Image | Strong multimodal workflow, fast iteration, good prompt adherence for mixed visual tasks | Tighten layout instructions early for text-heavy designs |
| Photoreal hero images, strong editing loop | ChatGPT Image (`gpt-image`) | High-quality outputs plus edits/variations API flow | Raster output; keep text short and explicit |
| Editable vector graphics, icons, diagrams, infographic assets | Recraft V4 SVG/vector variants | Native vector-first prompting patterns and clean style control | Treat numeric chart values as conceptual unless rebuilt from data |
| High-fidelity cinematic/illustrative shots with strong controllability | FLUX.2 family | Strong prompt adherence and quality-oriented model variants | Match prompt complexity to variant speed/quality tradeoffs |
| High-quality Google image generation with strong prompt structure and enterprise deployment | Imagen 4 | Mature prompt guidance and style/composition control on Vertex AI | Prefer positive instruction style; avoid negative prompting patterns |

## Practical Routing

- If request emphasizes **vector editability**: choose Recraft SVG/vector variant first.
- If request emphasizes **photo realism with iterative edits**: choose `gpt-image` first.
- If request emphasizes **Google stack integration**: choose Gemini/Imagen path first.
- If request needs **high control and aesthetic detail**: choose FLUX.2 variant first.

## Slide-Generation Heuristic (from user guide + official docs)

- Title/section hero images: `gpt-image`, Imagen 4, or FLUX.2 high-quality variants.
- Vector schematics and infographic components: Recraft V4 SVG/vector variants.
- Early layout ideation and quick alternates: Gemini Flash Image.
