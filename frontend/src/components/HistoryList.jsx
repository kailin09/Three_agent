import { useEffect, useState } from 'react'

const ROLE_COLOR = {
  pragmatist: '#3b82f6',
  idealist: '#10b981',
  risk: '#f59e0b',
  user: 'var(--user)',
}

/** 格式化时间：2026-10-25T09:59:39 → 10-25 09:59 */
function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * 历史辩论列表（手风琴展开查看发言记录）
 * 数据来源：GET /api/debates + GET /api/debate/{id}/state
 */
export default function HistoryList({ onBack, onOpenSheet }) {
  const [debates, setDebates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [detail, setDetail] = useState(null) // 展开项的发言记录
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    fetch('/api/debates?limit=50')
      .then((r) => r.json())
      .then((data) => {
        setDebates(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => {
        setError('无法加载历史记录，请确认后端已启动')
        setLoading(false)
      })
  }, [])

  const toggle = async (id) => {
    if (expandedId === id) {
      setExpandedId(null)
      setDetail(null)
      return
    }
    setExpandedId(id)
    setDetail(null)
    setDetailLoading(true)
    try {
      const resp = await fetch(`/api/debate/${id}/state`)
      const data = await resp.json()
      setDetail(data)
    } catch {
      setError('加载辩论详情失败')
    } finally {
      setDetailLoading(false)
    }
  }

  return (
    <div className="input-page">
      <div className="card input-card" style={{ maxWidth: 680 }}>
        <h1>📜 DEBATE HISTORY</h1>
        <p className="subtitle">历史辩论记录——重启不丢失，随时回看</p>

        <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: 16 }}>
          ← 返回
        </button>

        {loading && <p className="system-line">LOADING...</p>}
        {error && <p style={{ color: '#f87171', fontSize: 14 }}>{error}</p>}
        {!loading && !error && debates.length === 0 && (
          <p className="system-line">还没有辩论记录，去开始第一场吧</p>
        )}

        <div className="history-list">
          {debates.map((d) => (
            <div key={d.id} className={`history-item ${expandedId === d.id ? 'open' : ''}`}>
              <div className="history-head" onClick={() => toggle(d.id)}>
                <div className="history-question">⚔️ {d.question}</div>
                <div className="history-meta">
                  <span className={`history-state ${d.state}`}>{d.state}</span>
                  {d.plan?.suggested_rounds && <span>{d.plan.suggested_rounds}轮</span>}
                  <span>{fmtTime(d.created_at)}</span>
                </div>
              </div>

              {expandedId === d.id && (
                <div className="history-detail">
                  {d.plan?.rounds_focus?.length > 0 && (
                    <div className="history-plan">
                      🎬 导演规划：{d.plan.rounds_focus.join(' / ')}
                    </div>
                  )}
                  {detailLoading && <p className="system-line">加载发言记录...</p>}
                  {detail?.history?.map((m, i) => (
                    <div
                      key={i}
                      className="history-msg"
                      style={{ '--msg-color': ROLE_COLOR[m.role] || 'var(--text-dim)' }}
                    >
                      <b>{m.name}</b>
                      {m.round && m.round !== 'Q' && (
                        <span className="history-round">R{m.round}</span>
                      )}
                      <p>{m.content}</p>
                    </div>
                  ))}
                  {detail && !detailLoading && (
                    <button
                      className="btn btn-primary"
                      style={{ marginTop: 12, width: '100%', justifyContent: 'center' }}
                      onClick={() =>
                        onOpenSheet({ debate_id: d.id, question: d.question })
                      }
                    >
                      📋 生成平衡单
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}