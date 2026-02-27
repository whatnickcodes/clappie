#!/usr/bin/env bun
// Whisper skill - audio transcription (Whisper) and text-to-speech (OpenAI TTS)
// Commands are humanized: "listen" to transcribe, "say" to speak

export const meta = {
  name: 'whisper',
  description: 'Audio transcription & text-to-speech via OpenAI',
  commands: [
    { cmd: 'listen <file>', desc: 'Transcribe audio to text' },
    { cmd: 'say "text" [-o file]', desc: 'Generate speech from text' },
    { cmd: 'voices', desc: 'List available voices and moods' },
  ],
};

import { parseArgs } from 'util';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

// Derive project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..');

// Audio storage - just dump to recall/files/ with everything else
const FILES_DIR = join(PROJECT_ROOT, 'recall', 'files');

// Load OPENAI_API_KEY from .env if not in environment
function getOpenAIKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;

  const envPaths = [
    join(PROJECT_ROOT, '.env'),
    join(process.env.HOME || '', 'clappie', '.env'),
  ];

  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf-8');
      const match = content.match(/^OPENAI_API_KEY=(.+)$/m);
      if (match) return match[1].trim();
    }
  }
  return null;
}

const OPENAI_API_KEY = getOpenAIKey();

// TTS voices and their vibes
const VOICES = {
  alloy: 'neutral, balanced',
  echo: 'male, warm',
  fable: 'british male, expressive',
  onyx: 'deep male, authoritative',
  nova: 'female, friendly',
  shimmer: 'soft female, gentle'
};

const VOICE_MOODS = {
  excited: ['nova', 'fable', 'alloy'],
  chill: ['shimmer', 'echo', 'alloy'],
  serious: ['onyx', 'echo'],
  playful: ['fable', 'nova', 'alloy'],
  chaotic: ['fable', 'nova'],
  existential: ['shimmer', 'onyx', 'echo'],
  default: ['alloy', 'nova', 'echo']
};

function pickVoice(mood = 'default') {
  const options = VOICE_MOODS[mood] || VOICE_MOODS.default;
  return options[Math.floor(Math.random() * options.length)];
}

async function listen(filePath) {
  if (!OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY not set in environment');
    process.exit(1);
  }

  if (!existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const file = Bun.file(filePath);
  const formData = new FormData();
  formData.append('file', file, basename(filePath));
  formData.append('model', 'whisper-1');

  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`API Error: ${response.status} - ${error}`);
      process.exit(1);
    }

    const result = await response.json();
    console.log(result.text);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

async function say(text, outputPath, options = {}) {
  if (!OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY not set in environment');
    process.exit(1);
  }

  const voice = options.voice || pickVoice(options.mood);
  const speed = options.speed || 1.0;

  // Default to recall/files/ if no path specified
  if (!outputPath) {
    outputPath = join(FILES_DIR, `say-${Date.now()}.opus`);
  }

  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: voice,
        speed: speed,
        response_format: 'opus'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`API Error: ${response.status} - ${error}`);
      process.exit(1);
    }

    const audioBuffer = await response.arrayBuffer();
    writeFileSync(outputPath, Buffer.from(audioBuffer));
    console.log(JSON.stringify({ path: outputPath, voice, duration: 'unknown' }));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

function listVoices() {
  console.log('Available voices:\n');
  for (const [name, description] of Object.entries(VOICES)) {
    console.log(`  ${name}: ${description}`);
  }
  console.log('\nMood-based selection:\n');
  for (const [mood, voices] of Object.entries(VOICE_MOODS)) {
    console.log(`  ${mood}: ${voices.join(', ')}`);
  }
}

// CLI - only run when executed directly
if (import.meta.main) {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'listen': {
      const filePath = args[1];
      if (!filePath) {
        console.error('Usage: whisper listen <audio-file>');
        process.exit(1);
      }
      await listen(filePath);
      break;
    }

    case 'say': {
      const { values, positionals } = parseArgs({
        args: args.slice(1),
        options: {
          output: { type: 'string', short: 'o' },
          voice: { type: 'string', short: 'v' },
          mood: { type: 'string', short: 'm' },
          speed: { type: 'string', short: 's' }
        },
        allowPositionals: true
      });

      const text = positionals.join(' ');
      if (!text) {
        console.error('Usage: whisper say "text to speak" [-o output.opus] [-v voice] [-m mood]');
        process.exit(1);
      }

      await say(text, values.output, {
        voice: values.voice,
        mood: values.mood,
        speed: values.speed ? parseFloat(values.speed) : undefined
      });
      break;
    }

    case 'voices':
      listVoices();
      break;

    default:
      console.log(`Whisper - Audio Transcription & Text-to-Speech

Commands:
  whisper listen <file>              Transcribe audio to text
  whisper say "text" [-o out.opus]   Generate speech from text
  whisper voices                     List available voices

Options for say:
  -o, --output <file>    Output file (default: recall/files/say-<ts>.opus)
  -v, --voice <name>     Specific voice: alloy, echo, fable, onyx, nova, shimmer
  -m, --mood <mood>      Pick by mood: excited, chill, serious, playful, chaotic, existential
  -s, --speed <num>      Speed (0.25 to 4.0, default 1.0)

Examples:
  clappie whisper listen ~/audio.ogg
  clappie whisper say "Hello world"
  clappie whisper say "I'm chaotic" -m chaotic -o /tmp/chaos.opus
`);
  }
}
