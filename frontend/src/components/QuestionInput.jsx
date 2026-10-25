import { useState } from 'react'

const EXAMPLES = [
  '该考研还是直接工作？',
  '该留在大城市还是回老家发展？',
  '该接受降薪去心仪的公司吗？',
  '30岁该不该转行做程序员？',
  '该租房还是咬牙买房？',
]

/** 三位常驻辩手 */
const FIGHTERS = [
  { avatar: '📊', name: '老陈', stance: '务实派', color: '#3b82f6', motto: '算清每一笔账' },
  { avatar: '🌱', name: '小林', stance: '理想派', color: '#10b981', motto: '热爱驱动成长' },
  { avatar: '🛡️', name: '赵姐', stance: '风险派', color: '#f59e0b', motto: '先想最坏情况' },
]

export default function QuestionInput({ onStart, onHistory }) {
  const [question, setQuestion] = useState('')
  const [rounds, setRounds] = useState(3)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const start = async () => {
    if (!question.trim()) return
    setLoading(true)
    setError('')
    try {
      const resp = await fetch('/api/debate/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), rounds }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error(err.detail || `请求失败 (${resp.status})`)
      }
      const data = await resp.json()
      onStart(data)
    } catch (e) {
      setError(e.message || '无法连接服务器，请确认后端已启动')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="input-page">
      {/* 漂浮像素粒子背景 */}
      <div className="pix-bg" aria-hidden="true">
        {[...Array(12)].map((_, i) => (
          <span key={i} className="pix-dot" style={{ '--i': i }} />
        ))}
      </div>

      <div className="card input-card">
        <div className="title-row">
          <span className="title-deco left" />
          <h1 data-text="DECISION ARENA">DECISION ARENA</h1>
          <span className="title-deco right" />
        </div>
        <p className="subtitle">
          三方辩论 · 决策陪练 —— 提出一个两难决策，三位辩手将现场交锋。你可以随时插话追问，最后生成一份决策平衡单。
        </p>

        {/* 三位辩手介绍 */}
        <div className="fighters-row">
          {FIGHTERS.map((f) => (
            <div
              key={f.stance}
              className="fighter-card"
              style={{ '--fc': f.color }}
            >
              <span className="fighter-avatar">{f.avatar}</span>
              <div className="fighter-info">
                <b>{f.name}</b>
                <span className="fighter-stance">{f.stance}</span>
                <small>{f.motto}</small>
              </div>
            </div>
          ))}
        </div>

        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="例如：我今年大三，拿到了一个还不错的offer，但家里希望我考研，该考研还是工作？"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) start()
          }}
        />

        <div className="rounds-row">
          <span className="label-text">ROUNDS</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className={`chip ${rounds === n ? 'active' : ''}`}
              onClick={() => setRounds(n)}
            >
              {n}
            </span>
          ))}
        </div>

        {error && (
          <p style={{ color: '#f87171', fontSize: 14, marginBottom: 14 }}>{error}</p>
        )}

        <button
          className="btn btn-primary"
          onClick={start}
          disabled={loading || !question.trim()}
          style={{ width: '100%', justifyContent: 'center', padding: '13px' }}
        >
          {loading ? (
            <span className="loading-dots">
              LOADING<span>.</span><span>.</span><span>.</span>
            </span>
          ) : (
            '⚔️ START'
          )}
        </button>

        <button
          className="btn btn-ghost"
          onClick={onHistory}
          style={{ width: '100%', justifyContent: 'center', marginTop: 10, padding: '10px' }}
        >
          📜 历史辩论
        </button>

        <div className="examples">
          <div className="label">没有灵感？试试这些</div>
          <div className="example-tags">
            {EXAMPLES.map((ex) => (
              <span key={ex} onClick={() => setQuestion(ex)}>{ex}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}