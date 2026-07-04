(function () {
  window.BolaoSefCharts = window.BolaoSefCharts || {};

  window.BolaoSefCharts.renderPointsLeaderChart = function renderPointsLeaderChart(ctx) {
    const ec = ctx.initChart();
    if (!ctx.snapshots.length) return;

    const gameLabels = ["Início"].concat(ctx.formattedDates);
    const refName = ctx.getSelectedReferenceName();
    const referenceLabel =
      ctx.referencePlayer && ctx.sortedNames.includes(ctx.referencePlayer)
        ? ctx.referencePlayer
        : "líder do dia";

    function getSeriesValue(snapshot, name) {
      const referenceValue = refName
        ? snapshot.ptsMap[refName] || 0
        : snapshot.leader || 0;
      return (snapshot.ptsMap[name] || 0) - referenceValue;
    }

    const relativeRange = ctx.getRelativeAxisRange(refName);

    ec.setOption(
      {
        animationDuration: ctx.transitionDuration,
        animationDurationUpdate: ctx.transitionDuration,
        legend: {
          show: false,
          data: ctx.sortedNames,
          selected: ctx.sortedNames.reduce((acc, name) => {
            acc[name] = ctx.isSeriesVisible(name);
            return acc;
          }, {}),
        },
        tooltip: {
          trigger: "axis",
          order: "valueDesc",
          appendToBody: true,
          confine: true,
          backgroundColor: "rgba(17, 24, 39, 0.84)",
          borderWidth: 0,
          textStyle: { color: "#fff" },
          formatter: (params) => {
            const snapshot = ctx.snapshots[params[0].dataIndex - 1];
            const lines = [`<b>${gameLabels[params[0].dataIndex]}</b>`];

            if (snapshot) {
              lines.push(`Referência: <b>${refName || "líder do dia"}</b>`);
            }

            params
              .slice()
              .sort((a, b) => b.value - a.value)
              .forEach((item) => {
                lines.push(
                  `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color};margin-right:4px"></span>` +
                    `${item.seriesName}: <b>${item.value} pts da referência</b>`,
                );
              });

            return lines.join("<br>");
          },
        },
        grid: {
          left: 52,
          right: 150,
          top: 24,
          bottom: 34,
          containLabel: true,
        },
        xAxis: {
          type: "category",
          boundaryGap: false,
          data: gameLabels,
          axisLabel: { fontSize: 10, color: "#9ca3af" },
          splitLine: { show: true, lineStyle: { color: "#f3f4f6" } },
        },
        yAxis: {
          type: "value",
          min: Math.min(0, relativeRange.min),
          max: Math.max(0, relativeRange.max),
          name: `Diferença para ${referenceLabel}`,
          nameLocation: "middle",
          nameGap: 48,
          axisLabel: { fontSize: 10, color: "#9ca3af" },
          splitLine: { lineStyle: { color: "#f3f4f6" } },
        },
        series: ctx.sortedNames.map((name) => ({
          name,
          type: "line",
          showSymbol: false,
          smooth: false,
          clip: false,
          lineStyle: { width: 2, color: ctx.colorMap[name] },
          endLabel: {
            show: true,
            formatter: "{a}",
            color: ctx.colorMap[name],
            fontSize: 10,
            fontWeight: 700,
          },
          labelLayout: { moveOverlap: "shiftY" },
          emphasis: { focus: "series" },
          encode: { x: 0, y: 1 },
          data: [0].concat(
            ctx.snapshots.map((snapshot) => getSeriesValue(snapshot, name)),
          ),
        })),
      },
      false,
      true,
    );
  };
})();
