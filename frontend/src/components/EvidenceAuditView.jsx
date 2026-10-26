import { useMemo } from 'react'

/** 问题类型 → 图标 / 中文标签 / 颜色 */
const ISSUE = {
  fabricated: { icon: '🎭', label: '虚构数据', color: '#f87171' },
  data_doubt: { icon: '📉', label: '数据可疑', color: '#fb923c' },
  calc_error: { icon: '🔢', label: '计算错误', color: '#f97316' },
  logic_flaw: { icon: '🔀', label: '逻辑矛盾', color: '#c084fc' },
  unanswered: { icon: '❓', label: '未答质疑', color: '#fbbf24' },
}

/** 可信度分数 → 徽章颜色 */
function scoreColor(s) {
  if (s >= 8) return '#34d399'
  if (s >= 6) return '#fbbf24'
  if (s >= 4) return '#fb923c'
  return '#f87171'
}

/**
 * 证据审查报告：独立审查员对三方辩手论据质量的可信度评估
 * - 整体可信度徽章
 * - 三位辩手可信度评分条 + 问题清单（数据可疑/计算错误/逻辑矛盾/未答质疑）
 * - 未回应的质疑列表
 */
export default function EvidenceAuditView({ audit, agents }) {
  const meta = useMemo(() => {
    const m = {}
    ;(agents || []).forEach((a) => { m[a.role] = a })
    return m
  }, [agents])

  // 审查跳过（兜底态）：显示简化提示，不阻断
  if (!audit || audit.overall_score === 0) {
    return (
      <div className="card audit-card audit-skip">
        <h3>🔍 证据审查报告</h3>
        <p className="audit-skip-text">
          {audit?.summary || '证据审查暂不可用，平衡单基于原始辩论记录生成'}
        </p>
      </div>
    )
  }

  const overall = audit.overall_score
  const oc = scoreColor(overall)
  const totalIssues = (audit.agents || []).reduce(
    (s, a) => s + (a.issues?.length || 0), 0
  )

  return (
    <div className="card audit-card">
      <h3>🔍 证据审查报告</h3>
      <p className="audit-summary">{audit.summary}</p>

      {/* 整体可信度徽章 */}
      <div className="audit-overall">
        <div className="audit-overall-badge" style={{ '--oc': oc }}>
          <span className="audit-overall-score">{overall}</span>
          <span className="audit-overall-max">/10</span>
        </div>
        <div className="audit-overall-info">
          <b style={{ color: oc }}>{audit.verdict}</b>
          <span className="audit-overall-sub">
            独立审查员评估 · 发现 {totalIssues} 个问题
            {audit.unanswered?.length > 0 && ` · ${audit.unanswered.length} 项质疑未回应`}
          </span>
        </div>
      </div>

      {/* 各辩手可信度评分条 + 问题清单 */}
      <div className="audit-agents">
        {(audit.agents || []).map((a) => {
          const m = meta[a.role] || {}
          const c = m.color || '#6366f1'
          const cred = a.credibility || 0
          const sc = scoreColor(cred)
          return (
            <div key={a.role} className="audit-agent">
              <div className="audit-agent-head">
                <span className="audit-agent-name" style={{ color: c }}>
                  {m.avatar} {m.name?.split(' ')[0] || a.role}
                </span>
                <div className="audit-cred-bar">
                  <div
                    className="audit-cred-fill"
                    style={{ width: `${cred * 10}%`, background: sc }}
                  />
                  <span className="audit-cred-num">{cred || '-'}</span>
                </div>
              </div>
              {a.issues?.length > 0 ? (
                <ul className="audit-issues">
                  {a.issues.map((iss, i) => {
                    const it = ISSUE[iss.type] || ISSUE.data_doubt
                    return (
                      <li key={i} className="audit-issue" style={{ '--ic': it.color }}>
                        <span className="audit-issue-icon">{it.icon}</span>
                        <span className="audit-issue-type">{it.label}</span>
                        <span className="audit-issue-detail">{iss.detail}</span>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="audit-clean">✓ 未发现明显问题</p>
              )}
            </div>
          )
        })}
      </div>

      {/* 未回应的质疑已整合到各辩手问题列表中，不再单独展示 */}
    </div>
  )
}