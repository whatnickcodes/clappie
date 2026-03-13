# Preference Memory Format

Store preferences in markdown sections.

## Global rules
Use for always-on behaviors.

Example:
- Multi-constraint choice: prioritize required attributes first (for example recycled material), then optimize for a secondary criterion (for example lowest price).
- Prefer Esselunga private-label when no explicit brand is requested.

## Product notes
Use one line per product family.

Examples:
- Color or package cues: map user-provided color/package descriptors to matching variants when confidence is high (for example mild vs spicy lines).
- Pizza Margherita: prefers `Esselunga Top Margherita`.
- Tortellini: usually `Esselunga`; if user asks to try, prefer `Giovanni Rana` for current run.

## Session overrides
Use for temporary exceptions.

Example:
- Today only: pick lactose-free mozzarella for all mozzarella items.
