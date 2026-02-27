// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  CLAPPIE ERRORS - Makes mistakes obvious and actionable                   ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

export function clappieError(component, message, hint) {
  const err = new Error(`[CLAPPIE ${component}] ${message}`);
  if (hint) {
    err.message += `\n\n  HINT: ${hint}`;
  }
  // Also log to make it visible in daemon output
  console.error('\n' + '='.repeat(60));
  console.error(err.message);
  console.error('='.repeat(60) + '\n');
  throw err;
}

export function clappieWarn(component, message) {
  console.warn(`[CLAPPIE ${component}] WARNING: ${message}`);
}
