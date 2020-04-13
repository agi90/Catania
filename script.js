import { BoardData } from "./board-data.js";

window.onLoad = function () {
  const canvas = document.querySelector("canvas");
  const context = canvas.getContext("2d");

  const size = Math.min(window.innerWidth, window.innerHeight) / 6;

  const saveState = {};
  saveState.tiles = generateRandomValueArray(BoardData.tiles);
  saveState.pins = generateRandomValueArray(BoardData.pins);
  for (let i = 0; i < saveState.tiles.length; i++) {
    // The desert never has a value pin on it
    if (saveState.tiles[i] == "desert") {
      saveState.pins.splice(i, 0, "");
    }
  }

  const state = initState(size, saveState);
  // force first paint
  state.dirty = true;

  canvas.addEventListener("mousemove", function (e) {
    getCursorPosition(canvas, e, state);
  });

  window.onresize = () => {
    context.canvas.width = window.innerWidth * 2;
    context.canvas.height = window.innerHeight * 2;
    state.dirty = true;
  };

  window.onresize();

  function frame() {
    if (state.dirty) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      paint(state, canvas);
    }
    state.dirty = false;
    window.requestAnimationFrame(frame);
  }

  window.requestAnimationFrame(frame);
};

function initState(size, saveState) {
  const hexes = [];

  for (let id = 0; id < BoardData.hexes.length; id++) {
    const [x, y, edge] = BoardData.hexes[id];
    const hex = new Hex(
      x,
      y,
      size,
      edge ? "edge" : saveState.tiles[id],
      edge ? "" : saveState.pins[id],
      edge
    );
    hexes.push(hex);
  }

  const vertexes = [];

  for (const [a, b, c] of BoardData.vertexes) {
    const vertex = new Vertex(
      [hexes[a], hexes[b], hexes[c]],
      size,
      vertexes.length
    );
    vertexes.push(vertex);
  }

  const edges = [];

  for (const [a, b] of BoardData.edges) {
    const edge = new Edge([vertexes[a], vertexes[b]], size, edges.length);
    edges.push(edge);
  }

  return { hexes, vertexes, edges };
}

function getCursorPosition(canvas, event, state) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  for (const [key, hex] of Object.entries(state.hexes)) {
    state.hexes[key].selected = hex.hitCheck(x, y);
    state.dirty = true;
  }
}

function paint(state, canvas) {
  const context = canvas.getContext("2d");

  for (const hex of state.hexes) {
    hex.draw(context);
  }
}

// TODO: verify, from SO
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function generateRandomValueArray(descriptor) {
  const values = [];
  for (const el of Object.keys(descriptor)) {
    for (let i = 0; i < descriptor[el]; i++) {
      values.push(el);
    }
  }
  shuffleArray(values);
  return values;
}

class Vertex {
  constructor(hexes, size, text) {
    const x = hexes.map((hex) => hex.poly.x);
    const y = hexes.map((hex) => hex.poly.y);

    this.x = (x[0] + x[1] + x[2]) / 3;
    this.y = (y[0] + y[1] + y[2]) / 3;
    this.text = text;
    this.size = size;
    this.hexes = hexes;
  }

  draw(context) {
    const { x, y, size, text } = this;
    context.fillStyle = "#000";
    context.beginPath();
    context.arc(x, y, size / 4, 0, 2 * Math.PI);
    context.fill();

    context.font = size / 5 + "px serif";
    context.fillStyle = "#FFF";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, x, y);
  }
}

class Edge {
  constructor(vertexes, size, text) {
    this.vertexes = vertexes;
    this.text = text;
    this.size = size;

    // compute common hexes
    const setA = new Set(vertexes[0].hexes);
    const setB = new Set(vertexes[1].hexes);
    this.hexes = [];
    for (const hex of setA) {
      if (setB.has(hex)) {
        this.hexes.push(hex);
      }
    }
  }

