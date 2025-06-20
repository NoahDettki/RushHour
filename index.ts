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
const levelMinTurns = [] as number[];
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

function colorize(text: string): string {
  const output = [] as string[];
  text.split("#").forEach((part, index) => {
    if (index % 2 === 0) {
      output.push(part); // Normal text
    } else {
      switch (part.charAt(0)) {
        case 'w':
          output.push(color[1](part.slice(1))); // White
          break;
        case 'g':
          output.push(color[2](part.slice(1))); // Green
          break;
        case 'y':
          output.push(color[3](part.slice(1))); // Yellow
          break;
        case 'r':
          output.push(color[4](part.slice(1))); // Red
          break;
        default:
          console.warn(`Unknown color code: ${part.charAt(0)}. Using default color.`);
          output.push(part.slice(1)); // Default color
          break;
      }
    }
  });
  return output.join("");
}

function welcome() {
  console.log(colorize("\n#y~~# #wRush Hour# #y~~#"));
  console.log("Oh no! Your car is stuck in a parking lot and you need to get it out!");
  console.log(colorize(`Move your car (#y1#) or the other cars (#y2#-#y15#) to make space for your car`));
  console.log(colorize("to exit the parking lot on the right side.  Use '#yw#', '#ya#', '#ys#', '#yd#' to"));
  console.log(`move the cars up, left, down, and right respectively.`);
  console.log(colorize("#y3dd# will move car 3 down twice for example.\n"));
}

function loadLevels() {
  const files = readdirSync(levelDir);
  for (const file of files) {
    const content = readFileSync(join(levelDir, file), "utf-8");
    const level = content.split(/\r?\n/).map((line, i) => {
      if (i === content.split(/\r?\n/).length - 1) {
        levelMinTurns.push(Number(line.trim()));
        return undefined;
      } else {
        return line.split("").map(char => parseInt(char, 16));
      }
    }).filter(line => line !== undefined);
    levels.push(level as number[][]);
  }
}

function loadScores() {
  if (existsSync(scoresFile)) {
    const raw = readFileSync(scoresFile, "utf-8");
    scores = JSON.parse(raw);
  } else {
    scores = {};
    writeFileSync(scoresFile, JSON.stringify(scores, null, 2), "utf-8");
  }
}

function displayScores() {
  for (let i = 1; i <= levels.length; i++) {
    const minText = color[14](` (min: ${levelMinTurns[i - 1].toString().padStart(2, " ")})`);
    if (scores[i]) {
      let perfect = levelMinTurns[i - 1] >= scores[i]; // >= because the player may find an even better solution
      console.log(`Level ${i.toString().padStart(2, " ")}: ${
          color[perfect ? 2 : 3](scores[i].toString().padStart(3, " "))} turns` + (perfect ? "" : minText)
      );
    } else {
      console.log(`Level ${i.toString().padStart(2, " ")}:   -      ` + minText);
    }
  }
}

async function levelEditor() {
  console.log("\nWelcome to the level editor!");
  carPark = Array.from({ length: 6 }, () => Array(6).fill(0));
  let cursor: Pos = { x: 0, y: 0 };
  while (true) {
    displayCarPark(cursor);
    const eInput = await ask(
      colorize("(#ywasd#) move cursor, (#y1#-#y15#) add car, (#yr#)emove car, (#yv#)alidate or (#rq#)uit: ")
    );
    // Check if input consists of only move commands
    let smartInput = true;
    const inputParts = eInput.match(/([wasdr]+|\d+)/g);
    for (const part of inputParts || []) {
      if (!isNaN(Number(part))) {
        if (Number(part) < 1 || Number(part) > 15) {
          smartInput = false;
          break; // Invalid car number
        }
      }
    }
    if (smartInput && inputParts) {
      inputParts.forEach(part => {
        if (!isNaN(Number(part))) {
          carPark[cursor.y][cursor.x] = Number(part);
        } else {
          for (const char of part) {
            switch (char) {
              case 'w':
                if (cursor.y > 0) cursor.y--;
                break;
              case 'a':
                if (cursor.x > 0) cursor.x--;
                break;
              case 's':
                if (cursor.y < carPark.length - 1) cursor.y++;
                break;
              case 'd':
                if (cursor.x < carPark[cursor.y].length - 1) cursor.x++;
                break;
              case 'r':
                carPark[cursor.y][cursor.x] = 0;
                break;
            }
          }
        }
      });
      continue;
    }
    if (eInput.toLowerCase() === "v") {
      const result = validateLevel();
      if (result) {
        console.log(colorize("#gLevel is valid!#"));
        console.log(result);
      }
      else {
        console.error("Invalid level!");
      }
      continue;
    }
    if (eInput.toLowerCase() === "q") {
      break; // Quit the level editor
    }
    console.error("Invalid input");
  }
  console.log("Quitting level editor.");
}

