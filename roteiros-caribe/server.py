from __future__ import annotations

import itertools
import json
import os
import sqlite3
import time
from datetime import date, datetime, timedelta
from typing import Any

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

ORIGIN = {"code": "CNF", "name": "Belo Horizonte"}
HUB = {"code": "GRU", "name": "São Paulo"}
DESTINATIONS = {
    "AUA": "Aruba",
    "CUR": "Curaçao",
    "CUN": "Cancún",
    "CTG": "Cartagena",
    "ADZ": "San Andrés",
    "PUJ": "Punta Cana",
}
DATABASE_PATH = os.getenv("FLIGHT_CACHE_DB", os.path.join(os.path.dirname(__file__), "flights.sqlite3"))
CACHE_TTL_SECONDS = int(os.getenv("FLIGHT_CACHE_TTL", "21600"))


def database_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.execute(
        "CREATE TABLE IF NOT EXISTS flight_cache (cache_key TEXT PRIMARY KEY, fetched_at REAL NOT NULL, payload TEXT NOT NULL)"
    )
    connection.execute(
        "CREATE TABLE IF NOT EXISTS collection_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL, finished_at TEXT NOT NULL, year INTEGER NOT NULL, full_scan INTEGER NOT NULL, planned INTEGER NOT NULL, successful INTEGER NOT NULL)"
    )
    return connection


def cached_flights(cache_key: str) -> tuple[dict[str, Any], ...] | None:
    with database_connection() as connection:
        row = connection.execute(
            "SELECT fetched_at, payload FROM flight_cache WHERE cache_key = ?", (cache_key,)
        ).fetchone()
    if not row or time.time() - row[0] > CACHE_TTL_SECONDS:
        return None
    return tuple(json.loads(row[1]))


def store_flights(cache_key: str, flights: tuple[dict[str, Any], ...]) -> None:
    with database_connection() as connection:
        connection.execute(
            "INSERT OR REPLACE INTO flight_cache(cache_key, fetched_at, payload) VALUES (?, ?, ?)",
            (cache_key, time.time(), json.dumps(flights, ensure_ascii=False)),
        )


def cache_entry_count() -> int:
    with database_connection() as connection:
        return connection.execute("SELECT COUNT(*) FROM flight_cache").fetchone()[0]


def last_collection_run() -> dict[str, Any] | None:
    with database_connection() as connection:
        row = connection.execute(
            "SELECT finished_at, year, full_scan, planned, successful FROM collection_runs ORDER BY id DESC LIMIT 1"
        ).fetchone()
    if not row:
        return None
    return {"finished_at": row[0], "year": row[1], "full_scan": bool(row[2]), "planned": row[3], "successful": row[4]}


def iso_day(year: int, month: int, day: int) -> str:
    return date(year, month, day).isoformat()


def parse_duration(value: Any) -> int:
    if isinstance(value, (int, float)):
        return int(value)
    if not value:
        return 0
    text = str(value).lower()
    hours = 0
    minutes = 0
    for part in text.replace(" ", "").split("h", 1):
        if part.isdigit():
            hours = int(part)
            break
    if "h" in text:
        tail = text.split("h", 1)[1].replace("min", "")
        if tail.isdigit():
            minutes = int(tail)
    return hours * 60 + minutes


def format_minutes(minutes: int) -> str:
    return f"{minutes // 60}h {minutes % 60:02d}"


def date_choices(year: int, start: int, end: int, step: int = 2) -> list[str]:
    return [iso_day(year, 12, day) for day in range(start, end + 1, step)]


def demo_flight(origin: str, destination: str, travel_date: str, seed: int) -> dict[str, Any]:
    if origin == "CNF" and destination == "GRU":
        duration = 90
        departure_hour = 6
    elif destination == "CNF" and origin == "GRU":
        duration = 90
        departure_hour = 18
    elif origin == "GRU":
        duration = 310 + (seed * 37 % 125)
        departure_hour = 12
    elif destination == "GRU":
        duration = 310 + (seed * 37 % 125)
        departure_hour = 8
    else:
        duration = 310 + (seed * 37 % 125)
        departure_hour = 7 + seed % 10
    price = 980 + (seed * 173 % 1100)
    departure_dt = datetime.fromisoformat(f"{travel_date}T{departure_hour:02d}:15:00")
    arrival_dt = departure_dt + timedelta(minutes=duration)
    return {
        "origin": origin,
        "destination": destination,
        "date": travel_date,
        "price": price,
        "duration": duration,
        "duration_label": format_minutes(duration),
        "airline": ["Azul", "Copa", "LATAM", "Avianca"][seed % 4],
        "stops": seed % 2,
        "departure": departure_dt.strftime("%d/%m %H:%M"),
        "arrival": arrival_dt.strftime("%d/%m %H:%M"),
        "departure_at": departure_dt.isoformat(),
        "arrival_at": arrival_dt.isoformat(),
        "source": "demo",
    }


