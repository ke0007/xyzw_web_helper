<template>
  <div class="batch-tasks-page">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="container">
        <div class="header-content">
          <div class="header-left">
            <h1 class="page-title">批量任务</h1>
            <p class="page-subtitle">勾选多个Token循环执行任务，简化手动操作</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 移动端 Token 选择 -->
<!--    <div class="container mobile-token-select">-->
<!--      <n-select-->
<!--        v-model:value="currentTokenId"-->
<!--        size="small"-->
<!--        class="token-select"-->
<!--        :options="tokenOptions"-->
<!--        placeholder="请选择要连接的 Token"-->
<!--        @update:value="handleSelectToken"-->
<!--      />-->
<!--    </div>-->

    <div class="container">
      <!-- Token选择区域 -->
      <div class="section-card">
        <div class="card-header">
          <h2>选择Token</h2>
          <div class="header-actions">
            <n-button size="small" @click="selectAllTokens">全选</n-button>
            <n-button size="small" @click="clearAllTokens">清空</n-button>
          </div>
        </div>
        <div class="card-content">
          <div v-if="tokenStore.hasTokens" class="tokens-list">
            <n-checkbox-group v-model:value="selectedTokenIds">
              <div
                v-for="token in tokenStore.gameTokens"
                :key="token.id"
                class="token-item"
              >
                <n-checkbox :value="token.id" :label="token.name" />
                <span class="token-server" v-if="token.server">{{ token.server }}</span>
                <span
                  class="token-status"
                  :class="getTokenStatusClass(token.id)"
                >
                  {{ getTokenStatusText(token.id) }}
                </span>
              </div>
            </n-checkbox-group>
          </div>
          <n-empty v-else description="暂无Token，请先添加Token">
            <template #extra>
              <n-button type="primary" @click="$router.push('/tokens')">
                去添加Token
              </n-button>
            </template>
          </n-empty>
        </div>
      </div>

      <!-- 任务选择区域 -->
      <div class="section-card">
        <div class="card-header">
          <h2>选择任务</h2>
          <div class="header-actions">
            <n-button size="small" @click="selectAllTasks">全选</n-button>
            <n-button size="small" @click="clearAllTasks">清空</n-button>
          </div>
        </div>
        <div class="card-content">
          <n-checkbox-group v-model:value="selectedTasks">
            <div class="tasks-grid">
              <div
                v-for="task in availableTasks"
                :key="task.id"
                class="task-item"
              >
                <n-checkbox :value="task.id" :label="task.name" />
                <span class="task-desc">{{ task.description }}</span>
              </div>
            </div>
          </n-checkbox-group>
        </div>
      </div>

      <!-- 执行控制区域 -->
      <div class="section-card">
        <div class="card-header">
          <h2>执行控制</h2>
        </div>
        <div class="card-content">
          <div class="control-options">
            <n-form-item label="Token间隔时间（秒）">
              <n-input-number
                v-model:value="tokenInterval"
                :min="1"
                :max="300"
                :step="1"
                size="small"
                style="width: 120px"
              />
            </n-form-item>
            <n-form-item label="任务间隔时间（秒）">
              <n-input-number
                v-model:value="taskInterval"
                :min="0"
                :max="60"
                :step="1"
                size="small"
                style="width: 120px"
              />
            </n-form-item>
          </div>
          <div class="control-actions">
            <n-button
              type="primary"
              size="large"
              :loading="isRunning"
              :disabled="!canStart"
              @click="startBatchTasks"
            >
              <template #icon>
                <n-icon><Play /></n-icon>
              </template>
              {{ isRunning ? '执行中...' : '开始执行' }}
            </n-button>
            <n-button
              v-if="isRunning"
              type="error"
              size="large"
              @click="stopBatchTasks"
            >
              <template #icon>
                <n-icon><Stop /></n-icon>
              </template>
              停止执行
            </n-button>
          </div>
        </div>
      </div>

      <!-- 执行日志区域 -->
      <div class="section-card">
        <div class="card-header">
          <h2>执行日志</h2>
          <div class="header-actions">
            <n-button size="small" @click="clearLogs">清空日志</n-button>
          </div>
        </div>
        <div class="card-content">
          <div class="logs-container">
            <div
              v-for="(log, index) in executionLogs"
              :key="index"
              class="log-item"
              :class="log.type"
            >
              <span class="log-time">{{ formatTime(log.timestamp) }}</span>
              <span class="log-message">{{ log.message }}</span>
            </div>
            <div v-if="executionLogs.length === 0" class="empty-logs">
              暂无执行日志
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import { useTokenStore, selectedTokenId } from '@/stores/tokenStore'
import { Play, Stop } from '@vicons/ionicons5'
import { useTaskExecutor } from '@/composables/useTaskExecutor'

