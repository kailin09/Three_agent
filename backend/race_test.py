"""端到端测试：创建辩论并完整采集SSE事件流，避免curl晚连漏事件"""
import asyncio
import json
import sys

import httpx

BASE = "http://127.0.0.1:8000"
QUESTION = sys.argv[1] if len(sys.argv) > 1 else "手头有30万存款，买房付首付还是拿来创业？请算清楚账再辩论"
ROUNDS = int(sys.argv[2]) if len(sys.argv) > 2 else 3
OUT = sys.argv[3] if len(sys.argv) > 3 else "../sse_plan_test2.txt"


async def main():
    async with httpx.AsyncClient(timeout=httpx.Timeout(300.0)) as client:
        # 1. 创建辩论
        r = await client.post(f"{BASE}/api/debate/start",
                              json={"question": QUESTION, "rounds": ROUNDS})
        r.raise_for_status()
        debate = r.json()
        did = debate["debate_id"]
        print(f"辩论已创建: {did}")

        # 2. 立即订阅SSE流，完整采集
        events = []
        async with client.stream("GET", f"{BASE}/api/debate/{did}/stream") as resp:
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                try:
                    ev = json.loads(line[6:])
                except json.JSONDecodeError:
                    continue
                events.append(ev)
                t = ev.get("type")
                if t == "tool_call":
                    print(f"  [工具调用] {ev['role']} -> {ev['tool']}({ev['arguments']})")
                elif t == "tool_result":
                    print(f"  [工具结果] {ev['role']} {ev['tool']} = {ev['result'][:50]}")
                elif t == "speech_end":
                    c = ev.get("content", "").replace("\n", " ")
                    print(f"  [发言完] {ev['role']}: {c[:60]}...")
                elif t == "error":
                    print(f"  [错误] {ev}")
                elif t == "debate_end":
                    print("  [辩论结束]")
                    break

        # 3. 保存原始事件
        with open(OUT, "w", encoding="utf-8") as f:
            for ev in events:
                f.write("data: " + json.dumps(ev, ensure_ascii=False) + "\n\n")
        print(f"\n共 {len(events)} 个事件，已保存到 {OUT}")

        # 4. 快速统计
        from collections import Counter
        types = Counter(e.get("type") for e in events)
        print("事件分布:", dict(types))
        tc = [e for e in events if e.get("type") == "tool_call"]
        print(f"\n工具调用 {len(tc)} 次:")
        for e in tc:
            print(f"  {e['role']}: {e['tool']}({e['arguments']})")
        # 多样性检查
        args_set = {e["arguments"] for e in tc}
        tools_set = {e["tool"] for e in tc}
        print(f"参数多样性: {len(args_set)} 种不同参数 / {len(tc)} 次调用")
        print(f"工具多样性: {len(tools_set)} 种不同工具: {tools_set}")


if __name__ == "__main__":
    asyncio.run(main())