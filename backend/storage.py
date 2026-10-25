"""SQLite 持久化：辩论会话与发言历史落盘，重启不丢"""
import json
import os
import sqlite3
from datetime import datetime
from typing import Dict, List, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "debates.db")


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """建表（幂等），服务启动时调用"""
    with _conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS debates (
                id TEXT PRIMARY KEY,
                question TEXT NOT NULL,
                max_rounds INTEGER NOT NULL,
                state TEXT NOT NULL,
                plan TEXT,
                created_at TEXT NOT NULL,
                finished_at TEXT
            )
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                debate_id TEXT NOT NULL,
                role TEXT NOT NULL,
                name TEXT NOT NULL,
                content TEXT NOT NULL,
                round TEXT,
                seq INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        c.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_debate "
            "ON messages(debate_id, seq)"
        )


def save_debate_meta(debate_id: str, question: str, max_rounds: int,
                     state: str = "idle", plan: Optional[dict] = None):
    """创建辩论时写入元数据（INSERT OR REPLACE 保证幂等）"""
    with _conn() as c:
        c.execute(
            "INSERT OR REPLACE INTO debates "
            "(id, question, max_rounds, state, plan, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (debate_id, question, max_rounds, state,
             json.dumps(plan, ensure_ascii=False) if plan else None,
             datetime.now().isoformat())
        )


def update_debate_state(debate_id: str, state: str, finished: bool = False):
    """更新辩论状态；finished=True 时记录结束时间"""
    with _conn() as c:
        if finished:
            c.execute(
                "UPDATE debates SET state=?, finished_at=? WHERE id=?",
                (state, datetime.now().isoformat(), debate_id)
            )
        else:
            c.execute(
                "UPDATE debates SET state=? WHERE id=?",
                (state, debate_id)
            )


def save_message(debate_id: str, role: str, name: str, content: str,
                 round_num, seq: int):
    """逐条落盘发言/插话（seq 为本场内顺序号，用于恢复时排序）"""
    with _conn() as c:
        c.execute(
            "INSERT INTO messages "
            "(debate_id, role, name, content, round, seq, created_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (debate_id, role, name, content,
             str(round_num) if round_num is not None else None,
             seq, datetime.now().isoformat())
        )


def load_debate(debate_id: str) -> Optional[Dict]:
    """加载单场辩论：元数据 + 按序发言历史"""
    with _conn() as c:
        row = c.execute(
            "SELECT * FROM debates WHERE id=?", (debate_id,)
        ).fetchone()
        if not row:
            return None
        d = dict(row)
        d["plan"] = json.loads(d["plan"]) if d["plan"] else None
        msgs = c.execute(
            "SELECT role, name, content, round FROM messages "
            "WHERE debate_id=? ORDER BY seq",
            (debate_id,)
        ).fetchall()
        d["history"] = [dict(m) for m in msgs]
        return d


def list_debates(limit: int = 50) -> List[Dict]:
    """历史辩论列表（最新在前）"""
    with _conn() as c:
        rows = c.execute(
            "SELECT id, question, max_rounds, state, plan, created_at, finished_at "
            "FROM debates ORDER BY created_at DESC LIMIT ?",
            (limit,)
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["plan"] = json.loads(d["plan"]) if d["plan"] else None
            result.append(d)
        return result


def mark_interrupted_debates():
    """重启时将所有未完成辩论标记为 finished（中断），历史保留可查"""
    with _conn() as c:
        c.execute(
            "UPDATE debates SET state='finished', finished_at=? "
            "WHERE state IN ('idle','debating','concluding')",
            (datetime.now().isoformat(),)
        )