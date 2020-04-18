import { BoardData } from "./board-data.js";
import { HexGraphics, VertexGraphics, EdgeGraphics } from "./graphics.js";

const FORWARD_MOUSE_EVENTS = ["mouseup", "mousedown", "click", "mousemove"];

window.onLoad = function () {
  const canvas = document.querySelector("canvas");
  const context = canvas.getContext("2d");

  const saveState = {};
  saveState.tiles = generateRandomValueArray(BoardData.tiles);
  saveState.pins = generateRandomValueArray(BoardData.pins);
  for (let i = 0; i < saveState.tiles.length; i++) {
    // The desert never has a value pin on it
    if (saveState.tiles[i] == "desert") {
      saveState.pins.splice(i, 0, "");
    }
  }

  const state = initState(saveState);
  const graphicsState = initGraphicsState(state);

  const stateObserver = {
    onEvent(event, state) {
      if (event === "statechange") {
        graphicsState.dirty = true;
      }
    },
  };

  for (const element of [...state.hexes, ...state.vertexes, ...state.edges]) {
    element.addObserver(stateObserver);
  }

  // force first paint
  graphicsState.dirty = true;

  for (const eventName of FORWARD_MOUSE_EVENTS) {
    forwardMouseEvent(eventName, canvas, graphicsState);
  }

  window.onresize = () => {
    // XXX lots of magic numbers, mainly to make the board centered and of the right size
    const canvasWidth =
      Math.min(canvas.parentElement.clientWidth - 20, window.innerHeight) * 0.9;
    const size = canvasWidth / 12.23;
    const canvasHeight = canvasWidth * 0.91;
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = canvasWidth + "px";
    canvas.style.height = canvasHeight + "px";
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    context.scale(dpr, dpr);
    const { hexes, vertexes, edges } = graphicsState;
    for (const element of [
      ...Object.values(hexes),
      ...Object.values(vertexes),
      ...Object.values(edges),
    ]) {
      element.size = size;
    }
    graphicsState.dirty = true;
  };

  window.onresize();

  function frame() {
    if (graphicsState.dirty) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      paint(graphicsState, canvas);
    }
    graphicsState.dirty = false;
    window.requestAnimationFrame(frame);
  }

  window.requestAnimationFrame(frame);
};

function initState(saveState) {
  const hexes = [];

  for (let id = 0; id < BoardData.hexes.length; id++) {
    const [x, y, edge] = BoardData.hexes[id];
    const hex = new Hex(
      x,
      y,
      edge ? "edge" : saveState.tiles[id],
      edge ? "" : saveState.pins[id],
      edge
    );
    hexes.push(hex);
  }

  const vertexes = [];

  for (const [a, b, c] of BoardData.vertexes) {
    const vertex = new Vertex([hexes[a], hexes[b], hexes[c]], vertexes.length);
    vertexes.push(vertex);
  }

  const edges = [];

  for (const [a, b] of BoardData.edges) {
    const edge = new Edge([vertexes[a], vertexes[b]], edges.length);
    edges.push(edge);
  }

  return { hexes, vertexes, edges };
}

function initGraphicsState(state) {
  const graphicsState = {
    hexes: {},
    vertexes: {},
    edges: {},
  };

  const { hexes, vertexes, edges } = state;

  for (const [key, hex] of Object.entries(hexes)) {
    graphicsState.hexes[key] = new HexGraphics(hex);
  }

  for (const [key, vertex] of Object.entries(vertexes)) {
    graphicsState.vertexes[key] = new VertexGraphics(vertex);
  }

  for (const [key, edge] of Object.entries(edges)) {
    graphicsState.edges[key] = new EdgeGraphics(edge);
  }

  return graphicsState;
}

function hitCheck(x, y, state) {
  const result = {
    hexGraphics: null,
    vertexGraphics: null,
    edgeGraphics: null,
  };

  for (const hex of Object.values(state.hexes)) {
    if (hex.hitCheck(x, y)) {
      result.hexGraphics = hex;
    }
  }

  for (const vertex of Object.values(state.vertexes)) {
    if (vertex.hitCheck(x, y)) {
      result.vertexGraphics = vertex;
    }
  }

  for (const edge of Object.values(state.edges)) {
    if (edge.hitCheck(x, y)) {
      result.edgeGraphics = edge;
    }
  }

  return result;
}

function getCoordinates(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  return [x, y];
}

function paint(state, canvas) {
  const context = canvas.getContext("2d");
  const { hexes, vertexes, edges } = state;

  for (const hex of Object.values(hexes)) {
    hex.draw(context);
  }

  for (const vertex of Object.values(vertexes)) {
    vertex.draw(context);
  }

  for (const edge of Object.values(edges)) {
    edge.draw(context);
  }
}

// TODO: verify, from SO
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function forwardMouseEvent(eventName, canvas, graphicsState) {
  canvas.addEventListener(eventName, function (e) {
    const [x, y] = getCoordinates(canvas, e);
    const { vertexGraphics, edgeGraphics, hexGraphics } = hitCheck(
      x,
      y,
      graphicsState
    );

    // Only fire the event on the next element in the hierarchy if the upper
    // element didn't handle the event.
    if (vertexGraphics && vertexGraphics.vertex.fire(eventName)) {
      return;
    }

    if (edgeGraphics && edgeGraphics.edge.fire(eventName)) {
      return;
    }

    if (hexGraphics && hexGraphics.hex.fire(eventName)) {
      return;
    }
  });
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

class Element {
  constructor() {
    this._observers = [];
    this._state = {};
  }

  addObserver(observer) {
    this._observers.push(observer);
  }

  fire(eventName, data = null) {
    let handled = false;
    for (const observer of this._observers) {
      handled = handled || observer.onEvent(eventName, this, data);
    }
    return handled;
  }

  setState(values) {
    const { _state, _observers } = this;

    for (const [key, value] of Object.entries(values)) {
      _state[key] = value;
    }

    this.fire("statechange", _state);
  }

  get state() {
    return this._state;
  }
}

class Vertex extends Element {
  constructor(hexes, text) {
    super();

    this.hexes = hexes;
    this.text = text;
    this.setState({ selected: false });
  }

  fire(eventName, data) {
    super.fire(eventName, data);
    if (eventName === "click") {
      this.setState({ selected: !this.state.selected });
      // handled
      return true;
    }
  }
}

class Edge extends Element {
  constructor(vertexes, text) {
    super();

    this.vertexes = vertexes;
    this.text = text;
    this.setState({ selected: false });

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

  fire(eventName, data) {
    super.fire(eventName, data);
    if (eventName === "click") {
      this.setState({ selected: !this.state.selected });
      // handled
      return true;
    }
  }
}

class Hex extends Element {
  constructor(x, y, type, value, isEdge) {
    super();

    this.x = x;
    this.y = y;
    this.type = type;
    this.value = value;
    this.isEdge = isEdge;
    this.setState({ selected: false });
  }

  fire(eventName, data) {
    super.fire(eventName, data);
    if (eventName === "click" && !this.isEdge) {
      this.setState({ selected: !this.state.selected });
      // handled
      return true;
    }
  }
}
