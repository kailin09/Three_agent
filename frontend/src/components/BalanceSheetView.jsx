import { useEffect, useState } from 'react'

/** 打字机效果：text 变化后逐字显现，start=false 时不启动 */
function useTypewriter(text, speed = 28, start = true) {
  const [shown, setShown] = useState('')
  const done = !text || shown.length >= text.length
  useEffect(() => {
    if (!start) return
    setShown('')
    if (!text) return
    let i = 0
    const timer = setInterval(() => {
      i++
      setShown(text.slice(0, i))
      if (i >= text.length) clearInterval(timer)
    }, speed)
    return () => clearInterval(timer)
  }, [text, speed, start])
  return { shown, done }
}

/** 维度专属图标 */
const DIM_ICON = {
  核心收益: '💎',
  主要代价: '💸',
  最大风险: '⚠️',
  适合人群: '🎯',
  三方分歧焦点: '⚔️',
}

/** 快捷追问预设 */
const QUICK_ASKS = [
  '如果我最看重稳定性呢？',
  '预算砍半该怎么选？',
  '我性格偏保守，怎么选？',
  '五年后再看这个决定呢？',
]

/** 维度短名（雷达图轴标签） */
const DIM_SHORT = {
  核心收益: '收益',
  主要代价: '代价',
  最大风险: '风险',
  适合人群: '适合',
  三方分歧焦点: '分歧',
}

/** 五维雷达图：两选项轮廓同图对比（纯SVG像素风，version变化重放展开动画） */
function RadarChart({ items, optA, optB, version }) {
  const CX = 110, CY = 100, R = 72, N = items.length
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / N
  const pt = (i, r) => [CX + r * Math.cos(angle(i)), CY + r * Math.sin(angle(i))]
  const ring = (r) => Array.from({ length: N }, (_, i) => pt(i, r).join(',')).join(' ')
  const shape = (key) =>
    items.map((it, i) => pt(i, (Number(it[key]) / 10) * R).join(',')).join(' ')
  const anchor = (i) => {
    const c = Math.cos(angle(i))
    if (c > 0.3) return 'start'
    if (c < -0.3) return 'end'
    return 'middle'
  }
  return (
    <div className="radar-wrap" key={version}>
      <svg className="radar-svg" viewBox="0 0 220 200">
        {[2.5, 5, 7.5, 10].map((s) => (
          <polygon key={s} points={ring((s / 10) * R)} className="radar-ring" />
        ))}
        {items.map((_, i) => {
          const [x, y] = pt(i, R)
          return <line key={i} x1={CX} y1={CY} x2={x} y2={y} className="radar-axis" />
        })}
        <polygon points={shape('score_a')} className="radar-shape a" />
        <polygon points={shape('score_b')} className="radar-shape b" />
        {items.map((it, i) => {
          const [ax, ay] = pt(i, (Number(it.score_a) / 10) * R)
          const [bx, by] = pt(i, (Number(it.score_b) / 10) * R)
          return (
            <g key={i}>
              <rect x={ax - 2.5} y={ay - 2.5} width="5" height="5" className="radar-dot a" />
              <rect x={bx - 2.5} y={by - 2.5} width="5" height="5" className="radar-dot b" />
            </g>
          )
        })}
        {items.map((it, i) => {
          const [x, y] = pt(i, R + 16)
          return (
            <text key={i} x={x} y={y + 3} textAnchor={anchor(i)} className="radar-label">
              {DIM_SHORT[it.dimension] || it.dimension}
            </text>
          )
        })}
      </svg>
      <div className="radar-legend">
        <span className="radar-leg a">■ {optA}</span>
        <span className="radar-leg b">■ {optB}</span>
      </div>
    </div>
  )
}

/** Canvas 文字换行：返回绘制结束的 y 坐标 */
function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 99) {
  let line = ''
  let yy = y
  let n = 0
  for (const ch of text.split('')) {
    const test = line + ch
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy)
      line = ch
      yy += lineHeight
      n += 1
      if (n >= maxLines) return yy
    } else {
      line = test
    }
  }
  if (line && n < maxLines) ctx.fillText(line, x, yy)
  return yy + lineHeight
}

