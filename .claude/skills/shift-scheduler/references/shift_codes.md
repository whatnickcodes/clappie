# Shift Code Reference

This document describes all shift codes used in the UO 2ª Anestesia e Rianimazione scheduling system.

## Standard Shifts

### SO - Sala Operatoria (Operating Room)
- **Time:** 07:30 - 14:30 (7 hours)
- **Description:** Regular operating room shift
- **Duration (hours):** 6.80

### SOP - Sala Operatoria Pomeridiana (Afternoon Operating Room)
- **Time:** 13:30 - 20:00 (6.5 hours)
- **Description:** Afternoon operating room shift
- **Duration (hours):** 6.50
- **Note:** SOP° indicates overtime pay

### CT - Capo Turno TIPO (ICU Chief)
- **Time:** 08:00 - 17:00 (9 hours)
- **Description:** Chief of Terapia Intensiva Post-Operatoria (Surgical ICU)
- **Duration (hours):** 8.00

### U - Università (University Duties)
- **Time:** 08:00 - 15:40 (7h 40m)
- **Description:** University duties for clinical professors (lectures, exams)
- **Duration (hours):** 6.80
- **Note:** Actual times vary significantly based on academic calendar

## On-Call Shifts (12-hour)

All on-call shifts are 12 hours and follow the pattern: G[Type][Time]
- First letter: G = Guardia (On-call)
- Second letter: A (Anestesia), T (TIPO), G (Ginecologia)
- Third letter: N or G (internal hospital convention — does NOT directly map to English Night/Day)

### Day Shifts (8:00 AM - 8:00 PM)

- **GAN** - Guardia Anestesia Notte (8:00-20:00)
- **GTN** - Guardia TIPO Notte (8:00-20:00)
- **GGN** - Guardia Ginecologia Notte (8:00-20:00)

### Night Shifts (8:00 PM - 8:00 AM next day)

- **GAG** - Guardia Anestesia Giorno (20:00-08:00+1)
- **GTG** - Guardia TIPO Giorno (20:00-08:00+1)
- **GGG** - Guardia Ginecologia Giorno (20:00-08:00+1)

**Duration (hours):** 12.00 for all on-call shifts

## Special Codes

### RN - Recupero Notte (Night Recovery)
- **Description:** Time-off after a night call shift
- **Action:** Skip - do not create calendar event

### REC - Recupero (Recovery)
- **Description:** PTO day after weekend call shifts
- **Action:** Skip - do not create calendar event

### F - Ferie (Vacation)
- **Description:** Scheduled vacation/time off
- **Action:** Skip - do not create calendar event

### X - Weekend/Off
- **Description:** Indicates person requested not to be scheduled
- **Action:** Skip - do not create calendar event

### A - Allattamento (Maternity Leave)
- **Description:** Maternity/breastfeeding leave
- **Action:** Skip - do not create calendar event

### ACC - Accettazione (Acceptance)
- **Time:** 07:30 - 14:30
- **Description:** Acceptance/intake duties
- **Duration (hours):** 6.80

### AGG - Aggiornamento (Training)
- **Time:** 07:30 - 14:30
- **Description:** Continuing education/training
- **Duration (hours):** 6.80

### COL - Collegiale (Collegial)
- **Description:** Collegial activities
- **Duration (hours):** 0.00
- **Action:** Skip - do not create calendar event

### AMB - Ambulatorio (Outpatient)
- **Time:** 07:30 - 14:30
- **Description:** Outpatient clinic
- **Duration (hours):** 6.80

### TA - Terapia Antalgica (Pain Therapy)
- **Time:** 07:30 - 14:30
- **Description:** Pain management duties
- **Duration (hours):** 6.80

### TAP - Terapia Antalgica Pomeridiana (Afternoon Pain Therapy)
- **Time:** 13:30 - 20:00
- **Description:** Afternoon pain management
- **Duration (hours):** 6.50

### C - Centrale (Central)
- **Time:** 08:00 - 16:00
- **Description:** Central duties
- **Duration (hours):** 8.00

### M1, P1 - Morning/Afternoon TIPO
- **Description:** TIPO shifts (specific times vary)
- **Duration (hours):** 6.80 (M1), 6.50 (P1)

### MIS - Missione (Mission/Assignment)
- **Time:** 07:30 - 14:30
- **Description:** Special assignment/mission
- **Duration (hours):** 6.80

### RID - Ridotto (Reduced)
- **Description:** Reduced shift
- **Duration (hours):** 5.45

### Con - Congedo (Leave)
- **Description:** Leave of absence
- **Duration (hours):** 0.00
- **Action:** Skip - do not create calendar event

## Special Notation

### ° (degree symbol)
When appended to a shift code (e.g., SOP°, P1°), indicates the shift is compensated as overtime.
