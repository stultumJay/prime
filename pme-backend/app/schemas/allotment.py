from decimal import Decimal
from typing import Optional
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, field_validator
from app.utils.validation import validate_money_scale

_Z = Decimal("0.00")


class AllotmentCreate(BaseModel):
    appr_fund_source_id: UUID
    aro_number:          str         # Allotment Release Order number
    amount_released:     Decimal
    release_date:        date
    remarks:             Optional[str] = None

    @field_validator("amount_released")
    @classmethod
    def positive(cls, v: Decimal) -> Decimal:
        validate_money_scale(v, "amount_released")
        if v <= _Z:
            raise ValueError("amount_released must be greater than zero.")
        return v


class AllotmentUpdate(BaseModel):
    """
    amount_released can be revised upward only if the ceiling allows it,
    or downward only if existing obligations permit — enforced in service.
    """
    aro_number:      Optional[str]     = None
    amount_released: Optional[Decimal] = None
    release_date:    Optional[date]    = None
    remarks:         Optional[str]     = None

    @field_validator("amount_released")
    @classmethod
    def positive(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        validate_money_scale(v, "amount_released")
        if v is not None and v <= _Z:
            raise ValueError("amount_released must be greater than zero.")
        return v


class AllotmentResponse(BaseModel):
    allotment_id:        UUID
    appr_fund_source_id: UUID
    aro_number:          str
    amount_released:     Optional[Decimal]
    release_date:        Optional[date]
    remarks:             Optional[str]
    created_at:          datetime
    class Config:
        from_attributes = True