/** Canvas 雷达图绘制（与页面SVG版视觉一致） */
function drawRadar(ctx, items, cx, cy, r) {
  const N = items.length
  const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / N
  const pt = (i, rr) => [cx + rr * Math.cos(angle(i)), cy + rr * Math.sin(angle(i))]
  // 同心环
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)'
  ctx.lineWidth = 1
  for (const s of [2.5, 5, 7.5, 10]) {
    ctx.beginPath()
    for (let i = 0; i < N; i++) {
      const [x, y] = pt(i, (s / 10) * r)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.stroke()
  }
  // 轴线
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)'
  for (let i = 0; i < N; i++) {
    const [x, y] = pt(i, r)
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke()
  }
  // 两选项轮廓
  const drawShape = (key, fill, stroke) => {
    ctx.beginPath()
    for (let i = 0; i < N; i++) {
      const [x, y] = pt(i, (Number(items[i][key]) / 10) * r)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fillStyle = fill; ctx.fill()
    ctx.strokeStyle = stroke; ctx.lineWidth = 2.5; ctx.stroke()
  }
  drawShape('score_a', 'rgba(34, 211, 238, 0.15)', '#22d3ee')
  drawShape('score_b', 'rgba(255, 215, 0, 0.15)', '#ffd700')
  // 顶点方块
  for (let i = 0; i < N; i++) {
    const [ax, ay] = pt(i, (Number(items[i].score_a) / 10) * r)
    const [bx, by] = pt(i, (Number(items[i].score_b) / 10) * r)
    ctx.fillStyle = '#22d3ee'; ctx.fillRect(ax - 3, ay - 3, 6, 6)
    ctx.fillStyle = '#ffd700'; ctx.fillRect(bx - 3, by - 3, 6, 6)
  }
  // 轴标签
  ctx.fillStyle = '#94a3b8'
  ctx.font = '11px "Press Start 2P", monospace'
  ctx.textAlign = 'center'
  for (let i = 0; i < N; i++) {
    const [x, y] = pt(i, r + 20)
    const c = Math.cos(angle(i))
    ctx.textAlign = c > 0.3 ? 'left' : c < -0.3 ? 'right' : 'center'
    ctx.fillText(DIM_SHORT[items[i].dimension] || items[i].dimension, x, y + 4)
  }
  ctx.textAlign = 'left'
}

