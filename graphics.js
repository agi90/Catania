import { BoardData } from "./board-data.js";

class Edge {
  constructor(edge) {
    this.edge = edge;
  }

  get size() {
    return this._size;
  }

  set size(value) {
    this._size = value;

    const { hexes } = this.edge;
    // TODO: We probably don't need to create a brand new Hex just to
    // get the x and y value
    const hexesGraphics = hexes.map((hex) => {
      const hexGraphics = new Hex(hex);
      hexGraphics.size = value;
      return hexGraphics;
    });
    // Arrays containing coordinates of the three hexes that intersect in this
    // edge
    const X = hexesGraphics.map((hex) => hex.poly.x);
    const Y = hexesGraphics.map((hex) => hex.poly.y);

    this.x = (X[0] + X[1]) / 2;
    this.y = (Y[0] + Y[1]) / 2;

    const height = value / 12;
    const width = value / 4;

    if (X[0] != X[1] && Y[0] != Y[1]) {
      const m = (-1 * (X[1] - X[0])) / (Y[1] - Y[0]);

      const xGap = width / Math.sqrt(1 + m * m);
      const yGap = (width * m) / Math.sqrt(1 + m * m);

      const xVGap = height / Math.sqrt(1 + 1 / m / m);
      const yVGap = height / m / Math.sqrt(1 + 1 / m / m);

      this.xMax = Math.max(Math.abs(xGap - xVGap), Math.abs(xGap + xVGap));
      this.yMax = Math.max(Math.abs(yGap - yVGap), Math.abs(yGap + yVGap));
      this.xGap = xGap;
      this.yGap = yGap;
      this.xVGap = xVGap;
      this.yVGap = yVGap;
    } else {
      this.xMax = width;
      this.yMax = height;
    }

    this.height = height;
    this.width = width;
  }

  hitCheck(a, b) {
    const { x, y, xMax, yMax } = this;

    // Translate to origin
    const x0 = a - x;
    const y0 = b - y;

    return Math.abs(x0) < xMax && Math.abs(y0) < yMax;
  }

  draw(context) {
    if (!this.edge.state.selected) {
      return;
    }

    const {
      size,
      text,
      x,
      xGap,
      xVGap,
      y,
      yGap,
      yVGap,
      height,
      width,
      edge,
    } = this;

    context.fillStyle = "#F00";
    context.beginPath();

    if (xGap) {
      context.moveTo(x + xGap - xVGap, y + yGap + yVGap);
      context.lineTo(x + xGap + xVGap, y + yGap - yVGap);
      context.lineTo(x - xGap + xVGap, y - yGap - yVGap);
      context.lineTo(x - xGap - xVGap, y - yGap + yVGap);
    } else {
      context.rect(x - height, y - width, height * 2, width * 2);
    }

    context.closePath();
    context.fill();

    context.font = size / 5 + "px serif";
    context.fillStyle = "#FFF";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(edge.text, x, y);
  }
}

class Vertex {
  constructor(vertex) {
    this.vertex = vertex;
  }

  get size() {
    return this._size;
  }

  set size(value) {
    this._size = value;

    const { hexes } = this.vertex;
    // TODO: We probably don't need to create a brand new Hex just to
    // get the x and y value
    const hexesGraphics = hexes.map((hex) => {
      const hexGraphics = new Hex(hex);
      hexGraphics.size = value;
      return hexGraphics;
    });
    const x = hexesGraphics.map((hex) => hex.poly.x);
    const y = hexesGraphics.map((hex) => hex.poly.y);

    this.x = (x[0] + x[1] + x[2]) / 3;
    this.y = (y[0] + y[1] + y[2]) / 3;
    this.radius = value / 4;
  }

  hitCheck(a, b) {
    const { x, y, radius } = this;

    // Translate to origin
    const x0 = a - x;
    const y0 = b - y;

    // Outside of bounding box?
    if (x0 > 2 * radius || y0 > 2 * radius) {
      return false;
      // Distance from center
    } else if (Math.sqrt(x0 * x0 + y0 * y0) < radius) {
      return true;
    }

    return false;
  }

  draw(context) {
    if (!this.vertex.state.selected) {
      return;
    }

    const { x, y, size, radius, vertex } = this;

    context.fillStyle = "#000";
    context.beginPath();
    context.arc(x, y, radius, 0, 2 * Math.PI);
    context.fill();

    context.font = size / 5 + "px serif";
    context.fillStyle = "#FFF";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(vertex.text, x, y);
  }
}

class Hex {
  constructor(hex) {
    this.hex = hex;
  }

  get size() {
    return this._size;
  }

  set size(newSize) {
    const { x, y, type, value, isEdge } = this.hex;
    const xGap = (Math.sqrt(3) * newSize) / 2 + 1 / 2;
    const yGap = newSize / 2 + 1 / 3;
    this._size = newSize;
    this.type = type;
    this.value = value;
    this.isEdge = isEdge;
    this.poly = new HexPoly(
      xGap * x,
      yGap * y,
      newSize,
      BoardData.resourceTypeColor[type],
      value,
      BoardData.pinsSub[value]
    );
  }

  hitCheck(x, y) {
    return this.poly.hitCheck(x, y);
  }

  draw(context) {
    const { poly, hex } = this;
    poly.draw(context, hex.state.selected);
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

export { Hex as HexGraphics, Vertex as VertexGraphics, Edge as EdgeGraphics };
