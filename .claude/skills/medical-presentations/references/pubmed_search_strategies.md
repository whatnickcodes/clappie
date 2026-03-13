# PubMed Search Strategies

## Query Construction

### Basic Pattern

```
"[MeSH Term]" AND "[intervention/exposure]" AND "[outcome]"
```

### Adding Publication Type Filters

```
"[topic]"[MeSH Terms] AND "Clinical Trial"[Publication Type]
"[topic]"[MeSH Terms] AND "Randomized Controlled Trial"[Publication Type]
"[topic]"[MeSH Terms] AND ("Meta-Analysis"[Publication Type] OR "Systematic Review"[Publication Type])
```

### Date Filtering Guidance

| Topic Pace | Date Range | Rationale |
|------------|------------|-----------|
| Fast-evolving (COVID, novel drugs, AI in medicine) | Last 3-5 years | Rapid turnover, older data often superseded |
| Standard (pharmacology, procedures) | Last 5-7 years | Balanced recency and completeness |
| Established (anatomy, physiology, classic techniques) | Last 10 years | Foundational evidence still relevant |
| Landmark studies | No date filter | Use specific citation search |

## MeSH Terms for Anesthesiology Domains

### General Anesthesia
- "Anesthesia, General"[MeSH]
- "Anesthesia, Intravenous"[MeSH]
- "Anesthesia, Inhalation"[MeSH]
- "Anesthetics, Intravenous"[MeSH] — propofol, ketamine, etomidate
- "Anesthetics, Inhalation"[MeSH] — sevoflurane, desflurane, isoflurane

### Regional Anesthesia
- "Anesthesia, Conduction"[MeSH] — nerve blocks
- "Anesthesia, Epidural"[MeSH]
- "Anesthesia, Spinal"[MeSH]
- "Nerve Block"[MeSH]
- "Ultrasonography, Interventional"[MeSH] — ultrasound-guided

### Critical Care
- "Critical Care"[MeSH]
- "Intensive Care Units"[MeSH]
- "Respiration, Artificial"[MeSH] — mechanical ventilation
- "Respiratory Distress Syndrome"[MeSH] — ARDS
- "Sepsis"[MeSH]
- "Shock, Septic"[MeSH]
- "Hemodynamic Monitoring"[MeSH]

### Pain Medicine
- "Pain Management"[MeSH]
- "Acute Pain"[MeSH]
- "Chronic Pain"[MeSH]
- "Analgesics, Opioid"[MeSH]
- "Anti-Inflammatory Agents, Non-Steroidal"[MeSH]
- "Analgesia, Patient-Controlled"[MeSH]
- "Enhanced Recovery After Surgery"[MeSH] — ERAS

### Airway Management
- "Airway Management"[MeSH]
- "Intubation, Intratracheal"[MeSH]
- "Laryngeal Masks"[MeSH]
- "Difficult Airway"[MeSH] — check subheadings

### Monitoring
- "Monitoring, Intraoperative"[MeSH]
- "Blood Pressure Monitoring, Ambulatory"[MeSH]
- "Oximetry"[MeSH]
- "Capnography"[MeSH]

### Perioperative
- "Perioperative Care"[MeSH]
- "Preoperative Care"[MeSH]
- "Postoperative Complications"[MeSH]
- "Postoperative Nausea and Vomiting"[MeSH]

## Progressive Broadening Strategy

When initial search returns too few results (<10 articles):

### Round 1: Relax date filter
Remove or extend date range by 5 years.

### Round 2: Broaden MeSH terms
Replace specific terms with parent terms:
- "Anesthesia, Spinal" → "Anesthesia, Conduction"
- "Propofol" → "Anesthetics, Intravenous"

### Round 3: Add text-word synonyms
```
("spinal anesthesia"[MeSH] OR "spinal anaesthesia"[tiab] OR "subarachnoid block"[tiab])
```

### Round 4: Remove publication type filter
Search all publication types instead of only RCTs/reviews.

### Round 5: Fallback to WebSearch
If PubMed is unavailable or returns 0, use WebSearch targeting:
- PubMed Central (PMC) full-text
- Cochrane Library
- UpToDate
- Society guidelines (ASA, ESA, ESAIC)

