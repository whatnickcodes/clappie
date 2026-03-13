# pubmed-mcp-server Developer Rules (Summary)

Source: upstream `.clinerules/clinerules.md` from `cyanheads/pubmed-mcp-server`.

Use these only when modifying the PubMed MCP server implementation.

## Non-Negotiable Patterns

1. Logic throws, handler catches.
- `logic.ts` should throw structured `McpError` on failure.
- `registration.ts`/transport layer should catch and format final response.

2. Request context propagation.
- Create `RequestContext` per operation.
- Pass context through the call stack for traceability.

3. Structured logging only.
- Use centralized logger singleton.
- Include request context in logs.

4. Telemetry first.
- Initialize OpenTelemetry before other imports in entrypoint.
- Ensure handled errors are recorded on active spans.

5. Tool module contract.
- Keep tool files split as `index.ts`, `logic.ts`, `registration.ts`.
- Define Zod schema and inferred types in `logic.ts`.

## Practical Implication

If behavior changes are needed, patch logic and schemas first, then adjust handler mapping and error formatting. Avoid mixing transport concerns into business logic.
