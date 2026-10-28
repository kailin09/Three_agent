const root = document.getElementById('transfer-root')
const TRANSFER_API_BASE = window.location.protocol === 'file:' ? 'http://localhost:8000' : ''
let customGenerationNotice = ''

const mathTasks = [
  {
    name: '把陌生情境写成关系式', short: '情境建模', lens: '概念对应', tag: '陌生情境',
    story: '陶艺工作坊按件烧制作品。每件收取 3 元烧制费，另收一次性材料费 8 元。',
    question: '做 x 件作品，总费用 y 元。哪一种表达和解释都正确？',
    options: [
      { id: 'a', formula: 'y = 3x + 8', reason: '3 是每件费用，8 是固定材料费。', correct: true },
      { id: 'b', formula: 'y = 8x + 3', reason: '8 是每件费用，3 是固定材料费。', correct: false, type: 'swap' },
      { id: 'c', formula: 'y = 3x + 8', reason: '3 是固定材料费，8 是每件费用。', correct: false, type: 'meaning' },
    ],
    hints: [
      '先分开看：哪笔费用不随作品件数变化？哪笔会随件数增加？',
      '每件增加 3 元，是“件数每增加 1，总价增加多少”；固定 8 元在 x=0 时也要付。',
      '把两部分对应到 y=kx+b：每单位变化量写在 x 前面，固定费用写在末尾。',
    ],
  },
  {
    name: '从表格里找变化规律', short: '表示转换', lens: '表征转换', tag: '换一种表示',
    story: '一台小型打印机记录了连续几个订单的页数和总价。这次不告诉你收费规则，只给出几组数据。',
    table: [['页数 x', '0', '1', '3', '5'], ['总价 y（元）', '4', '7', '13', '19']],
    question: '表中数据对应哪一个关系式？你依据的关键规律是什么？',
    options: [
      { id: 'a', formula: 'y = 3x + 4', reason: 'x 每增加 1，y 增加 3；x=0 时 y=4。', correct: true },
      { id: 'b', formula: 'y = 4x + 3', reason: 'x 每增加 1，y 增加 4；起点是 3。', correct: false, type: 'swap' },
      { id: 'c', formula: 'y = 3x + 4', reason: '代入几个数能算对就够了，不需要看整体变化规律。', correct: false, type: 'surface' },
    ],
    hints: [
      '比较相邻数据：页数增加时，总价每次增加多少？',
      '从 (0,4) 到 (1,7)，总价增加 3；再检查其余数据是否符合。',
      '先用 x=0 确定起始值，再用相邻数据变化确定单位变化量。',
    ],
  },
  {
    name: '从预算反推出数量', short: '逆向应用', lens: '步骤迁移', tag: '逆向应用',
    story: '工作坊推出预算挑战：总费用最多 32 元，材料费仍为 8 元，每件烧制费 3 元。',
    question: '最多能烧制几件？你会怎样从总价倒推出件数？',
    options: [
      { id: 'a', formula: '8 件', reason: '先从 32 元里扣除固定的 8 元，再把剩下的钱按每件 3 元计算。', correct: true },
      { id: 'b', formula: '10 件', reason: '直接用总预算 32 除以每件 3 元，再取整。', correct: false, type: 'procedure' },
      { id: 'c', formula: '12 件', reason: '先减掉 8 元，再把剩下的钱乘以 3。', correct: false, type: 'procedure' },
    ],
    hints: [
      '总价包含固定费用和按件费用。先想哪一部分不会随件数变化。',
      '从总预算里先扣除 8 元材料费，剩下的金额才用于支付烧制费。',
      '列出 3x + 8 = 32，再按等式的逆运算解出 x。',
    ],
  },
]

const physicsTasks = [
  {
    name: '在新物体中理解密度', short: '概念对应', lens: '概念对应', tag: '生活情境',
    story: '一个不规则陶瓷摆件质量为 120 克，排水法测得体积是 40 立方厘米。',
    question: '怎样表示它的密度？这个数值表示什么？',
    options: [
      { id: 'a', formula: 'ρ = 3 克/立方厘米', reason: '每 1 立方厘米的这种材料，平均质量是 3 克。', correct: true },
      { id: 'b', formula: 'ρ = 1/3 克/立方厘米', reason: '用体积除以质量，得到单位体积的质量。', correct: false, type: 'swap' },
      { id: 'c', formula: 'ρ = 3 克/立方厘米', reason: '120 与 40 的差是 80，所以密度是 3。', correct: false, type: 'meaning' },
    ],
    hints: ['密度描述单位体积里有多少质量。', '把质量和体积分别带入“密度 = 质量 ÷ 体积”。', '计算 120 ÷ 40，并用质量单位除以体积单位。'],
  },
  {
    name: '从实验记录表判断规律', short: '表示转换', lens: '表征转换', tag: '实验数据',
    story: '实验小组测量了三块同种材料的样品，只留下了质量与体积记录。',
    table: [['质量 m（克）', '60', '90', '120'], ['体积 V（立方厘米）', '20', '30', '40']],
    question: '这三块样品能否判断为同种材料？你依据什么？',
    options: [
      { id: 'a', formula: '可以，三组的 m/V 都等于 3', reason: '同种材料的密度相同，质量与体积的比值保持一致。', correct: true },
      { id: 'b', formula: '不可以，质量和体积的数值不相等', reason: '只有质量数和体积数相同，才是同种材料。', correct: false, type: 'surface' },
      { id: 'c', formula: '可以，因为三块样品的质量都不同', reason: '样品大小不同，就能说明它们是同一种材料。', correct: false, type: 'meaning' },
    ],
    hints: ['比较每组数据时，不要只看质量或体积的大小。', '分别计算每组的质量除以体积，看看结果是否一致。', '同种物质的密度相同；质量和体积可以不同，但 m/V 应相等。'],
  },
  {
    name: '从体积反推出质量', short: '逆向应用', lens: '步骤迁移', tag: '逆向应用',
    story: '另一种金属的密度是 2.7 克/立方厘米。现在有一块体积为 50 立方厘米的金属块。',
    question: '这块金属块的质量是多少？应怎样使用密度关系？',
    options: [
      { id: 'a', formula: '135 克', reason: '质量 = 密度 × 体积，即 2.7 × 50。', correct: true },
      { id: 'b', formula: '约 18.5 克', reason: '用体积 50 除以密度 2.7。', correct: false, type: 'procedure' },
      { id: 'c', formula: '52.7 克', reason: '把密度数值和体积数值相加。', correct: false, type: 'procedure' },
    ],
    hints: ['已知密度与体积，回忆密度、质量、体积三者的关系。', '从 ρ=m/V 出发，把等式变形成 m=？。', '用 2.7 克/立方厘米乘以 50 立方厘米，单位相乘后得到克。'],
  },
]

