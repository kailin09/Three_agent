import { useEffect, useRef, useState } from 'react'

/**
 * 辩论场景（左侧房间）：
 * - 沙发休息区 + 办公桌讨论区
 * - 进入页面时3位Agent坐在沙发上，片刻后走向办公桌
 * - 当前发言者会有弹跳 + 说话气泡动画
 * - 辩论结束后走回沙发休息
 */
export default function DebateScene({ agents, ended, speakingRole, rebuttal }) {
  const [arrived, setArrived] = useState(false) // 是否已走向办公桌
  const [walking, setWalking] = useState(false) // 走动中（脚步弹跳）
  const firstRef = useRef(true)
  const active = arrived && !ended

  // 挂载后400ms再走向办公桌，让用户看到走动动画
  useEffect(() => {
    const t = setTimeout(() => setArrived(true), 400)
    return () => clearTimeout(t)
  }, [])

  // active 每次变化（走向桌子/走回沙发）触发1.6s走动动画
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false
      return
    }
    setWalking(true)
    const t = setTimeout(() => setWalking(false), 1600)
    return () => clearTimeout(t)
  }, [active])

  // 沙发坐姿 / 桌后站姿 的水平位置（%）
  const seatX = { pragmatist: 8, idealist: 18, risk: 28 }
  const deskX = { pragmatist: 54, idealist: 67, risk: 80 }

  return (
    <div className={`scene ${active ? 'is-active' : ''}`}>
      {/* 墙面：窗户 + 月亮 + 星星 */}
      <div className="sc-window">
        <i className="sc-moon" />
        <i className="sc-star s1" />
        <i className="sc-star s2" />
        <i className="sc-star s3" />
      </div>
      {/* 绿植 */}
      <div className="sc-plant">🪴</div>
      {/* 沙发 */}
      <div className="sc-sofa">
        <i className="sc-sofa-back" />
        <i className="sc-sofa-arm left" />
        <i className="sc-sofa-arm right" />
        <i className="sc-sofa-seat" />
      </div>
      {/* 办公桌 */}
      <div className="sc-desk">
        <i className="sc-desk-top" />
        <i className="sc-desk-leg left" />
        <i className="sc-desk-leg right" />
        <div className="sc-desk-items">
          <span>💻</span>
          <span>☕</span>
          <span>📄</span>
        </div>
      </div>
      {/* 交锋连线：当前发言者 → 被反驳者（钢铁人复述点名时点亮） */}
      {rebuttal && active && (() => {
        const x1 = deskX[rebuttal.from]
        const x2 = deskX[rebuttal.to]
        if (x1 == null || x2 == null) return null
        const color = agents.find((a) => a.role === rebuttal.from)?.color || '#f87171'
        return (
          <div
            className="sc-rebuttal-line"
            style={{
              left: `${Math.min(x1, x2)}%`,
              width: `${Math.abs(x2 - x1)}%`,
              '--line-color': color,
            }}
          >
            <span className={`sc-rebuttal-arrow ${x2 > x1 ? 'right' : 'left'}`} />
          </div>
        )
      })()}
      {/* 人物 */}
      {agents.map((a) => (
        <div
          key={a.role}
          className={`sc-figure ${speakingRole === a.role ? 'speaking' : ''} ${walking ? 'walking' : ''} ${rebuttal?.to === a.role ? 'targeted' : ''}`}
          style={{
            left: `${active ? deskX[a.role] : seatX[a.role]}%`,
            '--fig-color': a.color,
          }}
        >
          <div className="sc-speech-dots">
            <span /><span /><span />
          </div>
          <div className="sc-head">{a.avatar}</div>
          <div className="sc-hp-bar">
            <i className="hp-fill" style={{ width: speakingRole === a.role ? '100%' : '60%' }} />
          </div>
          <div className="sc-name">{a.name.split(' · ')[0]}</div>
        </div>
      ))}
    </div>
  )
}