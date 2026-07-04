const chartDom = document.getElementById("chart-container");
const dateDisplay = document.getElementById("date-display");
const playBtn = document.getElementById("play-btn");
const raceControls = document.getElementById("race-controls");
const referenceControls = document.getElementById("reference-controls");
const referencePickerBtn = document.getElementById("reference-picker-btn");
const referencePickerLabel = document.getElementById("reference-picker-label");
const referenceMenu = document.getElementById("reference-menu");
const referenceFilter = document.getElementById("reference-filter");
const referenceOptions = document.getElementById("reference-options");
const chartTitle = document.getElementById("chart-title");
const chartSubtitle = document.getElementById("chart-subtitle");
const chartButtons = Array.from(document.querySelectorAll(".chart-btn"));

const monthNames = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];
const colors = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#ca8a04",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#db2777",
  "#84cc16",
  "#0284c7",
];

const transitionDuration = 1400;
const raceUpdateFrequency = 900;
const raceDayPause = 500;
const raceAxisAnimationDuration = 300;
const minRaceChartHeight = 900;
const racePixelsPerParticipant = 42;

let chartType = "positions";
let chart = null;
let timer = null;
let currentIndex = 0;
let formattedDates = [];
let participantsData = [];
let participantOrder = {};
let snapshots = [];
let sortedNames = [];
let colorMap = {};
let raceCurrentSorted = [];
let seriesSelection = {};
let referencePlayer = "";
let referenceFilterText = "";

function initChart() {
  if (!chart) {
    chart = echarts.init(chartDom, null, { renderer: "canvas" });
  }
  return chart;
}

function destroyChart() {
  stopRace();
  if (chart) {
    chart.dispose();
    chart = null;
  }
}

function resizeChartForParticipants(isRace) {
  chartDom.style.height = isRace
    ? `${Math.max(minRaceChartHeight, participantsData.length * racePixelsPerParticipant)}px`
    : "640px";

  if (chart) {
    chart.resize();
  }
}

function ensureSeriesSelection(names) {
  names.forEach((name) => {
    if (typeof seriesSelection[name] === "undefined") {
      seriesSelection[name] = true;
    }
  });
}

function isSeriesVisible(name) {
  return seriesSelection[name] !== false;
}

function toggleSeriesVisibility(name) {
  seriesSelection[name] = !isSeriesVisible(name);
  renderChart();
}

function getVisibleSeriesNames() {
  return sortedNames.filter((name) => isSeriesVisible(name));
}

function getSelectedReferenceName() {
  if (referencePlayer && sortedNames.includes(referencePlayer)) {
    return referencePlayer;
  }
  return "";
}

function getFilteredReferenceNames() {
  const filter = (referenceFilterText || "").trim().toLowerCase();
  if (!filter) return sortedNames.slice();
  return sortedNames.filter((name) => name.toLowerCase().includes(filter));
}

function syncReferenceOptions() {
  if (!referencePickerLabel || !referenceFilter || !referenceOptions) return;

  const current =
    referencePlayer && sortedNames.includes(referencePlayer) ? referencePlayer : "";
  const filteredNames = getFilteredReferenceNames();

  referenceFilter.value = referenceFilterText;
  referencePickerLabel.textContent = current || "Líder do dia";

  referenceOptions.innerHTML =
    `<button type="button" class="reference-option${current === "" ? " active" : ""}" data-value="">Líder do dia</button>` +
    (filteredNames.length
      ? filteredNames
          .map((name) => {
            const safe = name
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/\"/g, "&quot;");
            return `<button type="button" class="reference-option${name === current ? " active" : ""}" data-value="${safe}">${safe}</button>`;
          })
          .join("")
      : `<div class="reference-empty">Nenhum apostador encontrado para o filtro.</div>`);

  referenceOptions.querySelectorAll(".reference-option").forEach((button) => {
    button.addEventListener("click", () => {
      referencePlayer = button.dataset.value || "";
      if (referenceMenu) referenceMenu.classList.remove("open");
      setChartMeta(chartType);
      renderChart();
    });
  });
}

