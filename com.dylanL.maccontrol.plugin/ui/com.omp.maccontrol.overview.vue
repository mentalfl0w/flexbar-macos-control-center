<template>
  <v-app :theme="currentTheme">
    <v-main>
      <div class="toolbar">
        <v-app-bar flat color="transparent" height="56">
          <v-btn icon="mdi-chevron-left" variant="text" @click="goBack" />
          <v-app-bar-title>
            <span class="toolbar-title">Overview</span>
          </v-app-bar-title>
        </v-app-bar>
      </div>

      <v-container class="pa-4" max-width="640">
        <!-- Description card -->
        <v-card class="card mb-4" rounded="xl" variant="flat">
          <v-card-text>
            <div class="text-h6 mb-2">System Overview Dashboard</div>
            <p class="text-body-2 text-secondary mb-3">
              The Overview key displays a real-time system dashboard on your Flexbar device,
              showing CPU usage (ring gauge), memory (progress bar), network throughput,
              disk usage, and power/battery status — all in a single 720px wide canvas.
            </p>
            <v-divider class="mb-3" />
            <div class="text-body-2">
              <div class="d-flex align-center mb-2">
                <v-icon size="16" color="primary" class="mr-2">mdi-circle-medium</v-icon>
                <span>CPU usage shown as a circular ring gauge</span>
              </div>
              <div class="d-flex align-center mb-2">
                <v-icon size="16" color="success" class="mr-2">mdi-circle-medium</v-icon>
                <span>Memory shown as a horizontal progress bar</span>
              </div>
              <div class="d-flex align-center mb-2">
                <v-icon size="16" color="info" class="mr-2">mdi-circle-medium</v-icon>
                <span>Network download/upload speeds in real-time</span>
              </div>
              <div class="d-flex align-center mb-2">
                <v-icon size="16" color="error" class="mr-2">mdi-circle-medium</v-icon>
                <span>Disk usage with total/used capacity</span>
              </div>
              <div class="d-flex align-center">
                <v-icon size="16" color="warning" class="mr-2">mdi-circle-medium</v-icon>
                <span>Battery percentage and charging state</span>
              </div>
            </div>
          </v-card-text>
        </v-card>

        <!-- System info card -->
        <v-card class="card mb-4" rounded="xl" variant="flat">
          <v-card-text>
            <div class="text-h6 mb-3">Current System</div>
            <v-list lines="one" density="compact" bg-color="transparent">
              <v-list-item>
                <template v-slot:prepend>
                  <v-icon size="20" class="mr-2">mdi-chip</v-icon>
                </template>
                <v-list-item-title>Chip</v-list-item-title>
                <v-list-item-subtitle class="text-right">{{ systemInfo.chip || 'Detecting...' }}</v-list-item-subtitle>
              </v-list-item>
              <v-list-item>
                <template v-slot:prepend>
                  <v-icon size="20" class="mr-2">mdi-memory</v-icon>
                </template>
                <v-list-item-title>Memory</v-list-item-title>
                <v-list-item-subtitle class="text-right">{{ formatMemory(systemInfo.memTotal) }}</v-list-item-subtitle>
              </v-list-item>
              <v-list-item>
                <template v-slot:prepend>
                  <v-icon size="20" class="mr-2">mdi-cpu</v-icon>
                </template>
                <v-list-item-title>Cores</v-list-item-title>
                <v-list-item-subtitle class="text-right">{{ systemInfo.cores || '—' }}</v-list-item-subtitle>
              </v-list-item>
              <v-list-item>
                <template v-slot:prepend>
                  <v-icon size="20" class="mr-2">mdi-desktop-classic</v-icon>
                </template>
                <v-list-item-title>Model</v-list-item-title>
                <v-list-item-subtitle class="text-right">{{ systemInfo.model || 'Mac' }}</v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>

        <!-- Refresh hint -->
        <div class="text-center text-body-2 text-secondary pa-4">
          <v-icon size="14" class="mr-1">mdi-information-outline</v-icon>
          The dashboard refreshes automatically every {{ refreshLabel }}.
          Tap the Overview key on your Flexbar to refresh manually.
        </div>
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const currentTheme = ref(
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
);

const systemInfo = ref({
  chip: '',
  cores: 0,
  memTotal: 0,
  model: ''
});

const refreshLabel = ref('2 seconds');

function formatMemory(bytes) {
  if (!bytes) return '—';
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${Math.round(gb)} GB` : `${Math.round(bytes / (1024 * 1024))} MB`;
}

function goBack() {
  if (window.history && window.history.length > 1) {
    window.history.back();
  }
}

function loadSystemInfo() {
  // Try to get system info from the backend via window API
  if (window.plugin && window.plugin.sendMessage) {
    window.plugin.sendMessage({ action: 'getSystemInfo' });
  }
}

onMounted(() => {
  loadSystemInfo();

  // Listen for system info response
  if (window.plugin && window.plugin.onMessage) {
    window.plugin.onMessage((msg) => {
      if (msg.action === 'systemInfo' && msg.data) {
        systemInfo.value = msg.data;
      }
    });
  }
});
</script>

<style scoped>
.toolbar {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid rgba(60, 60, 67, 0.12);
}

:deep(.v-theme--dark) .toolbar {
  background: rgba(28, 28, 30, 0.7);
  border-bottom-color: rgba(84, 84, 88, 0.3);
}

.toolbar-title {
  font-size: 17px;
  font-weight: 600;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
}

.card {
  background: var(--v-theme-surface);
}

@media (prefers-reduced-transparency: reduce) {
  .toolbar {
    background: #fff;
    backdrop-filter: none;
  }
  :deep(.v-theme--dark) .toolbar {
    background: #1C1C1E;
  }
}

@media (prefers-reduced-motion: reduce) {
  * {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
</style>