const englishTasks = [
  {
    name: '把时间线索用到新句子', short: '语境判断', lens: '概念对应', tag: '校园新闻',
    story: '班级通讯稿写道：“昨天，七年级同学参观了科技馆。”英文句子里也要表达这件已结束的事。',
    question: 'Yesterday, our class ___ the science museum. 哪个选项合适？',
    options: [
      { id: 'a', formula: 'visited', reason: 'yesterday 表明动作发生在过去，visit 要用过去式。', correct: true },
      { id: 'b', formula: 'visits', reason: '主语 our class 是单数，所以动词用 visits。', correct: false, type: 'meaning' },
      { id: 'c', formula: 'has visit', reason: '表示曾经做过的事时，在 has 后使用动词原形。', correct: false, type: 'swap' },
    ],
    hints: ['先找句子中的时间线索：这件事发生在什么时候？', '动作在 yesterday 已经结束，关注一般过去时的动词形式。', 'visit 是规则动词，过去式在词尾加 -ed。'],
  },
  {
    name: '从日程表读出过去的事', short: '表示转换', lens: '表征转换', tag: '阅读记录',
    story: '校刊记录了昨天的活动：9:20 到达美术馆；10:15 参观结束。',
    table: [['昨天', '活动记录'], ['9:20', '到达美术馆'], ['10:15', '参观结束']],
    question: '哪句话准确地把表格内容转换成英文？',
    options: [
      { id: 'a', formula: 'They arrived at the art museum at 9:20.', reason: '表格记录昨天的活动，arrive 用过去式 arrived。', correct: true },
      { id: 'b', formula: 'They arrive at the art museum at 9:20.', reason: '日程表的时间具体，所以动词使用一般现在时。', correct: false, type: 'surface' },
      { id: 'c', formula: 'They have arrived at the art museum yesterday.', reason: 'yesterday 与现在完成时可以同时使用。', correct: false, type: 'meaning' },
    ],
    hints: ['先看整张表记录的是昨天还是日常安排。', '把具体时间和已结束的动作联系起来，检查动词形式。', '一般过去时描述过去某个确定时间发生的动作；arrive 的过去式是 arrived。'],
  },
  {
    name: '把肯定句改成否定句', short: '句式转换', lens: '步骤迁移', tag: '逆向应用',
    story: 'Mia cleaned the art room yesterday. 现在要在不改变时间和原意的情况下，把句子改成否定句。',
    question: '哪一个改写正确？',
    options: [
      { id: 'a', formula: "Mia didn't clean the art room yesterday.", reason: "didn't 后使用动词原形 clean。", correct: true },
      { id: 'b', formula: "Mia didn't cleaned the art room yesterday.", reason: '原句动词是过去式，didn’t 后也保留过去式。', correct: false, type: 'procedure' },
      { id: 'c', formula: "Mia doesn't clean the art room yesterday.", reason: "否定句使用 doesn't，时间状语仍然是 yesterday。", correct: false, type: 'procedure' },
    ],
    hints: ['一般过去时的否定句需要一个助动词。', '加 did not 后，想一想主要动词要不要再变过去式。', "结构是主语 + didn't + 动词原形。"],
  },
]

