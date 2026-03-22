---
name: whisper
description: Audio transcription (Whisper) and text-to-speech (OpenAI TTS). Use for processing audio messages or generating voice responses.
---

# Whisper

Listen to audio, say things out loud. Powered by OpenAI's Whisper and TTS.

## Setup

Requires `OPENAI_API_KEY` in your `.env` file.

## Quick Reference

```bash
# Listen to audio (transcribe)
clappie whisper listen /path/to/audio.ogg

# Say something (text-to-speech)
clappie whisper say "Hello world"

# Say with specific output path
clappie whisper say "Hello world" -o recall/files/hello.opus

# Pick voice by mood
clappie whisper say "I'm feeling chaotic" -m chaotic

# Use specific voice
clappie whisper say "Serious business" -v onyx

# List all voices
clappie whisper voices
```

## Storage

Audio files go to `recall/files/` with everything else. Override with `-o` if needed.

## Voices

| Voice   | Vibe                    |
|---------|-------------------------|
| alloy   | Neutral, balanced       |
| echo    | Male, warm              |
| fable   | British male, expressive|
| onyx    | Deep male, authoritative|
| nova    | Female, friendly        |
| shimmer | Soft female, gentle     |

## Mood-Based Selection

When you use `-m mood`, a matching voice is picked:

- **excited**: nova, fable, alloy
- **chill**: shimmer, echo, alloy
- **serious**: onyx, echo
- **playful**: fable, nova, alloy
- **chaotic**: fable, nova
- **existential**: shimmer, onyx, echo

## Integration with Telegram

When receiving voice messages in a sidekick:

```bash
# Listen to what they said
clappie whisper listen recall/files/voice-xxx.ogg

# Say something back
clappie whisper say "Your response here" -m playful
# Output lands in recall/files/say-<timestamp>.opus
clappie sidekick send-file voice recall/files/say-<timestamp>.opus
```

## Notes

- Whisper supports: mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg
- TTS outputs opus format (great for Telegram)
- Speed can be adjusted with `-s` (0.25 to 4.0)
