import { useState } from 'react'
import './transfer.css'

const stages = [
  {
    title: '把情境写成关系式',
    tag: '陌生情境',
    scene: '陶艺工作坊按件烧制作品。每件收取 3 元烧制费，另收一次性材料费 8 元。',
    question: '做 x 件作品，总费用 y 元。哪一种表达和解释都正确？',
    options: [
      { id: 'a', formula: 'y = 3x + 8', explanation: '3 是每件费用，8 是固定材料费。', correct: true },
      { id: 'b', formula: 'y = 8x + 3', explanation: '8 是每件费用，3 是固定材料费。', correct: false, misconception: 'swap' },
      { id: 'c', formula: 'y = 3x + 8', explanation: '3 是固定材料费，8 是每件费用。', correct: false, misconception: 'meaning' },
    ],
    hints: [
      '先分开看：哪笔费用无论做几件都要付？哪笔会随件数增加？',
      '每件增加 3 元，是“每增加 1 件，总价增加多少”；固定 8 元在 x=0 时也存在。',
      '一次函数 y=kx+b 中，k 表示每增加 1 个 x 时 y 的变化量，b 表示 x=0 时的起始值。',
    ],
  },
  {
    title: '从表格识别规律',
    tag: '换一种表示',
    scene: '一台小型打印机记录了连续几个订单的页数和总价。不同于刚才的收费说明，这次只给你数据。',
    question: '表中数据对应哪一个关系式？你依据的关键规律是什么？',
    table: [['页数 x', '0', '1', '3', '5'], ['总价 y（元）', '4', '7', '13', '19']],
    options: [
      { id: 'a', formula: 'y = 3x + 4', explanation: 'x 每增加 1，y 增加 3；x=0 时 y=4。', correct: true },
      { id: 'b', formula: 'y = 4x + 3', explanation: 'x 每增加 1，y 增加 4；起点是 3。', correct: false, misconception: 'swap' },
      { id: 'c', formula: 'y = 3x + 4', explanation: '只要代入表格里的数能算对，不需要看变化规律。', correct: false, misconception: 'surface' },
    ],
    hints: [
      '比较相邻数据：页数增加时，总价每次增加多少？',
      '从 (0,4) 到 (1,7)，总价增加 3；再检查其他数据是否也符合。',
      '把 y=kx+b 放回表格：x=0 可以先确定 b，再用相邻数据变化确定 k。',
    ],
  },
  {
    title: '反过来解决问题',
    tag: '逆向应用',
    scene: '工作坊临时推出预算挑战：总费用最多 32 元，材料费仍为 8 元，每件烧制费 3 元。',
    question: '最多能烧制几件？你会怎样从总价倒推出件数？',
    options: [
      { id: 'a', formula: '8 件', explanation: '先从 32 元里扣除固定的 8 元，再把剩下的钱按每件 3 元计算。', correct: true },
      { id: 'b', formula: '10 件', explanation: '直接用总预算 32 除以每件 3 元，再取整。', correct: false, misconception: 'procedure' },
      { id: 'c', formula: '12 件', explanation: '先减掉 8 元，再把剩下的钱乘以 3。', correct: false, misconception: 'procedure' },
    ],
    hints: [
      '总价里同时包含固定费用和按件费用。先想哪一部分不会随件数变化。',
      '从总预算中先扣除 8 元材料费，剩余金额才用于支付烧制费。',
      '列出 3x + 8 = 32，再按等式的逆运算解出 x。',
    ],
  },
]

