"""论点关系图提取器：从辩论记录中提取论点节点与支持/反驳/修正关系

让多 Agent 的协作过程可解释：不仅看到谁说了什么，
还能看到哪些论点在支持、反驳或修正其他论点。

代码级兜底（flash 模型 JSON 输出不稳定）：
- 解析失败 → 退化为"每条发言一个节点、无边"的保底图，绝不抛异常阻断流程
- 节点 id / 关系类型 / 引用完整性全部做代码级校验与清洗
"""
import json
import re
from typing import Dict, List

from llm_client import chat

# 关系类型白名单（前端据此着色）
VALID_RELATIONS = {"support", "rebut", "qualify"}

_GRAPH_PROMPT = """你是一位辩论分析师。刚才有三方辩手（务实派/老陈、理想派/小林、风险派/赵姐）就一个决策问题进行了多轮辩论。

【决策问题】
{question}

【辩论记录】（格式：[轮次R] 角色名：发言内容）
{transcript}

请从辩论记录中提取【论点关系图】，揭示论点之间的交锋结构。

提取规则：
1. 节点（nodes）：从每条发言中提取 1~2 个核心论点（不要逐句拆分），text 为论点摘要（不超过30字，保留关键数据/结论）；
   id 用 p1, p2, p3... 顺序编号；role 为发言者角色（pragmatist/idealist/risk）；round 为轮次数字。
2. 边（edges）：只标注论点之间的直接交锋关系，type 只能是以下三种之一：
   - support：此论点为另一论点提供了数据、案例或逻辑支撑；
   - rebut：此论点直接反驳、质疑或挑战另一论点；
   - qualify：此论点对另一论点做了修正、补充条件或限定适用范围。
   source/target 必须是已定义的节点 id；reason 用不超过20字说明为什么是这种关系。
3. 优先提取跨辩手的关系（不同角色之间的交锋），同一辩手内部的支撑关系可少量保留；
4. 边的数量控制在节点数量的 0.8~1.5 倍之间，只保留最重要的交锋，不要为凑数而连边；
5. summary：用一句话（不超过40字）概括本场辩论的交锋主线。

严格只输出 JSON（不要输出任何其他文字、不要用markdown代码块包裹），格式如下：
{{
  "nodes": [
    {{"id": "p1", "role": "pragmatist", "round": 1, "text": "读研三年机会成本约30万"}},
    {{"id": "p2", "role": "idealist", "round": 2, "text": "热爱驱动的职业天花板更高"}}
  ],
  "edges": [
    {{"source": "p2", "target": "p1", "type": "rebut", "reason": "质疑只算经济账的短视"}},
    {{"source": "p3", "target": "p2", "type": "qualify", "reason": "补充前提：需有真实热爱"}}
  ],
  "summary": "务实算账 vs 理想成长的核心交锋，风险派居中设退路"
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


def _fallback_graph(question: str, history: List[Dict]) -> dict:
    """代码级兜底：解析失败时，每条发言生成一个节点，无边，保证前端有图可渲染"""
    nodes = []
    for i, m in enumerate(history, 1):
        if m.get("role") == "user":
            continue
        text = re.sub(r"\s+", " ", m.get("content", "")).strip()
        nodes.append({
            "id": f"p{i}",
            "role": m.get("role", "pragmatist"),
            "round": m.get("round", 1),
            "text": text[:30] + ("…" if len(text) > 30 else ""),
        })
    return {"nodes": nodes, "edges": [], "summary": "（自动提取失败，已按发言顺序排列论点）"}


def _sanitize(raw: dict, history: List[Dict]) -> dict:
    """代码级清洗：校验节点 id 唯一性、关系类型白名单、引用完整性"""
    nodes_raw = raw.get("nodes") or []
    # 角色白名单
    role_set = {"pragmatist", "idealist", "risk"}
    nodes, seen_ids = [], set()
    for n in nodes_raw:
        nid = str(n.get("id", "")).strip()
        if not nid or nid in seen_ids:
            continue
        role = n.get("role", "pragmatist")
        if role not in role_set:
            role = "pragmatist"
        text = re.sub(r"\s+", " ", str(n.get("text", ""))).strip()[:40]
        if not text:
            continue
        round_num = n.get("round", 1)
        try:
            round_num = int(round_num)
        except (TypeError, ValueError):
            round_num = 1
        seen_ids.add(nid)
        nodes.append({"id": nid, "role": role, "round": round_num, "text": text})
    if not nodes:
        return _fallback_graph("", history)
    # 边清洗：只保留引用合法节点、类型合法的边
    edges_raw = raw.get("edges") or []
    edges, seen_edges = [], set()
    for e in edges_raw:
        src = str(e.get("source", "")).strip()
        tgt = str(e.get("target", "")).strip()
        etype = str(e.get("type", "")).strip().lower()
        if src not in seen_ids or tgt not in seen_ids or src == tgt:
            continue
        if etype not in VALID_RELATIONS:
            continue
        key = (src, tgt, etype)
        if key in seen_edges:
            continue
        seen_edges.add(key)
        reason = re.sub(r"\s+", " ", str(e.get("reason", ""))).strip()[:25]
        edges.append({"source": src, "target": tgt, "type": etype, "reason": reason})
    summary = re.sub(r"\s+", " ", str(raw.get("summary", ""))).strip()[:60]
    return {"nodes": nodes, "edges": edges, "summary": summary}


async def extract_argument_graph(question: str, history: List[Dict]) -> dict:
    """从辩论历史提取论点关系图

    返回: {nodes: [{id, role, round, text}], edges: [{source, target, type, reason}], summary}
    任何异常均兜底，绝不抛出（关系图是增强功能，不能阻断主流程）
    """
    # 过滤出发言记录（排除用户插话）
    speeches = [m for m in history if m.get("role") != "user"]
    if not speeches:
        return {"nodes": [], "edges": [], "summary": "（无发言记录）"}
    transcript = "\n".join(
        f"[轮次{m.get('round', '?')}] {m.get('name', m.get('role', '?'))}：{m.get('content', '')}"
        for m in speeches
    )
    prompt = _GRAPH_PROMPT.format(question=question, transcript=transcript)
    try:
        raw = await chat(
            [{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=1800,
        )
        parsed = _extract_json(raw)
        return _sanitize(parsed, history)
    except Exception:
        # flash 模型输出不稳定：解析/清洗失败 → 保底图
        return _fallback_graph(question, history)