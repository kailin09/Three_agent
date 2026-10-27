const root = document.getElementById('classroom-root')
const classRoster = [
  { id: 'lin', name: '林一', tag: '理解快 · 爱举例', avatar: '林', color: 'mint', state: 'ready' },
  { id: 'chen', name: '陈可', tag: '易混淆 · 不太敢说', avatar: '可', color: 'peach', state: 'quiet' },
  { id: 'zhou', name: '周小满', tag: '认真 · 需要具体例子', avatar: '满', color: 'lavender', state: 'thinking' },
  { id: 'wu', name: '吴桐', tag: '容易分心 · 喜欢动手', avatar: '桐', color: 'blue', state: 'offtask' },
]
const openingTurns = [
  { speaker: 'teacher', text: '同学们，今天我们来看一次函数 y = 2x + 1。你觉得这个式子告诉了我们什么？', time: '09:02' },
  { speaker: 'student', id: 'lin', text: 'x 每增加 1，y 就增加 2。那个 +1 是 x 等于 0 的时候 y 的值。', time: '09:03' },
  { speaker: 'student', id: 'chen', text: '我有点分不清……是不是 x 变成 2，y 才加 1？', time: '09:03' },
  { speaker: 'student', id: 'zhou', text: '我能算出 x=1 时 y=3，但不太明白为什么图像是一条直线。', time: '09:04' },
]
const quickPrompts = [
  '如果 x 从 1 变到 2，y 会怎样变化？你能说说为什么吗？',
  '请大家先代入 x=0、1、2 填一张表，再说说你发现了什么。',
  '吴桐，你愿意上来在坐标图上标出这三个点吗？',
]
let turns = [...openingTurns]
let round = 1
let debrief = false

const escapeHTML = (text) => String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const clockFor = (count) => `09:${String(4 + count).padStart(2, '0')}`
const statusLabel = (student) => ({ ready: '准备好', quiet: '较安静', thinking: '在思考', offtask: '走神', speaking: '发言中', engaged: '参与中', connecting: '在思考' })[student.state]

function responsesFor(message, nextRound) {
  const asks = /为什么|怎么想|你觉得|试着说|哪一步|先猜|举个例子|能不能解释|你来|复述/.test(message)
  const visual = /画|图像|图|坐标|数轴|点/.test(message)
  const concrete = /代入|算一算|x=|例如|比如|表格|增加|变化|每/.test(message)
  const activity = /活动|动手|两人|讨论|试试|小任务/.test(message)
  return [
    { id: 'lin', text: asks || visual ? '如果把 x=0、1、2 这几个点标到坐标系里，点会排成一条直线。我想知道“每次增加 2”是不是就是直线变陡的原因？' : '我觉得一次函数就是把 x 和 y 放进一个公式里算。这个式子还能怎么用？' },
    { id: 'chen', text: nextRound > 1 && (asks || /检查|听懂/.test(message)) ? '我现在能说出来了：2 是每增加 1 个 x，y 增加的量；1 是起点。' : asks ? '我试着说：x 每增加 1，y 增加 2；x=0 时 y=1。这样理解对吗？' : concrete ? '如果 x 从 1 变到 2，y 从 3 变到 5，所以 y 增加了 2。那 x 变成负数也一样吗？' : '我还是有点绕。x 前面的 2 和后面的 +1，分别代表什么呀？' },
    { id: 'zhou', text: visual || concrete ? '表格里 (0,1)、(1,3)、(2,5) 三个点确实在一条线上。我想再试一个负数看看。' : '我会按公式算数，但“变化率”这个词还是比较抽象。能不能用一段路程来比喻？' },
    { id: 'wu', text: activity || asks ? '我来在纸上标三个点！这样比一直听公式有意思。' : '我刚才在想别的。可以给我一个很短的小任务吗？' },
  ]
}

function submitTurn(message) {
  const text = (message ?? document.getElementById('teacher-input')?.value ?? '').trim()
  if (!text) return
  const nextRound = round + 1
  const time = clockFor(turns.length)
  const replies = responsesFor(text, nextRound)
  turns.push({ speaker: 'teacher', text, time })
  replies.forEach((reply, i) => turns.push({ speaker: 'student', ...reply, time: clockFor(turns.length + i) }))
  if (/为什么|你觉得|试着说|举个例子|复述/.test(text)) classRoster.find(({ id }) => id === 'chen').state = 'speaking'
  if (/活动|动手|两人|讨论|试试|小任务/.test(text)) classRoster.find(({ id }) => id === 'wu').state = 'engaged'
  if (/画|图像|表格|代入|比如|例如/.test(text)) classRoster.find(({ id }) => id === 'zhou').state = 'connecting'
  round = nextRound
  debrief = false
  render()
}

