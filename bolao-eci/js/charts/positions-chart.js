(function () {
  window.BolaoSefCharts = window.BolaoSefCharts || {};

  window.BolaoSefCharts.renderPositionsChart = function renderPositionsChart(ctx) {
    const ec = ctx.initChart();
    if (!ctx.snapshots.length) return;

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
          trigger: "item",
          appendToBody: true,
          confine: true,
          formatter: (params) => {
            const label = ctx.formattedDates[params.dataIndex] || "";
            return `<b>${params.seriesName}</b><br>${label}: ${params.value}º`;
          },
        },
        grid: {
          left: 52,
          right: 150,
          top: 24,
          bottom: 34,
          containLabel: false,
        },
        xAxis: {
          type: "category",
          data: ctx.formattedDates,
          boundaryGap: false,
          axisLabel: { fontSize: 10, color: "#9ca3af" },
          axisLine: { lineStyle: { color: "#e5e7eb" } },
          splitLine: { show: true, lineStyle: { color: "#f3f4f6" } },
        },
        yAxis: {
          type: "value",
          inverse: true,
          min: 1,
          max: ctx.getPositionAxisMax(),
          interval: 1,
          axisLabel: {
            formatter: "{value}º",
            fontSize: 10,
            color: "#9ca3af",
          },
          splitLine: { lineStyle: { color: "#f3f4f6" } },
        },
        series: ctx.sortedNames.map((name) => ({
          name,
          type: "line",
          smooth: true,
          clip: false,
          symbol: "circle",
          symbolSize: 8,
          lineStyle: { width: 2, color: ctx.colorMap[name] },
          itemStyle: {
            color: ctx.colorMap[name],
            borderColor: "#fff",
            borderWidth: 2,
          },
          emphasis: {
            focus: "series",
            lineStyle: { width: 4 },
          },
          endLabel: {
            show: true,
            formatter: "{a}",
            color: ctx.colorMap[name],
            fontSize: 10,
            fontWeight: 700,
            distance: 8,
          },
          labelLayout: { moveOverlap: "shiftY" },
          data: ctx.snapshots.map(
            (snapshot) => snapshot.posMap[name] || ctx.participantsData.length,
          ),
        })),
      },
      false,
      true,
    );
  };
})();
