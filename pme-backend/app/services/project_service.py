from datetime import date
from sqlalchemy.orm import Session, subqueryload
from sqlalchemy import or_
from fastapi import HTTPException
from typing import List, Optional
from uuid import UUID

from app.models.project import Project
from app.models.program import Program
from app.models.project_aip import ProjectAIP
from app.models.sector import Sector
from app.models.office import Office
from app.models.user import UserAccount
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectOut as ProjectResponse
from app.services.project_status_service import recompute_project_status
from app.utils.aip_code import next_project_seq, format_project_code
from app.utils.location_rules import validate_project_location


def create_project(
    db: Session,
    data: ProjectCreate,
    current_user: UserAccount,
) -> ProjectResponse:
    """
    This creates a new project after checking that its program, sector, and office all exist
    It also builds the yearly project code before saving the row and returning the full response shape
    """
    # A project cannot exist on its own, so the related program must be valid first
    if not db.query(Program).filter(
        Program.program_id == data.program_id,
        Program.is_active.is_(True),
    ).first():
        raise HTTPException(404, "Program not found or inactive.")

    # Sector and office links are checked separately so the error message stays clear
    if not db.query(Sector).filter(Sector.sector_id == data.sector_id).first():
        raise HTTPException(404, "Sector not found.")

    if not db.query(Office).filter(Office.office_id == data.office_id).first():
        raise HTTPException(404, "Office not found.")

    validate_project_location(data.barangay, data.location_lat, data.location_lng)

    # The project code comes from the current year plus the next sequence number for that year
    fiscal_year  = date.today().year
    seq          = next_project_seq(db, fiscal_year)
    project_code = format_project_code(fiscal_year, seq)

    # This row starts in a planned and not yet integrated state until an AIP entry is added later
    project = Project(
        program_id          = data.program_id,
        sector_id           = data.sector_id,
        office_id           = data.office_id,
        fiscal_year         = str(fiscal_year),
        project_code        = project_code,
        project_title       = data.project_title,
        project_description = data.project_description,
        barangay            = data.barangay,
        street              = data.street,
        location_lat        = data.location_lat,
        location_lng        = data.location_lng,
        status              = "planned",
        is_integrated       = False,
        locational_clearance_status = False,
        expected_start_date = data.expected_start_date,
        expected_end_date   = data.expected_end_date,
        created_by          = current_user.user_id,
        is_active           = True,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return _load_response(db, project.project_id)


def get_projects(
    db: Session,
    skip: int = 0,
    limit: int = 50,
) -> List[ProjectResponse]:
    """
    This gets the projects data the caller asked for
    It applies the needed lookup rules and returns the result in the shape the next layer expects
    """
    projects = (
        db.query(Project)
        .options(
            subqueryload(Project.program),
            subqueryload(Project.sector),
            subqueryload(Project.office),
        )
        .filter(Project.is_active.is_(True))
        .order_by(Project.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    for project in projects:
        recompute_project_status(db, project)
    db.commit()
    return [ProjectResponse.model_validate(p) for p in projects]


def get_project_by_id(db: Session, project_id: UUID) -> Project:
    """
    This gets the project by id data the caller asked for
    It applies the needed lookup rules and returns the result in the shape the next layer expects
    """
    project = db.query(Project).filter(
        Project.project_id == project_id,
        Project.is_active.is_(True),
    ).first()
    if not project:
        raise HTTPException(404, "Project not found.")
    recompute_project_status(db, project, commit=True)
    return project


def find_projects(
    db: Session,
    sector_id:   Optional[UUID] = None,
    fiscal_year: Optional[int]  = None,
    office_id:   Optional[UUID] = None,
    status:      Optional[str]  = None,
    q:           Optional[str]  = None,
    in_aip_fy:   Optional[int]  = None,
    skip:        int = 0,
    limit:       int = 50,
) -> List[ProjectResponse]:
    """
    This filters the active projects using whichever search fields the caller actually sent
    It keeps stacking filters on one query so the caller can combine sector, office, year, status, text, and AIP membership
    """
    if status:
        active_projects = db.query(Project).filter(Project.is_active.is_(True)).all()
        for project in active_projects:
            recompute_project_status(db, project)
        db.commit()

    query = db.query(Project).filter(Project.is_active.is_(True))

    # Each filter only runs when the caller provided that specific search value
    if sector_id:
        query = query.filter(Project.sector_id == sector_id)
    if fiscal_year:
        query = query.filter(Project.fiscal_year == str(fiscal_year))
    if office_id:
        query = query.filter(Project.office_id == office_id)
    if status:
        query = query.filter(Project.status == status)
    if q:
        query = query.filter(Project.project_title.ilike(f"%{q}%"))
    if in_aip_fy is not None:
        # This subquery narrows the project list to rows that already appear in the chosen AIP year
        aip_project_ids = (
            db.query(ProjectAIP.project_id)
            .filter(
                ProjectAIP.fiscal_year == in_aip_fy,
                ProjectAIP.is_active.is_(True),
            )
            .subquery()
        )
        query = query.filter(Project.project_id.in_(aip_project_ids))

    projects = (
        query.options(
            subqueryload(Project.program),
            subqueryload(Project.sector),
            subqueryload(Project.office),
        )
        .order_by(Project.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    for project in projects:
        recompute_project_status(db, project)
    db.commit()
    return [ProjectResponse.model_validate(p) for p in projects]


def update_project(
    db: Session,
    project_id: UUID,
    data: ProjectUpdate,
) -> ProjectResponse:
    """
    This updates the project using only the fields that were actually sent by the caller
    It also rechecks the sector when the project is being moved to a different one
    """
    project = get_project_by_id(db, project_id)

    if data.sector_id and data.sector_id != project.sector_id:
        # FIX: Sector has no is_active column — just check existence
        if not db.query(Sector).filter(Sector.sector_id == data.sector_id).first():
            raise HTTPException(404, "Sector not found.")

    next_values = data.model_dump(exclude_unset=True)
    next_values.pop("status", None)
    next_values.pop("actual_start_date", None)
    next_values.pop("actual_end_date", None)
    validate_project_location(
        next_values.get("barangay", project.barangay),
        next_values.get("location_lat", project.location_lat),
        next_values.get("location_lng", project.location_lng),
    )
    expected_start = next_values.get("expected_start_date", project.expected_start_date)
    expected_end = next_values.get("expected_end_date", project.expected_end_date)
    if expected_start and expected_end and expected_end < expected_start:
        raise HTTPException(400, "Expected end date must not be earlier than expected start date.")

    # exclude_unset keeps existing values untouched when a field was not included in the request
    for field, value in next_values.items():
        setattr(project, field, value)

    recompute_project_status(db, project)
    db.commit()
    return _load_response(db, project_id)


def set_project_dtn(db: Session, project_id: UUID, dtn_no: str) -> ProjectResponse:
    """
    Saves the document tracking number used for external document lookup.
    """
    project = get_project_by_id(db, project_id)
    project.dtn_no = dtn_no.strip() if dtn_no else None
    db.commit()
    return _load_response(db, project_id)


def delete_project(db: Session, project_id: UUID) -> dict:
    """
    This removes or deactivates the project record
    It loads the current row first so the service can return a clear error when the record is missing
    """
    project = get_project_by_id(db, project_id)
    project.is_active = False
    db.commit()
    return {"detail": f"Project '{project.project_code}' deactivated."}


def _load_response(db: Session, project_id: UUID) -> ProjectResponse:
    """
    This reloads the project together with its related program, sector, and office
    That gives the router the richer response shape the frontend expects
    """
    project = (
        db.query(Project)
        .options(
            subqueryload(Project.program),
            subqueryload(Project.sector),
            subqueryload(Project.office),
        )
        .filter(Project.project_id == project_id)
        .first()
    )
    recompute_project_status(db, project, commit=True)
    return ProjectResponse.model_validate(project)
