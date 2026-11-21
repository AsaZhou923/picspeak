import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

interface E2EFixture {
  registered_user: {
    access_token: string;
    token_type: string;
    user_id: string;
    plan: 'free' | 'pro';
  };
  gallery_review_id: string;
  gallery_score: number;
  expected_fake_review_score: number;
}

const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PHOTO_PATH = path.join(E2E_DIR, 'fixtures', 'sample-photo.jpg');

function loadFixture(): E2EFixture {
  const fixturePath = process.env.E2E_FIXTURE_FILE;
  if (!fixturePath || !fs.existsSync(fixturePath)) {
    throw new Error(
      `E2E_FIXTURE_FILE is missing or unreadable (${fixturePath ?? 'unset'}). Run scripts/run_e2e_smoke.mjs.`
    );
  }
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as E2EFixture;
}

async function setEnglishLocaleCookie(page: Page, baseURL: string) {
  await page.context().addCookies([
    {
      name: 'picspeak-locale',
      value: 'en',
      url: baseURL,
    },
  ]);
}

async function waitForLoadedImage(page: Page, selector: string) {
  const img = page.locator(selector).first();
  await expect(img).toBeVisible();
  await expect
    .poll(async () =>
      img.evaluate((node) => {
        const image = node as HTMLImageElement;
        return image.complete && image.naturalWidth > 0;
      })
    )
    .toBe(true);
}

test.describe('PicSpeak main flows smoke suite', () => {
  test('guest uploads a photo, sees the waiting page, and lands on the scored critique result', async ({
    page,
    baseURL,
  }) => {
    const fixture = loadFixture();
    await setEnglishLocaleCookie(page, baseURL!);

    await page.goto('/workspace');
    await expect(page.getByRole('heading', { name: /Upload a Photo/i })).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(SAMPLE_PHOTO_PATH);

    const submitButton = page.getByRole('button', { name: /Start Flash Critique/i });
    await expect(submitButton).toBeVisible();
    await submitButton.click();

    await page.waitForURL(/\/tasks\/tsk_/);
    await expect(page.locator('[role="progressbar"]')).toBeVisible();

    await page.waitForURL(/\/reviews\/rev_/);
    const expectedScore = fixture.expected_fake_review_score.toFixed(1);
    await expect(page.getByText(expectedScore, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Clean subject placement/i)).toBeVisible();
    await waitForLoadedImage(page, 'img[alt="Photo being reviewed"]');
  });

  test('guest quota exhaustion displays the sign-in and registration prompt', async ({
    page,
    baseURL,
  }) => {
    await setEnglishLocaleCookie(page, baseURL!);

    await page.goto('/workspace');
    await page.locator('input[type="file"]').setInputFiles(SAMPLE_PHOTO_PATH);
    const submitButton = page.getByRole('button', { name: /Start Flash Critique/i });
    await expect(submitButton).toBeVisible();
    await submitButton.click();

    // Consume the guest daily quota (1/day) end to end.
    await page.waitForURL(/\/reviews\/rev_/);

    await page.goto('/workspace');
    await expect(page.getByText(/Quota exhausted/i).first()).toBeVisible();
    await expect(page.getByText(/Create a Free account or sign in/i).first()).toBeVisible();

    // Re-uploading and attempting another critique triggers the quota modal dialog.
    await page.locator('input[type="file"]').setInputFiles(SAMPLE_PHOTO_PATH);
    await expect(submitButton).toBeVisible();
    await submitButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /Quota exhausted/i })).toBeVisible();
    await expect(dialog.getByText(/Create a Free account or sign in/i)).toBeVisible();
  });

  test('registered user submits image generation, waits, and sees the generated image', async ({
    page,
    baseURL,
  }) => {
    const fixture = loadFixture();
    await setEnglishLocaleCookie(page, baseURL!);

    await page.addInitScript((serializedAuth: string) => {
      window.sessionStorage.setItem('ps_token', serializedAuth);
    }, JSON.stringify(fixture.registered_user));

    await page.goto('/generate');
    const promptInput = page.locator('#generation-prompt');
    await expect(promptInput).toBeVisible();
    await promptInput.fill(
      'Minimalist early-morning street composition with warm side light and clear foreground depth'
    );

    const generateButton = page.getByRole('button', { name: /Generate image/i });
    await expect(generateButton).toBeEnabled();
    await generateButton.click();

    await page.waitForURL(/\/generation-tasks\//);
    await expect(page.locator('[role="progressbar"]')).toBeVisible();

    await page.waitForURL(/\/generations\/gen_/);
    await expect(page.getByRole('heading', { name: /Generation Result/i })).toBeVisible();
    await expect(page.getByText(/Minimalist early-morning street composition/i)).toBeVisible();
    await waitForLoadedImage(page, 'img[alt*="Minimalist early-morning street composition"]');
  });

  test('gallery list loads and opens a seeded public critique page', async ({ page, baseURL }) => {
    const fixture = loadFixture();
    await setEnglishLocaleCookie(page, baseURL!);

    await page.goto('/gallery');
    const seededCard = page.locator(`[data-review-id="${fixture.gallery_review_id}"]`);
    await expect(seededCard).toBeVisible();
    await expect(seededCard).toContainText(fixture.gallery_score.toFixed(1));
    await waitForLoadedImage(page, `[data-review-id="${fixture.gallery_review_id}"] img`);

    await seededCard.getByRole('link', { name: /Open critique/i }).first().click();

    await page.waitForURL(new RegExp(`/gallery/${fixture.gallery_review_id}(?:\\?|$)`));
    await expect(page.getByText(fixture.gallery_score.toFixed(1), { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/layered mountain ridgelines/i)).toBeVisible();
    await waitForLoadedImage(page, 'article figure img');
  });
});
