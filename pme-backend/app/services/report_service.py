from datetime import datetime, date
import calendar
from decimal import Decimal
from uuid import UUID
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.project import Project
from app.models.project_aip import ProjectAIP
from app.models.performance import Performance
from app.models.program import Program
from app.models.sector import Sector
from app.models.office import Office
from app.models.progress import Progress
from app.models.finance import AppropriationFundSource, Appropriation, FundSource
from app.models.allotment import Allotment
from app.models.obligation import Obligation
from app.models.disbursement import Disbursement

_Z = Decimal("0.00")


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def _month_start(dt: datetime) -> datetime:
    return datetime(dt.year, dt.month, 1)


def _shift_month(start: datetime, offset: int) -> datetime:
    """
    Shift a first-of-month datetime by N months while keeping it pinned to day 1.
    """
    month_index = (start.year * 12 + (start.month - 1)) + offset
    year = month_index // 12
    month = (month_index % 12) + 1
    return datetime(year, month, 1)


def _month_bounds(dt: datetime) -> tuple[date, date]:
    """
    Returns inclusive date bounds for the given calendar month.
    """
    last_day = calendar.monthrange(dt.year, dt.month)[1]
    return date(dt.year, dt.month, 1), date(dt.year, dt.month, last_day)


def _financial_totals_for_aip_ids(
    db: Session,
    aip_ids_select,
    up_to_date: Optional[date] = None,
):
    """
    Walk: project_aip → appropriation → appr_fund_source → allotment → obligation → disbursement.
    Returns (allotted, obligated, disbursed).
    """
    appr_ids = select(Appropriation.appropriation_id).where(
        Appropriation.project_aip_id.in_(aip_ids_select),
        Appropriation.is_active.is_(True),
    )

    afs_ids = select(AppropriationFundSource.appr_fund_source_id).where(
        AppropriationFundSource.appropriation_id.in_(appr_ids)
    )

    allot_ids_all = select(Allotment.allotment_id).where(
        Allotment.appr_fund_source_id.in_(afs_ids)
    )
    allot_ids_for_allotted = allot_ids_all
    if up_to_date is not None:
        allot_ids_for_allotted = allot_ids_for_allotted.where(
            Allotment.release_date <= up_to_date
        )

    oblig_ids_all = select(Obligation.obligation_id).where(
        Obligation.allotment_id.in_(allot_ids_all)
    )
    oblig_ids_for_obligated = oblig_ids_all
    if up_to_date is not None:
        oblig_ids_for_obligated = oblig_ids_for_obligated.where(
            Obligation.obligation_date <= up_to_date
        )

    allotted = db.query(
        func.coalesce(func.sum(Allotment.amount_released), _Z)
    ).filter(Allotment.allotment_id.in_(allot_ids_for_allotted)).scalar() or _Z

    obligated = db.query(
        func.coalesce(func.sum(Obligation.obligation_amount), _Z)
    ).filter(Obligation.obligation_id.in_(oblig_ids_for_obligated)).scalar() or _Z

    disbursed_query = db.query(
        func.coalesce(func.sum(Disbursement.disbursement_amount), _Z)
    ).filter(Disbursement.obligation_id.in_(oblig_ids_all))
    if up_to_date is not None:
        disbursed_query = disbursed_query.filter(
            Disbursement.disbursement_date <= up_to_date
        )
    disbursed = disbursed_query.scalar() or _Z

    return allotted, obligated, disbursed


def _financial_totals_for_fund_source_ids(db: Session, afs_ids_select):
    allot_ids = select(Allotment.allotment_id).where(
        Allotment.appr_fund_source_id.in_(afs_ids_select)
    )

    oblig_ids = select(Obligation.obligation_id).where(
        Obligation.allotment_id.in_(allot_ids)
    )

    allotted = db.query(
        func.coalesce(func.sum(Allotment.amount_released), _Z)
    ).filter(Allotment.allotment_id.in_(allot_ids)).scalar() or _Z

    obligated = db.query(
        func.coalesce(func.sum(Obligation.obligation_amount), _Z)
    ).filter(Obligation.obligation_id.in_(oblig_ids)).scalar() or _Z

    disbursed = db.query(
        func.coalesce(func.sum(Disbursement.disbursement_amount), _Z)
    ).filter(Disbursement.obligation_id.in_(oblig_ids)).scalar() or _Z

    return allotted, obligated, disbursed