const modules = {
  math: { subject: '数学', english: 'MATHEMATICS', stage: '初中 · 八年级', topic: '一次函数', icon: '📈', description: '把关系式用到收费情境、数据表与预算反推。', formula: 'y = kx + b', focus: ['变化率 k · 起始值 b', '情境建模 · 表格读数', '逆向求解 · 步骤迁移'], advice: ['说清每单位变化量与起始值分别对应哪一项。', '先比较相邻数据的变化，再用 x=0 的值找起点。', '列出关系式后，先移除固定值，再用单位变化量求数量。'] },
  physics: { subject: '物理', english: 'PHYSICS', stage: '初中 · 八年级', topic: '密度与测量', icon: '⚗️', description: '把密度关系用到物体测量、实验数据与反向计算。', formula: 'ρ = m / V', focus: ['质量 m · 体积 V', '比值不变 · 实验读数', '单位换算 · 反向求质量'], advice: ['确认质量除以体积表示什么，并说清单位含义。', '逐组比较质量与体积的比值，而不是只看某个数值。', '从 ρ=m/V 变形，再检查数量与单位是否匹配。'] },
  english: { subject: '英语', english: 'ENGLISH', stage: '初中 · 七年级', topic: '一般过去时', icon: 'A', description: '把过去时间线索用到校园新闻、阅读记录与句式转换。', formula: '主语 + 动词过去式', focus: ['过去时间线索 · 动词形式', '语境转换 · 时间判断', '否定句结构 · 词形还原'], advice: ['先判断动作是否发生在一个已经结束的过去时间。', '从记录表找时间线索，再检查句中动词形式。', "一般过去时否定句用 didn't，后接动词原形。"] },
}
const moduleTasks = { math: mathTasks, physics: physicsTasks, english: englishTasks }
let activeModule = 'math'
let tasks = mathTasks
let started = false

let step = 0
let selected = ''
let hintLevel = 0
let answers = [null, null, null]
let feedback = ''
let showIntro = true
let complete = false

const escapeHTML = (text) => String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const chosenOption = () => tasks[step].options.find((option) => option.id === selected)
const isIndependent = (answer) => Boolean(answer?.firstCorrect && answer.firstHintLevel === 0)

function diagnose() {
  const first = answers[0]
  const second = answers[1]
  const third = answers[2]
  const unit = modules[activeModule]
  if (isIndependent(first) && isIndependent(second) && isIndependent(third)) {
    return { type: 'transfer', title: unit.selfAssessment ? `自评显示，你能迁移“${unit.topic}”` : `可以独立迁移${unit.topic}知识`, description: unit.selfAssessment ? '你认为自己能够把这个知识点用到新情境、转换表示，并解决条件变化后的问题。这是自我检查结果，不是系统对自由作答的自动判分。' : '你在生活情境、数据记录和反向应用三个任务中都独立作答正确，能在不同表示和问题方向中找到知识间的联系。', next: unit.advice.transfer }
  }
  if (!isIndependent(first)) {
    return { type: 'concept', title: unit.selfAssessment ? `自评提示：“${unit.topic}”的概念联系还不够稳` : `先稳固${unit.topic}中的关键概念`, description: unit.selfAssessment ? '你的选择显示，独立解释这个知识点的用途或举出新例子还有困难。可以回到课堂笔记，先用自己的话说清它解决什么问题。' : first?.firstType === 'meaning' || first?.firstType === 'swap' ? '首次作答显示，你还没有稳定地把题目中的信息对应到学科概念。' : '首次作答尚未独立建立情境与知识点之间的联系。即使之后借助提示完成，也需要再确认你是否理解每项信息的含义。', next: unit.advice.concept }
  }
  if (!isIndependent(second)) {
    return { type: 'surface', title: unit.selfAssessment ? '自评提示：换一种表达时还需要支架' : '熟悉情境会做，换一种表示还需建立联系', description: unit.selfAssessment ? '你认为自己能在熟悉场景中使用这个知识，但换成图表、流程或新例子时还不够确定。' : '你能独立处理第一种情境，但在数据记录或另一种表达形式中，知识点还没有稳定迁移。', next: unit.advice.surface }
  }
  return { type: 'procedure', title: unit.selfAssessment ? '自评提示：新问题中的步骤选择还需练习' : '概念迁移已具备，解题步骤还需巩固', description: unit.selfAssessment ? '你认为自己能够解释概念并换一种方式表达，但面对条件变化时还不太确定从哪一步开始。' : '你能独立在情境和数据记录中识别知识点，但还没有独立完成第三个应用任务。卡点更可能出现在知识公式的变形、步骤顺序或运算。', next: unit.advice.procedure }
}

function teacherActionFor(type, unit) {
  if (unit.selfAssessment) {
    return `这轮只记录了学生自评。下次课请让学生实际解答一道“${unit.topic}”新情境题，再根据步骤判断卡点；不要仅凭自评结果分组。`
  }
  const actions = {
    concept: `下节课先用一道新的${unit.subject}情境题，请学生圈出关键条件，并用自己的话解释它和“${unit.topic}”有什么关系。`,
    surface: `安排一次“同一内容、两种表示”的短练习：让学生把题目从文字改成图表或式子，再说清两种表示如何对应。`,
    procedure: `先给一道条件变化题，让学生分别写出“已知什么、要求什么、第一步为什么这样做”，再练计算。`,
    transfer: `增加一道有额外限制的新题，让学生说明原方法哪些仍适用、哪些需要调整。`,
  }
  return actions[type] || actions.procedure
}

function startOrReset() {
  step = 0; selected = ''; hintLevel = 0; answers = [null, null, null]; feedback = ''; showIntro = true; complete = false; started = true
  render()
}

function startModule(id) {
  activeModule = id
  if (id !== 'custom') tasks = moduleTasks[id]
  startOrReset()
}

