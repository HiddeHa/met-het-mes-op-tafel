import { expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

interface BankQuestion {
  id: string;
  question: string;
  answers: string[];
}

const BANK = JSON.parse(
  readFileSync(new URL('../src/game/data/questions.json', import.meta.url), 'utf8'),
) as BankQuestion[];
const BY_TEXT = new Map(BANK.map((question) => [question.question, question]));

/**
 * The player-facing correct answer for a question read off the screen. The
 * scripts play the real question bank, so they keep working when it changes.
 */
export function answerFor(questionText: string): string {
  const question = BY_TEXT.get(questionText.trim());
  if (!question) {
    throw new Error(`Question on screen is not in the bank: "${questionText}"`);
  }
  return question.answers[0];
}

export interface StartGameOptions {
  mode: 'solo' | 'duo' | 'local';
  names: string[];
  rounds: number;
  deck?: 'classic' | 'memes';
}

const MODE_LABELS = { solo: 'Solo', duo: 'Duo', local: 'Lokaal' } as const;

export async function startGame(
  page: Page,
  options: StartGameOptions,
): Promise<void> {
  const { mode, names, rounds, deck = 'classic' } = options;

  await page.goto('/');
  await expect(page.locator('.setup-card')).toBeVisible();
  await page.locator('.mode-card').filter({ hasText: MODE_LABELS[mode] }).click();

  const nameInputs = page.locator('.name-grid .name-field input');
  await expect(nameInputs).toHaveCount(names.length);
  for (let index = 0; index < names.length; index++) {
    await nameInputs.nth(index).fill(names[index]);
  }

  await page
    .locator('.deck-switch button')
    .filter({ hasText: deck === 'classic' ? 'Klassiek' : 'Memes' })
    .click();
  await page
    .locator('.segmented')
    .getByRole('button', { name: String(rounds), exact: true })
    .click();

  await page.getByRole('button', { name: /Neem plaats aan tafel/ }).click();
  await expect(page.locator('.stage--answering')).toBeVisible();
}

async function readRoundQuestions(page: Page): Promise<string[]> {
  const cards = page.locator('.qsheet .qcard-text');
  await expect(cards).toHaveCount(4);

  const texts = (await cards.allTextContents()).map((text) => text.trim());
  expect(new Set(texts).size).toBe(4);
  for (const text of texts) {
    expect(BY_TEXT.has(text), `unknown question: ${text}`).toBe(true);
  }
  return texts;
}

/**
 * Locks every sheet of the table. In the local modes this clicks through the
 * pass-the-screen curtain for each human; bots answer on their own timer.
 */
async function lockEverySheet(page: Page, answers: string[]): Promise<void> {
  const deadline = Date.now() + 90_000;
  let filledOne = false;

  while (Date.now() < deadline) {
    if (await page.locator('.stage--answer-reveal').isVisible()) {
      expect(filledOne, 'at least one sheet was filled in through the UI').toBe(true);
      return;
    }

    const curtain = page.getByRole('button', {
      name: 'Ik ben klaar om te antwoorden',
    });
    if (await curtain.isVisible()) {
      await curtain.click();
      continue;
    }

    const inputs = page.locator('.answer-input');
    if (await inputs.first().isVisible()) {
      await expect(inputs).toHaveCount(answers.length);
      for (let index = 0; index < answers.length; index++) {
        await inputs.nth(index).fill(answers[index]);
      }
      await expect(page.locator('.answer-filled')).toContainText(
        `${answers.length} van ${answers.length} ingevuld`,
      );
      await page.getByRole('button', { name: /Briefje op slot/ }).click();
      filledOne = true;
      continue;
    }

    await page.waitForTimeout(120);
  }

  throw new Error('The answering phase never reached the answer reveal.');
}

/**
 * Bids whenever it is a human's turn: call when possible, otherwise raise,
 * otherwise pass. Keeps the human(s) in the hand so the pot is contested.
 */
async function betUntilReveal(page: Page): Promise<void> {
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    if (await page.locator('.stage--reveal').isVisible()) return;

    const controls = page.locator('.bid-controls');
    const call = controls.getByRole('button', { name: /^Meegaan ·/ }).first();
    const raise = controls
      .getByRole('button', { name: /^(Open de inzet|Verhoog) ·/ })
      .first();
    const pass = controls.getByRole('button', { name: 'Pas', exact: true }).first();

    if (await call.isVisible()) {
      await call.click();
      continue;
    }
    if (await raise.isVisible()) {
      await raise.click();
      continue;
    }
    if (await pass.isVisible()) {
      await pass.click();
      continue;
    }

    await page.waitForTimeout(120);
  }

  throw new Error('The betting round never reached the reveal.');
}

