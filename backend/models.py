"""Pydantic 数据模型"""
from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum


class DebateState(str, Enum):
    """辩论会话状态"""
    idle = "idle"
    debating = "debating"
    concluding = "concluding"   # 已被叫停，等当前发言结束
    finished = "finished"


class StartDebateRequest(BaseModel):
    """开始辩论请求"""
    question: str = Field(..., min_length=2, max_length=500, description="决策问题")
    rounds: int = Field(default=3, ge=1, le=6, description="辩论轮数")


class InterjectRequest(BaseModel):
    """用户插话请求"""
    message: str = Field(..., min_length=1, max_length=1000)


class FollowupRequest(BaseModel):
    """平衡单追问请求：基于已有平衡单+决策者追问，生成更新后的平衡单"""
    question: str = Field(..., min_length=1, max_length=500, description="决策者追问")
    old_sheet: dict = Field(..., description="之前的平衡单 JSON")


class BalanceSheetItem(BaseModel):
    """平衡单条目：某一维度下两个选项的对比"""
    dimension: str
    option_a: str
    option_b: str


class BalanceSheet(BaseModel):
    """决策平衡单"""
    options: List[str] = Field(..., description="两个选项名称")
    items: List[BalanceSheetItem] = Field(..., description="对比维度条目")
    summary: str = Field(..., description="三方分歧与共识总结")
    recommendation: str = Field(..., description="决策建议")


class AgentInfo(BaseModel):
    """Agent 信息（返回给前端展示）"""
    role: str
    name: str
    avatar: str
    color: str
    stance: str