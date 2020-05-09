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
    this.setState({ selected: false, hasRobber: false });
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
    this.cards = [];
    this.setState({ cards: [], roads: 15, villages: 5, cities: 4 });
  }

  _updateCardState() {
    const cards = this.cards.map((c) => c.type);
    this.setState({ cards });
  }

  drawCard(type) {
    const { cards } = this;
    const card = new Card(type);
    cards.push(card);
    this.fire("drawcard", card);
    this._updateCardState();
  }

  hasCards(types) {
    const { cards } = this.state;
    for (const [type, number] of Object.entries(types)) {
      const available = cards.filter((c) => c == type).length;
      if (available < number) {
        return false;
      }
    }
    return true;
  }

  discardSelected() {
    const { cards } = this;
    this.cards = cards.filter((c) => !c.selected);
    this._updateCardState();
  }

  useCards(types) {
    const { cards } = this.state;
    for (const [type, number] of Object.entries(types)) {
      for (let i = 0; i < number; i++) {
        cards.splice(
          cards.findIndex((c) => c.type == type),
          1
        );
      }
    }
    this._updateCardState();
  }
}

class Game extends Element {
  constructor(players, vertexes, edges, hexes) {
    super();
    this.players = [];
    for (let i = 1; i <= players; i++) {
      const player = new Player(i);
      player.addObserver(this);
      this.players.push(player);
    }
    const firstPlayer = Math.floor(Math.random() * players) + 1;
    this.dice = [new Die("die1"), new Die("die2")];
    for (let die of this.dice) {
      this.addObserver(die);
    }

    const actionButton = new ActionButton("action-button");
    this.addObserver(actionButton);
    actionButton.addObserver(this);

    this.setState({
      step: "setup_village",
      action: "setup_village",
      players_number: players,
      firstPlayer,
      currentPlayer: firstPlayer,
      setupTurn: 0,
      turn: null,
      robberTurn: null,
    });

    for (const vertex of vertexes) {
      vertex.addObserver(this);
    }
    for (const edge of edges) {
      edge.addObserver(this);
    }
    for (const hex of hexes) {
      hex.addObserver(this);
      if (hex.type === "desert") {
        hex.setState({ hasRobber: true });
      }
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
      case "drawcard": {
        const card = data;
        data.addObserver(this);
      }
      case "toggle": {
        this.onCardToggled(data);
      }
    }
  }

  buildVillage(vertex) {
    const { currentPlayer } = this;
    const { state } = currentPlayer;
    vertex.setState({ player: currentPlayer.id });
    currentPlayer.setState({ villages: state.villages - 1 });

    if (this.state.step !== "setup_village") {
      currentPlayer.useCards({ wood: 1, brick: 1, wheat: 1, sheep: 1 });
      this.selectBuildable();
    }
  }

  buildRoad(edge) {
    const { currentPlayer } = this;
    const { state } = currentPlayer;
    edge.setState({ player: currentPlayer.id });
    currentPlayer.setState({ roads: state.roads - 1 });

    if (this.state.step !== "setup_road") {
      currentPlayer.useCards({ wood: 1, brick: 1 });
      this.selectBuildable();
    }
  }

  onBuildVillage(vertex) {
    this.buildVillage(vertex);
    if (this.state.step === "setup_village") {
      const { currentPlayer, players, state } = this;
      currentPlayer.setupVillage = vertex;

      // Players get a card for each hex adjacent to their village on the
      // second setup turn.
      if (state.setupTurn >= players.length) {
        for (const hex of vertex.hexes) {
          currentPlayer.drawCard(hex.type);
        }
      }

      // Automatically advance to the next turn since there's nothing else the
      // user can do in this stage
      this.nextTurn();
    }
  }

  onBuildRoad(edge) {
    this.buildRoad(edge);
    if (this.state.step === "setup_road") {
      this.currentPlayer.setupVillage = null;

      // Automatically advance to the next turn since there's nothing else the
      // user can do in this stage
      this.nextTurn();
    }
  }

  onClick(target) {
    if (target instanceof Vertex && this.canBuildVillage(target)) {
      this.onBuildVillage(target);
      return true;
    }
    if (target instanceof Edge && this.canBuildRoad(target)) {
      this.onBuildRoad(target);
      return true;
    }
    if (target instanceof Hex) {
      this.onHexClick(target);
      return true;
    }
    if (target instanceof ActionButton) {
      this.doAction();
    }
  }

  doAction() {
    const { action } = this.state;
    switch (action) {
      case "next_turn":
        this.nextTurn();
        return;
      case "roll_dice":
        this.throwDice();
        return;
      case "robber_discard":
        this.robberDiscard();
        return;
    }
  }

  throwDice() {
    let diceValue = 0;
    for (const die of this.dice) {
      diceValue += die.roll();
    }
    if (diceValue === 7) {
      this.handleRobber();
      return;
    }
    for (const hex of this.hexes) {
      if (hex.value !== diceValue) {
        continue;
      }
      for (const vertex of hex.vertexes) {
        // TODO: handle cities
        const { player: playerId } = vertex.state;
        if (playerId !== null) {
          this.players[playerId - 1].drawCard(hex.type);
        }
      }
    }
    this.setState({ action: "next_turn" });
  }

  handleRobber() {
    this.setState({
      step: "robber_discard",
      action: "robber_discard",
      robberTurn: 0,
    });
    this.selectBuildable();
    this.setState({ currentPlayer: this.currentPlayer.id });
    this.checkRobberCards();
  }

