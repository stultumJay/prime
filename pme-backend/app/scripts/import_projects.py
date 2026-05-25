import argparse
import csv
import os
import sys
from typing import List

from sqlalchemy.orm import Session

HERE = os.path.dirname(os.path.abspath(__file__))
PYTHON_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
if PYTHON_ROOT not in sys.path:
    sys.path.insert(0, PYTHON_ROOT)

from app.db.session import SessionLocal
from app.models.office import Office
from app.models.program import Program
from app.models.project import Project
from app.models.sector import Sector
from app.utils.aip_code import format_project_code, next_project_seq

DEFAULT_CSV_FILE = os.path.join(HERE, "csv", "projects.csv")


def load_csv(path: str) -> List[dict]:
    encodings = ["utf-8-sig", "utf-8", "cp1252", "latin-1"]

    for encoding in encodings:
        try:
            with open(path, mode="r", encoding=encoding, newline="") as file:
                return list(csv.DictReader(file))
        except UnicodeDecodeError:
            continue

    raise Exception(f"Unable to decode CSV file: {path}")


def validate_project_row(row: dict, row_number: int) -> dict:
    fiscal_year = row.get("fiscal_year", "").strip()
    sector_name = row.get("sector_name", "").strip()
    program_code = row.get("program_code", "").strip()
    office_name = row.get("office_name", "").strip()
    project_title = row.get("project_title", "").strip()

    if not (len(fiscal_year) == 4 and fiscal_year.isdigit()):
        raise ValueError(f"Row {row_number}: fiscal_year must be a 4-digit year")
    if not sector_name:
        raise ValueError(f"Row {row_number}: sector_name is required")
    if not (len(program_code) == 3 and program_code.isdigit()):
        raise ValueError(f"Row {row_number}: invalid program_code '{program_code}' (must be 3 digits)")
    if not office_name:
        raise ValueError(f"Row {row_number}: office_name is required")
    if not project_title:
        raise ValueError(f"Row {row_number}: project_title is required")

    return {
        "fiscal_year": fiscal_year,
        "sector_name": sector_name,
        "program_code": program_code,
        "office_name": office_name,
        "project_title": project_title,
        "project_description": row.get("project_description", "").strip() or None,
        "barangay": row.get("barangay", "").strip() or None,
        "street": row.get("street", "").strip() or None,
    }


def next_unique_project_code(
    db: Session,
    fiscal_year: int,
    reserved_codes: set[str],
) -> str:
    while True:
        seq = next_project_seq(db, fiscal_year)
        project_code = format_project_code(fiscal_year, seq)
        exists = (
            db.query(Project)
            .filter(Project.project_code == project_code)
            .first()
        )
        if not exists and project_code not in reserved_codes:
            reserved_codes.add(project_code)
            return project_code


def run(csv_path: str) -> None:
    db: Session = SessionLocal()

    try:
        rows = load_csv(csv_path)
        imported = 0
        failed = 0
        reserved_codes: set[str] = set()
        seen_project_keys: set[tuple[str, str, str, str]] = set()

        for index, row in enumerate(rows, start=2):
            try:
                validated = validate_project_row(row, index)
                fiscal_year = validated["fiscal_year"]
                sector_name = validated["sector_name"]
                program_code = validated["program_code"]
                office_name = validated["office_name"]
                project_title = validated["project_title"]

                sector = (
                    db.query(Sector)
                    .filter(Sector.sector_name == sector_name)
                    .first()
                )
                if not sector:
                    raise ValueError(f"Row {index}: sector not found: '{sector_name}'")

                office = (
                    db.query(Office)
                    .filter(Office.office_name == office_name)
                    .first()
                )
                if not office:
                    raise ValueError(f"Row {index}: office not found: '{office_name}'")

                program = (
                    db.query(Program)
                    .filter(
                        Program.sector_id == sector.sector_id,
                        Program.program_code == program_code,
                    )
                    .first()
                )
                if not program:
                    raise ValueError(
                        f"Row {index}: program not found: sector='{sector_name}' "
                        f"program_code='{program_code}'"
                    )

                project_key = (
                    fiscal_year,
                    str(program.program_id),
                    str(office.office_id),
                    project_title.lower(),
                )
                if project_key in seen_project_keys:
                    raise ValueError(
                        f"Row {index}: duplicate project in CSV: "
                        f"{fiscal_year} / {program_code} / {project_title}"
                    )

                existing_project = (
                    db.query(Project)
                    .filter(
                        Project.fiscal_year == fiscal_year,
                        Project.program_id == program.program_id,
                        Project.office_id == office.office_id,
                        Project.project_title == project_title,
                    )
                    .first()
                )
                if existing_project:
                    raise ValueError(
                        f"Row {index}: project already exists: "
                        f"{existing_project.project_code}"
                    )

                project_code = next_unique_project_code(
                    db,
                    int(fiscal_year),
                    reserved_codes,
                )

                project = Project(
                    sector_id=sector.sector_id,
                    program_id=program.program_id,
                    office_id=office.office_id,
                    fiscal_year=fiscal_year,
                    project_code=project_code,
                    project_title=project_title,
                    project_description=validated["project_description"],
                    barangay=validated["barangay"],
                    street=validated["street"],
                    status="planned",
                    is_active=True,
                    is_integrated=False,
                    locational_clearance_status=False,
                )
                db.add(project)
                imported += 1
                seen_project_keys.add(project_key)
            except ValueError as exc:
                failed += 1
                print(f"Skipping project. {exc}")

        db.commit()
        print(f"Projects Imported: {imported}")
        print(f"Projects Failed: {failed}")

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