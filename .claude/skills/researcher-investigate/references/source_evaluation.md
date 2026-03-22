# Source Evaluation & Anti-Hallucination Reference

## Source Quality Tiers

Evaluate each gathered source against this hierarchy. Higher-tier sources take precedence when claims conflict.

| Tier | Source Type | Examples | Trust Level |
|------|-----------|----------|-------------|
| **1 — Primary** | Original data, official docs, peer-reviewed | API documentation, RFCs, published papers, official announcements | High — cite directly |
| **2 — Secondary** | Curated analysis of primary sources | Technical blog posts with citations, reputable journalism, textbooks | Moderate — verify key claims against primary when possible |
| **3 — Tertiary** | Aggregated or crowd-sourced | Stack Overflow answers, Wikipedia, forum posts, tutorials | Low — corroborate with Tier 1-2 before relying on |
| **4 — Training knowledge** | Model's pre-training data | General knowledge not tied to a specific source | Lowest — label explicitly, never present as researched fact |

## Per-Source Evaluation Checklist

For each source gathered, assess:

- **Recency**: When was it published/updated? Flag if >2 years old for fast-moving topics (cloud, AI, security). Established topics (algorithms, protocols) tolerate older sources.
- **Authority**: Is the author/organization credible for this domain? Official docs > personal blogs.
- **Corroboration**: Do other independent sources support the same claim? Single-source claims should be flagged.
- **Specificity**: Does the source make precise, verifiable claims, or vague generalizations? Prefer specific.
- **Bias**: Does the source have a commercial interest or advocacy position? Note if so.

## Hallucination Warning Signals

Watch for these in your own output — they indicate likely fabrication:

