from decimal import Decimal
from typing import Optional, List, Dict
from datetime import date
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, select

from app.models.project import Project
from app.models.project_aip import ProjectAIP
from app.models.performance import Performance
from app.models.progress import Progress
from app.models.phase_config import PhaseConfig
from app.models.project_phase import ProjectPhase
from app.models.finance import Appropriation, AppropriationFundSource
from app.models.allotment import Allotment
from app.models.obligation import Obligation
from app.models.disbursement import Disbursement
from app.models.issue import Issue
from app.models.user import UserAccount

from app.services.project_document_service import get_project_documents
from app.services.project_status_service import recompute_project_status
from app.integrations.locational_clearance_client import check_clearance


_Z = Decimal("0.00")


# ─────────────────────────────────────────────
# INTERNAL
# ─────────────────────────────────────────────
def _ensure_project(db: Session, project_id: UUID) -> Project:
    """
    This helper loads the record needed by the next step
    It stops early with a clear not found error when the record does not exist
    """
    # This helper is reused by the different detail views so they all fail the same way on a missing project
    project = db.query(Project).filter(
        Project.project_id == project_id,
        Project.is_active.is_(True),
    ).first()

    if not project:
        raise HTTPException(404, "Project not found.")
    recompute_project_status(db, project, commit=True)
    return project


# ─────────────────────────────────────────────
# BASIC DETAIL
# ─────────────────────────────────────────────
def get_project_detail(db: Session, project_id: UUID):
    """
    This gets the project detail data the caller asked for
    It applies the needed lookup rules and returns the result in the shape the next layer expects
    """
    # This is the safe overview endpoint, so each side section is loaded carefully and allowed to fail softly when needed
    project = _ensure_project(db, project_id)

    # ─────────────────────────────
    # Issues Summary
    # ─────────────────────────────
    # Issues are turned into a lightweight shape so the frontend can show counts and short summaries quickly
    issue_rows = db.query(Issue).filter(Issue.project_id == project_id).all()

    issues = [
        {
            "issue_id": i.issue_id,
            "issue_title": i.issue_name,
            "severity": i.issue_category,
            "reported_at": i.date_reported,
            "resolved": i.status == "resolved",
            "created_at": getattr(i, "date_reported", None),
        }
        for i in issue_rows
    ]

    total_issues = len(issue_rows)
    resolved = len([i for i in issue_rows if i.status == "resolved"])
    open_issues = total_issues - resolved

    # ─────────────────────────────
    # Timeline
    # ─────────────────────────────
    # Timeline rows come from the bridge table plus the phase setup so names and dates can be shown together
    phases = (
        db.query(ProjectPhase, PhaseConfig)
        .join(PhaseConfig, PhaseConfig.phase_id == ProjectPhase.phase_id)
        .filter(ProjectPhase.project_id == project_id)
        .all()
    )

    timeline = [
        {
            "phase_name": cfg.phase_name,
            "planned_start": p.planned_start,
            "planned_end": p.planned_end,
            "actual_start": p.actual_start,
            "actual_end": p.actual_end,
            "status": p.status,
        }
        for p, cfg in phases
    ]

    # ─────────────────────────────
    # Documents
    # ─────────────────────────────
    # Document loading uses a safe fallback because document services should not break the whole detail page
    try:
        documents = get_project_documents(getattr(project, "dtn_no", None))
        if not isinstance(documents, list):
            documents = []
    except Exception:
        documents = []

    # ─────────────────────────────
    # LOCATIONAL CLEARANCE
    # ─────────────────────────────
    clearance = {
        "is_clearanced": False,
        "reference_no": None,
        "checked_at": None,
    }

    # The external clearance check only runs when the project is not already marked cleared in local data
    if not getattr(project, "locational_clearance_status", False):
        try:
            result = check_clearance(str(project_id))

            if result.get("is_clearanced"):
                # When the outside system confirms clearance, save the result locally so later reads stay fast
                project.locational_clearance_status = True
                project.locational_clearance_reference_no = result.get("reference_no")
                project.locational_clearance_checked_at = result.get("checked_at")
                db.commit()

                clearance = result
            else:
                # stays false, no crash
                clearance = result

        except Exception:
            # external system down → DO NOT BREAK SYSTEM
            clearance = {
                "is_clearanced": False,
                "reference_no": None,
                "checked_at": None,
            }

    else:
        # already approved → use stored values, no API call
        clearance = {
            "is_clearanced": True,
            "reference_no": getattr(project, "locational_clearance_reference_no", None),
            "checked_at": getattr(project, "locational_clearance_checked_at", None),
        }

    # ─────────────────────────────
    # Fiscal Years
    # ─────────────────────────────
    fiscal_years = get_aip_years(db, project_id)
    aip_contexts = get_aip_contexts(db, project_id)

    return {
        "project": {
            "project_id": project.project_id,
            "project_title": project.project_title,
            "status": project.status,
        },
        "fiscal_years": fiscal_years,
        "aip_contexts": aip_contexts,
        "issues": issues,
        "issue_summary": {
            "total": total_issues,
            "open": open_issues,
            "resolved": resolved,
        },
        "timeline": timeline,
        "documents": documents,
        "locational_clearance": clearance,
    }


