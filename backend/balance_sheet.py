"""决策平衡单生成器：汇总辩论内容，输出结构化对比"""
import json
import re
from typing import Dict, List

from llm_client import chat

_BALANCE_PROMPT = """你是一位专业的决策顾问。刚才有三方辩手（务实派、理想派、风险派）就一个决策问题进行了多轮辩论。

【决策问题】
{question}

【辩论记录】
{transcript}

【观众插话】
{interjections}

请基于以上辩论内容，生成一份结构化的【决策平衡单】，帮助决策者理清思路。

输出要求：
1. 从问题中提炼出两个核心选项（option_a / option_b），如果问题本身已给出选项则直接使用；
2. 从以下维度做对比，每个维度的内容必须提炼辩论中的具体观点和论据，不能泛泛而谈：
   - 核心收益
   - 主要代价（时间/金钱/机会成本）
   - 最大风险与最坏情况
   - 适合什么样的人
   - 三方分歧焦点（务实派怎么看 / 理想派怎么看 / 风险派怎么看）
   每个维度还需给出 score_a / score_b（1~10整数）：该维度下此选项对决策者的吸引力评分，
   10=极具吸引力，1=几乎无吸引力；注意「主要代价」「最大风险」维度分数越高代表代价/风险越小越好；评分必须基于辩论论据强弱；
3. summary：200字以内，总结三方最大的分歧点和难得的共识；
4. recommendation：给出「如果……那么倾向……」式的条件化建议，并列出2~3个立刻可执行的下一步验证动作（如：找3个相关从业者聊、算一笔具体的账、做一次小成本试错）。

严格只输出 JSON（不要输出任何其他文字、不要用markdown代码块包裹），格式如下：
{{
  "options": ["选项A", "选项B"],
  "items": [
    {{"dimension": "核心收益", "option_a": "...", "option_b": "...", "score_a": 8, "score_b": 6}},
    {{"dimension": "主要代价", "option_a": "...", "option_b": "...", "score_a": 5, "score_b": 7}},
    {{"dimension": "最大风险", "option_a": "...", "option_b": "...", "score_a": 4, "score_b": 8}},
    {{"dimension": "适合人群", "option_a": "...", "option_b": "...", "score_a": 7, "score_b": 5}},
    {{"dimension": "三方分歧焦点", "option_a": "...", "option_b": "...", "score_a": 6, "score_b": 6}}
  ],
  "summary": "...",
  "recommendation": "..."
}}"""


def _extract_json(text: str) -> dict:
    """从 LLM 输出中稳健地提取 JSON（兼容 markdown 包裹）"""
    text = text.strip()
    # 去掉 ```json ... ``` 包裹
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    # 截取第一个 { 到最后一个 }
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1:
        text = text[start:end + 1]
    return json.loads(text)


async def generate_balance_sheet(question: str, history: List[Dict],
                                  profile_context: str = "",
                                  audit_context: str = "") -> dict:
    """根据辩论历史生成决策平衡单

    profile_context: 跨会话用户画像注入块（可选），让顾问能结合决策者历史风格给建议
    audit_context: 证据审查报告注入块（可选），让顾问参考证据可信度调整评分与建议
    """
    transcript = "\n\n".join(
        f"【{m['name']}】{m['content']}"
        for m in history if m["role"] != "user"
    ) or "（无发言记录）"

    interjections = "\n".join(
        f"- {m['content']}" for m in history if m["role"] == "user"
    ) or "（无）"

    prompt = _BALANCE_PROMPT.format(
        question=question,
        transcript=transcript,
        interjections=interjections,
    )
    # 长期记忆消费：注入决策者画像，平衡单可结合历史风格给针对性建议
    if profile_context:
        prompt += (
            f"\n\n{profile_context}\n"
            f"请结合决策者的上述画像：summary可点出本场决策与TA历史风格的关联；"
            f"recommendation给出更贴合TA决策风格和关注维度的建议。"
        )
    # 证据审查消费：注入独立审查报告，可信度低的论据降权、未答质疑提示验证
    if audit_context:
        prompt += (
            f"\n\n{audit_context}\n"
            f"请参考上述证据审查报告生成平衡单："
            f"评分时对可信度偏低（≤5分）辩手的论据适当降权；"
            f"对未回应的质疑，在 recommendation 的下一步验证动作中提示决策者自行求证；"
            f"summary 可点出证据质量对结论置信度的影响。"
        )
    raw = await chat(
        [{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=2000,
    )
    return _extract_json(raw)


_FOLLOWUP_PROMPT = """你是一位专业的决策顾问。之前你为决策者生成了一份决策平衡单，现在决策者提出了追问，请基于追问重新审视并更新平衡单。

【决策问题】
{question}

【已有平衡单】
{old_sheet}

【决策者追问】
{followup}

请输出更新后的完整 JSON（格式与已有平衡单完全一致：options / items / summary / recommendation，items 保持5个维度且每项含 score_a / score_b）。

更新要求：
1. 根据追问中决策者透露的偏好或新约束，重新评估并调整各维度 score_a / score_b；
2. 如果追问引入了新信息或新角度，更新对应维度的 option_a / option_b 内容；
3. summary 必须点出追问带来的关键变化（相比之前倾向有何移动）；
4. recommendation 必须直接回应追问，给出针对新偏好的条件化建议和2~3个立刻可执行的下一步验证动作；
5. 严格只输出 JSON（不要输出任何其他文字、不要用markdown代码块包裹）。"""


async def generate_followup(question: str, old_sheet: dict, followup: str,
                             profile_context: str = "") -> dict:
    """基于已有平衡单+决策者追问，生成更新后的平衡单

    profile_context: 跨会话用户画像注入块（可选），追问更新可结合历史风格
    """
    prompt = _FOLLOWUP_PROMPT.format(
        question=question,
        old_sheet=json.dumps(old_sheet, ensure_ascii=False, indent=2),
        followup=followup,
    )
    # 长期记忆消费：注入决策者画像，追问回应更贴合决策者风格
    if profile_context:
        prompt += (
            f"\n\n{profile_context}\n"
            f"请结合决策者的上述画像调整评分和建议。"
        )
    raw = await chat(
        [{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=2000,
    )
    return _extract_json(raw)