function getDiagnosis(answers) {
  const done = answers.filter(Boolean)
  const correctCount = done.filter((answer) => answer.correct).length
  if (done.length < stages.length) return null
  if (answers[0]?.correct && answers[1]?.correct && answers[2]?.correct) {
    return { kind: 'transfer', title: '能把一次函数迁移到新问题', description: '你在收费情境、数据表和预算逆推三个任务中都识别并使用了关系式，概念理解与步骤选择表现一致。', next: '试着挑战图像或不完整数据：只给两组信息，判断能否确定一次函数。', count: correctCount }
  }
  if (!answers[0]?.correct || !answers[1]?.correct) {
    const fromFamiliar = answers[0]?.correct && !answers[1]?.correct
    return fromFamiliar
      ? { kind: 'surface', title: '熟悉情境会做，换表示后容易失去线索', description: '收费情境中能选对关系式，但在表格中没有稳定使用“每单位变化量”和“起始值”。这更像是依赖题面线索，知识还没稳固迁移到另一种表示。', next: '把表格中的相邻变化写出来，再用 x=0 的数据找起始值。', count: correctCount }
      : { kind: 'concept', title: '先巩固 k 与 b 的含义', description: '你在情境建模或表格识别中混淆了单位变化量与起始值，说明目前的主要卡点在概念对应关系。', next: '用自己的话解释：x 每增加 1，y 改变多少？当 x=0 时 y 是多少？', count: correctCount }
  }
  return { kind: 'procedure', title: '概念识别已具备，逆向求解步骤需练习', description: '你能在情境和表格中找到关系式，但预算问题中没有先去掉固定费用，卡点更接近等式变形或运算顺序。', next: '先列 3x + 8 = 32，再按“减 8、除以 3”的顺序解方程。', count: correctCount }
}

