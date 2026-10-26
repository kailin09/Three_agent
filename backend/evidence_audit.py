"""证据审查 Agent：在生成平衡单前，独立检查三方辩手的证据可信度

审查维度（四类问题）：
- data_doubt  数据可疑：引用的数据/调研/案例缺乏依据或明显不合理
- calc_error  计算错误：数值计算有误（口径、单位、复利口径等）
- logic_flaw  逻辑矛盾：前后观点自相矛盾或推理跳跃
- unanswered   未答质疑：被其他辩手点名质疑却未正面回应

代码级兜底（flash 模型 JSON 输出不稳定）：
- 解析失败 → 返回"未发现问题"的默认结构，绝不阻断平衡单生成
- 评分/类型/角色全部做代码级校验与清洗
"""
import json
import re
from typing import Dict, List

from llm_client import chat

# 问题类型白名单（前端据此着色/选图标）
VALID_ISSUE_TYPES = {"fabricated", "data_doubt", "calc_error", "logic_flaw", "unanswered"}

# 可信度 verdict 档位（代码级映射，不依赖 LLM 输出 verdict 文本）
def _verdict_of(score: int) -> str:
    if score >= 9:
        return "高度可信"
    if score >= 7:
        return "基本可信"
    if score >= 5:
        return "部分可信"
    if score >= 3:
        return "可信度偏低"
    return "多处存疑"


_AUDIT_PROMPT = """你是一位独立的证据审查员（不参与辩论，只做审计）。刚才有三方辩手就一个决策问题进行了多轮辩论，现在需要对他们的论据质量做独立审查。

【决策问题】
{question}

【辩论记录】（格式：[轮次R] 角色名：发言内容）
{transcript}

【观众插话】
{interjections}

请逐条审查每位辩手的发言，找出以下五类问题：

1. fabricated（虚构数据）：**明确编造**精确数字、百分比、统计数据或虚构调研来源（如"95%创业者后悔""某报告显示"但没有具体来源）；"
            "使用模糊表述（如'相当一部分''很多人'）不算虚构；只有给出**具体数字/百分比/来源名称**但明显编造的才标此项；
2. data_doubt（数据可疑）：引用的数据、调研、案例**明显不合理**（如极端百分比、与常识严重冲突），或疑似编造但不确定；
3. calc_error（计算错误）：数值计算**明确有误**——算术错误、单位混淆、复利/折现口径明显不对；**不是**"没考虑某个因素"（如没提通胀），那种情况不要标 calc_error；
4. logic_flaw（逻辑矛盾）：同一辩手前后观点自相矛盾，或推理存在明显跳跃（如幸存者偏差、以偏概全）；
5. unanswered（未答质疑）：被其他辩手点名质疑/追问，但该辩手在后续发言中未正面回应的问题。

审查纪律：
1. 只标注**明确**的问题，不吹毛求疵；"没提到X"不等于任何错误；"数据没给来源"不等于虚构（除非数字明显离谱）；没有问题就给空数组，不要硬找；
2. 每个问题的 detail 用一句话说明（不超过50字），指出具体是哪条发言的什么问题；
3. 为每位辩手给出 credibility 评分（1~10整数）：论据扎实、回应充分 = 高分；数据存疑、回避质疑 = 低分；
4. unanswered 列表：列出全场最重要的 0~3 个未回应质疑，from=质疑方角色，to=被质疑方角色，challenge=质疑内容摘要（不超过40字）；
5. overall_score：全场证据可信度综合评分（1~10整数），取三方加权平均的感觉，但若任何一方低于4分则整体不超过6分；
6. summary：用一句话（不超过60字）总结证据质量状况。

严格只输出 JSON（不要输出任何其他文字、不要用markdown代码块包裹），格式如下：
{{
  "overall_score": 7,
  "agents": [
    {{"role": "pragmatist", "credibility": 8, "issues": []}},
    {{"role": "idealist", "credibility": 5, "issues": [
      {{"type": "fabricated", "detail": "第2轮引用'95%创业者后悔'，无具体调研来源，属编造数据"}}
    ]}},
    {{"role": "risk", "credibility": 7, "issues": [
      {{"type": "unanswered", "detail": "小林第2轮追问最坏情况退路，赵姐第3轮未正面回应退路成本"}}
    ]}}
  ],
  "unanswered": [
    {{"from": "idealist", "to": "risk", "challenge": "追随热爱的退路成本究竟多少"}}
  ],
  "summary": "务实派数据扎实，理想派个别数据存疑，风险派有一处回避"
}}"""


def _extract_json(text: str) -> dict:
    """从 LLM 输出中稳健地提取 JSON（兼容 markdown 包裹）"""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1:
        text = text[start:end + 1]
    return json.loads(text)


