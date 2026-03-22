# Utility Reference

Shared display components for building terminal UIs. Push these from any clapp or skill — they handle their own rendering, input, and submission.

## Components

### list

Multi-select or single-select list picker.

```bash
clappie display push utility/list -d title="Select emails" -d items="Email from Bob\nEmail from Alice\nNewsletter"
clappie display push utility/list -d title="Pick one" -d multi=false -d file=path/to/items.txt
```

**Data options:**
- `title` — Heading text
- `lead` — Optional description below title
- `items` — Newline-separated items (inline)
- `file` — Load items from file (relative to project root, one per line)
- `multi` — `true` (default) for checkboxes, `false` for radio buttons

**Returns:** `[clappie] List -> selected item 1\nselected item 2`

### confirm

Confirmation dialog with customizable options.

```bash
clappie display push utility/confirm -d message="Delete 3 files?"
clappie display push utility/confirm -d message="Send email?" -d variant=danger
clappie display push utility/confirm -d message="What next?" -d 'options=Yes\nNo\nMaybe later'
```

**Data options:**
- `message` — The question to confirm
- `lead` — Optional description above the message
- `file` — Load message from file (first line used)
- `options` — Newline-separated custom options (default: Yes/No)
- `confirmLabel` / `cancelLabel` — Override default button labels
- `variant` — `info` (default) or `danger`

**Returns:** `[clappie] Confirm -> yes` or `[clappie] Confirm -> no` (or lowercase option text for custom options)

### editor

Text editor for editing files with save support.

```bash
clappie display push utility/editor -d file=chores/humans/email-bob.txt
clappie display push utility/editor -d file=path/to/file.txt -d title="Draft Email"
```

**Data options:**
- `file` — File path relative to project root (required)
- `title` — Override title (defaults to filename)
- `onSave` — `stay` (default) or `back` (pop after save)

**Keys:** Click header to toggle edit mode. ESC to close (warns if unsaved).

### viewer

Read-only file viewer with scrolling.

```bash
clappie display push utility/viewer -d file=path/to/file.txt
clappie display push utility/viewer -d file=recall/logs/sidekicks/abc.txt -d title="Sidekick Log"
```

**Data options:**
- `file` — File path relative to project root (required)
- `title` — Override title (defaults to filename)

**Keys:** j/k or arrows to scroll, Space/PageDown for page, g/G for top/bottom, ESC to close.

### file-picker

File browser for selecting files or directories.

```bash
clappie display push utility/file-picker -d title="Select a file"
clappie display push utility/file-picker -d dir=recall/files -d filter="*.pdf"
```

**Data options:**
- `title` — Heading text
- `dir` — Starting directory (relative to project root)
- `filter` — Glob pattern to filter files (e.g., `*.pdf`, `*.{jpg,png}`)
- `dirsOnly` — Only show directories

**Returns:** `[clappie] FilePicker -> path/to/selected/file.txt`

### file-preview

File content preview (read-only, with syntax awareness).

```bash
clappie display push utility/file-preview -d file=path/to/code.js
```

**Data options:**
- `file` — File path relative to project root (required)

### chart

Horizontal bar charts for terminal display.

```bash
clappie display push utility/chart -d title="Sales" -d data="Jan,120\nFeb,340\nMar,210"
clappie display push utility/chart -d file=path/to/data.csv -d title="Revenue"
```

**Data options:**
- `title` — Chart heading
- `data` — Inline CSV (label,value per line)
- `file` — Load data from CSV file

### table

Tabular data viewer with row navigation.

```bash
clappie display push utility/table -d data="name,age,role\nBob,30,dev\nAlice,25,design"
clappie display push utility/table -d file=path/to/data.csv -d title="Users"
```

**Data options:**
- `title` — Table heading
- `data` — Inline CSV (first line = headers)
- `file` — Load from CSV file

**Keys:** Up/Down to navigate rows, Enter to select row, ESC to close.

**Returns:** Selected row data on Enter.

### markdown

Markdown renderer for terminal display.

```bash
clappie display push utility/markdown -d file=README.md
```

**Data options:**
- `file` — Markdown file path relative to project root

### chore-editor

Specialized editor for chore files. Used by the chores display internally.

```bash
clappie display push utility/chore-editor -d file=chores/humans/email-bob.txt
```

**Data options:**
- `file` — Chore file path relative to project root

## Patterns

All utility displays follow the same conventions:

- **Push with data:** `ctx.push('utility/<name>', { key: value })` or `clappie display push utility/<name> -d key=value`
- **File paths** are always relative to project root
- **ESC** pops without submitting
- **Submit** sends `[clappie] ComponentName -> value` to Claude via tmux
- **Errors** show inline alerts with a Back button
