"""分析SSE测试输出：事件统计、工具调用明细、发言摘要、幻觉检查"""
import json
import re
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "../sse_plan_test.txt"
events = []
with open(path, encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if line.startswith("data: "):
            try:
                events.append(json.loads(line[6:]))
            except json.JSONDecodeError:
                pass

print(f"总事件数: {len(events)}")
from collections import Counter
types = Counter(e.get("type") for e in events)
print("事件类型分布:", dict(types))

print("\n=== 工具调用明细 ===")
for e in events:
    if e.get("type") == "tool_call":
        print(f"  [{e['role']}] {e['tool']}({e['arguments']})")
    elif e.get("type") == "tool_result":
        print(f"  [{e['role']}] {e['tool']} -> {e['result'][:60]}")

print("\n=== 发言摘要 (speech_end) ===")
for e in events:
    if e.get("type") == "speech_end":
        c = e.get("content", "").replace("\n", " ")
        print(f"  [{e['role']}] {c[:80]}...")

print("\n=== 幻觉检查 ===")
# 收集每个role真实拥有的工具结果
real_tools = {}
for e in events:
    if e.get("type") == "tool_result":
        real_tools.setdefault(e["role"], []).append(e["tool"])
# 检查发言中声称使用工具但无真实结果
claim_re = re.compile(r"(calculator|risk_simulate|get_current_date|模拟了|次模拟|根据.*工具)")
for e in events:
    if e.get("type") == "speech_end":
        role = e["role"]
        content = e.get("content", "")
        claims = claim_re.findall(content)
        if claims:
            has_real = real_tools.get(role, [])
            status = "OK(有真实结果)" if has_real else "疑似幻觉(无工具事件)"
            print(f"  [{role}] 声称: {claims[:3]} | 真实工具: {has_real} -> {status}")

print("\n=== 结束状态 ===")
last = events[-1] if events else {}
print(f"最后一个事件: {last.get('type')}")
print("debate_end存在:", any(e.get("type") == "debate_end" for e in events))
print("error事件:", [e for e in events if e.get("type") == "error"])