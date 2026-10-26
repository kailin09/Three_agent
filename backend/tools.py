"""辩论 Agent 可用的工具集（function calling）

三个工具贴合辩手人设：
- calculator     算账（老陈·务实派刚需）
- get_current_date  时间节点计算
- risk_simulate  蒙特卡洛风险模拟（赵姐·风险派最坏账推演）
"""
import ast
import json
import operator
import random
from datetime import datetime
from typing import Dict, List


# ---------- 工具实现 ----------

_SAFE_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def _safe_eval(node):
    """基于 AST 白名单的安全数学表达式求值"""
    if isinstance(node, ast.Expression):
        return _safe_eval(node.body)
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)):
            return node.value
        raise ValueError(f"不支持的常量: {node.value!r}")
    if isinstance(node, ast.BinOp):
        op_type = type(node.op)
        if op_type not in _SAFE_OPS:
            raise ValueError(f"不支持的运算符: {op_type.__name__}")
        return _SAFE_OPS[op_type](_safe_eval(node.left), _safe_eval(node.right))
    if isinstance(node, ast.UnaryOp):
        op_type = type(node.op)
        if op_type not in _SAFE_OPS:
            raise ValueError(f"不支持的运算符: {op_type.__name__}")
        return _SAFE_OPS[op_type](_safe_eval(node.operand))
    raise ValueError(f"不支持的表达式: {type(node).__name__}")


def calculator(expression: str) -> str:
    """计算数学表达式（支持 + - * / // % ** 和括号）

    例: calculator("(12000-8000)*3") → "(12000-8000)*3 = 12000"
    """
    try:
        tree = ast.parse(expression, mode="eval")
        result = _safe_eval(tree)
        if isinstance(result, float) and result.is_integer():
            result = int(result)
        return f"{expression} = {result}"
    except Exception as e:
        return f"计算失败: {e}"


def get_current_date() -> str:
    """获取当前日期、星期和时间"""
    now = datetime.now()
    weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
    return (f"{now.year}年{now.month:02d}月{now.day:02d}日 "
            f"{weekdays[now.weekday()]} {now.strftime('%H:%M')}")


def risk_simulate(
    success_rate: float,
    trials: int = 1000,
    optimistic_rate: float = None,
    pessimistic_rate: float = None,
) -> str:
    """多场景风险模拟推演：支持乐观/基准/悲观三种假设，输出结果区间与风险来源

    给定基准成功概率和可选的乐观/悲观概率，分别模拟三种场景，
    输出每种场景的模拟结果、结果区间（P10-P90）和关键风险因素。

    Args:
        success_rate: 基准成功概率（0~1），如 0.35 表示 35%
        trials: 每种场景的模拟次数，默认 1000
        optimistic_rate: 乐观场景成功概率（可选，默认基准+15%）
        pessimistic_rate: 悲观场景成功概率（可选，默认基准-15%）

    例:
        risk_simulate(0.35, 1000, 0.5, 0.2)
        → 三场景对比 + 结果区间 + 风险来源分析
    """
    base = max(0.0, min(1.0, float(success_rate)))
    trials = max(100, min(5000, int(trials)))
    opt = max(0.0, min(1.0, float(optimistic_rate))) if optimistic_rate is not None else min(1.0, base + 0.15)
    pes = max(0.0, min(1.0, float(pessimistic_rate))) if pessimistic_rate is not None else max(0.0, base - 0.15)

    def _simulate(rate: float, n: int) -> dict:
        """单次场景模拟，返回完整统计量"""
        results = [1 if random.random() < rate else 0 for _ in range(n)]
        successes = sum(results)
        sim_rate = successes / n
        # 结果区间：用 bootstrap 估计 P10-P90
        boot_means = []
        for _ in range(200):
            sample = [random.choice(results) for _ in range(n)]
            boot_means.append(sum(sample) / n)
        boot_means.sort()
        p10 = boot_means[19]   # 200*0.1
        p90 = boot_means[179]  # 200*0.9
        return {
            "successes": successes,
            "failures": n - successes,
            "rate": sim_rate,
            "p10": p10,
            "p90": p90,
        }

    base_res = _simulate(base, trials)
    opt_res = _simulate(opt, trials)
    pes_res = _simulate(pes, trials)

    # 风险来源推断（基于概率水平）
    risks = []
    if base < 0.3:
        risks.append("成功概率较低，失败风险显著")
    if pes < 0.15:
        risks.append("悲观场景下失败概率极高")
    if opt_res["p90"] - pes_res["p10"] > 0.4:
        risks.append("结果波动区间大，不确定性高")
    if not risks:
        risks.append("主要风险来自假设概率本身的准确性")

    return (
        f"【多场景风险推演】（每种场景 {trials} 次模拟）\n"
        f"\n"
        f"▸ 乐观场景（假设成功率 {opt*100:.0f}%）：\n"
        f"  成功 {opt_res['successes']} 次，模拟成功率 {opt_res['rate']*100:.1f}%\n"
        f"  结果区间（P10-P90）：{opt_res['p10']*100:.1f}% ~ {opt_res['p90']*100:.1f}%\n"
        f"\n"
        f"▸ 基准场景（假设成功率 {base*100:.0f}%）：\n"
        f"  成功 {base_res['successes']} 次，模拟成功率 {base_res['rate']*100:.1f}%\n"
        f"  结果区间（P10-P90）：{base_res['p10']*100:.1f}% ~ {base_res['p90']*100:.1f}%\n"
        f"\n"
        f"▸ 悲观场景（假设成功率 {pes*100:.0f}%）：\n"
        f"  成功 {pes_res['successes']} 次，模拟成功率 {pes_res['rate']*100:.1f}%\n"
        f"  结果区间（P10-P90）：{pes_res['p10']*100:.1f}% ~ {pes_res['p90']*100:.1f}%\n"
        f"\n"
        f"【关键风险来源】\n"
        f"  " + "\n  ".join(f"· {r}" for r in risks) + "\n"
        f"\n"
        f"【免责声明】此为基于假设概率的多场景推演，非真实预测。"
        f"实际结果受市场环境、个人努力、时机等不可控因素影响。"
    )