# ─────────────────────────────────────────────
# LBP FORM NO. 4
# ─────────────────────────────────────────────
def generate_lbp_form_4(db: Session, office_id: UUID, fiscal_year: int):
    """
    This handles the generate lbp form 4 flow for the backend
    It keeps the main steps together and returns the result the caller expects
    """
    # The office header is loaded first because the report cannot be built without knowing which office owns it
    office = db.query(Office).filter(Office.office_id == office_id).first()
    if not office:
        raise HTTPException(404, "Office not found.")

    # Performance is joined here so the report can show both the target and the indicator beside each AIP row
    rows = (
        db.query(
            Sector.sector_name,
            Program.program_name,
            Program.program_code,
            ProjectAIP.aip_reference_code,
            Project.project_title,
            ProjectAIP.major_final_output,
            Performance.performance_indicator,
            Performance.target_total,
            ProjectAIP.proposed_budget_ps,
            ProjectAIP.proposed_budget_mooe,
            ProjectAIP.proposed_budget_fe,
            ProjectAIP.proposed_budget_co,
        )
        .join(Project,     Project.project_id         == ProjectAIP.project_id)
        .join(Program,     Program.program_id          == Project.program_id)
        .join(Sector,      Sector.sector_id            == Project.sector_id)
        .outerjoin(Performance, Performance.performance_id == ProjectAIP.performance_id)
        .filter(
            Project.office_id      == office_id,
            ProjectAIP.fiscal_year == fiscal_year,
            ProjectAIP.is_active.is_(True),
        )
        .order_by(Sector.sector_name, Program.program_code)
        .all()
    )

    # The result is grouped by sector and then by program so the report reads the same way the planning structure works
    result: dict = {}
    for r in rows:
        sector  = r.sector_name
        program = r.program_name

        if sector not in result:
            result[sector] = {}
        if program not in result[sector]:
            result[sector][program] = []

        total = (
            (r.proposed_budget_ps   or 0)
            + (r.proposed_budget_mooe or 0)
            + (r.proposed_budget_fe   or 0)
            + (r.proposed_budget_co   or 0)
        )

        result[sector][program].append({
            "aip_code":             r.aip_reference_code,
            "project_title":        r.project_title,
            "mfo":                  r.major_final_output,
            "performance_indicator": r.performance_indicator,
            "target":               r.target_total,
            "ps":                   r.proposed_budget_ps,
            "mooe":                 r.proposed_budget_mooe,
            "fe":                   r.proposed_budget_fe,
            "co":                   r.proposed_budget_co,
            "total":                total,
        })

    return {
        "office": {
            "name":    office.office_name,
            "mandate": office.mandate,
            "vision":  office.vision,
            "mission": office.mission,
            "outcome": office.organizational_outcome,
        },
        "fiscal_year": fiscal_year,
        "data": result,
    }


# ─────────────────────────────────────────────
# LBAc FORM NO. 3 – QUARTERLY PHYSICAL REPORT
# ─────────────────────────────────────────────

def generate_quarterly_physical_report(
    db:          Session,
    office_id:   UUID,
    fiscal_year: int,
    quarter:     int,
):
    """
    This handles the generate quarterly physical report flow for the backend
    It keeps the main steps together and returns the result the caller expects
    """
    # The chosen quarter decides which target and actual columns should be read from the performance row
    quarter_col = {
        1: Performance.target_q1,
        2: Performance.target_q2,
        3: Performance.target_q3,
        4: Performance.target_q4,
    }[quarter]

    actual_col = {
        1: Performance.actual_q1,
        2: Performance.actual_q2,
        3: Performance.actual_q3,
        4: Performance.actual_q4,
    }[quarter]

    rows = (
        db.query(
            ProjectAIP.aip_reference_code,
            Project.project_title,
            ProjectAIP.major_final_output,
            Performance.performance_indicator,
            quarter_col.label("target"),
            actual_col.label("actual"),
        )
        .join(Project,     Project.project_id          == ProjectAIP.project_id)
        .outerjoin(Performance, Performance.performance_id == ProjectAIP.performance_id)
        .filter(
            Project.office_id      == office_id,
            ProjectAIP.fiscal_year == fiscal_year,
            ProjectAIP.is_active.is_(True),
        )
        .all()
    )

    result = []
    for r in rows:
        target   = r.target   or 0
        actual   = r.actual   or 0
        variance = actual - target
        pct      = round((actual / target * 100), 2) if target else 0.0

        result.append({
            "ppa_code":  r.aip_reference_code,
            "project":   r.project_title,
            "mfo":       r.major_final_output,
            "indicator": r.performance_indicator,
            "target":    target,
            "actual":    actual,
            "variance":  variance,
            "percent":   pct,
            "remarks":   None,
        })

    return result


