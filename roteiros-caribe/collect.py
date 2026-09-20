from __future__ import annotations

import argparse
import itertools
import re
from datetime import date, datetime, timedelta

from playwright.sync_api import sync_playwright

from server import DESTINATIONS, cached_flights, database_connection, store_flights


def dates_for(year: int, start: int, end: int, full: bool) -> list[str]:
    if full:
        days = range(start, end + 1)
    elif (start, end) == (7, 13):
        days = (7, 8, 9)
    elif (start, end) == (10, 15):
        days = (11, 12, 13)
    else:
        days = (14, 15, 16, 17)
    return [date(year, 12, day).isoformat() for day in days]


def collection_queries(year: int, full: bool) -> set[tuple[str, str, str]]:
    outbound = dates_for(year, 7, 13, full)
    between = dates_for(year, 10, 15, full)
    return_dates = dates_for(year, 14, 20, full)
    queries: set[tuple[str, str, str]] = set()

    for destination in DESTINATIONS:
        queries.update(("CNF", destination, travel_date) for travel_date in outbound)
        queries.update((destination, "CNF", travel_date) for travel_date in return_dates)
        queries.update(("GRU", destination, travel_date) for travel_date in outbound)
        queries.update((destination, "GRU", travel_date) for travel_date in return_dates)
    for first, second in itertools.permutations(DESTINATIONS, 2):
        queries.update((first, second, travel_date) for travel_date in between)
    queries.update(("CNF", "GRU", travel_date) for travel_date in outbound)
    queries.update(("GRU", "CNF", travel_date) for travel_date in return_dates)
    return queries


def google_url(origin: str, destination: str, travel_date: str) -> str:
    return f"https://www.google.com/travel/flights?hl=pt-BR&curr=BRL&q=Flights%20from%20{origin}%20to%20{destination}%20on%20{travel_date}"


def parse_price(value: str) -> int:
    return round(float(value.replace(".", "").replace(",", ".")))


def parse_duration(text: str) -> int:
    match = re.search(r"(\d+)\s*(?:h|hr|horas?)(?:\s*(\d+)\s*(?:min|minutos?))?", text, re.IGNORECASE)
    if not match:
        return 0
    return int(match.group(1)) * 60 + int(match.group(2) or 0)


def parse_stops(text: str) -> int | None:
    if re.search(r"\b(?:direto|sem escalas?|nonstop)\b", text, re.IGNORECASE):
        return 0
    match = re.search(r"(?:(\d+)\s+escalas?|(?:(\d+)\s+paradas?))", text, re.IGNORECASE)
    if match:
        return int(match.group(1) or match.group(2))
    return None


def scrape_visible_result(page, origin: str, destination: str, travel_date: str) -> tuple[dict, ...]:
    body = page.locator("body").inner_text()
    if "não sou um robô" in body.lower() or "unusual traffic" in body.lower():
        raise RuntimeError("O Google exibiu uma verificação antirobô. Resolva-a no navegador e execute novamente.")
    cards = page.locator('[role="main"] [role="listitem"]')
    if cards.count() == 0:
        cards = page.locator('[role="listitem"]')
    offers = []
    for card_index in range(min(cards.count(), 30)):
        text = re.sub(r"\s+", " ", cards.nth(card_index).inner_text()).strip()
        price_match = re.search(r"R\$\s*((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?)", text, re.IGNORECASE)
        duration_match = re.search(r"\d+\s*(?:h|hr|horas?)(?:\s*\d+\s*(?:min|minutos?))?", text, re.IGNORECASE)
        times = re.findall(r"\b(?:[01]?\d|2[0-3]):[0-5]\d\b", text)
        if not price_match or not duration_match or len(times) < 2:
            continue
        raw_price = price_match.group(1)
        duration = parse_duration(duration_match.group(0))
        departure, arrival = times[0], times[1]
        departure_at = f"{travel_date}T{departure}:00"
        arrival_dt = datetime.fromisoformat(f"{travel_date}T{arrival}:00")
        departure_dt = datetime.fromisoformat(departure_at)
        if arrival_dt <= departure_dt:
            arrival_dt += timedelta(days=1)
        offers.append({
            "origin": origin, "destination": destination, "date": travel_date,
            "price": parse_price(raw_price), "duration": duration,
            "duration_label": f"{duration // 60}h {duration % 60:02d}",
            "airline": "Google Flights", "stops": parse_stops(text),
            "departure": departure, "arrival": arrival,
            "departure_at": departure_at, "arrival_at": arrival_dt.isoformat(),
            "source": "google-flights",
        })
    return tuple(offers[:10])


def scrape_leg(page, origin: str, destination: str, travel_date: str, headed: bool) -> tuple[dict, ...]:
    page.goto(google_url(origin, destination, travel_date), wait_until="domcontentloaded", timeout=60000)
    for _ in range(12):
        page.wait_for_timeout(1000)
        if scrape_visible_result(page, origin, destination, travel_date):
            break
    if headed:
        print("  navegador aberto; confira o resultado visível")
    return scrape_visible_result(page, origin, destination, travel_date)


def main() -> None:
    parser = argparse.ArgumentParser(description="Abre o Google Flights e grava resultados no SQLite.")
    parser.add_argument("--year", type=int, default=2026)
    parser.add_argument("--full", "--complete", dest="full", action="store_true", help="consulta todos os dias das três janelas")
    parser.add_argument("--headed", action="store_true", help="mostra o navegador durante a coleta")
    args = parser.parse_args()

    queries = sorted(collection_queries(args.year, args.full))
    print(f"Consultas planejadas: {len(queries)}")
    successful = 0
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=not args.headed)
        page = browser.new_page()
        for index, (origin, destination, travel_date) in enumerate(queries, start=1):
            cache_key = f"google-flights:{origin}:{destination}:{travel_date}"
            flights = cached_flights(cache_key)
            if flights is None:
                flights = scrape_leg(page, origin, destination, travel_date, args.headed)
                if flights:
                    store_flights(cache_key, flights)
            else:
                print(f"[{index}/{len(queries)}] {origin} -> {destination} {travel_date}: cache")
            print(f"[{index}/{len(queries)}] {origin} -> {destination} {travel_date}: {len(flights)} ofertas")
            if flights:
                successful += 1
        browser.close()
    finished_at = datetime.now().astimezone().isoformat(timespec="seconds")
    with database_connection() as connection:
        connection.execute(
            "INSERT INTO collection_runs(started_at, finished_at, year, full_scan, planned, successful) VALUES (?, ?, ?, ?, ?, ?)",
            (finished_at, finished_at, args.year, int(args.full), len(queries), successful),
        )
    print(f"Consultas com ofertas: {successful}")
    print("Banco atualizado. A página agora pode ser recarregada sem fazer novas consultas externas.")


if __name__ == "__main__":
    main()