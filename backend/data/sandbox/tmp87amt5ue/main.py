def pressure_loss(delta_p: float, length_m: float) -> float:
    """Mock generated: linear pressure loss estimate."""
    return round(delta_p * length_m / 100.0, 3)

if __name__ == "__main__":
    print(pressure_loss(250.0, 80.0))