export interface RoundResult {
  texts: string[];
  answers: string[];
}

/**
 * Plays one whole round: preview, secret sheets, answer reveal, bidding,
 * reveal. Clicks through to the next round or the shootout.
 */
export async function playRound(
  page: Page,
  options: { round: number; totalRounds: number; name: string },
): Promise<RoundResult> {
  const { round, totalRounds, name } = options;

  await expect(page.locator('.round-pill')).toHaveText(
    `Ronde ${round} / ${totalRounds}`,
  );
  await expect(page.locator('.stage--answering')).toBeVisible();

  const expectedStake = round === 1 ? 10 : round === 2 ? 20 : round === 3 ? 40 : 80;
  await expect(page.locator('.stake-strip strong')).toContainText(
    String(expectedStake),
  );

  const texts = await readRoundQuestions(page);
  const answers = texts.map(answerFor);

  await page.getByRole('button', { name: /deel de briefjes uit/ }).click();
  await lockEverySheet(page, answers);

  await expect(page.locator('.stage--answer-reveal')).toBeVisible();
  const shown = (
    await page
      .locator('.stage--answer-reveal .reveal-q-correct strong')
      .allTextContents()
  ).map((text) => text.trim());
  expect(shown).toEqual(answers);

  await page.getByRole('button', { name: /Naar de inzetronde/ }).click();
  await betUntilReveal(page);

  await expect(page.locator('.stage--reveal')).toBeVisible();
  await expect(page.locator('.stage--reveal h2')).toHaveText('Zo viel het briefje');
  await expect(page.locator('.score-card').filter({ hasText: name })).toContainText(
    '4 van 4 goed',
  );
  await expect(page.locator('.pot-summary')).toHaveClass(/is-won/);
  expect(await page.locator('.score-card.is-winner').count()).toBeGreaterThan(0);

  await page
    .getByRole('button', {
      name: round === totalRounds ? /Door naar de shootout/ : /Volgende ronde/,
    })
    .click();

  return { texts, answers };
}

/**
 * Buzzes, answers correctly from the bank and leaves the shootout result.
 * Handles a bot that beat the human to the buzzer and repeated shootouts.
 */
export async function playShootout(page: Page, name: string): Promise<void> {
  await expect(page.locator('.stage--shootout')).toBeVisible();
  const questionText = (
    (await page.locator('.stage--shootout .qcard-text').first().textContent()) ?? ''
  ).trim();
  const correct = answerFor(questionText);

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await page.locator('.shootout-result').isVisible()) break;

    const input = page.locator('#shootout-input');
    if (await input.isVisible()) {
      await input.fill(correct);
      await page.getByRole('button', { name: 'Antwoord', exact: true }).click();
      continue;
    }

    const buzzer = page.locator('.buzzer').filter({ hasText: name }).first();
    if (await buzzer.isEnabled()) {
      await buzzer.click();
      continue;
    }

    await page.waitForTimeout(100);
  }

  await expect(page.locator('.shootout-result')).toBeVisible();
  await expect(page.locator('.shootout-result')).toContainText(correct);

  await page.getByRole('button', { name: /^Verder/ }).click();
  await page.waitForFunction(
    () =>
      Boolean(document.querySelector('.end')) ||
      Boolean(document.querySelector('.countdown')),
    undefined,
    { timeout: 15_000 },
  );
}

export interface OnlineStartOptions {
  names: [string, string];
  rounds: number;
  deck?: 'classic' | 'memes';
}

