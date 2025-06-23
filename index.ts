import * as readline from "readline";
import { readdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import chalk from "chalk";

type Pos = { x: number, y: number };
type Car = { nr: number, topLeft: Pos, bottomRight: Pos, isHorizontal: boolean };
type CarPark = { grid: number[][], cars: Car[] };
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
      // First make sure the level has a valid structure
      const result = validateCarPark(carPark);
      if (result) {
        console.log(colorize("#gLevel has a valid structure!#"));
      } else {
        console.error("Level has an invalid structure!");
        continue;
      }
      // Then make sure the level is solvable
      const solution = findSolution(result);
      if (solution) {
        console.log(colorize(`#gLevel is solvable in ${solution.length} turns!#`));
        console.log("Solution: " + solution.join(", "));
      } else {
        console.error("Level is not solvable!");
        continue;
      }
      // Save the level to a file
      const levelName = "custom_level_" + (readdirSync(levelDir).length + 1) + ".txt";
      const levelContent = carPark.map(row => row.map(num => num.toString(16)).join("")).join("\n") + "\n" + solution.length;
      writeFileSync(join(levelDir, levelName), levelContent, "utf-8");
      console.log(`Level saved as ${levelName} in the levels directory.`);
      continue;
    }
    if (eInput.toLowerCase() === "q") {
      break; // Quit the level editor
    }
    console.error("Invalid input");
  }
  console.log("Quitting level editor.");
}

/**
 * This function trys to create a valid car park from the given grid. If all cars have a valid shape and the player's
 * car is placed in the exit row and no car is placed twice, it returns a CarPark object.
 * @param grid The grid of the car park
 * @return A CarPark object if the grid is valid, undefined otherwise
 */
function validateCarPark(grid: number[][]): CarPark | undefined {
  const cars = [] as Car[];
  let hasPlayerCar = false;

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      const nr = grid[y][x];
      // Skip empty spaces
      if (nr === 0) continue;

      // Find car's ends
      const tl = searchTopLeftOfCar({x: x, y: y}, grid);
      const br = searchBottomRightOfCar({x: x, y: y}, grid);

      // Check car length
      if (tl.x === br.x && tl.y === br.y) {
        console.error("All cars need a length of at least 2!");
        return undefined;
      }

      // Check if car is unique on the grid (or has a weird shape)
      const sameCar = cars.find(car => car.nr === nr);
      if (sameCar) {
        if (sameCar.topLeft.x !== tl.x || sameCar.topLeft.y !== tl.y || 
            sameCar.bottomRight.x !== br.x || sameCar.bottomRight.y !== br.y) {
          // There is already a car with this number, but it has different positions
          console.error(`Car ${nr} has a wrong shape or exists multiple times!`);
          return undefined;
        } else continue; // Car already registered, continue to next cell
      }

      // Player car must be placed in exit row
      if (nr === 1) {
        hasPlayerCar = true;
        if ( y !== exitY) {
          console.error("Your car (car 1) must be placed in the exit row (row 2) of the parking lot!");
          return undefined;
        }
      }

      // Check if car has a valid alignment
      if (br.x !== tl.x && br.y !== tl.y) {
        console.error(`Car ${nr} has an invalid shape! It must be either horizontal or vertical.`);
        return undefined;
      }

      // Register car
      cars.push({ nr: nr, topLeft: tl, bottomRight: br, isHorizontal: br.x > tl.x });
    } // end of x-loop
  } // end of y-loop

  // Check if player's car is present
  if (!hasPlayerCar) {
    console.error("You need to place your own car (car 1) in the parking lot!");
    return undefined;
  }

  // Return a structurally validated car park
  return { grid: grid, cars: cars };
}

function findSolution(park: CarPark): string[] | undefined {
  // The algorithm should stop a search route if it has already been there before
  const formerStates = new Set<string>();
  const turnsToState = {} as { [key: string]: number };

  // Add the initial state
  formerStates.add(hashCarPark(park));
  turnsToState[hashCarPark(park)] = 0;

  console.log("This may take up to a minute... (because my algorithm is not very efficient)");
  return recursiveSolutionSearch(park, [], formerStates, turnsToState);
}

