const PADDLE_H = 14;
const PADDLE_S = 55;
var userInput;
(function (userInput) {
    userInput[userInput["unknown"] = 0] = "unknown";
    userInput[userInput["moveUpStart"] = 1] = "moveUpStart";
    userInput[userInput["moveUpEnd"] = 2] = "moveUpEnd";
    userInput[userInput["moveDownStart"] = 3] = "moveDownStart";
    userInput[userInput["moveDownEnd"] = 4] = "moveDownEnd";
})(userInput || (userInput = {}));
var paddleSide;
(function (paddleSide) {
    paddleSide[paddleSide["unknown"] = 0] = "unknown";
    paddleSide[paddleSide["left"] = 1] = "left";
    paddleSide[paddleSide["right"] = 2] = "right";
})(paddleSide || (paddleSide = {}));
class Paddle {
    x;
    y;
    width;
    height;
    speed;
    dy;
    constructor(x, y, width, height, speed) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.speed = speed;
        this.dy = 0;
    }
    draw(ctx, canvasHeight) {
        let scaleFactor = canvasHeight / 100;
        ctx.fillStyle = "white";
        ctx.fillRect(this.x * scaleFactor, this.y * scaleFactor, this.width * scaleFactor, this.height * scaleFactor);
    }
}
class Ball {
    x;
    y;
    radius;
    speedX;
    speedY;
    constructor(x, y, radius, speed) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.speedX = speed;
        this.speedY = speed;
    }
    draw(ctx, canvasHeight) {
        let scaleFactor = canvasHeight / 100;
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(this.x * scaleFactor, this.y * scaleFactor, this.radius * scaleFactor, 0, Math.PI * 2);
        ctx.fill();
    }
}
class Game {
    canvas;
    ctx;
    paddleLeft;
    paddleRight;
    ball;
    scoreLeft;
    scoreRight;
    ws;
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.paddleLeft = new Paddle(1, 45, 2, PADDLE_H, PADDLE_S);
        this.paddleRight = new Paddle(197, 45, 2, PADDLE_H, PADDLE_S);
        this.ball = new Ball(100, 50, 1, 30);
        this.scoreLeft = 0;
        this.scoreRight = 0;
        this.ws = null;
        this.handleInput();
    }
    updateWebSocket(ws) {
        this.ws = ws;
    }
    updateGameState(message) {
        const data = message.data;
        if (data.paddleLeft !== undefined) {
            this.paddleLeft.y = data.paddleLeft;
        }
        if (data.paddleRight !== undefined) {
            this.paddleRight.y = data.paddleRight;
        }
        if (data.ball) {
            this.ball.x = data.ball.x;
            this.ball.y = data.ball.y;
        }
        if (data.scoreLeft !== undefined) {
            this.scoreLeft = data.scoreLeft;
        }
        if (data.scoreRight !== undefined) {
            this.scoreRight = data.scoreRight;
        }
        this.render();
    }
    handleInput() {
        window.addEventListener("keydown", (e) => {
            let input = userInput.unknown;
            let paddle = paddleSide.unknown;
            if (e.key === "w") {
                input = userInput.moveUpStart;
                paddle = paddleSide.left;
            }
            if (e.key === "s") {
                input = userInput.moveDownStart;
                paddle = paddleSide.left;
            }
            if (e.key === "ArrowUp") {
                input = userInput.moveUpStart;
                paddle = paddleSide.right;
            }
            if (e.key === "ArrowDown") {
                input = userInput.moveDownStart;
                paddle = paddleSide.right;
            }
            if (this.ws &&
                this.ws.readyState === WebSocket.OPEN &&
                input !== userInput.unknown) {
                this.ws.send(JSON.stringify({ type: "game", cmd: input, paddle: paddle }));
            }
        });
        window.addEventListener("keyup", (e) => {
            let input = userInput.unknown;
            let paddle = paddleSide.unknown;
            if (e.key === "w") {
                input = userInput.moveUpEnd;
                paddle = paddleSide.left;
            }
            if (e.key === "s") {
                input = userInput.moveDownEnd;
                paddle = paddleSide.left;
            }
            if (e.key === "ArrowUp") {
                input = userInput.moveUpEnd;
                paddle = paddleSide.right;
            }
            if (e.key === "ArrowDown") {
                input = userInput.moveDownEnd;
                paddle = paddleSide.right;
            }
            if (this.ws &&
                this.ws.readyState === WebSocket.OPEN &&
                input !== userInput.unknown) {
                this.ws.send(JSON.stringify({ type: "game", cmd: input, paddle: paddle }));
            }
        });
    }
    render() {
        this.ctx.fillStyle = "black";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.paddleLeft.draw(this.ctx, this.canvas.height);
        this.paddleRight.draw(this.ctx, this.canvas.height);
        this.ball.draw(this.ctx, this.canvas.height);
        this.ctx.fillStyle = "white";
        this.ctx.font = "20px Arial";
        this.ctx.fillText(`${this.scoreLeft} - ${this.scoreRight}`, this.canvas.width / 2 - 20, 30);
    }
}
const canvas = document.getElementById("pongCanvas");
const game = new Game(canvas);
game.render();
export { game };