function hashCarPark(park: number[][]): string {
  return park.map(row => row.join(" ")).join("\n");
}

function validateLevel() {
  // Detect all car numbers in the park
  // (So that the algorithm does not try to move cars that are not there)
  const cars = {} as { [key: number]: Record<string, Pos> }
  const availableCarsHorizontal = new Set<number>();
  const availableCarsVertical = new Set<number>();
  for (let y = 0; y < carPark.length; y++) {
    for (let x = 0; x < carPark[0].length; x++) {
      const num = carPark[y][x];
      // Skip empty spaces
      if (num === 0) continue;
      
      const tl = searchCarTopLeftFromPos({x: x, y: y}, carPark)!;
      const br = searchCarBottomRight({x: x, y: y})!;
      if (tl.x === br.x && tl.y === br.y) {
        console.error("All cars need a length of at least 2!");
        return false;
      }
      if (!cars[num]) {
        // Player car must be placed in exit row
        if (num === 1 && y !== exitY) {
          console.error("Your car (car 1) must be placed in the exit row (row 2) of the parking lot!");
          return false;
        }
        // Register car
        cars[num] = { topLeft: tl, bottomRight: br };
        if (br.x > tl.x && br.y === tl.y) {
          availableCarsHorizontal.add(num);
        } else if (br.x === tl.x && br.y > tl.y) {
          availableCarsVertical.add(num);
        } else {
          console.error(`Car ${num} has an invalid shape!`);
          return false;
        }
      } else if (cars[num].topLeft.x !== tl.x || cars[num].topLeft.y !== tl.y || 
                cars[num].bottomRight.x !== br.x || cars[num].bottomRight.y !== br.y) {
        // There is already a car with this number, but it has different positions
        console.error(`Car ${num} has a wrong shape or exists multiple times!`);
        return false;
      }
    }
  }
  if (!availableCarsHorizontal.has(1)) {
    console.error("You need to place your own car (car 1) in the parking lot!");
    return false;
  }
  // The algorithm should stop a search route if it has already been there before
  const formerStates = new Set<string>();
  const turnsToState = {} as { [key: string]: number };
  formerStates.add(hashCarPark(carPark)); // Add the initial state

  // Try every possible move with a deep copy of the car park
  const recursionMove = (park: number[][], carNumber: number, direction: string, moves: string[]): string[] | false => {
    // Make move and hash the state of the car park
    const topLeft = searchCarTopLeft(carNumber, park);
    // console.log(topLeft);
    const bottomRight = searchCarBottomRight(topLeft!, park);
    // console.log(bottomRight);
    moveCar(topLeft!, bottomRight!, direction, park, false);
    moves.push(`${carNumber}${direction}`);
    // console.log(`Trying to move car ${carNumber} ${direction}...`);
    // console.log(park);
    const stateHash = hashCarPark(park);
    if (formerStates.has(stateHash) && turnsToState[stateHash] <= moves.length) {
      return false; // Already tried this state
    }
    formerStates.add(stateHash);
    turnsToState[stateHash] = moves.length;
    if (park[exitY][park[exitY].length - 1] === 1) {
      return moves; // Found a solution, car 1 is at the exit
      //TODO: Noah, du musst die moves hier schon flatten, bevor du sie returnst, weil die
      // die anderen Paths hiermit verglichen werden. Wenn du das machst, wird der Algorithmus
      // auch den kürzesten Weg finden. (denke ich)
    }

    // Try moving every car in it's two possible directions
    let result = [] as string[] | false;
    let bestResult: string[] | false = false;
    for (const carNr of availableCarsHorizontal) {
      result = recursionMove(park.map(row => [...row]), carNr, "a", [...moves]);
      if (result && (!bestResult || result.length < bestResult.length)) bestResult = result;
      result = recursionMove(park.map(row => [...row]), carNr, "d", [...moves]);
      if (result && (!bestResult || result.length < bestResult.length)) bestResult = result;
    }
    for (const carNr of availableCarsVertical) {
      result = recursionMove(park.map(row => [...row]), carNr, "w", [...moves]);
      if (result && (!bestResult || result.length < bestResult.length)) bestResult = result;
      result = recursionMove(park.map(row => [...row]), carNr, "s", [...moves]);
      if (result && (!bestResult || result.length < bestResult.length)) bestResult = result;
    }
    return bestResult;
  };

  // Start recursion
  // Try moving every car in it's two possible directions
  let result = [] as string[] | false;
  let bestResult: string[] | false = false;
    for (const carNr of availableCarsHorizontal) {
      result = recursionMove(carPark.map(row => [...row]), carNr, "a", []);
      if (result && (!bestResult || result.length < bestResult.length)) bestResult = result;
      result = recursionMove(carPark.map(row => [...row]), carNr, "d", []);
      if (result && (!bestResult || result.length < bestResult.length)) bestResult = result;
    }
    for (const carNr of availableCarsVertical) {
      result = recursionMove(carPark.map(row => [...row]), carNr, "w", []);
      if (result && (!bestResult || result.length < bestResult.length)) bestResult = result;
      result = recursionMove(carPark.map(row => [...row]), carNr, "s", []);
      if (result && (!bestResult || result.length < bestResult.length)) bestResult = result;
    }
  return bestResult;
}

