from __future__ import annotations

from decimal import Decimal
from typing import Literal, Optional, List
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, field_validator
from app.utils.validation import validate_money_scale

# ── Expense class guard — the ONLY valid values in the entire system ───────
VALID_EXPENSE_CLASSES = {"PS", "MOOE", "FE", "CO"}
ExpenseClass = Literal["PS", "MOOE", "FE", "CO"]

_Z = Decimal("0.00")

# ══════════════════════════════════════════════════════════════════════════
# FundSource
# ══════════════════════════════════════════════════════════════════════════

class FundSourceCreate(BaseModel):
    fund_category: str        # e.g. "20% Development Fund"
    fund_name:     str        # e.g. "NTA – General Fund"
    description:   Optional[str] = None


class FundSourceUpdate(BaseModel):
    fund_category: Optional[str]  = None
    fund_name:     Optional[str]  = None
    description:   Optional[str]  = None
    is_active:     Optional[bool] = None


class FundSourceResponse(BaseModel):
    fund_source_id: UUID
    fund_category:  str
    fund_name:      str
    description:    Optional[str]
    is_active:      bool
    created_at:     datetime
    class Config:
        from_attributes = True


# ══════════════════════════════════════════════════════════════════════════
# Appropriation
# ══════════════════════════════════════════════════════════════════════════

class AppropriationCreate(BaseModel):
    project_aip_id:     UUID
    ao_number:          str              # e.g. "AO-2026-001"
    fiscal_year:        str              # e.g. "2026"
    appropriation_date: Optional[date] = None
    is_continuing:      bool = False
    remarks:            Optional[str] = None


class AppropriationUpdate(BaseModel):
    ao_number:          Optional[str]  = None
    appropriation_date: Optional[date] = None
    is_continuing:      Optional[bool] = None
    remarks:            Optional[str]  = None
    is_active:          Optional[bool] = None


class AppropriationResponse(BaseModel):
    appropriation_id:   UUID
    project_aip_id:     UUID
    ao_number:          str
    fiscal_year:        str
    appropriation_date: Optional[date]
    is_continuing:      bool
    remarks:            Optional[str]
    is_active:          bool
    created_at:         datetime
    class Config:
        from_attributes = True


# ══════════════════════════════════════════════════════════════════════════
# AppropriationFundSource
# ══════════════════════════════════════════════════════════════════════════

class AppropriationFundSourceCreate(BaseModel):
    appropriation_id:    UUID
    fund_source_id:      UUID
    expense_class:       ExpenseClass
    appropriated_amount: Decimal

    @field_validator("appropriated_amount")
    @classmethod
    def positive_amount(cls, v: Decimal) -> Decimal:
        validate_money_scale(v, "appropriated_amount")
        if v <= _Z:
            raise ValueError("appropriated_amount must be greater than zero.")
        return v


class AppropriationFundSourceUpdate(BaseModel):
    """
    Only the ceiling can be adjusted downward — but never below
    the total already allotted (enforced in the service layer).
    """
    appropriated_amount: Optional[Decimal] = None

    @field_validator("appropriated_amount")
    @classmethod
    def positive_amount(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        validate_money_scale(v, "appropriated_amount")
        if v is not None and v <= _Z:
            raise ValueError("appropriated_amount must be greater than zero.")
        return v


class AppropriationFundSourceResponse(BaseModel):
    appr_fund_source_id: UUID
    appropriation_id:    UUID
    fund_source_id:      UUID
    expense_class:       str
    appropriated_amount: Optional[Decimal]
    created_at:          datetime
    class Config:
        from_attributes = True


# ══════════════════════════════════════════════════════════════════════════
# Financial Summary (project-level dashboard data)
# ══════════════════════════════════════════════════════════════════════════

class ExpenseClassLine(BaseModel):
    """One row in the four-way financial tracking table."""
    expense_class:  str
    appropriated:   Decimal
    allotted:       Decimal
    obligated:      Decimal
    disbursed:      Decimal
    unallotted:     Decimal   # appropriated − allotted
    unobligated:    Decimal   # allotted − obligated
    accounts_payable: Decimal # obligated − disbursed


class ProjectFinancialSummary(BaseModel):
    project_id:    UUID
    project_code:  str
    lines:         List[ExpenseClassLine]   # one per expense class
    total_appropriated:    Decimal
    total_allotted:        Decimal
    total_obligated:       Decimal
    total_disbursed:       Decimal
    total_unallotted:      Decimal
    total_unobligated:     Decimal
    total_accounts_payable: Decimal


class FinanceLedgerFundSource(BaseModel):
    appr_fund_source_id: UUID
    appropriation_id: UUID
    fund_source_id: UUID
    fund_category: str
    fund_name: str
    expense_class: str
    appropriated_amount: Decimal
    allotted_total: Decimal
    available_for_allotment: Decimal
    created_by_name: Optional[str] = None


class FinanceLedgerAllotment(BaseModel):
    allotment_id: UUID
    appr_fund_source_id: UUID
    aro_number: str
    amount_released: Decimal
    release_date: date
    remarks: Optional[str] = None
    obligated_total: Decimal
    free_balance: Decimal
    released_by_name: Optional[str] = None


class FinanceLedgerObligation(BaseModel):
    obligation_id: UUID
    allotment_id: UUID
    payee: str
    reference_document: str
    obligation_amount: Decimal
    obligation_date: date
    remarks: Optional[str] = None
    disbursed_total: Decimal
    unpaid_balance: Decimal
    created_by_name: Optional[str] = None


class FinanceLedgerDisbursement(BaseModel):
    disbursement_id: UUID
    obligation_id: UUID
    payment_method: str
    reference_number: Optional[str] = None
    disbursement_amount: Decimal
    disbursement_date: date
    remarks: Optional[str] = None
    created_by_name: Optional[str] = None


class ProjectFinancialLedger(BaseModel):
    project_id: UUID
    fund_sources: List[FinanceLedgerFundSource]
    allotments: List[FinanceLedgerAllotment]
    obligations: List[FinanceLedgerObligation]
    disbursements: List[FinanceLedgerDisbursement]
