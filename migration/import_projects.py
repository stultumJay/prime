import argparse
import csv
import os
import sys
from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session

HERE = os.path.dirname(os.path.abspath(__file__))
PYTHON_ROOT = os.path.abspath(os.path.join(HERE, "..", "pme-backend"))
if PYTHON_ROOT not in sys.path:
    sys.path.insert(0, PYTHON_ROOT)

from app.db.session import SessionLocal
from app.models.office import Office
from app.models.program import Program
from app.models.project import Project
from app.models.sector import Sector

DEFAULT_CSV_FILE = os.path.join(HERE, "csv", "projects_2025.csv")


def load_csv(path: str) -> List[dict]:
    encodings = ["utf-8-sig", "utf-8", "cp1252", "latin-1"]

    for encoding in encodings:
        try:
            with open(path, mode="r", encoding=encoding, newline="") as file:
                return list(csv.DictReader(file))
        except UnicodeDecodeError:
            continue

    raise Exception(f"Unable to decode CSV file: {path}")


def parse_date(value: Optional[str]) -> Optional[datetime.date]:
    if not value:
        return None

    return datetime.strptime(value.strip(), "%Y-%m-%d").date()


def parse_float(value: Optional[str]) -> Optional[float]:
    if not value:
        return None
    return float(value.strip())


def validate_project_row(row: dict, row_number: int) -> dict:
    fiscal_year = row.get("fiscal_year", "").strip()
    sector_name = row.get("sector_name", "").strip()
    program_code = row.get("program_code", "").strip()
    office_name = row.get("office_name", "").strip()
    project_code = row.get("project_code", "").strip()
    project_title = row.get("project_title", "").strip()
    status = row.get("status", "").strip() or "planned"

    if not fiscal_year:
        raise ValueError(f"Row {row_number}: fiscal_year is required")
    if not sector_name:
        raise ValueError(f"Row {row_number}: sector_name is required")
    if not (len(program_code) == 3 and program_code.isdigit()):
        raise ValueError(f"Row {row_number}: invalid program_code '{program_code}' (must be 3 digits)")
    if not office_name:
        raise ValueError(f"Row {row_number}: office_name is required")
    if not project_code:
        raise ValueError(f"Row {row_number}: project_code is required")
    if not project_title:
        raise ValueError(f"Row {row_number}: project_title is required")
    if not status:
        raise ValueError(f"Row {row_number}: status is required")

    return {
        "fiscal_year": fiscal_year,
        "sector_name": sector_name,
        "program_code": program_code,
        "office_name": office_name,
        "project_code": project_code,
        "project_title": project_title,
        "project_description": row.get("project_description", "").strip() or None,
        "barangay": row.get("barangay", "").strip() or None,
        "street": row.get("street", "").strip() or None,
        "location_lat": row.get("location_lat", "").strip() or None,
        "location_lng": row.get("location_lng", "").strip() or None,
        "status": status,
        "expected_start_date": row.get("expected_start_date", "").strip() or None,
        "expected_end_date": row.get("expected_end_date", "").strip() or None,
    }


def run(csv_path: str) -> None:
    db: Session = SessionLocal()

    try:
        rows = load_csv(csv_path)
        inserted = 0
        seen_project_codes = set()

        for index, row in enumerate(rows, start=2):
            validated = validate_project_row(row, index)
            sector_name = validated["sector_name"]
            program_code = validated["program_code"]
            office_name = validated["office_name"]
            project_code = validated["project_code"]

            if project_code in seen_project_codes:
                raise ValueError(f"Row {index}: duplicate project_code '{project_code}' in CSV")
            seen_project_codes.add(project_code)

            sector = (
                db.query(Sector)
                .filter(Sector.sector_name == sector_name)
                .first()
            )
            if not sector:
                raise ValueError(f"Row {index}: Sector not found: '{sector_name}'")

            office = (
                db.query(Office)
                .filter(Office.office_name == office_name)
                .first()
            )
            if not office:
                raise ValueError(f"Row {index}: Office not found: '{office_name}'")

            program = (
                db.query(Program)
                .filter(
                    Program.sector_id == sector.sector_id,
                    Program.program_code == program_code,
                )
                .first()
            )
            if not program:
                raise ValueError(f"Row {index}: Program not found: sector='{sector_name}' program_code='{program_code}'")

            existing_project = (
                db.query(Project)
                .filter(Project.project_code == project_code)
                .first()
            )
            if existing_project:
                print(f"Skipping existing project: {project_code}")
                continue

            project = Project(
                sector_id=sector.sector_id,
                program_id=program.program_id,
                office_id=office.office_id,
                fiscal_year=validated["fiscal_year"],
                project_code=project_code,
                project_title=validated["project_title"],
                project_description=validated["project_description"],
                barangay=validated["barangay"],
                street=validated["street"],
                location_lat=parse_float(validated["location_lat"]),
                location_lng=parse_float(validated["location_lng"]),
                status=validated["status"],
                expected_start_date=parse_date(validated["expected_start_date"]),
                expected_end_date=parse_date(validated["expected_end_date"]),
            )
            db.add(project)
            inserted += 1

        db.commit()
        print(f"Project migration completed. Inserted: {inserted}")

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import projects from CSV into the database.")
    parser.add_argument(
        "csv_path",
        nargs="?",
        default=DEFAULT_CSV_FILE,
        help="Path to the project CSV file",
    )
    args = parser.parse_args()
    run(args.csv_path)
