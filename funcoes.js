function getColor(d, tom = 0) {
    if (tom == 0) {
        arrayColors = [
            "#e6194B",
            "#3cb44b",
            "#ffe119",
            "#4363d8",
            "#f58231",
            "#911eb4",
            "#42d4f4",
            "#f032e6",
            "#bfef45",
            "#fabed4",
            "#469990",
            "#dcbeff",
            "#9A6324",
            "#fffac8",
            "#800000",
            "#aaffc3",
            "#808000",
            "#ffd8b1",
            "#000075",
            "#a9a9a9",
            "#ffffff",
            "#000000",
        ];
    }
    if (tom == -1) {
        arrayColors = [
            "#f28ca5",
            "#9dd9a5",
            "#fff08c",
            "#a1b1eb",
            "#fac098",
            "#c88ed9",
            "#a0e9f9",
            "#f798f2",
            "#dff7a2",
            "#fcdee9",
            "#a2ccc7",
            "#eddeff",
            "#ccb191",
            "#fffce3",
            "#bf7f7f",
            "#d4ffe1",
            "#bfbf7f",
            "#ffebd8",
            "#7f7fba",
            "#d4d4d4",
            "#ffffff",
            "#7f7f7f",
        ];
    }
    if (tom == 1) {
        arrayColors = [
            "#730c25",
            "#1e5a25",
            "#7f700c",
            "#21316c",
            "#7a4118",
            "#480f5a",
            "#216a7a",
            "#781973",
            "#5f7722",
            "#7d5f6a",
            "#234c48",
            "#6e5f7f",
            "#4d3112",
            "#7f7d64",
            "#400000",
            "#557f61",
            "#404000",
            "#7f6c58",
            "#00003a",
            "#545454",
            "#7f7f7f",
            "#000000",
        ];
    }

    return arrayColors[Number(d)];
}

function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
        }
        : null;
}

function groupBy(xs, key) {
    return xs.reduce(function (rv, x) {
        (rv[x[key]] = rv[x[key]] || []).push(x);
        return rv;
    }, {});
}

function getMinimoValor(array) {
    array = array.filter((x) => x != null);
    let numerico = typeof array[0] == "number";
    numerico ? array.sort((a, b) => Number(a) - Number(b)) : array.sort();
    return array[0];
}

function getMaximoValor(array) {
    array = array.filter((x) => x != null);
    let numerico = typeof array[0] == "number";
    numerico ? array.sort((a, b) => Number(a) - Number(b)) : array.sort();
    return array[array.length - 1];
}