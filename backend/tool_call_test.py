"""快速验证 GLM-4-Flash function calling 是否工作"""
import asyncio
from llm_client import chat_with_tools
from tools import TOOL_SCHEMAS, execute_tool


async def test():
    messages = [
        {"role": "system", "content": "你是老陈，务实派辩手，喜欢用精确数据说话，算清每一笔账。"},
        {"role": "user", "content": (
            "手头30万存款买房还是创业？"
            "请算一下：如果创业，30万按年化5%通胀，3年后购买力还剩多少？"
            "如果需要计算请调用 calculator 工具。"
        )},
    ]
    resp = await chat_with_tools(messages, tools=TOOL_SCHEMAS)
    msg = resp.choices[0].message
    print("=== content ===")
    print(msg.content)
    print("=== tool_calls ===")
    print(msg.tool_calls)
    if msg.tool_calls:
        for tc in msg.tool_calls:
            print(f"  tool: {tc.function.name}")
            print(f"  args: {tc.function.arguments}")
            print(f"  result: {execute_tool(tc.function.name, tc.function.arguments)}")
    else:
        print("（模型未调用工具，直接生成了回答）")


asyncio.run(test())