function renderSelection() {
  const cards = Object.keys(moduleTasks).map((id) => { const module = modules[id]; return `<button class="module-card" data-module="${id}"><span class="module-icon">${module.icon}</span><span class="module-stage">${module.stage}</span><span class="module-title-row"><b>${module.subject}</b><small>${module.english}</small></span><strong>${module.topic}</strong><p>${module.description}</p><span class="module-action">进入这个知识点 <i>↗</i></span></button>` }).join('')
    root.innerHTML = `<main class="transfer-app"><header class="transfer-topbar"><a class="transfer-brand" href="#"><span class="transfer-logo">迁</span><span><b>知行 · 知识迁移诊断</b><small>TRANSFER LEARNING CHECK</small></span></a><div class="transfer-top-center"><i></i> 讲完一个知识点后的 5 分钟</div><a class="selection-report-link" href="./classroom-report.html">看教师反馈示例 ↗</a></header><section class="module-selection"><div class="selection-heading"><span>课堂离堂小测</span><h1>刚讲完的内容，学生会用了吗？</h1><p>选一个刚教完的知识点，让学生完成三种迁移任务。结果用于决定下一节课复习什么，不作为考试分数。</p></div><div class="module-grid">${cards}</div><form class="custom-entry" id="custom-entry"><div class="custom-entry-heading"><span class="custom-entry-icon">＋</span><div><b>自定义学科与知识点</b><small>适合刚讲完一个明确知识点时使用</small></div></div><div class="custom-fields"><label>年级<select id="custom-grade"><option value="初一">初一</option><option value="初二">初二</option><option value="初三">初三</option><option value="高一">高一</option><option value="高二">高二</option><option value="高三">高三</option><option value="其他">其他 / 不指定</option></select></label><label>学科<input id="custom-subject" list="subject-suggestions" placeholder="例如：化学、历史、地理" required /><datalist id="subject-suggestions"><option value="数学"/><option value="物理"/><option value="化学"/><option value="生物"/><option value="语文"/><option value="英语"/><option value="历史"/><option value="地理"/><option value="政治"/><option value="信息技术"/></datalist></label><label class="topic-field">刚学的知识点<input id="custom-topic" placeholder="例如：牛顿第二定律、光合作用、因式分解" required /></label><button class="custom-start" type="submit">开始离堂检测 <span>→</span></button></div><p class="custom-disclaimer">未连接模型服务时会进入自我检查，不会自动判定答案。想看老师如何据结果安排下一节课，可先看教师反馈示例。</p><p class="custom-entry-status" id="custom-entry-status" aria-live="polite"></p></form><div class="selection-note"><span>i</span><p>诊断范围是一轮刚学过的知识点：看学生能否在新情境中识别、换一种表示、处理变化后的条件。一次结果只作课堂学习线索。</p></div></section></main>`
  root.querySelectorAll('[data-module]').forEach((button) => button.addEventListener('click', () => startModule(button.dataset.module)))
   root.querySelector('#custom-entry').addEventListener('submit', async (event) => {
    event.preventDefault()
    const grade = root.querySelector('#custom-grade').value
    const subject = root.querySelector('#custom-subject').value.trim()
    const topic = root.querySelector('#custom-topic').value.trim()
    if (!subject || !topic) return
    modules.custom = {
      subject, english: 'CUSTOM', stage: grade, topic, icon: '✎', description: `${grade} · ${subject} · ${topic}`,
       formula: '通用迁移练习', selfAssessment: true, generationMode: 'fallback',
      focus: ['陌生情境中的应用', '不同表示之间的转换', '新问题中的步骤选择'],
      observation: ['能否举例并解释知识何时适用', '能否用另一种方式表达知识', '能否把步骤迁移到新问题'],
      advice: {
        concept: `请用自己的话说明“${topic}”解决什么问题，并指出在新情境中哪些信息会让你想到它。`,
        surface: `试着不用课本例题的表达方式，画图、列步骤或举例解释“${topic}”的核心关系。`,
        procedure: `找一道条件有所变化的新题，先标出已知与所求，再逐步说明每一步为何适用。`,
        transfer: `换一个课堂例题以外的情境，试着解释“${topic}”如何帮助你理解或解决问题。`,
      },
    }
    tasks = [
      { name: '放进一个陌生情境', short: '情境迁移', lens: '情境迁移', tag: '换个场景', story: `你正在检查自己能否把“${topic}”用到课堂例题以外的情境。`, question: `哪一种描述最接近你目前对“${topic}”的掌握？`, options: [
        { id: 'a', formula: '能举出新情境并说清为什么适用', reason: '我能指出情境中的信息，并解释它和这个知识点的联系。', correct: true },
        { id: 'b', formula: '能复述例题，换个情境就不确定', reason: '我认得熟悉题型，但还说不清什么时候该用。', correct: false, type: 'surface' },
        { id: 'c', formula: '暂时想不到它能解决什么问题', reason: '我还需要重新理解这个知识点的用途。', correct: false, type: 'concept' },
      ], hints: ['回想这个知识点帮助你解决哪一类问题。', '试着换成生活、校园或其他学科里的一个新场景。', '用“遇到……时，我会想到……，因为……”说出联系。'] },
      { name: '换一种方式表达', short: '表示转换', lens: '表示转换', tag: '换种表达', story: `把“${topic}”从课堂上学过的形式，转换成另一种表达方式。`, question: '你能否用图、表、公式、流程或自己的例子解释这个知识？', options: [
        { id: 'a', formula: '能换一种表示并解释两者的联系', reason: '我能说明图表、公式或例子分别表达了什么。', correct: true },
        { id: 'b', formula: '会照着熟悉格式做，换格式就卡住', reason: '我可能记住了固定写法，还没建立不同表示间的联系。', correct: false, type: 'surface' },
        { id: 'c', formula: '不确定该用什么方式表示', reason: '我还不能稳定提取这个知识点的关键关系。', correct: false, type: 'concept' },
      ], hints: ['想想课堂上除了文字，还用过哪些表示方式。', '选择一种不同形式，例如把文字关系画成图或列成表。', '试着指出两种表示中哪些信息是对应的。'] },
      { name: '迁移到一个新问题', short: '步骤迁移', lens: '步骤迁移', tag: '新问题', story: `现在条件或问法发生变化，看看你会怎样使用“${topic}”。`, question: '你遇到新题时，通常能否选出合适步骤并解释理由？', options: [
        { id: 'a', formula: '能选步骤、完成应用并解释理由', reason: '我能根据新题条件调整做法，不只复现原例题。', correct: true },
        { id: 'b', formula: '熟悉题能做，条件一变就容易混淆', reason: '我可能知道方法，但步骤选择还不够稳。', correct: false, type: 'procedure' },
        { id: 'c', formula: '常不知道从哪里开始', reason: '我需要练习识别已知条件、目标和可用方法。', correct: false, type: 'procedure' },
      ], hints: ['先把题目给出的信息和要求解决的问题分开。', '找出哪些条件可能和已学知识有关。', '说明为什么选这个步骤，并检查新条件是否改变了原方法。'] },
    ]
     const submitButton = root.querySelector('.custom-start')
     const submitStatus = root.querySelector('#custom-entry-status')
     submitButton.disabled = true
     submitButton.textContent = '正在按知识点生成题目…'
     submitStatus.textContent = '正在生成三道迁移题和分层提示，请稍候。'
     customGenerationNotice = ''
     try {
       const response = await fetch(`${TRANSFER_API_BASE}/api/transfer/generate`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'transfer-diagnosis' },
         body: JSON.stringify({ grade, subject, topic }),
       })
       if (!response.ok) throw new Error('模型服务暂不可用')
       const generated = await response.json()
       if (!Array.isArray(generated.tasks) || generated.tasks.length !== 3) throw new Error('模型返回内容不完整')
       modules.custom = {
         subject, english: 'AI GENERATED', stage: grade, topic, icon: '✦',
         description: `${grade} · ${subject} · ${topic}`, formula: 'AI生成迁移题组',
         selfAssessment: false, aiGenerated: true, generationMode: 'ai',
         focus: generated.focus, observation: generated.observation, advice: generated.advice,
       }
       tasks = generated.tasks.map((task) => ({ ...task, aiGenerated: true }))
       customGenerationNotice = '题目由模型即时生成，答案与诊断建议可能有误；课堂使用前请教师复核。'
     } catch {
       customGenerationNotice = '当前没有可用的模型服务，已切换到通用自我检查。启动本地后端并配置模型 API 密钥后，可生成学科题目。'
     }
    startModule('custom')
  })
}

