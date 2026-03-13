---
name: pubmed-research
description: Use when tasks involve biomedical literature search, PMID lookup, citation export, evidence synthesis, or research planning with the PubMed MCP server (installed here as `pubmed`; tools include pubmed_search_articles, pubmed_fetch_contents, pubmed_article_connections, pubmed_research_agent, pubmed_generate_chart).
---

# PubMed Research

## When To Use

Use this skill when a request includes PubMed, PMID, biomedical paper discovery, literature review, citation generation, or structured research planning.

## Core Rules

1. Prefer MCP tool calls over web scraping for PubMed content.
2. Start broad with `pubmed_search_articles`, then deepen with `pubmed_fetch_contents` for selected PMIDs.
3. For large result sets, use ESearch history (`queryKey` and `webEnv`) instead of passing large PMID lists repeatedly.
4. Use `pubmed_article_connections` for related work and citation graph exploration.
5. Generate exports only in explicitly requested format (for example `bibtex`, `ris`, APA/MLA string).
6. Keep medical claims faithful to sources; do not overstate causality from observational studies.
7. If evidence is sparse, contradictory, or low quality, state that clearly.

## Operational Defaults

- In this environment, the MCP server id is `pubmed`.
- In Codex MCP command mode, prefer `MCP_TRANSPORT_TYPE=stdio`.
- Keep `NCBI_API_KEY` configured to avoid strict unauthenticated rate limits.
- If a tool call fails, retry with tighter parameters (smaller `retmax`, narrower query, specific date or journal filters).

## Workflow

1. Clarify objective: clinical question, mechanism question, intervention outcome, or background survey.
2. Build search query with key concepts and synonyms.
3. Run `pubmed_search_articles` with bounded result size.
4. Select candidate PMIDs and fetch detailed content with `pubmed_fetch_contents`.
5. Expand neighborhood using `pubmed_article_connections` if needed.
6. Produce structured output: summary, key papers, limitations, and citations.

## Output Contract

When summarizing findings, return:

- Search strategy used (short).
- Top relevant papers with PMID and year.
- Main findings.
- Important caveats and evidence quality notes.
- Citation block in the user-requested format.

## Reference

If working on the server implementation itself (not just using tools), load:
`references/pubmed-mcp-server-dev-rules.md`.
