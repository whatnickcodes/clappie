// Demo: Custom webhook with action: 'dirty'
//
// Dumps payload to notifications/dirty/ for batch processing by heartbeat.
// Good for: events that are part of a lifecycle, bulk processing, non-urgent stuff.
//
// URL: https://your-host/webhooks/custom/demo-dirty
// Test: curl -X POST https://your-host/webhooks/custom/demo-dirty -d '{"test": true}'

export default {
  name: 'demo-dirty',
  path: 'demo-dirty',
  description: 'Demo: dump to dirty for batch processing',

  // Action types: 'dirty' | 'sidekick' | 'run'
  action: 'dirty',

  // Prefix for dirty files (creates notifications/dirty/demo-dirty-{timestamp}.json)
  prefix: 'demo-dirty',

  // Signing: 'none' | 'hmac' | '<skill-name>' (reuse skill's verification)
  signing: 'none',
};