def _fallback_audit() -> dict:
    """代码级兜底：审查失败时返回"未发现问题"的默认结构，不阻断平衡单"""
    return {
        "overall_score": 0,
        "verdict": "审查跳过",
        "agents": [
            {"role": r, "credibility": 0, "issues": []}
            for r in ("pragmatist", "idealist", "risk")
        ],
        "unanswered": [],
        "summary": "（证据审查暂不可用，平衡单基于原始辩论记录生成）",
    }


def _clamp_score(v) -> int:
    """评分归一到 1~10 整数"""
    try:
        s = int(round(float(v)))
    except (TypeError, ValueError):
        return 0
    return max(0, min(10, s))


def _sanitize(raw: dict) -> dict:
    """代码级清洗：评分归一、类型白名单、角色补全"""
    role_set = {"pragmatist", "idealist", "risk"}
    agents_raw = raw.get("agents") or []
    agents = []
    for a in agents_raw:
        role = a.get("role", "")
        if role not in role_set:
            continue
        issues = []
        for iss in (a.get("issues") or []):
            itype = str(iss.get("type", "")).strip().lower()
            if itype not in VALID_ISSUE_TYPES:
                continue
            detail = re.sub(r"\s+", " ", str(iss.get("detail", ""))).strip()[:60]
            if not detail:
                continue
            issues.append({"type": itype, "detail": detail})
        agents.append({
            "role": role,
            "credibility": _clamp_score(a.get("credibility")),
            "issues": issues,
        })
    # 确保三个角色齐全（缺失的角色补默认值）
    present = {a["role"] for a in agents}
    for r in ("pragmatist", "idealist", "risk"):
        if r not in present:
            agents.append({"role": r, "credibility": 0, "issues": []})
    # 未答质疑清洗
    unanswered = []
    for u in (raw.get("unanswered") or []):
        frm = u.get("from", "")
        to = u.get("to", "")
        if frm not in role_set or to not in role_set:
            continue
        challenge = re.sub(r"\s+", " ", str(u.get("challenge", ""))).strip()[:50]
        if not challenge:
            continue
        unanswered.append({"from": frm, "to": to, "challenge": challenge})
    overall = _clamp_score(raw.get("overall_score"))
    # 整体分兜底规则：任何一方低于4分，整体不超过6分
    if agents and overall > 6 and any(a["credibility"] > 0 and a["credibility"] < 4 for a in agents):
        overall = 6
    summary = re.sub(r"\s+", " ", str(raw.get("summary", ""))).strip()[:80]
    return {
        "overall_score": overall,
        "verdict": _verdict_of(overall) if overall > 0 else "审查跳过",
        "agents": agents,
        "unanswered": unanswered,
        "summary": summary,
    }


async def audit_evidence(question: str, history: List[Dict]) -> dict:
    """对辩论记录做独立证据审查

    返回: {overall_score, verdict, agents: [{role, credibility, issues}], unanswered, summary}
    任何异常均兜底，绝不抛出（审查是增强功能，不能阻断平衡单生成）
    """
    speeches = [m for m in history if m.get("role") != "user"]
    if not speeches:
        return _fallback_audit()
    transcript = "\n".join(
        f"[轮次{m.get('round', '?')}] {m.get('name', m.get('role', '?'))}：{m.get('content', '')}"
        for m in speeches
    )
    interjections = "\n".join(
        f"- {m['content']}" for m in history if m.get("role") == "user"
    ) or "（无）"
    prompt = _AUDIT_PROMPT.format(
        question=question, transcript=transcript, interjections=interjections,
    )
    try:
        raw = await chat(
            [{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=1500,
        )
        parsed = _extract_json(raw)
        return _sanitize(parsed)
    except Exception:
        return _fallback_audit()


def build_audit_context(audit: dict) -> str:
    """将审查结果格式化为可注入平衡单 prompt 的上下文块"""
    if not audit or audit.get("overall_score", 0) == 0:
        return ""
    lines = ["【证据审查报告（独立审查员）】"]
    for a in audit.get("agents", []):
        role_name = {"pragmatist": "务实派", "idealist": "理想派",
                     "risk": "风险派"}.get(a["role"], a["role"])
        cred = a.get("credibility", 0)
        mark = "✓" if cred >= 7 else ("⚠" if cred >= 5 else "✗")
        lines.append(f"- {role_name}可信度 {cred}/10 {mark}")
        for iss in a.get("issues", []):
            lines.append(f"  · {iss['detail']}")
    if audit.get("unanswered"):
        lines.append("未回应的质疑：")
        for u in audit["unanswered"]:
            lines.append(f"  · {u['challenge']}")
    lines.append(f"整体：{audit.get('verdict', '')}，{audit.get('summary', '')}")
    return "\n".join(lines)