function displayCarPark(cursor?: Pos) {
  // Top border
  console.log("+%s+","-".repeat(carPark[0].length * 2 + 1));
  carPark.forEach((row, y) => {
    console.log(
      // Left border
      "|" + 
      // One line of the car park
      row.map((num, x) => {
        const str = num.toString();
        if (cursor && cursor.y === y) {
          if (cursor.x === x) {
            return num === 0 ? (color[1]("[") + ".") : (color[1]("[") + color[num](str[str.length - 1]));
          } else if (cursor.x + 1 === x) {
            return num === 0 ? (color[1]("]") + ".") : (color[1]("]") + color[num](str[str.length - 1]));
          }
        }
        return num === 0 ? " ." : color[num](str.padStart(2, " ").replace(/1(.)/, "¹$1"))
      }).join("") +
      // Right border or exit of the car park
      (cursor && cursor.y === y && cursor.x === carPark.length - 1 ? color[1]("]") : " ") +
      (y === exitY ? "." : "|") + 
      // Display the player's car outside of the car park when the game is over
      (y === exitY && gameOver ? color[1](" 1 1") : "")
    );
  });
  // Bottom border
  console.log("+%s+","-".repeat(carPark[0].length * 2 + 1));
}

function searchCarTopLeft(num: number, park: number[][] = carPark): Pos | undefined {
  for (let y = 0; y < park.length; y++) {
    for (let x = 0; x < park[y].length; x++) {
      if (park[y][x] === num) {
        return { x, y };
      }
    }
  }
  return undefined;
}

function searchCarBottomRight(pos: Pos, park: number[][] = carPark): Pos | undefined {
  // Check if the position is within bounds
  if (pos.x < 0 || pos.y < 0 || pos.y >= park.length || pos.x >= park[pos.y].length) {
    return undefined;
  }
  // Check if there is a car at the given position
  const carNumber = park[pos.y][pos.x];
  if (carNumber === 0) {
    return undefined;
  }
  // Check right
  let x = pos.x;
  while (x < park[pos.y].length && park[pos.y][x] === carNumber) {
    x++; // this will step one too far
  }
  // Check down
  let y = pos.y;
  while (y < park.length && park[y][pos.x] === carNumber) {
    y++; // this will also step one too far
  }
  return { x: x - 1, y: y - 1 }; // Subtract one to get the last valid position 
}

function searchCarTopLeftFromPos(pos: Pos, park: number[][]): Pos | undefined {
  // Check if the position is within bounds
  if (pos.x < 0 || pos.y < 0 || pos.y >= park.length || pos.x >= park[pos.y].length) {
    return undefined;
  }
  // Check if there is a car at the given position
  const carNumber = park[pos.y][pos.x];
  if (carNumber === 0) {
    return undefined;
  }
  // Check left
  let x = pos.x;
  while (x > 0 && park[pos.y][x - 1] === carNumber) {
    x--; // this will step one too far
  }
  // Check up
  let y = pos.y;
  while (y > 0 && park[y - 1][pos.x] === carNumber) {
    y--; // this will also step one too far
  }
  return { x, y }; // Return the first valid position
}

