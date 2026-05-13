import argparse
import csv
import os
import sys
from typing import List

from sqlalchemy.orm import Session

HERE = os.path.dirname(os.path.abspath(__file__))
PYTHON_ROOT = os.path.abspath(os.path.join(HERE, "..", "pme-backend"))
if PYTHON_ROOT not in sys.path:
    sys.path.insert(0, PYTHON_ROOT)

from app.db.session import SessionLocal
from app.models.program import Program
from app.models.sector import Sector

DEFAULT_CSV_FILE = os.path.join(HERE, "csv", "programs_2025.csv")


def load_csv(path: str) -> List[dict]:
    encodings = ["utf-8-sig", "utf-8", "cp1252", "latin-1"]

    for encoding in encodings:
        try:
            with open(path, mode="r", encoding=encoding, newline="") as file:
                return list(csv.DictReader(file))
        except UnicodeDecodeError:
            continue

    raise Exception(f"Unable to decode CSV file: {path}")


def validate_program_row(row: dict, row_number: int) -> dict:
    sector_name = row.get("sector_name", "").strip()
    program_code = row.get("program_code", "").strip()
    program_name = row.get("program_name", "").strip()

    if not sector_name:
        raise ValueError(f"Row {row_number}: sector_name is required")

    if not (len(program_code) == 3 and program_code.isdigit()):
        raise ValueError(f"Row {row_number}: invalid program_code '{program_code}' (must be 3 digits)")

    if not program_name:
        raise ValueError(f"Row {row_number}: program_name is required")

    return {
        "sector_name": sector_name,
        "program_code": program_code,
        "program_name": program_name,
    }


def run(csv_path: str) -> None:
    db: Session = SessionLocal()

    try:
        rows = load_csv(csv_path)
        inserted = 0

        for index, row in enumerate(rows, start=2):
            validated = validate_program_row(row, index)
            sector_name = validated["sector_name"]
            program_code = validated["program_code"]

            sector = (
                db.query(Sector)
                .filter(Sector.sector_name == sector_name)
                .first()
            )
            if not sector:
                raise ValueError(f"Row {index}: Sector not found: '{sector_name}'")

            existing = (
                db.query(Program)
                .filter(
                    Program.sector_id == sector.sector_id,
                    Program.program_code == program_code,
                )
                .first()
            )
            if existing:
                print(f"Skipping existing program: {sector_name} / {program_code}")
                continue

            program = Program(
                sector_id=sector.sector_id,
                program_code=program_code,
                program_name=validated["program_name"],
                description=None,
            )
            db.add(program)
            inserted += 1

        db.commit()
        print(f"Program migration completed. Inserted: {inserted}")

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import programs from CSV into the database.")
    parser.add_argument(
        "csv_path",
        nargs="?",
        default=DEFAULT_CSV_FILE,
        help="Path to the program CSV file",
    )
    args = parser.parse_args()
    run(args.csv_path)
