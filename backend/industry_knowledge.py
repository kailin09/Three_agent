"""行业知识包：辩题领域识别 + 行业决策框架注入

让辩手发言时引用行业专业术语与决策维度，而非泛泛而谈。
覆盖比赛命题方向（教育/医疗/制造/消费/金融/出海）+ 职场 + 通用兜底。

设计原则：
- facts 只写"量级/结构"类常识，不写精确数字（防幻觉传播，精确数字交给工具验证）
- detect 双保险：LLM 识别优先，失败时关键词匹配兜底，始终返回有效 key
- 通用领域不注入（辩手人设已含通用决策框架），避免上下文膨胀
"""
import json
import re

from llm_client import chat

# ---------- 行业知识包 ----------

INDUSTRY_PACKS = {
    "overseas": {
        "label": "出海",
        "dimensions": ["目标市场政策合规", "本地化成本", "汇率波动", "供应链半径", "文化宗教差异"],
        "facts": [
            "东南亚人口结构年轻、电商增速快但客单价偏低",
            "欧盟有GDPR数据合规与碳排放壁垒",
            "拉美支付体系碎片化、回款周期长",
            "中东斋月是消费旺季、宗教文化约束强",
            "出海失败案例多死于「照搬国内模式」而非资金不足",
        ],
        "terms": ["本地化", "合规准入", "关税壁垒", "汇率对冲", "渠道下沉"],
        "traps": ["把国内成功模式直接平移", "低估合规与牌照成本", "忽视地缘政治风险"],
    },
    "manufacturing": {
        "label": "制造",
        "dimensions": ["产能利用率", "自动化投资回报周期", "供应链韧性", "用工成本趋势", "技改风险"],
        "facts": [
            "制造业自动化改造回本周期通常以年计",
            "柔性产线适合多品种小批量，全自动线适合大批量标准化",
            "东南亚用工成本显著低于国内但熟练工短缺",
            "技改的隐性成本（停工/培训/调试）常被低估",
        ],
        "terms": ["产能爬坡", "OEE", "柔性制造", "精益生产", "技改"],
        "traps": ["盲目追全自动忽视柔性", "低估老设备改造隐性成本", "忽视工人转岗安置"],
    },
    "finance": {
        "label": "金融",
        "dimensions": ["风险收益比", "流动性", "杠杆水平", "通胀侵蚀", "资产相关性"],
        "facts": [
            "高收益必然伴随高风险，无例外",
            "流动性差的资产在危机时折价严重",
            "长期通胀会持续侵蚀现金购买力",
            "分散配置可降低单一资产暴雷的非系统性风险",
        ],
        "terms": ["资产配置", "最大回撤", "流动性溢价", "再平衡", "夏普比率"],
        "traps": ["把过去收益当未来预期", "忽视流动性风险", "加杠杆赌单一标的"],
    },
    "education": {
        "label": "教育",
        "dimensions": ["投资回报周期", "能力适配度", "行业趋势", "机会成本", "学习方式"],
        "facts": [
            "技能半衰期在缩短，终身学习成为常态",
            "学历通胀下实操能力与作品集权重上升",
            "数字技能与理工科需求持续增长",
            "专业选择的最大变量是毕业时的行业周期而非当下热度",
        ],
        "terms": ["技能半衰期", "学历通胀", "产教融合", "能力迁移"],
        "traps": ["只看起薪不看成长曲线", "用当下的专业热度做多年后的选择", "忽视兴趣与能力匹配"],
    },
    "healthcare": {
        "label": "医疗",
        "dimensions": ["治愈率与风险", "生存质量", "医疗费用", "第二诊疗意见", "康复周期"],
        "facts": [
            "重大治疗方案应寻求第二诊疗意见",
            "保守治疗与手术各有适用边界，并非越激进越好",
            "康复期护理与误工成本常被低估",
            "预防性投入的回报远高于事后治疗",
        ],
        "terms": ["保守治疗", "适应症", "预后", "第二诊疗意见", "循证医学"],
        "traps": ["过度依赖单一医生判断", "只看治愈率忽视生存质量", "低估长期康复成本"],
    },
    "consumption": {
        "label": "消费",
        "dimensions": ["需求刚性与改善性", "总持有成本", "折旧与残值", "杠杆压力", "替代方案"],
        "facts": [
            "大额消费的总持有成本常远超标价（房有维护、车有保养折旧）",
            "耐用品折旧曲线前陡后缓，头几年贬值最快",
            "消费贷实际利率常被分期手续费掩盖",
        ],
        "terms": ["总持有成本", "折旧曲线", "残值", "杠杆率", "刚需与改善"],
        "traps": ["只看首付不看月供压力", "把改善需求当刚需", "忽视折旧与沉没成本"],
    },
    "career": {
        "label": "职场",
        "dimensions": ["薪资成长曲线", "行业生命周期", "技能可迁移性", "年龄窗口", "家庭约束"],
        "facts": [
            "转行通常有1-2年收入低谷期",
            "管理路线与技术路线的年龄曲线不同",
            "技能可迁移性决定抗风险能力",
            "行业衰退信号比个人努力更能决定职业天花板",
        ],
        "terms": ["职业天花板", "技能迁移", "行业周期", "年龄窗口", "机会成本"],
        "traps": ["用当前薪资推演十年后", "忽视行业衰退信号", "裸辞不留安全垫"],
    },
    "general": {
        "label": "通用",
        "dimensions": ["成本与收益", "风险与退路", "时间窗口", "机会成本", "长期价值"],
        "facts": [],
        "terms": ["机会成本", "沉没成本", "风险对冲", "复利效应"],
        "traps": ["沉没成本谬误", "只看收益不看风险", "忽视时间窗口"],
    },
}

