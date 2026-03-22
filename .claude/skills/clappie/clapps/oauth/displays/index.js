/**
 * OAuth Token Management Display
 *
 * Visual UI for viewing and managing OAuth tokens.
 * Usage: clappie display push oauth
 */

import { View, Button, Divider, Label } from '../../display-engine/ui-kit/index.js';
import { listAllTokens, formatDuration, deleteTokens } from '../lib/tokens.js';
import { listProviders } from '../lib/providers.js';

export const layout = 'centered';
export const maxWidth = 70;

export function create(ctx) {
  ctx.setTitle('OAuth Tokens');

  const view = new View(ctx);
  let tokens = [];
  let selectedIndex = 0;
  let confirmDelete = null;

  function loadTokens() {
    tokens = listAllTokens();
  }

  function getStatusIcon(status) {
    switch (status) {
      case 'valid': return { icon: '●', color: 'green' };
      case 'expiring_soon': return { icon: '●', color: 'yellow' };
      case 'expired': return { icon: '○', color: 'red' };
      case 'refresh_expired': return { icon: '○', color: 'red' };
      default: return { icon: '?', color: 'dim' };
    }
  }

  function getStatusText(status) {
    switch (status) {
      case 'valid': return 'Valid';
      case 'expiring_soon': return 'Expiring soon';
      case 'expired': return 'Expired';
      case 'refresh_expired': return 'Refresh expired';
      default: return 'Unknown';
    }
  }

  function buildView() {
    view.clear();

    if (confirmDelete) {
      // Confirmation dialog
      view.add(Label({ text: '', align: 'center' }));
      view.add(Label({
        text: `Delete tokens for ${confirmDelete.provider}${confirmDelete.account !== 'default' ? ` (${confirmDelete.account})` : ''}?`,
        align: 'center',
        style: 'bold',
      }));
      view.add(Label({ text: '', align: 'center' }));
      view.add(Label({
        text: 'This will require re-authentication.',
        align: 'center',
        color: 'dim',
      }));
      view.add(Label({ text: '', align: 'center' }));
      view.add(Button({
        label: 'Yes, Delete',
        shortcut: 'Y',
        variant: 'ghost',
        onPress: () => {
          deleteTokens(confirmDelete.provider, confirmDelete.account);
          confirmDelete = null;
          loadTokens();
          if (selectedIndex >= tokens.length) {
            selectedIndex = Math.max(0, tokens.length - 1);
          }
          buildView();
          view.render();
        },
      }));
      view.add(Button({
        label: 'Cancel',
        shortcut: 'N',
        onPress: () => {
          confirmDelete = null;
          buildView();
          view.render();
        },
      }));
      return;
    }

    if (tokens.length === 0) {
      view.add(Label({ text: '', align: 'center' }));
      view.add(Label({
        text: 'No OAuth tokens stored',
        align: 'center',
        color: 'dim',
      }));
      view.add(Label({ text: '', align: 'center' }));
      view.add(Label({
        text: 'Run: clappie oauth auth <provider>',
        align: 'center',
        color: 'cyan',
      }));
      view.add(Label({ text: '', align: 'center' }));
      view.add(Label({
        text: 'Providers: ' + listProviders().map(p => p.key).join(', '),
        align: 'center',
        color: 'dim',
      }));
      view.add(Label({ text: '', align: 'center' }));
      view.add(Divider());
      view.add(Button({
        label: 'Refresh List',
        shortcut: 'R',
        onPress: () => {
          loadTokens();
          buildView();
          view.render();
        },
      }));
      return;
    }

    // Header
    const header = 'PROVIDER        ACCOUNT       STATUS          EXPIRES';
    const line = '─'.repeat(header.length);
    view.add(Label({ text: header, color: 'dim' }));
    view.add(Label({ text: line, color: 'dim' }));

    // Token list
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const isSelected = i === selectedIndex;
      const { icon, color } = getStatusIcon(token.status);

      const provider = token.providerName.padEnd(14);
      const account = token.account.padEnd(13);
      const status = getStatusText(token.status).padEnd(15);
      const expires = token.expiresIn !== null ? formatDuration(token.expiresIn) : '—';

      const text = `${icon} ${provider} ${account} ${status} ${expires}`;

      view.add(Label({
        text: isSelected ? `▸ ${text}` : `  ${text}`,
        color: isSelected ? 'white' : color,
        style: isSelected ? 'bold' : undefined,
      }));
    }

    view.add(Label({ text: '' }));
    view.add(Divider());

    // Selected token details
    if (tokens[selectedIndex]) {
      const selected = tokens[selectedIndex];
      view.add(Label({ text: '' }));
      view.add(Label({
        text: `${selected.providerName}${selected.account !== 'default' ? ` (${selected.account})` : ''}`,
        style: 'bold',
      }));

      if (selected.scopes?.length) {
        view.add(Label({
          text: `Scopes: ${selected.scopes.join(', ')}`,
          color: 'dim',
        }));
      }

      if (selected.createdAt) {
        view.add(Label({
          text: `Created: ${new Date(selected.createdAt).toLocaleString()}`,
          color: 'dim',
        }));
      }

      if (selected.lastRefreshedAt) {
        view.add(Label({
          text: `Last refresh: ${new Date(selected.lastRefreshedAt).toLocaleString()}`,
          color: 'dim',
        }));
      }

      if (selected.metadata && Object.keys(selected.metadata).length > 0) {
        for (const [key, value] of Object.entries(selected.metadata)) {
          view.add(Label({
            text: `${key}: ${value}`,
            color: 'dim',
          }));
        }
      }

      if (!selected.hasRefreshToken) {
        view.add(Label({
          text: '⚠ No refresh token',
          color: 'yellow',
        }));
      }
    }

    view.add(Label({ text: '' }));
    view.add(Divider());
    view.add(Label({ text: '' }));

    // Actions
    view.add(Button({
      label: 'Refresh Token',
      shortcut: 'F',
      onPress: async () => {
        if (!tokens[selectedIndex]) return;
        const t = tokens[selectedIndex];
        ctx.submit({
          component: 'OAuth',
          value: `refresh ${t.provider}${t.account !== 'default' ? ` --account ${t.account}` : ''}`,
        });
      },
    }));

    view.add(Button({
      label: 'Re-authenticate',
      shortcut: 'A',
      onPress: () => {
        if (!tokens[selectedIndex]) return;
        const t = tokens[selectedIndex];
        ctx.submit({
          component: 'OAuth',
          value: `auth ${t.provider}${t.account !== 'default' ? ` --account ${t.account}` : ''} --force`,
        });
      },
    }));

    view.add(Button({
      label: 'Delete Token',
      shortcut: 'X',
      variant: 'ghost',
      onPress: () => {
        if (!tokens[selectedIndex]) return;
        confirmDelete = tokens[selectedIndex];
        buildView();
        view.render();
      },
    }));

    view.add(Button({
      label: 'Refresh List',
      shortcut: 'R',
      onPress: () => {
        loadTokens();
        buildView();
        view.render();
      },
    }));
  }

  return {
    init() {
      loadTokens();
      buildView();
      view.render();
    },

    render() {
      view.render();
    },

    onKey(key) {
      // Navigation
      if (key === 'up' || key === 'k') {
        if (selectedIndex > 0) {
          selectedIndex--;
          buildView();
          view.render();
        }
        return true;
      }

      if (key === 'down' || key === 'j') {
        if (selectedIndex < tokens.length - 1) {
          selectedIndex++;
          buildView();
          view.render();
        }
        return true;
      }

      return view.handleKey(key);
    },
  };
}