function requestHint() {
  if (hintLevel < tasks[step].hints.length) hintLevel += 1
  render()
}

function recordAnswer() {
  const option = chosenOption()
  if (!option) return
  const current = answers[step]
  if (!current) {
    answers[step] = {
      firstChoice: option.id,
      firstText: `${option.formula} · ${option.reason}`,
      firstCorrect: option.correct,
      firstType: option.type ?? null,
      firstHintLevel: hintLevel,
      attempts: 1,
      aidedCorrect: null,
      totalHints: hintLevel,
    }
    feedback = modules[activeModule].selfAssessment
      ? '已记录你的自评。可以继续查看下一种迁移方式；提示后仍可重新判断。'
      : modules[activeModule].aiGenerated
      ? option.correct ? '判断合理。' + option.reason : '这项选择反映的卡点：' + option.reason
      : option.correct
      ? hintLevel === 0 ? '答对了。我们会把这次记为“独立完成”，继续观察你能否换一种表示来使用这个知识。' : `在看过 ${hintLevel} 级提示后答对了。答案已记录为“提示后完成”，继续下一步。`
      : '这次选择已经记录。可以逐级查看提示、再试一次；也可以保留这个卡点继续后面的任务。'
  } else {
    current.attempts += 1
    current.totalHints = Math.max(current.totalHints, hintLevel)
    current.aidedCorrect = option.correct
    current.lastRetryHintLevel = hintLevel
    feedback = modules[activeModule].selfAssessment
      ? '已记录你再次检查后的自评。首次选择仍保留在记录里。'
      : modules[activeModule].aiGenerated
      ? option.correct ? '复试判断合理。' + option.reason + '首次选择仍保留在记录里。' : '这项选择对应的卡点：' + option.reason + '首次选择仍保留在记录里。'
      : option.correct
      ? hintLevel > 0 ? '这次在提示后答对了。系统会保留首次作答，并把这次记作“辅助后完成”。' : '这次复试答对了。系统会保留首次作答，并单独记录复试结果。'
      : '这次仍未选对。首次作答和提示层级都会保留，之后可继续尝试或进入下一任务。'
  }
  selected = ''
  render()
}

