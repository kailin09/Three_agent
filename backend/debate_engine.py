"""辩论引擎：管理多轮辩论、Agent轮流发言、用户插话、事件发布"""
import asyncio
import json
import re
import uuid
from typing import AsyncGenerator, Dict, List, Optional

from agents import AGENTS, AGENT_BY_ROLE
from llm_client import chat_stream, chat
from models import DebateState
from tools import execute_tool
import storage
import memory_profile
import industry_knowledge

# ---------- 工具规划提示词 ----------

_PLAN_SYSTEM = (
    "你是工具规划助手。根据辩手的立场、工具纪律、辩论主题和近期发言，"
    "判断该辩手本次发言是否需要调用工具获取精确数据来支撑论点。"
    "辩手的工具纪律是硬性要求，必须优先使用纪律中指定的工具。"
    "工具参数必须从实际辩题和近期发言中提取数字来推导，严禁照搬下方示例中的参数值。"
    "如果提供了已算过的数据，严禁重复计算相同表达式，应选择全新的计算角度或返回need_tool: false。"
    "只输出一个JSON对象，不要输出任何其他内容。"
)

_PLAN_FEWSHOT = (
    "输出格式：\n"
    '{"need_tool": true, "tools": [{"name": "工具名", "arguments": {参数}}], "reason": "从辩题提取数字并说明推导"}\n'
    '或 {"need_tool": false, "tools": [], "reason": "简要原因"}\n\n'
    "示例1——辩手「老陈·务实派」，主题「年薪25万该不该花50万去留学？」：\n"
    '{"need_tool": true, "tools": [{"name": "calculator", "arguments": {"expression": "250000*2"}}], "reason": "辩题提到年薪25万，算留学2年的机会成本"}\n\n'
    "示例2——辩手「小林·理想派」，主题「年轻人该不该追随热爱的事业？」：\n"
    '{"need_tool": false, "tools": [], "reason": "本论点侧重价值观和故事，无需精确数据"}\n\n'
    "示例3——辩手「赵姐·风险派」，主题「35岁裸辞转行做程序员来得及吗？」：\n"
    '{"need_tool": true, "tools": [{"name": "risk_simulate", "arguments": {"success_rate": 0.3, "trials": 1000}}, '
    '{"name": "get_current_date", "arguments": {}}], "reason": "辩题提到35岁，模拟转行30%成功概率并用当前日期算年龄账"}\n\n'
    "示例4——辩手「小林·理想派」，主题「二本毕业该不该去北上广闯一闯？」：\n"
    '{"need_tool": true, "tools": [{"name": "career_path", "arguments": {"current_role": "二本应届毕业生", "target_role": "一线城市互联网运营", "years": 3}}], '
    '"reason": "辩题涉及去大城市发展，分析从二本毕业到一线运营的能力差距和成长路径"}\n\n'
    "示例5——辩手「赵姐·风险派」，主题「年薪25万该不该花50万去留学？」：\n"
    '{"need_tool": true, "tools": [{"name": "sensitivity_analysis", "arguments": {"base_value": 500000, "factors": '
    '[{"name": "汇率波动", "change_pct": -10}, {"name": "毕业后起薪上涨", "change_pct": 20}, {"name": "政策收紧影响就业", "change_pct": -15}]}}, '
    '{"name": "risk_simulate", "arguments": {"success_rate": 0.6, "trials": 1000, "optimistic_rate": 0.7, "pessimistic_rate": 0.45}}], '
    '"reason": "辩题提到50万留学投入，分析各因素对总成本的影响并做多场景成功概率模拟"}'
)


# ---------- 辩论导演提示词 ----------

_DIRECTOR_PLAN_SYSTEM = (
    "你是辩论导演，负责规划一场三方辩论的节奏。"
    "根据辩题复杂度自主决定辩论轮数（不超过给定上限）和每轮交锋焦点。"
    "只输出一个JSON对象，不要输出任何其他内容。"
)

_DIRECTOR_PLAN_FEWSHOT = (
    "输出格式：\n"
    '{"suggested_rounds": 3, "rounds_focus": ["焦点1", "焦点2", "焦点3"], "reason": "简述规划思路"}\n\n'
    "示例1——辩题「手头30万，买房还是创业？」，上限6轮：\n"
    '{"suggested_rounds": 3, "rounds_focus": ["各方立场与核心账本", "风险推演与退路设计", "最终决断与行动建议"], "reason": "财务决策题3轮足以充分交锋"}\n\n'
    "示例2——辩题「35岁裸辞转行来得及吗？」，上限6轮：\n"
    '{"suggested_rounds": 4, "rounds_focus": ["年龄与时间的客观账", "转行案例与幸存者偏差", "最坏情况与退路", "折中方案与行动路径"], "reason": "人生转折题需多维度拆解"}\n\n'
    "示例3——辩题「周末该加班赚钱还是陪家人？」，上限3轮：\n"
    '{"suggested_rounds": 2, "rounds_focus": ["各方立场", "折中与决断"], "reason": "生活平衡题观点分明2轮即可"}'
)

_DIRECTOR_ROUND_SYSTEM = (
    "你是辩论导演，负责安排本轮发言顺序和交锋提示。"
    "根据近期发言的交锋焦点，决定谁先发言最有利（先发言者定调，后发言者反驳）。"
    "三位辩手都必须发言，但顺序由你决定。"
    "只输出一个JSON对象，不要输出任何其他内容。"
)

