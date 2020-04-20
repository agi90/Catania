import { BoardData } from "./board-data.js";

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
    const { _state } = this;
    this.setInnerState(_state, values);
    this.fire("statechange", _state);
  }

  setInnerState(state, values) {
    for (const [key, value] of Object.entries(values)) {
      if (typeof value == "object" && value) {
        if (!(key in state)) {
          state[key] = Array.isArray(value) ? [] : {};
        }
        this.setInnerState(state[key], value);
      } else {
        state[key] = value;
      }
    }
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
    this.setState({ selected: false, player: null });
    this.edges = [];

    for (const hex of hexes) {
      hex.addVertex(this);
    }
  }

  addEdge(edge) {
    this.edges.push(edge);
  }

  get siblings() {
    if (!this._siblings) {
      this._siblings = [];
      for (const edge of this.edges) {
        for (const vertex of edge.vertexes) {
          if (vertex != this) {
            this.siblings.push(vertex);
          }
        }
      }
    }
    return this._siblings;
  }
}

class Edge extends Element {
  constructor(vertexes, text) {
    super();

    this.vertexes = vertexes;
    this.text = text;
    this.setState({ selected: false, player: null });

    for (const vertex of vertexes) {
      vertex.addEdge(this);
    }

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
}

class Hex extends Element {
  constructor(x, y, type, value, isEdge) {
    super();

    this.x = x;
    this.y = y;
    this.type = type;
    this.value = value !== "" ? Number(value) : "";
    this.isEdge = isEdge;
    this.setState({ selected: false });
    this.vertexes = [];
  }

  addVertex(vertex) {
    this.vertexes.push(vertex);
  }
}

const GAME_STATES = [
  // Player places his village
  "setup_village",
  // Player places his road
  "setup_road",
  // Player must discard cards because the robber has been rolled
  "robber_discard",
  // Robber needs to be placed on the board
  "robber_place",
  // Regular turn
  "turn",
];

const SETUP_PLAYER_TURNS = {
  "2": [0, 1, 1, 0], // Not legal, for testing
  "3": [0, 1, 2, 2, 1, 0],
  "4": [0, 1, 2, 3, 3, 2, 1, 0],
  "5": [0, 1, 2, 3, 4, 4, 3, 2, 1, 0],
  "6": [0, 1, 2, 3, 4, 5, 5, 4, 3, 2, 1, 0],
};

class Player extends Element {
  constructor(id) {
    super();
    this.id = id;
    this.setupVillage = null;

    const cards = {};
    for (const resource of BoardData.resources) {
      cards[resource] = 0;
    }
    this.setState({ cards, roads: 15, villages: 5, cities: 4 });
  }
}

class Game extends Element {
  constructor(players, vertexes, edges, hexes) {
    super();
    this.players = [];
    for (let i = 1; i <= players; i++) {
      this.players.push(new Player(i));
    }
    const firstPlayer = Math.floor(Math.random() * players) + 1;
    this.setState({
      step: "setup_village",
      players_number: players,
      firstPlayer,
      currentPlayer: firstPlayer,
      setupTurn: 0,
      turn: null,
    });

    this.dice = [new Die("die1"), new Die("die2")];

    const self = this;
    this.dice[0].addObserver({
      onEvent() {
        if (self.state.step === "turn") {
          self.nextTurn();
        }
      },
    });

    for (const vertex of vertexes) {
      vertex.addObserver(this);
    }
    for (const edge of edges) {
      edge.addObserver(this);
    }
    this.edges = edges;
    this.vertexes = vertexes;
    this.hexes = hexes;
    this.selectBuildable();
  }

  onEvent(eventName, target, data) {
    switch (eventName) {
      case "click": {
        return this.onClick(target);
      }
    }
  }

  buildVillage(vertex) {
    const { currentPlayer } = this;
    const { state } = currentPlayer;
    vertex.setState({ player: currentPlayer.id });
    currentPlayer.setState({ villages: state.villages - 1 });

    if (this.state.step !== "setup_village") {
      const { wood, brick, wheat, sheep } = state.cards;
      currentPlayer.setState({
        cards: {
          wood: wood - 1,
          brick: brick - 1,
          wheat: wheat - 1,
          sheep: sheep - 1,
        },
      });
    }
  }

  buildRoad(edge) {
    const { currentPlayer } = this;
    const { state } = currentPlayer;
    edge.setState({ player: currentPlayer.id });
    currentPlayer.setState({ roads: state.roads - 1 });

    if (this.state.step !== "setup_road") {
      const { wood, brick } = state.cards;
      currentPlayer.setState({
        cards: {
          wood: wood - 1,
          brick: brick - 1,
        },
      });
    }
  }

  onClick(target) {
    if (target instanceof Vertex && this.canBuildVillage(target)) {
      this.buildVillage(target);
      if (this.state.step === "setup_village") {
        this.currentPlayer.setupVillage = target;
        this.nextTurn();
      } else {
        console.log(this.currentPlayer);
        this.selectBuildable();
      }
      return true;
    }
    if (target instanceof Edge && this.canBuildRoad(target)) {
      this.buildRoad(target);
      if (this.state.step === "setup_road") {
        this.currentPlayer.setupVillage = null;
        this.nextTurn();
      } else {
        console.log(this.currentPlayer);
        this.selectBuildable();
      }
      return true;
    }
  }

