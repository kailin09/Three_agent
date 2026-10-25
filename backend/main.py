"""FastAPI 入口：辩论会话的 HTTP/SSE 接口"""
import asyncio
import json
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from agents import AGENTS
from balance_sheet import generate_balance_sheet, generate_followup
from debate_engine import create_session, get_session
from memory_profile import (build_profile_context, get_debates_count,
                             get_profile, init_profile_table)
from models import FollowupRequest, InterjectRequest, StartDebateRequest
import storage

app = FastAPI(title="多Agent辩论决策陪练", version="1.1.0")

# 启动时初始化数据库，并将上次未完成的辩论标记为中断（历史保留可查）
storage.init_db()
storage.mark_interrupted_debates()
init_profile_table()  # 用户决策画像表（跨会话长期记忆）

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _sse(data: dict) -> str:
    """格式化一条 SSE 消息"""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


# ---------- Agent 信息 ----------

@app.get("/api/agents")
async def get_agents():
    """返回三个辩手的人设信息"""
    return [
        {
            "role": a["role"],
            "name": a["name"],
            "avatar": a["avatar"],
            "color": a["color"],
            "stance": a["stance"],
        }
        for a in AGENTS
    ]


# ---------- 辩论流程 ----------

@app.post("/api/debate/start")
async def start_debate(req: StartDebateRequest):
    """提出问题，开始一场辩论"""
    session = create_session(req.question, req.rounds)
    await session.start()
    return {
        "debate_id": session.id,
        "question": session.question,
        "max_rounds": session.max_rounds,
        "agents": [
            {"role": a["role"], "name": a["name"], "avatar": a["avatar"],
             "color": a["color"], "stance": a["stance"]}
            for a in AGENTS
        ],
    }


@app.get("/api/debate/{debate_id}/stream")
async def stream_debate(debate_id: str):
    """SSE 流：实时推送辩论发言（逐 token）"""
    session = get_session(debate_id)
    if not session:
        raise HTTPException(status_code=404, detail="辩论不存在或已过期")

    queue = session.subscribe()

    async def event_generator():
        try:
            while True:
                event = await queue.get()
                if event is None:
                    yield _sse({"type": "stream_end"})
                    break
                yield _sse(event)
        finally:
            session.unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.post("/api/debate/{debate_id}/interject")
async def interject(debate_id: str, req: InterjectRequest):
    """用户插话：写入辩论历史，后续发言的 Agent 将看到并回应"""
    session = get_session(debate_id)
    if not session:
        raise HTTPException(status_code=404, detail="辩论不存在或已过期")
    await session.interject(req.message)
    return {"ok": True}


@app.post("/api/debate/{debate_id}/conclude")
async def conclude(debate_id: str):
    """用户叫停辩论"""
    session = get_session(debate_id)
    if not session:
        raise HTTPException(status_code=404, detail="辩论不存在或已过期")
    await session.conclude()
    return {"ok": True}


@app.get("/api/debate/{debate_id}/state")
async def get_state(debate_id: str):
    """查询辩论状态与消息历史（内存没有时回查数据库，支持重启后回看）"""
    session = get_session(debate_id)
    if session:
        return {
            "debate_id": session.id,
            "question": session.question,
            "state": session.state.value,
            "plan": session._plan,
            "history": session.history,
        }
    # 内存未命中：从数据库恢复（重启后的历史辩论）
    record = storage.load_debate(debate_id)
    if not record:
        raise HTTPException(status_code=404, detail="辩论不存在")
    return {
        "debate_id": record["id"],
        "question": record["question"],
        "state": record["state"],
        "plan": record["plan"],
        "history": record["history"],
    }


@app.get("/api/debates")
async def list_debates(limit: int = 50):
    """历史辩论列表（最新在前，重启后仍可查）"""
    return storage.list_debates(limit=min(limit, 200))


# ---------- 决策平衡单 ----------

@app.post("/api/debate/{debate_id}/balance-sheet")
async def get_balance_sheet(debate_id: str):
    """辩论结束后生成决策平衡单（支持重启后基于持久化历史生成）"""
    session = get_session(debate_id)
    if session:
        question, history = session.question, session.history
    else:
        # 内存未命中：从数据库恢复
        record = storage.load_debate(debate_id)
        if not record:
            raise HTTPException(status_code=404, detail="辩论不存在")
        question, history = record["question"], record["history"]
    if not history:
        raise HTTPException(status_code=400, detail="还没有任何发言，无法生成平衡单")
    try:
        sheet = await generate_balance_sheet(
            question, history, build_profile_context())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"平衡单生成失败：{e}")
    return sheet


@app.post("/api/debate/{debate_id}/balance-sheet/followup")
async def followup_balance_sheet(debate_id: str, req: FollowupRequest):
    """平衡单追问：基于已有平衡单+决策者追问，生成更新后的平衡单"""
    session = get_session(debate_id)
    if session:
        question = session.question
    else:
        # 内存未命中：从数据库恢复辩题
        record = storage.load_debate(debate_id)
        if not record:
            raise HTTPException(status_code=404, detail="辩论不存在")
        question = record["question"]
    if not req.old_sheet:
        raise HTTPException(status_code=400, detail="缺少已有平衡单")
    try:
        sheet = await generate_followup(
            question, req.old_sheet, req.question, build_profile_context())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"追问更新失败：{e}")
    return sheet


# ---------- 用户决策画像（跨会话长期记忆） ----------

@app.get("/api/profile")
async def get_user_profile():
    """返回用户决策画像（供前端画像徽标/战报展示）"""
    data = get_profile()
    if not data:
        return {"profile": None, "debates_count": 0, "has_profile": False}
    return {
        "profile": data["profile"],
        "debates_count": data["debates_count"],
        "updated_at": data["updated_at"],
        "has_profile": True,
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)