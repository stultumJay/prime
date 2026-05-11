from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime
from uuid import UUID
    
class ProjectDocument(BaseModel):
    id: Optional[str] = None
    document_id: str
    document_name: Optional[str] = None
    document_url: str
    uploaded_at: Optional[datetime] = None
    uploaded_by: Optional[str] = None


class LocationalClearance(BaseModel):
    is_clearanced: bool
    reference_no: Optional[str] = None
    checked_at: Optional[datetime] = None


class TimelinePhase(BaseModel):
    phase_name: str
    planned_start: Optional[date]
    planned_end: Optional[date]
    actual_start: Optional[date]
    actual_end: Optional[date]
    status: Optional[str]


class IssueSummary(BaseModel):
    total: int
    open: int
    resolved: int


class IssueItem(BaseModel):
    issue_id: UUID
    issue_title: str
    severity: str
    reported_at: Optional[date]
    resolved: bool


class ProjectDetailBrief(BaseModel):
    project_id: UUID
    project_title: str
    status: str
    project_code: Optional[str] = None


class ProjectFiscalYear(BaseModel):
    fiscal_year: int
    project_aip_id: UUID


class ProjectDetailResponse(BaseModel):
    project: ProjectDetailBrief
    fiscal_years: List[ProjectFiscalYear]
    issues: List[IssueItem]
    issue_summary: IssueSummary
    timeline: List[TimelinePhase]
    documents: List[ProjectDocument]
    locational_clearance: LocationalClearance