# ─────────────────────────────────────────────
# LBAc FORM NO. 5 – PHYSICAL & FINANCIAL PERF
# ─────────────────────────────────────────────

def generate_physical_financial_report(
    db:          Session,
    office_id:   UUID,
    fiscal_year: int,
    semester:    int,
):
    """
    This handles the generate physical financial report flow for the backend
    It keeps the main steps together and returns the result the caller expects
    """
    # A semester is just a pair of quarters, so we decide that pair first and then reuse the same query shape
    quarters = [1, 2] if semester == 1 else [3, 4]

    base_rows = (
        db.query(
            ProjectAIP.project_aip_id,
            ProjectAIP.aip_reference_code,
            Project.project_id,
            Project.project_title,
            Performance.target_total,
            Performance.actual_q1,
            Performance.actual_q2,
            Performance.actual_q3,
            Performance.actual_q4,
        )
        .join(Project,     Project.project_id          == ProjectAIP.project_id)
        .outerjoin(Performance, Performance.performance_id == ProjectAIP.performance_id)
        .filter(
            Project.office_id      == office_id,
            ProjectAIP.fiscal_year == fiscal_year,
            ProjectAIP.is_active.is_(True),
        )
        .all()
    )

    result = []
    for r in base_rows:
        # Physical: sum actual for the semester quarters
        if semester == 1:
            actual_progress = (r.actual_q1 or 0) + (r.actual_q2 or 0)
        else:
            actual_progress = (r.actual_q3 or 0) + (r.actual_q4 or 0)

        target = r.target_total or 0

        # The financial side is calculated from the exact AIP row so one project year does not leak into another year
        aip_ids_select = select(ProjectAIP.project_aip_id).where(
            ProjectAIP.project_aip_id == r.project_aip_id
        )

        allotted, obligated, _ = _financial_totals_for_aip_ids(db, aip_ids_select)

        variance   = actual_progress - target
        pct        = round((actual_progress / target * 100), 2) if target else 0.0
        absorptive = round((float(obligated) / float(allotted) * 100), 2) if allotted else 0.0

        result.append({
            "ppa_code":           r.aip_reference_code,
            "project":            r.project_title,
            "target":             target,
            "actual":             actual_progress,
            "variance":           variance,
            "percent":            pct,
            "allotment":          allotted,
            "obligation":         obligated,
            "absorptive_capacity": absorptive,
        })

    return result


# ─────────────────────────────────────────────
# REPORT ROUTER ENDPOINTS
# ─────────────────────────────────────────────

def get_project_summary_report(
    db: Session,
    fiscal_year: int,
    up_to_date: Optional[date] = None,
) -> list:
    """Project-level summary for the given fiscal year."""  
    rows = (
        db.query(
            Project.project_id,
            Project.project_code,
            Project.project_title,
            Project.status,
            Sector.sector_name,
            ProjectAIP.project_aip_id,
            ProjectAIP.proposed_budget_ps,
            ProjectAIP.proposed_budget_mooe,
            ProjectAIP.proposed_budget_fe,
            ProjectAIP.proposed_budget_co,
            Performance.target_total,
            Performance.target_q1,
            Performance.target_q2,
            Performance.target_q3,
            Performance.target_q4,
            Performance.actual_q1,
            Performance.actual_q2,
            Performance.actual_q3,
            Performance.actual_q4,
        )
        .join(ProjectAIP, ProjectAIP.project_id == Project.project_id)
        .join(Sector, Sector.sector_id == Project.sector_id)
        .outerjoin(Performance, Performance.performance_id == ProjectAIP.performance_id)
        .filter(
            ProjectAIP.fiscal_year == fiscal_year,
            ProjectAIP.is_active.is_(True),
        )
        .order_by(Sector.sector_name, Project.project_code)
        .all()
    )

    result = []
    for r in rows:
        aip_ids_select = select(ProjectAIP.project_aip_id).where(
            ProjectAIP.project_aip_id == r.project_aip_id
        )
        allotted, obligated, disbursed = _financial_totals_for_aip_ids(
            db,
            aip_ids_select,
            up_to_date=up_to_date,
        )

        approved_query = (
            db.query(
                func.coalesce(
                    func.sum(AppropriationFundSource.appropriated_amount),
                    _Z,
                )
            )
            .join(
                Appropriation,
                AppropriationFundSource.appropriation_id == Appropriation.appropriation_id,
            )
            .filter(
                Appropriation.project_aip_id == r.project_aip_id,
                Appropriation.is_active.is_(True),
            )
        )
        approved = approved_query.scalar() or _Z

        proposed = sum([
            Decimal(str(r.proposed_budget_ps   or 0)),
            Decimal(str(r.proposed_budget_mooe or 0)),
            Decimal(str(r.proposed_budget_fe   or 0)),
            Decimal(str(r.proposed_budget_co   or 0)),
        ])

        status = "in progress" if r.status in ("ongoing", "in_progress", "in progress") else r.status

        result.append({
            "project_code":  r.project_code,
            "project_title": r.project_title,
            "sector":        r.sector_name,
            "status":        r.status,
            "proposed":      proposed,
            "approved_appropriation": approved,
            "allotted":      allotted,
            "obligated":     obligated,
            "disbursed":     disbursed,
            "target_total": r.target_total or 0,
            "target_q1": r.target_q1 or 0,
            "target_q2": r.target_q2 or 0,
            "target_q3": r.target_q3 or 0,
            "target_q4": r.target_q4 or 0,
            "actual_q1": r.actual_q1 or 0,
            "actual_q2": r.actual_q2 or 0,
            "actual_q3": r.actual_q3 or 0,
            "actual_q4": r.actual_q4 or 0,
        })

    return result


