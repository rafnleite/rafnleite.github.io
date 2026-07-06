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
let resizeRenderTimer = null;
const tutorialStorageKey = "bolao-sef-tour-v1";
let tutorialState = null;

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
            const encodedName = encodeURIComponent(name);
            return `<button type="button" class="reference-option${name === current ? " active" : ""}" data-value="${encodedName}">${safe}</button>`;
          })
          .join("")
      : `<div class="reference-empty">Nenhum apostador encontrado para o filtro.</div>`);

  referenceOptions.querySelectorAll(".reference-option").forEach((button) => {
    const handleReferenceSelect = (event) => {
      event.preventDefault();
      event.stopPropagation();
      referencePlayer = button.dataset.value
        ? decodeURIComponent(button.dataset.value)
        : "";
      syncReferenceOptions();
      if (referenceMenu) referenceMenu.classList.remove("open");
      setChartMeta(chartType);
      renderChart();
    };

    button.addEventListener("click", handleReferenceSelect);
    button.addEventListener("touchend", handleReferenceSelect, { passive: false });
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
        "As linhas mostram a diferença de pontos de cada apostador para uma referência selecionada (líder do dia ou algum apostador específico)",
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

function exportImage() {
  const card = document.getElementById("ranking-card");
  if (!card || typeof html2canvas !== "function") return;

  html2canvas(card, {
    scale: 2,
    useCORS: false,
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
  }).then((canvas) => {
    const a = document.createElement("a");
    a.download = "bolao_sef_ranking.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  });
}

function scheduleChartRerender() {
  if (!snapshots.length) return;
  if (resizeRenderTimer) {
    clearTimeout(resizeRenderTimer);
  }
  resizeRenderTimer = setTimeout(() => {
    resizeRenderTimer = null;
    renderChart();
  }, 160);
}

function ensureTutorialStyle() {
  if (document.getElementById("onboarding-tour-style")) return;

  const style = document.createElement("style");
  style.id = "onboarding-tour-style";
  style.textContent = `
    .tour-overlay {
      position: fixed;
      inset: 0;
      z-index: 9998;
      pointer-events: none;
    }

    .tour-overlay-pane {
      position: absolute;
      background: rgba(15, 23, 42, 0.58);
      backdrop-filter: blur(2px);
    }

    .tour-highlight {
      position: fixed;
      border: 2px solid #22c55e;
      border-radius: 12px;
      z-index: 9999;
      pointer-events: none;
      transition: all 0.18s ease;
    }

    .tour-card {
      position: fixed;
      width: min(320px, calc(100vw - 24px));
      background: #ffffff;
      border-radius: 14px;
      border: 1px solid #dbe2ea;
      box-shadow: 0 20px 48px rgba(15, 23, 42, 0.22);
      z-index: 10000;
      padding: 12px;
      color: #1f2937;
    }

    .tour-title {
      margin: 0 0 4px;
      font-size: 0.92rem;
      font-weight: 800;
    }

    .tour-text {
      margin: 0;
      font-size: 0.82rem;
      color: #4b5563;
      line-height: 1.35;
    }

    .tour-actions {
      margin-top: 10px;
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }

    .tour-btn {
      border: 1px solid #dbe2ea;
      background: #ffffff;
      color: #374151;
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
    }

    .tour-btn.primary {
      background: #166534;
      border-color: #166534;
      color: #ffffff;
    }
  `;

  document.head.appendChild(style);
}

function createTutorialStepElements() {
  ensureTutorialStyle();

  const overlay = document.createElement("div");
  overlay.className = "tour-overlay";

  const paneTop = document.createElement("div");
  paneTop.className = "tour-overlay-pane";
  const paneRight = document.createElement("div");
  paneRight.className = "tour-overlay-pane";
  const paneBottom = document.createElement("div");
  paneBottom.className = "tour-overlay-pane";
  const paneLeft = document.createElement("div");
  paneLeft.className = "tour-overlay-pane";

  overlay.appendChild(paneTop);
  overlay.appendChild(paneRight);
  overlay.appendChild(paneBottom);
  overlay.appendChild(paneLeft);

  const highlight = document.createElement("div");
  highlight.className = "tour-highlight";

  const card = document.createElement("div");
  card.className = "tour-card";

  const titleEl = document.createElement("h3");
  titleEl.className = "tour-title";

  const textEl = document.createElement("p");
  textEl.className = "tour-text";

  const actions = document.createElement("div");
  actions.className = "tour-actions";

  const leftWrap = document.createElement("div");
  const rightWrap = document.createElement("div");

  const skipBtn = document.createElement("button");
  skipBtn.type = "button";
  skipBtn.className = "tour-btn";
  skipBtn.textContent = "Pular";

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "tour-btn";
  prevBtn.textContent = "Voltar";

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "tour-btn primary";
  nextBtn.textContent = "Próximo";

  leftWrap.appendChild(skipBtn);
  rightWrap.appendChild(prevBtn);
  rightWrap.appendChild(nextBtn);
  actions.appendChild(leftWrap);
  actions.appendChild(rightWrap);

  card.appendChild(titleEl);
  card.appendChild(textEl);
  card.appendChild(actions);

  document.body.appendChild(overlay);
  document.body.appendChild(highlight);
  document.body.appendChild(card);

  tutorialState = {
    index: 0,
    overlay,
    paneTop,
    paneRight,
    paneBottom,
    paneLeft,
    highlight,
    card,
    titleEl,
    textEl,
    prevBtn,
    nextBtn,
    skipBtn,
    steps: [
      {
        title: "Tipo de gráfico",
        text: "Escolha entre os tipos de gráfico disponíveis: Histórico de posições, Pontuação relativa e Gráfico de corrida de barras.",
        target: "#chart-type-toolbar",
        prepare() {
          setChartType("positions");
        },
      },
      {
        title: "Filtro pela legenda",
        text: "Clique nos nomes dos apostadores para mostrar ou esconder participantes no gráfico.",
        target: "#chart-legend",
        prepare() {
          setChartType("positions");
        },
      },
      {
        title: "Referência da pontuação",
        text: "Escolha o líder do dia ou um apostador específico como referência para o gráfico de pontuação comparativa.",
        target: "#reference-controls",
        prepare() {
          setChartType("points-leader");
        },
      },
      {
        title: "Play no gráfico de corrida de barras",
        text: "Use Play para animar a evolução diária no gráfico de barras.",
        target: "#race-controls",
        prepare() {
          setChartType("race");
        },
      },
    ],
  };

  tutorialState.prevBtn.addEventListener("click", () => {
    if (!tutorialState) return;
    tutorialState.index = Math.max(0, tutorialState.index - 1);
    renderTutorialStep();
  });

  tutorialState.nextBtn.addEventListener("click", () => {
    if (!tutorialState) return;
    const isLast = tutorialState.index >= tutorialState.steps.length - 1;
    if (isLast) {
      finishTutorial();
      return;
    }
    tutorialState.index += 1;
    renderTutorialStep();
  });

  tutorialState.skipBtn.addEventListener("click", finishTutorial);
}

function positionTutorialCard(targetRect) {
  if (!tutorialState) return;

  const card = tutorialState.card;
  const margin = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  card.style.left = "12px";
  card.style.top = "12px";

  const cardRect = card.getBoundingClientRect();
  const canPlaceBelow = targetRect.bottom + margin + cardRect.height < vh;
  const top = canPlaceBelow
    ? targetRect.bottom + margin
    : Math.max(12, targetRect.top - cardRect.height - margin);

  const centeredLeft = targetRect.left + targetRect.width / 2 - cardRect.width / 2;
  const left = Math.min(
    vw - cardRect.width - 12,
    Math.max(12, centeredLeft),
  );

  card.style.left = `${Math.round(left)}px`;
  card.style.top = `${Math.round(top)}px`;
}

function renderTutorialStep() {
  if (!tutorialState) return;

  const step = tutorialState.steps[tutorialState.index];
  if (!step) return;

  if (typeof step.prepare === "function") {
    step.prepare();
  }

  window.requestAnimationFrame(() => {
    const target = document.querySelector(step.target);
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const pad = 6;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const left = Math.max(0, Math.round(rect.left - pad));
    const top = Math.max(0, Math.round(rect.top - pad));
    const right = Math.min(vw, Math.round(rect.right + pad));
    const bottom = Math.min(vh, Math.round(rect.bottom + pad));
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);

    tutorialState.paneTop.style.left = "0px";
    tutorialState.paneTop.style.top = "0px";
    tutorialState.paneTop.style.width = `${vw}px`;
    tutorialState.paneTop.style.height = `${top}px`;

    tutorialState.paneRight.style.left = `${right}px`;
    tutorialState.paneRight.style.top = `${top}px`;
    tutorialState.paneRight.style.width = `${Math.max(0, vw - right)}px`;
    tutorialState.paneRight.style.height = `${height}px`;

    tutorialState.paneBottom.style.left = "0px";
    tutorialState.paneBottom.style.top = `${bottom}px`;
    tutorialState.paneBottom.style.width = `${vw}px`;
    tutorialState.paneBottom.style.height = `${Math.max(0, vh - bottom)}px`;

    tutorialState.paneLeft.style.left = "0px";
    tutorialState.paneLeft.style.top = `${top}px`;
    tutorialState.paneLeft.style.width = `${left}px`;
    tutorialState.paneLeft.style.height = `${height}px`;

    tutorialState.highlight.style.left = `${left}px`;
    tutorialState.highlight.style.top = `${top}px`;
    tutorialState.highlight.style.width = `${width}px`;
    tutorialState.highlight.style.height = `${height}px`;

    tutorialState.titleEl.textContent = step.title;
    tutorialState.textEl.textContent = step.text;
    tutorialState.prevBtn.style.visibility = tutorialState.index === 0 ? "hidden" : "visible";
    tutorialState.nextBtn.textContent =
      tutorialState.index === tutorialState.steps.length - 1 ? "Concluir" : "Próximo";

    positionTutorialCard(rect);
  });
}

function finishTutorial() {
  localStorage.setItem(tutorialStorageKey, "done");
  if (!tutorialState) return;

  tutorialState.overlay.remove();
  tutorialState.highlight.remove();
  tutorialState.card.remove();
  tutorialState = null;
  setChartType("positions");
}

function maybeStartTutorial() {
  if (localStorage.getItem(tutorialStorageKey) === "done") return;
  openTutorial();
}

function openTutorial() {
  if (!participantsData.length) return;

  if (!tutorialState) {
    createTutorialStepElements();
    window.addEventListener(
      "resize",
      () => {
        if (tutorialState) renderTutorialStep();
      },
      { passive: true },
    );
  }

  tutorialState.index = 0;
  renderTutorialStep();
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
    maybeStartTutorial();

    window.addEventListener("resize", scheduleChartRerender);
    window.addEventListener("orientationchange", scheduleChartRerender);
  } catch (error) {
    chartSubtitle.textContent = "Erro ao carregar o CSV de pontuação.";
    dateDisplay.textContent = "Erro ao carregar CSV";
    playBtn.disabled = true;
    playBtn.textContent = "Indisponível";
    console.error(error);
  }
}

init();