def cached_flights_for_leg(origin: str, destination: str, travel_date: str) -> tuple[dict[str, Any], ...]:
    cache_key = f"google-flights:{origin}:{destination}:{travel_date}"
    cached = cached_flights(cache_key)
    if cached is not None:
        return cached
    return ()


def search_leg(origin: str, destination: str, travel_date: str, seed: int) -> dict[str, Any]:
    flights = cached_flights_for_leg(origin, destination, travel_date)
    if flights:
        return min(flights, key=lambda item: item["price"])
    return demo_flight(origin, destination, travel_date, seed)


def flight_candidates(origin: str, destination: str, travel_date: str, seed: int) -> tuple[dict[str, Any], ...]:
    flights = cached_flights_for_leg(origin, destination, travel_date)
    return flights or (demo_flight(origin, destination, travel_date, seed),)


def flight_datetime(value: str) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def connection_hours(first: dict[str, Any], second: dict[str, Any]) -> float | None:
    arrival = flight_datetime(first.get("arrival_at", ""))
    departure = flight_datetime(second.get("departure_at", ""))
    if not arrival or not departure:
        return None
    return (departure - arrival).total_seconds() / 3600


def positioned_legs(date_value: str, seed: int, outbound: bool, destination: str) -> list[dict[str, Any]] | None:
    if outbound:
        feeders = flight_candidates("CNF", "GRU", date_value, seed)
        internationals = flight_candidates("GRU", destination, date_value, seed + 1)
    else:
        internationals = flight_candidates(destination, "GRU", date_value, seed)
        feeders = flight_candidates("GRU", "CNF", date_value, seed + 1)
    compatible = []
    for feeder in feeders:
        for international in internationals:
            before, after = (feeder, international) if outbound else (international, feeder)
            gap = connection_hours(before, after)
            if gap is not None and 3 <= gap <= 10:
                compatible.append((before["price"] + after["price"], before, after))
    if compatible:
        _, before, after = min(compatible, key=lambda item: item[0])
        return [before, after]
    return None


def route_link(origin: str, destination: str, travel_date: str) -> str:
    return f"https://www.google.com/travel/flights?q=Flights%20from%20{origin}%20to%20{destination}%20on%20{travel_date}"


def make_route(year: int, first: str, second: str, first_day: int, second_day: int, third_day: int, seed: int) -> dict[str, Any] | None:
    first_date = iso_day(year, 12, first_day)
    second_date = iso_day(year, 12, second_day)
    third_date = iso_day(year, 12, third_day)
    stays = [(second_day - first_day) * 24, (third_day - second_day) * 24]
    if min(stays) < 90:
        return None
    outbound = positioned_legs(first_date, seed, True, first)
    inbound = positioned_legs(third_date, seed + 3, False, second)
    if not outbound or not inbound:
        return None
    legs = outbound + [search_leg(first, second, second_date, seed + 2)] + inbound
    if any(leg["duration"] > 20 * 60 for leg in legs):
        return None
    return {
        "kind": "multi",
        "destinations": [DESTINATIONS[first], DESTINATIONS[second]],
        "dates": [first_date, second_date, third_date],
        "stays": stays,
        "total_price": sum(leg["price"] for leg in legs),
        "total_duration": sum(leg["duration"] for leg in legs),
        "legs": legs,
        "links": [route_link(leg["origin"], leg["destination"], leg["date"]) for leg in legs],
        "source": "google-flights" if all(leg["source"] == "google-flights" for leg in legs) else "demo",
        "routing": "via GRU",
    }


