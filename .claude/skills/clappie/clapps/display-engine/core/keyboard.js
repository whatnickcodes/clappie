// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  KEYBOARD - Key parsing and keyboard input handling                       ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/**
 * Parse a raw input buffer into a key name.
 * @param {Buffer} buf - Raw input from stdin
 * @returns {string|null} Key name or null if unrecognized
 */
export function parseKey(buf) {
  const code = buf[0];

  // ESC sequences
  if (code === 27 && buf.length >= 3 && buf[1] === 91) {
    // Basic arrow keys: ESC [ A/B/C/D
    if (buf[2] === 65) return 'UP';
    if (buf[2] === 66) return 'DOWN';
    if (buf[2] === 67) return 'RIGHT';
    if (buf[2] === 68) return 'LEFT';

    // Home/End: ESC [ H / ESC [ F
    if (buf[2] === 72) return 'HOME';
    if (buf[2] === 70) return 'END';

    // Delete: ESC [ 3 ~
    if (buf[2] === 51 && buf[3] === 126) return 'DELETE';

    // Home/End alternate: ESC [ 1 ~ / ESC [ 4 ~
    if (buf[2] === 49 && buf[3] === 126) return 'HOME';
    if (buf[2] === 52 && buf[3] === 126) return 'END';

    // Ctrl+arrow keys: ESC [ 1 ; 5 C/D (Ctrl+Right/Left)
    if (buf[2] === 49 && buf[3] === 59 && buf[4] === 53) {
      if (buf[5] === 67) return 'CTRL_RIGHT';
      if (buf[5] === 68) return 'CTRL_LEFT';
    }
  }

  if (code === 27 && buf.length === 1) return 'ESCAPE';
  if (code === 13) return 'ENTER';
  if (code === 127) return 'BACKSPACE';
  if (code === 9) return 'TAB';
  if (code === 3) return 'CTRL_C';

  // Page Up/Down: ESC [ 5 ~ / ESC [ 6 ~
  if (code === 27 && buf.length >= 4 && buf[1] === 91) {
    if (buf[2] === 53 && buf[3] === 126) return 'PAGEUP';
    if (buf[2] === 54 && buf[3] === 126) return 'PAGEDOWN';
  }

  // Ctrl+key codes (1-26 map to Ctrl+A through Ctrl+Z)
  if (code === 1) return 'CTRL_A';
  if (code === 5) return 'CTRL_E';
  if (code === 25) return 'CTRL_Y';  // Redo
  if (code === 26) return 'CTRL_Z';  // Undo

  if (code >= 32 && code < 127) return String.fromCharCode(code);

  return null;
}
