---
name: shift-scheduler
description: Synchronizes anesthesiology shift schedules from Google Sheets (UO 2a Anestesia e Rianimazione format) to Google Calendar. Handles shift code parsing, overnight shifts, night-shift recovery validation, and duplicate event prevention. Works with Google Workspace MCP for Drive, Sheets, and Calendar operations.
allowed-tools: Read, Grep, Bash(python3 *)
context: fork
---

# Shift Scheduler

## Core Workflow

Follow this sequential process to sync shifts from spreadsheet to calendar:

### 1. Locate the Schedule File

Search Google Drive for the monthly shift schedule:

```
Tool: Google Workspace MCP:search_drive_files
Query: "Turni UO [YEAR]-[MONTH] Marco"  # Use current year
User: marco.baciarello@gmail.com
```

**File naming pattern:** `Turni UO YYYY-MM Marco`

### 2. Read the Spreadsheet

Get spreadsheet structure and read the Turni sheet:

```
Tool: Google Workspace MCP:get_spreadsheet_info
Then: Google Workspace MCP:read_sheet_values
Range: "Turni!A1:Z150"
```

**Spreadsheet structure:**
- Row 1: Title header
- Row 2: Day numbers (1-31)
- Row 3: Day names (lun, mar, mer, gio, ven, sab, dom)
- Row 4+: Staff names in column A, shift codes in columns B onward

**Visual formatting notes:**
- Darker grey background = weekends (Saturday/Sunday) or Italian public holidays
- These grey-marked days indicate non-working days (empty shifts are expected)

### 3. Find and Extract User's Row

**Search column A for "Baciarello"** to locate the user's shift row.

**IMPORTANT:** Some staff have TWO consecutive rows:
- Main row: Primary shift codes
- Secondary row (directly below): Additional modifiers (e.g., SOP°, RN)

**Extract BOTH rows** when present to capture all shift information.

### 4. Parse Shifts Using Reference Logic

READ `scripts/sync_shifts.py` for the parsing logic. Apply its `SHIFT_TIMES` dictionary and `SKIP_SHIFTS` set to interpret shift codes. Do NOT attempt to execute or import the script directly.

**When parsing, handle:**
- Skip non-working codes: X, A, RN, REC, F, COL, Con (authoritative list in `scripts/sync_shifts.py`)
- Consecutive shifts on the same day (e.g., SO followed by SOP°)
- Correct start/end times for each shift type (see `SHIFT_TIMES` dict)
- Overnight shifts ending next day (codes with `+1` end time)

### 5. Validate Schedule Compliance

**Before creating calendar events, perform these validation checks:**

#### Night Shift Recovery Rule (CRITICAL SAFETY)

Night shifts (GAG, GTG, GGG) run 8 PM to 8 AM and **MUST** be followed by recovery:

```
IF shift_code in ["GAG", "GTG", "GGG"]:
    next_day = current_date + 1 day
    expected_recovery = RN or empty/holiday

    IF next_day shows ANY shift starting at/after 8 AM:
        STOP and report: "Safety violation: Night shift on [date]
        not followed by recovery. Found [shift_code] scheduled
        for [next_day]. This violates post-night-call rest requirements."
```

**This is a compliance rule - NEVER proceed if violated. Ask user to verify spreadsheet.**

#### Empty Weekday Detection

Empty weekdays MAY indicate data errors:

```
IF day_of_week in [Monday-Friday] AND shift_code is empty:
    IF background_color is NOT dark_grey:
        PROMPT user: "I found no shifts scheduled for [date] ([day_name]),
        which is a weekday. Is this correct, or should I check the
        spreadsheet for missing data?"

        WAIT for user confirmation before proceeding
```

**DO NOT auto-fill or "fix" empty days. Wait for explicit user instruction.**

#### Weekend and Holiday Gaps (EXPECTED)

Empty shifts on weekends and holidays are **normal and intentional**:

```
IF day_of_week in [Saturday, Sunday] OR background_color is dark_grey:
    Empty shifts are EXPECTED - do not flag, do not fill, do not prompt
```

**These gaps represent scheduled time off. NEVER attempt to populate them.**

### 6. Check for Duplicate Events