const router = useRouter()
const message = useMessage()
const tokenStore = useTokenStore()
const taskExecutor = useTaskExecutor()

// 响应式数据
const selectedTokenIds = ref([])
const selectedTasks = ref([])
const tokenInterval = ref(1) // Token间隔时间（秒）
const taskInterval = ref(1) // 任务间隔时间（秒）
const isRunning = ref(false)
const executionLogs = ref([])
const currentTokenId = ref(tokenStore.selectedToken?.id || null)
const stopFlag = ref(false)

// 可用任务列表
const availableTasks = [
  {
    id: 'daily-tasks',
    name: '每日任务',
    description: '领取每日任务奖励',
    command: 'task_claimdailyreward'
  },
  {
    id: 'salt-robot',
    name: '重启盐罐',
    description: '领取盐罐机器人奖励',
    command: 'bottlehelper_claim'
  },
  {
    id: 'idle-time',
    name: '挂机加钟',
    description: '领取挂机加钟',
    command: 'system_claimhangupreward'
  },
  {
    id: 'study-answer',
    name: '答题',
    description: '咸鱼大冲关答题',
    command: 'study_startgame'
  },
  {
    id: 'smart-car',
    name: '智能发车',
    description: '俱乐部赛车一键发车',
    command: 'car_getrolecar',
    isComplex: true
  },
  {
    id: 'collect-car',
    name: '一键收车',
    description: '俱乐部赛车一键发车',
    command: 'car_getrolecar',
    isComplex: true
  }
]

// 计算属性
const tokenOptions = computed(() => {
  return tokenStore.gameTokens.map(t => ({
    label: t.name || t.id,
    value: t.id
  }))
})

const canStart = computed(() => {
  return selectedTokenIds.value.length > 0 && selectedTasks.value.length > 0 && !isRunning.value
})

// 方法
const handleSelectToken = (tokenId) => {
  if (tokenId) {
    tokenStore.selectToken(tokenId, true)
    message.success('已切换到：' + (tokenStore.gameTokens.find(t => t.id === tokenId)?.name || tokenId))
  }
}

const selectAllTokens = () => {
  selectedTokenIds.value = tokenStore.gameTokens.map(t => t.id)
}

const clearAllTokens = () => {
  selectedTokenIds.value = []
}

const selectAllTasks = () => {
  selectedTasks.value = availableTasks.map(t => t.id)
}

const clearAllTasks = () => {
  selectedTasks.value = []
}

const getTokenStatusClass = (tokenId) => {
  const status = tokenStore.getWebSocketStatus(tokenId)
  return {
    'status-connected': status === 'connected',
    'status-connecting': status === 'connecting',
    'status-disconnected': status === 'disconnected',
    'status-error': status === 'error'
  }
}

const getTokenStatusText = (tokenId) => {
  const status = tokenStore.getWebSocketStatus(tokenId)
  const statusMap = {
    'connected': '已连接',
    'connecting': '连接中',
    'disconnected': '未连接',
    'error': '连接错误'
  }
  return statusMap[status] || '未知'
}

const addLog = (message, type = 'info') => {
  executionLogs.value.unshift({
    timestamp: Date.now(),
    message,
    type
  })
  // 限制日志数量
  if (executionLogs.value.length > 100) {
    executionLogs.value = executionLogs.value.slice(0, 100)
  }
}

const clearLogs = () => {
  executionLogs.value = []
}

const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN')
}

const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 等待连接建立
const waitForConnection = async (tokenId, maxWait = 10000) => {
  const startTime = Date.now()
  while (Date.now() - startTime < maxWait) {
    if (stopFlag.value) return false
    const status = tokenStore.getWebSocketStatus(tokenId)
    if (status === 'connected') {
      return true
    }
    await sleep(500)
  }
  return false
}

