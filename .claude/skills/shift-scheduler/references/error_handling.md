# Error Handling Procedures

## Spreadsheet Not Found

```
ACTION: Verify file naming pattern "Turni UO YYYY-MM Marco"
FALLBACK: Try broader query "Turni UO [YEAR]"
CHECK: Confirm file exists in user's Google Drive
```

## User Row Not Found

```
ACTION: Search column A for "Baciarello"
CHECK: Verify correct sheet ("Turni", not "Orari")
VERIFY: Check for name variations or typos in spreadsheet
```

## Unknown Shift Codes

```
BEHAVIOR: Defaults to 8-hour shift (08:00-16:00)
REFERENCE: Check scripts/sync_shifts.py SHIFT_TIMES for supported codes
NOTE: Report unknown codes to user for potential config updates
```

## Night Shift Recovery Violation

```
STOP: Do not create calendar events
REPORT: "Safety violation detected: Night shift on [date] followed by
         [invalid_shift] on [next_day]. Post-night-call recovery is required.
         Please verify the shift schedule spreadsheet."
WAIT: For user confirmation or correction
```

## Empty Weekday Detection

```
PROMPT: "No shifts scheduled for [date] ([weekday_name]). This is a
         non-holiday weekday. Is this correct?"
OPTIONS:
  - "Yes, proceed" -> Continue processing
  - "No, check spreadsheet" -> Guide user to verify data
DO NOT: Auto-fill or assume shift codes
```

## Date Parsing Errors

```
BEHAVIOR: Invalid dates (e.g., day 31 in 30-day month) are automatically skipped
VERIFY: Month and year parameters are correct
FALLBACK: Parser handles gracefully via try/except
```