Before creating events, query existing calendar entries for the target month:

```
Tool: Google Workspace MCP:list_events
Time range: First day to last day of target month
User: marco.baciarello@gmail.com
```

**Detect duplicates** by matching date + shift code (event summary). If duplicates exist, offer the user a choice:
- **Skip duplicates** — only create events for dates without existing matches
- **Delete and recreate** — remove existing shift events for the month, then create fresh
- **Abort** — stop and let the user review manually

**WAIT for user selection before proceeding.**

### 7. Create Calendar Events

For each validated event, create a Google Calendar entry:

```
Tool: Google Workspace MCP:create_event
Parameters from format_event_for_calendar():
  summary: "[SHIFT_CODE]"  # e.g., "SO", "GTN", "U"
  start_time: RFC3339 formatted start time
  end_time: RFC3339 formatted end time
  timezone: "Europe/Rome"
  user_google_email: marco.baciarello@gmail.com
```

**Event title format:** Use ONLY the shift code abbreviation (e.g., "GAG", not "Anesthesia Night On-Call")

### 8. Handle Multiple Shifts per Day

When a day has multiple shift codes (e.g., "SO" followed by "SOP°"), create **separate consecutive calendar events**.

The secondary row below the staff member's name typically contains additional shifts like SOP° modifiers.

## Shift Code Reference

See `references/shift_codes.md` for complete definitions and `scripts/sync_shifts.py` for authoritative timing.

**Skip codes (no calendar event):** X, A, RN, REC, F, COL, Con

**Unknown shift codes** default to 8-hour shifts (08:00-16:00).

## Scheduling Rules

### Night Shift Recovery Protocol

**MANDATORY:** Night shifts (GAG, GTG, GGG) sign off at 8 AM and MUST be followed by:
- **RN** (recovery code) starting at 8 AM, OR
- **Empty day** (day off starting at 8 AM)

**Calendar sync validation:**
- If RN is present, NO other shift should exist after 8 AM sign-off
- If next day has ANY shift starting at/after 8 AM, this is a SAFETY VIOLATION
- Prompt user immediately - do not auto-create events

**Rationale:** Post-call rest requirements and patient safety regulations

### Weekend and Holiday Scheduling

**Italian public holidays and weekends (Sat/Sun) are NON-WORKING days:**
- Empty shifts on these days are **intentional and expected**
- Darker grey background in spreadsheet = holiday/weekend
- NEVER flag these as errors or attempt to populate them

**Weekday gaps require validation:**
- Empty Monday-Friday (non-grey) = potential data error
- Always prompt user before proceeding
- Do not assume vacation or other codes

### Visual Cues in Spreadsheet

**Background colors:**
- **Normal (white/light):** Working days
- **Darker grey:** Weekends and Italian public holidays

Use visual formatting as secondary validation for schedule completeness.

## Error Handling

**Critical behaviors:**
- **Night shift recovery violation:** STOP, report violation, WAIT for user confirmation
- **Empty weekday (non-holiday):** PROMPT user, WAIT for confirmation — never auto-fill
- **Unknown shift code:** Default to 08:00-16:00, report to user
- **Spreadsheet not found:** Try broader query "Turni UO [YEAR]"
- **Invalid dates:** Automatically skipped (e.g., day 31 in 30-day month)

**Full procedures:** See `references/error_handling.md`

## Technical Notes

- Spreadsheet has two sheets: **"Turni"** (schedule) and **"Orari"** (timing reference)
- Secondary rows contain modifiers: SOP°, RN indicators
- `°` symbol = overtime pay (no timing change)
- On-call pattern: G[Type][Time] where Type=A/T/G, Time=N/G
- TIPO = Terapia Intensiva Post-Operatoria (Surgical ICU)

## Resources

### scripts/sync_shifts.py

Reference implementation for shift parsing. Contains `SHIFT_TIMES` (code-to-timing map), `SKIP_SHIFTS` (non-working codes), and helper functions for parsing rows and formatting calendar events. Read for logic reference, do not execute directly.

### references/shift_codes.md

Complete shift code definitions: timing, descriptions, durations, and special handling notes.

### references/error_handling.md

Detailed error handling procedures for all failure scenarios.
