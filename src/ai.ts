
export class NeuralNetwork {
  weights1: number[][];
  weights2: number[][];
  bias1: number[];
  bias2: number[];
  inputSize: number;
  hiddenSize: number;
  outputSize: number;
  learningRate: number;

  constructor(inputSize: number, hiddenSize: number, outputSize: number, learningRate: number = 0.1) {
    this.inputSize = inputSize;
    this.hiddenSize = hiddenSize;
    this.outputSize = outputSize;
    this.learningRate = learningRate;

    this.weights1 = this.randomMatrix(inputSize, hiddenSize);
    this.weights2 = this.randomMatrix(hiddenSize, outputSize);
    this.bias1 = new Array(hiddenSize).fill(0);
    this.bias2 = new Array(outputSize).fill(0);
  }

  randomMatrix(rows: number, cols: number): number[][] {
    return Array.from({ length: rows }, () => 
      Array.from({ length: cols }, () => Math.random() * 2 - 1)
    );
  }

  sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  sigmoidDerivative(x: number): number {
    return x * (1 - x);
  }

  predict(input: number[]): number[] {
    // Hidden layer
    const hidden = this.bias1.map((b, i) => {
      let sum = b;
      for (let j = 0; j < this.inputSize; j++) {
        sum += input[j] * this.weights1[j][i];
      }
      return this.sigmoid(sum);
    });

    // Output layer
    // Re-calculating output correctly with loops
    const finalOutput = [];
    for(let i=0; i<this.outputSize; i++) {
        let sum = this.bias2[i];
        for(let j=0; j<this.hiddenSize; j++) {
            sum += hidden[j] * this.weights2[j][i];
        }
        finalOutput.push(sum);
    }

    return finalOutput;
  }
  
  // Simple SGD for one sample
  train(input: number[], target: number[]) {
    // Forward pass
    const hiddenRaw = new Array(this.hiddenSize).fill(0);
    const hidden = new Array(this.hiddenSize).fill(0);
    
    for(let i=0; i<this.hiddenSize; i++) {
        let sum = this.bias1[i];
        for(let j=0; j<this.inputSize; j++) {
            sum += input[j] * this.weights1[j][i];
        }
        hiddenRaw[i] = sum;
        hidden[i] = this.sigmoid(sum);
    }

    const output = new Array(this.outputSize).fill(0);
    for(let i=0; i<this.outputSize; i++) {
        let sum = this.bias2[i];
        for(let j=0; j<this.hiddenSize; j++) {
            sum += hidden[j] * this.weights2[j][i];
        }
        output[i] = sum;
    }

    // Backward pass
    // Output error (MSE derivative: output - target)
    const outputErrors = output.map((o, i) => o - target[i]);

    // Hidden errors
    const hiddenErrors = new Array(this.hiddenSize).fill(0);
    for(let i=0; i<this.hiddenSize; i++) {
        let error = 0;
        for(let j=0; j<this.outputSize; j++) {
            error += outputErrors[j] * this.weights2[i][j];
        }
        hiddenErrors[i] = error * this.sigmoidDerivative(hidden[i]);
    }

    // Update weights2
    for(let i=0; i<this.hiddenSize; i++) {
        for(let j=0; j<this.outputSize; j++) {
            this.weights2[i][j] -= this.learningRate * outputErrors[j] * hidden[i];
        }
    }
    // Update bias2
    for(let i=0; i<this.outputSize; i++) {
        this.bias2[i] -= this.learningRate * outputErrors[i];
    }

    // Update weights1
    for(let i=0; i<this.inputSize; i++) {
        for(let j=0; j<this.hiddenSize; j++) {
            this.weights1[i][j] -= this.learningRate * hiddenErrors[j] * input[i];
        }
    }
    // Update bias1
    for(let i=0; i<this.hiddenSize; i++) {
        this.bias1[i] -= this.learningRate * hiddenErrors[i];
    }
  }
}

export type Experience = {
  state: number[];
  action: number;
  reward: number;
  nextState: number[];
  done: boolean;
};

export type AgentSnapshot = {
  epsilon: number;
  weights1: number[][];
  weights2: number[][];
  bias1: number[];
  bias2: number[];
  memory: Experience[];
};

export class DQNAgent {
  brain: NeuralNetwork;
  memory: Experience[];
  gamma: number = 0.95; // Discount factor
  epsilon: number = 1.0; // Exploration rate
  epsilonMin: number = 0.01;
  epsilonDecay: number = 0.995;
  
  constructor(inputSize: number, actionSize: number) {
    this.brain = new NeuralNetwork(inputSize, 64, actionSize, 0.01);
    this.memory = [];
  }

  act(state: number[]): number {
    if (Math.random() <= this.epsilon) {
      return Math.floor(Math.random() * this.brain.outputSize);
    }
    const qValues = this.brain.predict(state);
    return qValues.indexOf(Math.max(...qValues));
  }

  remember(state: number[], action: number, reward: number, nextState: number[], done: boolean) {
    this.memory.push({ state, action, reward, nextState, done });
    if (this.memory.length > 1000) this.memory.shift();
  }

  replay(batchSize: number) {
    if (this.memory.length < batchSize) return;

    const batch = [];
    for (let i = 0; i < batchSize; i++) {
        const idx = Math.floor(Math.random() * this.memory.length);
        batch.push(this.memory[idx]);
    }

    for (const { state, action, reward, nextState, done } of batch) {
      let target = reward;
      if (!done) {
        const nextQ = this.brain.predict(nextState);
        target = reward + this.gamma * Math.max(...nextQ);
      }
      
      const currentQ = this.brain.predict(state);
      currentQ[action] = target; // Update the target for the action taken
      
      this.brain.train(state, currentQ);
    }

    if (this.epsilon > this.epsilonMin) {
      this.epsilon *= this.epsilonDecay;
    }
  }

  serialize(): AgentSnapshot {
    return {
      epsilon: this.epsilon,
      weights1: this.brain.weights1.map((row) => [...row]),
      weights2: this.brain.weights2.map((row) => [...row]),
      bias1: [...this.brain.bias1],
      bias2: [...this.brain.bias2],
      memory: this.memory.map((exp) => ({
        state: [...exp.state],
        action: exp.action,
        reward: exp.reward,
        nextState: [...exp.nextState],
        done: exp.done
      }))
    };
  }

  load(snapshot: AgentSnapshot) {
    if (!snapshot) return;
    this.epsilon = snapshot.epsilon ?? this.epsilon;
    this.brain.weights1 = snapshot.weights1?.map((row) => [...row]) ?? this.brain.weights1;
    this.brain.weights2 = snapshot.weights2?.map((row) => [...row]) ?? this.brain.weights2;
    this.brain.bias1 = snapshot.bias1 ? [...snapshot.bias1] : this.brain.bias1;
    this.brain.bias2 = snapshot.bias2 ? [...snapshot.bias2] : this.brain.bias2;
    this.memory = snapshot.memory
      ? snapshot.memory.map((exp) => ({
          state: [...exp.state],
          action: exp.action,
          reward: exp.reward,
          nextState: [...exp.nextState],
          done: exp.done
        }))
      : [];
  }
}
