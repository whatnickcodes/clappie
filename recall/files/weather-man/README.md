# Weather Man

Hourly heartbeat check that records outside weather and indoor room conditions to a CSV file. The goal is building a dataset to calibrate Sensibo Climate React and other climate automations.

## How It Works

Every hour, the heartbeat spawns a sonnet-model sidekick that:
1. Fetches current weather for Parma (44.7824, 10.3373) from Open-Meteo API
2. Queries Home Assistant for 12 specific indoor entities (temp, humidity, realfeel per room)
3. Appends one row to the CSV log

## Weather API

**Open-Meteo** (https://open-meteo.com) — chosen because:
- No API key required, fully open
- Hourly granularity with 15-minute current data
- Covers Parma area accurately (resolves to lat 44.78, lon 10.34, elev 67m)
- Provides all needed fields: temp, apparent temp, humidity, wind, cloud cover, dew point, pressure, UV, sunshine duration, shortwave radiation, WMO weather codes
- 10,000 requests/day free tier (we use ~24/day)

## Data Schema

### CSV Location

`recall/files/weather-man/weather-log.csv`

Fixed 24-column schema. Header never changes.

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
| `outside_shortwave_radiation_wm2` | Solar radiation hitting surface | W/m² |

### Indoor Room Columns (from Home Assistant)

4 fixed rooms, 3 columns each (12 total):

| Room | Temp Entity | Humidity Entity | Realfeel Entity |
|------|------------|----------------|-----------------|
| andrea | sensor.andrea_temperature | sensor.andrea_humidity | sensor.stanza_andrea_realfeel |
| camera_vecchi | sensor.camera_vecchi_temperature | sensor.camera_vecchi_humidity | sensor.stanza_vecchi_realfeel |
| cucina | sensor.cucina_temperature | sensor.cucina_humidity | sensor.kitchen_realfeel |
| sala | sensor.sala_temperature | sensor.sala_humidity | sensor.living_room_realfeel |

Realfeel values come from HA helper entities that compute Australian Apparent Temperature (Steadman 1994) via the automation `calculate_realfeel_all_rooms`. Weather Man does NOT calculate realfeel itself.

## Error Handling

- Weather API failure: indoor data still recorded, outdoor columns empty
- HA API failure: outdoor data still recorded, indoor columns empty
- Individual sensor unavailable: that field is empty, other fields in the room still recorded
- Both APIs fail: no row appended, error logged to heartbeat log
- All errors logged to `recall/logs/heartbeat/YYYY-MM-DD.txt`

## Configuration

- **Check file:** `chores/bots/weather-man.txt`
- **Interval:** 1 hour
- **Model:** sonnet
- **Disable:** Rename to `.weather-man.txt` (dot-prefix)

## Dependencies

- `curl` — for API calls
- `HA_TOKEN` — environment variable (loaded from `/run/wash/env`)
- Home Assistant accessible at `http://100.116.172.30:8123`
- Open-Meteo API (no auth required)
- HA realfeel helper entities (sensor.stanza_*_realfeel, sensor.kitchen_realfeel, sensor.living_room_realfeel)
