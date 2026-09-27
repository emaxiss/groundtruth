import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function violations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`
  );
}

test.describe('accessibility (WCAG 2.1 AA)', () => {
  // New content fades in; axe would otherwise sample contrast mid-fade. The
  // app disables its animations under prefers-reduced-motion.
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('chat view with a conversation and a validation message', async ({ app, chat, page }) => {
    await app.goto();
    await chat.ask('What does the Pro plan cost?');
    await expect(chat.lastAnswer).toBeVisible();
    await chat.send.click();
    await expect(chat.validation).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('triage view with field errors', async ({ app, triage, page }) => {
    await app.goto();
    await app.open('triage');
    await triage.submit.click();
    await expect(triage.subjectValidation).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('triage view with a classification', async ({ app, triage, page }) => {
    await app.goto();
    await app.open('triage');
    await triage.classify({ subject: 'Charged twice', body: 'Two identical charges today.' });
    await expect(triage.result).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });

  test('error alert', async ({ api, app, chat, page }) => {
    await api.fail('chat', 502, {
      error: 'The model provider returned an error. Try again.',
      kind: 'upstream',
    });
    await app.goto();
    await chat.ask('What does the Pro plan cost?');
    await expect(chat.error).toBeVisible();

    expect(await violations(page)).toEqual([]);
  });
});
