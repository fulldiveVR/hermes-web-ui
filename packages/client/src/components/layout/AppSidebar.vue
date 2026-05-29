<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAppStore } from "@/stores/hermes/app";
import ProfileSelector from "./ProfileSelector.vue";
import LanguageSwitch from "./LanguageSwitch.vue";
import ThemeSwitch from "./ThemeSwitch.vue";
import { useSessionSearch } from '@/composables/useSessionSearch'
import { usePersistentRecord } from '@/composables/usePersistentRecord'
import RouteLinkItem from '@/components/common/RouteLinkItem.vue'
import { isStoredSuperAdmin } from "@/api/client";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const { openSessionSearch } = useSessionSearch();
const selectedKey = computed(() => {
  if (route.name === "hermes.session") return "hermes.chat";
  if (route.name === "hermes.historySession") return "hermes.history";
  if (route.name === "hermes.groupChatRoom") return "hermes.groupChat";
  return route.name as string;
});
const isSuperAdmin = computed(() => isStoredSuperAdmin());

function isNavActive(...names: string[]) {
  return names.includes(selectedKey.value);
}
const logoPath = '/logo.png';

const { record: collapsedGroups, persist: persistCollapsedGroups } = usePersistentRecord('hermes.sidebar.collapsedGroups');

type SidebarGroupKey = "Conversation" | "Agent" | "Monitoring" | "System";

function groupLabel(key: SidebarGroupKey) {
  return t(`sidebar.group${key}${appStore.sidebarCollapsed ? "Short" : ""}`);
}

function toggleGroup(key: string) {
  collapsedGroups[key] = !collapsedGroups[key];
  persistCollapsedGroups();
}

function isGroupCollapsed(key: string) {
  return !!collapsedGroups[key];
}


function handleLogout() {
  localStorage.clear();
  router.replace({ name: 'login' });
}

</script>

<template>
  <aside class="sidebar" :class="{ open: appStore.sidebarOpen, collapsed: appStore.sidebarCollapsed }">
    <RouteLinkItem class="sidebar-logo" :to="{ name: 'hermes.chat' }">
      <img :src="logoPath" alt="Hermes" class="logo-img" />
      <span class="logo-text">Hermes</span>
      <!-- <video class="logo-dance" :src="isDark ? danceVideoDark : danceVideoLight" autoplay loop muted playsinline /> -->
    </RouteLinkItem>

    <button class="collapse-btn" @click="appStore.toggleSidebarCollapsed()" :title="appStore.sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline v-if="appStore.sidebarCollapsed" points="9 18 15 12 9 6" />
        <polyline v-else points="15 18 9 12 15 6" />
      </svg>
    </button>

    <nav class="sidebar-nav">
      <!-- Conversation -->
      <div class="nav-group">
        <div class="nav-group-label" @click="toggleGroup('conversation')">
          <span>{{ groupLabel("Conversation") }}</span>
          <svg class="nav-group-arrow" :class="{ collapsed: isGroupCollapsed('conversation') }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <div v-show="!isGroupCollapsed('conversation')" class="nav-group-items">
          <RouteLinkItem class="nav-item" :to="{ name: 'hermes.chat' }" :active="isNavActive('hermes.chat', 'hermes.session')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>{{ t("sidebar.chat") }}</span>
          </RouteLinkItem>
          <RouteLinkItem class="nav-item" :to="{ name: 'hermes.history' }" :active="isNavActive('hermes.history', 'hermes.historySession')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>{{ t("sidebar.history") }}</span>
          </RouteLinkItem>
          <button class="nav-item" @click="openSessionSearch">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span>{{ t("sidebar.search") }}</span>
          </button>
        </div>
      </div>

      <!-- Agent -->
      <div class="nav-group">
        <div class="nav-group-label" @click="toggleGroup('agent')">
          <span>{{ groupLabel("Agent") }}</span>
          <svg class="nav-group-arrow" :class="{ collapsed: isGroupCollapsed('agent') }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <div v-show="!isGroupCollapsed('agent')" class="nav-group-items">
          <RouteLinkItem class="nav-item" :to="{ name: 'hermes.jobs' }" :active="selectedKey === 'hermes.jobs'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>{{ t("sidebar.jobs") }}</span>
          </RouteLinkItem>
          <RouteLinkItem class="nav-item" :to="{ name: 'hermes.skills' }" :active="selectedKey === 'hermes.skills'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
            <span>{{ t("sidebar.skills") }}</span>
          </RouteLinkItem>
          <RouteLinkItem class="nav-item" :to="{ name: 'hermes.files' }" :active="selectedKey === 'hermes.files'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
            <span>{{ t("sidebar.files") }}</span>
          </RouteLinkItem>
          <RouteLinkItem class="nav-item" :to="{ name: 'hermes.memory' }" :active="selectedKey === 'hermes.memory'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 18h6" />
              <path d="M10 22h4" />
              <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
            </svg>
            <span>{{ t("sidebar.memory") }}</span>
          </RouteLinkItem>
        </div>
      </div>

      <!-- System -->
      <div class="nav-group">
        <div class="nav-group-label" @click="toggleGroup('system')">
          <span>{{ groupLabel("System") }}</span>
          <svg class="nav-group-arrow" :class="{ collapsed: isGroupCollapsed('system') }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <div v-show="!isGroupCollapsed('system')" class="nav-group-items">
          <RouteLinkItem v-if="isSuperAdmin" class="nav-item" :to="{ name: 'hermes.profiles' }" :active="selectedKey === 'hermes.profiles'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>{{ t("sidebar.profiles") }}</span>
          </RouteLinkItem>
          <RouteLinkItem class="nav-item" :to="{ name: 'hermes.settings' }" :active="selectedKey === 'hermes.settings'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>{{ t("sidebar.settings") }}</span>
          </RouteLinkItem>
        </div>
      </div>
    </nav>

    <ProfileSelector />

    <div class="sidebar-footer">
      <div class="logout-row">
        <button class="nav-item logout-item" @click="handleLogout">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>{{ t("sidebar.logout") }}</span>
        </button>
        <ThemeSwitch />
      </div>
      <div class="status-row">
        <div
          class="status-indicator"
          :class="{
            connected: appStore.connected,
            disconnected: !appStore.connected,
          }"
        >
          <span class="status-dot"></span>
          <span class="status-text">{{
            appStore.connected
              ? t("sidebar.connected")
              : t("sidebar.disconnected")
          }}</span>
        </div>
        <LanguageSwitch />
      </div>
    </div>
  </aside>
