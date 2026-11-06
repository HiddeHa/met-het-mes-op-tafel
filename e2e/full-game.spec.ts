import { expect, test } from '@playwright/test';
import {
  assertEndScreen,
  playOnlineRound,
  playOnlineShootout,
  playRound,
  playShootout,
  startGame,
  startOnlineGame,
} from './game';

test.describe('met het mes op tafel', () => {
  test('solo speelt een complete klassieke avond uit', async ({ page }) => {
    await startGame(page, { mode: 'solo', names: ['Hidde'], rounds: 5 });

    const seen = new Set<string>();
    for (let round = 1; round <= 5; round++) {
      const { texts } = await playRound(page, {
        round,
        totalRounds: 5,
        name: 'Hidde',
      });
      for (const text of texts) seen.add(text);
    }
    expect(seen.size).toBe(20);

    await playShootout(page, 'Hidde');
    while (!(await page.locator('.end').isVisible())) {
      await playShootout(page, 'Hidde');
    }
    await assertEndScreen(page);

    await page.getByRole('button', { name: /Nog een potje/ }).click();
    await expect(page.locator('.round-pill')).toHaveText('Ronde 1 / 5');
    await expect(page.locator('.stage--answering')).toBeVisible();
  });

  test('solo speelt de meme-editie uit', async ({ page }) => {
    await startGame(page, {
      mode: 'solo',
      deck: 'memes',
      names: ['Hidde'],
      rounds: 5,
    });
    await expect(page.locator('.category-pill').first()).toHaveText(
      '4 vragen · Memes',
    );

    for (let round = 1; round <= 5; round++) {
      await playRound(page, { round, totalRounds: 5, name: 'Hidde' });
    }

    await playShootout(page, 'Hidde');
    while (!(await page.locator('.end').isVisible())) {
      await playShootout(page, 'Hidde');
    }
    await assertEndScreen(page);
  });

  test('lokaal speelt drie spelers om de beurt op één scherm', async ({
    page,
  }) => {
    await startGame(page, {
      mode: 'local',
      names: ['Anna', 'Bram', 'Cas'],
      rounds: 5,
    });

    for (let round = 1; round <= 5; round++) {
      await playRound(page, { round, totalRounds: 5, name: 'Anna' });
    }

    await playShootout(page, 'Anna');
    while (!(await page.locator('.end').isVisible())) {
      await playShootout(page, 'Anna');
    }
    await assertEndScreen(page);
    await expect(page.locator('.end-title')).toHaveText('Anna wint');

    await page.getByRole('button', { name: 'Terug naar het menu' }).click();
    await expect(page.locator('.setup-card')).toBeVisible();
  });

  test('online speelt twee spelers samen een complete tafel uit', async ({
    browser,
  }) => {
    const baseURL = test.info().project.use.baseURL as string;
    const hostContext = await browser.newContext({ baseURL });
    const guestContext = await browser.newContext({ baseURL });
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    try {
      const code = await startOnlineGame(host, guest, {
        names: ['Hidde', 'Gast'],
        rounds: 5,
      });
      expect(code).toMatch(/^[A-Z2-9]{5}$/);

      for (let round = 1; round <= 5; round++) {
        await playOnlineRound(host, guest, {
          round,
          totalRounds: 5,
          guestName: 'Gast',
        });
      }

      await playOnlineShootout(host, guest, 'Hidde');
      await assertEndScreen(host, { players: 2 });
      await assertEndScreen(guest, { players: 2 });
      await expect(host.locator('.end-title')).toHaveText('Hidde wint');
      await expect(guest.locator('.end-title')).toHaveText('Hidde wint');
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });
});