function renderTurns() {
  return turns.map((turn, index) => {
    if (turn.speaker === 'teacher') return `<div class="message-row teacher-row"><div class="teacher-avatar">我</div><div class="message-content"><div class="message-meta"><b>你 · 老师</b><time>${turn.time}</time></div><div class="bubble teacher-bubble">${escapeHTML(turn.text)}</div></div></div>`
    const student = classRoster.find(({ id }) => id === turn.id)
    return `<div class="message-row" data-index="${index}"><div class="avatar avatar-${student.color} student-avatar">${student.avatar}</div><div class="message-content"><div class="message-meta"><b>${student.name}</b><span class="student-tag">${student.tag}</span><time>${turn.time}</time></div><div class="bubble">${escapeHTML(turn.text)}</div></div></div>`
  }).join('')
}

function renderDebrief() {
  const invited = turns.filter((turn) => turn.speaker === 'teacher').some((turn) => /为什么|你觉得|试着说|举个例子|复述/.test(turn.text))
  return `<div class="debrief-card"><div class="debrief-top"><div><span class="debrief-label">课后复盘 · 基于本次模拟对话</span><h3>${invited ? '你让学生开口了，下一步可以追问他们的理由。' : '目前更多是教师讲解，可以试着听听学生怎么想。'}</h3></div><span class="debrief-icon">✳</span></div><div class="debrief-grid"><div><small>观察到的做法</small><p>${invited ? '你使用了开放式提问，给安静的学生留出了表达机会。' : '尝试邀请学生解释思路，能更早看见他们的理解。'}</p></div><div><small>值得留意的信号</small><p>陈可曾混淆变量与系数；周小满会计算，但还需要把数值和图像联系起来。</p></div><div><small>下一步可以试试</small><p>请学生用 x=0、1、2 填表，再把三个点标出来，解释“每增加 1，y 增加 2”。</p></div></div><div class="debrief-foot"><span>本复盘由预设角色与规则生成</span><button id="continue-class">返回课堂继续练习 →</button></div></div>`
}

