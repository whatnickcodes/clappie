# Weather API Investigation — Parma, Italy (CAP 43123)

**Date:** 2026-03-22
**Conclusion:** Open-Meteo is the clear winner.

## Key Findings

**Open-Meteo** is the best free weather API for this use case [1][2]:
- No API key required — fully open access
- 10,000 requests/day free (we need ~24/day)
- Hourly granularity with 15-minute current weather updates
- Resolves Parma coordinates (44.7824, 10.3373) to lat 44.78, lon 10.34, elevation 67m
- All required fields available: temperature, apparent temperature, humidity, wind speed/direction, cloud cover, dew point, surface pressure, UV index, sunshine duration, WMO weather codes
- Timezone-aware responses (Europe/Rome supported natively)
- No rate limiting issues at our volume

**Alternatives evaluated:**

| API | Key Required | Free Tier | Verdict |
|-----|-------------|-----------|---------|
| Open-Meteo | No | 10,000/day | Winner — no auth, all fields, reliable |
| OpenWeatherMap | Yes | 1,000 calls/day | Viable but unnecessary key management [3] |
| WeatherAPI | Yes | 1M calls/month | Good but no sunshine duration data |
| Visual Crossing | Yes | 1,000 records/day | Too restrictive for hourly logging |

## Confidence Assessment

- **High confidence:** Open-Meteo works for Parma with all required fields (verified via live curl test)
- **High confidence:** No API key needed, generous free tier
- **Moderate:** Sunshine duration index accuracy — Open-Meteo provides it per-hour in the hourly forecast, not in current weather; we extract by hour index

## Live Test Results

Tested 2026-03-22 22:45 CET with `curl` against `api.open-meteo.com`:
- Temperature: 7.4C, Apparent: 5.5C, Humidity: 76%
- Wind: 2.3 km/h from 231 deg, Cloud cover: 28%
- Dew point: 3.4C, Pressure: 1007.1 hPa, UV: 0.0
- Weather code: 1 (Mainly clear)
- All fields returned with correct units

---
**Sources**
[1] Open-Meteo API Documentation. *open-meteo.com*. Accessed 2026-03-22. https://open-meteo.com/en/docs
[2] Open-Meteo Forecast API — live test against lat=44.7824, lon=10.3373. Accessed 2026-03-22. https://api.open-meteo.com/v1/forecast?latitude=44.7824&longitude=10.3373&current=temperature_2m
[3] OpenWeatherMap Pricing. *openweathermap.org*. Accessed 2026-03-22. https://openweathermap.org/price