// 执行单个任务
const executeTask = async (tokenId, task) => {
  const tokenName = tokenStore.gameTokens.find(t => t.id === tokenId)?.name || tokenId
  
  // 创建日志函数，自动添加 token 名称前缀
  const logFn = (msg: string, type: string = 'info') => {
    addLog(`[${tokenName}] ${msg}`, type)
  }
  
  try {
    addLog(`[${tokenName}] 开始执行任务: ${task.name}`, 'info')
    
    // 检查停止标志
    if (stopFlag.value) {
      logFn('任务已停止', 'warning')
      return false
    }
    
    switch (task.id) {
      case 'daily-tasks': {
        // 每日任务：调用 composable
        await taskExecutor.executeDailyTasks(tokenId, logFn)
        break
      }
      
      case 'salt-robot': {
        // 重启盐罐：调用 composable
        await taskExecutor.restartBottleHelper(tokenId, logFn)
        break
      }
      
      case 'idle-time': {
        // 挂机加钟：调用 composable
        await taskExecutor.extendHangUpTime(tokenId, logFn)
        break
      }
      
      case 'study-answer': {
        // 答题：调用 composable
        await taskExecutor.startStudyAnswer(tokenId, logFn)
        break
      }
      
      case 'smart-car': {
        // 智能发车：调用 composable
        await taskExecutor.smartSendCar(tokenId, logFn)
        break
      }
      
      case 'collect-car': {
        // 一键收车：调用 composable
        await taskExecutor.claimAllCars(tokenId, logFn)
        break
      }
      
      default:
        logFn(`未知任务类型: ${task.id}`, 'error')
        return false
    }
    
    // 等待任务间隔
    if (taskInterval.value > 0) {
      await sleep(taskInterval.value * 1000)
    }
    return true
  } catch (error: any) {
    logFn(`${task.name} 执行失败: ${error.message}`, 'error')
    return false
  }
}

// 处理单个Token的所有任务
const processToken = async (tokenId) => {
  const token = tokenStore.gameTokens.find(t => t.id === tokenId)
  if (!token) {
    addLog(`Token ${tokenId} 不存在`, 'error')
    return
  }

  addLog(`开始处理Token: ${token.name}`, 'info')

  // 选择并连接Token
  tokenStore.selectToken(tokenId, true)
  addLog(`正在连接Token: ${token.name}...`, 'info')

  // 等待连接建立
  const connected = await waitForConnection(tokenId)
  if (!connected) {
    addLog(`Token ${token.name} 连接超时，跳过`, 'error')
    return
  }

  addLog(`Token ${token.name} 连接成功`, 'success')

  // 初始化游戏数据（包括 battleVersion）
  try {
    addLog(`初始化游戏数据 [${token.name}]...`, 'info')
    tokenStore.sendMessage(tokenId, 'role_getroleinfo')
    tokenStore.sendMessage(tokenId, 'tower_getinfo')
    tokenStore.sendMessage(tokenId, 'presetteam_getinfo')
    const res = await tokenStore.sendMessageWithPromise(tokenId, 'fight_startlevel', {}, 5000)
    tokenStore.setBattleVersion(res?.battleData?.version)
    addLog(`游戏数据初始化完成 (battleVersion: ${res?.battleData?.version})`, 'success')
    // 等待一小段时间确保数据同步
    await sleep(500)
  } catch (error: any) {
    addLog(`初始化游戏数据失败: ${error.message}`, 'warning')
    // 初始化失败不阻断任务执行，但可能影响战斗类任务
  }

  // 执行选中的任务
  for (const taskId of selectedTasks.value) {
    if (stopFlag.value) {
      addLog(`已停止执行`, 'warning')
      return
    }

    const task = availableTasks.find(t => t.id === taskId)
    if (task) {
      await executeTask(tokenId, task)
    }
  }

  addLog(`Token ${token.name} 处理完成`, 'success')
}

// 开始批量执行
const startBatchTasks = async () => {
  if (!canStart.value) {
    message.warning('请至少选择一个Token和一个任务')
    return
  }

  isRunning.value = true
  stopFlag.value = false
  addLog('开始批量执行任务...', 'info')
  addLog(`已选择 ${selectedTokenIds.value.length} 个Token，${selectedTasks.value.length} 个任务`, 'info')

  try {
    for (let i = 0; i < selectedTokenIds.value.length; i++) {
      if (stopFlag.value) {
        break
      }

      const tokenId = selectedTokenIds.value[i]
      await processToken(tokenId)

      // Token间隔（最后一个Token不需要等待）
      if (i < selectedTokenIds.value.length - 1 && tokenInterval.value > 0) {
        addLog(`等待 ${tokenInterval.value} 秒后处理下一个Token...`, 'info')
        await sleep(tokenInterval.value * 1000)
      }
    }

    if (stopFlag.value) {
      addLog('批量执行已停止', 'warning')
      message.warning('批量执行已停止')
    } else {
      addLog('批量执行完成', 'success')
      message.success('批量执行完成')
    }
  } catch (error) {
    addLog(`批量执行出错: ${error.message}`, 'error')
    message.error('批量执行出错: ' + error.message)
  } finally {
    isRunning.value = false
    stopFlag.value = false
  }
}

