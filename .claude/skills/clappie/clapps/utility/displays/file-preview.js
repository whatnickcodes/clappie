// Utility: File Preview - The ultimate file preview utility
//
// Usage: clappie display push utility/file-preview -d file=path/to/file.ext
//
// Supports:
// - Text/code files: syntax display with line numbers, scrollable
// - Images: dimensions and metadata
// - PDF: page count and text extraction (if pdftotext available)
// - Video: duration and resolution info
// - Audio: format and duration info
// - Unknown: hex dump preview with file metadata

import { View, Label, Divider, Alert } from '../../display-engine/ui-kit/index.js';
import { colors } from '../../display-engine/theme.js';
import { ansi, visualWidth, stripAnsi, truncateToWidth } from '../../display-engine/layout/ansi.js';
import { readFileSync, statSync, existsSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { execSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

export const maxWidth = 70;

// File type detection by extension
const TEXT_EXTENSIONS = [
  '.txt', '.md', '.markdown',
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp',
  '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
  '.html', '.htm', '.css', '.scss', '.sass', '.less',
  '.sh', '.bash', '.zsh', '.fish',
  '.xml', '.svg',
  '.sql', '.graphql',
  '.env', '.gitignore', '.dockerignore',
  '.vue', '.svelte',
  '.lua', '.php', '.pl', '.pm',
  '.r', '.R', '.rmd',
  '.swift', '.kt', '.kts', '.scala',
  '.zig', '.nim', '.ex', '.exs', '.erl', '.hrl',
  '.clj', '.cljs', '.edn',
  '.ml', '.mli', '.hs', '.lhs',
  '.tf', '.hcl',
  '.makefile', '.make', '.cmake',
  '.dockerfile',
  '.log', '.csv', '.tsv',
];

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.ico', '.tiff', '.tif', '.heic', '.heif'];
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v', '.3gp'];
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma', '.aiff', '.opus'];

// Format bytes to human-readable
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Format date to human-readable
function formatDate(date) {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Detect file type from extension
function detectType(ext) {
  ext = ext.toLowerCase();
  if (TEXT_EXTENSIONS.includes(ext) || ext === '') return 'text';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  if (ext === '.pdf') return 'pdf';
  return 'unknown';
}

// Try to run a command and return output, or null on failure
function tryCommand(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

// Get image info using file command or sips (macOS)
function getImageInfo(fullPath) {
  const info = { width: null, height: null, format: null };

  // Try sips (macOS native)
  const sipsOut = tryCommand(`sips -g pixelWidth -g pixelHeight -g format "${fullPath}" 2>/dev/null`);
  if (sipsOut) {
    const widthMatch = sipsOut.match(/pixelWidth:\s*(\d+)/);
    const heightMatch = sipsOut.match(/pixelHeight:\s*(\d+)/);
    const formatMatch = sipsOut.match(/format:\s*(\w+)/);
    if (widthMatch) info.width = parseInt(widthMatch[1]);
    if (heightMatch) info.height = parseInt(heightMatch[1]);
    if (formatMatch) info.format = formatMatch[1];
  }

  // Fallback to file command
  if (!info.width) {
    const fileOut = tryCommand(`file "${fullPath}"`);
    if (fileOut) {
      // Try to parse dimensions from file output (e.g., "PNG image data, 1920 x 1080")
      const dimMatch = fileOut.match(/(\d+)\s*x\s*(\d+)/);
      if (dimMatch) {
        info.width = parseInt(dimMatch[1]);
        info.height = parseInt(dimMatch[2]);
      }
      // Try to parse format
      const formatPatterns = ['PNG', 'JPEG', 'GIF', 'WebP', 'BMP', 'TIFF'];
      for (const fmt of formatPatterns) {
        if (fileOut.includes(fmt)) {
          info.format = fmt;
          break;
        }
      }
    }
  }

  return info;
}

// Get PDF info
function getPdfInfo(fullPath) {
  const info = { pages: null, text: [] };

  // Try pdfinfo for page count
  const pdfInfoOut = tryCommand(`pdfinfo "${fullPath}" 2>/dev/null`);
  if (pdfInfoOut) {
    const pageMatch = pdfInfoOut.match(/Pages:\s*(\d+)/);
    if (pageMatch) info.pages = parseInt(pageMatch[1]);
  }

  // Try pdftotext for first page content
  const pdfText = tryCommand(`pdftotext -l 1 "${fullPath}" - 2>/dev/null`);
  if (pdfText) {
    info.text = pdfText.split('\n').slice(0, 50);  // First 50 lines
  }

  return info;
}

// Get video/audio info using ffprobe
function getMediaInfo(fullPath) {
  const info = { duration: null, width: null, height: null, codec: null, bitrate: null };

  // Try ffprobe
  const ffprobeOut = tryCommand(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,codec_name,duration -show_entries format=duration,bit_rate -of csv=p=0 "${fullPath}" 2>/dev/null`
  );
  if (ffprobeOut) {
    const lines = ffprobeOut.trim().split('\n');
    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length >= 4 && parts[0]) {
        // Stream info: width,height,codec,duration
        info.width = parseInt(parts[0]) || null;
        info.height = parseInt(parts[1]) || null;
        info.codec = parts[2] || null;
        if (parts[3] && !isNaN(parseFloat(parts[3]))) {
          info.duration = parseFloat(parts[3]);
        }
      } else if (parts.length >= 1) {
        // Format info: duration,bitrate
        if (!info.duration && parts[0] && !isNaN(parseFloat(parts[0]))) {
          info.duration = parseFloat(parts[0]);
        }
        if (parts[1] && !isNaN(parseInt(parts[1]))) {
          info.bitrate = parseInt(parts[1]);
        }
      }
    }
  }

  // Fallback: Try file command for basic info
  if (!info.codec) {
    const fileOut = tryCommand(`file "${fullPath}"`);
    if (fileOut) {
      const codecPatterns = ['H.264', 'H.265', 'HEVC', 'VP8', 'VP9', 'AV1', 'MPEG-4', 'AAC', 'MP3', 'FLAC', 'Vorbis'];
      for (const codec of codecPatterns) {
        if (fileOut.includes(codec)) {
          info.codec = codec;
          break;
        }
      }
    }
  }

  return info;
}

// Format duration as HH:MM:SS or MM:SS
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Get hex dump of first N bytes
function getHexDump(fullPath, bytes = 256) {
  const hexOut = tryCommand(`xxd -l ${bytes} "${fullPath}" 2>/dev/null`);
  if (hexOut) {
    return hexOut.split('\n');
  }

  // Fallback: read binary and format manually
  try {
    const buffer = readFileSync(fullPath);
    const lines = [];
    for (let i = 0; i < Math.min(buffer.length, bytes); i += 16) {
      const hex = [];
      const ascii = [];
      for (let j = 0; j < 16 && i + j < buffer.length; j++) {
        const byte = buffer[i + j];
        hex.push(byte.toString(16).padStart(2, '0'));
        ascii.push(byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.');
      }
      const addr = i.toString(16).padStart(8, '0');
      lines.push(`${addr}: ${hex.join(' ').padEnd(48)}  ${ascii.join('')}`);
    }
    return lines;
  } catch {
    return ['Unable to read binary content'];
  }
}

export function create(ctx) {
  const filePath = ctx.data?.file;
  ctx.setTitle(filePath ? basename(filePath) : 'File Preview');
  ctx.setDescription('Preview file');

  const view = new View(ctx);

  // State
  let error = null;
  let fileType = 'unknown';
  let fileInfo = null;
  let content = [];
  let scrollOffset = 0;
  let totalLines = 0;
  let lineNumberWidth = 4;

  // Load and analyze file
  function loadFile() {
    if (!filePath) {
      error = 'No file specified. Usage: -d file=path/to/file';
      return;
    }

    const fullPath = join(PROJECT_ROOT, filePath);
    if (!existsSync(fullPath)) {
      error = `File not found: ${filePath}`;
      return;
    }

    try {
      const stats = statSync(fullPath);
      const ext = extname(filePath);
      fileType = detectType(ext);

      fileInfo = {
        name: basename(filePath),
        path: filePath,
        size: stats.size,
        modified: stats.mtime,
        extension: ext || '(none)',
        type: fileType,
      };

      // Load content based on type
      switch (fileType) {
        case 'text':
          loadTextFile(fullPath, stats);
          break;
        case 'image':
          loadImageFile(fullPath);
          break;
        case 'pdf':
          loadPdfFile(fullPath);
          break;
        case 'video':
          loadVideoFile(fullPath);
          break;
        case 'audio':
          loadAudioFile(fullPath);
          break;
        default:
          loadUnknownFile(fullPath);
      }
    } catch (err) {
      error = `Error reading file: ${err.message}`;
    }
  }

  function loadTextFile(fullPath, stats) {
    // Check if file is too large (>1MB)
    if (stats.size > 1024 * 1024) {
      content = [`File is ${formatBytes(stats.size)} - showing first 10,000 lines`];
      try {
        const text = readFileSync(fullPath, 'utf8');
        const lines = text.split('\n').slice(0, 10000);
        content = lines;
      } catch {
        content = ['Unable to read text content'];
      }
    } else {
      try {
        const text = readFileSync(fullPath, 'utf8');
        content = text.split('\n');
      } catch {
        content = ['Unable to read text content'];
      }
    }

    totalLines = content.length;
    lineNumberWidth = Math.max(4, String(totalLines).length + 1);
  }

  function loadImageFile(fullPath) {
    const imgInfo = getImageInfo(fullPath);
    content = [];

    if (imgInfo.width && imgInfo.height) {
      content.push(`Dimensions: ${imgInfo.width} x ${imgInfo.height} pixels`);
    }
    if (imgInfo.format) {
      content.push(`Format: ${imgInfo.format}`);
    }

    content.push('');
    content.push('Image preview not available in terminal.');
    content.push('Open the file in an image viewer to see contents.');
  }

  function loadPdfFile(fullPath) {
    const pdfInfo = getPdfInfo(fullPath);
    content = [];

    if (pdfInfo.pages) {
      content.push(`Pages: ${pdfInfo.pages}`);
      content.push('');
    }

    if (pdfInfo.text.length > 0) {
      content.push('--- First page text ---');
      content.push('');
      content = content.concat(pdfInfo.text);
    } else {
      content.push('PDF text extraction not available.');
      content.push('Install poppler (pdftotext) for text preview.');
    }

    totalLines = content.length;
  }

  function loadVideoFile(fullPath) {
    const mediaInfo = getMediaInfo(fullPath);
    content = [];

    if (mediaInfo.width && mediaInfo.height) {
      content.push(`Resolution: ${mediaInfo.width} x ${mediaInfo.height}`);
    }
    if (mediaInfo.duration) {
      content.push(`Duration: ${formatDuration(mediaInfo.duration)}`);
    }
    if (mediaInfo.codec) {
      content.push(`Codec: ${mediaInfo.codec}`);
    }
    if (mediaInfo.bitrate) {
      content.push(`Bitrate: ${formatBytes(mediaInfo.bitrate)}/s`);
    }

    if (content.length === 0) {
      content.push('Video metadata not available.');
      content.push('Install ffprobe for detailed info.');
    }

    content.push('');
    content.push('Video preview not available in terminal.');
  }

  function loadAudioFile(fullPath) {
    const mediaInfo = getMediaInfo(fullPath);
    content = [];

    if (mediaInfo.duration) {
      content.push(`Duration: ${formatDuration(mediaInfo.duration)}`);
    }
    if (mediaInfo.codec) {
      content.push(`Codec: ${mediaInfo.codec}`);
    }
    if (mediaInfo.bitrate) {
      content.push(`Bitrate: ${Math.round(mediaInfo.bitrate / 1000)} kbps`);
    }

    if (content.length === 0) {
      content.push('Audio metadata not available.');
      content.push('Install ffprobe for detailed info.');
    }

    content.push('');
    content.push('Audio preview not available in terminal.');
  }

  function loadUnknownFile(fullPath) {
    content = [];
    content.push('--- Hex dump (first 256 bytes) ---');
    content.push('');
    content = content.concat(getHexDump(fullPath));
    totalLines = content.length;
  }

  function render() {
    const c = colors();
    const fg = (r, g, b) => ansi.fg.rgb(r, g, b);
    const dim = ansi.dim;
    const reset = ansi.reset;
    const contentWidth = Math.min(ctx.width, 70);

    view.clear();

    if (error) {
      view.add(Alert({ variant: 'error', message: error }));
      view.render();
      return;
    }

    // File info header
    const typeLabels = {
      text: 'Text File',
      image: 'Image',
      pdf: 'PDF Document',
      video: 'Video',
      audio: 'Audio',
      unknown: 'Binary File',
    };

    const typeLabel = typeLabels[fileType] || 'File';

    // Lead text - file info as header
    view.add(Label({
      text: `${fg(...c.primary)}${typeLabel}${reset}`,
    }));
    view.add(Label({
      text: `${dim}${formatBytes(fileInfo.size)}  ·  ${fileInfo.extension || 'no extension'}  ·  ${formatDate(fileInfo.modified)}${reset}`,
    }));

    view.space();
    view.add(Divider());
    view.space();

    // Calculate visible area
    const headerLines = 5;  // type label + size line + space + divider + space
    const footerLines = 2;  // space + scroll indicator
    const visibleLines = ctx.height - headerLines - footerLines;

    // Render content based on type
    if (fileType === 'text') {
      // Text with line numbers
      const maxLineNum = Math.min(scrollOffset + visibleLines, totalLines);
      const visible = content.slice(scrollOffset, scrollOffset + visibleLines);

      for (let i = 0; i < visible.length; i++) {
        const lineNum = scrollOffset + i + 1;
        const lineNumStr = String(lineNum).padStart(lineNumberWidth, ' ');
        const lineText = visible[i] || '';

        // Truncate long lines to fit the narrower centered layout
        const maxContentWidth = contentWidth - lineNumberWidth - 3;  // space for "  " separator
        const displayText = truncateToWidth(lineText, maxContentWidth);

        view.add(Label({
          text: `${fg(...c.textMuted)}${lineNumStr}${reset}  ${displayText}`,
        }));
      }

      // Pad if content is shorter than screen
      for (let i = visible.length; i < visibleLines; i++) {
        view.add(Label({ text: '' }));
      }
    } else {
      // Non-text: render content lines directly
      const visible = content.slice(scrollOffset, scrollOffset + visibleLines);
      for (const line of visible) {
        // Truncate to fit centered layout
        const displayText = truncateToWidth(line, contentWidth);
        view.add(Label({ text: displayText, dim: line.startsWith('---') }));
      }

      // Pad if content is shorter than screen
      for (let i = visible.length; i < visibleLines; i++) {
        view.add(Label({ text: '' }));
      }
    }

    // Scroll indicator
    view.space();
    if (totalLines > visibleLines) {
      const scrollPct = totalLines > 0 ? Math.round((scrollOffset / Math.max(1, totalLines - visibleLines)) * 100) : 0;
      const scrollText = `${scrollOffset + 1}-${Math.min(scrollOffset + visibleLines, totalLines)} of ${totalLines}  (${scrollPct}%)`;
      view.add(Label({ text: scrollText, dim: true }));
    } else {
      view.add(Label({ text: `${totalLines} lines`, dim: true }));
    }

    view.render();
  }

  // Scroll handling
  function scrollBy(delta) {
    const visibleLines = ctx.height - 5;
    const maxScroll = Math.max(0, totalLines - visibleLines);
    scrollOffset = Math.max(0, Math.min(maxScroll, scrollOffset + delta));
  }

  return {
    init() {
      loadFile();
      render();
    },
    render,

    onKey(key) {
      const visibleLines = ctx.height - 5;

      switch (key) {
        case 'DOWN':
        case 'j':
          scrollBy(1);
          render();
          return true;
        case 'UP':
        case 'k':
          scrollBy(-1);
          render();
          return true;
        case 'PAGEDOWN':
        case ' ':
          scrollBy(visibleLines - 2);
          render();
          return true;
        case 'PAGEUP':
          scrollBy(-(visibleLines - 2));
          render();
          return true;
        case 'HOME':
        case 'g':
          scrollOffset = 0;
          render();
          return true;
        case 'END':
        case 'G':
          scrollBy(totalLines);
          render();
          return true;
        case 'ESCAPE':
          ctx.pop();
          return true;
      }

      return view.handleKey(key);
    },

    onScroll(direction) {
      scrollBy(direction * 3);
      render();
      return true;
    }
  };
}
