import * as readline from "readline";
import { readdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import chalk from "chalk";

type Pos = { x: number, y: number };
const color: { [key: number]: (text: string) => string } = {
  1: chalk.whiteBright,
  2: chalk.green,
  3: chalk.yellow,
  4: chalk.red,
  5: chalk.blue,
  6: chalk.magenta,
  7: chalk.cyan,
  8: chalk.redBright,
  9: chalk.greenBright,
  10: chalk.yellowBright,
  11: chalk.blueBright,
  12: chalk.magentaBright,
  13: chalk.cyanBright,
  14: chalk.gray,
  15: chalk.white,
}

const levelDir = "./levels";
const scoresFile = "scores.json";
const levels = [] as number[][][];
let scores = {} as { [key: string]: number };
let carPark = [] as number[][];
const exitY = 2;
let gameOver = false;
let turns = 0;

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => {
    rl.close();
    resolve(answer);
  }));
}

function displayCarPark() {
  // When the game is over, the player's car will be drawn outside the car park
  console.log("+%s+","-".repeat(carPark[0].length * 2 + 1));
  carPark.forEach((row, i) => {
    console.log(
      "|" + 
      row.map(num => num === 0 ? " ." : color[num](num.toString().padStart(2, " ").replace(/1(.)/, "¹$1"))).join("") +
      (i === exitY ? " ." : " |") + (i === exitY && gameOver ? color[1](" 1 1") : "")
    );
  });
  console.log("+%s+","-".repeat(carPark[0].length * 2 + 1));
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
  let stepsMade = 0;
  for (let i = 0; i < range; i++) {
    switch (dir) {
      case 'w': // up
        if (topLeft.x !== bottomRight.x) {
          console.error("You can only move a car up if it is vertical.");
          return;
        }
        if (topLeft.y === 0) {
          console.error("You cannot move a car up if it is already at the top edge.");
          break;
        }
        if (carPark[topLeft.y - 1][topLeft.x] !== 0) {
          console.error("Another car is blocking your car");
          break;
        }
        carPark[topLeft.y - 1][topLeft.x] = carNumber;
        carPark[bottomRight.y][bottomRight.x] = 0;
        topLeft.y -= 1; // Update the topLeft position
        bottomRight.y -= 1; // Update the bottomRight position
        stepsMade += 1; // Increment steps made
        break;
      case 'a': // left
        if (topLeft.y !== bottomRight.y) {
          console.error("You can only move a car left if it is horizontal.");
          return;
        }
        if (topLeft.x === 0) {
          console.error("You cannot move a car left if it is already at the left edge.");
          break;
        }
        if (carPark[topLeft.y][topLeft.x - 1] !== 0) {
          console.error("Another car is blocking your car");
          break;
        }
        carPark[topLeft.y][topLeft.x - 1] = carNumber;
        carPark[bottomRight.y][bottomRight.x] = 0;
        topLeft.x -= 1; // Update the topLeft position
        bottomRight.x -= 1; // Update the bottomRight position
        stepsMade += 1; // Increment steps made
        break;
      case 's': // down
        if (topLeft.x !== bottomRight.x) {
          console.error("You can only move a car down if it is vertical.");
          return;
        }
        if (bottomRight.y === carPark.length - 1) {
          console.error("You cannot move a car down if it is already at the bottom edge.");
          break;
        }
        if (carPark[bottomRight.y + 1][topLeft.x] !== 0) {
          console.error("Another car is blocking your car");
          break;
        }
        carPark[bottomRight.y + 1][topLeft.x] = carNumber;
        carPark[topLeft.y][topLeft.x] = 0;
        topLeft.y += 1; // Update the topLeft position
        bottomRight.y += 1; // Update the bottomRight position
        stepsMade += 1; // Increment steps made
        break;
      case 'd': // right
        if (topLeft.y !== bottomRight.y) {
          console.error("You can only move a car right if it is horizontal.");
          return;
        }
        if (bottomRight.x === carPark[topLeft.y].length - 1) {
          if (topLeft.y === exitY) {
            if (carNumber === 1) {
              // Car is removed from the car park
              carPark[topLeft.y][topLeft.x] = 0;
              carPark[bottomRight.y][bottomRight.x] = 0;
              gameOver = true;
              turns += 1;
              return;
            } else {
              console.error("You somehow managed to move the wrong car to the exit. Dev looses!");
              gameOver = true;
              turns += 1;
              return;
            }
          }
          console.error("You cannot move a car right if it is already at the right edge.");
          break;
        }
        if (carPark[topLeft.y][bottomRight.x + 1] !== 0) {
          console.error("Another car is blocking your car");
          break;
        }
        carPark[topLeft.y][bottomRight.x + 1] = carNumber;
        carPark[topLeft.y][topLeft.x] = 0;
        topLeft.x += 1; // Update the topLeft position
        bottomRight.x += 1; // Update the bottomRight position
        stepsMade += 1; // Increment steps made
        break;
      default:
        // The direction string was invalid
        return;
    }
  }
  // Movement done or direction string was empty
  if (stepsMade > 0) {
    turns += 1;
  }
  return;
}