**Note:** When using WebSearch fallback, mark all citations as "non-PubMed source" and note reduced citation quality in the evidence table.

## Parallel Search Agent Strategy

For Step 2, dispatch 3-5 parallel agents:

| Agent | Focus | Query Pattern |
|-------|-------|---------------|
| 1 | Systematic reviews & meta-analyses | `[topic] AND ("Meta-Analysis"[PT] OR "Systematic Review"[PT])` |
| 2 | Recent RCTs | `[topic] AND "Randomized Controlled Trial"[PT] AND last 5 years` |
| 3 | Clinical guidelines | `[topic] AND ("Practice Guideline"[PT] OR "Guideline"[PT])` |
| 4 | Landmark/high-impact studies | `[topic] AND specific known authors or trial names` |
| 5 | Related articles from top hits | Use `find_related_articles` on PMIDs from agents 1-2 |

Each agent should:
1. Execute `search_articles` with its query
2. For top 5-10 results: call `get_article_metadata` for abstracts
3. For Level A evidence with PMC access: attempt `get_full_text_article` (PMC-only; multi-path full-text retrieval in SKILL.md Step 3)
4. Return structured results: PMID, **DOI**, title, authors, year, design, key findings, evidence level
5. After retrieving metadata, verify `publicationType` — reject letters, editorials, comments, and errata. Only accept: original research, reviews, meta-analyses, guidelines, trials

## Subject-Specific Tips

### Pharmacology Topics
- Include both generic and brand names in text-word search
- Search for dose-finding studies: add "Dose-Response Relationship, Drug"[MeSH]
- Check for Cochrane reviews specifically

### Procedure Topics
- Add "methods"[Subheading] to MeSH terms
- Search for technique comparisons: "[technique A] vs [technique B]"
- Include complication rates: add "Postoperative Complications"[MeSH]

### Pediatric Topics
- Add "Child"[MeSH] OR "Infant"[MeSH] OR "Pediatrics"[MeSH]
- Note: pediatric evidence is often Level C-D due to smaller sample sizes

### Obstetric Anesthesia
- Add "Pregnancy"[MeSH] or "Cesarean Section"[MeSH]
- Drug safety: add "Pregnancy Complications"[MeSH]

## Full-Text Retrieval Cascade

After building the Figure Data Extraction Table, identify articles where abstract data is insufficient for accurate figure reproduction (missing exact values, CIs, or time-series data points). For these articles, attempt full-text retrieval using this priority cascade:

**Path 1 — PMC (fast, structured):**
Use `mcp__claude_ai_PubMed__convert_article_ids` to check for PMC ID, then `mcp__claude_ai_PubMed__get_full_text_article`. Extract only Results and Discussion sections via a dedicated subagent to conserve context.

**Path 2 — WebFetch via DOI (fast, parallel):**
For articles with DOI but no PMC access:
```
Tool: WebFetch
url: https://doi.org/[DOI]
prompt: "Extract the Results and Discussion sections of this research article. Include all numerical outcomes, effect sizes, confidence intervals, p-values, and time-series data points. Ignore headers, footers, navigation, and references."
```
WebFetch converts HTML→markdown automatically. Run in parallel via multiple WebFetch calls. If the response indicates a paywall or incomplete content (< 500 words of results), flag for Path 3.

**Path 3 — Chrome MCP via DOI (fallback for paywalled articles):**
If Path 2 fails for ≥2 articles and institutional access may help:
1. Check VPN status: `pgrep -x openfortivpn` (returns PID if connected)
2. If not connected, prompt the user: "X articles need institutional access for full text. Please connect VPN (`uniprvpn`) and confirm, or say 'skip' to proceed with abstracts only."
3. After VPN confirmed, for each flagged article:
   - `mcp__claude-in-chrome__navigate` → `https://doi.org/[DOI]`
   - `mcp__claude-in-chrome__get_page_text` → extract full text
   - Process with a Task subagent to extract Results/Discussion only
4. After all articles retrieved, user may disconnect VPN.

**Graceful degradation:** If full text is unavailable after all paths, proceed with abstract + metadata. Note in the Figure Data Extraction Table which values are "from abstract" vs "from full text" so data-viz prompts can flag approximate values.