export default function TransferDiagnosis() {
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState('')
  const [answers, setAnswers] = useState([null, null, null])
  const [hintLevel, setHintLevel] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [finished, setFinished] = useState(false)
  const [showIntro, setShowIntro] = useState(true)
  const stage = stages[index]
  const diagnosis = finished ? getDiagnosis(answers) : null

  const selectOption = (id) => { setSelected(id); setFeedback('') }
  const submitAnswer = () => {
    if (!selected) return
    const option = stage.options.find((item) => item.id === selected)
    const nextAnswers = [...answers]
    nextAnswers[index] = { correct: option.correct, misconception: option.misconception ?? null, hintLevel, selected }
    setAnswers(nextAnswers)
    setFeedback(option.correct ? '判断正确。继续看看你能否把规律用在另一种表示和反向问题中。' : '这里出现了一个值得观察的卡点。可以先看提示，再用自己的思路选一次；第一次作答会保留用于复盘。')
  }
  const continueAfterAnswer = () => {
    if (index === stages.length - 1) { setFinished(true); return }
    setIndex((value) => value + 1)
    setSelected('')
    setHintLevel(0)
    setFeedback('')
  }
  const showHint = () => {
    setHintLevel((value) => Math.min(value + 1, stage.hints.length))
    setFeedback('')
  }
  const reset = () => {
    setIndex(0); setSelected(''); setAnswers([null, null, null]); setHintLevel(0); setFeedback(''); setFinished(false); setShowIntro(true)
  }

  return (
    <main className="transfer-app">
      <header className="transfer-topbar">
        <a className="transfer-brand" href="/" aria-label="返回项目首页"><span className="transfer-logo">迁</span><span><b>知行 · 知识迁移诊断</b><small>TRANSFER LEARNING CHECK</small></span></a>
        <div className="transfer-top-center"><span className="top-status" /> 八年级数学 <span className="top-slash">/</span> 一次函数 <span className="top-slash">/</span> 个人练习</div>
        <button className="transfer-exit" onClick={reset}>↻ <span>重新开始</span></button>
      </header>

      <div className="transfer-layout">
        <aside className="transfer-left">
          <div className="unit-label">学习单元 <span>UNIT 04</span></div>
          <div className="unit-card"><span className="unit-symbol">ƒ</span><small>函数与变化</small><h1>一次<br />函数</h1><div className="unit-equation">y = kx + b</div><p>不考定义背诵。试试看能不能在新问题里认出它。</p></div>
          <div className="transfer-steps-title">诊断路径 <span>3 项</span></div>
          <div className="path-list">{stages.map((item, i) => <div className={`path-item ${i === index && !finished ? 'path-active' : ''} ${answers[i] ? 'path-done' : ''}`} key={item.title}><span className="path-num">{answers[i]?.correct ? '✓' : `0${i + 1}`}</span><span>{item.title}</span><i /></div>)}</div>
          <div className="skill-focus"><span className="focus-icon">◎</span><div><b>观察重点</b><p>变化率 k · 起始值 b<br />表示转换 · 逆向应用</p></div></div>
          <div className="left-disclaimer">作答过程保存在本页临时状态中，刷新页面会清空。</div>
        </aside>

        <section className="transfer-main">
          <div className="main-heading"><div><div className="main-eyebrow">TRANSFER CHALLENGE <span>·</span> 迁移任务 {String(index + 1).padStart(2, '0')}</div><h2>{finished ? '本轮诊断完成' : stage.title}</h2></div><div className="progress-wrap"><span>{finished ? 100 : Math.round((index / stages.length) * 100)}%</span><div className="progress-track"><i style={{ width: `${finished ? 100 : ((index + 1) / stages.length) * 100}%` }} /></div></div></div>

          {showIntro && !finished && <div className="intro-note"><span>✦</span><p>每题先独立作答。答错时系统逐级给提示，并记录你卡在哪种表示或步骤。<b>提示会影响最终表现判断。</b></p><button onClick={() => setShowIntro(false)} aria-label="关闭说明">×</button></div>}

          {finished ? (
            <div className="diagnosis-view">
              <div className={`diagnosis-banner diagnosis-${diagnosis.kind}`}><span className="diagnosis-mark">{diagnosis.kind === 'transfer' ? '↗' : diagnosis.kind === 'procedure' ? '↻' : '◎'}</span><div><small>诊断结论 · 基于本轮作答</small><h3>{diagnosis.title}</h3><p>{diagnosis.description}</p></div></div>
              <div className="evidence-title">判断依据 <span>{diagnosis.count} / 3 题首次作答正确</span></div>
              <div className="evidence-list">{stages.map((item, i) => <div className="evidence-row" key={item.title}><span className={`evidence-result ${answers[i]?.correct ? 'result-ok' : 'result-miss'}`}>{answers[i]?.correct ? '✓' : '!'}</span><div><b>{item.title}</b><p>{answers[i]?.correct ? '首次作答正确' : answers[i]?.hintLevel > 0 ? `使用 ${answers[i].hintLevel} 级提示后仍未答对` : '首次作答未正确'}</p></div><span className="evidence-tag">{i === 0 ? '概念建模' : i === 1 ? '表示转换' : '逆向步骤'}</span></div>)}</div>
              <div className="next-step"><span>建议下一步</span><p>{diagnosis.next}</p></div>
              <div className="diagnosis-caution">这是基于少量选择题与预设规则的学习线索，不是对学生能力的正式评价。更多题目和自由作答证据能让诊断更可靠。</div>
              <button className="restart-primary" onClick={reset}>再做一轮 <span>↗</span></button>
            </div>
          ) : (
            <>
              <div className="transfer-scene"><div className="scene-art"><span className="art-ring ring-one"/><span className="art-ring ring-two"/><span className="art-clay">◍</span><span className="art-spark spark-a">✳</span><span className="art-spark spark-b">·</span></div><div className="scene-copy"><span className="scene-type">{stage.tag}</span><p>{stage.scene}</p></div><span className="scene-count">{String(index + 1).padStart(2, '0')}<small> / 03</small></span></div>
              {stage.table && <div className="data-table-wrap"><table className="data-table"><tbody>{stage.table.map((row) => <tr key={row[0]}>{row.map((cell, cellIndex) => cellIndex === 0 ? <th key={cell}>{cell}</th> : <td key={`${cell}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody></table></div>}
              <div className="question-block"><div className="question-index">{String(index + 1).padStart(2, '0')} <span>QUESTION</span></div><div><h3>{stage.question}</h3><div className="answer-options">{stage.options.map((option) => <button className={`answer-option ${selected === option.id ? 'option-selected' : ''}`} key={option.id} onClick={() => selectOption(option.id)}><span className="option-radio">{selected === option.id ? '•' : ''}</span><span className="option-copy"><b>{option.formula}</b><small>{option.explanation}</small></span><span className="option-arrow">↗</span></button>)}</div></div></div>
              {hintLevel > 0 && <div className="hint-box"><span className="hint-bulb">✦</span><div><small>提示 {hintLevel} / {stage.hints.length}</small><p>{stage.hints[hintLevel - 1]}</p></div>{hintLevel < stage.hints.length && <button onClick={showHint}>再给一点提示 →</button>}</div>}
              {feedback && <div className={`feedback-box ${answers[index]?.correct ? 'feedback-good' : 'feedback-watch'}`}><span>{answers[index]?.correct ? '✓' : '↗'}</span><p>{feedback}</p></div>}
              <div className="question-actions">{!feedback && <button className="hint-button" onClick={showHint} disabled={hintLevel >= stage.hints.length}>我想要提示 <span>({hintLevel}/{stage.hints.length})</span></button>}{feedback && answers[index]?.correct === false && <button className="try-again-button" onClick={() => { setSelected(''); setFeedback('') }}>再想一想</button>}{feedback && answers[index]?.correct && <button className="continue-button" onClick={continueAfterAnswer}>{index === stages.length - 1 ? '查看诊断结果' : '继续下一题'} <span>→</span></button>}{feedback && answers[index]?.correct === false && <button className="continue-button continue-muted" onClick={continueAfterAnswer}>记录这次卡点并继续 <span>→</span></button>}{!feedback && <button className="submit-button" onClick={submitAnswer} disabled={!selected}>提交作答 <span>→</span></button>}</div>
            </>
          )}
          <footer className="main-foot"><span>LEARN BY TRANSFERRING</span><span>一次函数 · 概念迁移练习</span></footer>
        </section>

        <aside className="transfer-right">
          <div className="right-heading"><div><span>诊断仪表盘</span><small>根据本轮作答动态更新</small></div><span className="dashboard-icon">⌁</span></div>
          <div className="metric-card"><div className="metric-top"><span>首次作答正确</span><span className="metric-counter">{answers.filter((answer) => answer?.correct).length}<small> / 3</small></span></div><div className="metric-bar"><i style={{ width: `${(answers.filter((answer) => answer?.correct).length / 3) * 100}%` }} /></div><small>用于区分独立迁移与提示后完成</small></div>
          <div className="observed-title">正在观察 <span>LIVE</span></div>
          <div className={`watch-item ${index === 0 ? 'watch-current' : ''}`}><span className="watch-number">01</span><div><b>概念对应</b><p>能否把固定值和单位变化量分开</p></div><span className="watch-status">{answers[0] ? answers[0].correct ? '已通过' : '有卡点' : index === 0 ? '观察中' : '待观察'}</span></div>
          <div className={`watch-item ${index === 1 ? 'watch-current' : ''}`}><span className="watch-number">02</span><div><b>表征转换</b><p>能否从表格重建函数关系</p></div><span className="watch-status">{answers[1] ? answers[1].correct ? '已通过' : '有卡点' : index === 1 ? '观察中' : '待观察'}</span></div>
          <div className={`watch-item ${index === 2 ? 'watch-current' : ''}`}><span className="watch-number">03</span><div><b>步骤迁移</b><p>能否从总价反推数量</p></div><span className="watch-status">{answers[2] ? answers[2].correct ? '已通过' : '有卡点' : index === 2 ? '观察中' : '待观察'}</span></div>
          <div className="right-separator" />
          <div className="hint-policy"><span className="policy-icon">↘</span><div><b>渐进提示</b><p>提示从提醒关注信息，逐步过渡到明确列式。系统会记录提示层级，避免把提示后答对误认为独立掌握。</p></div></div>
          <div className="prototype-note"><span>PROTOTYPE · RULE-BASED</span><p>目前由预设选项和规则形成诊断，后续可扩展为开放作答与学科知识库。</p></div>
        </aside>
      </div>
    </main>
  )
}