function getPositionAxisMax() {
  const visibleNames = getVisibleSeriesNames();
  let maxValue = 1;

  if (!visibleNames.length) return 1;

  snapshots.forEach((snapshot) => {
    visibleNames.forEach((name) => {
      const position = snapshot.posMap[name] || 1;
      if (position > maxValue) maxValue = position;
    });
  });

  return maxValue;
}

function getRelativeAxisRange(referenceName) {
  const visibleNames = getVisibleSeriesNames();
  const refName = referenceName || getSelectedReferenceName();
  let minValue = 0;
  let maxValue = 0;

  snapshots.forEach((snapshot) => {
    const referenceValue = refName
      ? snapshot.ptsMap[refName] || 0
      : snapshot.leader || 0;
    visibleNames.forEach((name) => {
      const relative = (snapshot.ptsMap[name] || 0) - referenceValue;
      if (relative < minValue) minValue = relative;
      if (relative > maxValue) maxValue = relative;
    });
  });

  return { min: minValue, max: maxValue };
}

function updateReferenceUI() {
  if (!referenceControls || !referencePickerBtn) return;

  if (chartType === "points-leader") {
    referenceControls.classList.remove("hidden");
    syncReferenceOptions();
  } else {
    referenceControls.classList.add("hidden");
    if (referenceMenu) referenceMenu.classList.remove("open");
  }
}

function parseCsvData(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    throw new Error("CSV vazio.");
  }

  const headers = lines[0].split(";").map((h) => h.trim());
  const participantIndex = headers.indexOf("Participante");
  const dateColumns = headers
    .map((header, idx) => ({ header, idx }))
    .filter(({ header }) => /^\d{4}-\d{2}-\d{2}$/.test(header));

  if (participantIndex < 0 || !dateColumns.length) {
    throw new Error("CSV sem colunas esperadas (Participante e datas).");
  }

  formattedDates = dateColumns.map(({ header }) => {
    const [, month, day] = header.split("-");
    return `${day}/${monthNames[parseInt(month, 10) - 1]}`;
  });

  participantsData = lines
    .slice(1)
    .map((line, index) => {
      const parts = line.split(";");
      const name = (parts[participantIndex] || "").trim();
      let cumulative = 0;

      const scores = dateColumns.map(({ idx }) => {
        const value = parseInt((parts[idx] || "0").trim(), 10);
        cumulative += Number.isNaN(value) ? 0 : value;
        return cumulative;
      });

      participantOrder[name] = index;

      return {
        name,
        scores,
        order: index,
        color: colors[index % colors.length],
      };
    })
    .filter((participant) => participant.name.length > 0);

  buildSnapshots();
}

function buildSnapshots() {
  snapshots = formattedDates.map((_, dateIndex) => {
    const ptsMap = {};

    participantsData.forEach((participant) => {
      ptsMap[participant.name] = participant.scores[dateIndex] || 0;
    });

    const entries = participantsData
      .map((participant) => ({
        name: participant.name,
        pts: ptsMap[participant.name] || 0,
        order: participant.order,
      }))
      .sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        return a.order - b.order;
      });

    const posMap = {};
    let rank = 1;

    entries.forEach((entry, idx) => {
      if (idx > 0) {
        const prev = entries[idx - 1];
        if (entry.pts !== prev.pts) {
          rank = idx + 1;
        }
      }

      posMap[entry.name] = rank;
    });

    return {
      ptsMap,
      posMap,
      leader: entries.length ? entries[0].pts : 0,
    };
  });

  const lastSnapshot = snapshots[snapshots.length - 1];
  sortedNames = participantsData
    .map((participant) => participant.name)
    .sort((a, b) => {
      const posA = lastSnapshot
        ? lastSnapshot.posMap[a] || participantsData.length + 1
        : participantsData.length + 1;
      const posB = lastSnapshot
        ? lastSnapshot.posMap[b] || participantsData.length + 1
        : participantsData.length + 1;
      if (posA !== posB) return posA - posB;
      return (participantOrder[a] || 0) - (participantOrder[b] || 0);
    });

  colorMap = {};
  sortedNames.forEach((name, index) => {
    colorMap[name] = colors[index % colors.length];
  });

  ensureSeriesSelection(sortedNames);
  if (referencePlayer && !sortedNames.includes(referencePlayer)) {
    referencePlayer = "";
  }
  syncReferenceOptions();
}