/** 像素风战报绘制 */
function drawReport(ctx, { question, sheet, quotes, meta, pctA, pctB, optA, optB }) {
  const W = 800, H = 1250
  // 背景
  ctx.fillStyle = '#0b1220'
  ctx.fillRect(0, 0, W, H)
  // 像素边框：外 cyan 4px + 内 gold 2px
  ctx.strokeStyle = '#22d3ee'
  ctx.lineWidth = 4
  ctx.strokeRect(10, 10, W - 20, H - 20)
  ctx.strokeStyle = '#ffd700'
  ctx.lineWidth = 2
  ctx.strokeRect(22, 22, W - 44, H - 44)
  // 四角像素方块
  ctx.fillStyle = '#22d3ee'
  ;[[10, 10], [W - 26, 10], [10, H - 26], [W - 26, H - 26]].forEach(([x, y]) => {
    ctx.fillRect(x, y, 16, 16)
  })

  // 标题
  ctx.fillStyle = '#ffd700'
  ctx.font = 'bold 30px "Press Start 2P", monospace'
  ctx.textAlign = 'center'
  ctx.fillText('QUEST RESULT', W / 2, 85)
  ctx.fillStyle = '#64748b'
  ctx.font = '12px "Press Start 2P", monospace'
  ctx.fillText('· DECISION BALANCE SHEET ·', W / 2, 115)

  // 辩题
  ctx.textAlign = 'left'
  ctx.fillStyle = '#f1f5f9'
  ctx.font = 'bold 22px sans-serif'
  wrapText(ctx, `⚔️ ${question}`, 60, 165, W - 120, 34, 2)

  // 分割线
  ctx.fillStyle = '#1e293b'
  ctx.fillRect(50, 245, W - 100, 2)

  // 三方金句
  let y = 285
  ctx.font = '13px "Press Start 2P", monospace'
  ctx.fillStyle = '#22d3ee'
  ctx.textAlign = 'left'
  ctx.fillText('DEBATER QUOTES', 60, y)
  y += 40
  Object.entries(quotes).forEach(([role, m]) => {
    const info = meta[role] || {}
    const color = info.color || '#94a3b8'
    // 色块条
    ctx.fillStyle = color
    ctx.fillRect(60, y - 18, 6, 60)
    ctx.globalAlpha = 0.12
    ctx.fillRect(66, y - 18, W - 126, 60)
    ctx.globalAlpha = 1
    // 头像 + 名字
    ctx.font = '20px sans-serif'
    ctx.fillText(info.avatar || '🗣️', 80, y + 6)
    ctx.fillStyle = color
    ctx.font = 'bold 18px sans-serif'
    ctx.fillText(m.name || role, 115, y + 6)
    // 金句（截断55字）
    ctx.fillStyle = '#cbd5e1'
    ctx.font = '15px sans-serif'
    const quote = (m.content || '').replace(/\s+/g, ' ').trim().slice(0, 55)
    wrapText(ctx, quote + (quote.length >= 55 ? '…' : ''), 115, y + 32, W - 190, 24, 2)
    y += 85
  })

  // 分割线
  ctx.fillStyle = '#1e293b'
  ctx.fillRect(50, y + 5, W - 100, 2)
  y += 45

  // 5维度雷达图（与页面雷达图呼应）
  const scored = (sheet?.items || []).filter(
    (it) => Number.isFinite(it.score_a) && Number.isFinite(it.score_b)
  )
  if (scored.length >= 3) {
    ctx.font = '13px "Press Start 2P", monospace'
    ctx.fillStyle = '#22d3ee'
    ctx.fillText('SCORE RADAR', 60, y)
    y += 30
    drawRadar(ctx, scored, W / 2, y + 85, 78)
    // 图例
    ctx.font = 'bold 13px sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = '#22d3ee'
    ctx.fillText(`■ ${optA.slice(0, 10)}`, W / 2 - 130, y + 195)
    ctx.fillStyle = '#ffd700'
    ctx.fillText(`■ ${optB.slice(0, 10)}`, W / 2 + 30, y + 195)
    y += 220
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(50, y, W - 100, 2)
    y += 45
  }

  // 倾向条
  ctx.font = '13px "Press Start 2P", monospace'
  ctx.fillStyle = '#ffd700'
  ctx.fillText('FINAL LEAN', 60, y)
  y += 40
  const barW = W - 120
  ctx.fillStyle = '#22d3ee'
  ctx.fillRect(60, y, (barW * pctA) / 100, 26)
  ctx.fillStyle = '#ffd700'
  ctx.fillRect(60 + (barW * pctA) / 100, y, (barW * pctB) / 100, 26)
  ctx.fillStyle = '#0b1220'
  ctx.font = 'bold 11px "Press Start 2P", monospace'
  ctx.fillText(`${pctA}%`, 70, y + 18)
  ctx.textAlign = 'right'
  ctx.fillText(`${pctB}%`, W - 70, y + 18)
  ctx.textAlign = 'left'
  y += 50
  ctx.fillStyle = '#22d3ee'
  ctx.font = 'bold 15px sans-serif'
  ctx.fillText(optA.slice(0, 12), 60, y)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#ffd700'
  ctx.fillText(optB.slice(0, 12), W - 60, y)
  ctx.textAlign = 'left'
  y += 45

  // 分歧与共识
  ctx.font = '13px "Press Start 2P", monospace'
  ctx.fillStyle = '#22d3ee'
  ctx.fillText('SUMMARY', 60, y)
  y += 36
  ctx.fillStyle = '#cbd5e1'
  ctx.font = '15px sans-serif'
  const sum = (sheet?.summary || '').replace(/\s+/g, ' ').trim()
  y = wrapText(ctx, sum, 60, y, W - 120, 26, 5)
  y += 15

  // 结论
  ctx.font = '13px "Press Start 2P", monospace'
  ctx.fillStyle = '#22d3ee'
  ctx.fillText('RECOMMENDATION', 60, y)
  y += 36
  ctx.fillStyle = '#e2e8f0'
  ctx.font = '16px sans-serif'
  const rec = (sheet?.recommendation || '').replace(/\s+/g, ' ').trim()
  y = wrapText(ctx, rec, 60, y, W - 120, 28, 6)

  // 底部品牌
  ctx.textAlign = 'center'
  ctx.fillStyle = '#475569'
  ctx.font = '11px "Press Start 2P", monospace'
  ctx.fillText('THREE-WAY DEBATE · DECISION COACH', W / 2, H - 50)
}

