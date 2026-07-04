(function () {
  window.BolaoSefCharts = window.BolaoSefCharts || {};

  window.BolaoSefCharts.renderRaceChart = function renderRaceChart(ctx) {
    ctx.destroyChart();
    if (!ctx.snapshots.length) return;

    ctx.resizeChartForParticipants(true);

    const sorted =
      Array.isArray(ctx.sorted) && ctx.sorted.length ? ctx.sorted : ctx.sortedNames;

    ctx.setRaceCurrentSorted(sorted);

    const lastIdx = ctx.snapshots.length - 1;
    const scrubber = document.getElementById("race-scrubber");
    if (scrubber) {
      scrubber.max = lastIdx;
      scrubber.value = lastIdx;
    }

    ctx.updateRaceLabel(lastIdx);

    const racePlayBtn = document.getElementById("race-play-btn");
    if (racePlayBtn) {
      racePlayBtn.innerHTML = "&#9654;";
    }

    const snapLast = ctx.snapshots[lastIdx];

    const ec = ctx.initChart();
    ec.setOption({
      grid: { top: 10, bottom: 30, left: 10, right: 50, containLabel: true },
      xAxis: {
        min: 0,
        max: "dataMax",
        scale: false,
        axisLabel: {
          color: "#9ca3af",
          fontSize: 10,
          formatter: function (v) {
            return Math.round(v);
          },
        },
        splitLine: { lineStyle: { color: "#f3f4f6" } },
      },
      yAxis: {
        type: "category",
        data: sorted,
        inverse: true,
        animationDuration: ctx.raceAxisAnimationDuration,
        animationDurationUpdate: ctx.raceAxisAnimationDuration,
        axisLabel: {
          fontSize: 12,
          color: "#374151",
          fontWeight: 600,
          width: 140,
          overflow: "truncate",
          interval: 0,
        },
      },
      series: [
        {
          realtimeSort: true,
          type: "bar",
          barMaxWidth: 34,
          data: sorted.map(function (name) {
            return {
              value: snapLast.ptsMap[name] || 0,
              itemStyle: { color: ctx.colorMap[name] },
            };
          }),
          label: {
            show: true,
            position: "right",
            color: "#374151",
            fontSize: 12,
            fontWeight: 700,
            valueAnimation: true,
            formatter: function (p) {
              return p.value;
            },
          },
        },
      ],
      animationDuration: 0,
      animationDurationUpdate: ctx.raceUpdateFrequency,
      animationEasing: "linear",
      animationEasingUpdate: "linear",
    });

    ctx.updateRaceLabel(ctx.currentIndex);
  };

  window.BolaoSefCharts.updateRaceFrame = function updateRaceFrame(ctx) {
    if (!ctx.chart) return;

    const snapshot = ctx.snapshots[ctx.index];
    if (!snapshot) return;

    ctx.chart.setOption({
      series: [
        {
          data: ctx.raceCurrentSorted.map((name) => ({
            value: snapshot.ptsMap[name] || 0,
            itemStyle: { color: ctx.colorMap[name] },
          })),
        },
      ],
    });
  };
})();