function syncLegend() {
  const legendEl = document.getElementById("chart-legend");
  if (!legendEl) return;

  if (chartType === "race") {
    legendEl.classList.add("hidden");
    legendEl.innerHTML = "";
    return;
  }

  legendEl.classList.remove("hidden");
  legendEl.innerHTML = sortedNames
    .map((name) => {
      const active = isSeriesVisible(name);
      return `
        <button type="button" class="chart-legend-item ${active ? "" : "inactive"}" data-name="${name}">
          <span class="chart-legend-dot" style="background:${colorMap[name]}"></span>
          <span>${name}</span>
        </button>
      `;
    })
    .join("");

  legendEl.querySelectorAll(".chart-legend-item").forEach((item) => {
    item.addEventListener("click", () => {
      toggleSeriesVisibility(item.dataset.name);
    });
  });
}

function renderPositionsChart() {
  const renderer = window.BolaoSefCharts && window.BolaoSefCharts.renderPositionsChart;
  if (!renderer) {
    throw new Error("Renderer de posições não encontrado.");
  }

  renderer({
    initChart,
    snapshots,
    transitionDuration,
    sortedNames,
    isSeriesVisible,
    formattedDates,
    getPositionAxisMax,
    colorMap,
    participantsData,
  });
}

function renderPointsLeaderChart() {
  const renderer = window.BolaoSefCharts && window.BolaoSefCharts.renderPointsLeaderChart;
  if (!renderer) {
    throw new Error("Renderer de pontuação relativa não encontrado.");
  }

  renderer({
    initChart,
    snapshots,
    transitionDuration,
    sortedNames,
    isSeriesVisible,
    formattedDates,
    getSelectedReferenceName,
    referencePlayer,
    getRelativeAxisRange,
    colorMap,
  });
}

function renderRaceChart(sorted) {
  const renderer = window.BolaoSefCharts && window.BolaoSefCharts.renderRaceChart;
  if (!renderer) {
    throw new Error("Renderer de gráfico de barras não encontrado.");
  }

  renderer({
    destroyChart,
    snapshots,
    resizeChartForParticipants,
    sorted,
    sortedNames,
    setRaceCurrentSorted: function (next) {
      raceCurrentSorted = next;
    },
    updateRaceLabel,
    initChart,
    currentIndex,
    colorMap,
    raceAxisAnimationDuration,
    raceUpdateFrequency,
  });
}

function updateRaceFrame(index) {
  const renderer = window.BolaoSefCharts && window.BolaoSefCharts.updateRaceFrame;
  if (!renderer) {
    throw new Error("Atualizador de frame do gráfico de barras não encontrado.");
  }

  renderer({
    chart,
    snapshots,
    index,
    raceCurrentSorted,
    colorMap,
  });
}

function updateRaceLabel(index) {
  dateDisplay.textContent = formattedDates[index] || "Aguardando...";

  if (snapshots[index]) {
    currentIndex = index;
  }
}

function stopRace() {
  clearTimeout(timer);
  timer = null;
  playBtn.textContent = "Play";
}

function startTimer() {
  if (timer) return;

  const advanceDay = () => {
    if (!timer) return;

    currentIndex += 1;
    if (currentIndex >= snapshots.length) {
      stopRace();
      return;
    }

    updateRaceFrame(currentIndex);
    updateRaceLabel(currentIndex);
    timer = setTimeout(advanceDay, raceUpdateFrequency + raceDayPause);
  };

  timer = setTimeout(advanceDay, 0);
}

