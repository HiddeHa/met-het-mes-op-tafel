import { chromium } from 'playwright';

async function testGame() {
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const context = await browser.newContext();

  // Player 1: Quizmaster
  const page1 = await context.newPage();
  await page1.goto('http://localhost:5173');
  await page1.waitForSelector('h1', { timeout: 10000 });
  console.log('Page 1 loaded:', await page1.title());

  await page1.fill('input[placeholder="Voer je naam in"]', 'Quizmaster');
  await page1.click('button:has-text("Quizmaster")');
  await page1.click('button:has-text("Roomp aanmaken")');
  await page1.waitForTimeout(3000);
  const page1Content = await page1.content();
  console.log('Page 1 after create:', page1Content.includes('Laden') ? 'STILL LOADING' : 'LOADED');
  const h1 = await page1.locator('h1').textContent();
  console.log('Page 1 heading:', h1);

  // Player 2: Deelnemer
  const page2 = await context.newPage();
  await page2.goto('http://localhost:5173');
  await page2.waitForSelector('h1', { timeout: 10000 });
  console.log('Page 2 loaded:', await page2.title());

  await page2.fill('input[placeholder="Voer je naam in"]', 'Deelnemer1');
  await page2.click('button:has-text("Deelnemer")');
  await page2.waitForTimeout(2000);
  console.log('Page 2 content:', await page2.content().slice(0, 300));

  await browser.close();
}

testGame().catch(console.error);