</template>

<style scoped lang="scss">
@use "@/styles/variables" as *;

.sidebar {
  position: relative;
  width: $sidebar-width;
  height: calc(100 * var(--vh));
  background-color: $bg-sidebar;
  border-right: 1px solid $border-color;
  display: flex;
  flex-direction: column;
  padding: 0 12px 20px;
  flex-shrink: 0;
  transition: width $transition-normal;
}

.logo-img {
  width: 28px;
  height: 28px;
  border-radius: 0;
  flex-shrink: 0;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 12px;
  margin: 0 -12px;
  color: $text-primary;
  cursor: pointer;
  background-color: $bg-card;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);

  .dark & {
    background-color: #393939;
  }
  position: relative;
  overflow: hidden;

  .logo-text {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .logo-dance {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    height: 100px;
    border-radius: $radius-md;
    object-fit: contain;
    flex-shrink: 0;
    width: auto;
    pointer-events: none;
  }
}

.sidebar-nav {
  flex: 1;
  display: flex;
  padding-top: 12px;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  min-height: 0;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

:deep(.profile-selector) {
  padding-top: 12px;
  border-top: 1px solid $border-color;
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 2px;

  &.nav-group-bottom {
    margin-top: auto;
    padding-top: 8px;
    border-top: 1px solid $border-color;
  }
}

.nav-group-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-group-label {
  font-size: 10px;
  font-weight: 600;
  color: $text-muted;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  padding: 8px 12px 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
  border-radius: $radius-sm;
  transition: color $transition-fast;

  &:hover {
    color: $text-secondary;
  }

  .nav-group:first-child & {
    padding-top: 0;
  }
}

.nav-group-arrow {
  transition: transform $transition-fast;
  flex-shrink: 0;

  &.collapsed {
    transform: rotate(-90deg);
  }
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: none;
  background: none;
  appearance: none;
  text-decoration: none;
  color: $text-secondary;
  font-size: 14px;
  border-radius: $radius-sm;
  cursor: pointer;
  transition: all $transition-fast;
  width: 100%;
  text-align: left;

  &:hover {
    background-color: rgba(var(--accent-primary-rgb), 0.06);
    color: $text-primary;
  }

  &.active {
    background-color: rgba(var(--accent-primary-rgb), 0.12);
    color: $accent-primary;
  }

}

.sidebar-footer {
  padding-top: 8px;
  border-top: 1px solid $border-color;
}

.logout-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 12px;
}