  nextNonSetupTurn() {
    console.log(this.currentPlayer);
    let diceValue = 0;
    for (const die of this.dice) {
      diceValue += die.roll();
    }
    if (diceValue === 7) {
      this.handleRobber();
    }
    for (const hex of this.hexes) {
      if (hex.value !== diceValue) {
        continue;
      }
      for (const vertex of hex.vertexes) {
        // TODO: handle cities
        const { player: playerId } = vertex.state;
        if (playerId !== null) {
          const player = this.players[playerId - 1];
          const { cards } = player.state;
          cards[hex.type] += 1;
          player.setState({ cards });
        }
      }
    }
    console.log(this.currentPlayer.state.cards);
  }

  handleRobber() {
    console.log("Robber!");
  }

  nextTurn() {
    const { step } = this.state;
    switch (step) {
      case "setup_village":
        this.setState({ step: "setup_road" });
        break;
      case "setup_road":
        this.setState({
          step: "setup_village",
          setupTurn: this.state.setupTurn + 1,
        });
        if (
          this.state.setupTurn == SETUP_PLAYER_TURNS[this.players.length].length
        ) {
          this.setState({ step: "turn", setupTurn: null, turn: 0 });
          this.nextNonSetupTurn();
        }
        break;
      case "turn":
        this.setState({ turn: this.state.turn + 1 });
        this.nextNonSetupTurn();
        break;
    }
    this.selectBuildable();
    this.setState({ currentPlayer: this.currentPlayer.id });
  }

  unselectAll() {
    const { edges, vertexes } = this;
    for (const edge of edges) {
      edge.setState({ selected: false });
    }
    for (const vertex of vertexes) {
      vertex.setState({ selected: false });
    }
  }

  selectBuildable() {
    this.unselectAll();
    const { edges, vertexes } = this;
    for (const edge of edges) {
      if (this.canBuildRoad(edge)) {
        edge.setState({ selected: true });
      }
    }
    for (const vertex of vertexes) {
      if (this.canBuildVillage(vertex)) {
        vertex.setState({ selected: true });
      }
    }
  }

  get currentPlayer() {
    const { state, players } = this;
    const { step, firstPlayer, setupTurn, turn } = state;
    if (step === "setup_village" || step === "setup_road") {
      const player_offset = SETUP_PLAYER_TURNS[players.length][setupTurn];
      let player = firstPlayer + player_offset;
      if (player > players.length) {
        player -= players.length;
      }
      return this.players[player - 1];
    }
    return players[(turn + firstPlayer - 1) % players.length];
  }

  canBuildRoad(edge) {
    switch (this.state.step) {
      case "setup_village":
        return false;
      case "setup_road":
        for (const vertex of edge.vertexes) {
          if (vertex === this.currentPlayer.setupVillage) {
            return true;
          }
        }
        return false;
      case "turn":
        const { currentPlayer } = this;
        const { state } = currentPlayer;
        if (state.roads <= 0) {
          // No roads left
          return false;
        }
        const { wood, brick } = state.cards;
        // Check if player has enough resources
        if (wood < 1 || brick < 1) {
          return false;
        }
        for (const vertex of edge.vertexes) {
          // Can only build a road next to a village or..
          if (vertex.state.player == currentPlayer.id) {
            return true;
          }
          // .. next to another road, but only if there's no village
          if (vertex.state.player === null) {
            for (const edge of vertex.edges) {
              if (edge.state.player === currentPlayer.id) {
                return true;
              }
            }
          }
        }
        return false;
    }
  }

  canBuildVillage(vertex) {
    switch (this.state.step) {
      case "setup_village":
        // Can only build if no adiajent vertex has a village
        for (const sibling of vertex.siblings) {
          if (sibling.state.player !== null) {
            return false;
          }
        }
        return true;
      case "setup_road":
        return false;
      case "turn":
        const { currentPlayer } = this;
        const { state } = currentPlayer;
        if (state.villages <= 0) {
          // No villages left
          return;
        }
        const { wood, brick, sheep, wheat } = state.cards;
        // First, check if player has enough resources
        if (wood < 1 || brick < 1 || sheep < 1 || wheat < 1) {
          return false;
        }
        for (const sibling of vertex.siblings) {
          // Can't build a village next to another village
          if (sibling.state.player !== null) {
            return false;
          }
        }
        // Village needs to be next to own road
        for (const edge of vertex.edges) {
          if (edge.state.player === currentPlayer.id) {
            return true;
          }
        }
        return false;
    }
  }
}

class Die extends Element {
  constructor(id) {
    super();
    this.el = document.querySelector("#" + id);
    this.value = 1;
    this.update();
    this.el.addEventListener("click", () => {
      this.fire("click");
    });
  }

  roll() {
    this.value = Math.floor(Math.random() * 6) + 1;
    this.update();
    return this.value;
  }

  update() {
    const { el, value } = this;
    for (let i = 1; i <= 6; i++) {
      el.classList.remove(`die-${i}`);
    }
    el.classList.add(`die-${value}`);
  }
}

export { Game, Vertex, Edge, Hex, Die, Element };
