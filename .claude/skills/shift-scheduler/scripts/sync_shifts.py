#!/usr/bin/env python3
"""
Reference implementation for shift parsing logic.

Claude should read this file for the SHIFT_TIMES dictionary and SKIP_SHIFTS set
to interpret shift codes. Do not execute or import this script directly — it serves
as a logic reference for the shift-scheduler skill workflow.
"""

from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
import re

# Shift time definitions
SHIFT_TIMES = {
    # Standard shifts
    "SO": ("07:30", "14:30", "Sala Operatoria"),
    "SOP": ("13:30", "20:00", "Sala Operatoria Pomeridiana"),
    "SOP°": ("13:30", "20:00", "Sala Operatoria Pomeridiana (OT)"),
    "CT": ("08:00", "17:00", "Capo Turno TIPO"),
    "U": ("08:00", "15:40", "Università"),
    
    # On-call shifts - Day (8 AM - 8 PM)
    "GAN": ("08:00", "20:00", "Anesthesia On-Call (Day)"),
    "GTN": ("08:00", "20:00", "TIPO On-Call (Day)"),
    "GGN": ("08:00", "20:00", "Gynecology On-Call (Day)"),
    
    # On-call shifts - Night (8 PM - 8 AM next day)
    "GAG": ("20:00", "08:00+1", "Anesthesia On-Call (Night)"),
    "GTG": ("20:00", "08:00+1", "TIPO On-Call (Night)"),
    "GGG": ("20:00", "08:00+1", "Gynecology On-Call (Night)"),
    
    # Other shifts
    "ACC": ("07:30", "14:30", "Accettazione"),
    "AGG": ("07:30", "14:30", "Aggiornamento"),
    "AMB": ("07:30", "14:30", "Ambulatorio"),
    "TA": ("07:30", "14:30", "Terapia Antalgica"),
    "TAP": ("13:30", "20:00", "Terapia Antalgica Pomeridiana"),
    "C": ("08:00", "16:00", "Centrale"),
    "M1": ("07:30", "14:30", "TIPO Mattina"),
    "P1": ("13:30", "20:00", "TIPO Pomeriggio"),
    "P1°": ("13:30", "20:00", "TIPO Pomeriggio (OT)"),
    "MIS": ("07:30", "14:30", "Missione"),
    "RID": ("07:30", "13:00", "Turno Ridotto"),
}

# Shifts to skip (don't create calendar events)
SKIP_SHIFTS = {"X", "A", "RN", "REC", "F", "COL", "Con"}


def parse_shift_code(code: str) -> Optional[str]:
    """
    Parse a shift code, removing degree symbols and cleaning up.
    
    Args:
        code: Raw shift code from spreadsheet
        
    Returns:
        Cleaned shift code or None if should be skipped
    """
    if not code or not code.strip():
        return None
    
    code = code.strip()
    
    # Check if it's a skip code
    if code in SKIP_SHIFTS:
        return None
    
    return code


def get_shift_times(shift_code: str, base_date: datetime) -> Tuple[datetime, datetime, str]:
    """
    Get start and end times for a shift code.
    
    Args:
        shift_code: The shift code (e.g., "SO", "GTN", "SOP°")
        base_date: The date of the shift
        
    Returns:
        Tuple of (start_datetime, end_datetime, description)
    """
    if shift_code not in SHIFT_TIMES:
        # Default to 8-hour shift if unknown
        return (
            base_date.replace(hour=8, minute=0, second=0, microsecond=0),
            base_date.replace(hour=16, minute=0, second=0, microsecond=0),
            f"Unknown Shift ({shift_code})"
        )
    
    start_time_str, end_time_str, description = SHIFT_TIMES[shift_code]
    
    # Parse start time
    start_hour, start_min = map(int, start_time_str.split(":"))
    start_dt = base_date.replace(hour=start_hour, minute=start_min, second=0, microsecond=0)
    
    # Parse end time (handle next-day shifts with +1 notation)
    if "+1" in end_time_str:
        end_time_str = end_time_str.replace("+1", "")
        end_hour, end_min = map(int, end_time_str.split(":"))
        end_dt = (base_date + timedelta(days=1)).replace(hour=end_hour, minute=end_min, second=0, microsecond=0)
    else:
        end_hour, end_min = map(int, end_time_str.split(":"))
        end_dt = base_date.replace(hour=end_hour, minute=end_min, second=0, microsecond=0)
    
    return start_dt, end_dt, description


def parse_schedule_row(row_data: List[str], month: int, year: int) -> List[Dict]:
    """
    Parse a row of shift data into calendar events.
    
    Args:
        row_data: List of shift codes from the spreadsheet row
        month: Month number (1-12)
        year: Year (e.g., 2026)
        
    Returns:
        List of event dictionaries
    """
    events = []
    
    # Skip first column (name) and second column if it exists
    # The shift data starts from the column corresponding to day 1
    shift_start_col = 1  # Column B corresponds to day 1
    
    for day_num, shift_code in enumerate(row_data[shift_start_col:], start=1):
        parsed_code = parse_shift_code(shift_code)
        if not parsed_code:
            continue
        
        try:
            shift_date = datetime(year, month, day_num)
        except ValueError:
            # Invalid date (e.g., day 31 in a 30-day month)
            continue
        
        start_dt, end_dt, description = get_shift_times(parsed_code, shift_date)
        
        events.append({
            "date": shift_date,
            "start": start_dt,
            "end": end_dt,
            "code": parsed_code,
            "description": description
        })
    
    return events


def format_event_for_calendar(event: Dict) -> Dict:
    """
    Format an event dictionary for Google Calendar API.
    
    Args:
        event: Event dictionary with date, start, end, code, description
        
    Returns:
        Dictionary formatted for Calendar API
    """
    # Format times as RFC3339
    start_str = event["start"].strftime("%Y-%m-%dT%H:%M:%S")
    end_str = event["end"].strftime("%Y-%m-%dT%H:%M:%S")
    
    # Use only the shift code as the event title (no description)
    summary = event['code']
    
    return {
        "summary": summary,
        "start_time": start_str,
        "end_time": end_str,
        "timezone": "Europe/Rome"
    }


# Example usage (this would be called by Claude using MCP tools):
"""
1. Search for schedule file:
   Google Workspace MCP:search_drive_files with query "Turni UO YYYY-MM Marco"

2. Get spreadsheet info:
   Google Workspace MCP:get_spreadsheet_info with spreadsheet_id

3. Read the Turni sheet:
   Google Workspace MCP:read_sheet_values with range "Turni!A1:Z150"

4. Find the user's row (search for "Baciarello" in column A)

5. Parse the shifts using parse_schedule_row()

6. For each event, create a calendar event:
   Google Workspace MCP:create_event with formatted event data
"""
