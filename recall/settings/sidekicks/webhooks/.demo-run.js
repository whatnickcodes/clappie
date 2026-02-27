// Demo: Custom webhook with action: 'run'
//
// Full control - your run() function decides what happens.
// Can return { dirty: true }, { sidekick: true }, or { handled: true }.
// Good for: conditional logic, filtering, custom processing.
//
// URL: https://your-host/webhooks/custom/demo-run
// Test: curl -X POST https://your-host/webhooks/custom/demo-run \
//         -H "Content-Type: application/json" \
//         -d '{"priority": "high", "message": "Important stuff"}'

export default {
  name: 'demo-run',
  path: 'demo-run',
  description: 'Demo: custom run() function with full control',

  action: 'run',

  signing: 'none',

  // Your custom handler - full control over what happens
  run: async (payload, ctx) => {
    console.log('[demo-run] Received payload:', JSON.stringify(payload).slice(0, 100));

    // Example: route based on priority
    if (payload.priority === 'high') {
      // Urgent = spawn sidekick
      return {
        sidekick: true,
        directive: 'URGENT webhook received. Notify user immediately via Telegram.',
        content: JSON.stringify(payload, null, 2),
      };
    }

    if (payload.priority === 'low') {
      // Low priority = dump for later
      return {
        dirty: true,
        prefix: 'demo-lowpri',
      };
    }

    // Default: just acknowledge, do nothing
    console.log('[demo-run] Ignoring payload (no priority set)');
    return { handled: true };
  },
};