/** 导出像素风战报 PNG */
async function exportBattleReport({ debateId, question, sheet }) {
  // 等待网络像素字体加载完成，避免Canvas标题fallback
  try {
    await document.fonts.load('30px "Press Start 2P"')
    await document.fonts.ready
  } catch {
    /* 字体加载失败不阻塞导出 */
  }
  const [stateResp, agentsResp] = await Promise.all([
    fetch(`/api/debate/${debateId}/state`).then((r) => r.json()),
    fetch(`/api/agents`).then((r) => r.json()),
  ])
  const meta = {}
  agentsResp.forEach((a) => { meta[a.role] = a })
  // 每方金句 = 该方最长的一条发言（内容最丰富的往往最有代表性）
  const quotes = {}
  for (const m of stateResp.history || []) {
    if (m.role === 'user' || m.round === 'Q') continue
    const prev = quotes[m.role]
    if (!prev || (m.content || '').length > (prev.content || '').length) {
      quotes[m.role] = m
    }
  }
  const optA = sheet?.options?.[0] || '选项A'
  const optB = sheet?.options?.[1] || '选项B'
  const scored = (sheet?.items || []).filter(
    (it) => Number.isFinite(it.score_a) && Number.isFinite(it.score_b)
  )
  const sumA = scored.reduce((s, it) => s + it.score_a, 0)
  const sumB = scored.reduce((s, it) => s + it.score_b, 0)
  const total = sumA + sumB
  const pctA = total > 0 ? Math.round((sumA / total) * 100) : 50
  const pctB = 100 - pctA

  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = 1250
  const ctx = canvas.getContext('2d')
  drawReport(ctx, { question, sheet, quotes, meta, pctA, pctB, optA, optB })
  const url = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url
  a.download = `辩论战报-${question.slice(0, 10)}.png`
  a.click()
}

/**
 * 决策平衡单：
 * - 挂载时向后端请求生成（有缓存则直接用）
 * - 表格对比 + 分歧总结 + 条件化建议
 */
