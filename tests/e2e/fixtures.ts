import { test as base, type Page } from '@playwright/test';

import { AppPage } from './pages/app.page';
import { ChatPage } from './pages/chat.page';
import { TriagePage } from './pages/triage.page';

type ApiEndpoint = 'chat' | 'triage' | 'health';

/** Intercepts the app's API from the browser side, for error states no fake model produces. */
export class ApiStub {
  constructor(private readonly page: Page) {}

  /** Makes every call to the endpoint answer with the given status and JSON body. */
  async fail(endpoint: ApiEndpoint, status: number, body: unknown = ''): Promise<void> {
    await this.page.route(`**/api/${endpoint}`, (route) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: typeof body === 'string' ? body : JSON.stringify(body),
      })
    );
  }

  /** Counts requests to the endpoint from now on, for asserting that none were sent. */
  requestsTo(endpoint: ApiEndpoint): { count: () => number } {
    let count = 0;
    this.page.on('request', (req) => {
      if (req.url().endsWith(`/api/${endpoint}`)) count++;
    });
    return { count: () => count };
  }
}

type Fixtures = {
  app: AppPage;
  chat: ChatPage;
  triage: TriagePage;
  api: ApiStub;
};

export const test = base.extend<Fixtures>({
  app: async ({ page }, provide) => {
    await provide(new AppPage(page));
  },
  chat: async ({ page }, provide) => {
    await provide(new ChatPage(page));
  },
  triage: async ({ page }, provide) => {
    await provide(new TriagePage(page));
  },
  api: async ({ page }, provide) => {
    await provide(new ApiStub(page));
  },
});

export { expect } from '@playwright/test';
