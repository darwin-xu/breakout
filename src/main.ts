const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const scoreElement = document.getElementById('score')!;
const livesElement = document.getElementById('lives')!;
const messageElement = document.getElementById('message')!;
const restartBtn = document.getElementById('restartBtn')!;

// Game Constants
const PADDLE_HEIGHT = 10;
const PADDLE_WIDTH = 75;
const BALL_RADIUS = 10;
const BRICK_ROW_COUNT = 5;
const BRICK_COLUMN_COUNT = 9;
const BRICK_WIDTH = 75;
const BRICK_HEIGHT = 20;
const BRICK_PADDING = 10;
const BRICK_OFFSET_TOP = 30;
const BRICK_OFFSET_LEFT = 30;

// Game State
let score = 0;
let lives = 3;
let rightPressed = false;
let leftPressed = false;
let gameRunning = false;
let animationId: number;

// Entities
interface Ball {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

interface Paddle {
  x: number;
}

interface Brick {
  x: number;
  y: number;
  status: number; // 1 = active, 0 = broken
}

let ball: Ball = {
  x: canvas.width / 2,
  y: canvas.height - 30,
  dx: 4,
  dy: -4
};

let paddle: Paddle = {
  x: (canvas.width - PADDLE_WIDTH) / 2
};

let bricks: Brick[][] = [];

// Initialize Bricks
function initBricks() {
  bricks = [];
  for (let c = 0; c < BRICK_COLUMN_COUNT; c++) {
    bricks[c] = [];
    for (let r = 0; r < BRICK_ROW_COUNT; r++) {
      bricks[c][r] = { x: 0, y: 0, status: 1 };
    }
  }
}

// Event Listeners
document.addEventListener('keydown', keyDownHandler, false);
document.addEventListener('keyup', keyUpHandler, false);
restartBtn.addEventListener('click', restartGame);

function keyDownHandler(e: KeyboardEvent) {
  if (e.key === 'Right' || e.key === 'ArrowRight') {
    rightPressed = true;
  } else if (e.key === 'Left' || e.key === 'ArrowLeft') {
    leftPressed = true;
  }
}

function keyUpHandler(e: KeyboardEvent) {
  if (e.key === 'Right' || e.key === 'ArrowRight') {
    rightPressed = false;
  } else if (e.key === 'Left' || e.key === 'ArrowLeft') {
    leftPressed = false;
  }
}

// Drawing Functions
function drawBall() {
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#0095DD';
  ctx.fill();
  ctx.closePath();
}

function drawPaddle() {
  ctx.beginPath();
  ctx.rect(paddle.x, canvas.height - PADDLE_HEIGHT, PADDLE_WIDTH, PADDLE_HEIGHT);
  ctx.fillStyle = '#0095DD';
  ctx.fill();
  ctx.closePath();
}

function drawBricks() {
  for (let c = 0; c < BRICK_COLUMN_COUNT; c++) {
    for (let r = 0; r < BRICK_ROW_COUNT; r++) {
      if (bricks[c][r].status === 1) {
        const brickX = (c * (BRICK_WIDTH + BRICK_PADDING)) + BRICK_OFFSET_LEFT;
        const brickY = (r * (BRICK_HEIGHT + BRICK_PADDING)) + BRICK_OFFSET_TOP;
        bricks[c][r].x = brickX;
        bricks[c][r].y = brickY;
        ctx.beginPath();
        ctx.rect(brickX, brickY, BRICK_WIDTH, BRICK_HEIGHT);
        ctx.fillStyle = '#0095DD';
        ctx.fill();
        ctx.closePath();
      }
    }
  }
}

// Collision Detection
function collisionDetection() {
  for (let c = 0; c < BRICK_COLUMN_COUNT; c++) {
    for (let r = 0; r < BRICK_ROW_COUNT; r++) {
      const b = bricks[c][r];
      if (b.status === 1) {
        if (
          ball.x > b.x &&
          ball.x < b.x + BRICK_WIDTH &&
          ball.y > b.y &&
          ball.y < b.y + BRICK_HEIGHT
        ) {
          ball.dy = -ball.dy;
          b.status = 0;
          score++;
          scoreElement.innerText = score.toString();
          if (score === BRICK_ROW_COUNT * BRICK_COLUMN_COUNT) {
            gameOver(true);
          }
        }
      }
    }
  }
}

// Game Loop
function draw() {
  if (!gameRunning) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBricks();
  drawBall();
  drawPaddle();
  collisionDetection();

  // Ball Movement
  if (ball.x + ball.dx > canvas.width - BALL_RADIUS || ball.x + ball.dx < BALL_RADIUS) {
    ball.dx = -ball.dx;
  }
  if (ball.y + ball.dy < BALL_RADIUS) {
    ball.dy = -ball.dy;
  } else if (ball.y + ball.dy > canvas.height - BALL_RADIUS) {
    if (ball.x > paddle.x && ball.x < paddle.x + PADDLE_WIDTH) {
      ball.dy = -ball.dy;
      // Add some speed up or angle change based on where it hit the paddle could be nice, but keeping it simple
    } else {
      lives--;
      livesElement.innerText = lives.toString();
      if (!lives) {
        gameOver(false);
        return;
      } else {
        ball.x = canvas.width / 2;
        ball.y = canvas.height - 30;
        ball.dx = 4;
        ball.dy = -4;
        paddle.x = (canvas.width - PADDLE_WIDTH) / 2;
      }
    }
  }

  ball.x += ball.dx;
  ball.y += ball.dy;

  // Paddle Movement
  if (rightPressed && paddle.x < canvas.width - PADDLE_WIDTH) {
    paddle.x += 7;
  } else if (leftPressed && paddle.x > 0) {
    paddle.x -= 7;
  }

  animationId = requestAnimationFrame(draw);
}

function gameOver(win: boolean) {
  gameRunning = false;
  cancelAnimationFrame(animationId);
  messageElement.innerText = win ? 'YOU WIN, CONGRATS!' : 'GAME OVER';
  messageElement.classList.remove('hidden');
  restartBtn.classList.remove('hidden');
}

function restartGame() {
  document.location.reload();
}

// Start Game
initBricks();
gameRunning = true;
draw();
