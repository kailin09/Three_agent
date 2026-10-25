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


def risk_simulate(success_rate: float, trials: int) -> str:
    """蒙特卡洛风险模拟：给定成功概率和模拟次数，随机模拟成功/失败次数

    例: risk_simulate(0.3, 100) → "蒙特卡洛模拟完成（100次）：成功 28 次，失败 72 次，实际成功率 28.0%"
    """
    success_rate = max(0.0, min(1.0, float(success_rate)))
    trials = max(1, min(10000, int(trials)))
    successes = sum(1 for _ in range(trials) if random.random() < success_rate)
    failures = trials - successes
    rate = successes / trials * 100
    return (
        f"蒙特卡洛模拟完成（{trials}次）：成功 {successes} 次，"
        f"失败 {failures} 次，实际成功率 {rate:.1f}%"
    )


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
                "蒙特卡洛风险模拟：给定预估成功概率和模拟次数，"
                "随机模拟出成功/失败次数和实际成功率，用于风险推演和最坏情况分析。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "success_rate": {
                        "type": "number",
                        "description": "预估的成功概率，0~1 之间，如 0.3 表示 30%",
                    },
                    "trials": {
                        "type": "number",
                        "description": "模拟次数，如 100 或 1000",
                    },
                },
                "required": ["success_rate", "trials"],
            },
        },
    },
]

_TOOL_FUNCS = {
    "calculator": calculator,
    "get_current_date": get_current_date,
    "risk_simulate": risk_simulate,
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