function play() {
  if (currentIndex >= snapshots.length - 1) {
    currentIndex = 0;
    chart.setOption({
      animationDurationUpdate: 0,
      yAxis: {
        animationDuration: 0,
        animationDurationUpdate: 0,
      },
    });
    updateRaceFrame(currentIndex);
    updateRaceLabel(currentIndex);

    setTimeout(() => {
      chart.setOption({
        animationDurationUpdate: raceUpdateFrequency,
        yAxis: {
          animationDuration: raceAxisAnimationDuration,
          animationDurationUpdate: raceAxisAnimationDuration,
        },
      });
      startTimer();
    }, 100);
  } else {
    startTimer();
  }

  playBtn.textContent = "Pause";
}

function setChartMeta(type) {
  const referenceLabel =
    referencePlayer && sortedNames.includes(referencePlayer)
      ? referencePlayer
      : "líder do dia";
  const meta = {
    positions: {
      title: "Histórico de posições",
      subtitle:
        "Linha temporal da colocação de cada participante ao longo dos dias.",
    },
    "points-leader": {
      title: `Pontuação relativa ao ${referenceLabel}`,
      subtitle:
        "Cada linha mostra a diferença para o líder de cada dia por padrão, com opção de escolher um apostador no seletor.",
    },
    race: {
      title: "Gráfico de barras",
      subtitle: "Bar race com a pontuação acumulada em cada dia.",
    },
  };

  chartTitle.textContent = meta[type].title;
  chartSubtitle.textContent = meta[type].subtitle;
}

function setChartType(type) {
  chartType = type;
  chartButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.type === type);
  });

  setChartMeta(type);
  stopRace();

  if (type === "race") {
    raceControls.classList.remove("hidden");
  } else {
    raceControls.classList.add("hidden");
  }

  updateReferenceUI();

  renderChart();
}

function renderChart() {
  destroyChart();

  if (!snapshots.length) return;

  syncLegend();

  if (chartType === "race") {
    renderRaceChart();
    return;
  }

  resizeChartForParticipants(false);

  if (chartType === "positions") {
    renderPositionsChart();
  } else if (chartType === "points-leader") {
    renderPointsLeaderChart();
  }
}

chartButtons.forEach((button) => {
  button.addEventListener("click", () => setChartType(button.dataset.type));
});

if (referencePickerBtn) {
  referencePickerBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!referenceMenu) return;
    const shouldOpen = !referenceMenu.classList.contains("open");
    referenceMenu.classList.toggle("open");
    if (shouldOpen && referenceFilter) {
      setTimeout(() => {
        referenceFilter.focus();
        referenceFilter.select();
      }, 0);
    }
  });
}

if (referenceMenu) {
  referenceMenu.addEventListener("click", (event) => {
    event.stopPropagation();
  });
}

if (referenceFilter) {
  referenceFilter.addEventListener("input", () => {
    referenceFilterText = referenceFilter.value || "";
    if (chartType === "points-leader") {
      syncReferenceOptions();
    }
  });
}

document.addEventListener("click", () => {
  if (referenceMenu) referenceMenu.classList.remove("open");
});

playBtn.addEventListener("click", () => {
  if (timer) {
    stopRace();
  } else {
    play();
  }
});

async function init() {
  try {
    const response = await fetch("pontuacao-por-dia-grupo-3484.csv");
    if (!response.ok) {
      throw new Error(`Falha ao carregar CSV (${response.status}).`);
    }

    const csvText = await response.text();
    parseCsvData(csvText);

    if (!participantsData.length || !formattedDates.length) {
      throw new Error("CSV sem dados válidos para exibição.");
    }

    setChartType("positions");

    window.addEventListener("resize", () => {
      if (chart) {
        chart.resize();
      }
    });
  } catch (error) {
    chartSubtitle.textContent = "Erro ao carregar o CSV de pontuação.";
    dateDisplay.textContent = "Erro ao carregar CSV";
    playBtn.disabled = true;
    playBtn.textContent = "Indisponível";
    console.error(error);
  }
}

init();
