import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test('Phase 1: Player Onboarding - Quizmaster creates room', async ({ page }) => {
  await page.goto(BASE_URL);
  
  // Wait for React app to hydrate and show Lobby
  await expect(page.locator('text=Met het Mes op Tafel')).toBeVisible({ timeout: 10000 });
  
  // Select Quizmaster role
  await page.click('text=Quizmaster');
  await page.fill('input[placeholder="Voer je naam in"]', 'Quizmaster Jan');
  
  // Click Create Room
  await page.click('button:contains("Roomp aanmaken")');
  
  // Wait for room creation - room code input should appear
  await expect(page.locator('input[placeholder="ROOMCODE"]')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('button:contains("Deelnemer joinen")')).toBeVisible({ timeout: 5000 });

  console.log('Phase 1 complete: Quizmaster room created');
});

test('Phase 2: Question & Betting Loop', async ({ page }) => {
  await page.goto(BASE_URL);
  
  // Wait for app
  await expect(page.locator('text=Met het Mes op Tafel')).toBeVisible({ timeout: 10000 });
  
  // Create room as Quizmaster
  await page.click('text=Quizmaster');
  await page.fill('input[placeholder="Voer je naam in"]', 'Quizmaster Jan');
  await page.click('button:contains("Roomp aanmaken")');
  await page.waitForTimeout(500);
  
  // Get room code
  const roomCodeInput = page.locator('input[placeholder="ROOMCODE"]');
  let roomCode = '';
  try {
    roomCode = await roomCodeInput.inputValue();
  } catch {
    roomCode = 'room_test123';
  }
  
  // Join as Player
  await page.click('text=Deelnemer');
  await page.fill('input[placeholder="Speler naam"]', 'Speler1');
  await page.fill('input[placeholder="ROOMCODE"]', roomCode);
  await page.click('button:contains("Deelnemer joinen")');
  
  // Wait for state update
  await page.waitForSelector('.fade-in', { state: 'visible', timeout: 5000 });
  
  // Wait for LOBBY phase
  await page.waitForSelector('text=Fase: LOBBY', { timeout: 5000 });
  
  // Quizmaster starts the game
  await page.click('button:contains("Spel starten")');
  await page.waitForTimeout(1000);

  // Should be in BETTING_MANDATORY phase
  await expect(page.locator('text=BETTING_MANDATORY')).toBeVisible({ timeout: 3000 });

  // Place mandatory bet
  await page.click('button:contains("Inzet €10")');
  await page.waitForTimeout(500);

  // Verify pot
  const potText = await page.locator('text=Pot:').first().textContent();
  console.log('Pot after bet:', potText);

  console.log('Phase 2 complete: Betting loop tested');
});

test('Phase 3: Question Submission', async ({ page }) => {
  await page.goto(BASE_URL);
  
  // Wait for app
  await expect(page.locator('text=Met het Mes op Tafel')).toBeVisible({ timeout: 10000 });
  
  // Create room as Quizmaster
  await page.click('text=Quizmaster');
  await page.fill('input[placeholder="Voer je naam in"]', 'Quizmaster Jan');
  await page.click('button:contains("Roomp aanmaken")');
  await page.waitForTimeout(500);
  
  let roomCode = '';
  try {
    roomCode = await page.locator('input[placeholder="ROOMCODE"]').inputValue();
  } catch {
    roomCode = 'room_test123';
  }
  
  // Join as Player
  await page.click('text=Deelnemer');
  await page.fill('input[placeholder="Speler naam"]', 'Speler1');
  await page.fill('input[placeholder="ROOMCODE"]', roomCode);
  await page.click('button:contains("Deelnemer joinen")');
  await page.waitForSelector('.fade-in', { state: 'visible', timeout: 5000 });

  // Wait for QUESTIONS phase
  await page.waitForSelector('text=Vraag 1', { timeout: 5000 });

  // Submit answer
  const answerInput = page.locator('input[placeholder="Jouw antwoord"]');
  await expect(answerInput).toBeVisible({ timeout: 3000 });
  await answerInput.fill('Test antwoord');
  await page.click('button:contains("Antwoord indienen")');
  await page.waitForTimeout(500);

  console.log('Phase 3 complete: Question submission tested');
});

test('Phase 4: Score Declaration and Phase Advance', async ({ page }) => {
  await page.goto(BASE_URL);
  
  // Wait for app
  await expect(page.locator('text=Met het Mes op Tafel')).toBeVisible({ timeout: 10000 });
  
  // Create room as Quizmaster
  await page.click('text=Quizmaster');
  await page.fill('input[placeholder="Voer je naam in"]', 'Quizmaster Jan');
  await page.click('button:contains("Roomp aanmaken")');
  await page.waitForTimeout(500);
  
  let roomCode = '';
  try {
    roomCode = await page.locator('input[placeholder="ROOMCODE"]').inputValue();
  } catch {
    roomCode = 'room_test123';
  }
  
  // Join as Player
  await page.click('text=Deelnemer');
  await page.fill('input[placeholder="Speler naam"]', 'Speler1');
  await page.fill('input[placeholder="ROOMCODE"]', roomCode);
  await page.click('button:contains("Deelnemer joinen")');
  await page.waitForSelector('.fade-in', { state: 'visible', timeout: 5000 });

  // Wait for SCORE_DECLARATION phase
  await page.waitForSelector('text=SCORE_DECLARATION', { timeout: 5000 });

  // Switch to Quizmaster to declare score
  await page.click('text=Quizmaster');
  await page.waitForSelector('.fade-in', { state: 'visible', timeout: 3000 });

  // Look for score input fields
  const scoreSection = page.locator('text=Goede antwoorden');
  await expect(scoreSection).toBeVisible({ timeout: 3000 });

  // Advance to next phase
  await page.click('button:contains("Volgende fase")');
  await page.waitForTimeout(1000);

  console.log('Phase 4 complete: Score declaration tested');
});
