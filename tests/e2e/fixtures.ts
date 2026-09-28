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

  /** Answers the next call to the endpoint with the given JSON body; later calls reach the app. */
  async answerOnce(endpoint: ApiEndpoint, body: unknown): Promise<void> {
    await this.page.route(
      `**/api/${endpoint}`,
      (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
      { times: 1 }
    );
  }

  /** Records the JSON body of every request to the endpoint from now on. */
  requestBodies(endpoint: ApiEndpoint): { all: () => unknown[] } {
    const bodies: unknown[] = [];
    this.page.on('request', (req) => {
      if (req.url().endsWith(`/api/${endpoint}`)) bodies.push(req.postDataJSON());
    });
    return { all: () => bodies };
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