# ---------- 领域识别（LLM 优先 + 关键词兜底） ----------

_INDUSTRY_SYSTEM = (
    "你是辩题领域分类器。判断辩题最属于以下哪个行业领域，只输出一个JSON对象，不要输出其他内容。"
    "可选领域：overseas(出海)、manufacturing(制造)、finance(金融)、"
    "education(教育)、healthcare(医疗)、consumption(消费)、career(职场)、general(通用)。"
)

_INDUSTRY_FEWSHOT = (
    "输出格式：\n"
    '{"industry": "领域key"}\n\n'
    "示例1——辩题「公司要不要拓展东南亚市场？」：\n"
    '{"industry": "overseas"}\n\n'
    "示例2——辩题「手头30万，买房还是创业？」：\n"
    '{"industry": "consumption"}\n\n'
    "示例3——辩题「35岁裸辞转行做程序员来得及吗？」：\n"
    '{"industry": "career"}\n'
)

# 关键词兜底（LLM 识别失败时按辩题关键词匹配，命中最多的领域胜出）
_KEYWORD_MAP = [
    ("overseas", ["出海", "海外", "跨境", "东南亚", "欧美", "国际化", "外贸", "全球市场"]),
    ("manufacturing", ["工厂", "产线", "制造", "自动化", "车间", "生产", "供应链", "技改", "设备"]),
    ("finance", ["投资", "理财", "基金", "股票", "资产", "配置", "存款", "通胀", "杠杆", "复利", "黄金"]),
    ("education", ["留学", "专业", "考研", "培训", "读研", "学历", "考证", "学校", "大学", "读书"]),
    ("healthcare", ["手术", "治疗", "医生", "病", "医疗", "康复", "体检", "用药", "诊断", "医院"]),
    ("consumption", ["买房", "买车", "消费", "贷款", "购物", "装修", "房贷", "车贷", "换车"]),
    ("career", ["跳槽", "转行", "裸辞", "裁员", "工作", "职业", "升职", "加班", "就业", "薪资", "辞职"]),
]


def _keyword_fallback(question: str) -> str:
    """关键词匹配兜底：命中最多的领域胜出，全部0命中→通用"""
    scores = {}
    for key, keywords in _KEYWORD_MAP:
        scores[key] = sum(1 for k in keywords if k in question)
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "general"


async def detect_industry(question: str) -> str:
    """识别辩题所属行业领域（LLM 优先，关键词兜底，始终返回有效 key）"""
    try:
        raw = await chat(
            [{"role": "system", "content": _INDUSTRY_SYSTEM},
             {"role": "user", "content": f"【辩题】{question}\n\n{_INDUSTRY_FEWSHOT}"}],
            temperature=0.1,
            max_tokens=60,
        )
        m = re.search(r'\{.*\}', raw, re.DOTALL)
        if m:
            result = json.loads(m.group(0))
            key = str(result.get("industry", "")).strip().lower()
            if key in INDUSTRY_PACKS:
                return key
    except Exception:
        pass
    return _keyword_fallback(question)


# ---------- 注入块构建 ----------

def build_industry_context(industry_key: str) -> str:
    """行业知识包→注入块；通用领域返回空串（辩手人设已含通用框架）"""
    pack = INDUSTRY_PACKS.get(industry_key)
    if not pack or industry_key == "general":
        return ""
    lines = [f"【行业知识包·{pack['label']}（系统已为你加载该领域决策框架）】"]
    if pack.get("dimensions"):
        lines.append("关键维度：" + "、".join(pack["dimensions"]))
    if pack.get("facts"):
        lines.append("行业常识：" + "；".join(pack["facts"]))
    if pack.get("terms"):
        lines.append("专业术语：" + "、".join(pack["terms"]))
    if pack.get("traps"):
        lines.append("常见陷阱：" + "、".join(pack["traps"]))
    lines.append("（发言可自然引用上述术语与常识；引用常识用「业内普遍认为」表述，精确数字请用工具验证）")
    return "\n".join(lines)


def get_industry_label(industry_key: str) -> str:
    """领域中文标签（供前端展示）"""
    pack = INDUSTRY_PACKS.get(industry_key) or INDUSTRY_PACKS["general"]
    return pack["label"]