function moveNext() {
  if (step === tasks.length - 1) { complete = true; render(); return }
  step += 1; selected = ''; hintLevel = 0; feedback = ''; render()
}

function statusText(index) {
  const answer = answers[index]
  if (modules[activeModule]?.selfAssessment && answer) {
    if (answer.firstCorrect) return answer.firstHintLevel === 0 ? '自评可独立' : '提示后自评可完成'
    if (answer.attempts > 1) return answer.aidedCorrect ? '复试后自评可完成' : '复试后仍有困难'
    return '自评有卡点'
  }
  if (answer) return isIndependent(answer) ? '独立通过' : answer.firstCorrect ? `提示 ${answer.firstHintLevel} 级后通过` : answer.aidedCorrect ? answer.lastRetryHintLevel > 0 ? '提示后完成' : '复试后完成' : '记录了卡点'
  return index === step && !complete ? '观察中' : '待观察'
}

function renderTable(table) {
  if (!table) return ''
  return `<div class="transfer-data-table"><table><tbody>${table.map((row) => `<tr>${row.map((cell, i) => i === 0 ? `<th>${escapeHTML(cell)}</th>` : `<td>${escapeHTML(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
}

function renderOptions(task) {
   return task.options.map((option, index) => `<button class="transfer-option ${selected === option.id ? 'selected' : ''}" data-choice="${option.id}" aria-pressed="${selected === option.id}"><span class="choice-letter">${String.fromCharCode(65 + index)}</span><span class="choice-radio">${selected === option.id ? '●' : '○'}</span><span class="choice-copy"><b>${escapeHTML(option.formula)}</b>${task.aiGenerated ? '' : `<small>${escapeHTML(option.reason)}</small>`}</span><span class="choice-chevron">↗</span></button>`).join('')
}

function renderEvidence() {
  const d = diagnose()
  const unit = modules[activeModule]
  const firstCorrect = answers.filter(isIndependent).length
  const metric = unit.selfAssessment ? `${firstCorrect} / 3 项自评认为可独立完成` : `${firstCorrect} / 3 题独立首次答对`
   const summary = unit.selfAssessment ? '这是根据你的自我检查选择生成的学习线索，不是系统对自由答案的自动判分。' : unit.aiGenerated ? '这是基于模型生成题目和预设规则形成的学习线索；题目、答案或分类可能有误，不是正式能力评价。' : '这是基于三道选择题和预设规则生成的学习线索，不是正式能力评价。'
  return `<div class="result-banner result-${d.type}"><span class="result-symbol">${d.type === 'transfer' ? '↗' : d.type === 'procedure' ? '↻' : d.type === 'surface' ? '◌' : '◎'}</span><div><span class="result-overline">${unit.selfAssessment ? '自我检查 · 根据你的选择生成' : '本轮判断 · 基于首次作答与提示记录'}</span><h3>${escapeHTML(d.title)}</h3><p>${escapeHTML(d.description)}</p></div></div><div class="evidence-heading"><b>作答证据</b><span>${metric}</span></div><div class="evidence-list">${tasks.map((task, i) => { const answer = answers[i]; const independent = isIndependent(answer); const status = unit.selfAssessment ? statusText(i) : independent ? '独立完成' : answer?.firstCorrect ? `提示 ${answer.firstHintLevel} 级后答对` : answer?.aidedCorrect ? answer.lastRetryHintLevel > 0 ? '首次错误，提示后修正' : '首次错误，复试后修正' : '首次作答未正确'; return `<div class="evidence-row"><span class="evidence-icon ${independent ? 'evidence-pass' : 'evidence-review'}">${independent ? '✓' : '!'}</span><div class="evidence-detail"><b>${escapeHTML(task.name)}</b><small>${escapeHTML(status)}${answer?.attempts > 1 ? ` · 共尝试 ${answer.attempts} 次` : ''}</small><p>首次选择：${escapeHTML(answer?.firstText ?? '尚无记录')}</p></div><span class="evidence-topic">${escapeHTML(task.lens)}</span></div>` }).join('')}</div><div class="next-step-card"><span>给学生的下一步</span><p>${escapeHTML(d.next)}</p></div><div class="teacher-action-card"><span>老师可以据此安排</span><p>${escapeHTML(teacherActionFor(d.type, unit))}</p></div><p class="diagnostic-limit">${summary}</p><button id="again-button" class="primary-action">再做一轮 <span>↗</span></button>`
}

function render() {
  if (!started) { renderSelection(); return }
  const task = tasks[step]
  const unit = modules[activeModule]
  const isDone = answers.filter(Boolean).length
  const progress = complete ? 100 : Math.round(((step + 1) / tasks.length) * 100)
  const result = complete ? diagnose() : null
  const path = tasks.map((item, i) => `<div class="path-row ${i === step && !complete ? 'path-current' : ''} ${answers[i] ? 'path-recorded' : ''}"><span class="path-index">${isIndependent(answers[i]) ? '✓' : `0${i + 1}`}</span><div><b>${escapeHTML(item.short)}</b><small>${escapeHTML(item.lens)}</small></div><span class="path-status">${complete ? statusText(i) : answers[i] ? statusText(i) : i === step ? '现在' : '之后'}</span></div>`).join('')
  const completion = answers[step]
  const options = renderOptions(task)
  root.innerHTML = `<main class="transfer-app"><header class="transfer-topbar"><a class="transfer-brand" href="#"><span class="transfer-logo">迁</span><span><b>知行 · 知识迁移诊断</b><small>TRANSFER LEARNING CHECK</small></span></a><div class="transfer-top-center"><i></i> 八年级数学 <span>/</span> 一次函数 <span>/</span> 个人练习</div><button class="transfer-reset" id="reset-transfer">↻ <span>重新开始</span></button></header><div class="transfer-layout"><aside class="transfer-left"><div class="side-kicker">学习单元 <span>UNIT 04</span></div><section class="unit-card"><span class="unit-ornament">ƒ</span><span class="unit-category">函数与变化</span><h1>一次<br>函数</h1><div class="unit-formula">y = kx + b</div><p>不重复背定义。试试看能不能在新问题里认出它。</p></section><div class="path-heading">诊断路径 <span>03 项</span></div><div class="path-list">${path}</div><div class="focus-card"><span class="focus-glyph">◎</span><div><b>本轮观察重点</b><p>变化率 k · 起始值 b<br>表示转换 · 逆向应用</p></div></div><div class="local-storage-note">作答仅保存在当前页面内存中，刷新页面会清空。</div></aside><section class="transfer-main"><div class="main-heading"><div><span class="main-kicker">TRANSFER CHALLENGE <i>·</i> 迁移任务 ${complete ? '完成' : `0${step + 1}`}</span><h2>${complete ? '本轮诊断完成' : escapeHTML(task.name)}</h2></div><div class="main-progress"><b>${progress}%</b><div><i style="width:${complete ? 100 : Math.round(((step + 1) / tasks.length) * 100)}%"></i></div></div></div>${showIntro && !complete ? `<div class="intro-strip"><span>✦</span><p>先独立作答。需要时可以逐级看提示；系统会分别记录首次作答和提示后的表现。<b>提示后答对不计作独立掌握。</b></p><button id="close-intro" aria-label="关闭说明">×</button></div>` : ''}${complete ? renderEvidence() : `<div class="scenario-card"><div class="scenario-illustration"><span class="illustration-orbit"></span><span class="illustration-orbit orbit-small"></span><b>${step === 0 ? '陶' : step === 1 ? '表' : '算'}</b><i>✳</i><em>·</em></div><div class="scenario-copy"><span class="scenario-tag">${escapeHTML(task.tag)}</span><p>${escapeHTML(task.story)}</p></div><span class="scenario-number">0${step + 1}<small> / 03</small></span></div>${renderTable(task.table)}<div class="question-card"><div class="question-number">0${step + 1}<small>QUESTION</small></div><div class="question-content"><h3>${escapeHTML(task.question)}</h3><div class="transfer-options">${options}</div></div></div>${hintLevel ? `<div class="hint-card"><span class="hint-star">✦</span><div><small>提示 ${hintLevel} / ${task.hints.length}</small><p>${escapeHTML(task.hints[hintLevel - 1])}</p></div>${hintLevel < task.hints.length ? `<button id="next-hint">再给一点提示 <b>→</b></button>` : ''}</div>` : ''}${feedback ? `<div class="answer-feedback ${completion?.firstCorrect ? 'feedback-correct' : 'feedback-nudge'}"><span>${completion?.firstCorrect ? '✓' : '↗'}</span><p>${escapeHTML(feedback)}</p></div>` : ''}<div class="action-row">${!feedback ? `<button id="show-hint" class="hint-action" ${hintLevel >= task.hints.length ? 'disabled' : ''}>我想要提示 <small>${hintLevel} / ${task.hints.length}</small></button><button id="submit-answer" class="primary-action" ${selected ? '' : 'disabled'}>提交作答 <span>→</span></button>` : `<div class="after-answer-actions">${!completion?.firstCorrect || completion?.firstHintLevel > 0 ? `<button id="show-hint" class="hint-action" ${hintLevel >= task.hints.length ? 'disabled' : ''}>${hintLevel >= task.hints.length ? '提示已用完' : '再看一个提示'} <small>${hintLevel} / ${task.hints.length}</small></button><button id="retry-answer" class="secondary-action" ${selected ? '' : 'disabled'}>再试一次</button>` : ''}</div><button id="continue-answer" class="primary-action">${step === tasks.length - 1 ? '查看诊断结果' : '继续下一题'} <span>→</span></button>${!completion?.firstCorrect ? `<button id="skip-answer" class="skip-action">记录卡点，继续</button>` : ''}`}</div>`}<aside class="transfer-right"><div class="right-title"><div><b>诊断仪表盘</b><small>根据作答逐步更新</small></div><span>⌁</span></div><div class="score-card"><div><span>独立首次答对</span><b>${answers.filter(isIndependent).length}<small> / 3</small></b></div><i><em style="width:${answers.filter(isIndependent).length / 3 * 100}%"></em></i><small>提示前答对才能计入独立完成</small></div><div class="watch-title">正在观察 <span>LIVE</span></div>${tasks.map((item, i) => `<div class="watch-card ${i === step && !complete ? 'watch-active' : ''}"><span class="watch-index">0${i + 1}</span><div><b>${item.lens}</b><p>${i === 0 ? '能否分清固定值与单位变化量' : i === 1 ? '能否从表格重建函数关系' : '能否从总价反推出数量'}</p></div><small>${complete ? statusText(i) : answers[i] ? statusText(i) : i === step ? '观察中' : '待观察'}</small></div>`).join('')}<div class="right-rule"></div><div class="hint-policy"><span>↘</span><div><b>渐进提示</b><p>提示从提醒关注信息，逐步过渡到明确列式。系统记录提示层级，区分独立作答和提示后完成。</p></div></div><div class="prototype-note"><b>LOCAL PROTOTYPE · RULE-BASED</b><p>当前由选择题与预设规则形成学习线索，不含真实 AI 推理或学情数据。</p></div></aside></div><footer class="transfer-footer"><span>LEARN BY TRANSFERRING</span><span>一次函数 · 概念迁移练习</span></footer></main>`

  const mainPanel = root.querySelector('.transfer-main')
  const observationPanel = root.querySelector('.transfer-right')
  if (mainPanel && observationPanel && mainPanel.contains(observationPanel)) mainPanel.after(observationPanel)
  const resetButton = root.querySelector('#reset-transfer')
  const headerActions = document.createElement('div')
  headerActions.className = 'header-actions'
  const moduleButton = document.createElement('button')
  moduleButton.id = 'change-module'
  moduleButton.className = 'change-module'
  moduleButton.textContent = '换学科'
  resetButton.replaceWith(headerActions)
  headerActions.append(moduleButton, resetButton)

  root.querySelector('.transfer-brand b').textContent = `${unit.subject} · ${unit.topic}迁移练习`
  root.querySelector('.transfer-top-center').innerHTML = `<i></i> ${escapeHTML(unit.stage)} ${escapeHTML(unit.subject)} <span>/</span> ${escapeHTML(unit.topic)} <span>/</span> 个人练习`
  root.querySelector('.transfer-footer span:last-child').textContent = `${unit.topic} · 知识迁移练习`
  root.querySelector('.right-title b').textContent = '作答观察'
  if (unit.selfAssessment) {
    root.querySelector('.score-card > div span').textContent = '自评能独立完成'
    root.querySelector('.score-card > small').textContent = '按你的选择记录，不作为自动判分'
    root.querySelector('.prototype-note p').textContent = '自定义学科使用自我检查模板；系统不会自动判断自由答案的学科正误。'
    if (complete) {
      root.querySelector('.evidence-heading span').textContent = `${answers.filter(isIndependent).length} / 3 项自评认为可独立完成`
      root.querySelector('.result-overline').textContent = '自我检查 · 根据你的选择生成'
      root.querySelectorAll('.evidence-detail small').forEach((label, i) => { label.textContent = statusText(i) })
    }
  }
  if (unit.aiGenerated) {
    root.querySelector('.prototype-note p').textContent = '题目由模型即时生成，系统按生成的参考答案记录表现；内容可能有误，课堂使用前请教师复核。'
    root.querySelector('.main-kicker').textContent = 'AI生成题组 · 迁移任务 ' + String(step + 1).padStart(2, '0') + ' / 03'
    if (complete) root.querySelector('.result-overline').textContent = '模型生成题组 · 根据首次作答与提示记录'
  }
  if (unit.generationMode === 'fallback') {
    root.querySelector('.prototype-note p').textContent = customGenerationNotice || '当前使用通用自我检查模板；未连接模型服务时不会自动判定学科答案。'
  }
  root.querySelector('.unit-category').textContent = `${unit.stage} · ${unit.subject}`
  root.querySelector('.unit-card h1').textContent = unit.topic
  root.querySelector('.unit-formula').textContent = unit.formula
  root.querySelector('.focus-card p').innerHTML = unit.focus.map(escapeHTML).join('<br>')
  root.querySelector('.scenario-illustration b').textContent = unit.icon
  root.querySelectorAll('.watch-card p').forEach((label, i) => { label.textContent = unit.observation[i] })
  if (customGenerationNotice) {
    const introText = root.querySelector('.intro-strip p')
    if (introText) introText.textContent = customGenerationNotice
  }
  root.querySelector('#change-module').addEventListener('click', () => { started = false; render() })
  root.querySelector('.prototype-note b').textContent = '原型说明'
  root.querySelector('.main-kicker').textContent = `迁移任务 ${String(step + 1).padStart(2, '0')} / 03`
  root.querySelectorAll('.question-number small').forEach((label) => { label.textContent = '作答' })
  root.querySelector('#reset-transfer').addEventListener('click', startOrReset)
  root.querySelector('#close-intro')?.addEventListener('click', () => { showIntro = false; render() })
  root.querySelectorAll('[data-choice]').forEach((button) => button.addEventListener('click', () => { selected = button.dataset.choice; render() }))
  root.querySelector('#show-hint')?.addEventListener('click', requestHint)
  root.querySelector('#next-hint')?.addEventListener('click', requestHint)
  root.querySelector('#submit-answer')?.addEventListener('click', recordAnswer)
  root.querySelector('#retry-answer')?.addEventListener('click', recordAnswer)
  root.querySelector('#continue-answer')?.addEventListener('click', moveNext)
  root.querySelector('#skip-answer')?.addEventListener('click', moveNext)
  root.querySelector('#again-button')?.addEventListener('click', startOrReset)
}

render()
