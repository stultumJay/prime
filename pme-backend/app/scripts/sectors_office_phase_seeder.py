import uuid
from decimal import Decimal
from app.db.session import SessionLocal
from app.models.office import Office
from app.models.sector import Sector
from app.models.phase_config import PhaseConfig
from app.scripts.utils import get_or_create


def run():
    db = SessionLocal()

    try:
        # =========================
        # 1. SECTORS
        # =========================
        sectors = [
            ("8000", "Infrastructure"),
            ("3000", "Social"),
            ("8000", "Economic"),
            ("1000", "Environmental"),
            ("1000", "Institutional"),
            ("9000", "Others"),
        ]

        for code, name in sectors:
            get_or_create(
                db,
                Sector,
                {"sector_name": name},
                {
                    "sector_id": uuid.uuid4(),
                    "sector_code": code
                }
            )

        db.commit()

        # =========================
        # 2. OFFICES
        # =========================
        def create_office(code, otype, name):
            return {
                "office_code": code,
                "office_type": otype,
                "office_name": name,
                "mandate": f"This is a sample mandate of the {name}",
                "vision": f"This is the vision of the {name}",
                "mission": f"This is the mission of the {name}",
                "organizational_outcome": f"This is the organizational outcome of the {name}",
            }

        offices = [

            # =========================
            # MANDATORY OFFICES (type = 1)
            # =========================
            create_office("01", 1, "Office of the Municipal Mayor"),
            create_office("02", 1, "Office of the Municipal Vice-Mayor"),
            create_office("03", 1, "Office of the Sangguniang Bayan Members"),
            create_office("04", 1, "Office of the Secretary to the Sangguniang Bayan"),
            create_office("05", 1, "Office of the Municipal Treasurer"),
            create_office("06", 1, "Office of the Municipal Assessor"),
            create_office("07", 1, "Office of the Municipal Accountant"),
            create_office("08", 1, "Office of the Municipal Budget Officer"),
            create_office("09", 1, "Office of the Municipal Planning and Development Coordinator"),
            create_office("10", 1, "Office of the Municipal Engineer/Building Official"),
            create_office("11", 1, "Office of the Municipal Health Officer"),
            create_office("12", 1, "Office of the Municipal Civil Registrar"),
            create_office("13", 1, "Office of the Municipal Social Welfare and Development"),
            create_office("14", 1, "Office of the Municipal Disaster Risk Reduction and Management Officer"),
            create_office("15", 1, "Office of the Municipal Internal Audit Service"),
            create_office("16", 1, "Office of the Municipal Persons with Disability Affairs Officer"),
            create_office("17", 1, "Office of the Municipal Public Employment Service Manager"),
            create_office("18", 1, "Office of the Municipal Youth Development Officer"),
            create_office("19", 1, "Office of the Municipal Senior Citizen Affairs Head"),

            # =========================
            # OPTIONAL OFFICES (type = 2)
            # =========================
            create_office("01", 2, "Office of the Municipal Administrator"),
            create_office("02", 2, "Office of the Municipal Legal Officer"),
            create_office("03", 2, "Office of the Municipal Agriculturist"),
            create_office("04", 2, "Office of the Municipal Environment and Natural Resources"),
            create_office("05", 2, "Office of the Municipal Architect"),
            create_office("06", 2, "Office of the Municipal Information Officer"),
            create_office("07", 2, "Office of the Municipal Population Officer"),
            create_office("08", 2, "Office of the Municipal Agricultural and Biosystems Engineer"),
            create_office("09", 2, "Office of the Municipal Cooperatives Development Officer"),
            create_office("10", 2, "Office of the Municipal Tourism Officer"),
        ]

        for o in offices:
            get_or_create(
                db,
                Office,
                {"office_name": o["office_name"]},
                {"office_id": uuid.uuid4(), **o}
            )

        db.commit()

        # =========================
        # 3. PHASES
        # =========================
        phases = [
            ("Preliminary", Decimal("10.00")),
            ("Procurement", Decimal("20.00")),
            ("Construction", Decimal("60.00")),
            ("Testing", Decimal("10.00")),
        ]

        for name, weight in phases:
            get_or_create(
                db,
                PhaseConfig,
                {"phase_name": name},
                {
                    "phase_id": uuid.uuid4(),
                    "weight_percent": weight
                }
            )

        db.commit()

        print("Sectors, Offices, Phases seeded safely")

    except Exception as e:
        db.rollback()
        print("ERROR:", e)

    finally:
        db.close()


if __name__ == "__main__":
    run()