| Signal | Example | Correction |
|--------|---------|------------|
| Specific numbers without source | "Latency improved by 23.4%" | Verify against source. Retract if absent. |
| Confident claims about absent data | "The documentation clearly states..." | Re-read the source. Qualify or retract. |
| Plausible-sounding filler | Generic best-practice language not in any source | Strip it. Stick to gathered evidence. |
| Wrong attribution | "According to the Redis docs..." (but it's actually Valkey docs) | Check source identity. Correct. |
| Smooth narrative over gaps | Bridging two data points with a fabricated logical connection | Acknowledge the gap explicitly. |
| Over-precise language | "Exactly 47 nodes" when source says "approximately 50" | Match the source's precision level. |
| Temporal blending | Mixing information from different time periods as if contemporaneous | Date-stamp claims and note version differences. |

## Self-Audit Checklist

Run after synthesis, before presenting results:

- [ ] Every factual claim has a numbered source citation
- [ ] No claims are fabricated or unsupported
- [ ] Uncertainty is stated where it exists — no false confidence
- [ ] Training knowledge is labeled as such (or excluded)
- [ ] Retracted claims are marked with `[]`
- [ ] Source dates are noted for time-sensitive topics
- [ ] Conflicts between sources are flagged, not silently resolved
- [ ] Numbers, names, and dates match their sources exactly
- [ ] The response directly answers what was asked — no tangential padding
- [ ] Every `[N]` reference ends with a URL, DOI link, or absolute file path — no bare titles
- [ ] Every URL in the Sources list was actually visited or fetched during this session

## Citation Format Rules

Every `[N]` reference MUST include a link. A reference without a URL, DOI link, or absolute file path is **invalid** and MUST be removed.

### Format A: General Sources (web pages, documentation, code files)

```
[N] Title. *Site or Publisher*. Published YYYY-MM-DD. Accessed YYYY-MM-DD. URL
```

**Examples:**
```
[1] Getting Started with mTLS. *Istio Documentation*. Published 2025-11-03. Accessed 2026-03-22. https://istio.io/latest/docs/tasks/security/authentication/mtls-migration/
[2] configuration.yaml. *Local codebase*. Accessed 2026-03-22. /homeassistant/configuration.yaml
[3] Redis vs Valkey Performance Benchmarks. *InfoQ*. Published 2026-01-15. Accessed 2026-03-22. https://www.infoq.com/articles/redis-valkey-benchmarks/
```

**Rules:**
- Published date: use the page's publish date if visible. If unavailable, write `Published date unavailable.`
- Accessed date: MUST always be present. Use today's date.
- URL: MUST always be present. For local files, use the absolute file path.

### Format B: Research Articles (journals, preprints) — AMA Style

```
[N] AuthorLastname1 AB, AuthorLastname2 CD, et al. Article title. *Journal Name Abbreviated*. YYYY;Volume(Issue):Pages. doi:https://doi.org/DOI
```

For PubMed-indexed articles, append: `PMID: https://pubmed.ncbi.nlm.nih.gov/PMID/`

**Examples:**
```
[4] Absalom AR, Glen JB, Zwart GJ, et al. Target-controlled infusion: a mature technology. *Anesth Analg*. 2016;122(1):70-78. doi:https://doi.org/10.1213/ANE.0000000000001009 PMID: https://pubmed.ncbi.nlm.nih.gov/26505576/
[5] Schnider TW, Minto CF, Shafer SL, et al. The influence of age on propofol pharmacodynamics. *Anesthesiology*. 1999;90(6):1502-1516. doi:https://doi.org/10.1097/00000542-199906000-00003
```

**Rules:**
- MUST attempt to resolve a DOI for every research article. If truly unavailable, write `doi: not available` and provide an alternative URL (publisher page, PubMed link, or preprint server).
- Use `et al.` after the third author.
- Append `PMID: https://pubmed.ncbi.nlm.nih.gov/PMID/` ONLY for PubMed-indexed articles. NEVER fabricate a PMID — if uncertain whether the article is PubMed-indexed, omit the PMID.
- For preprints, use the preprint server as the journal: `*arXiv*`, `*medRxiv*`, `*bioRxiv*`.

### Verify Phase: Citation Checklist

During Phase 4 (Verify), run these checks on every `[N]` reference:

- [ ] Reference ends with a URL, DOI link, or absolute file path
- [ ] The URL was actually visited or fetched during THIS session (not recalled from memory)
- [ ] For research articles: DOI was resolved (or explicitly marked `doi: not available`)
- [ ] For research articles with PMID: the PMID was confirmed via PubMed lookup, not guessed
- [ ] No bare titles — every reference has at minimum: title, source/publisher, and a link

**If any check fails:** remove the reference and retract claims that depended solely on it.

### Common Citation Failures

| Failure | What it looks like | Guard |
|---------|-------------------|-------|
| Missing URL | `[3] Redis Documentation (2026)` | INVALID. Must end with URL. Find the link or remove. |
| Fabricated PMID | `PMID: 99999999` (does not exist) | NEVER guess PMIDs. Only include after PubMed confirmation. |
| Fabricated DOI | `doi:10.xxxx/fake` | ALWAYS resolve DOIs via lookup. If unavailable, write `doi: not available`. |
| Memory-only URL | URL looks right but was never fetched | Verify phase MUST confirm URL was visited in this session. |
| Bare title | `[1] Some Article Title` | INVALID. Add publisher, date, and URL. |

## Structured Output Template

Use this format when the user requests deep research or structured output:

```markdown
## Key Findings
[Synthesized answer with inline citations [1], [2], etc.]

## Conflicts and Gaps
- **Conflict:** [Sources [X] and [Y] disagree on [point] — X says A, Y says B]
- **Gap:** [No sources addressed [aspect]]

## Confidence Assessment
- **High confidence:** [claims with 2+ Tier 1-2 sources in agreement]
- **Moderate:** [claims with single-source or Tier 2-3 support]
- **Uncertain:** [areas where evidence is lacking or conflicting]

## Sources
[1] Title. *Site/Publisher*. Published YYYY-MM-DD. Accessed YYYY-MM-DD. URL
[2] AuthorLastname AB, et al. Article title. *J Abbr*. YYYY;Vol(Issue):Pages. doi:https://doi.org/DOI
```

Every reference MUST end with a URL, DOI link, or file path. See [Citation Format Rules](#citation-format-rules).