def get_budget_utilization_report(db: Session, fiscal_year: int) -> dict:
    rows = (
        db.query(
            Project.project_code,
            Project.project_title,
            Sector.sector_name,
            FundSource.fund_name,
            AppropriationFundSource.appr_fund_source_id,
            AppropriationFundSource.appropriated_amount,
        )
        .join(ProjectAIP, ProjectAIP.project_id == Project.project_id)
        .join(Sector, Sector.sector_id == Project.sector_id)
        .join(Appropriation, Appropriation.project_aip_id == ProjectAIP.project_aip_id)
        .join(AppropriationFundSource, AppropriationFundSource.appropriation_id == Appropriation.appropriation_id)
        .join(FundSource, FundSource.fund_source_id == AppropriationFundSource.fund_source_id)
        .filter(
            ProjectAIP.fiscal_year == fiscal_year,
            ProjectAIP.is_active.is_(True),
            Appropriation.is_active.is_(True),
            FundSource.is_active.is_(True),
        )
        .order_by(Sector.sector_name, Project.project_code, FundSource.fund_name)
        .all()
    )

    records = []
    allocation_by_sector: dict[str, Decimal] = {}

    for r in rows:
        afs_ids_select = select(AppropriationFundSource.appr_fund_source_id).where(
            AppropriationFundSource.appr_fund_source_id == r.appr_fund_source_id
        )
        allotted, _, disbursed = _financial_totals_for_fund_source_ids(db, afs_ids_select)

        sector = r.sector_name or "Unassigned"
        allocation_by_sector[sector] = allocation_by_sector.get(sector, _Z) + allotted

        records.append({
            "project_code": r.project_code,
            "project_title": r.project_title,
            "sector": sector,
            "fund_source": r.fund_name,
            "appropriated": r.appropriated_amount or _Z,
            "allotted": allotted,
            "disbursed": disbursed,
        })

    return {
        "fiscal_year": fiscal_year,
        "records": records,
        "allocation": [
            {"sector": sector, "allotted": amount}
            for sector, amount in sorted(allocation_by_sector.items())
            if amount and amount > 0
        ],
    }


def get_sector_summary_report(db: Session, fiscal_year: int) -> list:
    """Aggregate financial totals grouped by sector."""
    sectors = db.query(Sector).order_by(Sector.sector_name).all()
    result  = []

    for sector in sectors:
        # This subquery gathers only the AIP rows that belong to the current sector and fiscal year
        aip_ids_select = (
            select(ProjectAIP.project_aip_id)
            .select_from(ProjectAIP)
            .join(Project, ProjectAIP.project_id == Project.project_id)
            .where(
                Project.sector_id      == sector.sector_id,
                ProjectAIP.fiscal_year == fiscal_year,
                ProjectAIP.is_active.is_(True),
            )
        )

        project_count = (
            db.query(func.count(Project.project_id))
            .join(ProjectAIP, ProjectAIP.project_id == Project.project_id)
            .filter(
                Project.sector_id      == sector.sector_id,
                ProjectAIP.fiscal_year == fiscal_year,
                ProjectAIP.is_active.is_(True),
            )
            .scalar() or 0
        )

        allotted, obligated, disbursed = _financial_totals_for_aip_ids(db, aip_ids_select)

        result.append({
            "sector":         sector.sector_name,
            "project_count":  project_count,
            "allotted":       allotted,
            "obligated":      obligated,
            "disbursed":      disbursed,
        })

    return result