  onCardToggled(card) {
    const { state, currentPlayer } = this;
    const { action } = state;
    if (action === "robber_select" || action === "robber_discard") {
      const { cards } = currentPlayer;
      const selected = cards.filter((c) => c.selected);
      // Players must discard half their cards rounded down
      if (selected.length === Math.floor(cards.length / 2)) {
        this.setState({
          action: "robber_discard",
        });
      } else {
        this.setState({
          action: "robber_select",
        });
      }
    }
  }

  onHexClick(hex) {
    if (this.state.step === "robber_place") {
      if (hex.state.hasRobber) {
        // Cannot place the robber in the same place
        return;
      }
      this.hexes
        .filter((h) => h.state.hasRobber)
        .forEach((h) => h.setState({ hasRobber: false }));
      hex.setState({ hasRobber: true });
      this.nextTurn();
    }
  }

  checkRobberCards() {
    if (this.currentPlayer.state.cards.length < 8) {
      // Player doesn't need to discard, let's advance
      this.nextTurn();
    } else {
      this.setState({
        action: "robber_select",
      });
    }
  }

  nextRobberTurn() {
    let { robberTurn } = this.state;
    robberTurn += 1;

    const { players_number } = this.state;
    if (robberTurn === players_number) {
      // Everyone has discarded cards, let's advance
      this.setState({
        step: "robber_place",
        action: "robber_place",
        robberTurn: null,
      });
    } else {
      this.setState({ robberTurn });
      this.checkRobberCards();
    }
  }

  robberDiscard() {
    this.currentPlayer.discardSelected();
    this.nextTurn();
  }

  nextTurn() {
    const { step } = this.state;
    switch (step) {
      case "setup_village":
        this.setState({ step: "setup_road", action: "setup_road" });
        break;
      case "setup_road":
        const nextTurn = this.state.setupTurn + 1;
        if (nextTurn == SETUP_PLAYER_TURNS[this.players.length].length) {
          this.setState({
            step: "turn",
            setupTurn: null,
            turn: 0,
            action: "roll_dice",
          });
        } else {
          this.setState({
            step: "setup_village",
            action: "setup_village",
            setupTurn: nextTurn,
          });
        }
        break;
      case "robber_discard":
        this.nextRobberTurn();
        break;
      case "robber_place":
        this.setState({ step: "turn", action: "roll_dice" });
        break;
      case "turn":
        this.setState({ turn: this.state.turn + 1, action: "roll_dice" });
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
    const { step, firstPlayer, robberTurn, setupTurn, turn } = state;
    let player;
    if (step === "setup_village" || step === "setup_road") {
      const playerOffset = SETUP_PLAYER_TURNS[players.length][setupTurn];
      player = firstPlayer + playerOffset;
    } else if (step === "robber_discard") {
      player = firstPlayer + robberTurn;
    } else {
      player = turn + firstPlayer;
    }
    return players[(player - 1) % players.length];
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
        // Check if player has enough resources
        if (!currentPlayer.hasCards({ wood: 1, brick: 1 })) {
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
        // First, check if player has enough resources
        if (
          !currentPlayer.hasCards({ wood: 1, brick: 1, sheep: 1, wheat: 1 })
        ) {
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

const ACTIONS = {
  next_turn: {
    text: "Next Turn",
  },
  roll_dice: {
    text: "Roll Dice",
  },
  robber_select: {
    text: "Select Cards",
    disabled: true,
  },
  robber_discard: {
    text: "Discard Cards",
  },
  robber_place: {
    text: "Place Robber",
    disabled: true,
  },
  setup_village: {
    text: "Place Village",
    disabled: true,
  },
  setup_road: {
    text: "Place Road",
    disabled: true,
  },
};

class ActionButton extends Element {
  constructor(id) {
    super();
    this.id = id;
    this.el = document.querySelector("#" + id);
    this.el.addEventListener("click", () => {
      this.fire("click");
    });
  }

  onEvent(eventName, target, data) {
    if (eventName === "statechange") {
      const { action } = data;
      if (action === undefined) {
        return;
      } else if (action === null) {
        this.el.style.display = "none";
      } else {
        this.onAction(action);
      }
    }
  }

  onAction(action) {
    const data = ACTIONS[action];
    if (!data) {
      throw `Unknown action ${action}`;
    }

    this.el.innerHTML = data.text;
    this.el.disabled = "disabled" in data ? data.disabled : false;
    this.el.style.display = "initial";
  }

  setEnabled(enabled) {
    this.el.disabled = !enabled;
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

  onEvent(eventName, target, data) {
    if (eventName === "statechange") {
      const { action, step } = data;
      if (
        step === "setup_village" ||
        step === "setup_road" ||
        action === "roll_dice"
      ) {
        this.el.style.opacity = "0";
        this.el.style.transition = "";
      } else {
        this.el.style.opacity = "1";
        this.el.style.transition = "opacity ease-out 300ms";
      }
    }
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

class Card extends Element {
  constructor(type) {
    super();
    this.type = type;
    this.setState({ selected: null, selectable: true });
  }

  get selected() {
    return this.state.selectable && this.state.selected;
  }

  toggle() {
    const { selectable, selected } = this.state;
    if (selectable) {
      this.setState({ selected: !selected });
      this.fire("toggle", selected);
    }
  }
}

export { Game, Vertex, Edge, Hex, Die, Element };