# ─────────────────────────────────────────────
# FINANCIALS
# ─────────────────────────────────────────────
def get_project_financial_by_year(db: Session, project_id: UUID, fiscal_year: int):
    """
    This gets the project financial by year data the caller asked for
    It applies the needed lookup rules and returns the result in the shape the next layer expects
    """
    # This view follows one project through one fiscal year so the frontend can compare planned and spent values
    _ensure_project(db, project_id)

    aip = db.query(ProjectAIP).filter(
        ProjectAIP.project_id == project_id,
        ProjectAIP.fiscal_year == fiscal_year,
        ProjectAIP.is_active.is_(True),
    ).first()

    if not aip:
        raise HTTPException(404, "AIP entry not found for that fiscal year.")

    # These chained subqueries mirror the real money flow from appropriation down to disbursement
    afs_ids = (
        select(AppropriationFundSource.appr_fund_source_id)
        .join(Appropriation, AppropriationFundSource.appropriation_id == Appropriation.appropriation_id)
        .where(
            Appropriation.project_aip_id == aip.project_aip_id,
            Appropriation.is_active.is_(True),
        )
    )

    appropriation = db.query(
        func.coalesce(func.sum(AppropriationFundSource.appropriated_amount), _Z)
    ).filter(AppropriationFundSource.appr_fund_source_id.in_(afs_ids)).scalar() or _Z

    allot_ids = select(Allotment.allotment_id).where(Allotment.appr_fund_source_id.in_(afs_ids))

    allotted = db.query(
        func.coalesce(func.sum(Allotment.amount_released), _Z)
    ).filter(Allotment.allotment_id.in_(allot_ids)).scalar() or _Z

    oblig_ids = select(Obligation.obligation_id).where(Obligation.allotment_id.in_(allot_ids))

    obligated = db.query(
        func.coalesce(func.sum(Obligation.obligation_amount), _Z)
    ).filter(Obligation.obligation_id.in_(oblig_ids)).scalar() or _Z

    disbursed = db.query(
        func.coalesce(func.sum(Disbursement.disbursement_amount), _Z)
    ).filter(Disbursement.obligation_id.in_(oblig_ids)).scalar() or _Z

    return {
        "fiscal_year": fiscal_year,
        "appropriation": appropriation,
        "allotted": allotted,
        "obligated": obligated,
        "disbursement": disbursed,
        "balance": appropriation - disbursed,
    }


# ─────────────────────────────────────────────
# PHYSICAL PROGRESS
# ─────────────────────────────────────────────
def get_project_physical_progress(db: Session, project_id: UUID):
    """
    This gets the project physical progress data the caller asked for
    It applies the needed lookup rules and returns the result in the shape the next layer expects
    """
    _ensure_project(db, project_id)

    phases = db.query(PhaseConfig).all()

    rows = []
    for p in phases:
        latest = (
            db.query(Progress)
            .filter(
                Progress.project_id == project_id,
                Progress.phase_id == p.phase_id,
            )
            .order_by(Progress.logged_at.desc())
            .first()
        )
        logged_by_name = None
        if latest and latest.logged_by:
            logged_by_name = (
                db.query(UserAccount.full_name)
                .filter(UserAccount.user_id == latest.logged_by)
                .scalar()
            )

        rows.append({
            "phase": p.phase_name,
            "percent": float(latest.new_percent if latest else 0),
            "progress_id": latest.progress_id if latest else None,
            "created_at": latest.logged_at if latest else None,
            "performed_by_name": logged_by_name,
        })

    return rows


# ─────────────────────────────────────────────
# AIP YEARS
# ─────────────────────────────────────────────
def get_aip_years(db: Session, project_id: UUID):
    """
    This gets the aip years data the caller asked for
    It applies the needed lookup rules and returns the result in the shape the next layer expects
    """
    _ensure_project(db, project_id)

    rows = (
        db.query(ProjectAIP.fiscal_year, ProjectAIP.project_aip_id)
        .filter(
            ProjectAIP.project_id == project_id,
            ProjectAIP.is_active.is_(True),
        )
        .order_by(ProjectAIP.fiscal_year.desc())
        .all()
    )

    return [
        {"fiscal_year": fy, "project_aip_id": pid}
        for fy, pid in rows
    ]


