from __future__ import annotations

from decimal import Decimal
from typing import List, Optional
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, computed_field, field_validator
from app.utils.validation import validate_money_scale

_Z = Decimal("0.00")


# ── Nested read-only ───────────────────────────────────────────────────────

class PerformanceNested(BaseModel):
    performance_id:        UUID
    performance_indicator: Optional[str]
    target_total:          Optional[int]
    target_q1:             Optional[int]
    target_q2:             Optional[int]
    target_q3:             Optional[int]
    target_q4:             Optional[int]
    actual_q1:             Optional[int]
    actual_q2:             Optional[int]
    actual_q3:             Optional[int]
    actual_q4:             Optional[int]
    remarks:               Optional[str]
    class Config:
        from_attributes = True


class OfficeNested(BaseModel):
    office_id: UUID
    office_name: str

    class Config:
        from_attributes = True
        
class ProjectNested(BaseModel):
    project_id:          UUID
    project_code:        str
    project_title:       str
    project_description: Optional[str]
    
    office: Optional[OfficeNested]
    
    class Config:
        from_attributes = True


# ── Request: create ────────────────────────────────────────────────────────

class AIPCreate(BaseModel):
    project_id:  UUID
    fiscal_year: int

    major_final_output: str

    proposed_budget_ps:   Decimal = _Z
    proposed_budget_mooe: Decimal = _Z
    proposed_budget_fe:   Decimal = _Z
    proposed_budget_co:   Decimal = _Z

    # Performance — created atomically
    performance_indicator: str
    target_total:          int
    target_q1:             int = 0
    target_q2:             int = 0
    target_q3:             int = 0
    target_q4:             int = 0
    performance_remarks:   Optional[str] = None

    @field_validator("proposed_budget_ps", "proposed_budget_mooe", "proposed_budget_fe", "proposed_budget_co")
    @classmethod
    def validate_budget_scale(cls, v: Decimal) -> Decimal:
        validate_money_scale(v, "proposed_budget")
        return v


# ── Request: update ────────────────────────────────────────────────────────

class AIPUpdate(BaseModel):
    major_final_output: Optional[str] = None

    proposed_budget_ps:   Optional[Decimal] = None
    proposed_budget_mooe: Optional[Decimal] = None
    proposed_budget_fe:   Optional[Decimal] = None
    proposed_budget_co:   Optional[Decimal] = None

    performance_indicator: Optional[str] = None
    target_total:          Optional[int] = None
    target_q1:             Optional[int] = None
    target_q2:             Optional[int] = None
    target_q3:             Optional[int] = None
    target_q4:             Optional[int] = None
    actual_q1:             Optional[int] = None
    actual_q2:             Optional[int] = None
    actual_q3:             Optional[int] = None
    actual_q4:             Optional[int] = None
    performance_remarks:   Optional[str] = None

    @field_validator("proposed_budget_ps", "proposed_budget_mooe", "proposed_budget_fe", "proposed_budget_co")
    @classmethod
    def validate_budget_scale(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        validate_money_scale(v, "proposed_budget")
        return v


# ── Response ───────────────────────────────────────────────────────────────

class AIPResponse(BaseModel):
    project_aip_id:     UUID
    aip_reference_code: str
    fiscal_year:        int
    major_final_output: Optional[str]

    proposed_budget_ps:   Optional[Decimal]
    proposed_budget_mooe: Optional[Decimal]
    proposed_budget_fe:   Optional[Decimal]
    proposed_budget_co:   Optional[Decimal]

    @computed_field  # type: ignore[misc]
    @property
    def propose_budget_total(self) -> Decimal:
        return (
            (self.proposed_budget_ps   or _Z)
            + (self.proposed_budget_mooe or _Z)
            + (self.proposed_budget_fe   or _Z)
            + (self.proposed_budget_co   or _Z)
        )

    is_active:   bool
    created_at:  datetime
    updated_at:  Optional[datetime]
    project:     Optional[ProjectNested]
    performance: Optional[PerformanceNested]

    class Config:
        from_attributes = True


# ── LBP Form No. 4 ────────────────────────────────────────────────────────

class LBPForm4Row(BaseModel):
    """One row in the LBP Form No. 4 table (columns 1-10)."""
    aip_reference_code:     str            # col 1
    program_code:           str            # col 2 — PPA hierarchy
    program_name:           str
    project_code:           str
    project_title:          str
    project_description:    Optional[str]
    major_final_output:     Optional[str]  # col 3
    performance_indicator:  Optional[str]  # col 4
    target_for_budget_year: Optional[int]  # col 5
    target_q1:              Optional[int]
    target_q2:              Optional[int]
    target_q3:              Optional[int]
    target_q4:              Optional[int]
    proposed_budget_ps:      Decimal        # col 6
    proposed_budget_mooe:    Decimal        # col 7
    proposed_budget_fe:      Decimal        # col 8
    proposed_budget_co:      Decimal        # col 9
    proposed_budget_total:   Decimal        # col 10


class LBPForm4ProgramGroup(BaseModel):
    program_code:   str
    program_name:   str
    rows:           List[LBPForm4Row]
    subtotal_ps:    Decimal
    subtotal_mooe:  Decimal
    subtotal_fe:    Decimal
    subtotal_co:    Decimal
    subtotal_total: Decimal


class LBPForm4Response(BaseModel):
    fiscal_year:            int
    department_office:      str
    mandate:                Optional[str]
    vision:                 Optional[str]
    mission:                Optional[str]
    organizational_outcome: Optional[str]
    programs:               List[LBPForm4ProgramGroup]
    total_ps:               Decimal
    total_mooe:             Decimal
    total_fe:               Decimal
    total_co:               Decimal
    grand_total:            Decimal
