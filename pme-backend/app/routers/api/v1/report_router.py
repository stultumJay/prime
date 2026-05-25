from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from uuid import UUID
from typing import Optional
from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import UserAccount

from app.services.report_service import (
    get_budget_utilization_report,
    get_project_summary_report,
    get_sector_summary_report,
    get_office_performance_report,
    )

router = APIRouter(prefix="/reports", tags=["Reports"])

@router.get("/projects-summary")
def project_summary(
    fiscal_year: int,
    up_to_date: Optional[date] = Query(
        None,
        description="Optional cumulative cutoff date for month-aware monitoring reports.",
    ),
    db: Session = Depends(get_db),
    _: UserAccount = Depends(get_current_user),
):
    """
    This route returns the project summary data the caller asked for
    """
    return get_project_summary_report(db, fiscal_year, up_to_date=up_to_date)


@router.get("/budget-utilization")
def budget_utilization(
    fiscal_year: int,
    db: Session = Depends(get_db),
    _: UserAccount = Depends(get_current_user),
):
    """
    This route returns budget utilization against approved appropriations.
    """
    return get_budget_utilization_report(db, fiscal_year)


@router.get("/sector-summary")
def sector_summary(
    fiscal_year: int,
    db: Session = Depends(get_db),
    _: UserAccount = Depends(get_current_user),
):
    """
    This route returns the sector summary data the caller asked for
    """
    return get_sector_summary_report(db, fiscal_year)


@router.get("/office-performance")
def office_performance(
    office_id: UUID,
    fiscal_year: int,
    db: Session = Depends(get_db),
    _: UserAccount = Depends(get_current_user),
):
    """
    This route returns the office performance data the caller asked for
    """
    return get_office_performance_report(db, office_id, fiscal_year)
