from uuid import UUID
from typing import List, Optional
from datetime import date

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import UserAccount

from app.schemas.project import (
    ProjectCreate,
    ProjectUpdate,
    ProjectOut as ProjectResponse,
)
from app.schemas.issue import IssueCreate
from app.schemas.progress import ProgressCreate, ProgressUpdate

from app.services.project_document_service import get_project_documents
from app.services.project_clearance_service import get_project_clearance

from app.schemas.project_detail import ProjectDetailResponse

from app.services import project_service
from app.services.project_detail_service import (
    get_project_detail,
    get_project_financial_by_year,
    get_project_physical_progress,
    get_aip_years,
    get_full_project_view,
    upsert_project_phase_dates,
)

from app.services import issue_service, progress_service

router = APIRouter(prefix="/projects", tags=["Projects"])


class ProjectPhaseDateUpdate(BaseModel):
    planned_start: Optional[date] = None
    planned_end: Optional[date] = None


# CREATE
@router.post("/", response_model=ProjectResponse, status_code=201)
def create_project(
    data: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
):
    """
    This route creates the create project flow and passes the request into the service layer
    It expects program_id as UUID, sector_id as UUID, office_id as UUID, and project_title as str
    It can also receive project_description as Optional[str], barangay as Optional[str], street as Optional[str], location_lat as Optional[float], location_lng as Optional[float], expected_start_date as Optional[date], expected_end_date as Optional[date], and locational_clearance_status as bool
    """
    return project_service.create_project(db, data, current_user)


# FIND
@router.get("/find", response_model=List[ProjectResponse])
def find_projects(
    sector_id: Optional[UUID] = None,
    fiscal_year: Optional[int] = None,
    office_id: Optional[UUID] = None,
    status: Optional[str] = None,
    q: Optional[str] = None,
    in_aip_fy: Optional[int] = None,
    page: int = 1,
    size: int = 50,
    db: Session = Depends(get_db),
    _: UserAccount = Depends(get_current_user),
):
    """
    This route returns the find projects data the caller asked for
    """
    return project_service.find_projects(
        db,
        sector_id=sector_id,
        fiscal_year=fiscal_year,
        office_id=office_id,
        status=status,
        q=q,
        in_aip_fy=in_aip_fy,
        skip=(page - 1) * size,
        limit=size,
    )


# LIST
@router.get("/", response_model=List[ProjectResponse])
def list_projects(
    page: int = 1,
    size: int = 50,
    db: Session = Depends(get_db),
    _: UserAccount = Depends(get_current_user),
):
    """
    This route returns the list projects data the caller asked for
    """
    return project_service.get_projects(
        db,
        skip=(page - 1) * size,
        limit=size,
    )


# SINGLE
@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: UUID,
    db: Session = Depends(get_db),
    _: UserAccount = Depends(get_current_user),
):
    """
    This route returns the get project data the caller asked for
    """
    return ProjectResponse.model_validate(
        project_service.get_project_by_id(db, project_id)
    )


@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: UUID,
    data: ProjectUpdate,
    db: Session = Depends(get_db),
    _: UserAccount = Depends(get_current_user),
):
    """
    This route updates the update project flow and passes the request into the service layer
    It can also receive project_title as Optional[str], project_description as Optional[str], sector_id as Optional[UUID], barangay as Optional[str], street as Optional[str], location_lat as Optional[float], location_lng as Optional[float], expected_start_date as Optional[date], expected_end_date as Optional[date], actual_start_date as Optional[date], actual_end_date as Optional[date], status as Optional[str], is_integrated as Optional[bool], and locational_clearance_status as Optional[bool]
    """
    return project_service.update_project(db, project_id, data)


# DETAIL
@router.get("/{project_id}/detail", response_model=ProjectDetailResponse)
def project_detail(
    project_id: UUID,
    db: Session = Depends(get_db),
    _: UserAccount = Depends(get_current_user),
):
    """
    This route returns the project detail data the caller asked for
    """
    return get_project_detail(db, project_id)



# FINANCIALS
@router.get("/{project_id}/financials")
def financials(
    project_id: UUID,
    year: int,
    db: Session = Depends(get_db),
    _: UserAccount = Depends(get_current_user),
):
    """
    This route returns the financials data the caller asked for
    """
    return get_project_financial_by_year(db, project_id, year)


# PROGRESS
@router.get("/{project_id}/progress")
def progress(
    project_id: UUID,
    db: Session = Depends(get_db),
    _: UserAccount = Depends(get_current_user),
):
    """
    This route returns the progress data the caller asked for
    """
    return get_project_physical_progress(db, project_id)


# AIP YEARS
@router.get("/{project_id}/aip-years")
def aip_years(
    project_id: UUID,
    db: Session = Depends(get_db),
    _: UserAccount = Depends(get_current_user),
):
    """
    This route returns the aip years data the caller asked for
    """
    return get_aip_years(db, project_id)


@router.put("/{project_id}/timeline/{phase_name}")
def update_project_phase_dates(
    project_id: UUID,
    phase_name: str,
    payload: ProjectPhaseDateUpdate,
    db: Session = Depends(get_db),
    _: UserAccount = Depends(get_current_user),
):
    """
    This route updates the update project phase dates flow and passes the request into the service layer
    It can also receive planned_start as date and planned_end as date
    """
    return upsert_project_phase_dates(
        db,
        project_id,
        phase_name,
        payload.planned_start,
        payload.planned_end,
    )



# ─────────────────────────────────────────────
# FULL PROJECT VIEW (FRONTEND MAIN ENDPOINT)
# ─────────────────────────────────────────────
@router.get("/{project_id}/full")
def full_project_view(
    project_id: UUID,
    year: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(get_current_user),
):
    """
    This route returns the full project view data the caller asked for
    """
    return get_full_project_view(db, project_id, year)


# ─────────────────────────────
# DOCUMENTS
# ─────────────────────────────
@router.get("/{project_id}/documents")
def project_documents(
    project_id: UUID,
    db: Session = Depends(get_db),
    _: UserAccount = Depends(get_current_user),
):
    """
    Return project document files.
    """
    project = project_service.get_project_by_id(db, project_id)
    document_id = getattr(project, "dtn_no", None)
    documents = get_project_documents(document_id)

    return {
        "project_id": str(project_id),
        "document_id": document_id,
        "valid": len(documents) > 0,
        "documents": documents,
    }

class ProjectDtnUpdate(BaseModel):
    dtn_no: str

@router.put("/{project_id}/dtn", response_model=ProjectResponse)
def set_project_dtn(
    project_id: UUID,
    payload: ProjectDtnUpdate,
    db: Session = Depends(get_db),
    _: UserAccount = Depends(get_current_user),
):
    """
    Save the DTS document tracking number used for document file lookup.
    """
    return project_service.set_project_dtn(db, project_id, payload.dtn_no)


# ─────────────────────────────
# CLEARANCE
# ─────────────────────────────
@router.get("/{project_id}/locational-clearance")
def project_clearance(
    project_id: UUID,
    _: UserAccount = Depends(get_current_user),
):
    """
    This route returns the project clearance data the caller asked for
    """
    return get_project_clearance(project_id)