def make_direct_route(year: int, first: str, second: str, first_day: int, second_day: int, third_day: int, seed: int) -> dict[str, Any] | None:
    first_date = iso_day(year, 12, first_day)
    second_date = iso_day(year, 12, second_day)
    third_date = iso_day(year, 12, third_day)
    stays = [(second_day - first_day) * 24, (third_day - second_day) * 24]
    legs = [search_leg("CNF", first, first_date, seed), search_leg(first, second, second_date, seed + 1), search_leg(second, "CNF", third_date, seed + 2)]
    if min(stays) < 90 or any(leg["duration"] > 20 * 60 for leg in legs):
        return None
    return {
        "kind": "multi", "destinations": [DESTINATIONS[first], DESTINATIONS[second]], "dates": [first_date, second_date, third_date],
        "stays": stays, "total_price": sum(leg["price"] for leg in legs), "total_duration": sum(leg["duration"] for leg in legs),
        "legs": legs, "links": [route_link(leg["origin"], leg["destination"], leg["date"]) for leg in legs],
        "source": "google-flights" if all(leg["source"] == "google-flights" for leg in legs) else "demo", "routing": "saindo de CNF",
    }


def make_single(year: int, destination: str, seed: int) -> dict[str, Any]:
    departure = iso_day(year, 12, 7 + seed % 3)
    return_day = iso_day(year, 12, 14 + seed % 3)
    outbound = positioned_legs(departure, seed, True, destination)
    inbound = positioned_legs(return_day, seed + 2, False, destination)
    if not outbound or not inbound:
        return {"kind": "single", "destinations": [DESTINATIONS[destination]], "dates": [departure, return_day], "stays": [], "total_price": 0, "total_duration": 0, "legs": [], "links": [], "source": "unavailable"}
    legs = outbound + inbound
    return {
        "kind": "single",
        "destinations": [DESTINATIONS[destination]],
        "dates": [departure, return_day],
        "stays": [(date.fromisoformat(return_day) - date.fromisoformat(departure)).days * 24],
        "total_price": sum(leg["price"] for leg in legs),
        "total_duration": sum(leg["duration"] for leg in legs),
        "legs": legs,
        "links": [route_link(leg["origin"], leg["destination"], leg["date"]) for leg in legs],
        "source": "google-flights" if all(leg["source"] == "google-flights" for leg in legs) else "demo",
        "routing": "via GRU",
    }


def make_direct_single(year: int, destination: str, seed: int) -> dict[str, Any]:
    departure = iso_day(year, 12, 7 + seed % 3)
    return_day = iso_day(year, 12, 14 + seed % 3)
    legs = [search_leg("CNF", destination, departure, seed), search_leg(destination, "CNF", return_day, seed + 1)]
    return {
        "kind": "single", "destinations": [DESTINATIONS[destination]], "dates": [departure, return_day],
        "stays": [(date.fromisoformat(return_day) - date.fromisoformat(departure)).days * 24],
        "total_price": sum(leg["price"] for leg in legs), "total_duration": sum(leg["duration"] for leg in legs), "legs": legs,
        "links": [route_link(leg["origin"], leg["destination"], leg["date"]) for leg in legs],
        "source": "google-flights" if all(leg["source"] == "google-flights" for leg in legs) else "demo", "routing": "saindo de CNF",
    }


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/search")
def search():
    try:
        year = int(request.args.get("year", "2026"))
        if year < 2026 or year > 2035:
            raise ValueError
    except ValueError:
        return jsonify({"error": "Informe um ano entre 2026 e 2035."}), 400

    routes = []
    # A small representative date matrix keeps the first search practical while
    # preserving the requested date windows and 90-hour minimum stays.
    for seed, (first, second) in enumerate(itertools.permutations(DESTINATIONS, 2)):
        for offset, days in enumerate(((7, 11, 15), (8, 12, 16), (9, 13, 17))):
            route = make_route(year, first, second, *days, seed + offset * 3)
            if route:
                routes.append(route)
            direct_route = make_direct_route(year, first, second, *days, seed + offset * 3)
            if direct_route:
                routes.append(direct_route)
    routes.sort(key=lambda item: item["total_price"])
    singles = []
    for index, destination in enumerate(DESTINATIONS):
        singles.extend([make_single(year, destination, index), make_direct_single(year, destination, index)])
    singles = [item for item in singles if item["legs"]]
    singles.sort(key=lambda item: item["total_price"])
    return jsonify({
        "year": year,
        "has_cached_data": cache_entry_count() > 0,
        "provider": "Google Flights",
        "last_collection": last_collection_run(),
        "routes": routes[:24],
        "singles": singles,
        "windows": {"outbound": "07/12 a 13/12", "between": "10/12 a 15/12", "return": "14/12 a 20/12"},
    })


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "8000")), debug=True)