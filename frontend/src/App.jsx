import { useState } from 'react'
import QuestionInput from './components/QuestionInput.jsx'
import DebateArena from './components/DebateArena.jsx'
import BalanceSheetView from './components/BalanceSheetView.jsx'
import HistoryList from './components/HistoryList.jsx'

export default function App() {
  // page: 'input' | 'debate' | 'sheet' | 'history'
  const [page, setPage] = useState('input')
  const [debate, setDebate] = useState(null) // { debate_id, question, max_rounds, agents }
  const [sheet, setSheet] = useState(null)

  /** 开始一场新辩论 */
  const handleStart = (debateInfo) => {
    setDebate(debateInfo)
    setSheet(null)
    setPage('debate')
  }

  /** 辩论结束 → 生成平衡单 */
  const handleConclude = async () => {
    if (!debate) return
    setPage('sheet') // 先切到平衡单页（内部会展示 loading 并请求数据）
  }

  /** 从平衡单页返回再战一场 */
  const handleRestart = () => {
    setDebate(null)
    setSheet(null)
    setPage('input')
  }

  return (
    <>
      {page === 'input' && (
        <QuestionInput onStart={handleStart} onHistory={() => setPage('history')} />
      )}

      {page === 'history' && (
        <HistoryList
          onBack={() => setPage('input')}
          onOpenSheet={(d) => {
            setDebate(d)
            setSheet(null)
            setPage('sheet')
          }}
        />
      )}

      {page === 'debate' && debate && (
        <DebateArena
          debate={debate}
          onConclude={handleConclude}
        />
      )}

      {page === 'sheet' && debate && (
        <BalanceSheetView
          debateId={debate.debate_id}
          question={debate.question}
          initialSheet={sheet}
          onSheetReady={setSheet}
          onRestart={handleRestart}
        />
      )}
    </>
  )
}