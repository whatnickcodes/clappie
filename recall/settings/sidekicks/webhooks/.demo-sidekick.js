// Demo: Custom webhook with action: 'sidekick'
//
// Spawns a Claude sidekick with your instructions + the webhook payload.
// Good for: urgent events, things that need AI decision-making, notifications.
//
// URL: https://your-host/webhooks/custom/demo-sidekick
// Test: curl -X POST https://your-host/webhooks/custom/demo-sidekick \
//         -H "Content-Type: application/json" \
//         -d '{"event": "test", "message": "Hello from webhook!"}'

export default {
  name: 'demo-sidekick',
  path: 'demo-sidekick',
  description: 'Demo: spawn Claude sidekick to handle event',

  action: 'sidekick',

  // Instructions for the AI sidekick (payload is appended automatically)
  directive: `You received a test webhook.

Analyze the payload, then:
1. If it looks important, notify me via Telegram
2. If it's just a test, log it and complete the sidekick

Be brief.`,

  signing: 'none',
};