// 停止批量执行
const stopBatchTasks = () => {
  stopFlag.value = true
  isRunning.value = false
  addLog('正在停止批量执行...', 'warning')
  message.info('正在停止批量执行...')
}

// 监听选中Token变化
const handleTokenSelectChange = () => {
  currentTokenId.value = tokenStore.selectedToken?.id || null
}

onMounted(() => {
  currentTokenId.value = tokenStore.selectedToken?.id || null
  // 监听tokenStore的变化
  const unwatch = tokenStore.$subscribe(() => {
    handleTokenSelectChange()
  })
  onUnmounted(() => {
    unwatch()
  })
})
</script>

<style scoped lang="scss">
.batch-tasks-page {
  min-height: 100dvh;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  padding-bottom: calc(var(--spacing-md) + env(safe-area-inset-bottom));
}

[data-theme="dark"] .batch-tasks-page {
  background: linear-gradient(135deg, #0f172a 0%, #1f2937 100%);
}

.page-header {
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-light);
  padding: var(--spacing-lg) 0;
}

.container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 var(--spacing-lg);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-xs) 0;
}

.page-subtitle {
  color: var(--text-secondary);
  font-size: var(--font-size-md);
  margin: 0;
}

.mobile-token-select {
  display: none;
  padding: var(--spacing-md) var(--spacing-lg);
}

.token-select {
  width: 100%;
}

.section-card {
  background: var(--bg-primary);
  border-radius: var(--border-radius-xl);
  padding: var(--spacing-lg);
  margin: var(--spacing-lg) 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-lg);
  padding-bottom: var(--spacing-md);
  border-bottom: 1px solid var(--border-light);

  h2 {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
    margin: 0;
  }
}

.header-actions {
  display: flex;
  gap: var(--spacing-sm);
}

.card-content {
  color: var(--text-primary);
}

.tokens-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.token-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm);
  border-radius: var(--border-radius-medium);
  transition: background var(--transition-fast);

  &:hover {
    background: var(--bg-tertiary);
  }
}

.token-server {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.token-status {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: var(--border-radius-small);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);

  &.status-connected {
    background: rgba(24, 160, 88, 0.1);
    color: var(--success-color);
  }

  &.status-connecting {
    background: rgba(240, 160, 32, 0.1);
    color: var(--warning-color);
  }

  &.status-disconnected {
    background: rgba(107, 114, 128, 0.1);
    color: var(--text-tertiary);
  }

  &.status-error {
    background: rgba(208, 48, 80, 0.1);
    color: var(--error-color);
  }
}

.tasks-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--spacing-md);
}

.task-item {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding: var(--spacing-md);
  border: 1px solid var(--border-light);
  border-radius: var(--border-radius-medium);
  transition: all var(--transition-fast);

  &:hover {
    border-color: var(--primary-color);
    background: var(--bg-tertiary);
  }
}

.task-desc {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  margin-left: 24px;
}

.control-options {
  display: flex;
  gap: var(--spacing-xl);
  margin-bottom: var(--spacing-lg);
  flex-wrap: wrap;
}

.control-actions {
  display: flex;
  gap: var(--spacing-md);
  justify-content: center;
}

.logs-container {
  max-height: 400px;
  overflow-y: auto;
  background: var(--bg-secondary);
  border-radius: var(--border-radius-medium);
  padding: var(--spacing-md);
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
  font-size: var(--font-size-sm);
}

.log-item {
  display: flex;
  gap: var(--spacing-md);
  padding: var(--spacing-xs) 0;
  border-bottom: 1px solid var(--border-light);

  &:last-child {
    border-bottom: none;
  }

  &.success {
    color: var(--success-color);
  }

  &.error {
    color: var(--error-color);
  }

  &.warning {
    color: var(--warning-color);
  }

  &.info {
    color: var(--text-secondary);
  }
}

.log-time {
  color: var(--text-tertiary);
  min-width: 80px;
}

.log-message {
  flex: 1;
}

.empty-logs {
  text-align: center;
  color: var(--text-tertiary);
  padding: var(--spacing-xl);
}

@media (max-width: 768px) {
  .container {
    padding: 0 var(--spacing-md);
  }

  .page-header {
    display: none;
  }

  .mobile-token-select {
    display: block;
  }

  .tasks-grid {
    grid-template-columns: 1fr;
  }

  .control-options {
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .control-actions {
    flex-direction: column;
  }
}
</style>

