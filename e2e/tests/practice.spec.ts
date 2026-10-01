import { expect, test } from "@playwright/test";
import { es } from "../../apps/web/src/i18n/es";

const TOPIC = "Tríadas de dórico";

test("003: a full session from Hoy to Historial", async ({ page }) => {
  const created = await page.request.post("/api/topics", {
    data: { title: TOPIC, category: "chords_arpeggios", targetBpm: 90 },
  });
  expect(created.status()).toBe(201);

  await test.step("AC-1: Hoy suggests the warm-up and the topic", async () => {
    await page.goto("/today");
    await expect(page.getByRole("img", { name: es.today.progress(0, 30) })).toBeVisible();
    await expect(page.getByText(TOPIC)).toBeVisible();
    await page.getByRole("button", { name: es.today.start }).click();
  });

  const countdown = page.getByTestId("countdown");
  const title = page.getByTestId("block-title");

  await test.step("AC-5: the practice screen shows the first block", async () => {
    await expect(page).toHaveURL(/\/practice\/[0-9a-f-]+$/);
    await expect(title).toHaveText(es.today.warmUp);
    await expect(countdown).toHaveText(/^0[45]:\d\d$/);
    await expect(page.getByTestId("next-block")).toHaveText(es.practice.next(TOPIC));
  });

  await test.step("AC-6, AC-8: a pause freezes the clock and survives a reload", async () => {
    await page.getByRole("button", { name: es.practice.pause }).click();
    await expect(page.getByText(es.practice.paused)).toBeVisible();
    const frozen = await countdown.textContent();
    await page.waitForTimeout(1500);
    await expect(countdown).toHaveText(frozen ?? "");
    await page.reload();
    await expect(page.getByText(es.practice.paused)).toBeVisible();
    await expect(countdown).toHaveText(frozen ?? "");
    await page.getByRole("button", { name: es.practice.resume }).click();
    await expect(page.getByText(es.practice.paused)).toBeHidden();
  });

  await test.step("AC-11: each block is logged and the next one starts", async () => {
    await page.getByRole("button", { name: es.practice.skip }).click();
    await page.getByRole("dialog").getByRole("button", { name: es.blockLog.save }).click();
    await expect(title).toHaveText(TOPIC);
    await expect(page.getByTestId("bpm-info")).toContainText(es.practice.targetBpm(90));

    await page.getByRole("button", { name: es.practice.skip }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByTestId("bpm-value")).toHaveText("90");
    await sheet.getByRole("button", { name: es.blockLog.rate(4) }).click();
    await sheet.getByRole("button", { name: es.blockLog.save }).click();
  });

  await test.step("AC-13: the summary finishes the session", async () => {
    await expect(page.getByRole("heading", { name: es.summary.title })).toBeVisible();
    await expect(page.getByText(es.summary.bpm(TOPIC, 90))).toBeVisible();
    await page.getByLabel(es.summary.note).fill("Buen día");
    await page.getByRole("button", { name: es.summary.finish }).click();
    await expect(page).toHaveURL(/\/today$/);
  });

  await test.step("AC-18: Historial lists the session under today", async () => {
    await page.goto("/history");
    const day = page.getByTestId("history-day").first();
    await expect(day).toContainText(TOPIC);
  });

  await test.step("the topic page shows the logged BPM", async () => {
    await page.goto("/topics");
    await page.getByRole("link", { name: TOPIC }).first().click();
    const stats = page.getByTestId("topic-stats");
    await expect(stats).toContainText(es.topicPage.currentBpm);
    await expect(stats).toContainText("90");
  });
});