# ---------- 新增工具 ----------

def career_path(current_role: str, target_role: str, years: int = 5) -> str:
    """职业路径分析：分析从当前角色到目标角色的成长路径

    基于通用职业发展规律，输出能力差距、关键里程碑、时间预估和风险提示。
    此为框架性分析，非针对个人的精确规划。

    Args:
        current_role: 当前角色/状态，如"本科应届生""初级工程师"
        target_role: 目标角色/状态，如"技术总监""独立创业者"
        years: 规划时间跨度（年），默认5年

    例: career_path("本科应届生", "AI产品经理", 5)
    """
    years = max(1, min(20, int(years)))
    # 能力差距框架（通用模板，实际应由LLM根据辩题填充）
    gaps = [
        f"专业深度：从{current_role}到{target_role}需要积累的核心技能",
        f"管理经验：团队管理、项目统筹能力的跨越",
        f"行业认知：从执行层到决策层的视野升级",
        f"人脉资源：从同事圈层到行业生态的拓展",
    ]
    # 关键里程碑
    milestones = []
    for i in range(1, years + 1):
        if i == 1:
            milestones.append(f"第1年：夯实基础，完成从学生/新人到合格从业者的转变")
        elif i == years // 2:
            milestones.append(f"第{i}年：突破瓶颈，获得独立负责项目/模块的能力")
        elif i == years:
            milestones.append(f"第{i}年：达到目标角色要求的核心能力水平")
        else:
            milestones.append(f"第{i}年：持续积累，逐步扩展能力边界")
    # 风险
    risks = [
        "行业变化快，目标岗位需求可能萎缩",
        "个人努力程度与规划假设存在偏差",
        "经济周期影响晋升窗口和机会",
    ]
    return (
        f"【职业路径分析】{current_role} → {target_role}（{years}年规划）\n"
        f"\n"
        f"【核心能力差距】\n"
        + "\n".join(f"  · {g}" for g in gaps) + "\n"
        f"\n"
        f"【关键里程碑】\n"
        + "\n".join(f"  · {m}" for m in milestones) + "\n"
        f"\n"
        f"【风险提示】\n"
        + "\n".join(f"  · {r}" for r in risks) + "\n"
        f"\n"
        f"【免责声明】此为通用框架分析，非个人职业规划建议。"
        f"实际路径受个人能力、机遇、行业变化等多重因素影响。"
    )


def sensitivity_analysis(
    base_value: float,
    factors: List[dict] = None,
) -> str:
    """敏感性分析：分析关键参数变化对结果的影响程度

    给定基准值和若干影响因素（每个因素有变化幅度），
    输出各因素对结果的敏感性排序和关键阈值。

    Args:
        base_value: 基准结果值，如 500000（总成本）
        factors: 影响因素列表，每项含 name（因素名）、change_pct（变化百分比，如-20表示下降20%）
                 如 [{"name": "薪资涨幅", "change_pct": -20}, {"name": "房价下跌", "change_pct": 15}]

    例: sensitivity_analysis(500000, [{"name": "薪资涨幅", "change_pct": -20}, {"name": "房租", "change_pct": 30}])
    """
    if factors is None:
        factors = []
    lines = [
        f"【敏感性分析】基准值：{base_value:,.0f}",
        "",
        "【各因素对结果的影响】（按影响幅度排序）",
    ]
    impacts = []
    for f in factors:
        name = f.get("name", "未知因素")
        pct = float(f.get("change_pct", 0))
        # 线性近似：变化百分比直接影响结果
        new_val = base_value * (1 + pct / 100)
        impact = abs(new_val - base_value)
        direction = "↑" if pct > 0 else "↓"
        impacts.append((impact, name, pct, new_val, direction))
    impacts.sort(reverse=True)
    for rank, (impact, name, pct, new_val, direction) in enumerate(impacts, 1):
        lines.append(
            f"  {rank}. {name}：变化 {pct:+.0f}% → 结果 {direction} 至 {new_val:,.0f} "
            f"（影响幅度：{impact:,.0f}）"
        )
    if not impacts:
        lines.append("  （未提供影响因素）")
    lines.append("")
    lines.append("【关键发现】")
    if impacts:
        top = impacts[0]
        lines.append(f"  · 最敏感因素：{top[1]}，{top[4]}{abs(top[2]):.0f}% 的变化导致结果波动 {top[0]:,.0f}")
        if len(impacts) > 1:
            ratio = impacts[0][0] / impacts[1][0] if impacts[1][0] > 0 else 999
            if ratio > 2:
                lines.append(f"  · {top[1]} 的影响是第二敏感因素的 {ratio:.1f} 倍，建议优先关注")
    lines.append("  · 以上分析基于线性近似，实际关系可能非线性")
    lines.append("")
    lines.append("【免责声明】此为简化敏感性分析，未考虑因素间的交互作用。")
    return "\n".join(lines)


