"""Subscription/alert domain models — target for H6. MVP: Discord only."""

from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel

DeliveryChannel = Literal['discord']


class DiscordConfig(BaseModel):
    webhook_url: str


class ChannelConfig(BaseModel):
    discord: Optional[DiscordConfig] = None


class Subscription(BaseModel):
    id: str
    user_id: str
    law_ids: list[str]
    channel: DeliveryChannel
    channel_config: ChannelConfig
    created_at: str      # ISO datetime
    active: bool = True


class Alert(BaseModel):
    id: str
    subscription_id: str
    law_id: str
    triggered_at: str    # ISO datetime
    change_type: Literal['amendment', 'new_enforcement', 'repeal']
    description: str
    delivered: bool = False