/** Hosts a room, joins it from a second browser context, and starts the game. */
export async function startOnlineGame(
  host: Page,
  guest: Page,
  options: OnlineStartOptions,
): Promise<string> {
  const { names, rounds, deck = 'classic' } = options;

  await host.goto('/');
  await expect(host.locator('.setup-card')).toBeVisible();
  await host.locator('.mode-card').filter({ hasText: 'Online' }).click();
  await host.getByRole('textbox', { name: 'Speler' }).fill(names[0]);
  await host
    .locator('.deck-switch button')
    .filter({ hasText: deck === 'classic' ? 'Klassiek' : 'Memes' })
    .click();
  await host
    .locator('.segmented')
    .getByRole('button', { name: String(rounds), exact: true })
    .click();

  await host.getByRole('button', { name: /^Tafel maken/ }).click();
  await expect(host.locator('.room-code')).toBeVisible();
  const code = ((await host.locator('.room-code').textContent()) ?? '').trim();
  expect(code).toMatch(/^[A-Z2-9]{5}$/);

  await guest.goto(`/?room=${code}`);
  await expect(guest.locator('.setup-card')).toBeVisible();
  await guest.getByRole('textbox', { name: 'Speler' }).fill(names[1]);
  await guest.getByRole('button', { name: /^Aan tafel/ }).click();

  await expect(guest.locator('.room-card')).toBeVisible();
  await expect(guest.locator('.room-code')).toHaveText(code);
  await expect(guest.locator('.room-players')).toContainText(names[0]);
  await expect(guest.locator('.room-players')).toContainText(names[1]);

  const start = host.getByRole('button', { name: /Start het spel/ });
  await expect(start).toBeEnabled();
  await start.click();

  await expect(host.locator('.stage--answering')).toBeVisible();
  await expect(guest.locator('.stage--answering')).toBeVisible();
  return code;
}

async function fillOnlineSheet(page: Page, answers: string[]): Promise<void> {
  const inputs = page.locator('.answer-input');
  await expect(inputs).toHaveCount(answers.length);
  for (let index = 0; index < answers.length; index++) {
    await inputs.nth(index).fill(answers[index]);
  }
  await expect(page.locator('.answer-filled')).toContainText(
    `${answers.length} van ${answers.length} ingevuld`,
  );
  await page.getByRole('button', { name: /Briefje op slot/ }).click();
}

async function readRevealedAnswers(page: Page): Promise<string[]> {
  const nodes = page.locator('.stage--answer-reveal .reveal-q-correct strong');
  await expect(nodes).toHaveCount(4);
  return (await nodes.allTextContents()).map((text) => text.trim());
}

async function clickWhenVisible(
  locator: Locator,
  timeout = 3_000,
): Promise<boolean> {
  if (!(await locator.isVisible())) return false;
  try {
    await locator.click({ timeout });
    return true;
  } catch {
    // The server may have moved the round on between the check and the click.
    return false;
  }
}

/** Whichever tab holds the current bid acts; the other one waits. */
async function betOnline(host: Page, guest: Page): Promise<void> {
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    if (await host.locator('.stage--reveal').isVisible()) return;

    let acted = false;
    for (const page of [host, guest]) {
      const controls = page.locator('.bid-controls');
      if (!(await controls.first().isVisible())) continue;

      const buttons = [
        controls.getByRole('button', { name: /^Meegaan ·/ }).first(),
        controls
          .getByRole('button', { name: /^(Open de inzet|Verhoog) ·/ })
          .first(),
        controls.getByRole('button', { name: 'Pas', exact: true }).first(),
      ];

      let target: Locator | null = null;
      for (const button of buttons) {
        if (await button.isVisible()) {
          target = button;
          break;
        }
      }
      if (!target) continue;

      if (await clickWhenVisible(target)) {
        acted = true;
        // The click only reaches the other tab after a server round-trip. Wait
        // for this tab's stage to move on, otherwise the next poll can click
        // a stale bid button that is about to be replaced.
        await page
          .waitForFunction(
            () =>
              !document.querySelector('.bid-controls') ||
              Boolean(document.querySelector('.stage--reveal')),
            undefined,
            { timeout: 5_000 },
          )
          .catch(() => {});
        break;
      }
    }

    if (acted) continue;
    await host.waitForTimeout(120);
  }

  throw new Error('The online betting round never reached the reveal.');
}

/**
 * One online round: both players write their own sheet at the same time, one
 * tab advances the phases, and both tabs must agree on what was revealed.
 */
