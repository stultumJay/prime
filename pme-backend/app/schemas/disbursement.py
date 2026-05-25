from decimal import Decimal
from typing import Optional
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, field_validator
from app.utils.validation import validate_money_scale

_Z = Decimal("0.00")

VALID_PAYMENT_METHODS = {"cash", "check", "ADA"}


class DisbursementCreate(BaseModel):
    obligation_id:      UUID
    payment_method:     str
    reference_number:   Optional[str] = None
    disbursement_amount: Decimal
    disbursement_date:  date
    remarks:            Optional[str] = None

    @field_validator("disbursement_amount")
    @classmethod
    def positive(cls, v: Decimal) -> Decimal:
        validate_money_scale(v, "disbursement_amount")
        if v <= _Z:
            raise ValueError("disbursement_amount must be greater than zero.")
        return v

    @field_validator("payment_method")
    @classmethod
    def valid_method(cls, v: str) -> str:
        if v.lower() not in {m.lower() for m in VALID_PAYMENT_METHODS}:
            raise ValueError(f"payment_method must be one of: {', '.join(sorted(VALID_PAYMENT_METHODS))}")
        return v


class DisbursementUpdate(BaseModel):
    payment_method:      Optional[str]     = None
    reference_number:    Optional[str]     = None
    disbursement_amount: Optional[Decimal] = None
    disbursement_date:   Optional[date]    = None
    remarks:             Optional[str]     = None

    @field_validator("disbursement_amount")
    @classmethod
    def positive(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        validate_money_scale(v, "disbursement_amount")
        if v is not None and v <= _Z:
            raise ValueError("disbursement_amount must be greater than zero.")
        return v


class DisbursementResponse(BaseModel):
    disbursement_id:     UUID
    obligation_id:       UUID
    payment_method:      str
    reference_number:    Optional[str]
    disbursement_amount: Optional[Decimal]
    disbursement_date:   Optional[date]
    remarks:             Optional[str]
    created_at:          datetime
    class Config:
        from_attributes = True
