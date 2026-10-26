import { useLayoutEffect, useMemo, useRef, useState } from 'react'

/** 角色列顺序（与 agents 一致） */
const ROLE_ORDER = ['pragmatist', 'idealist', 'risk']

/** 关系类型 → 颜色 / 中文标签 / 线型 / 图标 */
const REL = {
  support: { color: '#34d399', label: '支持', dash: '', icon: '➕' },
  rebut: { color: '#f87171', label: '反驳', dash: '7 4', icon: '⚡' },
  qualify: { color: '#fbbf24', label: '修正', dash: '2 4', icon: '✏️' },
}

/** 贝塞尔曲线路径：垂直主导弯曲，适合按轮次分层的网格布局 */
function curvePath(x1, y1, x2, y2) {
  const my = (y1 + y2) / 2
  return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`
}

/**
 * 论点关系图：网格布局（列=辩手，行=轮次）+ SVG 贝塞尔连线
 * - 悬停节点 → 高亮该节点相关的边，其余变暗
 * - 悬停边 → 显示关系原因
 * - 三种关系：支持(绿实线) / 反驳(红虚线) / 修正(黄点线)
 */
export default function ArgumentGraph({ graph, agents }) {
  const containerRef = useRef(null)
  const nodeRefs = useRef({})
  const [positions, setPositions] = useState({})
  const [hoverNode, setHoverNode] = useState(null)
  const [hoverEdge, setHoverEdge] = useState(null)
  const [expanded, setExpanded] = useState(null) // 展开完整论点的节点 id

  const meta = useMemo(() => {
    const m = {}
    ;(agents || []).forEach((a) => { m[a.role] = a })
    return m
  }, [agents])

  /** 按轮次分组（行），每行按角色分组（列） */
  const grid = useMemo(() => {
    const roundsSet = new Set()
    const byKey = {} // `${round}-${role}` -> [nodes]
    for (const n of graph.nodes || []) {
      roundsSet.add(n.round)
      const key = `${n.round}-${n.role}`
      ;(byKey[key] = byKey[key] || []).push(n)
    }
    const rounds = [...roundsSet].sort((a, b) => a - b)
    return { rounds, byKey }
  }, [graph])

  /** 测量节点中心坐标（相对容器），用于 SVG 连线 */
  useLayoutEffect(() => {
    if (!containerRef.current) return
    const cr = containerRef.current.getBoundingClientRect()
    const pos = {}
    for (const n of graph.nodes || []) {
      const el = nodeRefs.current[n.id]
      if (!el) continue
      const r = el.getBoundingClientRect()
      pos[n.id] = {
        x: r.left - cr.left + r.width / 2,
        y: r.top - cr.top + r.height / 2,
      }
    }
    setPositions(pos)
    // 窗口缩放时重新测量
    const ro = new ResizeObserver(() => {
      const cr2 = containerRef.current?.getBoundingClientRect()
      if (!cr2) return
      const pos2 = {}
      for (const n of graph.nodes || []) {
        const el = nodeRefs.current[n.id]
        if (!el) continue
        const r = el.getBoundingClientRect()
        pos2[n.id] = {
          x: r.left - cr2.left + r.width / 2,
          y: r.top - cr2.top + r.height / 2,
        }
      }
      setPositions(pos2)
    })
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [graph])

  const edges = graph.edges || []
  // 与悬停节点相关的边 id 集合
  const relatedEdges = useMemo(() => {
    if (!hoverNode) return null
    return new Set(
      edges
        .filter((e) => e.source === hoverNode || e.target === hoverNode)
        .map((e) => `${e.source}->${e.target}->${e.type}`)
    )
  }, [hoverNode, edges])
  // 与悬停节点相关的节点 id 集合
  const relatedNodes = useMemo(() => {
    if (!hoverNode) return null
    const s = new Set([hoverNode])
    edges.forEach((e) => {
      if (e.source === hoverNode) s.add(e.target)
      if (e.target === hoverNode) s.add(e.source)
    })
    return s
  }, [hoverNode, edges])

  const nodeDim = (id) => (relatedNodes && !relatedNodes.has(id) ? ' dim' : '')
  const edgeDim = (e) =>
    relatedEdges && !relatedEdges.has(`${e.source}->${e.target}->${e.type}`)
      ? ' dim'
      : ''

  return (
    <div className="arg-graph-card card">
      <h3>🕸️ 论点关系图</h3>
      <p className="arg-summary">{graph.summary}</p>

      <div className="arg-legend">
        {Object.entries(REL).map(([k, v]) => (
          <span key={k} className="arg-legend-item">
            <svg width="26" height="6">
              <line
                x1="0" y1="3" x2="26" y2="3"
                stroke={v.color} strokeWidth="2.5"
                strokeDasharray={v.dash}
              />
            </svg>
            {v.label}
          </span>
        ))}
        <span className="arg-legend-hint">悬停论点可高亮其交锋关系</span>
      </div>

      <div className="arg-graph-wrap" ref={containerRef}>
        {/* SVG 连线层 */}
        <svg className="arg-svg">
          <defs>
            {Object.entries(REL).map(([k, v]) => (
              <marker
                key={k}
                id={`arrow-${k}`}
                viewBox="0 0 8 8"
                refX="7" refY="4"
                markerWidth="6" markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0,1 L7,4 L0,7 z" fill={v.color} />
              </marker>
            ))}
          </defs>
          {edges.map((e, i) => {
            const s = positions[e.source]
            const t = positions[e.target]
            if (!s || !t) return null
            const rel = REL[e.type] || REL.support
            const isHover = hoverEdge === `${e.source}->${e.target}->${e.type}`
            return (
              <g key={i} className={`arg-edge${edgeDim(e)}${isHover ? ' hot' : ''}`}>
                <path
                  d={curvePath(s.x, s.y, t.x, t.y)}
                  fill="none"
                  stroke={rel.color}
                  strokeWidth={isHover ? 3.5 : 2}
                  strokeDasharray={rel.dash}
                  markerEnd={`url(#arrow-${e.type})`}
                />
                {/* 透明加粗命中区，方便悬停 */}
                <path
                  d={curvePath(s.x, s.y, t.x, t.y)}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="14"
                  onMouseEnter={() => setHoverEdge(`${e.source}->${e.target}->${e.type}`)}
                  onMouseLeave={() => setHoverEdge(null)}
                />
                {isHover && (
                  <text
                    x={(s.x + t.x) / 2}
                    y={(s.y + t.y) / 2 - 8}
                    textAnchor="middle"
                    className="arg-edge-label"
                    fill={rel.color}
                  >
                    {rel.icon} {e.reason}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {/* 网格层：列=辩手，行=轮次 */}
        <div className="arg-grid">
          {/* 表头：辩手名 */}
          <div className="arg-corner" />
          {ROLE_ORDER.map((r) => (
            <div key={r} className="arg-col-head" style={{ color: meta[r]?.color }}>
              {meta[r]?.avatar} {meta[r]?.name?.split(' ')[0] || r}
            </div>
          ))}
          {/* 行：轮次 */}
          {grid.rounds.map((rd) => (
            <div key={rd} className="arg-row-group">
              <div className="arg-round-label">R{rd}</div>
              {ROLE_ORDER.map((r) => {
                const cellNodes = grid.byKey[`${rd}-${r}`] || []
                return (
                  <div key={r} className="arg-cell">
                    {cellNodes.map((n) => {
                      const c = meta[n.role]?.color || '#6366f1'
                      const isOpen = expanded === n.id
                      return (
                        <div
                          key={n.id}
                          ref={(el) => { nodeRefs.current[n.id] = el }}
                          className={`arg-node${nodeDim(n.id)}${hoverNode === n.id ? ' hot' : ''}`}
                          style={{ '--nc': c }}
                          onMouseEnter={() => setHoverNode(n.id)}
                          onMouseLeave={() => setHoverNode(null)}
                          onClick={() => setExpanded(isOpen ? null : n.id)}
                        >
                          <span className="arg-node-id">{n.id}</span>
                          <span className="arg-node-text">{n.text}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 展开的完整论点 */}
      {expanded && (
        <div className="arg-detail">
          <b style={{ color: meta[graph.nodes.find(n => n.id === expanded)?.role]?.color }}>
            {graph.nodes.find(n => n.id === expanded)?.id}
          </b>
          <span>{graph.nodes.find(n => n.id === expanded)?.text}</span>
        </div>
      )}
    </div>
  )
}