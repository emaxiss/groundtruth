import { expect, type Locator, type Page } from '@playwright/test';

export type View = 'chat' | 'triage';

/** The shell: header, health badge, and the view tabs. */
export class AppPage {
  readonly healthBadge: Locator;
  readonly healthModel: Locator;
  readonly healthOffline: Locator;
  readonly apiReachable: Locator;

  constructor(readonly page: Page) {
    this.healthBadge = page.getByTestId('health-badge');
    this.healthModel = page.getByTestId('health-model');
    this.healthOffline = page.getByTestId('health-offline');
    this.apiReachable = this.healthBadge.getByRole('img', { name: 'API reachable' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
    await expect(this.page.getByTestId('app-root')).toBeVisible();
  }

  tab(view: View): Locator {
    return this.page.getByTestId(`tab-${view}`);
  }

  panel(view: View): Locator {
    return this.page.getByRole('tabpanel', { name: view });
  }

  async open(view: View): Promise<void> {
    await this.tab(view).click();
    await expect(this.tab(view)).toHaveAttribute('aria-selected', 'true');
    await expect(this.panel(view)).toBeVisible();
  }
}
