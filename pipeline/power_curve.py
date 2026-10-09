"""Generic wind turbine power curve (spec 4.5, 5.2). Estimated, not measured production."""

from __future__ import annotations


def output_fraction(wind_ms: float, cut_in: float = 3.0, rated: float = 12.0, cut_out: float = 25.0) -> float:
    """Share of rated output (0 to 1) at a hub-height wind speed: zero below cut-in and from
    cut-out, (v^3 - cut_in^3) / (rated^3 - cut_in^3) between cut-in and rated (power in the wind
    grows with the cube of its speed), full output from rated to cut-out."""
    if wind_ms is None or wind_ms < cut_in or wind_ms >= cut_out:
        return 0.0
    if wind_ms >= rated:
        return 1.0
    return (wind_ms**3 - cut_in**3) / (rated**3 - cut_in**3)