_DIRECTOR_ROUND_FEWSHOT = (
    "输出格式：\n"
    '{"speakers": ["角色1", "角色2", "角色3"], "focus_hint": "本轮交锋提示"}\n'
    "角色取值：pragmatist（老陈·务实派）、idealist（小林·理想派）、risk（赵姐·风险派）\n\n"
    "示例——近期赵姐刚用数据攻击了创业风险，老陈需要先反驳：\n"
    '{"speakers": ["pragmatist", "idealist", "risk"], "focus_hint": "反驳对方核心数据，给出本方新论据"}'
)

_DIRECTOR_CONTINUE_SYSTEM = (
    "你是辩论导演，负责评估辩论是否已充分交锋。"
    "若三方观点已充分表达且开始重复，应提前结束；若仍有重要分歧未展开，应继续。"
    "只输出一个JSON对象，不要输出任何其他内容。"
)

_DIRECTOR_CONTINUE_FEWSHOT = (
    "输出格式：\n"
    '{"continue": true, "reason": "简述原因"} 或 {"continue": false, "reason": "简述原因"}\n\n'
    "示例1——三方仍在提出新论据互相反驳：\n"
    '{"continue": true, "reason": "财务风险与人生价值的分歧尚未充分展开"}\n\n'
    "示例2——发言开始重复各自立场，无新论据：\n"
    '{"continue": false, "reason": "三方观点已充分交锋，继续将陷入重复"}'
)

# ---------- 上下文摘要提示词 ----------

_SUMMARY_SYSTEM = (
    "你是辩论记录摘要员。将多方辩论的历史发言压缩为简明摘要，严格保留："
    "1)每位辩手的核心论点和立场关键词；"
    "2)所有精确数字、计算结果和模拟数据（原样保留数字，如「250000*2=500000」）；"
    "3)尚未被回应的质疑。"
    "摘要控制在250字以内，按辩手分段，不要寒暄。"
)