async function main() {
  console.log(`\n${color[3]("~~")} ${color[1](" Rush Hour ")} ${color[3]("~~")}`);
  console.log("Oh no! Your car is stuck in a parking lot and you need to get it out!");
  console.log(
    `Move your car (${color[3]("1")}) or the other cars (${color[3]("2")}-${color[3]("15")}) to make space for your car`
  );
  console.log("to exit the parking lot on the right side.  " +
    `Use '${color[3]("w")}', '${color[3]("a")}', '${color[3]("s")}', '${color[3]("d")}' to`
  );
  console.log(`move the cars up, left, down, and right respectively.`);
  console.log(`${color[3]("3dd")} will move car 3 down twice for example.\n`);
  // Load levels
  const files = readdirSync(levelDir);
  for (const file of files) {
    const content = readFileSync(join(levelDir, file), "utf-8");
    const level = content.split(/\r?\n/).map(line => {
      return line.split("").map(char => parseInt(char, 16));
    });
    levels.push(level);
  }
  // Load scores
  if (existsSync(scoresFile)) {
    const raw = readFileSync(scoresFile, "utf-8");
    scores = JSON.parse(raw);
  } else {
    scores = {};
    writeFileSync(scoresFile, JSON.stringify(scores, null, 2), "utf-8");
  }
  // Menu
  while (true) {
    gameOver = false;
    turns = 0;
    // Ask player which level to play
    const levelChoice = await ask(
      `Choose a level (${color[3]("1")}-${color[3](levels.length.toString())}) or (${color[4]("q")})uit: `);
    if (levelChoice.toLowerCase() === "q") {
      console.log("Quitting the game.");
      break;
    }
    if (isNaN(Number(levelChoice)) || Number(levelChoice) < 1 || Number(levelChoice) > levels.length) {
      console.error("Invalid level choice!");
      continue;
    }
    // Load the chosen level
    carPark = levels[Number(levelChoice) - 1];
    // Start game loop
    while (!gameOver) {
      // Display the car park
      displayCarPark();
      // Ask for the next turn
      const nextTurn = await ask(`Turn ${turns + 1}: Enter turn or (${color[4]("q")})uit: `);
      // Maybe the player wants to quit
      if (nextTurn.toLowerCase() === "q") {
        console.log("Quitting the level.");
        break;
      }
      // Validate input
      const validInput = nextTurn.match(/^(\d+)(w+|a+|s+|d+)$/);
      if (!validInput) {
        console.error("Invalid input. Input has to be of the form '<car number><direction wasd>'");
        continue;
      }
      const carNumber = Number(validInput[1]);
      if (carNumber < 1) {
        console.error("Invalid car number. Please enter a positive integer.");
        continue;
      }
      const directionInput = validInput[2];
      // Search the specified car in the car park
      const topLeftCarPos = searchCarTopLeft(carNumber);
      if (!topLeftCarPos) {
        console.error(`Car ${carNumber} not found in the car park.`);
        continue;
      }
      const bottomRightCarPos = searchCarBottomRight(topLeftCarPos);
      if (!bottomRightCarPos) {
        console.error(`Dev: you messed up. searchCarBottomRight returned undefined`);
        continue;
      }
      // Move car
      moveCar(topLeftCarPos, bottomRightCarPos, directionInput)

      // Safety break approved by Noah (he's almost a real developer now)
      // break; whoops not so save anymore haha
    } // while(!gameOver)
    if (gameOver) {
      displayCarPark();
      console.log(`You escaped from the parking lot in ${color[3](turns.toString())} turns!`);
      if (!scores[Number(levelChoice)] || scores[Number(levelChoice)] > turns) {
        console.log("That's a new high score!");
        scores[Number(levelChoice)] = turns;
        writeFileSync(scoresFile, JSON.stringify(scores, null, 2), "utf-8");
      } else if (scores[Number(levelChoice)]) {
        console.log(`Your best score was ${color[3](scores[Number(levelChoice)].toString())} turns.`);
      }
    }
  } // while(True)
}

main();
