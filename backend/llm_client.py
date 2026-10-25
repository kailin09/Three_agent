"""LLM 客户端封装（OpenAI 兼容接口，支持流式）—— 含重试与优雅降级

演示安全设计：
- chat：指数退避重试2次（1s→2s），全失败抛异常（调用方均有 try-except 回退）
- chat_stream：建流失败重试→降级非流式分段产出；流中断保留已产出内容优雅结束；
  全部失败 yield 降级文案，保证辩论不卡死
"""
import asyncio
import os
from typing import AsyncGenerator, List, Dict
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

client = AsyncOpenAI(
    api_key=os.getenv("LLM_API_KEY", ""),
    base_url=os.getenv("LLM_BASE_URL", "https://api.openai.com/v1"),
)

MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")

MAX_RETRIES = 2  # 首次失败后最多重试2次（共3次尝试）


async def _with_retries(fn, **kwargs):
    """带指数退避的重试包装（1s → 2s），全失败抛最后异常"""
    last_exc = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            return await fn(**kwargs)
        except Exception as e:
            last_exc = e
            if attempt < MAX_RETRIES:
                await asyncio.sleep(2 ** attempt)
    raise last_exc


async def chat_stream(
    messages: List[Dict],
    temperature: float = 0.85,
    max_tokens: int = 450,
) -> AsyncGenerator[str, None]:
    """流式对话，逐 token 产出文本（含重试与降级）"""
    # 阶段1：建立流式连接（带重试）
    try:
        stream = await _with_retries(
            client.chat.completions.create,
            model=MODEL, messages=messages,
            temperature=temperature, max_tokens=max_tokens, stream=True,
        )
    except Exception:
        # 建流全失败 → 降级为非流式补全（分段 yield 保持流式体验）
        try:
            full = await chat(messages, temperature=temperature,
                              max_tokens=max_tokens)
            for i in range(0, len(full), 4):
                yield full[i:i + 4]
            return
        except Exception:
            yield "（网络波动，本轮发言暂时缺席，可稍后插话或叫停重试）"
            return
    # 阶段2：消费流（中断则保留已产出内容，优雅结束不重复补全）
    try:
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta and delta.content:
                yield delta.content
    except Exception:
        return


async def chat(
    messages: List[Dict],
    temperature: float = 0.4,
    max_tokens: int = 2000,
) -> str:
    """非流式对话，返回完整文本（带重试，全失败抛异常）"""
    resp = await _with_retries(
        client.chat.completions.create,
        model=MODEL, messages=messages,
        temperature=temperature, max_tokens=max_tokens,
    )
    return resp.choices[0].message.content or ""


async def chat_with_tools(
    messages: List[Dict],
    tools: List[Dict] = None,
    temperature: float = 0.4,
    max_tokens: int = 800,
):
    """带工具调用的非流式对话，返回完整 response 对象（带重试）

    调用方需检查 resp.choices[0].message.tool_calls：
    - 有 tool_calls → 执行工具 → 将结果以 role=tool 回传 → 再次调用生成最终发言
    - 无 tool_calls → message.content 即为直接生成的发言
    """
    kwargs = dict(
        model=MODEL,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    if tools:
        kwargs["tools"] = tools
    return await _with_retries(client.chat.completions.create, **kwargs)