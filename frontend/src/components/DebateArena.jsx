import { useEffect, useMemo, useRef, useState } from 'react'
import DebateScene from './DebateScene.jsx'

/** 工具元数据映射（图标 + 中文标签） */
const TOOL_META = {
  calculator: { icon: '🧮', label: '计算器' },
  get_current_date: { icon: '📅', label: '日期查询' },
  risk_simulate: { icon: '🎲', label: '风险模拟' },
  career_path: { icon: '🧭', label: '职业路径' },
  sensitivity_analysis: { icon: '📊', label: '敏感性分析' },
}

/** 钢铁人反驳点名检测：辩手复述环节固定为「XX提到/指出/认为…」格式 */
function buildRebuttalRegex(nameToRole) {
  const names = Object.keys(nameToRole).join('|')
  return new RegExp(`(${names})[^。！？\\n]{0,6}(提到|指出|认为|强调|反驳|质疑)`)
}

/**
 * 辩论现场（左右布局）：
 * - 左侧：房间场景（沙发 + 办公桌），辩论开始时人物走向办公桌
 * - 右侧：SSE 实时讨论内容 + 用户插话 + 叫停
 */
export default function DebateArena({ debate, onConclude }) {
  const { debate_id, question, max_rounds, agents } = debate
  const [messages, setMessages] = useState([]) // 气泡列表
  const [speakingRole, setSpeakingRole] = useState(null) // 当前发言的 Agent
  const [ended, setEnded] = useState(false)
  const [input, setInput] = useState('')
  const [concluding, setConcluding] = useState(false)
  const messagesEndRef = useRef(null)
  const msgIdRef = useRef(0)
  const messagesRef = useRef(null) // 滚动容器
  const atBottomRef = useRef(true) // 用户是否在底部附近（ref 避免 onScroll 频繁 re-render）
  const [showNewMsg, setShowNewMsg] = useState(false) // 滚上去看历史时有新消息 → 显示提示
  // ---- SSE 断线重连 ----
  const [sseReconnecting, setSseReconnecting] = useState(false) // 断线提示条
  const hadErrorRef = useRef(false) // 是否发生过连接错误（区分首次onopen与重连onopen）
  const endedRef = useRef(false) // 辩论是否已结束（ref供SSE闭包读取）
  // ---- 交锋连线：token流检测钢铁人反驳点名 ----
  const [rebuttal, setRebuttal] = useState(null) // {from, to} 当前谁在反驳谁
  const streamBufRef = useRef({}) // 每个辩手的流式文本累积缓存
  const rebuttalDoneRef = useRef({}) // 该辩手本轮是否已检测到点名（防重复set）
  const nameToRole = useMemo(() => {
    const m = {}
    agents.forEach((a) => { m[a.name.split(' · ')[0]] = a.role })
    return m
  }, [agents])
  const rebuttalRegex = useMemo(() => buildRebuttalRegex(nameToRole), [nameToRole])

  // ---- SSE 订阅 ----
  useEffect(() => {
    const es = new EventSource(`/api/debate/${debate_id}/stream`)

    es.onmessage = (e) => {
      let data
      try {
        data = JSON.parse(e.data)
      } catch {
        return
      }
      switch (data.type) {
        case 'speech_start':
          msgIdRef.current += 1
          setMessages((prev) => [
            ...prev,
            {
              id: `m${msgIdRef.current}`,
              role: data.role,
              name: data.name,
              avatar: data.avatar,
              color: data.color,
              round: data.round,
              content: '',
              streaming: true,
            },
          ])
          setSpeakingRole(data.role)
          // 新发言开始：重置该辩手的流式缓存与点名检测，清除上一条连线
          streamBufRef.current[data.role] = ''
          rebuttalDoneRef.current[data.role] = false
          setRebuttal(null)
          break

        case 'token': {
          // 交锋连线：累积流式文本，检测「XX提到…」钢铁人复述点名
          if (!rebuttalDoneRef.current[data.role]) {
            streamBufRef.current[data.role] =
              (streamBufRef.current[data.role] || '') + data.content
            const m = streamBufRef.current[data.role].match(rebuttalRegex)
            if (m && nameToRole[m[1]] !== data.role) {
              rebuttalDoneRef.current[data.role] = true
              setRebuttal({ from: data.role, to: nameToRole[m[1]] })
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.role === data.role && msg.streaming
                    ? { ...msg, rebuttalTo: m[1] }
                    : msg
                )
              )
            }
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.role === data.role && m.streaming
                ? { ...m, content: m.content + data.content }
                : m
            )
          )
          break
        }

        case 'speech_end':
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.role === data.role && m.streaming)
            if (idx >= 0) {
              // 正常流式结束：关闭光标；并行模式下token可能丢失，用完整内容覆盖更可靠
              const copy = [...prev]
              copy[idx] = { ...copy[idx], streaming: false, content: data.content || copy[idx].content }
              return copy
            }
            // 重连补偿：直接补一条完整气泡
            if (data.content) {
              msgIdRef.current += 1
              return [
                ...prev,
                {
                  id: `m${msgIdRef.current}`,
                  role: data.role,
                  name: data.name,
                  avatar: data.avatar,
                  color: data.color,
                  round: data.round,
                  content: data.content,
                  streaming: false,
                },
              ]
            }
            return prev
          })
          setSpeakingRole(null)
          // 发言结束：连线消失
          setRebuttal(null)
          break

        case 'speech_revise':
          // 立场自检发现偏离并修正：替换该辩手最后一条气泡的内容
          setMessages((prev) => {
            for (let i = prev.length - 1; i >= 0; i--) {
              if (prev[i].role === data.role && prev[i].content) {
                const copy = [...prev]
                copy[i] = { ...copy[i], content: data.content }
                return copy
              }
            }
            return prev
          })
          break

        case 'reflection':
          // 立场自检结果：在辩手气泡上标记反思徽标（Agent自我反思的可视化）
          setMessages((prev) => {
            for (let i = prev.length - 1; i >= 0; i--) {
              if (prev[i].role === data.role && prev[i].content) {
                const copy = [...prev]
                copy[i] = {
                  ...copy[i],
                  reflection: { held: data.stance_held, revised: data.revised },
                }
                return copy
              }
            }
            return prev
          })
          break

        case 'interjection':
          msgIdRef.current += 1
          setMessages((prev) => [
            ...prev,
            {
              id: `u${msgIdRef.current}`,
              role: 'user',
              name: '你',
              content: data.content,
              streaming: false,
            },
          ])
          break

        case 'tool_call':
          // Agent 决定调用工具：在当前发言气泡内追加工具卡片（pending 状态）
          setMessages((prev) =>
            prev.map((m) =>
              m.role === data.role && m.streaming
                ? {
                    ...m,
                    tools: [
                      ...(m.tools || []),
                      { name: data.tool, arguments: data.arguments, pending: true },
                    ],
                  }
                : m
            )
          )
          break

        case 'tool_result':
          // 工具执行完成：更新对应卡片为 done 状态并填入结果
          setMessages((prev) =>
            prev.map((m) => {
              if (m.role !== data.role || !m.streaming) return m
              const tools = (m.tools || []).map((t) =>
                t.pending && t.name === data.tool
                  ? { ...t, result: data.result, pending: false }
                  : t
              )
              return { ...m, tools }
            })
          )
          break

        case 'quick_reply_start':
          msgIdRef.current += 1
          setMessages((prev) => [
            ...prev,
            {
              id: `q${msgIdRef.current}`,
              role: 'system',
              name: '系统',
              content: '💬 三位辩手正在回应你的插话…',
              streaming: false,
            },
          ])
          break

        case 'quick_reply_end':
          break

        case 'debate_plan':
          msgIdRef.current += 1
          setMessages((prev) => [
            ...prev,
            {
              id: `p${msgIdRef.current}`,
              role: 'plan',
              plan: data.plan,
              actualRounds: data.actual_rounds,
              industry: data.industry,
            },
          ])
          break

        case 'round_plan':
          msgIdRef.current += 1
          setMessages((prev) => [
            ...prev,
            {
              id: `r${msgIdRef.current}`,
              role: 'round',
              round: data.round,
              speakers: data.speakers,
              focusHint: data.focus_hint,
            },
          ])
          break

        case 'early_conclude':
          msgIdRef.current += 1
          setMessages((prev) => [
            ...prev,
            {
              id: `ec${msgIdRef.current}`,
              role: 'system',
              name: '导演',
              content: `🎬 导演判定：${data.reason}（已完成${data.completed_rounds}轮，提前收束）`,
              streaming: false,
            },
          ])
          break

        case 'concluding':
          setConcluding(true)
          break

        case 'debate_end':
          setEnded(true)
          endedRef.current = true
          setSpeakingRole(null)
          setSseReconnecting(false)
          es.close()
          break

        case 'stream_end':
          es.close()
          break

        case 'error':
          msgIdRef.current += 1
          setMessages((prev) => [
            ...prev,
            {
              id: `e${msgIdRef.current}`,
              role: 'system',
              name: '系统',
              content: data.content,
              streaming: false,
            },
          ])
          break
      }
    }

    // ---- 断线重连补偿：拉取完整状态，补齐断线期间丢失的发言 ----
    const resync = async () => {
      try {
        const resp = await fetch(`/api/debate/${debate_id}/state`)
        if (!resp.ok) return
        const data = await resp.json()
        const meta = {}
        agents.forEach((a) => { meta[a.role] = a })
        setMessages((prev) => {
          const existing = new Set(
            prev.filter((m) => m.content).map((m) => m.content)
          )
          const additions = []
          for (const m of data.history || []) {
            if (m.role === 'user' || m.round === 'Q') continue
            if (existing.has(m.content)) continue
            const info = meta[m.role] || {}
            msgIdRef.current += 1
            additions.push({
              id: `rs${msgIdRef.current}`,
              role: m.role,
              name: m.name,
              avatar: info.avatar || '🗣️',
              color: info.color || '#94a3b8',
              round: m.round,
              content: m.content,
              streaming: false,
            })
          }
          return additions.length ? [...prev, ...additions] : prev
        })
      } catch {
        /* 补偿失败不影响重连 */
      }
    }

    es.onopen = () => {
      if (hadErrorRef.current) {
        hadErrorRef.current = false
        resync() // 重连成功：补齐断线期间丢失的发言
      }
      setSseReconnecting(false)
    }

    es.onerror = () => {
      if (endedRef.current) {
        es.close()
        return
      }
      hadErrorRef.current = true
      setSseReconnecting(true)
      // EventSource 会自动重连，无需手动重建
    }

    return () => es.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debate_id])

  // ---- 智能滚动：用户在底部附近才自动跟随，滚上去看历史时不打扰 ----
  useEffect(() => {
    if (atBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      setShowNewMsg(false)
    } else {
      // 用户正在看历史，有新内容到达 → 显示提示按钮
      setShowNewMsg(true)
    }
  }, [messages])

  const handleScroll = () => {
    const el = messagesRef.current
    if (!el) return
    // 距底部 80px 以内视为"在底部"
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (atBottomRef.current) setShowNewMsg(false)
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    atBottomRef.current = true
    setShowNewMsg(false)
  }

  // ---- 用户插话 ----
  const sendInterjection = async () => {
    const text = input.trim()
    if (!text || ended) return
    setInput('')
    scrollToBottom() // 用户发插话后回到底部跟随新发言
    try {
      await fetch(`/api/debate/${debate_id}/interject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
    } catch {
      /* 插话失败不阻塞体验 */
    }
  }

  // ---- 叫停辩论 ----
  const stopDebate = async () => {
    if (ended) return
    setConcluding(true)
    try {
      await fetch(`/api/debate/${debate_id}/conclude`, { method: 'POST' })
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="debate-page">
      {/* 左：辩论场景 */}
      <aside className="scene-panel">
        <DebateScene
          agents={agents}
          ended={ended}
          speakingRole={speakingRole}
          rebuttal={rebuttal}
        />
        <div className="scene-legend">
          {agents.map((a) => (
            <div
              key={a.role}
              className={`legend-item ${speakingRole === a.role ? 'on' : ''}`}
              style={{ '--fig-color': a.color }}
            >
              <span className="avatar">{a.avatar}</span>
              <div className="meta">
                <b>{a.name}</b>
                <small>{a.stance}</small>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* 右：讨论内容 */}
      <section className="chat-panel">
        <div className="chat-header">
          <div className="question">⚔️ {question}</div>
          <div className="rounds-info">MAX ROUND {max_rounds} · 可随时插话或叫停</div>
        </div>

        {/* SSE 断线重连提示条 */}
        {sseReconnecting && (
          <div className="sse-reconnect-bar">⚡ 连接中断，正在重连…</div>
        )}

        {/* 消息流 */}
        <div className="messages" ref={messagesRef} onScroll={handleScroll}>
          <div className="system-line">
            DEBATE START · 三位辩手已就座
          </div>
          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="msg user">
                <div className="user-bubble">
                  <span className="tag">🎤 你插话</span>
                  {m.content}
                </div>
              </div>
            ) : m.role === 'system' ? (
              <div key={m.id} className="system-line">⚠️ {m.content}</div>
            ) : m.role === 'plan' ? (
              <div key={m.id} className="plan-card">
                <div className="plan-title">🎬 辩论导演规划</div>
                {m.industry && m.industry !== '通用' && (
                  <span className="industry-tag">📦 已加载{m.industry}行业知识包</span>
                )}
                <div className="plan-rounds">
                  建议 <b>{m.actualRounds}</b> 轮
                </div>
                {m.plan?.rounds_focus?.length > 0 && (
                  <ol className="plan-focus-list">
                    {m.plan.rounds_focus.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ol>
                )}
                {m.plan?.reason && (
                  <div className="plan-reason">{m.plan.reason}</div>
                )}
              </div>
            ) : m.role === 'round' ? (
              <div key={m.id} className="round-divider">
                <span className="round-num">第 {m.round} 轮</span>
                {m.focusHint && (
                  <span className="round-focus">🎯 {m.focusHint}</span>
                )}
                {m.speakers?.length > 0 && (
                  <span className="round-order">
                    {m.speakers
                      .map((r) => agents.find((a) => a.role === r)?.name?.split(' ')[0] || r)
                      .join(' → ')}
                  </span>
                )}
              </div>
            ) : (
              <div key={m.id} className={`msg ${m.streaming ? 'speaking-now' : ''}`} style={{ '--agent-color': m.color }}>
                <div className="avatar-box">{m.avatar}</div>
                <div className="body">
                  <div className="name-row">
                    <b>{m.name}</b>
                    {m.rebuttalTo && (
                      <span className="rebuttal-tag">⚔️→{m.rebuttalTo}</span>
                    )}
                    {m.round === 'Q' ? (
                      <span className="round-tag quick">💬回应</span>
                    ) : (
                      m.round && <span className="round-tag">R{m.round}</span>
                    )}
                    {m.reflection && (m.reflection.held || m.reflection.revised) && (
                      <span className={`reflection-tag ${m.reflection.held ? 'held' : 'revised'}`}>
                        {m.reflection.held ? '🪞立场守住' : '🪞偏离→已修正'}
                      </span>
                    )}
                  </div>
                  <div className="bubble">
                    {m.tools?.length > 0 && (
                      <div className="tool-list">
                        {m.tools.map((t, ti) => {
                          const meta = TOOL_META[t.name] || { icon: '🔧', label: t.name }
                          const multi = !t.pending && typeof t.result === 'string' && t.result.includes('\n')
                          return (
                            <div key={ti} className={`tool-card ${t.pending ? 'pending' : 'done'} ${multi ? 'multi' : ''}`}>
                              <div className="tool-head">
                                <span className="tool-icon">{meta.icon}</span>
                                <span className="tool-label">{meta.label}</span>
                                {t.pending && <span className="tool-status">执行中…</span>}
                              </div>
                              {!t.pending && (
                                <span className="tool-result">{t.result}</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {m.content}
                    {m.streaming && <span className="cursor" />}
                  </div>
                </div>
              </div>
            )
          )}
          {ended && (
            <div className="system-line">DEBATE END · 可以生成决策平衡单了</div>
          )}
          {/* 滚上去看历史时，悬浮提示新消息 */}
          {showNewMsg && (
            <button className="new-msg-btn" onClick={scrollToBottom}>
              ↓ 最新发言
            </button>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 底部操作栏 */}
        <div className="composer">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendInterjection()}
            placeholder={
              ended ? '辩论已结束…' : '随时插话追问，例如：那如果家里能给支持呢？'
            }
            disabled={ended}
          />
          {!ended ? (
            <>
              <button
                className="btn btn-ghost"
                onClick={sendInterjection}
                disabled={!input.trim()}
              >
                💬 插话
              </button>
              <button
                className="btn btn-danger"
                onClick={stopDebate}
                disabled={concluding}
              >
                {concluding ? '结算中…' : '⏹ 叫停'}
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={onConclude}>
              📋 生成平衡单
            </button>
          )}
        </div>
      </section>
    </div>
  )
}