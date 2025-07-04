// Coordinate system: X 0–200, Y 0–100  (percentage of canvas height).

const PADDLE_H = 14;
const PADDLE_S = 55; // speed of paddle movement

enum userInput {
	unknown = 0,
	moveUpStart = 1,
	moveUpEnd = 2,
	moveDownStart = 3,
	moveDownEnd = 4,
}

enum paddleSide {
	unknown = 0,
	left = 1,
	right = 2,
}

interface GameMessage {
	type: "game";
	data: {
		paddleLeft: number;
		paddleRight: number;
		ball: { x: number; y: number };
		scoreLeft: number;
		scoreRight: number;
	};
}

class Paddle {
	x: number;
	y: number;
	width: number;
	height: number;
	speed: number;
	dy: number;

	constructor(
		x: number,
		y: number,
		width: number,
		height: number,
		speed: number
	) {
		this.x = x;
		this.y = y;
		this.width = width;
		this.height = height;
		this.speed = speed;
		this.dy = 0;
	}

	draw(ctx: CanvasRenderingContext2D, canvasHeight: number): void {
		let scaleFactor = canvasHeight / 100;
		ctx.fillStyle = "white";
		ctx.fillRect(
			this.x * scaleFactor,
			this.y * scaleFactor,
			this.width * scaleFactor,
			this.height * scaleFactor
		);
	}
}

class Ball {
	x: number;
	y: number;
	radius: number;
	speedX: number;
	speedY: number;

	constructor(x: number, y: number, radius: number, speed: number) {
		this.x = x;
		this.y = y;
		this.radius = radius;
		this.speedX = speed;
		this.speedY = speed;
	}

	draw(ctx: CanvasRenderingContext2D, canvasHeight: number): void {
		let scaleFactor = canvasHeight / 100;
		ctx.fillStyle = "white";
		ctx.beginPath();
		ctx.arc(
			this.x * scaleFactor,
			this.y * scaleFactor,
			this.radius * scaleFactor,
			0,
			Math.PI * 2
		);
		ctx.fill();
	}
}

class Game {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	paddleLeft: Paddle;
	paddleRight: Paddle;
	ball: Ball;
	scoreLeft: number;
	scoreRight: number;
	ws: WebSocket | null;

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;
		this.ctx = canvas.getContext("2d")!; //need explantion
		this.paddleLeft = new Paddle(1, 45, 2, PADDLE_H, PADDLE_S);
		this.paddleRight = new Paddle(197, 45, 2, PADDLE_H, PADDLE_S);
		this.ball = new Ball(100, 50, 1, 30);
		this.scoreLeft = 0;
		this.scoreRight = 0;
		this.ws = null;
		this.handleInput();
	}

	updateWebSocket(ws: WebSocket): void {
		this.ws = ws;
	}

	updateGameState(message: GameMessage): void {
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

	private handleInput(): void {
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
			// send the input to the server
			if (
				this.ws &&
				this.ws.readyState === WebSocket.OPEN &&
				input !== userInput.unknown
			) {
				this.ws.send(
					JSON.stringify({ type: "game", cmd: input, paddle: paddle })
				);
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
			// send the input to the server
			if (
				this.ws &&
				this.ws.readyState === WebSocket.OPEN &&
				input !== userInput.unknown
			) {
				this.ws.send(
					JSON.stringify({ type: "game", cmd: input, paddle: paddle })
				);
			}
		});
	}

        render(): void {
                /* background + centre net */
                this.ctx.fillStyle = "black";
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

                this.ctx.strokeStyle = "#ff2d95";
                this.ctx.setLineDash([10, 10]);
                this.ctx.lineWidth = 3;
                this.ctx.beginPath();
                this.ctx.moveTo(this.canvas.width / 2, 0);
                this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
                this.ctx.stroke();
                this.ctx.setLineDash([]);

                /* objects */
                this.paddleLeft.draw(this.ctx, this.canvas.height);
                this.paddleRight.draw(this.ctx, this.canvas.height);
                this.ball.draw(this.ctx, this.canvas.height);
        }
}

const canvas = document.getElementById("pongCanvas") as HTMLCanvasElement;

const game = new Game(canvas);
game.render();

export { game, GameMessage };