function render() {
  const roster = classRoster.map((student) => `<div class="roster-student"><div class="avatar avatar-${student.color}">${student.avatar}<i class="presence presence-${student.state}"></i></div><div class="roster-copy"><b>${student.name}</b><small>${student.tag}</small></div><span class="roster-state">${statusLabel(student)}</span></div>`).join('')
  const invite = classRoster.find(({ id }) => id === 'chen').state === 'speaking'
  root.innerHTML = `<main class="sandbox-shell"><header class="topbar"><a class="brand" href="#" aria-label="微格课堂"><span class="brand-mark">微</span><span><b>微格课堂</b><small>MICROTEACHING LAB</small></span></a><div class="topbar-center"><span class="live-dot"></span> 本地情景模拟 <span class="topbar-divider">/</span> 教育沙盘原型</div><button class="reset-button" id="reset-class">↻ <span>重置课堂</span></button></header><div class="workspace"><aside class="lesson-rail"><div class="rail-heading"><span>演练任务</span><span class="step-count">01 / 01</span></div><div class="lesson-card"><div class="lesson-kicker">初中数学 · 八年级</div><h1>一次函数<br><em>从式子到变化</em></h1><p>练习根据学生的真实反应，调整讲解、提问与课堂节奏。</p><div class="lesson-meta"><span>◷ 预计 5 分钟</span><span>✳ 微格练习</span></div></div><div class="rail-section-title">本节学习目标</div><div class="objective"><span class="checkmark">✓</span><p>说出 y = kx + b 中 k 与 b 的含义</p></div><div class="objective"><span class="objective-empty"></span><p>用表格或图像解释变量之间的变化</p></div><div class="rail-section-title people-title">模拟学生 <span>4 人</span></div><div class="student-roster">${roster}</div><div class="rail-note"><span>ⓘ</span><p>学生是预设角色，用于练习课堂应对，不代表真实学生表现。</p></div></aside><section class="classroom-panel"><div class="class-header"><div><div class="eyebrow">CLASSROOM SIMULATION <span>·</span> 第 ${round} 轮互动</div><h2>你正在带领一堂课</h2></div><div class="class-controls"><span class="fixed-scenario">八年级数学 · 一次函数</span><span class="class-status">${debrief ? '复盘中' : '练习中'}</span></div></div><div class="classroom-banner"><div class="banner-icon">▱</div><div><b>黑板上的问题</b><p>一次函数 <strong>y = 2x + 1</strong> 中，2 和 1 分别告诉我们什么？</p></div><span class="board-tag">概念理解</span></div><div class="conversation" aria-live="polite"><div class="conversation-label"><span>课堂对话</span><span>刚刚发生</span></div>${renderTurns()}</div>${debrief ? renderDebrief() : `<div class="composer-wrap"><div class="prompt-chips"><span>可以这样开始</span><button data-prompt="0">追问变化规律 <b>↗</b></button><button data-prompt="1">用表格探索 <b>↗</b></button><button data-prompt="2">邀请学生参与 <b>↗</b></button></div><form class="composer" id="teacher-form"><textarea id="teacher-input" aria-label="输入你的教学引导" placeholder="输入你的教学引导或提问……"></textarea><div class="composer-footer"><span>Enter 发送 · Shift + Enter 换行</span><div><button type="button" class="finish-button" id="finish-class">结束并复盘</button><button type="submit" class="send-button" id="send-button" disabled>发送引导 <span>↑</span></button></div></div></form></div>`}</section><aside class="insight-rail"><div class="insight-head"><div><span class="eyebrow">TEACHER'S DESK</span><h3>课堂观察</h3></div><span class="sparkle">✳</span></div><div class="observation-card"><div class="observation-icon peach-icon">◌</div><div><b>理解差异</b><p>有人已理解变化规律，有人还在混淆 x 与 y。</p></div><span class="observation-dot peach-dot"></span></div><div class="observation-card"><div class="observation-icon blue-icon">↗</div><div><b>参与信号</b><p>${invite ? '陈可开始尝试复述自己的理解。' : '陈可目前较安静，可以用低压力问题邀请表达。'}</p></div><span class="observation-dot blue-dot"></span></div><div class="observation-card"><div class="observation-icon mint-icon">⌁</div><div><b>理解迁移</b><p>周小满会计算结果，需要把数值变化联系到图像。</p></div><span class="observation-dot mint-dot"></span></div><div class="right-divider"></div><div class="question-title"><span>可追问的问题</span><span>模拟提示</span></div><button class="question-card" data-suggest="你是怎么知道 y 增加了 2 的？可以把每一步说出来吗？"><span>01</span><p>“你是怎么知道 y 增加了 2 的？”</p><b>↗</b></button><button class="question-card" data-suggest="如果 x=0，y 是多少？这个点在图上代表什么？"><span>02</span><p>“x=0 时的 y，在图上代表什么？”</p><b>↗</b></button><div class="teacher-tip"><span class="tip-icon">✦</span><div><b>带课小提示</b><p>先让学生说出自己的想法，再决定要不要补充解释。</p></div></div><div class="prototype-stamp"><span>LOCAL PROTOTYPE</span><p>当前是可交互的规则演示，不含真实 AI 推理或学情数据。</p></div></aside></div></main>`

  root.querySelector('#reset-class').addEventListener('click', () => { turns = [...openingTurns]; round = 1; debrief = false; classRoster.forEach((student, i) => { student.state = ['ready', 'quiet', 'thinking', 'offtask'][i] }); render() })
  root.querySelector('#teacher-form')?.addEventListener('submit', (event) => { event.preventDefault(); submitTurn() })
  const input = root.querySelector('#teacher-input')
  input?.addEventListener('input', () => { root.querySelector('#send-button').disabled = !input.value.trim() })
  input?.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitTurn() } })
  root.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => submitTurn(quickPrompts[Number(button.dataset.prompt)])))
  root.querySelectorAll('[data-suggest]').forEach((button) => button.addEventListener('click', () => submitTurn(button.dataset.suggest)))
  root.querySelector('#finish-class')?.addEventListener('click', () => { debrief = true; render() })
  root.querySelector('#continue-class')?.addEventListener('click', () => { debrief = false; render() })
  const conversation = root.querySelector('.conversation')
  if (conversation) conversation.scrollTop = conversation.scrollHeight
}

render()
