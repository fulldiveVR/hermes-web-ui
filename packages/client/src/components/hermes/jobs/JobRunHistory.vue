<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { NSpin, NEmpty, NCollapse, NCollapseItem } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { listCronRuns, readCronRun } from '@/api/hermes/cron-history'
import type { RunEntry, RunDetail } from '@/api/hermes/cron-history'
import type { Job } from '@/api/hermes/jobs'
import MarkdownRenderer from '@/components/hermes/chat/MarkdownRenderer.vue'

const SYNTHETIC_RUN_FILE = '__scheduler_metadata__.md'

const props = defineProps<{
  selectedJobId: string | null
  jobNameMap: Record<string, string>
  profileKey: string
  jobs: Job[]
}>()

const { t } = useI18n()
const loading = ref(false)
const runs = ref<RunEntry[]>([])
const expandedContent = ref<Record<string, string>>({})
const loadingContent = ref<Record<string, boolean>>({})

const filteredRuns = computed(() => {
  if (!props.selectedJobId) return runs.value
  return runs.value.filter(r => r.jobId === props.selectedJobId)
})

async function fetchRuns() {
  loading.value = true
  const syntheticRuns = buildSyntheticRuns()
  runs.value = syntheticRuns
  try {
    const remoteRuns = await listCronRuns(props.selectedJobId ?? undefined, props.selectedJobId ? 100 : 200)
    runs.value = mergeRuns(remoteRuns, syntheticRuns)
  } catch (err) {
    console.error('Failed to fetch cron runs:', err)
    runs.value = syntheticRuns
  } finally {
    loading.value = false
  }
}

async function handleExpand(key: string | number | Array<string | number>) {
  // accordion mode emits a single value; non-accordion emits an array
  const keys = Array.isArray(key) ? key : key != null ? [key] : []
  for (const raw of keys) {
    const k = String(raw)
    if (expandedContent.value[k] || loadingContent.value[k]) continue

    const run = filteredRuns.value.find(r => `${r.jobId}/${r.fileName}` === k)
    if (!run) continue

    loadingContent.value[k] = true
    try {
      if (run.fileName === SYNTHETIC_RUN_FILE) {
        expandedContent.value[k] = buildSyntheticContent(run)
      } else {
        const detail: RunDetail = await readCronRun(run.jobId, run.fileName)
        expandedContent.value[k] = detail.content
      }
    } catch (err) {
      expandedContent.value[k] = `[Error loading content]`
    } finally {
      loadingContent.value[k] = false
    }
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

function getJobName(jobId: string): string {
  return props.jobNameMap[jobId] || jobId
}

function toDisplayTime(value: string): string {
  const parsed = Date.parse(value)
  if (Number.isFinite(parsed)) return new Date(parsed).toLocaleString()
  return value
}

function jobId(job: Job): string {
  return job.job_id || job.id
}

function buildSyntheticRuns(): RunEntry[] {
  const targetJobs = props.selectedJobId
    ? props.jobs.filter(job => jobId(job) === props.selectedJobId)
    : props.jobs

  return targetJobs
    .filter(job => !!job.last_run_at)
    .map(job => ({
      jobId: jobId(job),
      fileName: SYNTHETIC_RUN_FILE,
      runTime: toDisplayTime(job.last_run_at || ''),
      size: 0,
    }))
    .sort((a, b) => b.runTime.localeCompare(a.runTime))
}

function mergeRuns(remoteRuns: RunEntry[], syntheticRuns: RunEntry[]): RunEntry[] {
  const seen = new Set(remoteRuns.map(run => `${run.jobId}/${run.fileName}`))
  const remoteJobs = new Set(remoteRuns.map(run => run.jobId))
  const merged = [...remoteRuns]
  for (const run of syntheticRuns) {
    if (remoteJobs.has(run.jobId)) continue
    if (!seen.has(`${run.jobId}/${run.fileName}`)) merged.push(run)
  }
  return merged.sort((a, b) => b.runTime.localeCompare(a.runTime))
}

function buildSyntheticContent(run: RunEntry): string {
  const job = props.jobs.find(item => jobId(item) === run.jobId)
  const lines = [
    '# Scheduler run recorded',
    '',
    'Hermes recorded this scheduled job run. No separate markdown output artifact is available for this run.',
    '',
    `- Job: \`${job?.name || run.jobId}\``,
    `- Last run: \`${run.runTime}\``,
  ]
  if (job?.last_status) lines.push(`- Last status: \`${job.last_status}\``)
  if (job?.last_error) lines.push(`- Last error: \`${job.last_error}\``)
  return `${lines.join('\n')}\n`
}

watch(() => [props.selectedJobId, props.profileKey, props.jobs.map(job => `${jobId(job)}:${job.last_run_at || ''}`).join('|')], () => {
  expandedContent.value = {}
  fetchRuns()
}, { immediate: true })
</script>

<template>
  <div class="run-history">
    <div class="history-header">
      <span class="history-title">{{ t('jobs.runHistory.title') }}</span>
      <span class="history-count">{{ filteredRuns.length }} {{ t('jobs.runHistory.runs') }}</span>
    </div>

    <div class="history-body">
      <NSpin :show="loading">
        <NEmpty v-if="!loading && filteredRuns.length === 0" :description="t('jobs.runHistory.noRuns')" />

        <NCollapse
          v-else
          accordion
          @update:expanded-names="handleExpand"
        >
          <NCollapseItem
            v-for="run in filteredRuns"
            :key="`${run.jobId}/${run.fileName}`"
            :title="`${getJobName(run.jobId)} — ${run.runTime}`"
            :name="`${run.jobId}/${run.fileName}`"
          >
            <template #header-extra>
              <span class="run-meta">{{ formatSize(run.size) }}</span>
            </template>

            <NSpin v-if="loadingContent[`${run.jobId}/${run.fileName}`]" size="small" />
            <MarkdownRenderer v-else-if="expandedContent[`${run.jobId}/${run.fileName}`]" :content="expandedContent[`${run.jobId}/${run.fileName}`]" />
          </NCollapseItem>
        </NCollapse>
      </NSpin>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.run-history {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid $border-light;
  flex-shrink: 0;
}

.history-title {
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
}

.history-count {
  font-size: 12px;
  color: $text-muted;
}

.history-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 20px 20px;
}

.run-meta {
  font-size: 11px;
  color: $text-muted;
  font-family: $font-code;
}
</style>