function moveCar(topLeft: Pos, bottomRight: Pos, direction: string, park: number[][] = carPark, print: boolean = true) {
  const carNumber = park[topLeft.y][topLeft.x];
  const dir = direction.charAt(0);
  const range = direction.length;
  let stepsMade = 0;
  for (let i = 0; i < range; i++) {
    switch (dir) {
      case 'w': // up
        if (topLeft.x !== bottomRight.x) {
          if (print) console.error("You can only move a car up if it is vertical.");
          return;
        }
        if (topLeft.y === 0) {
          if (print) console.error("You cannot move a car up if it is already at the top edge.");
          break;
        }
        if (park[topLeft.y - 1][topLeft.x] !== 0) {
          if (print) console.error("Another car is blocking your car");
          break;
        }
        park[topLeft.y - 1][topLeft.x] = carNumber;
        park[bottomRight.y][bottomRight.x] = 0;
        topLeft.y -= 1; // Update the topLeft position
        bottomRight.y -= 1; // Update the bottomRight position
        stepsMade += 1; // Increment steps made
        break;
      case 'a': // left
        if (topLeft.y !== bottomRight.y) {
          if (print) console.error("You can only move a car left if it is horizontal.");
          return;
        }
        if (topLeft.x === 0) {
          if (print) console.error("You cannot move a car left if it is already at the left edge.");
          break;
        }
        if (park[topLeft.y][topLeft.x - 1] !== 0) {
          if (print) console.error("Another car is blocking your car");
          break;
        }
        park[topLeft.y][topLeft.x - 1] = carNumber;
        park[bottomRight.y][bottomRight.x] = 0;
        topLeft.x -= 1; // Update the topLeft position
        bottomRight.x -= 1; // Update the bottomRight position
        stepsMade += 1; // Increment steps made
        break;
      case 's': // down
        if (topLeft.x !== bottomRight.x) {
          if (print) console.error("You can only move a car down if it is vertical.");
          return;
        }
        if (bottomRight.y === park.length - 1) {
          if (print) console.error("You cannot move a car down if it is already at the bottom edge.");
          break;
        }
        if (park[bottomRight.y + 1][topLeft.x] !== 0) {
          if (print) console.error("Another car is blocking your car");
          break;
        }
        park[bottomRight.y + 1][topLeft.x] = carNumber;
        park[topLeft.y][topLeft.x] = 0;
        topLeft.y += 1; // Update the topLeft position
        bottomRight.y += 1; // Update the bottomRight position
        stepsMade += 1; // Increment steps made
        break;
      case 'd': // right
        if (topLeft.y !== bottomRight.y) {
          if (print) console.error("You can only move a car right if it is horizontal.");
          return;
        }
        if (bottomRight.x === park[topLeft.y].length - 1) {
          if (topLeft.y === exitY) {
            if (carNumber === 1) {
              // Car is removed from the car park
              park[topLeft.y][topLeft.x] = 0;
              park[bottomRight.y][bottomRight.x] = 0;
              gameOver = true;
              turns += 1;
              return;
            } else {
              if (print) console.error("You somehow managed to move the wrong car to the exit. Dev looses!");
              gameOver = true;
              turns += 1;
              return;
            }
          }
          if (print) console.error("You cannot move a car right if it is already at the right edge.");
          break;
        }
        if (park[topLeft.y][bottomRight.x + 1] !== 0) {
          if (print) console.error("Another car is blocking your car");
          break;
        }
        park[topLeft.y][bottomRight.x + 1] = carNumber;
        park[topLeft.y][topLeft.x] = 0;
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

function gameOverMessage(levelNr: number) {
  console.log(colorize(`You escaped from the parking lot in #y${turns.toString()}# turns!`));
  const currentScore = scores[levelNr];
  if (!currentScore || currentScore > turns) {
    console.log("That's a new high score!");
    scores[levelNr] = turns;
    writeFileSync(scoresFile, JSON.stringify(scores, null, 2), "utf-8");
  } else if (currentScore) {
    console.log(`Your best score was #y${currentScore.toString()}# turns.`);
  }
}

async function main() {
  welcome();
  loadLevels();
  loadScores();
  // Menu
  while (true) {
    gameOver = false;
    turns = 0;
    // Ask player which level to play
    const levelChoice = await ask(colorize(
      `Choose a level (#y1#-#y${levels.length.toString()}#), view (#ys#)cores, open (#ye#)ditor or (#rq#)uit: `));
    if (levelChoice.toLowerCase() === "s") {
      displayScores();
      continue;
    }
    if (levelChoice.toLowerCase() === "e") {
      await levelEditor();
      continue;
    }
    if (levelChoice.toLowerCase() === "q") {
      console.log("Quitting the game.");
      break;
    }
    if (isNaN(Number(levelChoice)) || Number(levelChoice) < 1 || Number(levelChoice) > levels.length) {
      console.error("Invalid level choice!");
      continue;
    }
    // Load the chosen level
    carPark = levels[Number(levelChoice) - 1].map(row => [...row]); // Deep copy the level array
    // Start game loop
    while (!gameOver) {
      displayCarPark();
      // Ask for the next turn
      const nextTurn = await ask(colorize(`Turn ${turns + 1}: Enter turn or (#rq#)uit: `));
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
      
      moveCar(topLeftCarPos, bottomRightCarPos, directionInput)

      // Safety break approved by Noah (he's almost a real developer now)
      // break; whoops not so save anymore haha

    } // while(!gameOver) also broken by quitting a level
    if (gameOver) {
      displayCarPark();
      gameOverMessage(Number(levelChoice));
    }
  } // while(True)
}

main();