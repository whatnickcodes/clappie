# ChatGPT Image Prompting (`gpt-image`)

Use this reference for OpenAI image generation/editing workflows in ChatGPT or API contexts.

## Core Prompt Template

```text
Create a [photo/illustration] of [subject] in [context].
Style: [visual style], [mood], [palette].
Composition: [camera/framing], [subject placement], [negative space instructions].
Text handling: [exact short text to include] OR [leave area blank for later text].
Technical: [size/aspect], [quality level], [background requirements].
```

## Recommended Workflow

1. Start with a single clear objective and one style direction.
2. Request an initial render at target aspect/size.
3. Use edit/inpaint for local corrections instead of full reruns.
4. Promote successful wording into a reusable prompt seed.
5. Keep typography short and high-contrast when text must appear in-image.

## Practical Controls

- Use explicit size/aspect settings early.
- Increase quality only after composition is correct.
- Ask for blank regions when slide text will be added later.
- Use variations for controlled exploration around a strong base image.

## Failure-Mode Fixes

- Subject mismatch: move key subject phrase to first sentence.
- Style inconsistency: remove conflicting style terms and keep 2-3 anchor descriptors.
- Busy backgrounds: request reduced background complexity and stronger depth separation.
- Poor text rendering: shorten text and specify bold sans-serif, high contrast, simple placement.