def get_aip_contexts(db: Session, project_id: UUID):
    """
    This gets the aip contexts data the caller asked for
    It applies the needed lookup rules and returns the result in the shape the next layer expects
    """
    # This keeps one response per AIP year and pulls the linked performance values beside it
    _ensure_project(db, project_id)

    rows = (
        db.query(ProjectAIP)
        .join(Performance, Performance.performance_id == ProjectAIP.performance_id, isouter=True)
        .filter(
            ProjectAIP.project_id == project_id,
            ProjectAIP.is_active.is_(True),
        )
        .order_by(ProjectAIP.fiscal_year.desc())
        .all()
    )

    return [
        {
            "project_aip_id": row.project_aip_id,
            "fiscal_year": row.fiscal_year,
            "aip_reference_code": row.aip_reference_code,
            "performance_id": row.performance_id,
            "performance": {
                "performance_indicator": row.performance.performance_indicator if row.performance else None,
                "target_total": row.performance.target_total if row.performance else 0,
                "target_q1": row.performance.target_q1 if row.performance else 0,
                "target_q2": row.performance.target_q2 if row.performance else 0,
                "target_q3": row.performance.target_q3 if row.performance else 0,
                "target_q4": row.performance.target_q4 if row.performance else 0,
                "actual_q1": row.performance.actual_q1 if row.performance else 0,
                "actual_q2": row.performance.actual_q2 if row.performance else 0,
                "actual_q3": row.performance.actual_q3 if row.performance else 0,
                "actual_q4": row.performance.actual_q4 if row.performance else 0,
            },
        }
        for row in rows
    ]


def upsert_project_phase_dates(
    db: Session,
    project_id: UUID,
    phase_name: str,
    planned_start: Optional[date],
    planned_end: Optional[date],
):
    """
    This handles the upsert project phase dates flow for the backend
    It keeps the main steps together and returns the result the caller expects
    """
    # This either updates the existing project phase row or creates it first when that phase has not been scheduled yet
    _ensure_project(db, project_id)
    if planned_start and planned_end and planned_end < planned_start:
        raise HTTPException(400, "Phase end date must not be earlier than phase start date.")

    phase_config = db.query(PhaseConfig).filter(PhaseConfig.phase_name == phase_name).first()
    if not phase_config:
        raise HTTPException(404, f"Phase '{phase_name}' not found.")

    project_phase = db.query(ProjectPhase).filter(
        ProjectPhase.project_id == project_id,
        ProjectPhase.phase_id == phase_config.phase_id,
    ).first()

    if not project_phase:
        project_phase = ProjectPhase(
            project_id=project_id,
            phase_id=phase_config.phase_id,
        )
        db.add(project_phase)

    project_phase.planned_start = planned_start
    project_phase.planned_end = planned_end
    if planned_start and not project_phase.actual_start:
        project_phase.actual_start = planned_start

    db.commit()
    db.refresh(project_phase)

    return {
        "phase_name": phase_config.phase_name,
        "planned_start": project_phase.planned_start,
        "planned_end": project_phase.planned_end,
        "actual_start": project_phase.actual_start,
        "actual_end": project_phase.actual_end,
        "status": project_phase.status,
    }


# ─────────────────────────────────────────────
# FULL PROJECT VIEW
# ─────────────────────────────────────────────
def get_full_project_view(
    db: Session,
    project_id: UUID,
    fiscal_year: Optional[int] = None,
) -> dict:

    """
    This gets the full project view data the caller asked for
    It applies the needed lookup rules and returns the result in the shape the next layer expects
    """
    # This combines the safer detail pieces into one frontend friendly response and quietly skips broken financial reads
    detail = get_project_detail(db, project_id)

    fy_list = detail["fiscal_years"]
    selected_year = fiscal_year or (fy_list[0]["fiscal_year"] if fy_list else None)

    financials = None
    if selected_year:
        try:
            financials = get_project_financial_by_year(
                db, project_id, selected_year
            )
        except Exception:
            financials = None

    progress = get_project_physical_progress(db, project_id)

    return {
        "project": detail["project"],
        "fiscal_years": fy_list,
        "aip_contexts": detail["aip_contexts"],
        "selected_year": selected_year,
        "financials": financials,
        "physical_progress": progress,
        "timeline": detail["timeline"],
        "issues": detail["issue_summary"],
        "documents": detail["documents"],
        "locational_clearance": detail["locational_clearance"],
    }