def get_office_performance_report(db: Session, office_id: UUID, fiscal_year: int) -> dict:
    """Physical and financial performance summary for one office."""
    office = db.query(Office).filter(Office.office_id == office_id).first()
    if not office:
        from fastapi import HTTPException
        raise HTTPException(404, "Office not found.")

    aip_ids_select = (
        select(ProjectAIP.project_aip_id)
        .select_from(ProjectAIP)
        .join(Project, ProjectAIP.project_id == Project.project_id)
        .where(
            Project.office_id      == office_id,
            ProjectAIP.fiscal_year == fiscal_year,
            ProjectAIP.is_active.is_(True),
        )
    )

    allotted, obligated, disbursed = _financial_totals_for_aip_ids(db, aip_ids_select)

    project_count = (
        db.query(func.count(Project.project_id))
        .join(ProjectAIP, ProjectAIP.project_id == Project.project_id)
        .filter(
            Project.office_id      == office_id,
            ProjectAIP.fiscal_year == fiscal_year,
        )
        .scalar() or 0
    )

    utilization = (
        round(float(disbursed / allotted * 100), 2) if allotted else 0.0
    )

    return {
        "office_name":    office.office_name,
        "fiscal_year":    fiscal_year,
        "project_count":  project_count,
        "allotted":       allotted,
        "obligated":      obligated,
        "disbursed":      disbursed,
        "utilization_pct": utilization,
    }


# ─────────────────────────────────────────────
# FIXED 6-MONTH FINANCIAL TREND
# ─────────────────────────────────────────────
def get_budget_utilization(
    db: Session,
    fiscal_year: Optional[int] = None,
    months: int = 6,
    anchor_year: Optional[int] = None,
    anchor_month: Optional[int] = None,
) -> list:
    """
    Return a stable six-month allocation vs disbursement series.

    This version fixes the old drift-prone approach that subtracted 30-day chunks
    and queried raw date fields without respecting the project AIP chain.
    """

    if anchor_year is not None and anchor_month is not None:
        month_anchor = datetime(anchor_year, anchor_month, 1)
    else:
        today = datetime.today()
        month_anchor = _month_start(today)

    results = []

    for offset in range(months - 1, -1, -1):
        current = _shift_month(month_anchor, -offset)
        start_date, end_date = _month_bounds(current)

        allocated_query = (
            db.query(func.coalesce(func.sum(Allotment.amount_released), _Z))
            .join(
                AppropriationFundSource,
                Allotment.appr_fund_source_id == AppropriationFundSource.appr_fund_source_id,
            )
            .join(
                Appropriation,
                AppropriationFundSource.appropriation_id == Appropriation.appropriation_id,
            )
            .join(
                ProjectAIP,
                Appropriation.project_aip_id == ProjectAIP.project_aip_id,
            )
            .filter(
                Appropriation.is_active.is_(True),
                ProjectAIP.is_active.is_(True),
                Allotment.release_date >= start_date,
                Allotment.release_date <= end_date,
            )
        )

        utilized_query = (
            db.query(func.coalesce(func.sum(Disbursement.disbursement_amount), _Z))
            .join(
                Obligation,
                Disbursement.obligation_id == Obligation.obligation_id,
            )
            .join(
                Allotment,
                Obligation.allotment_id == Allotment.allotment_id,
            )
            .join(
                AppropriationFundSource,
                Allotment.appr_fund_source_id == AppropriationFundSource.appr_fund_source_id,
            )
            .join(
                Appropriation,
                AppropriationFundSource.appropriation_id == Appropriation.appropriation_id,
            )
            .join(
                ProjectAIP,
                Appropriation.project_aip_id == ProjectAIP.project_aip_id,
            )
            .filter(
                Appropriation.is_active.is_(True),
                ProjectAIP.is_active.is_(True),
                Disbursement.disbursement_date >= start_date,
                Disbursement.disbursement_date <= end_date,
            )
        )

        if fiscal_year is not None:
            allocated_query = allocated_query.filter(ProjectAIP.fiscal_year == fiscal_year)
            utilized_query = utilized_query.filter(ProjectAIP.fiscal_year == fiscal_year)

        allocated = allocated_query.scalar() or _Z
        utilized = utilized_query.scalar() or _Z

        results.append({
            "month": current.strftime("%b"),
            "year": current.year,
            "allocated": float(allocated),
            "utilized": float(utilized),
        })

    return results