export default function BalanceSheetView({
  debateId,
  question,
  initialSheet,
  onSheetReady,
  onRestart,
}) {
  const [sheet, setSheet] = useState(initialSheet)
  const [loading, setLoading] = useState(!initialSheet)
  const [error, setError] = useState('')
  // 追问状态
  const [followups, setFollowups] = useState([]) // [{q, ok?, error?}]
  const [followupInput, setFollowupInput] = useState('')
  const [followupLoading, setFollowupLoading] = useState(false)
  const [sheetVersion, setSheetVersion] = useState(0) // 变化时触发评分条动画重放
  const [exporting, setExporting] = useState(false) // 战报导出中
  const [profile, setProfile] = useState(null) // 跨会话用户决策画像（长期记忆可视化）

  /** 导出像素风战报图 */
  const handleExportReport = async () => {
    if (exporting || !sheet) return
    setExporting(true)
    try {
      await exportBattleReport({ debateId, question, sheet })
    } catch (e) {
      setError(e.message || '战报导出失败')
    } finally {
      setExporting(false)
    }
  }

  /** 提交追问：POST 后端 → 更新平衡单 → 动画重放 */
  const handleFollowup = async (q) => {
    const text = (q || '').trim()
    if (!text || followupLoading || !sheet) return
    setFollowupLoading(true)
    setFollowupInput('')
    setFollowups((prev) => [...prev, { q: text }])
    try {
      const resp = await fetch(`/api/debate/${debateId}/balance-sheet/followup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, old_sheet: sheet }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.detail || `追问失败 (${resp.status})`)
      }
      const data = await resp.json()
      setSheet(data)
      onSheetReady(data)
      setSheetVersion((v) => v + 1)
      setFollowups((prev) =>
        prev.map((f, i) =>
          i === prev.length - 1 ? { ...f, ok: true, answer: data.summary } : f
        )
      )
    } catch (e) {
      setFollowups((prev) =>
        prev.map((f, i) =>
          i === prev.length - 1 ? { ...f, error: e.message || '追问失败' } : f
        )
      )
    } finally {
      setFollowupLoading(false)
    }
  }

  useEffect(() => {
    if (initialSheet) return
    let alive = true
    const fetchSheet = async () => {
      setLoading(true)
      setError('')
      try {
        const resp = await fetch(`/api/debate/${debateId}/balance-sheet`, {
          method: 'POST',
        })
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}))
          throw new Error(err.detail || `生成失败 (${resp.status})`)
        }
        const data = await resp.json()
        if (alive) {
          setSheet(data)
          onSheetReady(data)
        }
      } catch (e) {
        if (alive) setError(e.message || '生成平衡单失败')
      } finally {
        if (alive) setLoading(false)
      }
    }
    fetchSheet()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debateId])

  // 跨会话用户画像（长期记忆可视化，失败静默）
  useEffect(() => {
    fetch('/api/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.has_profile) setProfile(d) })
      .catch(() => {})
  }, [])

  // 打字机：summary 先打完，recommendation 再接力（hooks 必须在提前 return 之前）
  const { shown: summaryShown, done: summaryDone } = useTypewriter(sheet?.summary || '', 28, !!sheet)
  const { shown: recShown, done: recDone } = useTypewriter(sheet?.recommendation || '', 28, summaryDone)

  if (loading) {
    return (
      <div className="sheet-page" style={{ textAlign: 'center', paddingTop: 120 }}>
        <h2>PROCESSING...</h2>
        <p className="question-line" style={{ marginBottom: 24 }}>
          决策顾问正在阅读整场辩论记录，为你提炼平衡单
        </p>
        <div className="loading-dots" style={{ fontSize: 40, color: 'var(--accent)' }}>
          <span>●</span>
          <span>●</span>
          <span>●</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="sheet-page" style={{ textAlign: 'center', paddingTop: 120 }}>
        <h2>FAILED</h2>
        <p className="question-line" style={{ color: '#f87171', marginBottom: 24 }}>
          {error}
        </p>
        <div className="sheet-actions" style={{ justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            RETRY
          </button>
          <button className="btn btn-ghost" onClick={onRestart}>
            NEW GAME
          </button>
        </div>
      </div>
    )
  }

  const optA = sheet.options?.[0] || '选项A'
  const optB = sheet.options?.[1] || '选项B'

  // ---- 评分可视化（降级容错：无分数的维度不画条）----
  const hasScore = (v) => Number.isFinite(v) && v >= 1 && v <= 10
  const scored = (sheet.items || []).filter((it) => hasScore(it.score_a) && hasScore(it.score_b))
  const sumA = scored.reduce((s, it) => s + it.score_a, 0)
  const sumB = scored.reduce((s, it) => s + it.score_b, 0)
  const total = sumA + sumB
  const pctA = total > 0 ? Math.round((sumA / total) * 100) : 50
  const pctB = 100 - pctA
  const leanSide = pctA === pctB ? '势均力敌' : pctA > pctB ? optA : optB

  return (
    <div className="sheet-page">
      <h2>QUEST RESULT · 决策平衡单</h2>
      <p className="question-line">问题：{question}</p>

      {/* 跨会话决策画像：Agent 长期记忆的可视化证明 */}
      {profile?.has_profile && (
        <div className="profile-card">
          <div className="profile-head">
            <span className="profile-icon">🧠</span>
            <b>决策者画像</b>
            <span className="profile-count">
              沉淀自 {profile.debates_count} 场辩论 · 顾问已读取
            </span>
          </div>
          <div className="profile-body">
            {profile.profile.decision_style && (
              <div className="profile-row">
                <span className="profile-label">决策风格</span>
                <span>{profile.profile.decision_style}</span>
              </div>
            )}
            {profile.profile.risk_appetite && (
              <div className="profile-row">
                <span className="profile-label">风险态度</span>
                <span>{profile.profile.risk_appetite}</span>
              </div>
            )}
            {profile.profile.focus_dimensions?.length > 0 && (
              <div className="profile-row">
                <span className="profile-label">关注维度</span>
                <span className="profile-chips">
                  {profile.profile.focus_dimensions.slice(0, 4).map((d, i) => (
                    <span key={i} className="profile-chip">{d}</span>
                  ))}
                </span>
              </div>
            )}
            {profile.profile.past_decisions?.length > 0 && (
              <div className="profile-row">
                <span className="profile-label">历史决策</span>
                <span className="profile-decisions">
                  {profile.profile.past_decisions.map((d, i) => (
                    <span key={i} className="profile-decision">
                      「{d.question}」→ {d.lean}
                    </span>
                  ))}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="vs-board">
        <div className="vs-header">
          <span className="vs-name a">{optA}</span>
          <span className="vs-badge">VS</span>
          <span className="vs-name b">{optB}</span>
        </div>

        {/* 综合倾向罗盘：总分占比天平 */}
        {scored.length > 0 && (
          <div className="compass">
            <span className="compass-pct a">{pctA}%</span>
            <div className="compass-bar">
              <div className="compass-fill a" style={{ width: `${pctA}%` }} />
              <div className="compass-fill b" style={{ width: `${pctB}%` }} />
            </div>
            <span className="compass-pct b">{pctB}%</span>
            <div className="compass-lean">
              ⚖️ 综合倾向：<b>{leanSide}</b>
              {pctA === pctB ? '' : `（${Math.abs(pctA - pctB)}% 优势）`}
            </div>
          </div>
        )}

        {/* 五维雷达图：两选项轮廓同图对比 */}
        {scored.length >= 3 && (
          <div className="radar-card">
            <RadarChart items={scored} optA={optA} optB={optB} version={sheetVersion} />
          </div>
        )}

        {sheet.items?.map((item, i) => (
          <div className="vs-row" key={`${i}-${sheetVersion}`} style={{ '--d': `${0.15 + i * 0.12}s` }}>
            <div className="vs-cell a">
              {item.option_a}
              {hasScore(item.score_a) && (
                <div className="score-bar">
                  <div className="score-fill a" style={{ width: `${item.score_a * 10}%` }}>
                    <span className="score-num">{item.score_a}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="vs-dim">
              <span className="dim-icon">{DIM_ICON[item.dimension] || '📌'}</span>
              {item.dimension}
            </div>
            <div className="vs-cell b">
              {item.option_b}
              {hasScore(item.score_b) && (
                <div className="score-bar">
                  <div className="score-fill b" style={{ width: `${item.score_b * 10}%` }}>
                    <span className="score-num">{item.score_b}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card sheet-section">
        <h3>🔀 三方分歧与共识</h3>
        <p>
          {summaryShown}
          {!summaryDone && <span className="type-cursor">▌</span>}
        </p>
      </div>

      <div className="card sheet-section">
        <h3>🧭 决策建议</h3>
        <p>
          {summaryDone ? recShown : ''}
          {summaryDone && !recDone && <span className="type-cursor">▌</span>}
        </p>
      </div>

      {/* 追问区：提交偏好/新约束，平衡单动态更新 */}
      <div className="card followup-section">
        <h3>💬 继续追问</h3>
        <p className="followup-hint">
          告诉顾问你的偏好或新约束，平衡单和评分将动态更新
        </p>

        {followups.length > 0 && (
          <div className="followup-history">
            {followups.map((f, i) => (
              <div className="followup-item" key={i}>
                <div className="followup-q-row">
                  <span className="followup-q">❓ {f.q}</span>
                  {f.ok && <span className="followup-ok">✓ 平衡单已更新</span>}
                  {f.error && <span className="followup-err">{f.error}</span>}
                  {i === followups.length - 1 && followupLoading && (
                    <span className="followup-loading">
                      <span className="loading-dots">
                        <span>●</span><span>●</span><span>●</span>
                      </span>
                    </span>
                  )}
                </div>
                {f.ok && f.answer && (
                  <div className="followup-answer">💡 {f.answer}</div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="followup-chips">
          {QUICK_ASKS.map((q) => (
            <span
              key={q}
              className={`chip ${followupLoading ? 'disabled' : ''}`}
              onClick={() => !followupLoading && handleFollowup(q)}
            >
              {q}
            </span>
          ))}
        </div>

        <div className="followup-input-row">
          <input
            className="followup-input"
            value={followupInput}
            onChange={(e) => setFollowupInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleFollowup(followupInput)
            }}
            placeholder="例如：如果我更看重成长空间呢？"
            disabled={followupLoading}
          />
          <button
            className="btn btn-primary"
            onClick={() => handleFollowup(followupInput)}
            disabled={followupLoading || !followupInput.trim()}
          >
            {followupLoading ? '...' : '发送'}
          </button>
        </div>
      </div>

      <div className="sheet-actions">
        <button className="btn btn-primary" onClick={onRestart}>
          ⚔️ NEW GAME
        </button>
        <button
          className="btn btn-ghost"
          onClick={handleExportReport}
          disabled={exporting || !sheet}
        >
          {exporting ? '生成中…' : '📥 导出战报'}
        </button>
      </div>
    </div>
  )
}