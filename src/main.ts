import { DQNAgent, type AgentSnapshot } from './ai';

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const scoreElement = document.getElementById('score')!;
const livesElement = document.getElementById('lives')!;
const messageElement = document.getElementById('message')!;
const restartBtn = document.getElementById('restartBtn')!;
const aiCheckbox = document.getElementById('aiMode') as HTMLInputElement;
const epsilonDisplay = document.getElementById('epsilonDisplay')!;
const aiStatsElement = document.getElementById('aiStats')!;
const aiEpisodeElement = document.getElementById('aiEpisode')!;
const aiHighScoreElement = document.getElementById('aiHighScore')!;
const aiAvgRewardElement = document.getElementById('aiAvgReward')!;
const aiAvgLengthElement = document.getElementById('aiAvgLength')!;
const aiHistoryElement = document.getElementById('aiHistory')!;

// Game Constants
const PADDLE_HEIGHT = 10;
const PADDLE_WIDTH = 75;
const BALL_RADIUS = 10;
const BALL_BASE_SPEED = Math.sqrt(4 * 4 + 4 * 4);
const BRICK_ROW_COUNT = 5;
const BRICK_COLUMN_COUNT = 8;
const BRICK_WIDTH = 75;
const BRICK_HEIGHT = 20;
const BRICK_PADDING = 10;
const BRICK_OFFSET_TOP = 60;
const BRICK_OFFSET_LEFT = 65;
const PADDLE_BOTTOM_MARGIN = 50;
const MAX_HISTORY = 10;
const AGENT_STORAGE_KEY = 'breakout-ai-agent-v1';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

// Game State
let score = 0;
let lives = 3;
let rightPressed = false;
let leftPressed = false;
let gameRunning = false;
let ballMoving = false;
let animationId: number;
let lastFrameReward = 0;
let aiEpisode = 0;
let aiHighScore = 0;
let currentEpisodeReward = 0;
let currentEpisodeFrames = 0;
const recentRewards: number[] = [];
const recentLengths: number[] = [];
const recentEpisodes: EpisodeSummary[] = [];
let pendingTerminalState: number[] | null = null;
let pendingTerminalDone = false;
let pendingGameOverResult: boolean | null = null;

const agent = new DQNAgent(5, 3);
loadAgentFromStorage();
let latestServerSync: Promise<boolean> | null = loadAgentFromServer();

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

type EpisodeSummary = {
  episode: number;
  score: number;
  reward: number;
  frames: number;
  epsilon: number;
};

let ball: Ball = {
  x: canvas.width / 2,
  y: canvas.height - 30 - PADDLE_BOTTOM_MARGIN,
  dx: 4,
  dy: -4
};

let paddle: Paddle = {
  x: (canvas.width - PADDLE_WIDTH) / 2
};

let bricks: Brick[][] = [];

function resetBallPosition() {
  ball.x = canvas.width / 2;
  ball.y = canvas.height - 30 - PADDLE_BOTTOM_MARGIN;
}

function randomizeBallDirection() {
  const minAngle = -Math.PI / 3;
  const maxAngle = Math.PI / 3;
  const angle = Math.random() * (maxAngle - minAngle) + minAngle;
  ball.dx = BALL_BASE_SPEED * Math.sin(angle);
  ball.dy = -Math.abs(BALL_BASE_SPEED * Math.cos(angle));
}

function resetBallState() {
  resetBallPosition();
  randomizeBallDirection();
}

resetBallState();

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
aiCheckbox.addEventListener('change', async () => {
  const enabled = aiCheckbox.checked;
  aiStatsElement.style.display = enabled ? 'block' : 'none';
  if (enabled) {
    loadAgentFromStorage();
    latestServerSync = loadAgentFromServer();
    try {
      await latestServerSync;
    } catch (error) {
      console.warn('Server sync failed when enabling AI mode', error);
    }
    resetAITracking();
    resetGame();
  } else {
    leftPressed = false;
    rightPressed = false;
  }
});
  
