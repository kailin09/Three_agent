"""跨会话用户决策画像：从历史辩论沉淀决策偏好，新辩论/平衡单注入消费

Agent 长期记忆的消费侧——辩论数据本就已落盘(debates.db)，
本模块把它提炼为结构化画像，让 Agent 能"记住"决策者的风格与历史决策。
"""
import json
import re
import sqlite3
from datetime import datetime
from typing import Dict, List, Optional

from llm_client import chat
from storage import DB_PATH

MAX_PAST_DECISIONS = 5  # 画像最多保留最近5场决策记录


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_profile_table():
    """建表（幂等），服务启动时调用"""
    with _conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS user_profile (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                profile_json TEXT NOT NULL,
                debates_count INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL
            )
        """)


def get_profile() -> Optional[Dict]:
    """读取全局用户画像（单用户产品，单行设计）"""
    with _conn() as c:
        row = c.execute("SELECT * FROM user_profile WHERE id=1").fetchone()
        if not row:
            return None
        return {
            "profile": json.loads(row["profile_json"]),
            "debates_count": row["debates_count"],
            "updated_at": row["updated_at"],
        }


def get_debates_count() -> int:
    """已沉淀画像的辩论场数（供前端徽标展示）"""
    with _conn() as c:
        row = c.execute(
            "SELECT debates_count FROM user_profile WHERE id=1"
        ).fetchone()
        return row["debates_count"] if row else 0


def build_profile_context() -> str:
    """把画像压缩为注入块（≤200字），无画像返回空串"""
    data = get_profile()
    if not data:
        return ""
    p = data["profile"]
    count = data["debates_count"]
    lines = [f"【决策者画像（沉淀自TA之前{count}场辩论，供你针对性发言）】"]
    if p.get("decision_style"):
        lines.append(f"决策风格：{p['decision_style']}")
    if p.get("risk_appetite"):
        lines.append(f"风险态度：{p['risk_appetite']}")
    if p.get("focus_dimensions"):
        lines.append(f"关注维度：{'、'.join(p['focus_dimensions'][:4])}")
    decisions = p.get("past_decisions", [])
    if decisions:
        parts = []
        for i, d in enumerate(decisions, 1):
            q = str(d.get("question", ""))[:18]
            lean = str(d.get("lean", ""))
            parts.append(f"{i}「{q}」→{lean}")
        lines.append("历史决策：" + " ".join(parts))
    return "\n".join(lines)


# ---------- 画像提取（LLM 结构化输出，与工具规划器同模式） ----------

_PROFILE_SYSTEM = (
    "你是用户决策画像分析员。根据一场辩论的辩题、发言记录和最终平衡单，"
    "提取决策者的画像增量，并与已有画像合并。"
    "只输出一个JSON对象，不要输出任何其他内容。"
)

_PROFILE_FEWSHOT = (
    "输出格式：\n"
    '{"decision_style": "20字内概括决策风格", '
    '"risk_appetite": "20字内概括风险态度", '
    '"focus_dimensions": ["关注的决策维度1", "维度2"], '
    '"past_decisions": [{"question": "辩题", "lean": "倾向选项", "reason": "10字内原因"}]}\n\n'
    "要求：\n"
    "1. decision_style/risk_appetite 优先从决策者的插话和平衡单倾向推断，"
    "无插话则从辩题类型和最终倾向推断；\n"
    "2. focus_dimensions 提炼决策者最关心的3~4个维度"
    "（如金钱成本、家庭因素、个人成长、风险退路）；\n"
    "3. past_decisions：本场辩论只新增1条记录"
    "（question=本场辩题，lean=推断的倾向选项，reason=10字内原因），"
    "与已有画像的历史决策合并后保留最近5条，"
    "严禁为同一场辩论生成多条记录，每条question截断到20字内；\n"
    "4. 若已有画像存在，新画像应是在其基础上的增量更新而非推翻。\n"
)


async def extract_and_update_profile(question: str, history: List[Dict],
                                     sheet: dict):
    """辩论+平衡单生成后调用：LLM提取画像增量并合并落盘

    失败静默（画像不影响主流程）。
    """
    old = get_profile()
    old_profile = old["profile"] if old else {}
    old_count = old["debates_count"] if old else 0
    # 压缩输入：辩手发言各取前100字，用户插话全保留，最多12条防膨胀
    transcript_parts = []
    for m in history:
        if m["role"] == "user":
            transcript_parts.append(f"决策者插话：{m['content']}")
        else:
            c = m["content"][:100]
            transcript_parts.append(f"{m['name']}：{c}")
    transcript = "\n".join(transcript_parts[-12:])
    lean_hint = ""
    if sheet:
        opts = sheet.get("options", [])
        rec = str(sheet.get("recommendation", ""))[:150]
        lean_hint = f"平衡单选项：{opts}\n平衡单建议：{rec}"
    user_content = (
        f"【本场辩题】{question}\n\n"
        f"【本场发言记录（节选）】\n{transcript}\n\n"
        f"【平衡单线索】\n{lean_hint or '（未生成平衡单）'}\n\n"
        f"【已有画像（在此基础上增量更新，无则新建）】\n"
        f"{json.dumps(old_profile, ensure_ascii=False) if old_profile else '（无）'}\n\n"
        f"{_PROFILE_FEWSHOT}"
    )
    try:
        raw = await chat(
            [{"role": "system", "content": _PROFILE_SYSTEM},
             {"role": "user", "content": user_content}],
            temperature=0.2,
            max_tokens=400,
        )
        m = re.search(r'\{.*\}', raw, re.DOTALL)
        if not m:
            return
        profile = json.loads(m.group(0))
        # 字段兜底 + 清洗（flash模型输出常带前导空格）
        profile["decision_style"] = str(profile.get("decision_style", "")).strip()
        profile["risk_appetite"] = str(profile.get("risk_appetite", "")).strip()
        profile["focus_dimensions"] = [
            str(d).strip() for d in profile.get("focus_dimensions", [])
            if str(d).strip()
        ]
        # past_decisions 清洗 + 按辩题去重（同一场辩论只留1条，取最后一条）
        raw_decisions = profile.get("past_decisions", [])
        cleaned = []
        seen_questions = set()
        for d in reversed(raw_decisions):
            if not isinstance(d, dict):
                continue
            q = str(d.get("question", "")).strip()[:20]
            if not q or q in seen_questions:
                continue
            seen_questions.add(q)
            cleaned.append({
                "question": q,
                "lean": str(d.get("lean", "")).strip(),
                "reason": str(d.get("reason", "")).strip()[:15],
            })
        profile["past_decisions"] = list(reversed(cleaned))[:MAX_PAST_DECISIONS]
        with _conn() as c:
            c.execute(
                "INSERT OR REPLACE INTO user_profile "
                "(id, profile_json, debates_count, updated_at) "
                "VALUES (1, ?, ?, ?)",
                (json.dumps(profile, ensure_ascii=False),
                 old_count + 1,
                 datetime.now().isoformat()),
            )
    except Exception:
        pass  # 画像失败不影响主流程