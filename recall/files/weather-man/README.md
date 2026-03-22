# Weather Man

Hourly heartbeat check that records outside weather and indoor room conditions to a CSV file. The goal is building a dataset to calibrate Sensibo Climate React and other climate automations.

## How It Works

Every hour, the heartbeat spawns a haiku-model sidekick that:
1. Fetches current weather for Parma (44.7824, 10.3373) from Open-Meteo API
2. Queries Home Assistant for all indoor temperature/humidity sensors
3. Calculates Australian Apparent Temperature for each zone
4. Appends one row to the CSV log

## Weather API

**Open-Meteo** (https://open-meteo.com) — chosen because:
- No API key required, fully open
- Hourly granularity with 15-minute current data
- Covers Parma area accurately (resolves to lat 44.78, lon 10.34, elev 67m)
- Provides all needed fields: temp, apparent temp, humidity, wind, cloud cover, dew point, pressure, UV, sunshine duration, WMO weather codes
- 10,000 requests/day free tier (we use ~24/day)
- Alternatives evaluated:
  - OpenWeatherMap: requires API key, free tier limited to 1000 calls/day
  - WeatherAPI: requires API key, free tier 1M calls/month but less granular sunshine data
  - Visual Crossing: requires API key, 1000 records/day free

## Data Schema

### CSV Location

`recall/files/weather-man/weather-log.csv`

### Outside Weather Columns (from Open-Meteo)

| Column | Description | Unit |
|--------|-------------|------|
| `timestamp` | Measurement time | ISO 8601, CET (Europe/Rome) |
| `outside_temp_c` | Air temperature | Celsius |
| `outside_feels_like_c` | Apparent temperature (Open-Meteo model) | Celsius |
| `outside_humidity_pct` | Relative humidity | % |
| `outside_wind_speed_kmh` | Wind speed at 10m | km/h |
| `outside_condition` | Human-readable condition from WMO code | String |
| `outside_sunshine_index` | Sunshine duration ratio for current hour (0-1) | Ratio |
| `outside_cloud_cover_pct` | Cloud cover | % |
| `outside_dewpoint_c` | Dew point temperature | Celsius |
| `outside_pressure_hpa` | Atmospheric surface pressure | hPa |
| `outside_uv_index` | UV index | Index |
| `outside_wind_direction_deg` | Wind direction | Degrees |

### Indoor Room Columns (from Home Assistant)

For each room with both temperature and humidity sensors, three columns are added (sorted alphabetically by room name):

| Column Pattern | Description | Unit |
|---------------|-------------|------|
| `{room}_temp_c` | Room temperature | Celsius |
| `{room}_humidity_pct` | Room relative humidity | % |
| `{room}_realfeel_c` | Australian Apparent Temperature | Celsius |

Rooms are discovered dynamically from HA sensor entity IDs. When new rooms appear or disappear, the old CSV is archived as `weather-log-YYYYMMDD.csv` and a fresh file with updated headers is started.

## Australian Apparent Temperature Formula

Used for indoor "real feel" calculation:

```
AT = Ta + 0.33 * e - 0.70 * ws - 4.00
```

Where:
- `Ta` = dry bulb temperature (C)
- `e` = water vapour pressure (hPa) = `(rh / 100) * 6.105 * exp(17.27 * Ta / (237.7 + Ta))`
- `ws` = wind speed (m/s) — 0.1 for indoor (still air), actual for outdoor
- `rh` = relative humidity (%)

Reference: Steadman, R.G. (1994). "Norms of apparent temperature in Australia." *Australian Meteorological Magazine*, 43, 1-16.

## CSV Rotation

- If a header mismatch is detected (rooms changed), the existing file is renamed to `weather-log-YYYYMMDD.csv` and a new file is started with fresh headers
- Empty values are empty strings (not "null" or "N/A")
- All temperatures rounded to 1 decimal place

## Error Handling

- Weather API failure: indoor data still recorded, outdoor columns empty
- HA API failure: outdoor data still recorded, indoor columns empty
- Both fail: no row appended, error logged to heartbeat log
- All errors logged to `recall/logs/heartbeat/YYYY-MM-DD.txt`

## Configuration

- **Check file:** `chores/bots/weather-man.txt`
- **Interval:** 1 hour
- **Model:** haiku
- **Disable:** Rename to `.weather-man.txt` (dot-prefix)

## Dependencies

- `curl` — for API calls
- `HA_TOKEN` — environment variable (loaded from `/run/wash/env`)
- Home Assistant accessible at `http://100.64.120.3:8123`
- Open-Meteo API (no auth required)
