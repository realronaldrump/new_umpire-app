import { expect, test } from '@playwright/test'

test('two isolated devices complete a role-swap series', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const host = await hostContext.newPage()
  const guest = await guestContext.newPage()

  await host.goto('/')
  await host.getByRole('button', { name: '2-PLAYER SERIES' }).click()
  await host.getByLabel('YOUR NAME').fill('Davis')
  await host.getByRole('button', { name: 'CREATE ROOM' }).click()
  await expect(host.getByText('PRIVATE TWO-PLAYER ROOM')).toBeVisible()
  const inviteUrl = host.url()
  expect(inviteUrl).toContain('room=')

  await guest.goto(inviteUrl)
  await guest.getByLabel('YOUR NAME').fill('Alex')
  await guest.getByRole('button', { name: 'JOIN ROOM' }).click()
  await expect(guest.getByText('PRIVATE TWO-PLAYER ROOM')).toBeVisible()
  await expect(host.getByText('Alex')).toBeVisible()

  await guest.getByRole('button', { name: 'READY UP' }).click()
  await host.getByRole('button', { name: 'READY UP' }).click()

  await expect(host.getByText('ROUND 1 / 2')).toBeVisible()
  await expect(guest.getByText('ROUND 1 / 2')).toBeVisible()
  await expect.poll(async () =>
    Number(await host.getByText('ON THE MOUND').count()) + Number(await guest.getByText('ON THE MOUND').count()),
  ).toBe(1)

  await expect(host.getByText('SWITCH SIDES')).toBeVisible({ timeout: 50_000 })
  await expect(guest.getByText('SWITCH SIDES')).toBeVisible({ timeout: 50_000 })
  await guest.getByRole('button', { name: 'READY FOR ROUND TWO' }).click()
  await host.getByRole('button', { name: 'READY FOR ROUND TWO' }).click()

  await expect(host.getByText('FINAL SERIES REPORT')).toBeVisible({ timeout: 50_000 })
  await expect(guest.getByText('FINAL SERIES REPORT')).toBeVisible({ timeout: 50_000 })
  await expect(host.getByText('BEST PITCHER')).toBeVisible()
  await expect(guest.getByText('BEST UMPIRE')).toBeVisible()

  await hostContext.close()
  await guestContext.close()
})

test('multiplayer entry has no horizontal overflow at supported breakpoints', async ({ page }) => {
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 414, height: 896 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await page.getByRole('button', { name: '2-PLAYER SERIES' }).click()
    await expect(page.getByText('PITCHER VS. BLUE')).toBeVisible()
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }))
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport)
  }
})
