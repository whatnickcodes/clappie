# Chrome Refinement Procedures

## Contents
- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Step 1: Navigate to Presentation](#step-1-navigate-to-presentation)
- [Step 2: Review Slide Content](#step-2-review-slide-content)
- [Step 3: AI Image Regeneration (Standard)](#step-3-ai-image-regeneration-standard)
- [Step 3B: Image Regeneration via Chrome UI](#step-3b-image-regeneration-via-chrome-ui)
- [Step 4: Layout Adjustments](#step-4-layout-adjustments)
- [Step 5: Export](#step-5-export)
- [Step 6: User-Guided Refinements](#step-6-user-guided-refinements)
- [Fallback: When Chrome Automation is Unavailable](#fallback-when-chrome-automation-is-unavailable)
- [Error Recovery](#error-recovery)

## Overview

After Gamma generates the presentation, use Chrome browser automation (MCP tools) to review and refine the output. These procedures handle visual adjustments that can't be controlled through the Gamma API alone.

## Prerequisites

- Gamma presentation URL (returned by `GET /v1.0/generations/{id}` as `gammaUrl`)
- Chrome browser with Claude-in-Chrome extension active
- Active tab context (`mcp__claude-in-chrome__tabs_context_mcp`)

## Step 1: Navigate to Presentation

```
Tool: mcp__claude-in-chrome__navigate
URL: [Gamma presentation URL]
```

Wait for page load, then read page to confirm the presentation loaded:
```
Tool: mcp__claude-in-chrome__read_page
```

## Step 2: Review Slide Content

For each slide, verify:
1. **Heading text** matches the outline
2. **Evidence citations** are present and correctly formatted
3. **Data/numbers** are accurate
4. **Image relevance** — generated images match the clinical context

Use `read_page` or `get_page_text` to extract current slide content for comparison against the approved outline.

### Page Reading Strategy for Large Presentations

For presentations with >15 slides, `read_page` at depth 2+ may exceed output limits (~30K chars). Use this approach:
1. `read_page` at **depth 1** — get page structure and slide count
2. `get_page_text` — get full text content of all slides for content verification
3. For specific slide inspection, use `find` or `javascript_tool` to target individual slides

## Step 3: AI Image Regeneration (Standard)

When a generated image doesn't match the clinical context:

1. Click on the image element
2. Look for Gamma's "Regenerate" or AI image options
3. Use `javascript_tool` if direct click doesn't expose options:
   ```javascript
   // Find and click the image's edit/regenerate button
   document.querySelector('[data-testid="image-regenerate"]')?.click()
   ```
4. If Gamma provides a prompt field, enter a more specific prompt:
   - "Clinical photograph of [specific procedure/anatomy]"
   - "Medical illustration of [mechanism/pathway]"
   - "Operating room setup for [procedure]"

**Note:** Gamma's UI may change. If selectors don't work, use `read_page` to identify current UI elements.

## Step 3B: Image Regeneration via Chrome UI

When a generated image needs improvement, use Gamma's web UI to regenerate with a different model or refined prompt.

### Navigation to Model Selection

1. **Select the slide**: Click the slide thumbnail in the left panel to navigate to the target slide
2. **Enter image edit mode**: Hover over the image element, look for "Edit image", "Regenerate", or a pencil/refresh icon
3. **Locate model selector**: Use `mcp__claude-in-chrome__find` to search for model selection UI:
   ```
   Tool: mcp__claude-in-chrome__find
   Search for: "model" or "AI model" or "image model" or "Nano Banana" or "GPT Image"
   ```
4. **Open model dropdown**: Click the model selector. If not immediately visible, look for:
   - A dropdown or menu within the image edit panel
   - An "Advanced" or "Settings" section in the regeneration dialog
   - Use `read_page` to identify current UI structure if needed
5. **Select target model**: Click the target model name:
   - **Nano Banana Pro** — for scientific figures with text labels, infographics, text-in-image
   - **Recraft V4** — for mechanism diagrams, pathway illustrations
   - **GPT Image** / **GPT Image (Detailed)** — for complex data visualizations

### Per-Model Prompt Entry

After selecting the model, enter the full prompt from the slide's `imageStrategy.imagePrompt`:

**Nano Banana Pro:**
- Paste the 6-element prompt (Subject | Composition | Action/Content | Setting | Style | Editing)
- Look for a "Search grounding" toggle — enable it if visible (improves factual accuracy)
- ALL CAPS sections in the prompt are critical — ensure they're preserved

**Recraft V4:**
- Paste the general-to-specific prompt (Style -> Content -> Background -> Style Detail)
- Include hex color palette values in the prompt
- Keep prompt structure flat — avoid nested formatting

**GPT Image / GPT Image (Detailed):**
- Paste the segmented labeled prompt (Background -> Subject -> Constraints -> Style -> Quality)
- For GPT Image (Detailed): ensure "quality: high" or "detailed" is specified
- Include every data point — this model has the best instruction-following

### Regeneration Workflow

For each slide requiring image regeneration:
1. Navigate to the slide
2. Enter image edit mode
3. Select the target model
4. Paste the complete prompt from `imageStrategy.imagePrompt`
5. Trigger regeneration
6. Wait for generation to complete (may take 10-30 seconds for premium models)
7. If the result needs improvement: adjust the prompt and regenerate (max 2 attempts)
8. Move to the next slide

### Data Verification After Premium Regeneration

For `data-viz` and `infographic` slides with `dataVerificationRequired: true`:

1. **Read the generated image** using `mcp__claude-in-chrome__read_page` or visual inspection
2. **Cross-reference each value** against the evidence table from Step 3:
   - [ ] Study names/author labels correct
   - [ ] All numeric values match (effect sizes, CIs, p-values, percentages)
   - [ ] Axis labels, units, and ranges correct
   - [ ] Direction of effect correct (favors intervention on correct side)
   - [ ] Legend matches data series
   - [ ] Statistical annotations accurate
3. **If discrepancy found**:
   - Regenerate with more explicit values in the prompt (attempt 2)
   - If still incorrect after 2 attempts: flag for user review at CHECKPOINT 5
   - Include the correct values in a text annotation or speaker note
4. **Document verification status** for each data-viz slide:
   - `verified` — all values confirmed correct
   - `approximate` — layout correct but some values may differ slightly
   - `needs-review` — significant discrepancies, flagged for user

## Step 4: Layout Adjustments

### Reordering Slides
Use Gamma's drag-and-drop or keyboard shortcuts via `computer` tool to rearrange slides.

### Text Formatting
For minor text edits:
```
Tool: mcp__claude-in-chrome__form_input
```
Click into text areas and modify content directly.

### Column Layouts
For comparison slides that need side-by-side layout:
1. Select the content block
2. Use Gamma's layout options (usually in a toolbar)
3. Choose two-column or table layout

## Step 5: Export

### PPTX Export
1. Navigate to Gamma's export menu (typically top-right)
2. Select "Download as PowerPoint" or "Export"
3. Choose PPTX format
4. Wait for download to complete

```javascript
// Look for export button
document.querySelector('[data-testid="export-button"]')?.click()
// Or find via text content
[...document.querySelectorAll('button')].find(b => b.textContent.includes('Export'))?.click()
```

### PDF Export
1. Same export menu
2. Select "Download as PDF"
3. Wait for render and download

### Share Link
1. Click "Share" button
2. Copy the presentation URL
3. Return URL to user

## Step 6: User-Guided Refinements

At Step 7 checkpoint, present the user with available refinements:

```
Available refinements:
1. Regenerate specific slide images (specify which slides)
2. Adjust slide order
3. Edit text on specific slides
4. Change layout of comparison/data slides
5. Export format (PPTX / PDF / share link)
6. Skip refinements — proceed to delivery
```

Wait for user selection before executing any refinement.

## Fallback: When Chrome Automation is Unavailable

If browser automation tools fail or are not connected:

1. **Inform the user**: "Browser automation is unavailable. Here's how to refine manually:"
2. **Provide the Gamma URL**: Direct link to the presentation
3. **Manual instructions**:
   - Open the URL in your browser
   - Click any slide to edit text directly
   - Click images → "Regenerate" for new AI images
   - Use the toolbar for layout changes
   - Export via the menu (top-right) → Download as PPTX/PDF
4. **Include image prompts**: For slides needing regeneration, provide the full `imagePrompt` from the outline so the user can manually regenerate with the correct model and prompt:
   ```
   Slides requiring image regeneration:
   - Slide [N] ([slide title]): Use [model name]. Prompt: [full prompt]
   - Slide [M] ([slide title]): Use [model name]. Prompt: [full prompt]
   ```
5. **Proceed to Step 8 (Deliver)**: Skip Chrome refinement, proceed with delivery using the Gamma URL

## Error Recovery

### Page Not Loading
1. Retry navigation once
2. Check if URL is valid
3. If persistent: provide URL to user, switch to manual fallback

### Extension Not Responding
1. Call `tabs_context_mcp` to refresh tab state
2. Try creating a new tab and navigating there
3. If 2 attempts fail: switch to manual fallback

### Element Not Found
1. Use `read_page` to get current DOM state
2. Try alternative selectors
3. Use `find` tool to locate elements by text
4. If not found after 2 attempts: note the issue and move on
