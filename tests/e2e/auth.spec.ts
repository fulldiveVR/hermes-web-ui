import { expect, test } from '@playwright/test'
import { mockHermesApi, TEST_ACCESS_KEY } from './fixtures'

test('redirects protected routes to the login screen without a token', async ({ page }) => {
  const api = await mockHermesApi(page)

  await page.goto('/#/hermes/jobs')

  await expect(page).toHaveURL(/#\/$/)
  await expect(page.getByRole('heading', { name: 'Hermes Web UI' })).toBeVisible()
  await expect(page.getByPlaceholder('Email')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Password' })).toHaveCount(0)
  expect(api.unexpectedRequests).toEqual([])
})

test('rejects invalid email code without persisting a token', async ({ page }) => {
  const api = await mockHermesApi(page, { tokenValidationStatus: 401 })

  await page.goto('/')
  await page.getByPlaceholder('Email').fill('owner@example.com')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByPlaceholder('Verification code').fill('000000')
  await page.getByRole('button', { name: 'Login' }).click()

  await expect(page.getByText('Verification code is invalid or expired')).toBeVisible()
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.evaluate(() => window.localStorage.getItem('hermes_api_key'))).resolves.toBeNull()
  expect(api.unexpectedRequests).toEqual([])
})

test('logs in with email code through the BFF before entering the app', async ({ page }) => {
  const api = await mockHermesApi(page)

  await page.goto('/')
  await page.getByPlaceholder('Email').fill('owner@example.com')
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByPlaceholder('Verification code').fill('123456')
  await page.getByRole('button', { name: 'Login' }).click()

  await expect(page).toHaveURL(/#\/hermes\/chat$/)
  await expect(page.evaluate(() => window.localStorage.getItem('hermes_api_key'))).resolves.toBe(TEST_ACCESS_KEY)

  const requestCode = api.requests.find((request) => request.pathname === '/api/auth/email/request')
  expect(requestCode?.method).toBe('POST')
  expect(requestCode?.postData).toBe(JSON.stringify({ email: 'owner@example.com' }))

  const verifyCode = api.requests.find((request) => request.pathname === '/api/auth/email/verify')
  expect(verifyCode?.method).toBe('POST')
  expect(verifyCode?.postData).toBe(JSON.stringify({ sessionId: 'playwright-email-session', code: '123456' }))
  expect(api.unexpectedRequests).toEqual([])
})
