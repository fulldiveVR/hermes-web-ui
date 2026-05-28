// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const mockReplace = vi.hoisted(() => vi.fn())
const mockFetchAuthStatus = vi.hoisted(() => vi.fn())
const mockRequestEmailLoginCode = vi.hoisted(() => vi.fn())
const mockVerifyEmailLoginCode = vi.hoisted(() => vi.fn())
const mockSetApiKey = vi.hoisted(() => vi.fn())
const mockHasApiKey = vi.hoisted(() => vi.fn())

vi.mock('vue-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/api/client', () => ({
  setApiKey: mockSetApiKey,
  hasApiKey: mockHasApiKey,
}))

vi.mock('@/api/auth', () => ({
  fetchAuthStatus: mockFetchAuthStatus,
  requestEmailLoginCode: mockRequestEmailLoginCode,
  verifyEmailLoginCode: mockVerifyEmailLoginCode,
}))

import LoginView from '@/views/LoginView.vue'

describe('LoginView email login', () => {
  beforeEach(() => {
    delete (window as any).__LOGIN_TOKEN__
    window.localStorage.clear()
    vi.clearAllMocks()
    mockHasApiKey.mockReturnValue(false)
    mockFetchAuthStatus.mockResolvedValue({ hasPasswordLogin: true, username: 'admin' })
  })

  it('logs in with email code', async () => {
    mockRequestEmailLoginCode.mockResolvedValue({ success: true, sessionId: 'email-session', expiresIn: 600 })
    mockVerifyEmailLoginCode.mockResolvedValue({ token: 'jwt-token', profile: 'tenant-alpha', tenant: 'tenant-alpha' })
    const wrapper = mount(LoginView)

    await wrapper.find('input.login-input').setValue('owner@example.com')
    await wrapper.find('form.login-form').trigger('submit')
    expect(mockRequestEmailLoginCode).toHaveBeenCalledWith('owner@example.com', undefined)

    const inputs = wrapper.findAll('input.login-input')
    await inputs[1].setValue('123456')
    await wrapper.find('form.login-form').trigger('submit')

    expect(mockVerifyEmailLoginCode).toHaveBeenCalledWith('email-session', '123456', undefined)
    expect(mockSetApiKey).toHaveBeenCalledWith('jwt-token')
    expect(window.localStorage.getItem('hermes_active_profile_name')).toBe('tenant-alpha')
    expect(mockReplace).toHaveBeenCalledWith('/hermes/chat')
  })

  it('shows email login by default', () => {
    const wrapper = mount(LoginView)

    expect(wrapper.find('input.login-input').attributes('placeholder')).toBe('login.emailPlaceholder')
    expect(wrapper.text()).not.toContain('login.passwordMode')
  })
})
