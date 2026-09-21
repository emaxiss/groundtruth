import { expect, test } from '@playwright/test';

test.describe('health badge', () => {
  test('names the model and corpus size when the API is reachable', async ({ page }) => {
    await page.goto('/');

    const badge = page.getByTestId('health-badge');
    await expect(page.getByTestId('health-model')).toHaveText('FAKE_LLM');
    await expect(badge).toContainText('12 docs');
    await expect(badge.getByRole('img', { name: 'API reachable' })).toBeVisible();
    await expect(page.getByTestId('health-offline')).toHaveCount(0);
  });

  test('reports the API as offline when the health check fails', async ({ page }) => {
    await page.route('**/api/health', (route) => route.fulfill({ status: 500, body: '' }));
    await page.goto('/');

    await expect(page.getByTestId('health-offline')).toHaveText('api offline');
    await expect(page.getByTestId('health-model')).toHaveCount(0);
  });

  test('switches between the chat and triage views', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tabpanel', { name: 'chat' })).toBeVisible();

    await page.getByTestId('tab-triage').click();
    await expect(page.getByRole('tabpanel', { name: 'triage' })).toBeVisible();
    await expect(page.getByTestId('tab-chat')).toHaveAttribute('aria-selected', 'false');

    await page.getByTestId('tab-chat').click();
    await expect(page.getByTestId('chat-empty')).toBeVisible();
  });
});