  draw(context) {
    const { hexes, size, text } = this;

    const x = hexes.map((hex) => hex.poly.x);
    const y = hexes.map((hex) => hex.poly.y);

    const xMid = (x[0] + x[1]) / 2;
    const yMid = (y[0] + y[1]) / 2;

    context.fillStyle = "#F00";
    context.beginPath();

    const height = size / 12;
    const width = size / 4;

    if (x[0] != x[1] && y[0] != y[1]) {
      const m = (-1 * (x[1] - x[0])) / (y[1] - y[0]);

      const xGap = width / Math.sqrt(1 + m * m);
      const yGap = (width * m) / Math.sqrt(1 + m * m);

      const xVGap = height / Math.sqrt(1 + 1 / m / m);
      const yVGap = height / m / Math.sqrt(1 + 1 / m / m);

      context.moveTo(xMid + xGap - xVGap, yMid + yGap + yVGap);
      context.lineTo(xMid + xGap + xVGap, yMid + yGap - yVGap);
      context.lineTo(xMid - xGap + xVGap, yMid - yGap - yVGap);
      context.lineTo(xMid - xGap - xVGap, yMid - yGap + yVGap);
    } else if (y[0] == y[1]) {
      context.rect(xMid - height, yMid - width, height * 2, width * 2);
    }

    context.closePath();
    context.fill();

    context.font = size / 5 + "px serif";
    context.fillStyle = "#FFF";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, xMid, yMid);
  }
}

class Hex {
  constructor(x, y, size, type, value, isEdge) {
    const xGap = (Math.sqrt(3) * size) / 2 + 1 / 2;
    const yGap = size / 2 + 1 / 3;
    this.type = type;
    this.value = value;
    this.isEdge = isEdge;
    this.selected = false;
    this.poly = new HexPoly(
      xGap * x,
      yGap * y,
      size,
      BoardData.resourceTypeColor[type],
      value,
      BoardData.pinsSub[value]
    );
  }

  hitCheck(x, y) {
    return this.poly.hitCheck(x, y);
  }

  draw(context) {
    const { poly, selected } = this;
    poly.draw(context, selected);
  }
}

class HexPoly {
  constructor(x, y, size, color, text, subText) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.color = color;
    this.text = text;
    this.subText = subText;

    this.xGap = (Math.sqrt(3) * size) / 2;
    this.yGap = size / 2;
  }

  hitCheck(a, b) {
    const { x, y, xGap, yGap } = this;

    // Translate everything so that the hex is centered at the origin
    const x0 = a - x;
    const y0 = b - y;

    // If outside of the bounding box, definitely not a hit
    if (x0 < -xGap || x0 > xGap || y0 < -yGap * 2 || y0 > yGap * 2) {
      return false;
      // If inside small square, definitely a hit
    } else if (y0 > -yGap && y0 < yGap) {
      return true;
      // Triangles
    } else if (x0 > 0 && y0 > 0) {
      return y0 < (-yGap / xGap) * x0 + 2 * yGap;
    } else if (x0 < 0 && y0 > 0) {
      return y0 < (yGap / xGap) * x0 + 2 * yGap;
    } else if (x0 > 0 && y0 < 0) {
      return y0 > (yGap / xGap) * x0 - 2 * yGap;
    } else if (x0 < 0 && y0 < 0) {
      return y0 > (-yGap / xGap) * x0 - 2 * yGap;
    }

    return false;
  }

  draw(context, mouseOver = false) {
    const { x, y, xGap, yGap, size, color, text, subText } = this;

    context.globalAlpha = mouseOver ? 0.5 : 1;
    context.fillStyle = color;
    context.beginPath();

    context.moveTo(x, y + yGap * 2);
    context.lineTo(x + xGap, y + yGap);
    context.lineTo(x + xGap, y - yGap);
    context.lineTo(x, y - yGap * 2);
    context.lineTo(x - xGap, y - yGap);
    context.lineTo(x - xGap, y + yGap);

    context.closePath();
    context.fill();

    context.globalAlpha = 1;

    if (text !== "") {
      context.fillStyle = "#eecd9e";
      context.beginPath();
      context.arc(x, y, size / 2.5, 0, 2 * Math.PI);
      context.fill();
    }

    let fillColor = "#000";
    if (text == "8" || text == "6") {
      fillColor = "#C44";
    }

    context.font = "bold " + size / 3 + "px verdana";
    context.fillStyle = fillColor;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, x, y);

    if (subText) {
      context.font = size / 4 + "px sans-serif";
      context.fillText(subText, x, y + size / 4);
    }
  }
}
