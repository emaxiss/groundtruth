import { expect, test } from '../fixtures';

test.describe('shell', () => {
  test('names the model and corpus size when the API is reachable', async ({ app }) => {
    await app.goto();

    await expect(app.healthModel).toHaveText('FAKE_LLM');
    await expect(app.healthBadge).toContainText('12 docs');
    await expect(app.apiReachable).toBeVisible();
    await expect(app.healthOffline).toHaveCount(0);
  });

  test('reports the API as offline when the health check fails', async ({ api, app }) => {
    await api.fail('health', 500);
    await app.goto();

    await expect(app.healthOffline).toHaveText('api offline');
    await expect(app.healthModel).toHaveCount(0);
  });

  test('switches between the chat and triage views', async ({ app, chat }) => {
    await app.goto();
    await expect(app.panel('chat')).toBeVisible();

    await app.open('triage');
    await expect(app.tab('chat')).toHaveAttribute('aria-selected', 'false');

    await app.open('chat');
    await expect(chat.empty).toBeVisible();
  });
});
