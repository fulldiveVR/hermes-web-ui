<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { setApiKey, hasApiKey } from "@/api/client";
import { fetchAuthStatus, requestEmailLoginCode, verifyEmailLoginCode, type EmailLoginTenantChoice } from "@/api/auth";

const { t } = useI18n();
const router = useRouter();

const email = ref("");
const code = ref("");
const emailSessionId = ref("");
const codeSent = ref(false);
const tenantChoices = ref<EmailLoginTenantChoice[]>([]);
const selectedTenantId = ref("");
const loading = ref(false);
const errorMsg = ref("");

// If already has a key, try to go to main page
if (hasApiKey()) {
  router.replace("/hermes/chat");
}

onMounted(async () => {
  try {
    await fetchAuthStatus();
  } catch {
    // Login remains available; the submit request will surface connection errors.
  }
});

async function handleLogin() {
  if (!codeSent.value) {
    await handleEmailCodeRequest();
    return;
  }
  await handleEmailCodeVerify();
}

async function handleEmailCodeRequest() {
  if (!email.value.trim()) {
    errorMsg.value = t("login.emailRequired");
    return;
  }

  loading.value = true;
  errorMsg.value = "";

  try {
    const result = await requestEmailLoginCode(email.value.trim(), emailSessionId.value || undefined);
    emailSessionId.value = result.sessionId;
    codeSent.value = true;
  } catch (err: any) {
    errorMsg.value = err.message || t("login.emailCodeSendFailed");
  } finally {
    loading.value = false;
  }
}

async function handleEmailCodeVerify() {
  if (!emailSessionId.value || !code.value.trim()) {
    errorMsg.value = t("login.codeRequired");
    return;
  }

  loading.value = true;
  errorMsg.value = "";

  try {
    const result = await verifyEmailLoginCode(
      emailSessionId.value,
      code.value.trim(),
      selectedTenantId.value || undefined,
    );
    if (result.requiresTenantSelection) {
      tenantChoices.value = result.tenants || [];
      selectedTenantId.value = tenantChoices.value[0]?.id || "";
      return;
    }
    if (!result.token) {
      errorMsg.value = t("login.invalidCode");
      return;
    }
    setApiKey(result.token);
    if (result.profile) localStorage.setItem("hermes_active_profile_name", result.profile);
    router.replace("/hermes/chat");
  } catch (err: any) {
    errorMsg.value = err.message || t("login.invalidCode");
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-view">
    <div class="login-card">
      <div class="login-logo">
        <img src="/logo.png" alt="Hermes" width="80" height="80" />
      </div>
      <h1 class="login-title">{{ t("login.title") }}</h1>
      <p class="login-desc">{{ t("login.description") }}</p>

      <form class="login-form" @submit.prevent="handleLogin">
        <input
          v-model="email"
          type="email"
          class="login-input"
          :placeholder="t('login.emailPlaceholder')"
          autofocus
          :disabled="codeSent"
        />
        <input
          v-if="codeSent"
          v-model="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          class="login-input"
          :placeholder="t('login.codePlaceholder')"
          @keyup.enter="handleLogin"
        />
        <select v-if="tenantChoices.length > 1" v-model="selectedTenantId" class="login-input">
          <option v-for="tenant in tenantChoices" :key="tenant.id" :value="tenant.id">
            {{ tenant.displayName || tenant.id }}
          </option>
        </select>

        <div v-if="errorMsg" class="login-error">{{ errorMsg }}</div>
        <div v-if="codeSent" class="login-code-hint">
          {{ t("login.codeSent") }}
        </div>
        <button type="submit" class="login-btn" :disabled="loading">
          {{ loading ? "..." : !codeSent ? t("login.sendCode") : t("login.submit") }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "@/styles/variables" as *;

.login-view {
  height: calc(100 * var(--vh));
  display: flex;
  align-items: center;
  justify-content: center;
  background: $bg-primary;
}

.login-card {
  width: 480px;
  max-width: calc(100vw - 32px);
  padding: 56px;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  background: $bg-card;
  text-align: center;

  @media (max-width: $breakpoint-mobile) {
    padding: 32px 24px;
  }
}

.login-logo {
  margin-bottom: 24px;
}

.login-title {
  font-size: 26px;
  font-weight: 600;
  color: $text-primary;
  margin: 0 0 10px;
}

.login-desc {
  font-size: 14px;
  color: $text-muted;
  margin: 0 0 12px;
  line-height: 1.6;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.login-input {
  width: 100%;
  padding: 14px 16px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  font-size: 15px;
  color: $text-primary;
  background: $bg-input;
  outline: none;
  transition: border-color $transition-fast;
  box-sizing: border-box;
  font-family: $font-code;

  &::placeholder {
    color: $text-muted;
  }

  &:focus {
    border-color: $accent-primary;
  }
}

.login-error {
  font-size: 13px;
  color: $error;
  text-align: left;
}

.login-code-hint {
  font-size: 13px;
  color: $text-secondary;
  text-align: left;
}

.login-lock-hint {
  padding: 10px 12px;
  border: 1px solid rgba(var(--warning-rgb), 0.35);
  border-radius: $radius-sm;
  background: rgba(var(--warning-rgb), 0.08);
  color: $text-secondary;
  font-size: 12px;
  line-height: 1.5;
  text-align: left;

  code {
    display: block;
    margin-top: 4px;
    color: $text-primary;
    font-family: $font-code;
    word-break: break-all;
  }
}

.login-btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: $radius-sm;
  background: $text-primary;
  color: var(--text-on-accent);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity $transition-fast;

  &:hover {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
