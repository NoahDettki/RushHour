import * as readline from "readline";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

export type Pos = { x: number, y: number };

const dir = "./levels";
const levels = [] as number[][][];
let carPark = [] as number[][];
const exitY = 2;
let gameOver = false;

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => {
    rl.close();
    resolve(answer);
  }));
}

function displayCarPark() {
  // When the game is over, the player's car will be drawn outside the car park
  console.log("+%s+","-".repeat(carPark[0].length * 3 + 1));
  carPark.forEach((row, i) => {
    console.log(
      "| " + 
      row.map(num => num === 0 ? " ." : num.toString().padStart(2, " ")).join(" ") + //replace(/1(.)/, "¹$1")
      (i === exitY ? " ." : " |") + (i === exitY && gameOver ? " 1 1" : "")
    );
  });
  console.log("+%s+","-".repeat(carPark[0].length * 3 + 1));
}

function searchCarTopLeft(num: number): Pos | undefined {
  for (let y = 0; y < carPark.length; y++) {
    for (let x = 0; x < carPark[y].length; x++) {
      if (carPark[y][x] === num) {
        return { x, y };
      }
    }
  }
  return undefined;
}

function searchCarBottomRight(pos: Pos): Pos | undefined {
  // Check if the position is within bounds
  if (pos.x < 0 || pos.y < 0 || pos.y >= carPark.length || pos.x >= carPark[pos.y].length) {
    return undefined;
  }
  // Check if there is a car at the given position
  const carNumber = carPark[pos.y][pos.x];
  if (carNumber === 0) {
    return undefined;
  }
  // Check right
  let x = pos.x;
  while (x < carPark[pos.y].length && carPark[pos.y][x] === carNumber) {
    x++; // this will step one too far
  }
  // Check down
  let y = pos.y;
  while (y < carPark.length && carPark[y][pos.x] === carNumber) {
    y++; // this will also step one too far
  }
  return { x: x - 1, y: y - 1 }; // Subtract one to get the last valid position 
}

function moveCar(topLeft: Pos, bottomRight: Pos, direction: string) {
  const carNumber = carPark[topLeft.y][topLeft.x];
  const dir = direction.charAt(0);
  const range = direction.length;
  for (let i = 0; i < range; i++) {
    switch (dir) {
      case 'w': // up
        if (topLeft.x !== bottomRight.x) {
          console.log("You can only move a car up if it is vertical.");
          return;
        }
        if (topLeft.y === 0) {
          console.log("You cannot move a car up if it is already at the top edge.");
          return;
        }
        if (carPark[topLeft.y - 1][topLeft.x] !== 0) {
          console.log("Another car is blocking your car");
          return;
        }
        carPark[topLeft.y - 1][topLeft.x] = carNumber;
        carPark[bottomRight.y][bottomRight.x] = 0;
        topLeft.y -= 1; // Update the topLeft position
        bottomRight.y -= 1; // Update the bottomRight position
        break;
      case 'a': // left
        if (topLeft.y !== bottomRight.y) {
          console.log("You can only move a car left if it is horizontal.");
          return;
        }
        if (topLeft.x === 0) {
          console.log("You cannot move a car left if it is already at the left edge.");
          return;
        }
        if (carPark[topLeft.y][topLeft.x - 1] !== 0) {
          console.log("Another car is blocking your car");
          return;
        }
        carPark[topLeft.y][topLeft.x - 1] = carNumber;
        carPark[bottomRight.y][bottomRight.x] = 0;
        topLeft.x -= 1; // Update the topLeft position
        bottomRight.x -= 1; // Update the bottomRight position
        break;
      case 's': // down
        if (topLeft.x !== bottomRight.x) {
          console.log("You can only move a car down if it is vertical.");
          return;
        }
        if (bottomRight.y === carPark.length - 1) {
          console.log("You cannot move a car down if it is already at the bottom edge.");
          return;
        }
        if (carPark[bottomRight.y + 1][topLeft.x] !== 0) {
          console.log("Another car is blocking your car");
          return;
        }
        carPark[bottomRight.y + 1][topLeft.x] = carNumber;
        carPark[topLeft.y][topLeft.x] = 0;
        topLeft.y += 1; // Update the topLeft position
        bottomRight.y += 1; // Update the bottomRight position
        break;
      case 'd': // right
        if (topLeft.y !== bottomRight.y) {
          console.log("You can only move a car right if it is horizontal.");
          return;
        }
        if (bottomRight.x === carPark[topLeft.y].length - 1) {
          if (topLeft.y === exitY) {
            if (carNumber === 1) {
              console.log("You have successfully moved your car to the exit! You win!");
              // Car is removed from the car park
              carPark[topLeft.y][topLeft.x] = 0;
              carPark[bottomRight.y][bottomRight.x] = 0;
              gameOver = true;
              return;
            } else {
              console.log("You somehow managed to move the wrong car to the exit. Dev looses!");
              gameOver = true;
              return;
            }
          }
          console.log("You cannot move a car right if it is already at the right edge.");
          return;
        }
        if (carPark[topLeft.y][bottomRight.x + 1] !== 0) {
          console.log("Another car is blocking your car");
          return;
        }
        carPark[topLeft.y][bottomRight.x + 1] = carNumber;
        carPark[topLeft.y][topLeft.x] = 0;
        topLeft.x += 1; // Update the topLeft position
        bottomRight.x += 1; // Update the bottomRight position
        break;
      default:
        // The direction string was invalid
        return;
    }
  }
  // The direction string was empty
  return;
}

async function main() {
  // Load levels
  const files = readdirSync(dir);
  for (const file of files) {
    const content = readFileSync(join(dir, file), "utf-8");
    const level = content.split(/\r?\n/).map(line => {
      return line.split("").map(char => parseInt(char, 36));
    });
    levels.push(level);
  }
  // Ask player which level to play
  const levelChoice = await ask(`Choose a level (1-${levels.length}): `);
  if (isNaN(Number(levelChoice)) || Number(levelChoice) < 1 || Number(levelChoice) > levels.length) {
    console.log("Invalid level choice. Exiting game.");
    return;
  }
  // Load the chosen level
  carPark = levels[Number(levelChoice) - 1];
  // Start game loop
  while (!gameOver) {
    // Display the car park
    displayCarPark();
    // Ask for the next turn
    const nextTurn = await ask("Your Turn: ");
    // Maybe the player wants to quit
    if (nextTurn.toLowerCase() === "q") {
      console.log("Quitting the game.");
      return;
    }
    // Validate input
    const validInput = nextTurn.match(/^(\d+)(w+|a+|s+|d+)$/);
    if (!validInput) {
      console.log("Invalid input. Input has to be of the form '<car number><direction wasd>'");
      continue;
    }
    const carNumber = Number(validInput[1]);
    if (carNumber < 1) {
      console.log("Invalid car number. Please enter a positive integer.");
      continue;
    }
    const directionInput = validInput[2];
    // Search the specified car in the car park
    const topLeftCarPos = searchCarTopLeft(carNumber);
    if (!topLeftCarPos) {
      console.log(`Car ${carNumber} not found in the car park.`);
      continue;
    }
    const bottomRightCarPos = searchCarBottomRight(topLeftCarPos);
    if (!bottomRightCarPos) {
      console.log(`Dev: you messed up. searchCarBottomRight returned undefined`);
      continue;
    }
    // Move car
    moveCar(topLeftCarPos, bottomRightCarPos, directionInput)

    // Safety break approved by Noah (he's almost a real developer now)
    // break; whoops not so save anymore haha
  }
  displayCarPark();
}

main();
