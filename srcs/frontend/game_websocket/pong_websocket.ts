// Coordinate system: X 0–200, Y 0–100  (percentage of canvas height).
const PADDLE_H = 14;
const PADDLE_S = 55; // speed of paddle movement
const SPEED_UP = 1.05; // +5 % ball speed each paddle hit
const MAX_SPEED = 120; // hard cap in %/s  – raise or delete if you want
const SPIN_FACTOR = 0.25; // tweak 0.15-0.35 to taste
const BASE_SPEED = 50; // 50 %/s baseline
const SMOOTHING_FACTOR = 0.1; // smoothing factor for paddle and ball server updates
const CLIENT_DELAY = 50; // ms delay for client-side rendering

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
		paddleLeft: { y: number; speed: number };
		paddleRight: { y: number; speed: number };
		ball: { x: number; y: number, speedX: number, speedY: number };
		isRunning?: boolean; //used to indicate if the game is running
		time: number; // timestamp from the server
	};
}

class Paddle {
	x: number;
	y: number;
	targetY: number; // used to smooth server corrections
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
		this.targetY = y;
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
	move(duration: number): void {
		this.y += (this.dy * duration) / 1000;
		if (this.y < 0) {
			this.y = 0;
		} else if (this.y + this.height > 100) {
			this.y = 100 - this.height;
		}
		this.targetY += (this.dy * duration) / 1000;
		if (this.targetY < 0) {
			this.targetY = 0;
		} else if (this.targetY + this.height > 100) {
			this.targetY = 100 - this.height;
		}
		if (Math.abs(this.targetY - this.y) < 5) {
			this.y += (this.targetY - this.y) * SMOOTHING_FACTOR;
		}else{
			this.y = this.targetY; // snap to target if far away
		}
		
	}
}

class Ball {
	x: number;
	targetX: number; // used to smooth server corrections
	targetY: number; // used to smooth server corrections
	y: number;
	radius: number;
	speedX: number;
	speedY: number;

	constructor(x: number, y: number, radius: number, speed: number) {
		this.x = x;
		this.y = y;
		this.targetX = x;
		this.targetY = y;
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
	move(duration: number): void {
		this.x += (this.speedX * duration) / 1000;
		this.y += (this.speedY * duration) / 1000;
		this.targetX += (this.speedX * duration) / 1000;
		this.targetY += (this.speedY * duration) / 1000;
		if (Math.abs(this.targetX - this.x) < 5 && Math.abs(this.targetY - this.y) < 5) {
			this.x += (this.targetX - this.x) * SMOOTHING_FACTOR;
			this.y += (this.targetY - this.y) * SMOOTHING_FACTOR;
		}else{
			this.x = this.targetX;
			this.y = this.targetY;
		}	
	}
}

class Game {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	paddleLeft: Paddle;
	paddleRight: Paddle;
	ball: Ball;
	ws: WebSocket | null;
	lastMsgTime: number;
	prevTime: number;
	isRunning: boolean;
	prevCmd: userInput;
	messageQueue: GameMessage[];
	serverTimeOffset: number; // used to sync server time with client time

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;
		this.ctx = canvas.getContext("2d")!;
		this.paddleLeft = new Paddle(1, 45, 2, PADDLE_H, PADDLE_S);
		this.paddleRight = new Paddle(197, 45, 2, PADDLE_H, PADDLE_S);
		this.ball = new Ball(100, 50, 1, 30);
		this.ws = null;
		this.lastMsgTime = 0;
		this.prevTime = 0;
		this.isRunning = false;
		this.prevCmd = 0;
		this.messageQueue = [];
		this.serverTimeOffset = 0;

		this.handleInput();
	}

	updateWebSocket(ws: WebSocket): void {
		this.ws = ws;
	}

	receiveMessage(message: GameMessage): void {
		this.messageQueue.push(message);
		if (!this.isRunning) {
			this.serverTimeOffset = performance.now() - message.data.time;
			this.updateGameState(message);
		}
	}

	updateGameState(message: GameMessage): void {
		const data = message.data;
		if (!data) return;
		if (data.paddleLeft !== undefined) {
			this.paddleLeft.targetY = data.paddleLeft.y;
			this.paddleLeft.dy = data.paddleLeft.speed;
		}
		if (data.paddleRight !== undefined) {
			this.paddleRight.targetY = data.paddleRight.y;
			this.paddleRight.dy = data.paddleRight.speed;
		}
		if (data.ball) {
			this.ball.targetX = data.ball.x;
			this.ball.targetY = data.ball.y;
			this.ball.speedX = data.ball.speedX;
			this.ball.speedY = data.ball.speedY;
		}
		let perfTime = performance.now();
		this.lastMsgTime = perfTime;
		this.prevTime = data.time + this.serverTimeOffset + CLIENT_DELAY;
		if (data.isRunning){
			if (!this.isRunning) {
				this.isRunning = true;
				this.render(); // render the initial state
			}
			
		}else{
			this.isRunning = false;
		}
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
				input !== userInput.unknown &&
				input !== this.prevCmd // avoid sending the same command repeatedly
			) {
				this.ws.send(
					JSON.stringify({ type: "game", cmd: input, paddle: paddle })
				);
				this.prevCmd = input; // update the previous command
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
				input !== userInput.unknown &&
				input !== this.prevCmd // avoid sending the same command repeatedly
			) {
				this.ws.send(
					JSON.stringify({ type: "game", cmd: input, paddle: paddle })
				);
				this.prevCmd = input; // update the previous command
			}
		});
	}

	private loop(): void {
		if (!this.isRunning) return;
		while (this.messageQueue.length > 0 && performance.now() - (this.messageQueue[0].data.time + this.serverTimeOffset) > CLIENT_DELAY) {
			const message = this.messageQueue.shift();
			this.updateGameState(message);
		}
		const timestamp = performance.now();
		if (timestamp - this.prevTime > 500) {
			this.prevTime = timestamp;
		}
		const dt = timestamp - this.prevTime;
		this.prevTime = timestamp;
		this.paddleLeft.move(dt);
    	this.paddleRight.move(dt);
    	this.ball.move(dt);
		this.render();
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
		requestAnimationFrame(() => this.loop());
	}
}

const canvas = document.getElementById("pongCanvas") as HTMLCanvasElement;
const pongHeader = document.getElementById("pongHeader") as HTMLDivElement;
const game = new Game(canvas);

function resizeCanvas(): void {
	if (!canvas) return;

	const aspectRatio = 2 / 1;
	const maxHeight = (window.innerHeight - 170) * 0.55;
	const maxWidth = window.innerWidth;

	let width = maxWidth;
	let height = width / aspectRatio;

	if (height > maxHeight) {
		height = maxHeight;
		width = height * aspectRatio;
	}

	canvas.style.width = `${width}px`;
	canvas.style.height = `${height}px`;

	canvas.width = width;
	canvas.height = height;
	pongHeader.style.width = `${width}px`;
	game.render();
}

// Run on page load
resizeCanvas();

// Update on window resize
window.addEventListener("resize", resizeCanvas);

export { game, GameMessage };
