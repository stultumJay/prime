from decimal import Decimal

VALID_EXPENSE_CLASSES = {"PS", "MOOE", "FE", "CO"}
VALID_PROJECT_STATUS = {"planned", "in_progress", "delayed", "completed", "cancelled"}

ZERO = Decimal("0.00")


# ─────────────────────────────────────────────
# Expense Class Validation
# ─────────────────────────────────────────────
def validate_expense_class(value: str):
    """
    This makes sure the expense class is one of the four values the budget flow understands
    Anything outside that short list gets rejected right away
    """
    if value not in VALID_EXPENSE_CLASSES:
        raise ValueError(f"Invalid expense class: {value}")


# ─────────────────────────────────────────────
# Project Status Validation
# ─────────────────────────────────────────────
def validate_project_status(status: str):
    """
    This makes sure the project status stays inside the allowed project lifecycle values
    That keeps reports and filters from receiving unexpected status names
    """
    if status not in VALID_PROJECT_STATUS:
        raise ValueError(f"Invalid project status: {status}")


# ─────────────────────────────────────────────
# Progress Validation
# ─────────────────────────────────────────────
def validate_progress(percent: float):
    """
    This keeps progress inside the normal 0 to 100 range
    It blocks negative values and anything above full completion
    """
    if percent < 0 or percent > 100:
        raise ValueError("Progress must be between 0 and 100")


# ─────────────────────────────────────────────
# Financial Validations
# ─────────────────────────────────────────────
def validate_positive_amount(value: Decimal, field_name: str = "amount"):
    """
    This makes sure the amount is present and larger than zero
    It is used for money values that should never be empty or negative
    """
    if value is None or value <= ZERO:
        raise ValueError(f"{field_name} must be greater than zero")


def validate_money_scale(value: Decimal | None, field_name: str = "amount") -> Decimal | None:
    """
    Keep stored money values to cents. This rejects values like 123.456 instead of rounding them.
    """
    if value is not None and value.as_tuple().exponent < -2:
        raise ValueError(f"{field_name} can only have up to 2 decimal places")
    return value


def validate_not_exceed(value: Decimal, limit: Decimal, field_name="value"):
    """
    This makes sure one value does not go past the limit it should stay under
    It is useful for budget checks where one amount depends on another amount
    """
    if value > limit:
        raise ValueError(f"{field_name} cannot exceed {limit}")


# ─────────────────────────────────────────────
# Phase Weight Validation
# ─────────────────────────────────────────────
def validate_phase_weights(phases: list):
    """
    This checks that all phase weights add up to exactly one hundred
    The progress summary depends on that full weight being complete
    """
    # The whole project timeline should always represent a full 100 percent
    total = sum(p.weight_percent for p in phases)

    if total != Decimal("100"):
        raise ValueError(f"Total phase weight must equal 100. Got {total}")


# ─────────────────────────────────────────────
# AIP Constraint Validation
# ─────────────────────────────────────────────
def validate_aip_target(target_total: int, progress_total: int):
    """
    This makes sure the reported progress target does not go past the full AIP target
    It keeps planning numbers from becoming larger than the target they belong to
    """
    if progress_total > target_total:
        raise ValueError("Progress exceeds AIP target_total")