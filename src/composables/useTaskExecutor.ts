import { useTokenStore } from '@/stores/tokenStore'

/**
 * 任务执行器 Composable
 * 提取各组件中的任务执行逻辑，供批量任务页面复用
 */
export function useTaskExecutor() {
  const tokenStore = useTokenStore()

  /**
   * 辅助函数：检查是否今日可用
   */
  const isTodayAvailable = (statisticsTime: any) => {
    if (!statisticsTime) return true
    const today = new Date().toDateString()
    const recordDate = new Date(statisticsTime).toDateString()
    return today !== recordDate
  }

  /**
   * 辅助函数：获取今日BOSS ID
   */
  const getTodayBossId = () => {
    const DAY_BOSS_MAP = [9904, 9905, 9901, 9902, 9903, 9904, 9905] // 周日~周六
    const dayOfWeek = new Date().getDay()
    return DAY_BOSS_MAP[dayOfWeek]
  }

  /**
   * 辅助函数：选择竞技场目标
   */
  const pickArenaTargetId = (targets: any) => {
    const candidate =
      targets?.rankList?.[0] ||
      targets?.roleList?.[0] ||
      targets?.targets?.[0] ||
      targets?.targetList?.[0] ||
      targets?.list?.[0]

    if (candidate?.roleId) return candidate.roleId
    if (candidate?.id) return candidate.id
    return targets?.roleId || targets?.id
  }


  /**
   * 每日任务执行器（完整版）
   * 参考: DailyTaskStatus.vue 的 executeDailyTasks 和 runDailyFix
   */
  const executeDailyTasks = async (
    tokenId: string,
    logFn: (msg: string, type?: string) => void,
    settings?: {
      arenaFormation?: number
      bossFormation?: number
      bossTimes?: number
      claimBottle?: boolean
      payRecruit?: boolean
      openBox?: boolean
      arenaEnable?: boolean
      claimHangUp?: boolean
      claimEmail?: boolean
      blackMarketPurchase?: boolean
    }
  ) => {
    // 默认设置
    const defaultSettings = {
      arenaFormation: 1,
      bossFormation: 1,
      bossTimes: 2,
      claimBottle: true,
      payRecruit: true,
      openBox: true,
      arenaEnable: true,
      claimHangUp: true,
      claimEmail: true,
      blackMarketPurchase: true
    }
    const finalSettings = { ...defaultSettings, ...settings }

    // 创建本地 executeGameCommand 函数，自动使用 logFn（与 DailyTaskStatus.vue 保持一致）
    const executeCmd = async (cmd: string, params: any = {}, description: string = '', timeout: number = 8000) => {
      try {
        if (description) logFn(`执行: ${description}`)
        const result = await tokenStore.sendMessageWithPromise(tokenId, cmd, params, timeout)
        await new Promise(resolve => setTimeout(resolve, 500))
        if (description) logFn(`${description} - 成功`, 'success')
        return result
      } catch (error: any) {
        if (description) logFn(`${description} - 失败: ${error.message}`, 'error')
        throw error
      }
    }

    // 智能阵容切换辅助函数（与 DailyTaskStatus.vue 保持一致）
    const switchToFormation = async (targetFormation: number, formationName: string) => {
      try {
        // 使用 token 独立的游戏数据
        const tokenGameData = tokenStore.getTokenGameData(tokenId)
        
        // 首先尝试从本地缓存获取当前阵容信息
        const cachedTeamInfo = tokenGameData?.presetTeam?.presetTeamInfo
        let currentFormation = cachedTeamInfo?.useTeamId

        if (currentFormation) {
          logFn(`从缓存获取当前阵容: ${currentFormation}`)
        } else {
          // 缓存中没有数据，从服务器获取
          logFn(`缓存中无阵容信息，从服务器获取...`)
          const teamInfo = await executeCmd('presetteam_getinfo', {}, '获取阵容信息')
          currentFormation = teamInfo?.presetTeamInfo?.useTeamId
          logFn(`从服务器获取当前阵容: ${currentFormation}`)
        }

        if (currentFormation === targetFormation) {
          logFn(`当前已是${formationName}${targetFormation}，无需切换`, 'success')
          return false // 不需要切换
        }

        logFn(`当前阵容: ${currentFormation}, 目标阵容: ${targetFormation}，开始切换...`)
        await executeCmd('presetteam_saveteam',
          { teamId: targetFormation }, `切换到${formationName}${targetFormation}`)

        logFn(`成功切换到${formationName}${targetFormation}`, 'success')
        return true // 已切换
      } catch (error: any) {
        logFn(`阵容检查失败，直接切换: ${error.message}`, 'warning')
        // 如果检查失败，还是执行切换操作
        try {
          await executeCmd('presetteam_saveteam',
            { teamId: targetFormation }, `强制切换到${formationName}${targetFormation}`)
          return true
        } catch (fallbackError: any) {
          logFn(`强制切换也失败: ${fallbackError.message}`, 'error')
          throw fallbackError
        }
      }
    }

    try {
      // 1. 获取角色信息
      logFn('正在获取角色信息...', 'info')
      const roleInfoResp = await tokenStore.sendGetRoleInfo(tokenId)

      if (!roleInfoResp?.role) {
        throw new Error('获取角色信息失败或数据异常')
      }

      const roleData = roleInfoResp.role
      logFn(`当前每日任务进度: ${roleData.dailyTask?.dailyPoint || 0}/100`, 'info')

      // 2. 开始执行每日任务补差
      logFn('开始执行每日任务补差')

      // 检查已完成的任务
      const completedTasks = roleData.dailyTask?.complete ?? {}
      const isTaskCompleted = (taskId: number) => completedTasks[taskId] === -1

      // 统计数据
      const statistics = roleData.statistics ?? {}
      const statisticsTime = roleData.statisticsTime ?? {}

      // 构建任务列表
      const taskList: Array<{ name: string; execute: () => Promise<any> }> = []

      // === 1. 基础任务 ===

      // 分享游戏 (任务ID: 2)
      if (!isTaskCompleted(2)) {
        taskList.push({
          name: '分享一次游戏',
          execute: () => executeCmd('system_mysharecallback',
            { isSkipShareCard: true, type: 2 }, '分享游戏')
        })
      }

      // 赠送好友金币 (任务ID: 3)
      if (!isTaskCompleted(3)) {
        taskList.push({
          name: '赠送好友金币',
          execute: () => executeCmd('friend_batch', {}, '赠送好友金币')
        })
      }

      // 招募 (任务ID: 4)
      if (!isTaskCompleted(4)) {
        taskList.push({
          name: '免费招募',
          execute: () => executeCmd('hero_recruit',
            { recruitType: 3, recruitNumber: 1 }, '免费招募')
        })

        if (finalSettings.payRecruit) {
          taskList.push({
            name: '付费招募',
            execute: () => executeCmd('hero_recruit',
              { recruitType: 1, recruitNumber: 1 }, '付费招募')
          })
        }
      }

      // 点金 (任务ID: 6)
      if (!isTaskCompleted(6) && isTodayAvailable(statisticsTime['buy:gold'])) {
        for (let i = 0; i < 3; i++) {
          taskList.push({
            name: `免费点金 ${i + 1}/3`,
            execute: () => executeCmd('system_buygold',
              { buyNum: 1 }, `免费点金 ${i + 1}`)
          })
        }
      }

      // 挂机奖励 (任务ID: 5)
      if (!isTaskCompleted(5) && finalSettings.claimHangUp) {
        // 先领取奖励
        taskList.push({
          name: '领取挂机奖励',
          execute: () => executeCmd('system_claimhangupreward', {}, '领取挂机奖励')
        })

        // 然后加钟4次
        for (let i = 0; i < 4; i++) {
          taskList.push({
            name: `挂机加钟 ${i + 1}/4`,
            execute: () => executeCmd('system_mysharecallback',
              { isSkipShareCard: true, type: 2 }, `挂机加钟 ${i + 1}`)
          })
        }
      }

      // 开宝箱 (任务ID: 7)
      if (!isTaskCompleted(7) && finalSettings.openBox) {
        taskList.push({
          name: '开启木质宝箱',
          execute: () => executeCmd('item_openbox',
            { itemId: 2001, number: 10 }, '开启木质宝箱10个')
        })
      }

      // 盐罐 (任务ID: 14)
      if (!isTaskCompleted(14) && finalSettings.claimBottle) {
        taskList.push({
          name: '领取盐罐奖励',
          execute: () => executeCmd('bottlehelper_claim', {}, '领取盐罐奖励')
        })
        taskList.push({
          name: '停止盐罐',
          execute: () => executeCmd('bottlehelper_stop', {}, '停止盐罐')
        })
        taskList.push({
          name: '开始盐罐',
          execute: () => executeCmd('bottlehelper_start', {}, '开始盐罐')
        })
      }

      // === 2. 竞技场 (任务ID: 13) ===
      if (!isTaskCompleted(13) && finalSettings.arenaEnable) {
        taskList.push({
          name: '竞技场战斗',
          execute: async () => {
            logFn('开始竞技场战斗流程')

            const currentHour = new Date().getHours()
            if (currentHour < 8) {
              logFn('当前时间未到8点，跳过竞技场战斗', 'warning')
              return
            }

            if (currentHour > 22) {
              logFn('当前时间已过22点，跳过竞技场战斗', 'warning')
              return
            }

            // 智能切换到竞技场阵容
            await switchToFormation(finalSettings.arenaFormation!, '竞技场阵容')

            // 开始竞技场
            await executeCmd('arena_startarea', {}, '开始竞技场')

            // 进行3场战斗
            for (let i = 1; i <= 3; i++) {
              logFn(`竞技场战斗 ${i}/3`)

              // 获取目标
              let targets
              try {
                targets = await executeCmd('arena_getareatarget', {}, `获取竞技场目标${i}`)
              } catch (err: any) {
                logFn(`竞技场战斗${i} - 获取对手失败: ${err.message}`, 'error')
                break
              }

              const targetId = pickArenaTargetId(targets)
              if (targetId) {
                await executeCmd('fight_startareaarena', { targetId }, `竞技场战斗${i}`, 10000)
              } else {
                logFn(`竞技场战斗${i} - 未找到目标`, 'warning')
              }

              // 战斗间隔
              await new Promise(resolve => setTimeout(resolve, 1000))
            }
          }
        })
      }

      // === 3. BOSS战斗 ===
      if (finalSettings.bossTimes! > 0) {
        // 军团BOSS
        // const alreadyLegionBoss = statistics['legion:boss'] ?? 0
        // const remainingLegionBoss = Math.max(settings.bossTimes - alreadyLegionBoss, 0)
        const remainingLegionBoss = Math.max(finalSettings.bossTimes, 0)
        const legionBossTime =  statisticsTime['legion:boss']

        if (remainingLegionBoss > 0 && isTodayAvailable(legionBossTime)) {
          // 为军团BOSS智能切换阵容
          taskList.push({
            name: '军团BOSS阵容检查',
            execute: () => switchToFormation(finalSettings.bossFormation!, 'BOSS阵容')
          })

          for (let i = 0; i < remainingLegionBoss; i++) {
            taskList.push({
              name: `军团BOSS ${i + 1}/${remainingLegionBoss}`,
              execute: () => executeCmd('fight_startlegionboss', {}, `军团BOSS ${i + 1}`, 12000)
            })
          }
        }

        // 每日BOSS
        const todayBossId = getTodayBossId()
        if (remainingLegionBoss === 0) {
          // 如果没有军团BOSS，为每日BOSS切换阵容
          taskList.push({
            name: '每日BOSS阵容检查',
            execute: () => switchToFormation(finalSettings.bossFormation!, 'BOSS阵容')
          })
        }

        for (let i = 0; i < 3; i++) {
          taskList.push({
            name: `每日BOSS ${i + 1}/3`,
            execute: () => executeCmd('fight_startboss',
              { bossId: todayBossId }, `每日BOSS ${i + 1}`, 12000)
          })
        }
      }

      // === 4. 固定奖励领取 ===
      const fixedRewards = [
        { name: '福利签到', cmd: 'system_signinreward' },
        { name: '俱乐部', cmd: 'legion_signin' },
        { name: '领取每日礼包', cmd: 'discount_claimreward' },
        { name: '领取每日免费奖励', cmd: 'collection_claimfreereward' },
        { name: '领取免费礼包', cmd: 'card_claimreward' },
        { name: '领取永久卡礼包', cmd: 'card_claimreward', params: { cardId: 4003 } }
      ]

      if (finalSettings.claimEmail) {
        fixedRewards.push({ name: '领取邮件奖励', cmd: 'mail_claimallattachment' })
      }

      fixedRewards.forEach(reward => {
        taskList.push({
          name: reward.name,
          execute: () => executeCmd(reward.cmd, reward.params || {}, reward.name)
        })
      })

      // === 5. 免费活动 ===
      // 免费钓鱼
      if (isTodayAvailable(statisticsTime['artifact:normal:lottery:time'])) {
        for (let i = 0; i < 3; i++) {
          taskList.push({
            name: `免费钓鱼 ${i + 1}/3`,
            execute: () => executeCmd('artifact_lottery',
              { lotteryNumber: 1, newFree: true, type: 1 }, `免费钓鱼 ${i + 1}`)
          })
        }
      }

      // 灯神免费扫荡
      const kingdoms = ['魏国', '蜀国', '吴国', '群雄']
      for (let gid = 1; gid <= 4; gid++) {
        if (isTodayAvailable(statisticsTime[`genie:daily:free:${gid}`])) {
          taskList.push({
            name: `${kingdoms[gid - 1]}灯神免费扫荡`,
            execute: () => executeCmd('genie_sweep',
              { genieId: gid }, `${kingdoms[gid - 1]}灯神免费扫荡`)
          })
        }
      }

      // 灯神免费扫荡卷
      for (let i = 0; i < 3; i++) {
        taskList.push({
          name: `领取免费扫荡卷 ${i + 1}/3`,
          execute: () => executeCmd('genie_buysweep', {}, `领取免费扫荡卷 ${i + 1}`)
        })
      }

      // === 6. 黑市购买任务 (任务ID: 12) ===
      if (!isTaskCompleted(12) && finalSettings.blackMarketPurchase) {
        taskList.push({
          name: '购买青铜宝箱',
          execute: () => executeCmd('store_buy', { goodsId: 1 }, '购买青铜宝箱')
        })
        taskList.push({
          name: '黑市购买1次物品',
          execute: () => executeCmd('store_purchase', { goodsId: 1 }, '黑市购买1次物品')
        })
      }

      // === 7. 任务奖励领取 ===
      for (let taskId = 1; taskId <= 10; taskId++) {
        taskList.push({
          name: `领取任务奖励${taskId}`,
          execute: () => executeCmd('task_claimdailypoint',
            { taskId }, `领取任务奖励${taskId}`, 5000)
        })
      }

      // 日常和周常奖励
      taskList.push(
        {
          name: '领取日常任务奖励',
          execute: () => executeCmd('task_claimdailyreward', {}, '领取日常任务奖励')
        },
        {
          name: '领取周常任务奖励',
          execute: () => executeCmd('task_claimweekreward', {}, '领取周常任务奖励')
        }
      )

      // === 执行任务列表 ===
      const totalTasks = taskList.length
      logFn(`共有 ${totalTasks} 个任务待执行`)

      for (let i = 0; i < taskList.length; i++) {
        const task = taskList[i]

        try {
          await task.execute()

          // 任务间隔
          await new Promise(resolve => setTimeout(resolve, 200))

        } catch (error: any) {
          logFn(`任务执行失败: ${task.name} - ${error.message}`, 'error')
          // 继续执行下一个任务
        }
      }

      logFn('所有任务执行完成', 'success')

      // 最后刷新一次角色信息
      await new Promise(resolve => setTimeout(resolve, 2000))
      logFn('正在刷新角色信息...', 'info')
      await tokenStore.sendGetRoleInfo(tokenId)
      logFn('角色信息刷新完成', 'success')

      return true
    } catch (error: any) {
      logFn(`每日任务执行失败: ${error.message}`, 'error')
      throw error
    }
  }

  /**
   * 重启盐罐
   * 参考: BottleHelperCard.vue 的 handleBottleHelper
   */
  const restartBottleHelper = async (
    tokenId: string,
    logFn: (msg: string, type?: string) => void
  ) => {
    try {
      logFn('正在重启盐罐...', 'info')
      tokenStore.sendMessage(tokenId, 'bottlehelper_stop')
      await new Promise(resolve => setTimeout(resolve, 500))
      tokenStore.sendMessage(tokenId, 'bottlehelper_start')
      tokenStore.sendMessage(tokenId, 'role_getroleinfo')
      logFn('重启盐罐完成', 'success')
      return true
    } catch (error: any) {
      logFn(`重启盐罐失败: ${error.message}`, 'error')
      throw error
    }
  }

  /**
   * 挂机加钟（先领取奖励再加钟）
   * 参考: HangUpStatusCard.vue 的 claimHangUpReward 和 extendHangUp
   */
  const extendHangUpTime = async (
    tokenId: string,
    logFn: (msg: string, type?: string) => void
  ) => {
    try {
      // 先领取奖励
      logFn('正在领取挂机奖励...', 'info')
      tokenStore.sendMessage(tokenId, 'system_claimhangupreward')
      await new Promise(resolve => setTimeout(resolve, 200))

      // 加钟4次
      logFn('正在加钟...', 'info')
      for (let i = 0; i < 4; i++) {
        tokenStore.sendMessage(tokenId, 'system_mysharecallback', { isSkipShareCard: true, type: 2 })
        await new Promise(resolve => setTimeout(resolve, i * 300))
      }

      await new Promise(resolve => setTimeout(resolve, 1500))
      tokenStore.sendMessage(tokenId, 'role_getroleinfo')
      logFn('挂机加钟完成', 'success')
      return true
    } catch (error: any) {
      logFn(`挂机加钟失败: ${error.message}`, 'error')
      throw error
    }
  }

  /**
   * 答题
   * 参考: StudyChallengeCard.vue 的 startStudy
   */
  const startStudyAnswer = async (
    tokenId: string,
    logFn: (msg: string, type?: string) => void
  ) => {
    try {
      // 使用 token 独立的游戏数据
      const tokenGameData = tokenStore.getTokenGameData(tokenId)
      
      // 检查是否已完成
      const studyStatus = tokenGameData?.studyStatus
      if (studyStatus?.thisWeek) {
        logFn('本周答题已完成，跳过', 'warning')
        return true
      }

      if (studyStatus?.status && studyStatus.status !== '' && studyStatus.status !== 'idel') {
        logFn('答题正在进行中，跳过', 'warning')
        return true
      }

      // 启动答题
      logFn('启动答题游戏...', 'info')
      tokenGameData.studyStatus = {
        ...tokenGameData.studyStatus,
        isAnswering: true,
        questionCount: 0,
        answeredCount: 0,
        status: 'starting',
        timestamp: Date.now()
      }

      tokenStore.sendMessage(tokenId, 'study_startgame')

      // 等待答题完成（通过事件处理器自动完成）
      // 设置超时，最多等待45秒
      let waitCount = 0
      const maxWait = 45 // 45秒
      while (waitCount < maxWait) {
        const currentStatus = tokenGameData?.studyStatus
        if (currentStatus?.status === 'completed' || !currentStatus?.isAnswering) {
          logFn('答题完成', 'success')
          return true
        }
        await new Promise(resolve => setTimeout(resolve, 1000))
        waitCount++
      }

      logFn('答题超时', 'warning')
      return true
    } catch (error: any) {
      logFn(`答题失败: ${error.message}`, 'error')
      throw error
    }
  }

  /**
   * 解析车辆列表
   */
  const normalizeCars = (raw: any) => {
    const r = raw || {}
    const body = r.body || r
    const roleCar = body.roleCar || body.rolecar || {}
    const carMap = roleCar.carDataMap || roleCar.cardatamap
    if (carMap && typeof carMap === 'object') {
      return Object.entries(carMap).map(([id, info]: [string, any]) => ({ id, ...(info || {}) }))
    }
    let arr = body.cars || body.list || body.data || body.carList || []
    if (!Array.isArray(arr) && typeof arr === 'object' && arr !== null) arr = Object.values(arr)
    return (Array.isArray(arr) ? arr : []).map((it: any) => ({ ...it }))
  }

  /**
   * 判断是否应该发车
   */
  const shouldSendCar = (car: any, tickets: number) => {
    const color = Number(car?.color || 0)
    const rewards = Array.isArray(car?.rewards) ? car.rewards : []
    
    // 判断大奖
    const bigPrizes = [
      {type: 3, itemId: 3201, value: 10},
      {type: 3, itemId: 1001, value: 10},
      {type: 3, itemId: 1022, value: 2000},
      {type: 2, itemId: 0, value: 2000},
      {type: 3, itemId: 1023, value: 5},
      {type: 3, itemId: 1022, value: 2500},
      {type: 3, itemId: 1001, value: 12}
    ]
    const isBigPrize = bigPrizes.some(p => 
      rewards.find(r => r.type === p.type && r.itemId === p.itemId && Number(r.value || 0) >= p.value)
    )
    
    // 计算车票数量
    const racingTickets = rewards.reduce((acc: number, r: any) => 
      acc + ((r.type === 3 && r.itemId === 35002) ? Number(r.value || 0) : 0), 0
    )
    
    if (tickets >= 6) {
      return color >= 5 || racingTickets >= 4 || isBigPrize
    }
    return color >= 4 || racingTickets >= 2 || isBigPrize
  }

  /**
   * 刷新车辆品阶
   */
  const refreshCar = async (
    tokenId: string,
    car: any,
    logFn: (msg: string, type?: string) => void
  ) => {
    try {
      const resp = await tokenStore.sendMessageWithPromise(tokenId, 'car_refresh', { carId: String(car.id) }, 10000)
      const data = resp?.car || resp?.body?.car || resp
      if (data && typeof data === 'object') {
        if (data.color != null) car.color = Number(data.color)
        if (data.refreshCount != null) car.refreshCount = Number(data.refreshCount)
      }
      // 刷新后更新车票数量
      try {
        const roleRes = await tokenStore.sendMessageWithPromise(tokenId, 'role_getroleinfo', {}, 8000)
        return Number(roleRes?.role?.items?.[35002]?.quantity || 0)
      } catch (_) {
        return 0
      }
    } catch (e: any) {
      logFn(`刷新车辆 ${car.id} 失败: ${e.message}`, 'error')
      throw e
    }
  }

  /**
   * 发车
   */
  const sendCar = async (
    tokenId: string,
    car: any,
    logFn: (msg: string, type?: string) => void
  ) => {
    try {
      const resp = await tokenStore.sendMessageWithPromise(tokenId, 'car_send', {
        carId: String(car.id),
        helperId: Number(car.helperId || 0),
        text: '',
        isUpgrade: false
      }, 10000)
      // 解析响应，更新车辆状态
      const body = resp?.body || resp
      const roleCar = body?.roleCar || body?.rolecar
      const map = roleCar?.carDataMap || roleCar?.cardatamap
      if (map && map[car.id]) {
        const updated = map[car.id]
        if (updated.sendAt != null) car.sendAt = updated.sendAt
        if (updated.color != null) car.color = updated.color
        if (updated.refreshCount != null) car.refreshCount = updated.refreshCount
      }
    } catch (e: any) {
      logFn(`发车失败: ${e.message}`, 'error')
      throw e
    }
  }

  /**
   * 智能发车
   * 参考: ClubCarKing.vue 的 smartSendCar
   */
  const smartSendCar = async (
    tokenId: string,
    logFn: (msg: string, type?: string) => void
  ) => {
    try {
      // 先刷新数据
      logFn('正在获取车辆数据...', 'info')
      const carRes = await tokenStore.sendMessageWithPromise(tokenId, 'car_getrolecar', {}, 10000)
      
      // 获取刷新券数量
      let tickets = 0
      try {
        const roleRes = await tokenStore.sendMessageWithPromise(tokenId, 'role_getroleinfo', {}, 10000)
        tickets = Number(roleRes?.role?.items?.[35002]?.quantity || 0)
      } catch (_) {}

      const carList = normalizeCars(carRes)
      logFn(`找到 ${carList.length} 辆车辆`, 'info')

      // 检查活动时间（周一至周三）
      const now = new Date()
      const dayOfWeek = now.getDay()
      const isActivityOpen = dayOfWeek >= 1 && dayOfWeek <= 3
      const isAfter20 = now.getHours() >= 20

      if (!isActivityOpen) {
        logFn('非活动时间不可发车（仅周一至周三开放）', 'warning')
        return true
      }

      if (isAfter20) {
        logFn('当前时间已过20点，禁止发车', 'warning')
        return true
      }

      let sentCount = 0
      for (const car of carList) {
        if (Number(car.sendAt || 0) !== 0) continue // 已发车，跳过
        
        if (shouldSendCar(car, tickets)) {
          // 直接发车
          try {
            await sendCar(tokenId, car, logFn)
            sentCount++
            await new Promise(r => setTimeout(r, 500))
            continue
          } catch (err: any) {
            logFn(`车辆 ${car.id} 发车失败: ${err.message}`, 'error')
            continue
          }
        }
        
        // 判断是否需要刷新
        let shouldRefresh = false
        const free = Number(car.refreshCount ?? 0) === 0
        if (tickets >= 6) shouldRefresh = true
        else if (free) shouldRefresh = true
        else {
          // 不刷新，直接发车
          try {
            await sendCar(tokenId, car, logFn)
            sentCount++
            await new Promise(r => setTimeout(r, 500))
            continue
          } catch (err: any) {
            logFn(`车辆 ${car.id} 发车失败: ${err.message}`, 'error')
            continue
          }
        }
        
        // 刷新循环
        while (shouldRefresh) {
          try {
            tickets = await refreshCar(tokenId, car, logFn)
            if (shouldSendCar(car, tickets)) {
              await sendCar(tokenId, car, logFn)
              sentCount++
              await new Promise(r => setTimeout(r, 500))
              break
            }
            const freeNow = Number(car.refreshCount ?? 0) === 0
            if (tickets >= 6) shouldRefresh = true
            else if (freeNow) shouldRefresh = true
            else {
              await sendCar(tokenId, car, logFn)
              sentCount++
              await new Promise(r => setTimeout(r, 500))
              break
            }
          } catch (err: any) {
            logFn(`刷新车辆 ${car.id} 失败: ${err.message}`, 'error')
            break
          }
        }
      }




      logFn(`智能发车完成，共发车 ${sentCount} 辆`, 'success')
      return true
    } catch (error: any) {
      logFn(`智能发车失败: ${error.message}`, 'error')
      throw error
    }
  }

  /**
   * 判断是否可收车
   */
  const canClaimCar = (car: any) => {
    const FOUR_HOURS_MS = 4 * 60 * 60 * 1000
    const t = Number(car?.sendAt || 0)
    if (!t) return false
    const tsMs = t < 1e12 ? t * 1000 : t
    return Date.now() - tsMs >= FOUR_HOURS_MS
  }

  /**
   * 一键收车
   * 参考: ClubCarKing.vue 的 claimAllCars
   */
  const claimAllCars = async (
    tokenId: string,
    logFn: (msg: string, type?: string) => void
  ) => {
    try {
      // 先刷新数据
      logFn('正在获取车辆数据...', 'info')
      const carRes = await tokenStore.sendMessageWithPromise(tokenId, 'car_getrolecar', {}, 10000)

      const carList = normalizeCars(carRes)
      logFn(`找到 ${carList.length} 辆车辆`, 'info')

      const claimables = carList.filter((c: any) => canClaimCar(c))
      logFn(`找到 ${claimables.length} 辆可收车车辆`, 'info')

      let claimedCount = 0
      for (const car of claimables) {
        try {
          await tokenStore.sendMessageWithPromise(tokenId, 'car_claim', {
            carId: String(car.id)
          }, 10000)
          claimedCount++
          await new Promise(r => setTimeout(r, 300))
        } catch (err: any) {
          logFn(`车辆 ${car.id} 收车失败: ${err.message}`, 'error')
        }
      }

      logFn(`一键收车完成，共收车 ${claimedCount} 辆`, 'success')
      return true
    } catch (error: any) {
      logFn(`一键收车失败: ${error.message}`, 'error')
      throw error
    }
  }

  return {
    executeDailyTasks,
    restartBottleHelper,
    extendHangUpTime,
    startStudyAnswer,
    smartSendCar,
    claimAllCars
  }
}

