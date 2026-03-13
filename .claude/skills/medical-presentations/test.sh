#!/usr/bin/env bash
# E2E structural test suite for medical-presentations skill
# 19 checks across 4 sections: Structure, Cross-reference, Format, Gamma
set -euo pipefail
cd "$(dirname "$0")"

PASS=0
FAIL=0
ERRORS=()

check() {
  local name="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    printf "  \033[32mPASS\033[0m  %s\n" "$name"
    PASS=$((PASS + 1))
  else
    printf "  \033[31mFAIL\033[0m  %s\n" "$name"
    FAIL=$((FAIL + 1))
    ERRORS+=("$name")
  fi
}

REF_FILES=(
  references/evidence_quality_rubric.md
  references/pubmed_search_strategies.md
  references/presentation_types.md
  references/slide_structure_patterns.md
  references/image_generation_models.md
  references/gamma_prompt_templates.md
  references/chrome_refinement_procedures.md
)

API_MODELS=(
  imagen-4-pro
  recraft-v4
  recraft-v3-svg
  gemini-3-pro-image
  gemini-2.5-flash-image
  gpt-image-1-medium
  gpt-image-1-high
)

IMAGE_TYPES=(
  photorealistic
  illustration
  vector
  infographic
  data-viz
)

TEMPLATE_NAMES=(
  "Lecture"
  "Debate"
  "Case Presentation"
  "Literature Review"
)

FIGURE_SOURCES=(
  direct
  synthesized
  composite
)

TEXT_MODES=(
  generate
  preserve
  condense
)

# ──────────────────────────────────────────────
# Section: Structure (S1–S7)
# ──────────────────────────────────────────────
echo "=== Structure ==="

check "S1: SKILL.md exists" test -f SKILL.md

check "S2: SKILL.md ≤ 500 lines" \
  bash -c '[ "$(wc -l < SKILL.md)" -le 500 ]'

check "S3: 9 step headers (Step 0–8)" \
  bash -c '[ "$(grep -c "^## Step [0-8]:" SKILL.md)" -eq 9 ]'

check "S4: 5 checkpoints" \
  bash -c '[ "$(grep -c "\*\*CHECKPOINT [1-5]" SKILL.md)" -eq 5 ]'

check_s5() {
  for f in "${REF_FILES[@]}"; do
    test -f "$f" || return 1
  done
}
check "S5: All 7 reference files exist" check_s5

check "S6: .security-scan-passed exists" test -f .security-scan-passed

check_s7() {
  for f in "${REF_FILES[@]}"; do
    local base
    base=$(basename "$f")
    grep -q "$base" SKILL.md || return 1
  done
}
check "S7: SKILL.md references all 7 ref files" check_s7

# ──────────────────────────────────────────────
# Section: Cross-references (X1–X5)
# ──────────────────────────────────────────────
echo ""
echo "=== Cross-references ==="

check_x1() {
  for model in "${API_MODELS[@]}"; do
    grep -qF "$model" references/image_generation_models.md || return 1
  done
}
check "X1: 7 API model strings in image_generation_models.md" check_x1

check_x2() {
  for tname in "${TEMPLATE_NAMES[@]}"; do
    grep -qF "### Template: $tname" references/gamma_prompt_templates.md || return 1
  done
}
check "X2: 4 template headers in gamma_prompt_templates.md" check_x2

check_x3() {
  for t in "${TEMPLATE_NAMES[@]}"; do
    grep -qE "^\| ${t} \|" references/evidence_quality_rubric.md || return 1
  done
  [ "$(grep -c '### Evidence Mapping' references/presentation_types.md)" -eq 4 ]
}
check "X3: 4 types in rubric + 4 evidence mappings" check_x3

check_x4() {
  for it in "${IMAGE_TYPES[@]}"; do
    grep -qF "\`${it}\`" references/slide_structure_patterns.md || return 1
  done
}
check "X4: 5 imageTypes in slide_structure_patterns.md" check_x4

check_x5() {
  local prefixes
  prefixes=$(grep -oE 'mcp__[a-zA-Z0-9_-]+__[a-zA-Z0-9_]+' SKILL.md \
    | sed 's/mcp__\([a-zA-Z0-9_-]*\)__.*/\1/' | sort -u)
  for p in $prefixes; do
    case "$p" in
      claude_ai_PubMed|claude-in-chrome|google_workspace) ;;
      *) return 1 ;;
    esac
  done
}
check "X5: All MCP prefixes are allowed services" check_x5

# ──────────────────────────────────────────────
# Section: Format (F1–F4)
# ──────────────────────────────────────────────
echo ""
echo "=== Format ==="

check_f1() {
  local fields=(imageType targetModel figureSource imagePrompt dataVerificationRequired)
  for field in "${fields[@]}"; do
    grep -q "$field" references/slide_structure_patterns.md || return 1
  done
}
check "F1: imageStrategy has 5 fields" check_f1

check "F2: [IMAGE:] annotation in gamma_prompt_templates.md" \
  grep -q '\[IMAGE:' references/gamma_prompt_templates.md

check "F3: Evidence table header format" \
  grep -qE '^\| #.*Citation.*Design.*Level' references/evidence_quality_rubric.md

check_f4() {
  local files=(references/slide_structure_patterns.md references/image_generation_models.md SKILL.md)
  for src in "${FIGURE_SOURCES[@]}"; do
    for f in "${files[@]}"; do
      grep -qi "$src" "$f" || return 1
    done
  done
}
check "F4: figureSource values in 3 files" check_f4

# ──────────────────────────────────────────────
# Section: Gamma (G1–G3)
# ──────────────────────────────────────────────
echo ""
echo "=== Gamma ==="

check_g1() {
  grep -q "public-api.gamma.app/v1.0" SKILL.md &&
    grep -q "public-api.gamma.app/v1.0" references/gamma_prompt_templates.md
}
check "G1: Gamma API URL in SKILL.md + gamma_prompt_templates.md" check_g1

check_g2() {
  grep -q "X-API-KEY" SKILL.md &&
    grep -q "X-API-KEY" references/gamma_prompt_templates.md
}
check "G2: X-API-KEY in SKILL.md + gamma_prompt_templates.md" check_g2

check_g3() {
  for mode in "${TEXT_MODES[@]}"; do
    grep -q "$mode" references/gamma_prompt_templates.md || return 1
  done
  local skill_mode
  skill_mode=$(grep -oE '"(generate|preserve|condense)"' SKILL.md | tr -d '"' | head -1)
  case "$skill_mode" in
    generate|preserve|condense) return 0 ;;
    *) return 1 ;;
  esac
}
check "G3: textMode values in gamma_prompt_templates.md + SKILL.md" check_g3

# ──────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
printf "Results: \033[32m%d passed\033[0m, \033[31m%d failed\033[0m out of %d\n" \
  "$PASS" "$FAIL" "$((PASS + FAIL))"
if [[ $FAIL -gt 0 ]]; then
  echo ""
  echo "Failures:"
  for e in "${ERRORS[@]}"; do
    echo "  - $e"
  done
  exit 1
fi
exit 0
