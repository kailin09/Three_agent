import { useMemo, useState } from 'react'
import './classroom.css'

const initialStudents = [
  { id: 'lin', name: '林一', tag: '理解快 · 爱举例', avatar: '林', color: 'mint', state: 'ready', note: '能把符号和图像联系起来' },
  { id: 'chen', name: '陈可', tag: '易混淆 · 不太敢说', avatar: '可', color: 'peach', state: 'quiet', note: '把 x 和 y 的变化关系弄反了' },
  { id: 'zhou', name: '周小满', tag: '认真 · 需要具体例子', avatar: '满', color: 'lavender', state: 'thinking', note: '会代数计算，还没理解斜率的意义' },
  { id: 'wu', name: '吴桐', tag: '容易分心 · 喜欢动手', avatar: '桐', color: 'blue', state: 'offtask', note: '需要短问题或操作任务重新参与' },
]

const starterTurns = [
  { speaker: 'teacher', text: '同学们，今天我们来看一次函数 y = 2x + 1。你觉得这个式子告诉了我们什么？', time: '09:02' },
  { speaker: 'student', studentId: 'lin', text: 'x 每增加 1，y 就增加 2。那个 +1 是 x 等于 0 的时候 y 的值。', time: '09:03' },
  { speaker: 'student', studentId: 'chen', text: '我有点分不清……是不是 x 变成 2，y 才加 1？', time: '09:03' },
  { speaker: 'student', studentId: 'zhou', text: '我能算出 x=1 时 y=3，但不太明白为什么图像是一条直线。', time: '09:04' },
]

function makeResponses(text, round) {
  const says = text.toLowerCase()
  const asks = /为什么|怎么想|你觉得|试着说|哪一步|先猜|举个例子|能不能解释|你来/.test(text)
  const visual = /画|图像|图|坐标|数轴|点/.test(text)
  const concrete = /代入|算一算|x=|例如|比如|表格|增加|变化|每/.test(text)
  const checks = /听懂|明白|懂了吗|还有问题|检查|再说一遍|复述/.test(text)

  const replies = [
    asks || visual
      ? '如果把 x=0、1、2 这几个点标到坐标系里，点会排成一条直线。我想知道“每次增加 2”是不是就是直线变陡的原因？'
      : '我觉得一次函数就是把 x 和 y 放进一个公式里算。这个式子还能怎么用？',
    asks || checks
      ? '我试着说：x 每增加 1，y 增加 2；x=0 时 y=1。这样理解对吗？'
      : concrete
        ? '如果 x 从 1 变到 2，y 从 3 变到 5，所以 y 增加了 2。那 x 变成负数也一样吗？'
        : '我还是有点绕。x 前面的 2 和后面的 +1，分别代表什么呀？',
    visual || concrete
      ? '表格里 (0,1)、(1,3)、(2,5) 三个点确实在一条线上。我想再试一个负数看看。'
      : '我会按公式算数，但“变化率”这个词还是比较抽象。能不能用一段路程来比喻？',
    asks || /活动|动手|两人|讨论|试试/.test(text)
      ? '我来在纸上标三个点！这样比一直听公式有意思。'
      : '我刚才在想别的。可以给我一个很短的小任务吗？',
  ]
  return replies.map((reply, index) => ({
    studentId: initialStudents[index].id,
    text: round > 1 && index === 1 && (asks || checks) ? '我现在能说出来了：2 是每增加 1 个 x，y 增加的量；1 是起点。' : reply,
  }))
}

function currentTime(turns) {
  return `09:${String(4 + turns).padStart(2, '0')}`
}