class DebateSession:
    """一场辩论会话"""

    def __init__(self, question: str, rounds: int = 3):
        self.id: str = uuid.uuid4().hex[:12]
        self.question: str = question
        self.max_rounds: int = rounds
        self.state: DebateState = DebateState.idle
        # 完整消息历史: {role, name, content, round}
        self.history: List[Dict] = []
        # SSE 订阅者队列（支持多连接）
        self._subscribers: List[asyncio.Queue] = []
        self._debate_task: Optional[asyncio.Task] = None
        self._interject_seq = 0  # 插话序号，前端据此合并气泡
        # 正在发言的 Agent：role -> round_num（用于订阅时补发 speech_start）
        self._speaking: Dict[str, int] = {}
        # 待快速回应的用户插话（插话后三位辩手各用一句话即时回应）
        self._pending_interjection: Optional[str] = None
        # 本场辩论已执行的工具调用记录（供规划器去重，避免重复计算相同表达式）
        self._tool_history: List[str] = []
        self._tool_cache: dict = {}  # key: "name(args_json)" -> result，代码级去重
        # 导演规划结果（开场时由 Director Agent 生成）
        self._plan: Optional[Dict] = None
        # 上下文滚动摘要：早期发言压缩为前情提要，避免多轮后上下文膨胀
        self._summary: str = ""
        self._summarized_idx: int = 0  # history 中已被摘要覆盖到的位置
        # 跨会话用户画像注入块（开场加载，辩手/导演共享）
        self._profile_context: str = ""
        # 行业知识包注入块（开场按辩题领域识别加载，辩手/导演共享）
        self._industry_context: str = ""
        self._industry_label: str = ""

    # ---------- 订阅 / 发布 ----------

    def subscribe(self) -> asyncio.Queue:
        """订阅本会话的事件流（用于 SSE 推送）"""
        q: asyncio.Queue = asyncio.Queue()
        # 重连补偿：先把已有历史补发给新订阅者
        seq = 0
        for msg in self.history:
            if msg["role"] == "user":
                seq += 1
                q.put_nowait({
                    "type": "interjection",
                    "content": msg["content"],
                    "seq": seq,
                })
            else:
                agent = AGENT_BY_ROLE.get(msg["role"], {})
                q.put_nowait({
                    "type": "speech_end",
                    "role": msg["role"],
                    "name": msg["name"],
                    "avatar": agent.get("avatar", "💬"),
                    "color": agent.get("color", "#6366f1"),
                    "content": msg["content"],
                    "round": msg.get("round"),
                })
        # 并行竞态补偿：有Agent正在发言，为新订阅者补发speech_start
        for role, rnd in self._speaking.items():
            agent = AGENT_BY_ROLE.get(role, {})
            q.put_nowait({
                "type": "speech_start",
                "role": role,
                "name": agent.get("name", role),
                "avatar": agent.get("avatar", "💬"),
                "color": agent.get("color", "#6366f1"),
                "round": rnd,
            })
        # 辩论已结束：补发结束信号，避免新订阅者无限等待
        if self.state == DebateState.finished:
            q.put_nowait({"type": "debate_end"})
            q.put_nowait(None)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        if q in self._subscribers:
            self._subscribers.remove(q)

    async def _publish(self, event: dict):
        """向所有订阅者广播事件"""
        for q in list(self._subscribers):
            await q.put(event)

    # ---------- 上下文构建 ----------

    def _build_messages(self, agent: dict, round_num: int,
                        tool_results: list = None,
                        focus_hint: str = "",
                        is_final: bool = False) -> List[Dict]:
        """为某个 Agent 构建 LLM 消息上下文

        tool_results: 已执行的工具结果列表 [(name, args_str, result), ...]
        focus_hint: 导演为本轮设定的交锋焦点提示
        is_final: 是否为终局陈词轮（最后一轮特殊收束指令）
        """
        messages = [{"role": "system", "content": agent["system_prompt"]}]

        context = f"【辩论主题】{self.question}\n\n"
        # 长期记忆消费：注入跨会话用户画像，辩手可"记住"决策者风格
        if self._profile_context:
            context += f"{self._profile_context}\n\n"
        # 行业知识包消费：注入行业决策框架，辩手发言引用行业术语与维度
        if self._industry_context:
            context += f"{self._industry_context}\n\n"
        # 滚动摘要：早期发言压缩为前情提要，只保留近期原文（防多轮上下文膨胀）
        recent = self.history[self._summarized_idx:] if self._summary else self.history
        if self._summary:
            context += f"【前情提要（早期发言摘要）】\n{self._summary}\n\n"
        if recent:
            context += "【近期发言记录】\n"
            for m in recent:
                if m["role"] == "user":
                    tag = "🎤 观众插话"
                elif m.get("round") == "Q":
                    tag = f"{m['name']}（回应插话）"
                else:
                    tag = m["name"]
                context += f"{tag}：{m['content']}\n"
            context += "\n"
        if focus_hint:
            context += f"【导演提示：本轮焦点】{focus_hint}\n\n"
        # 自我记忆：明确列出该辩手自己的历史发言，让「禁止重复」有据可查
        my_speeches = [m for m in self.history
                       if m["role"] == agent["role"] and m.get("round") != "Q"]
        if my_speeches:
            context += ("【你之前的发言——以下观点你已说过，严禁换皮重复】\n"
                        "原样复述禁令：上方内容中任何连续10字以上的片段"
                        "（含数据句式、人物案例、比喻）不得在本轮原样再现；"
                        "同一人物案例不得跨轮重复使用；"
                        "引用同一数据必须换一种表述方式。\n")
            for i, m in enumerate(my_speeches, 1):
                snippet = m["content"][:120]
                if len(m["content"]) > 120:
                    snippet += "…"
                context += f"{i}. {snippet}\n"
            context += "\n"
        # 文风禁令：杜绝LLM空洞套话，提升发言质感
        context += (
            "【文风禁令】严禁出现以下空洞套话：「不可否认」「毋庸置疑」"
            "「众所周知」「综上所述」「总而言之」「总的来说」「在这个问题上」"
            "「正如我们所看到的」。直接亮观点，不要铺垫。\n\n"
        )
        if round_num == 1:
            context += (
                f"现在是第 1 轮辩论（立场陈述轮），轮到你（{agent['name']}）发言。\n"
                f"立论结构（按顺序行文）：\n"
                f"1. 亮立场——一句话亮明你对这个主题的态度；\n"
                f"2. 硬论据——你最硬的一个论据（数据/案例/逻辑推演）；\n"
                f"3. 第二论据——换一个角度再给一个论据。\n"
                f"无需回应他人，把火力集中在把你的立场立住。\n"
                f"全文不超过200字，直接输出发言内容，"
                f"严禁输出「亮立场」「硬论据」等结构提示词。"
            )
        elif is_final:
            context += (
                f"现在是最后一轮（终局陈词轮），轮到你（{agent['name']}）发言。\n"
                f"终局陈词要求（按顺序行文）：\n"
                f"1. 重申立场——一句话重申你在这场辩论中的核心主张；\n"
                f"2. 正面回应——点名回应全场对你立场最强的那次质疑"
                f"（先诚实承认对方说对了什么，再说明你为何仍然坚持）；\n"
                f"3. 一句忠告——给决策者一句最坦诚的忠告（不超过30字）。\n"
                f"不要再引入全新论点，重在收束与坦诚。\n"
                f"全文不超过200字，直接输出发言内容，"
                f"严禁输出「重申立场」「正面回应」「一句忠告」等结构提示词。"
            )
        else:
            # 钢铁人反驳：提取本轮已发言辩友观点，强制结构化深度反驳
            rebuttal = [m for m in self.history
                        if m.get("round") == round_num and m["role"] != "user"]
            if not rebuttal:
                # 本轮尚无他人发言（你是第一个）→ 取最近2条他人发言作为反驳对象
                rebuttal = [m for m in self.history[-2:] if m["role"] != "user"]
            if rebuttal:
                context += "【⚠️ 本轮待反驳观点——你必须从中选一位进行结构化反驳】\n"
                for m in rebuttal:
                    context += f"▶ {m['name']}：{m['content']}\n"
                context += "\n"
            context += (
                f"现在是第 {round_num} 轮辩论（交锋轮），轮到你（{agent['name']}）发言。\n"
                f"钢铁人反驳法（按顺序行文）：\n"
                f"1. 复述——以「XX提到」开头点名，用一句话准确复述你要反驳的辩友的核心观点"
                f"（不许歪曲、不许打稻草人）；\n"
                f"2. 漏洞——直击该观点的致命漏洞"
                f"（逻辑断层/数据失真/前提不成立，指出具体哪一处）；\n"
                f"3. 反证——用一个新数据/新案例/新推演证明这个漏洞确实存在；\n"
                f"4. 推进——反驳之后给出你这轮的新论点或新角度。\n"
                f"【立场守护】反驳是为捍卫你自己的立场服务，不是倒戈。"
                f"无论你反驳谁，最终结论必须回到并强化你的原有立场。\n"
                f"严禁自说自话、严禁无视对方论据重复自己旧观点。\n"
                f"全文不超过200字，直接输出发言内容，"
                f"严禁输出「复述」「漏洞」「反证」「推进」等结构提示词。"
            )
        # 工具结果上下文 + 反幻觉规则
        if tool_results:
            context += "\n\n【系统已为你执行工具，结果如下】\n"
            for name, args_str, result in tool_results:
                context += f"- {name}({args_str}) → {result}\n"
            context += (
                "请在发言中自然地引用上述数据支撑你的论点。\n"
                "【重要】你只能引用上述工具结果中的精确数据，"
                "严禁声称自己使用了其他工具、进行了其他模拟或计算。"
            )
        else:
            context += (
                "\n\n【重要】本次没有工具结果。严禁声称自己使用了calculator、"
                "risk_simulate等工具或编造任何模拟/计算结果。"
                "如需数字论据，只能用「大约」「据统计」等模糊表述。"
            )
        messages.append({"role": "user", "content": context})
        return messages

    async def _maybe_summarize(self):
        """轮末滚动摘要：未摘要的发言超过阈值时，把早期发言压缩进前情提要

        保留最近 KEEP_RECENT 条原文，更早的增量合并进 self._summary。
        摘要失败不影响辩论进行。history 本身保持完整（供落盘/平衡单/重连补发）。
        """
        KEEP_RECENT = 9  # 保留最近9条原文（约3个辩手×3轮）
        unsummarized = len(self.history) - self._summarized_idx
        if unsummarized <= KEEP_RECENT:
            return
        to_summarize = self.history[self._summarized_idx:-KEEP_RECENT]
        text = "\n".join(f"{m['name']}：{m['content']}" for m in to_summarize)
        try:
            new_summary = await chat(
                [{"role": "system", "content": _SUMMARY_SYSTEM},
                 {"role": "user", "content": (
                     f"【已有摘要】\n{self._summary or '（无）'}\n\n"
                     f"【新增发言】\n{text}\n\n"
                     f"请输出合并后的完整摘要（涵盖已有摘要要点+新发言要点，250字以内）。"
                 )}],
                temperature=0.2,
                max_tokens=500,
            )
            self._summary = new_summary.strip()
            self._summarized_idx = len(self.history) - KEEP_RECENT
        except Exception:
            pass  # 摘要失败不影响辩论

    # ---------- 工具规划 ----------

    async def _plan_tools(self, agent: dict, round_num: int) -> List[tuple]:
        """短上下文工具规划：独立轻量LLM调用，输出JSON格式的工具计划

        与在长辩论上下文中直接function calling不同，这里用极短上下文
        +few-shot示例引导模型输出结构化JSON，规避弱模型在长上下文
        下不触发工具调用的问题。返回 [(name, args_json), ...] 列表。
        """
        recent = ""
        if self.history:
            for m in self.history[-2:]:
                recent += f"{m['name']}：{m['content'][:80]}…\n"
        round_hint = (
            "立场陈述轮，需要核心数据支撑立场" if round_num == 1
            else f"第{round_num}轮交锋，可针对上面辩友的数字进行精确反驳"
        )
        user_content = (
            f"【辩手】{agent['name']}\n"
            f"【立场】{agent['stance']}\n"
            f"【工具纪律（必须遵守，优先使用纪律中指定的工具）】{agent.get('tool_discipline', '')}\n\n"
            f"【辩论主题】{self.question}\n"
            f"【当前轮次】{round_hint}\n"
        )
        if self._tool_history:
            user_content += (
                "\n【⚠️本场已算过的数据——以下表达式任何人都不许再算第二次！"
                "要引用直接引用上面的结果，要算只能算全新的式子，否则need_tool必须为false】\n"
                + "\n".join(f"- {h}" for h in self._tool_history) + "\n"
            )
        if recent:
            user_content += f"\n【近期发言】\n{recent}"
        user_content += (
            "\n【可用工具】\n"
            "- calculator(expression)：计算数学表达式，expression为字符串，"
            "如 \"15000*12\"、\"800000*0.3-150000\"\n"
            "- get_current_date()：获取当前日期（无需参数，arguments给空对象{}）\n"
            "- risk_simulate(success_rate, trials, optimistic_rate, pessimistic_rate)："
            "多场景蒙特卡洛风险模拟，success_rate为0~1的小数（基准概率），"
            "trials为模拟次数（如1000），optimistic_rate/pessimistic_rate为可选的"
            "乐观/悲观场景概率（0~1小数，不传则自动推算）\n"
            "- career_path(current_role, target_role, years)：学业与职业路径分析，"
            "current_role为当前身份，target_role为目标方向，years为规划年数（如3），"
            "输出能力差距、里程碑和风险提示\n"
            "- sensitivity_analysis(base_value, factors)：敏感性分析，"
            "base_value为基准值（如500000总成本），factors为影响因素数组，"
            "每个元素含name(因素名)和change_pct(变化百分比，如-20表示下降20%)，"
            "输出各因素影响排序和关键发现\n\n"
            f"{_PLAN_FEWSHOT}"
        )
        try:
            raw = await chat(
                [{"role": "system", "content": _PLAN_SYSTEM},
                 {"role": "user", "content": user_content}],
                temperature=0.1,
                max_tokens=400,
            )
            m = re.search(r'\{.*\}', raw, re.DOTALL)
            if not m:
                return []
            plan = json.loads(m.group(0))
            if not plan.get("need_tool"):
                return []
            calls = []
            for t in plan.get("tools", [])[:2]:
                name = t.get("name", "")
                args = t.get("arguments", {})
                if name in ("calculator", "get_current_date", "risk_simulate",
                            "career_path", "sensitivity_analysis"):
                    calls.append((name, json.dumps(args, ensure_ascii=False)))
            return calls
        except Exception:
            return []

    # ---------- 辩论导演（自主规划） ----------

    async def _director_plan_debate(self) -> Dict:
        """开场规划：导演根据辩题自主决定轮数与每轮焦点

        返回 {"suggested_rounds": N, "rounds_focus": [...], "reason": "..."}
        任何异常都回退到默认规划（用户指定的轮数 + 通用焦点）
        """
        default_focus = ["立场陈述与核心论点"] + [
            f"第{r}轮交锋" for r in range(2, self.max_rounds + 1)
        ]
        default = {
            "suggested_rounds": self.max_rounds,
            "rounds_focus": default_focus[:self.max_rounds],
            "reason": "导演规划失败，使用默认流程",
        }
        user_content = (
            f"【辩题】{self.question}\n"
            f"【轮数上限】{self.max_rounds}（建议轮数不得超过上限）\n"
        )
        # 导演反思增强：注入决策者画像，针对性设计交锋焦点
        if self._profile_context:
            user_content += (
                f"\n{self._profile_context}\n"
                f"（规划每轮焦点时，可针对决策者已知关注维度设计交锋重点）\n"
            )
        # 行业知识包：导演按行业特性设计交锋焦点
        if self._industry_context:
            user_content += (
                f"\n{self._industry_context}\n"
                f"（规划每轮焦点时，请围绕该行业的核心决策维度设计交锋重点）\n"
            )
        user_content += f"\n{_DIRECTOR_PLAN_FEWSHOT}"
        try:
            raw = await chat(
                [{"role": "system", "content": _DIRECTOR_PLAN_SYSTEM},
                 {"role": "user", "content": user_content}],
                temperature=0.3,
                max_tokens=400,
            )
            m = re.search(r'\{.*\}', raw, re.DOTALL)
            if not m:
                return default
            plan = json.loads(m.group(0))
            suggested = int(plan.get("suggested_rounds", self.max_rounds))
            suggested = max(1, min(suggested, self.max_rounds))
            focus = plan.get("rounds_focus", [])
            if not isinstance(focus, list) or not focus:
                focus = default_focus[:suggested]
            focus = [str(f) for f in focus[:suggested]]
            while len(focus) < suggested:
                focus.append(f"第{len(focus) + 1}轮交锋")
            return {
                "suggested_rounds": suggested,
                "rounds_focus": focus,
                "reason": str(plan.get("reason", "")),
            }
        except Exception:
            return default

    async def _director_plan_round(self, round_num: int, focus: str,
                                   total_rounds: int) -> Dict:
        """轮前规划：导演决定本轮发言顺序与交锋提示（第2轮起调用）

        返回 {"speakers": [role...], "focus_hint": "..."}；失败回退默认顺序
        """
        default = {
            "speakers": [a["role"] for a in AGENTS],
            "focus_hint": focus,
        }
        recent = ""
        for m in self.history[-3:]:
            recent += f"{m['name']}：{m['content'][:60]}…\n"
        user_content = (
            f"【辩题】{self.question}\n"
            f"【本轮】第{round_num}/{total_rounds}轮\n"
            f"【本轮焦点】{focus}\n"
            f"【近期发言】\n{recent}\n\n"
            f"{_DIRECTOR_ROUND_FEWSHOT}"
        )
        try:
            raw = await chat(
                [{"role": "system", "content": _DIRECTOR_ROUND_SYSTEM},
                 {"role": "user", "content": user_content}],
                temperature=0.3,
                max_tokens=200,
            )
            m = re.search(r'\{.*\}', raw, re.DOTALL)
            if not m:
                return default
            plan = json.loads(m.group(0))
            speakers = plan.get("speakers", [])
            valid_roles = {a["role"] for a in AGENTS}
            speakers = [s for s in speakers if s in valid_roles]
            # 三人都要发言：补齐缺失的辩手
            for a in AGENTS:
                if a["role"] not in speakers:
                    speakers.append(a["role"])
            return {
                "speakers": speakers[:3],
                "focus_hint": str(plan.get("focus_hint", focus)),
            }
        except Exception:
            return default

    async def _director_should_continue(self, round_num: int,
                                        total_rounds: int) -> Dict:
        """轮末评估：导演判断交锋是否充分，是否提前收束

        返回 {"continue": bool, "reason": "..."}；失败默认继续
        """
        default = {"continue": True, "reason": ""}
        recent = ""
        for m in self.history[-3:]:
            recent += f"{m['name']}：{m['content'][:60]}…\n"
        user_content = (
            f"【辩题】{self.question}\n"
            f"【进度】已完成第{round_num}/{total_rounds}轮\n"
            f"【最近发言】\n{recent}\n\n"
            f"{_DIRECTOR_CONTINUE_FEWSHOT}"
        )
        try:
            raw = await chat(
                [{"role": "system", "content": _DIRECTOR_CONTINUE_SYSTEM},
                 {"role": "user", "content": user_content}],
                temperature=0.1,
                max_tokens=150,
            )
            m = re.search(r'\{.*\}', raw, re.DOTALL)
            if not m:
                return default
            result = json.loads(m.group(0))
            return {
                "continue": bool(result.get("continue", True)),
                "reason": str(result.get("reason", "")),
            }
        except Exception:
            return default

    # ---------- 辩论主流程 ----------

    async def start(self):
        """启动辩论（后台任务执行）"""
        if self.state != DebateState.idle:
            return
        self.state = DebateState.debating
        self._debate_task = asyncio.create_task(self._run_debate())

    async def _run_debate(self):
        """多轮辩论主循环：导演规划节奏，第1轮并行立场陈述，后续轮按导演排序交锋"""
        try:
            # 长期记忆消费：加载跨会话用户画像（辩手+导演共享）
            try:
                self._profile_context = memory_profile.build_profile_context()
            except Exception:
                self._profile_context = ""
            # 行业知识包：按辩题识别领域，加载行业决策框架（辩手+导演共享）
            try:
                industry_key = await industry_knowledge.detect_industry(self.question)
                self._industry_context = industry_knowledge.build_industry_context(industry_key)
                self._industry_label = industry_knowledge.get_industry_label(industry_key)
            except Exception:
                self._industry_context = ""
                self._industry_label = ""
            # 开场：导演自主规划辩论节奏（轮数+每轮焦点，可参考画像定制焦点）
            plan = await self._director_plan_debate()
            self._plan = plan
            actual_rounds = plan["suggested_rounds"]
            storage.save_debate_meta(
                self.id, self.question, self.max_rounds,
                state="debating", plan=plan,
            )
            await self._publish({
                "type": "debate_plan",
                "plan": plan,
                "question": self.question,
                "max_rounds": self.max_rounds,
                "actual_rounds": actual_rounds,
                "industry": self._industry_label,
            })
            await self._publish({"type": "debate_start", "question": self.question,
                                 "max_rounds": actual_rounds})
            for round_num in range(1, actual_rounds + 1):
                if self.state != DebateState.debating:
                    break
                focus = (plan["rounds_focus"][round_num - 1]
                         if round_num <= len(plan["rounds_focus"])
                         else f"第{round_num}轮交锋")
                if round_num == 1:
                    # 第1轮并行：三位辩手同时陈述各自立场（互不可见，提速3倍）
                    await asyncio.gather(
                        *[self._speak(agent, round_num, focus) for agent in AGENTS]
                    )
                else:
                    # 交锋轮：导演决定发言顺序（后发言者能看到本轮前面辩友的发言）
                    round_plan = await self._director_plan_round(
                        round_num, focus, actual_rounds)
                    speakers = [AGENT_BY_ROLE[r] for r in round_plan["speakers"]
                                if r in AGENT_BY_ROLE] or list(AGENTS)
                    await self._publish({
                        "type": "round_plan",
                        "round": round_num,
                        "speakers": round_plan["speakers"],
                        "focus_hint": round_plan["focus_hint"],
                    })
                    for agent in speakers:
                        if self.state != DebateState.debating:
                            break
                        await self._speak(agent, round_num, round_plan["focus_hint"],
                                          is_final=(round_num == actual_rounds))
                        # 每位辩友发言后，若有待回应插话 → 立即触发快速回应
                        if self._pending_interjection and self.state == DebateState.debating:
                            await self._quick_reply_round()
                # 轮末兜底：确保插话必被回应
                if self._pending_interjection and self.state == DebateState.debating:
                    await self._quick_reply_round()
                # 轮末滚动摘要：压缩早期发言，防止后续轮上下文膨胀
                await self._maybe_summarize()
                # 轮末评估：导演判断交锋是否充分（非最后一轮才评估）
                if self.state == DebateState.debating and round_num < actual_rounds:
                    verdict = await self._director_should_continue(
                        round_num, actual_rounds)
                    if not verdict["continue"]:
                        await self._publish({
                            "type": "early_conclude",
                            "reason": verdict["reason"],
                            "completed_rounds": round_num,
                        })
                        break
                # 轮间短暂停顿，保持节奏感
                if self.state == DebateState.debating and round_num < actual_rounds:
                    await asyncio.sleep(0.15)
            # 循环结束后，处理最后一刻的插话
            if self._pending_interjection and self.state == DebateState.debating:
                await self._quick_reply_round()
            self.state = DebateState.finished
            storage.update_debate_state(self.id, "finished", finished=True)
            await self._publish({"type": "debate_end"})
            # 长期记忆写入：后台提取用户决策画像（不阻塞流关闭）
            asyncio.create_task(self._extract_profile_after_debate())
        except Exception as e:
            self.state = DebateState.finished
            storage.update_debate_state(self.id, "finished", finished=True)
            await self._publish({"type": "error", "content": f"辩论出错：{e}"})
        finally:
            # 通知所有订阅者流结束
            for q in list(self._subscribers):
                await q.put(None)

    async def _speak(self, agent: dict, round_num: int, focus_hint: str = "",
                     is_final: bool = False):
        """单个 Agent 的一次流式发言（工具规划→执行→流式发言）"""
        self._speaking[agent["role"]] = round_num
        await self._publish({
            "type": "speech_start",
            "role": agent["role"],
            "name": agent["name"],
            "avatar": agent["avatar"],
            "color": agent["color"],
            "round": round_num,
        })

        full_content = ""
        try:
            # 第一步：短上下文工具规划（独立轻量调用，输出JSON）
            tool_calls = await self._plan_tools(agent, round_num)
            tool_results = []
            # 第二步：执行工具，广播事件
            for name, args_json in tool_calls:
                cache_key = f"{name}({args_json})"
                await self._publish({
                    "type": "tool_call",
                    "role": agent["role"],
                    "tool": name,
                    "arguments": args_json,
                })
                if cache_key in self._tool_cache:
                    result = self._tool_cache[cache_key] + "（复用本场之前结果，请直接引用，勿再计算）"
                else:
                    result = execute_tool(name, args_json)
                    self._tool_cache[cache_key] = result
                await self._publish({
                    "type": "tool_result",
                    "role": agent["role"],
                    "tool": name,
                    "result": result,
                })
                tool_results.append((name, args_json, result))
                self._tool_history.append(
                    f"{name}({args_json}) = {result}（{agent['name']}第{round_num}轮）"
                )
            # 第三步：构建带工具结果的上下文，流式生成发言
            messages = self._build_messages(agent, round_num, tool_results,
                                            focus_hint, is_final)
            # 代码级字数兜底：flash模型常忽略「不超过200字」指令，
            # 流式累计超 230 字即硬截断（≈200中文字+结构余量）
            MAX_SPEECH_CHARS = 230
            async for token in chat_stream(messages, max_tokens=280):
                if self.state != DebateState.debating:
                    break
                if len(full_content) + len(token) > MAX_SPEECH_CHARS:
                    remain = MAX_SPEECH_CHARS - len(full_content)
                    if remain > 0:
                        token = token[:remain]
                        full_content += token
                        await self._publish({
                            "type": "token",
                            "role": agent["role"],
                            "content": token,
                        })
                    break
                full_content += token
                await self._publish({
                    "type": "token",
                    "role": agent["role"],
                    "content": token,
                })
        except Exception as e:
            full_content += f"\n\n（发言中断：{e}）"

        # 自我反思：立场自检（关键词检测→语义自评→偏离重试一次）
        if full_content.strip():
            reflection = await self._reflect_stance(agent, full_content)
            if reflection.get("revised_content"):
                full_content = reflection["revised_content"]
                await self._publish({
                    "type": "speech_revise",
                    "role": agent["role"],
                    "content": full_content,
                })
            await self._publish({
                "type": "reflection",
                "role": agent["role"],
                "stance_held": reflection["stance_held"],
                "hits": reflection["hits"],
                "revised": bool(reflection.get("revised_content")),
            })

        # 记录历史
        if full_content.strip():
            self.history.append({
                "role": agent["role"],
                "name": agent["name"],
                "content": full_content,
                "round": round_num,
            })
            try:
                storage.save_message(
                    self.id, agent["role"], agent["name"],
                    full_content, round_num, len(self.history),
                )
            except Exception:
                pass  # 落盘失败不影响辩论进行

        await self._publish({
            "type": "speech_end",
            "role": agent["role"],
            "content": full_content,
        })
        self._speaking.pop(agent["role"], None)

    # ---------- 自我反思（立场自检） ----------

    async def _reflect_stance(self, agent: dict, content: str) -> Dict:
        """立场自检反思：代码级关键词检测 → LLM语义自评 → 偏离则重试一次

        三级递进，前一级通过即短路，最大限度控制延迟：
        1. 关键词命中（瞬时，零成本）→ 守住，通过；
        2. 0命中时LLM语义自评（轻量短上下文）→ 语义守住则通过；
        3. 语义确认偏离 → 强化立场指令重试一次（非流式），复检通过才采纳。
        返回 {"stance_held", "hits", "revised_content"}
        """
        keywords = agent.get("stance_keywords", [])
        hits = sum(1 for k in keywords if k in content)
        if hits > 0:
            return {"stance_held": True, "hits": hits, "revised_content": None}
        # 0命中：可能只是表述差异，LLM语义裁决
        try:
            raw = await chat(
                [{"role": "system", "content": (
                    f"你是辩论监督员。判断以下发言是否背离了"
                    f"「{agent['name']}」的立场（{agent['stance']}）。"
                    f"只输出JSON：{{\"stance_held\": true或false, \"reason\": \"15字内\"}}")},
                 {"role": "user", "content": content[:300]}],
                temperature=0.1,
                max_tokens=80,
            )
            m = re.search(r'\{.*\}', raw, re.DOTALL)
            if m:
                verdict = json.loads(m.group(0))
                if verdict.get("stance_held", True):
                    # 语义上守住，仅关键词未命中
                    return {"stance_held": True, "hits": 0,
                            "revised_content": None}
        except Exception:
            pass
        # 语义确认偏离：强化立场指令重试一次
        try:
            stance_label = agent["name"].split("·")[1].strip()
            revised = await chat(
                [{"role": "system", "content": agent["system_prompt"]},
                 {"role": "user", "content": (
                     f"你刚才的发言偏离了你的立场，请重写这段发言。\n"
                     f"【你的立场】{agent['stance']}\n"
                     f"【刚才的偏离发言】{content[:200]}\n\n"
                     f"重写要求：紧扣你{stance_label}的核心视角重新组织，"
                     f"结论必须回到并强化你的原有立场，"
                     f"150~200字，直接输出发言内容。")}],
                temperature=0.7,
                max_tokens=400,
            )
            revised = revised.strip()[:230]
            # 复检：重试版必须命中关键词才算修正成功
            new_hits = sum(1 for k in keywords if k in revised)
            if new_hits > 0:
                return {"stance_held": False, "hits": 0,
                        "revised_content": revised}
        except Exception:
            pass
        # 重试失败：保留原文（优于空发言）
        return {"stance_held": False, "hits": 0, "revised_content": None}

    # ---------- 插话快速回应 ----------

    async def _quick_reply_round(self):
        """快速回应轮：三位辩手并行各用一句话即时回应用户插话"""
        msg = self._pending_interjection
        self._pending_interjection = None
        await self._publish({"type": "quick_reply_start"})
        await asyncio.gather(
            *[self._quick_reply(agent, msg) for agent in AGENTS]
        )
        await self._publish({"type": "quick_reply_end"})

    async def _quick_reply(self, agent: dict, user_msg: str):
        """单个 Agent 对用户插话的快速回应（一句话，短小精悍）"""
        self._speaking[agent["role"]] = "Q"
        await self._publish({
            "type": "speech_start",
            "role": agent["role"],
            "name": agent["name"],
            "avatar": agent["avatar"],
            "color": agent["color"],
            "round": "Q",
        })
        messages = [
            {"role": "system", "content": agent["system_prompt"]},
            {"role": "user", "content": (
                f"【辩论主题】{self.question}\n\n"
                f"观众刚刚插话：「{user_msg}」\n\n"
                f"请用一句话（不超过60字）直接回应这位观众，"
                f"要符合你（{agent['name']}）的立场和说话风格，犀利但礼貌。"
            )},
        ]
        full_content = ""
        try:
            async for token in chat_stream(messages, max_tokens=120):
                if self.state != DebateState.debating:
                    break
                full_content += token
                await self._publish({
                    "type": "token",
                    "role": agent["role"],
                    "content": token,
                })
        except Exception as e:
            full_content += f"\n\n（回应中断：{e}）"
        if full_content.strip():
            self.history.append({
                "role": agent["role"],
                "name": agent["name"],
                "content": full_content,
                "round": "Q",
            })
            try:
                storage.save_message(
                    self.id, agent["role"], agent["name"],
                    full_content, "Q", len(self.history),
                )
            except Exception:
                pass
        await self._publish({
            "type": "speech_end",
            "role": agent["role"],
            "content": full_content,
        })
        self._speaking.pop(agent["role"], None)

    # ---------- 用户交互 ----------

    async def interject(self, message: str):
        """用户插话：写入历史并广播；辩论进行中则触发三位辩手即时快速回应"""
        self._interject_seq += 1
        self.history.append({
            "role": "user",
            "name": "你",
            "content": message,
            "round": None,
        })
        try:
            storage.save_message(
                self.id, "user", "你", message, None, len(self.history),
            )
        except Exception:
            pass
        await self._publish({
            "type": "interjection",
            "content": message,
            "seq": self._interject_seq,
        })
        # 辩论进行中：标记待回应，主循环将在合适时机触发快速回应轮
        if self.state == DebateState.debating:
            self._pending_interjection = message

    async def conclude(self):
        """用户叫停：当前 token 后立即停止，未发言的 Agent 不再发言"""
        if self.state == DebateState.debating:
            self._pending_interjection = None  # 叫停后不再回应插话
            self.state = DebateState.concluding
            await self._publish({"type": "concluding"})

    # ---------- 长期记忆写入 ----------

    async def _extract_profile_after_debate(self):
        """辩毕后台任务：提取用户决策画像沉淀到长期记忆

        失败静默（画像不影响任何主流程）；fire-and-forget 不阻塞 SSE 关闭。
        """
        try:
            await memory_profile.extract_and_update_profile(
                self.question, self.history, None)
        except Exception:
            pass


# ---------- 全局会话管理 ----------

_sessions: Dict[str, DebateSession] = {}


def create_session(question: str, rounds: int) -> DebateSession:
    session = DebateSession(question, rounds)
    _sessions[session.id] = session
    try:
        storage.save_debate_meta(session.id, question, rounds, state="idle")
    except Exception:
        pass  # 落盘失败不阻塞辩论创建
    return session


def get_session(debate_id: str) -> Optional[DebateSession]:
    return _sessions.get(debate_id)