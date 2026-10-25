"""速度测试：精确计量并行辩论各事件时间点"""
import asyncio
import json
import time

import httpx


async def main():
    async with httpx.AsyncClient(timeout=60) as client:
        t0 = time.time()
        r = await client.post(
            "http://localhost:8000/api/debate/start",
            json={"question": "该考研还是工作", "rounds": 1},
        )
        did = r.json()["debate_id"]
        print(f"[{time.time()-t0:5.2f}s] 辩论已启动 id={did}")

        first_token = None
        async with client.stream(
            "GET", f"http://localhost:8000/api/debate/{did}/stream"
        ) as resp:
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                ev = json.loads(line[6:])
                t = time.time() - t0
                et = ev["type"]
                if et == "speech_start":
                    print(f"[{t:5.2f}s] speech_start  {ev['role']}")
                elif et == "speech_end":
                    print(f"[{t:5.2f}s] speech_end    {ev['role']}")
                elif et in ("debate_end", "stream_end", "error"):
                    print(f"[{t:5.2f}s] {et}")
                elif et == "token" and first_token is None:
                    first_token = t
                    print(f"[{t:5.2f}s] 首个token到达")


asyncio.run(main())