# ---------- 工具注册表（OpenAI function calling 格式）----------

TOOL_SCHEMAS: List[Dict] = [
    {
        "type": "function",
        "function": {
            "name": "calculator",
            "description": (
                "计算数学表达式，用于算薪资差、回本周期、机会成本、复利等数字账。"
                "支持加减乘除、整除、取模、幂运算和括号。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "数学表达式，如 (12000-8000)*3 或 300000*1.03**5",
                    }
                },
                "required": ["expression"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_current_date",
            "description": "获取当前日期和时间，用于计算时间节点、年龄、工作年限等时间账。",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "risk_simulate",
            "description": (
                "多场景风险模拟推演：给定基准成功概率，模拟乐观/基准/悲观三种场景，"
                "输出各场景的成功次数、模拟成功率、结果区间（P10-P90）和关键风险来源。"
                "⚠️ 必须基于行业常识、历史数据或辩题背景给出 success_rate，"
                "严禁随意编造概率；结果仅为假设性推演，非真实预测。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "success_rate": {
                        "type": "number",
                        "description": "基准成功概率，0~1 之间，如 0.35 表示 35%",
                    },
                    "trials": {
                        "type": "number",
                        "description": "每种场景的模拟次数，默认 1000",
                    },
                    "optimistic_rate": {
                        "type": "number",
                        "description": "乐观场景成功概率（可选，默认基准+15%），如 0.5",
                    },
                    "pessimistic_rate": {
                        "type": "number",
                        "description": "悲观场景成功概率（可选，默认基准-15%），如 0.2",
                    },
                },
                "required": ["success_rate"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "career_path",
            "description": (
                "职业路径分析：分析从当前角色到目标角色的成长路径，"
                "输出能力差距、关键里程碑、时间预估和风险提示。"
                "适用于讨论职业选择、转行、晋升等成长类辩题。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "current_role": {
                        "type": "string",
                        "description": "当前角色/状态，如'本科应届生''初级工程师''传统行业从业者'",
                    },
                    "target_role": {
                        "type": "string",
                        "description": "目标角色/状态，如'技术总监''独立创业者''AI产品经理'",
                    },
                    "years": {
                        "type": "number",
                        "description": "规划时间跨度（年），默认5年",
                    },
                },
                "required": ["current_role", "target_role"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "sensitivity_analysis",
            "description": (
                "敏感性分析：分析关键参数变化对结果的影响程度，"
                "输出各因素的敏感性排序和关键阈值。"
                "适用于讨论成本、收益、风险等受多因素影响的辩题。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "base_value": {
                        "type": "number",
                        "description": "基准结果值，如 500000（总成本）或 15000（月薪）",
                    },
                    "factors": {
                        "type": "array",
                        "description": "影响因素列表，每项含 name（因素名）和 change_pct（变化百分比，如-20表示下降20%）",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "change_pct": {"type": "number"},
                            },
                        },
                    },
                },
                "required": ["base_value", "factors"],
            },
        },
    },
]

_TOOL_FUNCS = {
    "calculator": calculator,
    "get_current_date": get_current_date,
    "risk_simulate": risk_simulate,
    "career_path": career_path,
    "sensitivity_analysis": sensitivity_analysis,
}


def execute_tool(name: str, arguments_json: str) -> str:
    """执行工具调用并返回结果文本

    Args:
        name: 工具名
        arguments_json: LLM 返回的 JSON 字符串参数
    """
    func = _TOOL_FUNCS.get(name)
    if not func:
        return f"未知工具: {name}"
    try:
        args = json.loads(arguments_json) if arguments_json else {}
    except json.JSONDecodeError:
        args = {}
    try:
        return func(**args)
    except TypeError as e:
        return f"参数错误: {e}"
    except Exception as e:
        return f"工具执行出错: {e}"