function getStorage(): Storage | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  try {
    return window.localStorage;
  } catch (error) {
    console.warn('Local storage unavailable', error);
    return null;
  }
}

function loadAgentFromStorage(): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    const raw = storage.getItem(AGENT_STORAGE_KEY);
    if (!raw) return false;
    const snapshot = JSON.parse(raw) as AgentSnapshot;
    agent.load(snapshot);
    epsilonDisplay.innerText = agent.epsilon.toFixed(4);
    return true;
  } catch (error) {
    console.warn('Failed to load AI snapshot', error);
  }
  return false;
}

async function loadAgentFromServer(): Promise<boolean> {
  if (typeof fetch === 'undefined') {
    return false;
  }
  try {
    const response = await fetch(`${API_BASE_URL}/api/training-snapshots/latest`);
    if (!response.ok) {
      return false;
    }
    const payload = await response.json();
    if (!payload?.snapshot) {
      return false;
    }
    agent.load(payload.snapshot as AgentSnapshot);
    epsilonDisplay.innerText = agent.epsilon.toFixed(4);
    persistAgentState(payload.snapshot as AgentSnapshot);
    return true;
  } catch (error) {
    console.warn('Failed to load snapshot from server', error);
    return false;
  }
}

function persistAgentState(snapshot?: AgentSnapshot) {
  const storage = getStorage();
  if (!storage) return;
  try {
    const data = snapshot ?? agent.serialize();
    storage.setItem(AGENT_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('Failed to save AI snapshot', error);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    persistAgentState();
  });
}

function buildStateSnapshot(overrides?: {
  ballX?: number;
  ballY?: number;
  ballDX?: number;
  ballDY?: number;
}): number[] {
  const ballX = overrides?.ballX ?? ball.x;
  const ballY = overrides?.ballY ?? ball.y;
  const ballDX = overrides?.ballDX ?? ball.dx;
  const ballDY = overrides?.ballDY ?? ball.dy;
  return [
    ballX / canvas.width,
    ballY / canvas.height,
    paddle.x / canvas.width,
    ballDX / 10,
    ballDY / 10
  ];
}


function resetAITracking() {
  aiEpisode = 0;
  aiHighScore = 0;
  currentEpisodeReward = 0;
  currentEpisodeFrames = 0;
  recentRewards.length = 0;
  recentLengths.length = 0;
  recentEpisodes.length = 0;
  aiEpisodeElement.innerText = '0';
  aiHighScoreElement.innerText = '0';
  aiAvgRewardElement.innerText = '0.000';
  aiAvgLengthElement.innerText = '0';
  aiHistoryElement.innerHTML = '';
  epsilonDisplay.innerText = agent.epsilon.toFixed(4);
}

function updateAIAverages() {
  const avgReward = recentRewards.length
    ? recentRewards.reduce((sum, value) => sum + value, 0) / recentRewards.length
    : 0;
  const avgLength = recentLengths.length
    ? recentLengths.reduce((sum, value) => sum + value, 0) / recentLengths.length
    : 0;
  aiAvgRewardElement.innerText = avgReward.toFixed(3);
  aiAvgLengthElement.innerText = Math.round(avgLength).toString();
}

function renderAIHistory() {
  aiHistoryElement.innerHTML = recentEpisodes
    .map(
      (entry) =>
        `<li>Ep ${entry.episode}: score ${entry.score}, reward ${entry.reward.toFixed(2)}, frames ${entry.frames}</li>`
    )
    .join('');
}

