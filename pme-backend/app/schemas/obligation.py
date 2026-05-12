from decimal import Decimal
from typing import Optional
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, field_validator
from app.utils.validation import validate_money_scale

_Z = Decimal("0.00")


class ObligationCreate(BaseModel):
    allotment_id:       UUID
    payee:              str
    reference_document: str          # ORS / Purchase Order / Contract number
    obligation_amount:  Decimal
    obligation_date:    date
    remarks:            Optional[str] = None

    @field_validator("obligation_amount")
    @classmethod
    def positive(cls, v: Decimal) -> Decimal:
        validate_money_scale(v, "obligation_amount")
        if v <= _Z:
            raise ValueError("obligation_amount must be greater than zero.")
        return v


class ObligationUpdate(BaseModel):
    payee:              Optional[str]     = None
    reference_document: Optional[str]     = None
    obligation_amount:  Optional[Decimal] = None
    obligation_date:    Optional[date]    = None
    remarks:            Optional[str]     = None

    @field_validator("obligation_amount")
    @classmethod
    def positive(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        validate_money_scale(v, "obligation_amount")
        if v is not None and v <= _Z:
            raise ValueError("obligation_amount must be greater than zero.")
        return v


class ObligationResponse(BaseModel):
    obligation_id:      UUID
    allotment_id:       UUID
    payee:              str
    reference_document: str
    obligation_amount:  Optional[Decimal]
    obligation_date:    Optional[date]
    remarks:            Optional[str]
    created_at:         datetime
    class Config:
        from_attributes = True