function recursiveSolutionSearch(
  park: CarPark, 
  moves: string[], 
  formerStates: Set<string>, 
  movesToState: { [key: string]: number },
  carNr: number | undefined = undefined,
  direction: string = "",
): string[] | undefined {
  if (carNr) { // Otherwise jump directly to the branching part
    const car = park.cars.find(c => c.nr === carNr)!;
    // Make move and hash the state of the car park
    if (!tryMoveCar(car, park, direction)) {
      // The car cannot be moved in this direction
      return undefined;
    }
    // console.log(park.grid);
    pushMoveSimplified(moves, carNr, direction);
    const stateHash = hashCarPark(park);
    if (formerStates.has(stateHash)) {
      // The car park was in this state before...

      /** Ok this one is tricky. If a possible path to this constellation was already found with the same number of
       *  moves, it could still be worse than the current path. Here is an example:
       *  Car 1 can move one step towards car 2 before being blocked.
       *  First route:  Car 1 step, car 2 step out of the way, car 1 step further because no longer blocked
       *  Second route: Car 2 step out of the way, car 1 step, car 1 step further because no longer blocked
       *  The first route does not look worse at first glance, but the second route can be simplified to have car 1
       *  take both steps at once, thus saving a step. This is only visible in hindsight.
       * 
       *  On the other hand, ignoring states with the same number of moves may result in an endless loop. Going further
       *  down the recursion in that case is only ok if the very next move is the same car and direction as the last
       *  move.
       */
      if (movesToState[stateHash] < moves.length) {
        // ... with less moves (makes zero sense to go further)
        return undefined;
      } else if (movesToState[stateHash] === moves.length) {
        // ... with the same number of moves (only makes sense if the next move is the same car and direction)
        return recursiveSolutionSearch(copyCarPark(park), [...moves], formerStates, movesToState, carNr, direction);
      }
    } else {
      formerStates.add(stateHash);
    }
    movesToState[stateHash] = moves.length;
    // When car 1 is at the exit, the puzzle is solved and the level is therefore valid
    if (park.grid[exitY][park.grid[exitY].length - 1] === 1) {
      return moves;
    }
  }
  // Try every possible move with a deep copy of the car park
  let result = [] as string[] | undefined;
  let bestResult: string[] | undefined = undefined;

  // Making the same move again is preferred because it can lead to a shorter solution
  if (carNr) {
    result = recursiveSolutionSearch(copyCarPark(park), [...moves], formerStates, movesToState, carNr, direction);
    if (result) bestResult = result;
  }

  for (const c of park.cars) {
    if (c.nr === carNr) continue; // Skip the car that was just moved
    if (c.isHorizontal) {
      // Horizontal cars
      result = recursiveSolutionSearch(copyCarPark(park), [...moves], formerStates, movesToState, c.nr, "a");
      if (result && (!bestResult || result.length < bestResult.length)) bestResult = result;
      result = recursiveSolutionSearch(copyCarPark(park), [...moves], formerStates, movesToState, c.nr, "d");
      if (result && (!bestResult || result.length < bestResult.length)) bestResult = result;
    } else {
      // Vertical cars
      result = recursiveSolutionSearch(copyCarPark(park), [...moves], formerStates, movesToState, c.nr, "w");
      if (result && (!bestResult || result.length < bestResult.length)) bestResult = result;
      result = recursiveSolutionSearch(copyCarPark(park), [...moves], formerStates, movesToState, c.nr, "s");
      if (result && (!bestResult || result.length < bestResult.length)) bestResult = result;
    }
  }
  return bestResult;
}

/**
 * This function hashes a car park object.
 * @param park The car park to hash
 * @returns a single string that represents the car park's grid.
 */
function hashCarPark(park: CarPark): string {
  return park.grid.map(row => row.join(" ")).join("|");
}

/**
 * Deep copies a car park object, including its grid and cars.
 * @param park The car park to copy
 * @returns A deep copy of a car park
 */
function copyCarPark(park: CarPark): CarPark {
  return {
    grid: park.grid.map(row => [...row]),
    cars: park.cars.map(car => ({
      nr: car.nr,
      topLeft: { ...car.topLeft },
      bottomRight: { ...car.bottomRight },
      isHorizontal: car.isHorizontal
    }))
  }
}

function pushMoveSimplified(moves: string[], carNr: number, direction: string) {
  const lastMove = moves[moves.length - 1];
  if (lastMove && lastMove.startsWith(carNr.toString()) && lastMove.endsWith(direction)) {
    // If the last move is the same car and direction, append the direction
    moves[moves.length - 1] += direction;
  } else {
    // Else add the move for the other car
    moves.push(`${carNr}${direction}`);
  }
}