function recordEpisodeStats() {
  if (!aiCheckbox.checked) {
    return;
  }
  if (currentEpisodeFrames === 0) {
    return;
  }

  if (score > aiHighScore) {
    aiHighScore = score;
    aiHighScoreElement.innerText = aiHighScore.toString();
  }

  aiEpisode += 1;
  aiEpisodeElement.innerText = aiEpisode.toString();

  recentRewards.push(currentEpisodeReward);
  if (recentRewards.length > MAX_HISTORY) {
    recentRewards.shift();
  }

  recentLengths.push(currentEpisodeFrames);
  if (recentLengths.length > MAX_HISTORY) {
    recentLengths.shift();
  }

  const summary: EpisodeSummary = {
    episode: aiEpisode,
    score,
    reward: currentEpisodeReward,
    frames: currentEpisodeFrames,
    epsilon: agent.epsilon
  };

  recentEpisodes.unshift(summary);
  if (recentEpisodes.length > MAX_HISTORY) {
    recentEpisodes.pop();
  }

  updateAIAverages();
  renderAIHistory();
  const snapshot = agent.serialize();
  persistAgentState(snapshot);
  void sendSnapshotToServer(summary, snapshot);

  currentEpisodeReward = 0;
  currentEpisodeFrames = 0;
}