export async function playOnlineRound(
  host: Page,
  guest: Page,
  options: {
    round: number;
    totalRounds: number;
    guestName: string;
  },
): Promise<{ texts: string[]; answers: string[] }> {
  const { round, totalRounds, guestName } = options;

  await expect(host.locator('.round-pill')).toHaveText(
    `Ronde ${round} / ${totalRounds}`,
  );
  await expect(guest.locator('.round-pill')).toHaveText(
    `Ronde ${round} / ${totalRounds}`,
  );

  const texts = await readRoundQuestions(host);
  await expect(guest.locator('.qsheet .qcard-text')).toHaveText(texts);
  const answers = texts.map(answerFor);

  await host.getByRole('button', { name: /deel de briefjes uit/ }).click();

  await expect(host.locator('.answer-input')).toHaveCount(4);
  await expect(guest.locator('.answer-input')).toHaveCount(4);

  await fillOnlineSheet(host, answers);
  await expect(host.locator('.handoff--waiting')).toContainText(
    `Nog aan het schrijven: ${guestName}`,
  );

  await fillOnlineSheet(guest, answers);

  await expect(host.locator('.stage--answer-reveal')).toBeVisible();
  await expect(guest.locator('.stage--answer-reveal')).toBeVisible();
  expect(await readRevealedAnswers(host)).toEqual(answers);
  expect(await readRevealedAnswers(guest)).toEqual(answers);

  await host.getByRole('button', { name: /Naar de inzetronde/ }).click();
  await betOnline(host, guest);

  await expect(host.locator('.stage--reveal')).toBeVisible();
  await expect(guest.locator('.stage--reveal')).toBeVisible();
  for (const page of [host, guest]) {
    await expect(page.locator('.score-card.is-winner')).toHaveCount(2);
    await expect(page.locator('.pot-summary')).toHaveClass(/is-won/);
  }

  await host
    .getByRole('button', {
      name: round === totalRounds ? /Door naar de shootout/ : /Volgende ronde/,
    })
    .click();

  return { texts, answers };
}

/** The host buzzes first, answers correctly, and both tabs reach the end screen. */
export async function playOnlineShootout(
  host: Page,
  guest: Page,
  hostName: string,
): Promise<void> {
  await expect(host.locator('.stage--shootout')).toBeVisible();
  await expect(guest.locator('.stage--shootout')).toBeVisible();

  const questionText = (
    (await host.locator('.stage--shootout .qcard-text').first().textContent()) ?? ''
  ).trim();
  const correct = answerFor(questionText);
  await expect(guest.locator('.stage--shootout .qcard-text').first()).toHaveText(
    questionText,
  );

  const buzzer = host.locator('.buzzer').filter({ hasText: hostName }).first();
  await expect(buzzer).toBeEnabled({ timeout: 20_000 });
  await buzzer.click();
  await expect(guest.locator('.thinking-panel')).toContainText(
    `${hostName} heeft gebeld`,
  );

  const input = host.locator('#shootout-input');
  await expect(input).toBeVisible();
  await input.fill(correct);
  await host.getByRole('button', { name: 'Antwoord', exact: true }).click();

  await expect(host.locator('.shootout-result')).toBeVisible();
  await expect(guest.locator('.shootout-result')).toBeVisible();
  await expect(host.locator('.shootout-result')).toContainText(correct);
  await expect(guest.locator('.shootout-result')).toContainText(correct);

  await host.getByRole('button', { name: /^Verder/ }).click();
  await expect(host.locator('.end')).toBeVisible();
  await expect(guest.locator('.end')).toBeVisible();
}

export async function assertEndScreen(
  page: Page,
  options: { players?: number } = {},
): Promise<void> {
  const { players = 3 } = options;
  await expect(page.locator('.end')).toBeVisible();
  await expect(page.locator('.end-title')).toBeVisible();
  await expect(page.locator('.leaderboard-row')).toHaveCount(players);
  await expect(page.getByRole('button', { name: /Nog een potje/ })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Terug naar het menu' }),
  ).toBeVisible();

  const banks = await page.locator('.leaderboard-bank').allTextContents();
  const values = banks.map((value) => Number(value.replace(/\D/g, '')));
  expect(values).toHaveLength(players);

  for (let index = 1; index < values.length; index++) {
    expect(values[index - 1]).toBeGreaterThanOrEqual(values[index]);
  }

  // €750 start money per player, plus at most four €100 shootout bonuses.
  const start = 750 * players;
  const total = values.reduce((sum, value) => sum + value, 0);
  expect(total).toBeGreaterThanOrEqual(start);
  expect(total).toBeLessThanOrEqual(start + 400);

  const winners = page.locator('.leaderboard-row.is-winner');
  expect(await winners.count()).toBeGreaterThanOrEqual(1);
  const winnerBank = Number(
    ((await winners.first().locator('.leaderboard-bank').textContent()) ?? '').replace(
      /\D/g,
      '',
    ),
  );
  expect(winnerBank).toBe(values[0]);
}
