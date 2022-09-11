
import puppeteer from "puppeteer";

(async () => {

    
let launchArgs = {
    headless: false, defaultViewport: null,
    args: [
        
    ],
}
  const browser = await puppeteer.launch(launchArgs);
  const page = await browser.newPage();
  await page.goto('https://9gag.com');
  page.waitForSelector("[role='dialog'] button:last-child").then(z=>page.click("[role='dialog'] button:last-child"))

})();