async function sendSnapshotToServer(summary: EpisodeSummary, snapshot: AgentSnapshot) {
  if (typeof fetch === 'undefined') {
    return;
  }
  try {
    const response = await fetch(`${API_BASE_URL}/api/training-snapshots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        episode: summary.episode,
        stats: {
          score: summary.score,
          reward: summary.reward,
          frames: summary.frames,
          epsilon: summary.epsilon
        },
        snapshot
      })
    });
    if (!response.ok) {
      const text = await response.text();
      console.warn('Server snapshot sync failed', text);
    }
  } catch (error) {
    console.warn('Unable to reach snapshot server', error);
  }
}

function keyDownHandler(e: KeyboardEvent) {
  if (e.key === 'Right' || e.key === 'ArrowRight') {
    rightPressed = true;
  } else if (e.key === 'Left' || e.key === 'ArrowLeft') {
    leftPressed = true;
  } else if (e.code === 'Space' && !ballMoving && gameRunning) {
    ballMoving = true;
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
  ctx.rect(paddle.x, canvas.height - PADDLE_HEIGHT - PADDLE_BOTTOM_MARGIN, PADDLE_WIDTH, PADDLE_HEIGHT);
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
          lastFrameReward += 1.0; // Reward for hitting brick
          scoreElement.innerText = score.toString();
          if (score === BRICK_ROW_COUNT * BRICK_COLUMN_COUNT) {
            pendingTerminalState = buildStateSnapshot();
            pendingTerminalDone = true;
            pendingGameOverResult = true;
          }
        }
      }
    }
  }
}

// Game Loop
function draw() {
  if (!gameRunning) return;

  const wasBallMoving = ballMoving;

  if (aiCheckbox.checked) {
    currentEpisodeFrames += 1;
  }

  // AI Logic - Pre-Physics
  let currentState: number[] = [];
  let action = 0;
  
  if (aiCheckbox.checked) {
    if (!ballMoving) {
       ballMoving = true; // Auto-start
    }
    
    currentState = [
        ball.x / canvas.width,
        ball.y / canvas.height,
        paddle.x / canvas.width,
        ball.dx / 10,
        ball.dy / 10
    ];
    action = agent.act(currentState);
    
    // 0: Stay, 1: Left, 2: Right
    leftPressed = (action === 1);
    rightPressed = (action === 2);
    
    epsilonDisplay.innerText = agent.epsilon.toFixed(4);
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBricks();
  drawBall();
  drawPaddle();
  collisionDetection();

  if (ballMoving) {
    // Ball Movement
    if (ball.x + ball.dx > canvas.width - BALL_RADIUS || ball.x + ball.dx < BALL_RADIUS) {
      ball.dx = -ball.dx;
    }
    if (ball.y + ball.dy < BALL_RADIUS) {
      ball.dy = -ball.dy;
    } else if (ball.y + ball.dy > canvas.height - BALL_RADIUS - PADDLE_BOTTOM_MARGIN) {
      // Only bounce if the ball is hitting the top of the paddle (not from below/side)
      // We check if the ball's center is roughly above or within the paddle's top area
      const paddleTop = canvas.height - PADDLE_HEIGHT - PADDLE_BOTTOM_MARGIN;
      if (ball.x > paddle.x && ball.x < paddle.x + PADDLE_WIDTH && ball.y < paddleTop + BALL_RADIUS) {
        // Calculate hit position relative to paddle center (-1 to 1)
        let hitPoint = ball.x - (paddle.x + PADDLE_WIDTH / 2);
        let normalizedHit = hitPoint / (PADDLE_WIDTH / 2);

        // Calculate new angle (max 60 degrees)
        let angle = normalizedHit * (Math.PI / 3);

        // Maintain constant speed
        let speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);

        ball.dx = speed * Math.sin(angle);
        ball.dy = -speed * Math.cos(angle);
        
        lastFrameReward += 0.5; // Reward for hitting paddle
      } else if (ball.y + ball.dy > canvas.height - BALL_RADIUS) {
        lives--;
        livesElement.innerText = lives.toString();
        lastFrameReward -= 1.0; // Penalty for losing life
        
        if (!lives) {
          pendingTerminalState = buildStateSnapshot({
            ballY: Math.min(canvas.height, ball.y + ball.dy)
          });
          pendingTerminalDone = true;
          pendingGameOverResult = false;
        } else {
          ballMoving = false;
          resetBallState();
          paddle.x = (canvas.width - PADDLE_WIDTH) / 2;
        }
      }
    }

    ball.x += ball.dx;
    ball.y += ball.dy;
  } else {
    // Stick ball to paddle when not moving
    ball.x = paddle.x + PADDLE_WIDTH / 2;
    ball.y = canvas.height - PADDLE_HEIGHT - PADDLE_BOTTOM_MARGIN - BALL_RADIUS;
    
    // Draw "Press Space" message
    ctx.font = "20px Arial";
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.fillText("Press SPACE to launch", canvas.width / 2, canvas.height / 2 + 50);
  }

  // Paddle Movement
  if (rightPressed && paddle.x < canvas.width - PADDLE_WIDTH) {
    paddle.x += 7;
  } else if (leftPressed && paddle.x > 0) {
    paddle.x -= 7;
  }
  
  // AI Logic - Post-Physics (Training)
  if (aiCheckbox.checked && wasBallMoving) {
      const fallbackNextState = [
        ball.x / canvas.width,
        ball.y / canvas.height,
        paddle.x / canvas.width,
        ball.dx / 10,
        ball.dy / 10
      ];
      const nextState = pendingTerminalState ?? fallbackNextState;
      const done = pendingTerminalState !== null && pendingTerminalDone;
      
      // Small survival reward
      lastFrameReward += 0.001;
      
      agent.remember(currentState, action, lastFrameReward, nextState, done);
      agent.replay(32); // Train on a batch

      if (done) {
        pendingTerminalState = null;
        pendingTerminalDone = false;
      }
  }
  
  if (aiCheckbox.checked) {
    currentEpisodeReward += lastFrameReward;
  }
  lastFrameReward = 0; // Reset for next frame

  if (pendingGameOverResult !== null) {
    const result = pendingGameOverResult;
    pendingGameOverResult = null;
    gameOver(result);
    return;
  }

  if (gameRunning) {
      animationId = requestAnimationFrame(draw);
  }
}

function resetGame() {
  score = 0;
  lives = 3;
  scoreElement.innerText = score.toString();
  livesElement.innerText = lives.toString();
  
  resetBallState();
  
  paddle.x = (canvas.width - PADDLE_WIDTH) / 2;
  
  initBricks();
  
  gameRunning = true;
  ballMoving = false;
    currentEpisodeReward = 0;
    currentEpisodeFrames = 0;
  
  messageElement.classList.add('hidden');
  restartBtn.classList.add('hidden');
}

function gameOver(win: boolean) {
  gameRunning = false;
  cancelAnimationFrame(animationId);
  pendingTerminalState = null;
  pendingTerminalDone = false;
  if (aiCheckbox.checked) {
      recordEpisodeStats();
      resetGame();
      draw();
      return;
  }
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