export default function ClassroomSandbox() {
  const [students, setStudents] = useState(initialStudents)
  const [turns, setTurns] = useState(starterTurns)
  const [draft, setDraft] = useState('')
  const [round, setRound] = useState(1)
  const [debrief, setDebrief] = useState(false)

  const learnerById = useMemo(() => Object.fromEntries(students.map((student) => [student.id, student])), [students])

  const submitTurn = (suggestion) => {
    const message = (suggestion ?? draft).trim()
    if (!message) return
    const nextRound = round + 1
    const now = currentTime(turns.length)
    const responses = makeResponses(message, nextRound)
    setTurns((previous) => [
      ...previous,
      { speaker: 'teacher', text: message, time: now },
      ...responses.map((reply, index) => ({ speaker: 'student', ...reply, time: currentTime(turns.length + index + 1) })),
    ])
    setDraft('')
    setRound(nextRound)
    setDebrief(false)
    setStudents((previous) => previous.map((student) => {
      if (student.id === 'chen' && /为什么|你觉得|试着说|举个例子|复述/.test(message)) return { ...student, state: 'speaking' }
      if (student.id === 'wu' && /活动|动手|两人|讨论|试试|小任务/.test(message)) return { ...student, state: 'engaged' }
      if (student.id === 'zhou' && /画|图像|表格|代入|比如|例如/.test(message)) return { ...student, state: 'connecting' }
      return student
    }))
  }

  const finishSession = () => setDebrief(true)
  const resetSession = () => {
    setStudents(initialStudents)
    setTurns(starterTurns)
    setDraft('')
    setRound(1)
    setDebrief(false)
  }

  return (
    <main className="sandbox-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="返回原项目">
          <span className="brand-mark">微</span><span><b>微格课堂</b><small>MICROTEACHING LAB</small></span>
        </a>
        <div className="topbar-center"><span className="live-dot" /> 本地情景模拟 <span className="topbar-divider">/</span> 教育沙盘原型</div>
        <button className="reset-button" onClick={resetSession}>↻ <span>重置课堂</span></button>
      </header>

      <div className="workspace">
        <aside className="lesson-rail">
          <div className="rail-heading"><span>演练任务</span><span className="step-count">01 / 01</span></div>
          <div className="lesson-card">
            <div className="lesson-kicker">初中数学 · 八年级</div>
            <h1>一次函数<br /><em>从式子到变化</em></h1>
            <p>练习根据学生的真实反应，调整讲解、提问与课堂节奏。</p>
            <div className="lesson-meta"><span>◷ 预计 5 分钟</span><span>✳ 微格练习</span></div>
          </div>
          <div className="rail-section-title">本节学习目标</div>
          <div className="objective"><span className="checkmark">✓</span><p>说出 y = kx + b 中 k 与 b 的含义</p></div>
          <div className="objective"><span className="objective-empty" /><p>用表格或图像解释变量之间的变化</p></div>
          <div className="rail-section-title people-title">模拟学生 <span>4 人</span></div>
          <div className="student-roster">
            {students.map((student) => (
              <div className="roster-student" key={student.id}>
                <div className={`avatar avatar-${student.color}`}>{student.avatar}<i className={`presence presence-${student.state}`} /></div>
                <div className="roster-copy"><b>{student.name}</b><small>{student.tag}</small></div>
                <span className="roster-state">{student.state === 'speaking' ? '发言中' : student.state === 'engaged' ? '参与中' : student.state === 'connecting' ? '在思考' : student.state === 'ready' ? '准备好' : student.state === 'quiet' ? '较安静' : '走神'}</span>
              </div>
            ))}
          </div>
          <div className="rail-note"><span>ⓘ</span><p>学生是预设角色，用于练习课堂应对，不代表真实学生表现。</p></div>
        </aside>

        <section className="classroom-panel">
          <div className="class-header">
            <div><div className="eyebrow">CLASSROOM SIMULATION <span>·</span> 第 {round} 轮互动</div><h2>你正在带领一堂课</h2></div>
            <div className="class-controls"><span className="fixed-scenario">八年级数学 · 一次函数</span><span className="class-status">练习中</span></div>
          </div>

          <div className="classroom-banner">
            <div className="banner-icon">▱</div><div><b>黑板上的问题</b><p>一次函数 <strong>y = 2x + 1</strong> 中，2 和 1 分别告诉我们什么？</p></div><span className="board-tag">概念理解</span>
          </div>

          <div className="conversation" aria-live="polite">
            <div className="conversation-label"><span>课堂对话</span><span>刚刚发生</span></div>
            {turns.map((turn, index) => {
              const student = turn.studentId ? learnerById[turn.studentId] : null
              return turn.speaker === 'teacher' ? (
                <div className="message-row teacher-row" key={`${turn.time}-${index}`}>
                  <div className="teacher-avatar">我</div><div className="message-content"><div className="message-meta"><b>你 · 老师</b><time>{turn.time}</time></div><div className="bubble teacher-bubble">{turn.text}</div></div>
                </div>
              ) : (
                <div className="message-row" key={`${turn.time}-${index}`}>
                  <div className={`avatar avatar-${student?.color ?? 'mint'} student-avatar`}>{student?.avatar ?? '生'}</div><div className="message-content"><div className="message-meta"><b>{student?.name ?? '学生'}</b><span className="student-tag">{student?.tag ?? '模拟学生'}</span><time>{turn.time}</time></div><div className="bubble">{turn.text}</div></div>
                </div>
              )
            })}
          </div>

          {debrief ? (
            <div className="debrief-card">
              <div className="debrief-top"><div><span className="debrief-label">课后复盘 · 基于本次模拟对话</span><h3>你让学生开口了，下一步可以追问他们的理由。</h3></div><span className="debrief-icon">✳</span></div>
              <div className="debrief-grid"><div><small>观察到的做法</small><p>{turns.filter((turn) => turn.speaker === 'teacher').some((turn) => /为什么|你觉得|试着说|举个例子|复述/.test(turn.text)) ? '你使用了开放式提问，给安静的学生留出了表达机会。' : '目前更多是教师讲解。尝试邀请学生解释思路，能更早看见他们的理解。'}</p></div><div><small>值得留意的信号</small><p>陈可曾混淆变量与系数；周小满会计算，但还需要把数值和图像联系起来。</p></div><div><small>下一步可以试试</small><p>请学生用 x=0、1、2 填表，再把三个点标出来，解释“每增加 1，y 增加 2”。</p></div></div>
              <div className="debrief-foot"><span>本复盘由预设角色与规则生成</span><button onClick={() => setDebrief(false)}>返回课堂继续练习 →</button></div>
            </div>
          ) : (
            <div className="composer-wrap">
              <div className="prompt-chips"><span>可以这样开始</span><button onClick={() => submitTurn('如果 x 从 1 变到 2，y 会怎样变化？你能说说为什么吗？')}>追问变化规律 <b>↗</b></button><button onClick={() => submitTurn('请大家先代入 x=0、1、2 填一张表，再说说你发现了什么。')}>用表格探索 <b>↗</b></button><button onClick={() => submitTurn('吴桐，你愿意上来在坐标图上标出这三个点吗？')}>邀请学生参与 <b>↗</b></button></div>
              <form className="composer" onSubmit={(event) => { event.preventDefault(); submitTurn() }}><textarea aria-label="输入你的教学引导" placeholder="输入你的教学引导或提问……" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitTurn() } }} /><div className="composer-footer"><span>Enter 发送 · Shift + Enter 换行</span><div><button type="button" className="finish-button" onClick={finishSession}>结束并复盘</button><button type="submit" className="send-button" disabled={!draft.trim()}>发送引导 <span>↑</span></button></div></div></form>
            </div>
          )}
        </section>

        <aside className="insight-rail">
          <div className="insight-head"><div><span className="eyebrow">TEACHER'S DESK</span><h3>课堂观察</h3></div><span className="sparkle">✳</span></div>
          <div className="observation-card"><div className="observation-icon peach-icon">◌</div><div><b>理解差异</b><p>有人已理解变化规律，有人还在混淆 x 与 y。</p></div><span className="observation-dot peach-dot" /></div>
          <div className="observation-card"><div className="observation-icon blue-icon">↗</div><div><b>参与信号</b><p>{students.find((student) => student.id === 'chen')?.state === 'speaking' ? '陈可开始尝试复述自己的理解。' : '陈可目前较安静，可以用低压力问题邀请表达。'}</p></div><span className="observation-dot blue-dot" /></div>
          <div className="observation-card"><div className="observation-icon mint-icon">⌁</div><div><b>理解迁移</b><p>周小满会计算结果，需要把数值变化联系到图像。</p></div><span className="observation-dot mint-dot" /></div>

          <div className="right-divider" />
          <div className="question-title"><span>可追问的问题</span><span>AI 提示 · 模拟</span></div>
          <button className="question-card" onClick={() => submitTurn('你是怎么知道 y 增加了 2 的？可以把每一步说出来吗？')}><span>01</span><p>“你是怎么知道 y 增加了 2 的？”</p><b>↗</b></button>
          <button className="question-card" onClick={() => submitTurn('如果 x=0，y 是多少？这个点在图上代表什么？')}><span>02</span><p>“x=0 时的 y，在图上代表什么？”</p><b>↗</b></button>
          <div className="teacher-tip"><span className="tip-icon">✦</span><div><b>带课小提示</b><p>先让学生说出自己的想法，再决定要不要补充解释。</p></div></div>
          <div className="prototype-stamp"><span>LOCAL PROTOTYPE</span><p>当前是可交互的规则演示，不含真实 AI 推理或学情数据。</p></div>
        </aside>
      </div>
    </main>
  )
}