function tryMoveCar(car: Car, park: CarPark, direction: string): boolean {
  switch (direction) {
    case 'w': // up
      if (isEmptyPosition(park.grid, { x: car.topLeft.x, y: car.topLeft.y - 1 })) {
        // Update grid
        park.grid[car.topLeft.y - 1][car.topLeft.x] = car.nr;
        park.grid[car.bottomRight.y][car.bottomRight.x] = 0;
        // Update car
        car.topLeft.y -= 1;
        car.bottomRight.y -= 1;
        return true;
      }
      return false;
    case 'a': // left
      if (isEmptyPosition(park.grid, { x: car.topLeft.x - 1, y: car.topLeft.y })) {
        // Update grid
        park.grid[car.topLeft.y][car.topLeft.x - 1] = car.nr;
        park.grid[car.bottomRight.y][car.bottomRight.x] = 0;
        // Update car
        car.topLeft.x -= 1;
        car.bottomRight.x -= 1;
        return true;
      }
      return false;
    case 's': // down
      if (isEmptyPosition(park.grid, { x: car.bottomRight.x, y: car.bottomRight.y + 1 })) {
        // Update grid
        park.grid[car.bottomRight.y + 1][car.bottomRight.x] = car.nr;
        park.grid[car.topLeft.y][car.topLeft.x] = 0;
        // Update car
        car.topLeft.y += 1;
        car.bottomRight.y += 1;
        return true;
      }
      return false;
    case 'd': // right
      if (isEmptyPosition(park.grid, { x: car.bottomRight.x + 1, y: car.bottomRight.y })) {
        // Update grid
        park.grid[car.bottomRight.y][car.bottomRight.x + 1] = car.nr;
        park.grid[car.topLeft.y][car.topLeft.x] = 0;
        // Update car
        car.topLeft.x += 1;
        car.bottomRight.x += 1;
        return true;
      }
      return false;
    default:
      console.error("Dev-Error: Invalid direction passed to tryMoveCar: ", direction);
      return false;
  }
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

/**
 * This function finds the top-left position of a given car if it has a valid shape. ONLY enter a position that is save
 * to have a car at it.
 * @param pos The position of the car in the grid
 * @param grid The grid of the car park
 * @returns The top-left position of the car in the grid.
 */
function searchTopLeftOfCar(pos: Pos, grid: number[][]): Pos {
  const carNumber = grid[pos.y][pos.x];
  // Check left
  let x = pos.x;
  while (x > 0 && grid[pos.y][x - 1] === carNumber) {
    x--;
  }
  // Check up
  let y = pos.y;
  while (y > 0 && grid[y - 1][pos.x] === carNumber) {
    y--;
  }
  return { x: x, y: y };
}

/**
 * This function finds the bottom-right position of a given car if it has a valid shape. ONLY enter a position that is
 * save to have a car at it.
 * @param pos The position of the car in the grid
 * @param grid The grid of the car park
 * @returns The bottom-right position of the car in the grid.
 */
function searchBottomRightOfCar(pos: Pos, grid: number[][]): Pos {
  const carNumber = grid[pos.y][pos.x];
  // Check right
  let x = pos.x;
  while (x < grid[pos.y].length - 1 && grid[pos.y][x + 1] === carNumber) {
    x++;
  }
  // Check down
  let y = pos.y;
  while (y < grid.length - 1 && grid[y + 1][pos.x] === carNumber) {
    y++;
  }
  return { x: x, y: y };
}

// old
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

// old
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

// More than one move is possible
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

/**
 * This function checks if a given position is inside the car park and empty.
 * @param park The car park represented as a 2D array
 * @param position The position to which the car should be moved
 * @return true if a car can be moved to the given position, false otherwise
 */
function isEmptyPosition(park: number[][], position: Pos): boolean {
  // Check if the position is within bounds
  if (position.x < 0 || position.y < 0 || position.y >= park.length || position.x >= park[position.y].length) {
    return false;
  }
  // Check if the position is empty
  return park[position.y][position.x] === 0;
}

function gameOverMessage(levelNr: number) {
  console.log(colorize(`You escaped from the parking lot in #y${turns.toString()}# turns!`));
  const currentScore = scores[levelNr];
  if (!currentScore || currentScore > turns) {
    console.log("That's a new high score!");
    scores[levelNr] = turns;
    writeFileSync(scoresFile, JSON.stringify(scores, null, 2), "utf-8");
  } else if (currentScore) {
    console.log(colorize(`Your best score was #y${currentScore.toString()}# turns.`));
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