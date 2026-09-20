import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test('Full Game Test: 4 Players, 7 Rounds', async ({ browser }) => {
  test.setTimeout(180000); // 3 minutes
  const context = await browser.newContext();
  const pages = [];

  // Create 4 pages: 1 Quizmaster + 3 Players
  for (let i = 0; i < 4; i++) {
    const page = await context.newPage();
    pages.push(page);
    await page.goto(BASE_URL);
    await page.waitForSelector('text=Met het Mes op Tafel', { timeout: 10000 });
    console.log(`Page ${i + 1} loaded`);
  }

  // Helper functions
  const fillInput = async (page, text) => {
    await page.locator('input.input-enhanced').fill(text);
  };

  const clickText = async (page, text) => {
    await page.locator(`text=${text}`).click();
  };

  // Player 1: Quizmaster (Page 0)
  const quizmaster = pages[0];
  await fillInput(quizmaster, 'Quizmaster Jan');
  await quizmaster.locator('text=Quizmaster').click();
  await quizmaster.locator('text=Roomp aanmaken').click();
  await quizmaster.waitForTimeout(3000);
  console.log('Quizmaster: Room created');

  // Get room code - look for it in the page text or input
  const roomCode = await quizmaster.evaluate(() => {
    const input = document.querySelector('input[placeholder="ROOMCODE"]') || 
                  document.querySelector('input[placeholder="Roomcode"]') ||
                  document.querySelector('input')?.closest('div')?.textContent?.match(/room_[a-zA-Z0-9_]+/)?.[0] ||
                  'unknown';
    return input;
  });
  console.log('Room code:', roomCode);

  // Players 2-4: Join the room
  for (let i = 1; i < 4; i++) {
    const player = pages[i];
    await fillInput(player, `Deelnemer ${i}`);
    await clickText(player, 'Deelnemer');
    await player.waitForTimeout(500);
    
    // Try to find and fill the room code input
    const hasRoomInput = await player.locator('input[placeholder="ROOMCODE"]').count();
    if (hasRoomInput > 0) {
      await player.locator('input[placeholder="ROOMCODE"]').fill(roomCode);
    }
    
    await clickText(player, 'Deelnemer joinen');
    await player.waitForTimeout(2000);
    console.log(`Player ${i + 1}: Joined room ${roomCode}`);
  }

  // Start the game
  await quizmaster.locator('text=Spel starten').click();
  await quizmaster.waitForSelector('text=BETTING_MANDATORY', { timeout: 5000 });
  console.log('Game started - BETTING_MANDATORY phase');

  // Play 7 rounds
  for (let round = 1; round <= 7; round++) {
    console.log(`\n--- Playing Round ${round} ---`);
    
    // Wait for BETTING_MANDATORY phase
    await quizmaster.waitForSelector('text=BETTING_MANDATORY', { timeout: 5000 });
    console.log('Round', round, ': BETTING_MANDATORY phase');
    
    // All players place mandatory bets
    for (let i = 0; i < 4; i++) {
      const player = pages[i];
      await player.locator('button:has-text("Inzet €10")').click();
      await player.waitForTimeout(500);
    }
    await quizmaster.waitForTimeout(1500);
    console.log('Round', round, ': All mandatory bets placed');
    
    // Wait for BETTING phase
    await quizmaster.waitForSelector('text=BETTING', { timeout: 5000 });
    console.log('Round', round, ': BETTING phase');
    
    // All players place additional bets
    for (let i = 0; i < 4; i++) {
      const player = pages[i];
      await player.locator('button:has-text("Inzet €10")').click();
      await player.waitForTimeout(500);
    }
    await quizmaster.waitForTimeout(1500);
    console.log('Round', round, ': All additional bets placed');
    
    // Wait for QUESTIONS phase
    await quizmaster.waitForSelector('text=Vraag 1', { timeout: 3000 });
    console.log('Round', round, ': QUESTIONS phase');
    
    // All players submit answers
    for (let i = 0; i < 4; i++) {
      const player = pages[i];
      await player.locator('input[placeholder="Jouw antwoord"]').fill('Test antwoord');
      await player.locator('button:has-text("Antwoord indienen")').click();
      await player.waitForTimeout(500);
    }
    await quizmaster.waitForTimeout(2000);
    console.log('Round', round, ': All answers submitted');
    
    // Quizmaster advances phase
    await quizmaster.locator('button:has-text("Volgende fase"), button:has-text("Volgende vraag")').first().click();
    await quizmaster.waitForTimeout(2000);
    console.log('Round', round, ': Quizmaster advanced');
    
    // Wait for ANSWERS_REVEAL phase
    await quizmaster.waitForSelector('text=ANSWERS_REVEAL', { timeout: 3000 });
    console.log('Round', round, ': ANSWERS_REVEAL phase');
    
    // Quizmaster reveals answers
    await quizmaster.locator('button:has-text("Antwoorden tonen"), button:has-text("Antwoorden onthullen")').click();
    await quizmaster.waitForTimeout(1000);
    
    // Wait for SCORE_DECLARATION phase
    await quizmaster.waitForSelector('text=SCORE_DECLARATION', { timeout: 3000 });
    console.log('Round', round, ': SCORE_DECLARATION phase');
    
    // Quizmaster declares scores
    const scoreInputs = quizmaster.locator('input[type="number"]');
    const count = await scoreInputs.count();
    for (let i = 0; i < count; i++) {
      await scoreInputs.nth(i).fill('2');
    }
    await quizmaster.locator('button:has-text("Bevestigen")').click();
    await quizmaster.waitForTimeout(1500);
    console.log('Round', round, ': Scores declared');
    
    // Advance to LAST_RAISE
    await quizmaster.locator('button:has-text("Volgende fase"), button:has-text("Volgende vraag")').first().click();
    await quizmaster.waitForSelector('text=LAST_RAISE', { timeout: 3000 });
    console.log('Round', round, ': LAST_RAISE phase');
    
    // All players place final bets
    for (let i = 0; i < 4; i++) {
      const player = pages[i];
      await player.locator('button:has-text("Inzet €10")').click();
      await player.waitForTimeout(500);
    }
    await quizmaster.waitForTimeout(1500);
    console.log('Round', round, ': Final bets placed');
    
    // Resolve round
    await quizmaster.locator('button:has-text("Ronde afhandelen"), button:has-text("Ronde afronden")').click();
    await quizmaster.waitForTimeout(2000);
    console.log('Round', round, ': Round resolved');
    
    // Check if game is over
    if (round === 7) {
      await quizmaster.waitForSelector('text=GAME_OVER', { timeout: 5000 });
      console.log('✅ Game completed successfully!');
    }
  }

  await context.close();
  console.log('✅ Full game test completed successfully!');
});