.logout-item {
  margin: 0;
  padding: 10px 0;
  border-radius: $radius-sm;
  font-size: 13px;
  color: $text-muted;
  flex: 1;

  &:hover {
    color: $error;
    background: transparent;
  }
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  &.connected .status-dot {
    background-color: $success;
    box-shadow: 0 0 6px rgba(var(--success-rgb), 0.5);
  }

  &.disconnected .status-dot {
    background-color: $error;
  }

  .status-text {
    color: $text-secondary;
  }
}

:deep(.theme-switch-container) {
  flex-shrink: 0;
}

// ─── Collapsed sidebar (icon-rail mode) ─────────────────────────

.sidebar.collapsed {
  width: $sidebar-collapsed-width;
  padding: 0 8px 12px;
  overflow: hidden;

  .sidebar-logo {
    padding: 12px 4px 8px;
    margin: 0 -8px;
    justify-content: center;
    gap: 0;

    .logo-text {
      display: none;
    }
  }

  .collapse-btn {
    display: flex;
    margin: 0 auto 8px;
  }

  .nav-group-label {
    justify-content: center;
    gap: 2px;
    padding: 8px 0 4px;
    letter-spacing: 0;

    span {
      max-width: 36px;
      overflow: hidden;
      text-align: center;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .nav-item {
    justify-content: center;
    padding: 10px 4px;
    gap: 0;

    span {
      display: none;
    }

    svg {
      flex-shrink: 0;
    }
  }

  :deep(.profile-selector) {
    display: flex;
    justify-content: center;
    padding: 8px 0;
    margin: 0 0 6px;
    border-top: 1px solid $border-color;
  }

  :deep(.profile-selector .selector-label),
  :deep(.profile-selector .profile-name) {
    display: none;
  }

  :deep(.profile-selector .profile-display) {
    width: 36px;
    height: 36px;
    justify-content: center;
    padding: 0;
    gap: 0;
    border: none;
    border-radius: 0;
    background: transparent;
  }

  :deep(.profile-selector .profile-display:hover) {
    background: transparent;
  }

  :deep(.profile-selector .profile-avatar) {
    width: 28px !important;
    height: 28px !important;
    flex-basis: 28px !important;
  }

  .sidebar-footer {
    .logout-row {
      justify-content: center;
      padding: 0;
    }

    .logout-item {
      flex: 0 0 auto;
      margin: 0;
      padding: 10px 4px;
      border-radius: $radius-sm;
    }

    .logout-item span {
      display: none;
    }

    .status-text {
      display: none;
    }

    .status-row {
      justify-content: center;

      :deep(.input-sm) {
        display: none;
      }
    }

    :deep(.theme-switch-container) {
      flex-direction: column;
    }
  }
}

// ─── Collapse button ────────────────────────────────────────────

.collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  appearance: none;
  text-decoration: none;
  color: $text-muted;
  border-radius: $radius-sm;
  cursor: pointer;
  flex-shrink: 0;
  margin-left: auto;
  margin-right: 0;
  transition: all $transition-fast;

  &:hover {
    color: $text-primary;
    background-color: rgba(var(--accent-primary-rgb), 0.08);
  }
}

// In expanded mode, overlap the top-right of the logo area
.sidebar:not(.collapsed) .collapse-btn {
  position: absolute;
  top: 18px;
  right: 16px;
  z-index: 5;
}

@media (max-width: $breakpoint-mobile) {
  .logo-dance {
    display: none;
  }

  .status-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 1000;
    transform: translateX(-100%);
    transition: transform $transition-normal;

    &.open {
      transform: translateX(0);
    }

    // Override global utility — sidebar is always 240px wide
    .input-sm {
      width: 90px;
    }
  }
}

</style>
